import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Records a guest visit ONCE per host per calendar day.
 * Uses device_id for identity continuity.
 *
 * Input:
 *  - device_id
 *  - guest_profile_id
 *  - host_id
 *
 * Output:
 *  - isReturning (boolean)
 *  - visitCount (number)
 */
serve(async (req) => {
  try {
    const { device_id, guest_profile_id, host_id } = await req.json();

    if (!device_id || !guest_profile_id || !host_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use UTC date to avoid timezone ambiguity (can upgrade later)
    const today = new Date().toISOString().split("T")[0];

    // 🔍 Check for existing loyalty row
    const { data: loyalty } = await supabase
      .from("guest_host_loyalty")
      .select("*")
      .eq("device_id", device_id)
      .eq("host_id", host_id)
      .maybeSingle();

    // 🆕 FIRST VISIT TO THIS HOST
    if (!loyalty) {
      await supabase.from("guest_host_loyalty").insert({
        guest_profile_id,
        device_id,
        host_id,
        last_visit_date: today,
        visit_count: 1,
      });

      // Increment global visit counter
      const { data: profile } = await supabase
        .from("guest_profiles")
        .select("total_visit_count")
        .eq("id", guest_profile_id)
        .single();

      await supabase
        .from("guest_profiles")
        .update({
          total_visit_count: (profile?.total_visit_count || 0) + 1,
        })
        .eq("id", guest_profile_id);

      return new Response(
        JSON.stringify({
          isReturning: false,
          visitCount: 1,
        }),
        { status: 200 }
      );
    }

    // 🔁 RETURNING ON A NEW DAY
    if (loyalty.last_visit_date < today) {
      const newCount = loyalty.visit_count + 1;

      await supabase
        .from("guest_host_loyalty")
        .update({
          visit_count: newCount,
          last_visit_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq("id", loyalty.id);

      const { data: profile } = await supabase
        .from("guest_profiles")
        .select("total_visit_count")
        .eq("id", guest_profile_id)
        .single();

      await supabase
        .from("guest_profiles")
        .update({
          total_visit_count: (profile?.total_visit_count || 0) + 1,
        })
        .eq("id", guest_profile_id);

      return new Response(
        JSON.stringify({
          isReturning: true,
          visitCount: newCount,
        }),
        { status: 200 }
      );
    }

    // 🔒 SAME-DAY RETURN — NO INCREMENT
    return new Response(
      JSON.stringify({
        isReturning: false,
        visitCount: loyalty.visit_count,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("record-guest-visit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
});
