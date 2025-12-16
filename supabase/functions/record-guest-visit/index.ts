import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ---------------------------------------------------------
   CORS
--------------------------------------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ---------------------------------------------------------
   Function
--------------------------------------------------------- */
serve(async (req) => {
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { device_id, guest_profile_id, host_id } = await req.json();

    if (!device_id || !guest_profile_id || !host_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ---------------------------------------------------------
       Host-level loyalty toggle
    --------------------------------------------------------- */
    const { data: host } = await supabase
      .from("hosts")
      .select("loyalty_enabled")
      .eq("id", host_id)
      .single();

    if (!host?.loyalty_enabled) {
      return new Response(
        JSON.stringify({
          isReturning: false,
          visitCount: null,
          badge: null,
          loyaltyDisabled: true,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    /* ---------------------------------------------------------
       Per-host visit tracking
    --------------------------------------------------------- */
    const { data: loyalty } = await supabase
      .from("guest_host_loyalty")
      .select("*")
      .eq("device_id", device_id)
      .eq("host_id", host_id)
      .maybeSingle();

    let visitCount = 1;
    let isReturning = false;

    // 🆕 First visit to this host
    if (!loyalty) {
      await supabase.from("guest_host_loyalty").insert({
        guest_profile_id,
        device_id,
        host_id,
        visit_count: 1,
        last_visit_date: today,
      });
    } else {
      visitCount = loyalty.visit_count;

      // 🔁 New calendar day visit
      if (loyalty.last_visit_date < today) {
        visitCount += 1;
        isReturning = true;

        await supabase
          .from("guest_host_loyalty")
          .update({
            visit_count: visitCount,
            last_visit_date: today,
            updated_at: new Date().toISOString(),
          })
          .eq("id", loyalty.id);
      }
    }

    /* ---------------------------------------------------------
       Badge lookup (✅ FIXED: includes icon_url)
    --------------------------------------------------------- */
    const { data: badge } = await supabase
      .from("loyalty_badges")
      .select("code,label,description,min_visits,icon_url")
      .lte("min_visits", visitCount)
      .order("min_visits", { ascending: false })
      .limit(1)
      .maybeSingle();

    /* ---------------------------------------------------------
       Global visit counter
    --------------------------------------------------------- */
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

    /* ---------------------------------------------------------
       Response
    --------------------------------------------------------- */
    return new Response(
      JSON.stringify({
        isReturning,
        visitCount,
        badge,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("record-guest-visit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
