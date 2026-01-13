import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "crypto";

export const runtime = "nodejs";

type Action = "go" | "stop" | "auto";

type SmsResult =
  | { attempted: false; sent: false; skipped: string }
  | { attempted: true; sent: true; sid?: string; to: string }
  | { attempted: true; sent: false; error: string; to?: string };

function cleanStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function renderTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

async function sendTwilioSms(to: string, body: string): Promise<{ sid?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("missing_twilio_env");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const form = new URLSearchParams();
  form.set("From", from);
  form.set("To", to);
  form.set("Body", body);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const json: any = await resp.json().catch(() => null);

  if (!resp.ok) {
    const msg = cleanStr(json?.message) || `twilio_error_${resp.status}`;
    throw new Error(msg);
  }

  return { sid: json?.sid };
}

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

  // Load wheel (includes SMS settings)
  const { data: wheel, error: wheelErr } = await supabase
    .from("prize_wheels")
    .select(
      [
        "id",
        "title",
        "spin_state",
        "spin_session_id",
        "winner_entry_id",
        "winner_guest_profile_id",
        "winner_index",
        "winner_selected_at",
        "winner_session_id",
        "spin_started_at",
        "sms_winner_enabled",
        "sms_winner_message",
      ].join(",")
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
    return randomInt(0, 16);
  }

  async function fetchWinnerPhone(guestProfileId: string): Promise<string> {
    const { data, error } = await supabase
      .from("guest_profiles")
      .select("phone, first_name, last_name")
      .eq("id", guestProfileId)
      .single();

    if (error || !data) return "";
    return cleanStr(data.phone);
  }

  async function ensureSpinRow(params: {
    spinId: string;
    spinSessionId: string;
    action: "stop" | "auto";
    winnerEntryId: string;
    winnerGuestProfileId: string;
    winnerIndex: number;
    winnerSelectedAtISO: string;
  }) {
    // Upsert prevents duplicates for the same wheel/session
    const { data, error } = await supabase
      .from("prize_wheel_spins")
      .upsert(
        {
          id: params.spinId,
          wheel_id: wheelId,
          spin_session_id: params.spinSessionId,
          action: params.action,
          winner_entry_id: params.winnerEntryId,
          winner_guest_profile_id: params.winnerGuestProfileId,
          winner_index: params.winnerIndex,
          winner_selected_at: params.winnerSelectedAtISO,
        },
        { onConflict: "wheel_id,spin_session_id" }
      )
      .select("id, sms_sent_at, sms_error")
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function getSpinRow(spinSession: string) {
    const { data, error } = await supabase
      .from("prize_wheel_spins")
      .select("id, sms_sent_at, sms_error, sms_to, sms_sid")
      .eq("wheel_id", wheelId)
      .eq("spin_session_id", spinSession)
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function updateSpinSms(spinId: string, patch: any) {
    await supabase.from("prize_wheel_spins").update(patch).eq("id", spinId);
  }

  async function maybeSendWinnerSms(args: {
    spinSessionId: string;
    spinId: string;
    winnerEntry: any;
    winnerIndex: number;
    winnerSelectedAtISO: string;
  }): Promise<SmsResult> {
    // settings gate
    const enabled = !!wheel.sms_winner_enabled;
    const template = cleanStr(wheel.sms_winner_message);

    if (!enabled) return { attempted: false, sent: false, skipped: "disabled" };
    if (!template) return { attempted: false, sent: false, skipped: "empty_message" };

    const guestProfileId = args.winnerEntry?.guest_profile_id;
    if (!guestProfileId) return { attempted: false, sent: false, skipped: "missing_guest_profile" };

    // already sent?
    const existing = await getSpinRow(args.spinSessionId);
    if (existing?.sms_sent_at) {
      return {
        attempted: false,
        sent: false,
        skipped: "already_sent",
      };
    }

    const to = await fetchWinnerPhone(guestProfileId);
    if (!to) {
      await updateSpinSms(args.spinId, { sms_error: "missing_phone" });
      return { attempted: true, sent: false, error: "missing_phone" };
    }

    const first = cleanStr(args.winnerEntry?.first_name);
    const last = cleanStr(args.winnerEntry?.last_name);
    const title = cleanStr(wheel.title) || "Prize Wheel";

    const body = renderTemplate(template, {
      first_name: first,
      last_name: last,
      wheel_title: title,
    });

    try {
      const res = await sendTwilioSms(to, body);

      await updateSpinSms(args.spinId, {
        sms_to: to,
        sms_body: body,
        sms_sid: res.sid || null,
        sms_sent_at: new Date().toISOString(),
        sms_error: null,
      });

      return { attempted: true, sent: true, sid: res.sid, to };
    } catch (e: any) {
      const msg = cleanStr(e?.message) || "sms_failed";
      await updateSpinSms(args.spinId, {
        sms_to: to,
        sms_body: body,
        sms_error: msg,
      });
      return { attempted: true, sent: false, error: msg, to };
    }
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

      // Ensure spin row exists + attempt SMS (without double sending)
      const spinId = randomUUID();
      const winnerSelectedAtISO =
        typeof wheel.winner_selected_at === "string"
          ? wheel.winner_selected_at
          : new Date().toISOString();

      const ensured = await ensureSpinRow({
        spinId,
        spinSessionId,
        action: "stop",
        winnerEntryId: wheel.winner_entry_id,
        winnerGuestProfileId: String(wheel.winner_guest_profile_id),
        winnerIndex: Number(wheel.winner_index),
        winnerSelectedAtISO,
      });

      const finalSpinId = ensured?.id || spinId;

      const sms = await maybeSendWinnerSms({
        spinSessionId,
        spinId: finalSpinId,
        winnerEntry: winnerRow || {
          guest_profile_id: wheel.winner_guest_profile_id,
          first_name: "",
          last_name: "",
        },
        winnerIndex: Number(wheel.winner_index),
        winnerSelectedAtISO,
      });

      return NextResponse.json({
        wheelId,
        spinSessionId,
        winner_entry_id: wheel.winner_entry_id,
        winner_guest_profile_id: wheel.winner_guest_profile_id,
        winner_index: wheel.winner_index,
        winner_selected_at: wheel.winner_selected_at,
        winner: winnerRow || null,
        sms,
      });
    }

    // Otherwise: choose winner now
    let winnerEntry: any;
    try {
      winnerEntry = await fetchRandomApprovedEntry();
    } catch (e: any) {
      return new NextResponse(e?.message || "Error", {
        status: e?.status || 500,
      });
    }

    const winnerIndex = pickWinnerIndex();
    const winnerSelectedAtISO = new Date().toISOString();

    const { error: updErr } = await supabase
      .from("prize_wheels")
      .update({
        spin_state: "stopping",
        spin_session_id: wheel.spin_session_id || spinSessionId,
        spin_started_at: wheel.spin_started_at || winnerSelectedAtISO,

        winner_entry_id: winnerEntry.id,
        winner_guest_profile_id: winnerEntry.guest_profile_id,
        winner_index: winnerIndex,
        winner_selected_at: winnerSelectedAtISO,
        winner_session_id: spinSessionId,
      })
      .eq("id", wheelId);

    if (updErr) return new NextResponse(JSON.stringify(updErr), { status: 500 });

    // Create spin row and attempt SMS
    const spinId = randomUUID();
    const ensured = await ensureSpinRow({
      spinId,
      spinSessionId,
      action: "stop",
      winnerEntryId: winnerEntry.id,
      winnerGuestProfileId: String(winnerEntry.guest_profile_id),
      winnerIndex,
      winnerSelectedAtISO,
    });

    const finalSpinId = ensured?.id || spinId;

    const sms = await maybeSendWinnerSms({
      spinSessionId,
      spinId: finalSpinId,
      winnerEntry,
      winnerIndex,
      winnerSelectedAtISO,
    });

    return NextResponse.json({
      wheelId,
      spinSessionId,
      winner_entry_id: winnerEntry.id,
      winner_guest_profile_id: winnerEntry.guest_profile_id,
      winner_index: winnerIndex,
      winner_selected_at: winnerSelectedAtISO,
      winner: {
        id: winnerEntry.id,
        guest_profile_id: winnerEntry.guest_profile_id,
        photo_url: winnerEntry.photo_url ?? null,
        first_name: winnerEntry.first_name ?? "",
        last_name: winnerEntry.last_name ?? "",
        status: "approved",
      },
      sms,
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
    const winnerSelectedAtISO = new Date().toISOString();

    const { error: updErr } = await supabase
      .from("prize_wheels")
      .update({
        spin_state: "auto",
        spin_session_id: sessionId,
        spin_started_at: winnerSelectedAtISO,

        winner_entry_id: winnerEntry.id,
        winner_guest_profile_id: winnerEntry.guest_profile_id,
        winner_index: winnerIndex,
        winner_selected_at: winnerSelectedAtISO,
        winner_session_id: sessionId,
      })
      .eq("id", wheelId);

    if (updErr) return new NextResponse(JSON.stringify(updErr), { status: 500 });

    // Create spin row and attempt SMS
    const spinId = randomUUID();
    const ensured = await ensureSpinRow({
      spinId,
      spinSessionId: sessionId,
      action: "auto",
      winnerEntryId: winnerEntry.id,
      winnerGuestProfileId: String(winnerEntry.guest_profile_id),
      winnerIndex,
      winnerSelectedAtISO,
    });

    const finalSpinId = ensured?.id || spinId;

    const sms = await maybeSendWinnerSms({
      spinSessionId: sessionId,
      spinId: finalSpinId,
      winnerEntry,
      winnerIndex,
      winnerSelectedAtISO,
    });

    return NextResponse.json({
      wheelId,
      spinSessionId: sessionId,
      winner_entry_id: winnerEntry.id,
      winner_guest_profile_id: winnerEntry.guest_profile_id,
      winner_index: winnerIndex,
      winner_selected_at: winnerSelectedAtISO,
      winner: {
        id: winnerEntry.id,
        guest_profile_id: winnerEntry.guest_profile_id,
        photo_url: winnerEntry.photo_url ?? null,
        first_name: winnerEntry.first_name ?? "",
        last_name: winnerEntry.last_name ?? "",
        status: "approved",
      },
      sms,
    });
  }

  return new NextResponse("Invalid action", { status: 400 });
}
