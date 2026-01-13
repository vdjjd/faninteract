import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Split an ISO timestamp into YYYY-MM-DD and HH:MM (24h). */
function splitDateTime(ts: string | null | undefined) {
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
  };
}

export async function GET(req: Request) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const hostId = searchParams.get("hostId");
  if (!hostId) return new NextResponse("Missing hostId", { status: 400 });

  try {
    // 1) EVENT GUESTS FROM FUNCTION export_host_guests_v2(p_host_id)
    const [
      { data: guestData, error: guestError },
      { data: leadData, error: leadError },
    ] = await Promise.all([
      supabase.rpc("export_host_guests_v2", {
        p_host_id: hostId,
      }),
      supabase
        .from("priority_leads")
        .select(
          `
          first_name,
          last_name,
          email,
          phone,
          city,
          region,
          zip,
          zip_code,
          venue_name,
          product_interest,
          wants_contact,
          scanned_at,
          submitted_at,
          source,
          source_type
        `
        )
        .eq("host_id", hostId)
        .order("submitted_at", { ascending: true }),
    ]);

    if (guestError) {
      console.error("export_host_guests_v2 error:", guestError);
      return new NextResponse(JSON.stringify({ error: guestError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (leadError) {
      console.error("priority_leads export error:", leadError);
      return new NextResponse(JSON.stringify({ error: leadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 2) MAP GUEST ROWS (FROM FUNCTION)
    const guestRows = (guestData ?? []).map((r: any) => ({
      type: "guest",
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      profile_created_date: r.profile_created_date ?? "",
      profile_created_time: r.profile_created_time ?? "",
      joined_date: r.joined_date ?? "",
      joined_time: r.joined_time ?? "",
      event_id: r.event_id ?? "",
      source: r.source ?? "",
      feature: r.feature ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip: r.zip ?? "",
      venue: "", // not tied to a single venue row here
      product: "",
      wants_contact: "",
      guest_status: r.guest_status ?? "",
      visit_number:
        typeof r.visit_number === "number" ? r.visit_number : "",
    }));

    // 3) MAP PRIORITY LEAD ROWS
    const priorityRows = (leadData ?? []).map((l: any) => {
      // “Joined” = when they actually scanned/filled the form
      const joinedTs = l.scanned_at ?? l.submitted_at ?? null;
      const { date: joined_date, time: joined_time } = splitDateTime(joinedTs);

      // “Profile created” – use the same timestamp for now
      const {
        date: profile_created_date,
        time: profile_created_time,
      } = splitDateTime(joinedTs);

      return {
        type: "priority",
        first_name: l.first_name ?? "",
        last_name: l.last_name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        profile_created_date,
        profile_created_time,
        joined_date,
        joined_time,
        event_id: "", // no trivia event id here, it's an ad slide lead
        source: l.source ?? l.source_type ?? "",
        feature: "priority_lead",
        city: l.city ?? "",
        state: l.region ?? "",
        zip: l.zip ?? l.zip_code ?? "",
        venue: l.venue_name ?? "",
        product: l.product_interest ?? "",
        wants_contact:
          l.wants_contact === true
            ? "yes"
            : l.wants_contact === false
            ? "no"
            : "",
        // Leads don't participate in loyalty/visit count
        guest_status: "",
        visit_number: "",
      };
    });

    // 4) COMBINE (YOU CAN FLIP ORDER IF YOU WANT GUESTS FIRST)
    const rows = [...guestRows, ...priorityRows];

    // 5) CSV HEADERS – DATE + TIME SEPARATE, PLUS MARKETING & LOYALTY FIELDS
    const headers = [
      "type",
      "first_name",
      "last_name",
      "email",
      "phone",
      "profile_created_date",
      "profile_created_time",
      "joined_date",
      "joined_time",
      "guest_status", // 'new' / 'returning' when loyalty is ON
      "visit_number", // numeric visit count when loyalty is ON
      "event_id",
      "source",
      "feature",
      "city",
      "state",
      "zip",
      "venue",
      "product",
      "wants_contact",
    ];

    const escapeCsv = (v: any) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    // BOM helps Excel open UTF-8 correctly
    const bom = "\ufeff";
    const csv =
      bom +
      [
        headers.join(","),
        ...rows.map((r: any) =>
          headers.map((h) => escapeCsv(r[h])).join(",")
        ),
      ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=guests.csv",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    console.error("export guests route error:", e);
    return new NextResponse(
      JSON.stringify({ error: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
