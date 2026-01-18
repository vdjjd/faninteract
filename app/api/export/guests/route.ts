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

/** Normalize a date (YYYY-MM-DD) coming from Postgres date or JS Date/ISO. */
function normalizeDate(v: any): string {
  if (!v) return "";
  // Postgres date typically comes back as "YYYY-MM-DD"
  if (typeof v === "string") {
    // If it's an ISO timestamp, keep just the date portion
    if (v.includes("T")) return v.split("T")[0] ?? "";
    return v;
  }
  // If it's a Date object for some reason
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(v ?? "");
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

    // 1.5) ENRICH GUESTS WITH AGE/DOB FROM guest_profiles
    // We try to match profiles by any id the RPC might return, or by device_id.
    const rawGuests = (guestData ?? []) as any[];

    const profileIdSet = new Set<string>();
    const deviceIdSet = new Set<string>();

    for (const r of rawGuests) {
      const possibleProfileId =
        r.guest_profile_id ?? r.profile_id ?? r.guest_id ?? r.profileId ?? r.id;
      const possibleDeviceId = r.device_id ?? r.deviceId;

      if (typeof possibleProfileId === "string" && possibleProfileId.length) {
        profileIdSet.add(possibleProfileId);
      }
      if (typeof possibleDeviceId === "string" && possibleDeviceId.length) {
        deviceIdSet.add(possibleDeviceId);
      }
    }

    const profileIds = Array.from(profileIdSet);
    const deviceIds = Array.from(deviceIdSet);

    // Pull profiles for this host. We only query if we have keys.
    // (Supabase .in() is fine here; if you ever have thousands, we can chunk.)
    let profiles: any[] = [];
    if (profileIds.length || deviceIds.length) {
      // Build OR filters safely.
      // Note: .or() string syntax is: "col.in.(a,b),othercol.in.(c,d)"
      const orParts: string[] = [];
      if (profileIds.length) {
        const idsCsv = profileIds.map((x) => `"${x}"`).join(",");
        orParts.push(`id.in.(${idsCsv})`);
      }
      if (deviceIds.length) {
        const devCsv = deviceIds.map((x) => `"${x}"`).join(",");
        orParts.push(`device_id.in.(${devCsv})`);
      }

      const { data: profileData, error: profileError } = await supabase
        .from("guest_profiles")
        .select("id, device_id, age, date_of_birth")
        .eq("host_id", hostId)
        .or(orParts.join(","));

      if (profileError) {
        console.error("guest_profiles lookup error:", profileError);
        // Don’t fail export — just continue without enrichment
        profiles = [];
      } else {
        profiles = profileData ?? [];
      }
    }

    const profileById = new Map<string, any>();
    const profileByDevice = new Map<string, any>();
    for (const p of profiles) {
      if (p?.id) profileById.set(String(p.id), p);
      if (p?.device_id) profileByDevice.set(String(p.device_id), p);
    }

    // 2) MAP GUEST ROWS (FROM FUNCTION) + AGE/DOB ENRICHMENT
    const guestRows = rawGuests.map((r: any) => {
      const possibleProfileId =
        r.guest_profile_id ?? r.profile_id ?? r.guest_id ?? r.profileId ?? r.id;
      const possibleDeviceId = r.device_id ?? r.deviceId;

      const prof =
        (typeof possibleProfileId === "string"
          ? profileById.get(possibleProfileId)
          : undefined) ||
        (typeof possibleDeviceId === "string"
          ? profileByDevice.get(possibleDeviceId)
          : undefined);

      const age =
        typeof r.age === "number"
          ? r.age
          : typeof prof?.age === "number"
          ? prof.age
          : "";

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
        visit_number: typeof r.visit_number === "number" ? r.visit_number : "",
      };
    });

    // 3) MAP PRIORITY LEAD ROWS
    const priorityRows = (leadData ?? []).map((l: any) => {
      // “Joined” = when they actually scanned/filled the form
      const joinedTs = l.scanned_at ?? l.submitted_at ?? null;
      const { date: joined_date, time: joined_time } = splitDateTime(joinedTs);

      // “Profile created” – use the same timestamp for now
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

    // 4) COMBINE
    const rows = [...guestRows, ...priorityRows];

    // 5) CSV HEADERS – ADD AGE + DOB
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

    const escapeCsv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    // BOM helps Excel open UTF-8 correctly
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
