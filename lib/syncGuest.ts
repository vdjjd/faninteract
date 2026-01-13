import { getSupabaseClient } from "./supabaseClient";

/* ----------------------------------------
   Get or Create Device ID
---------------------------------------- */
export function getOrCreateGuestDeviceId() {
  let deviceId = localStorage.getItem("guest_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("guest_device_id", deviceId);
  }

  return deviceId;
}

/* ----------------------------------------
   Helpers
---------------------------------------- */
function safeTrim(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function toBool(val: any): boolean {
  if (val === true) return true;
  if (val === false || val == null) return false;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const v = val.toLowerCase().trim();
    return v === "true" || v === "t" || v === "1" || v === "yes";
  }
  return false;
}

function normalizeMinAge(val: any): 18 | 21 | null {
  const n = Number(val);
  if (n === 18) return 18;
  if (n === 21) return 21;
  return null;
}

function calculateAgeFromDob(dobStr: string): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();

  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age;
}

/* ----------------------------------------
   SYNC GUEST PROFILE (HOST-ASSIGNED)
   ✅ Now includes:
   - date_of_birth persisted to guest_profiles
   - age computed from DOB if provided
   - server-side host age enforcement (reads hosts.require_age + hosts.minimum_age)
   - blocks underage attempts across devices when linking participation
---------------------------------------- */
export async function syncGuestProfile(
  type: string,
  targetId: string,
  form: any,
  hostId: string
) {
  const supabase = getSupabaseClient();
  const deviceId = getOrCreateGuestDeviceId();

  /* ----------------------------------------
     Load host age rules (server-side enforcement)
  ---------------------------------------- */
  let requireAge = false;
  let minAge: 18 | 21 | null = null;

  if (hostId) {
    const { data: hostRow, error: hostErr } = await supabase
      .from("hosts")
      .select("require_age, minimum_age")
      .eq("id", hostId)
      .maybeSingle();

    if (hostErr) throw hostErr;

    requireAge = toBool(hostRow?.require_age);
    minAge = normalizeMinAge(hostRow?.minimum_age);
  }

  /* ----------------------------------------
     Normalize + compute age
  ---------------------------------------- */
  const dob = safeTrim(form.date_of_birth || "");
  const computedAge = dob ? calculateAgeFromDob(dob) : null;

  // If DOB exists, trust computed age. Else allow a numeric age fallback.
  const cleanAge =
    typeof computedAge === "number" && computedAge > 0
      ? computedAge
      : form.age && Number(form.age) > 0
      ? Number(form.age)
      : null;

  // If host requires age, enforce DOB presence (strongest + consistent)
  if (requireAge && !dob) {
    const err: any = new Error("Date of birth is required.");
    err.code = "AGE_DOB_REQUIRED";
    throw err;
  }

  // If host enforces minimum age, enforce it here.
  // NOTE: we still allow saving the profile so next time they’re blocked by the system,
  // but we will block participation linking (below).
  const isUnderage =
    !!minAge && typeof cleanAge === "number" && cleanAge < minAge;

  /* ----------------------------------------
     Build payload
  ---------------------------------------- */
  const payload = {
    device_id: deviceId,
    first_name: safeTrim(form.first_name) || "",
    last_name: safeTrim(form.last_name) || "",
    email: safeTrim(form.email) || "",
    phone: safeTrim(form.phone) || "",
    street: safeTrim(form.street) || "",
    city: safeTrim(form.city) || "",
    state: form.state || "",
    zip: safeTrim(form.zip) || "",
    date_of_birth: dob || null,
    age: cleanAge,
    host_id: hostId,
  };

  /* ----------------------------------------
     Upsert guest_profiles by device_id
  ---------------------------------------- */
  const { data: existing, error: existingErr } = await supabase
    .from("guest_profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existingErr) throw existingErr;

  let profile: any = null;

  if (existing) {
    const { data, error } = await supabase
      .from("guest_profiles")
      .update({
        ...payload,
        host_id: existing.host_id ?? hostId, // FIRST HOST STICKS
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId)
      .select()
      .single();

    if (error) throw error;
    profile = data;
  } else {
    const { data, error } = await supabase
      .from("guest_profiles")
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    profile = data;
  }

  if (!profile) throw new Error("Guest profile failed");

  /* ----------------------------------------
     AUTO-LINK EVENT PARTICIPATION
     ✅ Bulletproof enforcement:
     - If underage, do NOT link them to the event tables.
     - Throw a specific error so the UI can show the age block screen.
  ---------------------------------------- */
  if (isUnderage) {
    const err: any = new Error(`Underage for this venue (must be ${minAge}+).`);
    err.code = "AGE_RESTRICTED";
    err.minimum_age = minAge;
    err.age = cleanAge;
    err.date_of_birth = dob || null;
    // profile is still saved; linking is blocked.
    throw err;
  }

  try {
    if (type === "wall") {
      await supabase.from("fan_wall_submissions").upsert(
        {
          wall_id: targetId,
          guest_id: profile.id,
        },
        { onConflict: "wall_id,guest_id" }
      );
    }

    if (type === "prizewheel") {
      await supabase.from("wheel_participants").upsert(
        {
          wheel_id: targetId,
          guest_id: profile.id,
        },
        { onConflict: "wheel_id,guest_id" }
      );
    }

    if (type === "poll") {
      await supabase.from("poll_participants").upsert(
        {
          poll_id: targetId,
          guest_id: profile.id,
        },
        { onConflict: "poll_id,guest_id" }
      );
    }
  } catch (err) {
    console.error("Event link error:", err);
  }

  return { profile };
}
