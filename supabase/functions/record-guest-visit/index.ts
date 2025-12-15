import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ---------------------------------------------------------
   CORS headers
--------------------------------------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ---------------------------------------------------------
   Edge Function
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

    const today = new Date().toISOString().split("T")[0];

    // 🔍 Existing loyalty row?
    const { data: loyalty } = await supabase
      .from("guest_host_loyalty")
      .select("*")
      .eq("device_id", device_id)
      .eq("host_id", host_id)
      .maybeSingle();

    // 🆕 FIRST VISIT
    if (!loyalty) {
      await supabase.from("guest_host_loyalty").insert({
        guest_profile_id,
        device_id,
        host_id,
        last_visit_date: today,
        visit_count: 1,
      });

      return new Response(
        JSON.stringify({ isReturning: false, visitCount: 1 }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 🔁 NEW DAY RETURN
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

      return new Response(
        JSON.stringify({ isReturning: true, visitCount: newCount }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 🔒 SAME DAY — NO INCREMENT
    return new Response(
      JSON.stringify({
        isReturning: false,
        visitCount: loyalty.visit_count,
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

