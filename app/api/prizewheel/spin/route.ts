import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "crypto";

export const runtime = "nodejs";

type Action = "go" | "stop" | "auto";

export async function POST(req: Request) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = null;
  try {
    body = await req.json();
  } catch {}

  const wheelId = body?.wheelId as string | undefined;
  const action = body?.action as Action | undefined;
  const spinSessionId = body?.spinSessionId as string | undefined;

  if (!wheelId) return new NextResponse("Missing wheelId", { status: 400 });
  if (!action) return new NextResponse("Missing action", { status: 400 });

  // Load wheel (so STOP can be idempotent)
  const { data: wheel, error: wheelErr } = await supabase
    .from("prize_wheels")
    .select(
      "id, spin_state, spin_session_id, winner_entry_id, winner_guest_profile_id, winner_index, winner_selected_at, winner_session_id, spin_started_at"
    )
    .eq("id", wheelId)
    .single();

  if (wheelErr || !wheel) {
    return new NextResponse(
      JSON.stringify(wheelErr || { message: "Wheel not found" }),
      { status: 404 }
    );
  }

  /* ---------------------------------------------------------
     Helpers (fast + scalable)
  --------------------------------------------------------- */

  async function countByStatus(status: "approved" | "pending") {
    const { count, error } = await supabase
      .from("wheel_entries")
      .select("id", { count: "exact", head: true })
      .eq("wheel_id", wheelId)
      .eq("status", status);

    if (error) throw error;
    return count ?? 0;
  }

  async function fetchRandomApprovedEntry() {
    const approvedCount = await countByStatus("approved");

    if (approvedCount === 0) {
      const pendingCount = await countByStatus("pending");
      const err: any = new Error(
        pendingCount > 0
          ? `No approved entries (pending: ${pendingCount}). Approve entries first.`
          : "No approved entries."
      );
      err.status = 409;
      throw err;
    }

    // Pick a random offset within approved set
    const offset = randomInt(0, approvedCount);

    const { data, error } = await supabase
      .from("wheel_entries")
      .select(
        "id,wheel_id,guest_profile_id,status,photo_url,first_name,last_name,created_at"
      )
      .eq("wheel_id", wheelId)
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .range(offset, offset)
      .maybeSingle();

    if (error) throw error;

    // Rare edge case: row removed between count and fetch
    if (!data) {
      const { data: fallback, error: fbErr } = await supabase
        .from("wheel_entries")
        .select(
          "id,wheel_id,guest_profile_id,status,photo_url,first_name,last_name,created_at"
        )
        .eq("wheel_id", wheelId)
        .eq("status", "approved")
        .order("created_at", { ascending: true })
        .range(0, 0)
        .maybeSingle();

      if (fbErr) throw fbErr;

      if (!fallback) {
        const err: any = new Error("No approved entries.");
        err.status = 409;
        throw err;
      }

      return fallback;
    }

    return data;
  }

  function pickWinnerIndex() {
    return randomInt(0, 16); // tile index 0-15
  }

  /* ---------------------------------------------------------
     GO: create a spin session (no winner yet)
  --------------------------------------------------------- */
  if (action === "go") {
    const sessionId = randomUUID();

    const { error: updErr } = await supabase
      .from("prize_wheels")
      .update({
        spin_state: "go",
        spin_session_id: sessionId,
        spin_started_at: new Date().toISOString(),

        // clear any prior winner so UI doesn't reuse it accidentally
        winner_entry_id: null,
        winner_guest_profile_id: null,
        winner_index: null,
        winner_selected_at: null,
        winner_session_id: null,
      })
      .eq("id", wheelId);

    if (updErr) {
      return new NextResponse(JSON.stringify(updErr), { status: 500 });
    }

    return NextResponse.json({
      wheelId,
      spinSessionId: sessionId,
      spin_state: "go",
    });
  }

  /* ---------------------------------------------------------
     STOP: pick winner ONCE for the provided session (idempotent)
  --------------------------------------------------------- */
  if (action === "stop") {
    if (!spinSessionId) {
      return new NextResponse("Missing spinSessionId", { status: 400 });
    }

    // If winner already chosen for this session, return it (idempotent)
    if (
      wheel.winner_session_id === spinSessionId &&
      wheel.winner_entry_id &&
      wheel.winner_guest_profile_id != null &&
      wheel.winner_index != null
    ) {
      const { data: winnerRow } = await supabase
        .from("wheel_entries")
        .select("id,guest_profile_id,photo_url,first_name,last_name,status")
        .eq("id", wheel.winner_entry_id)
        .maybeSingle();

      return NextResponse.json({
        wheelId,
        spinSessionId,
        winner_entry_id: wheel.winner_entry_id,
        winner_guest_profile_id: wheel.winner_guest_profile_id,
        winner_index: wheel.winner_index,
        winner_selected_at: wheel.winner_selected_at,
        winner: winnerRow || null,
      });
    }

    // Otherwise: choose winner now (FAST, no 1000 row issue)
    let winnerEntry: any;
    try {
      winnerEntry = await fetchRandomApprovedEntry();
    } catch (e: any) {
      return new NextResponse(e?.message || "Error", {
        status: e?.status || 500,
      });
    }

    const winnerIndex = pickWinnerIndex();

    const { error: updErr } = await supabase
      .from("prize_wheels")
      .update({
        spin_state: "stopping",
        spin_session_id: wheel.spin_session_id || spinSessionId,
        spin_started_at: wheel.spin_started_at || new Date().toISOString(),

        winner_entry_id: winnerEntry.id,
        winner_guest_profile_id: winnerEntry.guest_profile_id,
        winner_index: winnerIndex,
        winner_selected_at: new Date().toISOString(),
        winner_session_id: spinSessionId,
      })
      .eq("id", wheelId);

    if (updErr) return new NextResponse(JSON.stringify(updErr), { status: 500 });

    return NextResponse.json({
      wheelId,
      spinSessionId,
      winner_entry_id: winnerEntry.id,
      winner_guest_profile_id: winnerEntry.guest_profile_id,
      winner_index: winnerIndex,
      winner_selected_at: new Date().toISOString(),
      winner: {
        id: winnerEntry.id,
        guest_profile_id: winnerEntry.guest_profile_id,
        photo_url: winnerEntry.photo_url ?? null,
        first_name: winnerEntry.first_name ?? "",
        last_name: winnerEntry.last_name ?? "",
        status: "approved",
      },
    });
  }

  /* ---------------------------------------------------------
     AUTO: create session + pick winner immediately (authoritative)
  --------------------------------------------------------- */
  if (action === "auto") {
    let winnerEntry: any;
    try {
      winnerEntry = await fetchRandomApprovedEntry();
    } catch (e: any) {
      return new NextResponse(e?.message || "Error", {
        status: e?.status || 500,
      });
    }

    const sessionId = randomUUID();
    const winnerIndex = pickWinnerIndex();

    const { error: updErr } = await supabase
      .from("prize_wheels")
      .update({
        spin_state: "auto",
        spin_session_id: sessionId,
        spin_started_at: new Date().toISOString(),

        winner_entry_id: winnerEntry.id,
        winner_guest_profile_id: winnerEntry.guest_profile_id,
        winner_index: winnerIndex,
        winner_selected_at: new Date().toISOString(),
        winner_session_id: sessionId,
      })
      .eq("id", wheelId);

    if (updErr) return new NextResponse(JSON.stringify(updErr), { status: 500 });

    return NextResponse.json({
      wheelId,
      spinSessionId: sessionId,
      winner_entry_id: winnerEntry.id,
      winner_guest_profile_id: winnerEntry.guest_profile_id,
      winner_index: winnerIndex,
      winner_selected_at: new Date().toISOString(),
      winner: {
        id: winnerEntry.id,
        guest_profile_id: winnerEntry.guest_profile_id,
        photo_url: winnerEntry.photo_url ?? null,
        first_name: winnerEntry.first_name ?? "",
        last_name: winnerEntry.last_name ?? "",
        status: "approved",
      },
    });
  }

  return new NextResponse("Invalid action", { status: 400 });
}
