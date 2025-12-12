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
   SYNC GUEST PROFILE (HOST-ASSIGNED)
---------------------------------------- */
export async function syncGuestProfile(
  type: string,
  targetId: string,
  form: any,
  hostId: string
) {
  const supabase = getSupabaseClient();
  const deviceId = getOrCreateGuestDeviceId();

  const cleanAge =
    form.age && Number(form.age) > 0 ? Number(form.age) : null;

  const payload = {
    device_id: deviceId,
    first_name: form.first_name?.trim() || "",
    last_name: form.last_name?.trim() || "",
    email: form.email?.trim() || "",
    phone: form.phone?.trim() || "",
    street: form.street?.trim() || "",
    city: form.city?.trim() || "",
    state: form.state || "",
    zip: form.zip?.trim() || "",
    age: cleanAge,
    host_id: hostId,
  };

  const { data: existing } = await supabase
    .from("guest_profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  let profile;

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
  ---------------------------------------- */
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
