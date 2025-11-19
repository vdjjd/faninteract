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
   SYNC GUEST PROFILE (FULLY PATCHED)
---------------------------------------- */
export async function syncGuestProfile(
  type: string,
  targetId: string,
  form: any
) {
  const supabase = getSupabaseClient();
  const deviceId = getOrCreateGuestDeviceId();

  // Clean & sanitize data (FATAL BUG FIX HERE)
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
    age: cleanAge,                      // <-- FIXED
  };

  /* ---------------------------------------------------------
     Check existing guest
  --------------------------------------------------------- */
  const { data: existing, error: checkError } = await supabase
    .from("guest_profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (checkError) {
    console.error("❌ Error checking guest profile:", checkError);
  }

  let profile = null;

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from("guest_profiles")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId)
      .select()
      .single();

    if (error) {
      console.error("❌ Error updating guest:", error);
      throw error;
    }

    profile = data;
  } else {
    // INSERT NEW
    const { data, error } = await supabase
      .from("guest_profiles")
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Error creating guest:", error);
      throw error;
    }

    profile = data;
  }

  if (!profile) {
    console.error("❌ Guest profile insert/update returned NULL");
    throw new Error("Guest profile failed");
  }

  /* ---------------------------------------------------------
     AUTO-LINK EVENT PARTICIPATION
  --------------------------------------------------------- */
  try {
    if (type === "wall") {
      await supabase.from("fan_wall_submissions").upsert(
        {
          wall_id: targetId,
          guest_id: profile.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "wall_id,guest_id" }
      );
    }

    if (type === "prizewheel") {
      await supabase.from("wheel_participants").upsert(
        {
          wheel_id: targetId,
          guest_id: profile.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "wheel_id,guest_id" }
      );
    }

    if (type === "poll") {
      await supabase.from("poll_participants").upsert(
        {
          poll_id: targetId,
          guest_id: profile.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "poll_id,guest_id" }
      );
    }
  } catch (err) {
    console.error("❌ Error linking event participation:", err);
  }

  /* Return final profile */
  return { profile };
}
