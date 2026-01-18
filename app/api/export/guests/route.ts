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

  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

/** Normalize Postgres date or ISO string to YYYY-MM-DD */
function normalizeDate(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.includes("T") ? v.split("T")[0] ?? "" : v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(v ?? "");
}

function toAgeValue(v: any): string | number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return "";
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
    const [
      { data: guestData, error: guestError },
      { data: leadData, error: leadError },
    ] = await Promise.all([
      supabase.rpc("export_host_guests_v2", { p_host_id: hostId }),
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

    const rawGuests = (guestData ?? []) as any[];

    // Collect device_ids from RPC rows
    const deviceIds = Array.from(
      new Set(
        rawGuests
          .map((r) => r.device_id)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      )
    );

    // Lookup guest_profiles rows by device_id (THIS is the reliable join)
    const profileByDevice = new Map<string, { age: any; date_of_birth: any }>();

    if (deviceIds.length > 0) {
      // If you have thousands, we can chunk. For normal use, this is fine.
      const { data: profiles, error: profileErr } = await supabase
        .from("guest_profiles")
        .select("device_id, age, date_of_birth")
        .in("device_id", deviceIds);

      if (profileErr) {
        console.error("guest_profiles device_id lookup error:", profileErr);
      } else {
        for (const p of profiles ?? []) {
          if (p?.device_id) {
            profileByDevice.set(String(p.device_id), {
              age: p.age,
              date_of_birth: p.date_of_birth,
            });
          }
        }
      }
    }

    // Map guest rows + merge age/dob from guest_profiles
    const guestRows = rawGuests.map((r: any) => {
      const prof = typeof r.device_id === "string" ? profileByDevice.get(r.device_id) : undefined;

      const age =
        // If the RPC ever starts returning age, use it first
        toAgeValue(r.age) !== "" ? toAgeValue(r.age) : toAgeValue(prof?.age);

      const date_of_birth =
        r.date_of_birth != null
          ? normalizeDate(r.date_of_birth)
          : prof?.date_of_birth != null
          ? normalizeDate(prof.date_of_birth)
          : "";

      return {
        type: "guest",
        first_name: r.first_name ?? "",
        last_name: r.last_name ?? "",
        email: r.email ?? "",
        phone: r.phone ?? "",
        age,
        date_of_birth,

        profile_created_date: r.profile_created_date ?? "",
        profile_created_time: r.profile_created_time ?? "",
        joined_date: r.joined_date ?? "",
        joined_time: r.joined_time ?? "",
        guest_status: r.guest_status ?? "",
        visit_number: typeof r.visit_number === "number" ? r.visit_number : "",
        event_id: r.event_id ?? "",
        source: r.source ?? "",
        feature: r.feature ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        zip: r.zip ?? "",
        venue: "",
        product: "",
        wants_contact: "",
      };
    });

    // Priority leads (no age/dob)
    const priorityRows = (leadData ?? []).map((l: any) => {
      const joinedTs = l.scanned_at ?? l.submitted_at ?? null;
      const { date: joined_date, time: joined_time } = splitDateTime(joinedTs);
      const { date: profile_created_date, time: profile_created_time } =
        splitDateTime(joinedTs);

      return {
        type: "priority",
        first_name: l.first_name ?? "",
        last_name: l.last_name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        age: "",
        date_of_birth: "",

        profile_created_date,
        profile_created_time,
        joined_date,
        joined_time,
        guest_status: "",
        visit_number: "",
        event_id: "",
        source: l.source ?? l.source_type ?? "",
        feature: "priority_lead",
        city: l.city ?? "",
        state: l.region ?? "",
        zip: l.zip ?? l.zip_code ?? "",
        venue: l.venue_name ?? "",
        product: l.product_interest ?? "",
        wants_contact:
          l.wants_contact === true ? "yes" : l.wants_contact === false ? "no" : "",
      };
    });

    const rows = [...guestRows, ...priorityRows];

    const headers = [
      "type",
      "first_name",
      "last_name",
      "email",
      "phone",
      "age",
      "date_of_birth",
      "profile_created_date",
      "profile_created_time",
      "joined_date",
      "joined_time",
      "guest_status",
      "visit_number",
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

    const escapeCsv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const bom = "\ufeff";
    const csv =
      bom +
      [
        headers.join(","),
        ...rows.map((r: any) => headers.map((h) => escapeCsv(r[h])).join(",")),
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
