// Third-party services the network runs on, as one strip on Inicio (Franz
// 2026-09-02): is there money in Twilio, what is Claude costing, is the
// database growing. Every item fails soft — a provider outage shows as
// «sin respuesta», never as a broken home page.

export type ServiceLevel = "ok" | "warn" | "down" | "unknown";

export type ServiceItem = {
  key: "twilio" | "claude" | "db";
  label: string;
  level: ServiceLevel;
  value: string; // headline
  detail: string; // supporting line
  href?: string;
};

const TIMEOUT_MS = 6000;

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Twilio: prepaid balance + spend, so the panel can say how many days are
// left at last month's pace. OTP by SMS/WhatsApp stops the day this hits 0.
async function twilio(): Promise<ServiceItem> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base: ServiceItem = { key: "twilio", label: "Twilio (OTP)", level: "unknown", value: "—", detail: "", href: "https://console.twilio.com/" };
  if (!sid || !token) return { ...base, value: "Sin credenciales", detail: "Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN" };
  const auth = { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } };
  const root = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
  try {
    const [bal, last, month] = await Promise.all([
      getJson(`${root}/Balance.json`, auth) as Promise<{ balance: string; currency: string }>,
      getJson(`${root}/Usage/Records/LastMonth.json?Category=totalprice`, auth) as Promise<{ usage_records: { price: string }[] }>,
      getJson(`${root}/Usage/Records/ThisMonth.json?Category=totalprice`, auth) as Promise<{ usage_records: { price: string }[] }>,
    ]);
    const balance = Number(bal.balance);
    const lastMonth = Number(last.usage_records[0]?.price ?? 0);
    const thisMonth = Number(month.usage_records[0]?.price ?? 0);
    const perDay = lastMonth / 30;
    const days = perDay > 0 ? Math.floor(balance / perDay) : null;
    const level: ServiceLevel = balance < 20 || (days != null && days < 10) ? "down" : days != null && days < 30 ? "warn" : "ok";
    return {
      ...base,
      level,
      value: `${usd(balance)} ${bal.currency}`,
      detail: `${days != null ? `~${days} días al ritmo de agosto` : "sin consumo previo"} · mes pasado ${usd(lastMonth)} · este mes ${usd(thisMonth)}`,
    };
  } catch (e) {
    return { ...base, level: "down", value: "sin respuesta", detail: e instanceof Error ? e.message : "error" };
  }
}

// Claude: the Admin API's cost report (daily USD). There is no balance
// endpoint — credits only show in the Console — so this is spend, and it
// needs an Admin API key (a regular key is rejected).
async function claude(): Promise<ServiceItem> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  const base: ServiceItem = { key: "claude", label: "Claude (cerebro)", level: "unknown", value: "—", detail: "", href: "https://platform.claude.com/cost" };
  if (!key) {
    return { ...base, value: "Sin clave Admin", detail: "Crea una Admin API key en la consola de Anthropic y agrégala como ANTHROPIC_ADMIN_KEY" };
  }
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${start.toISOString()}&ending_at=${end.toISOString()}&bucket_width=1d&limit=31`;
  try {
    const data = (await getJson(url, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "propia-admin/1.0 (https://admin.propia.dev)" },
    })) as { data: { starting_at: string; results: { amount: string; currency: string }[] }[] };
    const buckets = data.data ?? [];
    const cents = (b: { results: { amount: string }[] }) => b.results.reduce((n, r) => n + Number(r.amount || 0), 0);
    const total30 = buckets.reduce((n, b) => n + cents(b), 0) / 100;
    const last7 = buckets.slice(-7).reduce((n, b) => n + cents(b), 0) / 100;
    const today = buckets.length ? cents(buckets[buckets.length - 1]) / 100 : 0;
    const level: ServiceLevel = last7 > 150 ? "warn" : "ok";
    return { ...base, level, value: `${usd(total30)} / 30 días`, detail: `hoy ${usd(today)} · últimos 7 días ${usd(last7)}` };
  } catch (e) {
    return { ...base, level: "down", value: "sin respuesta", detail: e instanceof Error ? e.message : "error" };
  }
}

// Supabase: size of the database and open connections, through the
// Management API the panel already holds for the rescue OTP page.
async function database(): Promise<ServiceItem> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = (process.env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const base: ServiceItem = { key: "db", label: "Base de datos", level: "unknown", value: "—", detail: "", href: ref ? `https://supabase.com/dashboard/project/${ref}` : undefined };
  if (!token || !ref) return { ...base, value: "Sin acceso", detail: "Falta SUPABASE_MGMT_TOKEN" };
  try {
    const rows = (await getJson(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "select pg_database_size(current_database()) as bytes, (select count(*) from pg_stat_activity) as connections, (select setting::int from pg_settings where name='max_connections') as max_conn",
      }),
    })) as { bytes: number; connections: number; max_conn: number }[];
    const r = rows[0];
    const gb = r.bytes / 1024 ** 3;
    const size = gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(r.bytes / 1024 ** 2)} MB`;
    const connPct = r.max_conn ? r.connections / r.max_conn : 0;
    const level: ServiceLevel = gb > 6 || connPct > 0.9 ? "down" : gb > 4 || connPct > 0.7 ? "warn" : "ok";
    return { ...base, level, value: size, detail: `${r.connections} de ${r.max_conn} conexiones · plan Small (8 GB)` };
  } catch (e) {
    return { ...base, level: "down", value: "sin respuesta", detail: e instanceof Error ? e.message : "error" };
  }
}

export async function fetchServicios(): Promise<ServiceItem[]> {
  return Promise.all([twilio(), claude(), database()]);
}
