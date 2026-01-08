"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateGuestDeviceId } from "@/lib/syncGuest";

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
function getStoredGuestProfile() {
  try {
    const raw =
      localStorage.getItem("guest_profile") ||
      localStorage.getItem("guestInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ✅ Basketball device token (stable per phone) */
function getOrCreateBbDeviceToken() {
  const KEY = "bb_device_token";
  let tok = "";
  try {
    tok = localStorage.getItem(KEY) || "";
  } catch {}

  if (!tok) {
    tok =
      (globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as any).randomUUID()
        : `bb_${Math.random().toString(16).slice(2)}_${Date.now()}`);
    try {
      localStorage.setItem(KEY, tok);
    } catch {}
  }

  return tok;
}

async function recordVisit({
  device_id,
  guest_profile_id,
  host_id,
}: {
  device_id: string;
  guest_profile_id: string;
  host_id: string;
}) {
  const res = await fetch(
    "https://zicbtsxjrhbpqjqemjrg.functions.supabase.co/record-guest-visit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id,
        guest_profile_id,
        host_id,
      }),
    }
  );

  if (!res.ok) return null;
  return res.json();
}

const DEFAULT_WHEEL_POPUP_MESSAGE =
  "We want everyone to be a winner! Show this screen at the merchandise table for $10 off and pick your free poster.";

function normalizeType(t: string) {
  const x = (t || "").toLowerCase().trim();
  if (
    ["wheel", "prizewheel", "prize_wheel", "prizewheels", "prize_wheels"].includes(
      x
    )
  )
    return "wheel";
  if (["poll", "polls"].includes(x)) return "poll";
  if (["wall", "fanwall", "fan_wall", "fan_walls"].includes(x)) return "wall";
  if (["basketball", "bb", "bbgame", "bb_games"].includes(x)) return "basketball";
  if (["trivia", "triviacard", "trivia_cards"].includes(x)) return "trivia";
  return x;
}

type ThankType = "basketball" | "trivia" | "poll" | "wheel" | "wall" | "lead";

/* ---------------------------------------------------------
   Component
--------------------------------------------------------- */
export default function ThankYouPage() {
  const params = useParams();
  const gameId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : "";

  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const rawType = searchParams.get("type");

  const path =
    typeof window !== "undefined" ? window.location.pathname : "";

  const isThanksPath =
    typeof window !== "undefined"
      ? window.location.pathname.includes("/thanks/")
      : false;

  // Initial detection from path (non-/thanks routes) + optional ?type override
  const initialType: ThankType = (() => {
    if (typeof window === "undefined") return "lead";

    let detected: ThankType =
      path.includes("/basketball/") ? "basketball" :
      path.includes("/trivia/") ? "trivia" :
      path.includes("/polls/") ? "poll" :
      path.includes("/prizewheel/") ? "wheel" :
      path.includes("/wall/") ? "wall" :
      "lead";

    if (rawType) detected = normalizeType(rawType) as ThankType;
    return detected;
  })();

  // ✅ Make type stateful so /thanks can “upgrade” from lead → wheel/etc
  const [type, setType] = useState<ThankType>(initialType);

  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [visitInfo, setVisitInfo] = useState<any>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Trivia state
  const [triviaPhase, setTriviaPhase] =
    useState<"waiting" | "countdown" | "playing">("waiting");
  const [countdownStartedAtMs, setCountdownStartedAtMs] =
    useState<number | null>(null);
  const [triviaCountdownSeconds, setTriviaCountdownSeconds] =
    useState<number | null>(null);

  // For ticking countdown
  const [now, setNow] = useState<number>(() => Date.now());

  // Server-time offset so phones + wall line up
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);

  /* ---------------------------------------------------------
     Keep type in sync if ?type changes
  --------------------------------------------------------- */
  useEffect(() => {
    if (!rawType) return;
    setType(normalizeType(rawType) as ThankType);
  }, [rawType]);

  /* ---------------------------------------------------------
     /thanks autodetect (no ?type)
     Probe tables to determine what this id represents.
  --------------------------------------------------------- */
  useEffect(() => {
    if (!isThanksPath) return;
    if (!gameId) return;
    if (rawType) return; // query param wins
    if (type !== "lead") return; // already known

    let cancelled = false;

    (async () => {
      const candidates: Array<{ t: ThankType; table: string }> = [
        { t: "wheel", table: "prize_wheels" },
        { t: "poll", table: "polls" },
        { t: "trivia", table: "trivia_cards" },
        { t: "basketball", table: "bb_games" },
        { t: "wall", table: "fan_walls" },
      ];

      for (const c of candidates) {
        const { data: hit, error } = await supabase
          .from(c.table)
          .select("id")
          .eq("id", gameId)
          .maybeSingle();

        if (cancelled) return;
        if (error) continue;
        if (hit?.id) {
          setType(c.t);
          return;
        }
      }

      setType("lead");
    })();

    return () => {
      cancelled = true;
    };
  }, [isThanksPath, gameId, rawType, type, supabase]);

  /* ---------------------------------------------------------
     Load guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    setProfile(getStoredGuestProfile());
  }, []);

  /* ---------------------------------------------------------
     Load host + background (FK-based join)
  --------------------------------------------------------- */
  useEffect(() => {
    if (!gameId) return;

    (async () => {
      if (isThanksPath && type === "lead" && !rawType) {
        setData(null);
        return;
      }

      if (type === "lead") {
        setData({ background_value: null, host: null });
        return;
      }

      const table =
        type === "poll"
          ? "polls"
          : type === "wheel"
          ? "prize_wheels"
          : type === "basketball"
          ? "bb_games"
          : type === "trivia"
          ? "trivia_cards"
          : "fan_walls";

      const select =
        type === "basketball"
          ? `
              id,
              host:host_id (
                id,
                branding_logo_url
              )
            `
          : type === "trivia"
          ? `
              id,
              host_id,
              host:host_id (
                id,
                branding_logo_url
              )
            `
          : type === "wheel"
          ? `
              id,
              background_value,
              thank_you_popup_enabled,
              thank_you_popup_message,
              host:host_id (
                id,
                branding_logo_url
              )
            `
          : `
              id,
              background_value,
              host:host_id (
                id,
                branding_logo_url
              )
            `;

      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq("id", gameId as string)
        .maybeSingle();

      if (error) {
        console.error(`❌ ${table} fetch error (thanks):`, error);
        setData(null);
        return;
      }

      setData(data);
    })();
  }, [gameId, type, supabase, isThanksPath, rawType]);

  /* ---------------------------------------------------------
     Normalize host (embedded joins can return array)
  --------------------------------------------------------- */
  const host = useMemo(() => {
    const h = data?.host;
    return Array.isArray(h) ? h[0] : h;
  }, [data]);

  /* ---------------------------------------------------------
     Record visit (loyalty / badge) — requires guest profile
  --------------------------------------------------------- */
  useEffect(() => {
    if (!profile || !host?.id) return;

    const deviceId = getOrCreateGuestDeviceId();

    recordVisit({
      device_id: deviceId,
      guest_profile_id: profile.id,
      host_id: host.id,
    }).then((res) => {
      if (!res) return;
      setVisitInfo(res);
    });
  }, [profile, host?.id]);

  /* ---------------------------------------------------------
     Wake Lock (basketball controller mode)
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "basketball") return;

    async function lockScreen() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request(
            "screen"
          );
        }
      } catch {
        // ignore
      }
    }

    lockScreen();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [type]);

  /* ---------------------------------------------------------
     ✅ Basketball: Poll for approval by DEVICE TOKEN → redirect
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "basketball" || !gameId) return;

    const bbToken = getOrCreateBbDeviceToken();

    async function pollApproval() {
      // 1) Check if an approved entry exists for this phone token
      const { data: entry, error: entryErr } = await supabase
        .from("bb_game_entries")
        .select("id, device_token")
        .eq("game_id", gameId)
        .eq("device_token", bbToken)
        .eq("status", "approved")
        .maybeSingle();

      if (entryErr) return;
      if (!entry) return;

      // 2) Find active player row for this phone token
      const { data: player, error: playerErr } = await supabase
        .from("bb_game_players")
        .select("id, device_token")
        .eq("game_id", gameId)
        .eq("device_token", bbToken)
        .is("disconnected_at", null)
        .maybeSingle();

      if (playerErr) return;
      if (!player) return;

      // Store player id for shooter page
      try {
        localStorage.setItem("bb_player_id", player.id);
        localStorage.setItem("bb_device_token", bbToken);
      } catch {}

      if (pollRef.current) clearInterval(pollRef.current);

      router.replace(`/basketball/${gameId}/shoot`);
    }

    // faster + smoother
    pollRef.current = setInterval(pollApproval, 1200);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [type, gameId, supabase, router]);

  /* ---------------------------------------------------------
     Trivia server-time sync
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "trivia") return;
    if (!gameId) return;

    let cancelled = false;

    async function syncServerTime() {
      try {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc("server_time");
        const t1 = Date.now();

        if (cancelled || error || !data) return;

        const serverMs = new Date(data as any).getTime();
        const rtt = t1 - t0;
        const estimatedNow = t1 - rtt / 2;
        setServerOffsetMs(serverMs - estimatedNow);
      } catch {
        // ignore
      }
    }

    syncServerTime();
    const id = setInterval(syncServerTime, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [type, gameId, supabase]);

  /* ---------------------------------------------------------
     Trivia: watch trivia_cards for countdown / running state
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "trivia" || !gameId) return;

    let mounted = true;

    function applyCardState(card: {
      status: string;
      countdown_active: boolean;
      countdown_started_at?: string | null;
      countdown_seconds?: number | null;
    }) {
      const totalSeconds =
        typeof card.countdown_seconds === "number" && card.countdown_seconds > 0
          ? card.countdown_seconds
          : 10;

      if (card.countdown_active) {
        setTriviaPhase("countdown");
        setTriviaCountdownSeconds(totalSeconds);

        if (card.countdown_started_at) {
          setCountdownStartedAtMs(new Date(card.countdown_started_at).getTime());
        } else {
          setCountdownStartedAtMs(Date.now());
        }
        return;
      }

      if (card.status === "running") {
        setTriviaPhase("playing");
        setCountdownStartedAtMs(null);
        setTriviaCountdownSeconds(null);
        router.replace(`/trivia/userinterface?game=${gameId}`);
        return;
      }

      setTriviaPhase("waiting");
      setCountdownStartedAtMs(null);
      setTriviaCountdownSeconds(null);
    }

    async function loadInitialCard() {
      const { data: card, error } = await supabase
        .from("trivia_cards")
        .select("status,countdown_active,countdown_started_at,countdown_seconds")
        .eq("id", gameId as string)
        .maybeSingle();

      if (!mounted || !card || error) return;
      applyCardState(card as any);
    }

    loadInitialCard();

    const channel = supabase
      .channel(`trivia-card-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trivia_cards",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          if (!mounted) return;
          applyCardState(payload.new as any);
        }
      )
      .subscribe();

    let prevCountdownActive: boolean | null = null;
    let prevStatus: string | null = null;

    const pollId = setInterval(async () => {
      if (!mounted) return;

      const { data: card, error } = await supabase
        .from("trivia_cards")
        .select("status,countdown_active,countdown_started_at,countdown_seconds")
        .eq("id", gameId as string)
        .maybeSingle();

      if (!card || error) return;

      const changedCountdown = card.countdown_active !== prevCountdownActive;
      const changedStatus = card.status !== prevStatus;

      prevCountdownActive = card.countdown_active;
      prevStatus = card.status;

      if (changedCountdown || changedStatus) applyCardState(card as any);
    }, 1000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [type, gameId, supabase, router]);

  /* ---------------------------------------------------------
     Trivia countdown ticking
  --------------------------------------------------------- */
  useEffect(() => {
    if (type !== "trivia") return;
    if (triviaPhase !== "countdown") return;
    if (!countdownStartedAtMs) return;

    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [type, triviaPhase, countdownStartedAtMs]);

  /* ---------------------------------------------------------
     Badge logic
  --------------------------------------------------------- */
  const badge = visitInfo?.loyaltyDisabled ? null : visitInfo?.badge ?? null;

  /* ---------------------------------------------------------
     UI helpers
  --------------------------------------------------------- */
  const bg =
    type === "basketball"
      ? `url(/bbgame1920x1080.png)` // ✅ FIXED
      : type === "trivia"
      ? "linear-gradient(135deg,#0a2540,#1b2b44,#000000)"
      : data?.background_value?.includes?.("http")
      ? `url(${data.background_value})`
      : data?.background_value ||
        "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  const logo = host?.branding_logo_url?.trim?.() || "/faninteractlogo.png";

  const headline = visitInfo?.isReturning
    ? `Welcome back, ${profile?.first_name || "friend"}!`
    : `Thank You, ${profile?.first_name || "friend"}!`;

  const message = useMemo(() => {
    switch (type) {
      case "basketball":
        return "You’re in! Get ready to play.";
      case "poll":
        return "Your vote has been recorded!";
      case "wheel":
        return "You're in! Watch for your chance…";
      case "trivia":
        return "You’re in! Get ready for the trivia game.";
      default:
        return "Your submission was received!";
    }
  }, [type, profile?.first_name]);

  // ✅ wheel popup config
  const wheelPopupEnabled =
    type === "wheel" && data?.thank_you_popup_enabled === true;

  const wheelPopupText = useMemo(() => {
    if (!wheelPopupEnabled) return null;
    const raw = (data?.thank_you_popup_message || "") as string;
    const trimmed = raw.trim();
    return trimmed || DEFAULT_WHEEL_POPUP_MESSAGE;
  }, [wheelPopupEnabled, data?.thank_you_popup_message]);

  /* ---------------------------------------------------------
     Trivia countdown full-screen override
  --------------------------------------------------------- */
  if (
    type === "trivia" &&
    triviaPhase === "countdown" &&
    countdownStartedAtMs &&
    (triviaCountdownSeconds ?? 0) > 0
  ) {
    const total = triviaCountdownSeconds ?? 10;
    const nowMs = now + serverOffsetMs;
    const elapsed = Math.max(0, (nowMs - countdownStartedAtMs) / 1000);
    const secondsLeft = Math.max(0, Math.floor(total - elapsed));

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "5rem",
          fontWeight: 900,
        }}
      >
        {secondsLeft}
      </div>
    );
  }

  /* ---------------------------------------------------------
     Render
  --------------------------------------------------------- */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 460,
          width: "100%",
          padding: "42px 26px",
          borderRadius: 22,
          background: "rgba(0,0,0,0.65)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 0 35px rgba(0,0,0,0.7)",
        }}
      >
        <img
          key={logo}
          src={logo}
          alt="logo"
          onError={(e) => {
            e.currentTarget.src = "/faninteractlogo.png";
          }}
          style={{
            width: "72%",
            maxWidth: 260,
            margin: "0 auto 16px",
            display: "block",
          }}
        />

        <h1
          style={{
            fontSize: "2.2rem",
            fontWeight: 900,
            marginBottom: 6,
            background:
              "linear-gradient(90deg,#ffd8a6,#ffa65c,#ff7a00,#ff3b0a)",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          {headline}
        </h1>

        <p style={{ color: "#f3e8e0", marginBottom: 12 }}>{message}</p>

        {/* PRIZE WHEEL POPUP MESSAGE */}
        {type === "wheel" && wheelPopupText && (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.20)",
            }}
          >
            <div
              style={{
                fontSize: "1.05rem",
                fontWeight: 800,
                color: "#facc15",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              Special Offer
            </div>
            <div
              style={{
                fontSize: "1.15rem",
                lineHeight: 1.35,
                color: "#f9fafb",
              }}
            >
              {wheelPopupText}
            </div>
          </div>
        )}

        {/* Loyalty badge */}
        {badge && (
          <div
            style={{
              marginTop: type === "wheel" && wheelPopupText ? 12 : 18,
              padding: 16,
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {badge.icon_url && (
              <img
                src={badge.icon_url}
                alt={badge.label}
                style={{
                  width: 96,
                  height: 96,
                  margin: "0 auto 10px",
                  display: "block",
                }}
              />
            )}

            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 900,
                color: "#ffd166",
                marginBottom: 6,
              }}
            >
              {badge.label}
            </div>

            <div
              style={{
                fontSize: "0.95rem",
                color: "#f1f5f9",
                opacity: 0.95,
              }}
            >
              {badge.description}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseGlow {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
