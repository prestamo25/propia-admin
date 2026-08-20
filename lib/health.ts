import { supabaseAdmin } from "./supabaseAdmin";

// System health — the panel's answer to "is anything broken right now?".
//
// Born from the 2026-08-11 outage: Supabase was down ~8 h while its own
// control plane reported healthy, and nobody learned it from the panel. The
// two silent failures that actually happen here are (a) the DB degrading and
// (b) the WhatsApp bot's session expiring (~14 days idle), which stops ~200
// captures/day without any visible error.

export type Level = "ok" | "warn" | "down";

export type HealthItem = {
  key: "db" | "bot" | "signups" | "listings";
  label: string;
  level: Level;
  value: string; // headline (e.g. "142 ms", "hace 3 min")
  detail: string; // supporting line
};

export type Health = { items: HealthItem[]; worst: Level };

const MIN = 60_000;

function ago(iso: string | null, now: number): { ms: number; label: string } {
  if (!iso) return { ms: Infinity, label: "nunca" };
  const ms = now - new Date(iso).getTime();
  const m = Math.floor(ms / MIN);
  if (m < 1) return { ms, label: "hace segundos" };
  if (m < 60) return { ms, label: `hace ${m} min` };
  const h = Math.floor(m / 60);
  if (h < 24) return { ms, label: `hace ${h} h` };
  return { ms, label: `hace ${Math.floor(h / 24)} d` };
}

// WhatsApp groups sleep at night, so a flat "no captures in 2 h" would cry
// wolf every early morning. Only hold the bot to the tight threshold during
// waking hours (CDMX 8:00–23:00).
function botThresholds(): { warn: number; down: number } {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  const awake = hour >= 8 && hour < 23;
  return awake
    ? { warn: 90 * MIN, down: 6 * 60 * MIN }
    : { warn: 8 * 60 * MIN, down: 14 * 60 * MIN };
}

export async function fetchHealth(): Promise<Health> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const t = Date.now();

  const latest = (table: string) =>
    sb
      .from(table)
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const [waRes, userRes, propRes, waDayRes] = await Promise.all([
    latest("wa_listings"),
    latest("users"),
    latest("properties"),
    sb
      .from("wa_listings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now - 24 * 60 * MIN).toISOString()),
  ]);
  const latency = Date.now() - t;

  const items: HealthItem[] = [];

  // Database — reachability + round-trip time of the queries above.
  const dbLevel: Level = waRes.error || userRes.error ? "down" : latency > 2500 ? "warn" : "ok";
  items.push({
    key: "db",
    label: "Base de datos",
    level: dbLevel,
    value: dbLevel === "down" ? "sin respuesta" : `${latency} ms`,
    detail:
      dbLevel === "down"
        ? (waRes.error?.message ?? "error de consulta")
        : dbLevel === "warn"
          ? "más lenta de lo normal"
          : "respondiendo normal",
  });

  // WhatsApp bot — the capture heartbeat.
  const waAt = (waRes.data as { created_at: string } | null)?.created_at ?? null;
  const waAgo = ago(waAt, now);
  const { warn, down } = botThresholds();
  const botLevel: Level = waAgo.ms > down ? "down" : waAgo.ms > warn ? "warn" : "ok";
  const waDay = waDayRes.count ?? 0;
  items.push({
    key: "bot",
    label: "Bot de WhatsApp",
    level: botLevel,
    value: waAgo.label,
    detail:
      botLevel === "down"
        ? "sin capturas — revisa la sesión de WhatsApp"
        : `${waDay} capturas en 24 h`,
  });

  // Signups — informational: lumpy by nature (events drive spikes), so it
  // only warns after a full day of silence.
  const uAt = (userRes.data as { created_at: string } | null)?.created_at ?? null;
  const uAgo = ago(uAt, now);
  items.push({
    key: "signups",
    label: "Altas",
    level: uAgo.ms > 48 * 60 * MIN ? "warn" : "ok",
    value: uAgo.label,
    detail: "último registro en la app",
  });

  // Listings from members (not the bot) — same idea.
  const pAt = (propRes.data as { created_at: string } | null)?.created_at ?? null;
  const pAgo = ago(pAt, now);
  items.push({
    key: "listings",
    label: "Publicaciones",
    level: pAgo.ms > 48 * 60 * MIN ? "warn" : "ok",
    value: pAgo.label,
    detail: "última propiedad publicada",
  });

  const worst: Level = items.some((i) => i.level === "down")
    ? "down"
    : items.some((i) => i.level === "warn")
      ? "warn"
      : "ok";

  return { items, worst };
}
