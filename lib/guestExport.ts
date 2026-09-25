// Shared by the CSV download and printable guest report.
// Type-only import keeps the row loader independently testable.
import type { SupabaseClient } from "@supabase/supabase-js";

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

function normEmail(v: any): string {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

function normPhone(v: any): string {
  if (typeof v !== "string") return "";
  // keep digits only
  return v.replace(/\D/g, "");
}

// Page all sources so exports are not limited by the API's row cap.
async function readPages(query: () => any, source: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await query().range(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(`${source}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadGuestExportRows(supabase: SupabaseClient, hostId: string) {
  const [guestData, leadData, profilesData] = await Promise.all([
    readPages(() => supabase.rpc("export_host_guests", { p_host_id: hostId }), "Guest export"),
    // Lead schemas may use different optional columns (zip vs zip_code,
    // source vs source_type). Normalize returned fields instead of requiring both.
    readPages(() => supabase.from("priority_leads").select("*")
      .eq("host_id", hostId).order("id"), "Priority leads"),
    readPages(() => supabase.from("guest_profiles").select("*")
      .eq("host_id", hostId).order("id"), "Guest profiles"),
  ]);

  const rawGuests = [...(guestData ?? [])] as any[];
  const profiles = (profilesData ?? []) as any[];

  // Build lookup maps from guest_profiles
  const byId = new Map<string, any>();
  const byDevice = new Map<string, any>();
  const byEmail = new Map<string, any>();
  const byPhone = new Map<string, any>();

  for (const p of profiles) {
    if (p.id) byId.set(p.id, p);
    if (typeof p?.device_id === "string" && p.device_id) byDevice.set(p.device_id, p);
    const e = normEmail(p?.email);
    if (e) byEmail.set(e, p);
    const ph = normPhone(p?.phone);
    if (ph) byPhone.set(ph, p);
  }

  const findProfile = (row: any) =>
    byId.get(row.guest_profile_id) || byId.get(row.guest_id) ||
    byDevice.get(row.device_id) || byEmail.get(normEmail(row.email)) ||
    byPhone.get(normPhone(row.phone));

  // Profiles are saved before participation. Include host-owned profiles that
  // the event export did not return, without duplicating event/visit rows.
  const represented = new Set<any>();
  for (const row of rawGuests) {
    const profile = findProfile(row);
    if (profile) represented.add(profile);
  }
  for (const profile of profiles) {
    if (represented.has(profile)) continue;
    const created = splitDateTime(profile.created_at);
    rawGuests.push({
      ...profile,
      profile_created_date: created.date,
      profile_created_time: created.time,
    });
  }

  // Enrich event rows using the same identity matching as deduplication.
  const guestRows = rawGuests.map((r: any) => {
    const prof = findProfile(r);

    const age =
      toAgeValue(r?.age) !== "" ? toAgeValue(r.age) : toAgeValue(prof?.age);

    const date_of_birth =
      r?.date_of_birth != null
        ? normalizeDate(r.date_of_birth)
        : prof?.date_of_birth != null
        ? normalizeDate(prof.date_of_birth)
        : "";

    return {
      type: "guest",
      first_name: r.first_name || prof?.first_name || "",
      last_name: r.last_name || prof?.last_name || "",
      email: r.email || prof?.email || "",
      phone: r.phone || prof?.phone || "",
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
    const joinedTs = l.scanned_at ?? l.submitted_at ?? l.created_at ?? null;
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

  return [...guestRows, ...priorityRows];

}
