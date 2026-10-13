import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Rieles de pago reales. Es una ALLOWLIST a propósito: una fuente nueva no
// cuenta como ingreso hasta que alguien la agregue aquí. Falla hacia no
// inflar, que es el lado correcto para un número que lee Pablo.
// `promotional` = cortesía/prueba y `manual` = venta cerrada a mano
// (app/actions.ts) quedan fuera por decisión de Franz 2026-09-21.
const PAID_SOURCES = new Set(["stripe", "app_store", "play_store", "revenuecat", "oxxo"]);

const activePlan = (row: { plan?: string | null; plan_expires_at?: string | null }) =>
  row.plan === "premium" &&
  (!row.plan_expires_at || new Date(row.plan_expires_at).getTime() > Date.now());

export type BrokerRow = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  states: string[];
  status: string | null;
  created_at: string | null;
  last_active: string | null;
  avatar_url: string | null;
  // Opt-in to receive WhatsApp messages from us (Ajustes → notificaciones).
  // Carried here so the Excel export can mark who is reachable that way.
  whatsapp_opt_in: boolean;
  inventory: number;
  // MB used (R2 storage) — not yet wired; photos live in Cloudflare R2, not
  // Postgres, so this needs a separate R2-prefix sum. null = "—" for now.
  mb_used: number | null;
  // Auth-level ban (auth.users.banned_until in the future). This is the block
  // state — independent of users.status.
  blocked: boolean;
  // users.profile_type — 'asesor' | 'cliente' | one of the 9 service types.
  profile_type: string;
  // Premium que DE VERDAD paga: plan vigente Y comprado por un riel de pago.
  // Franz 2026-09-21: él, Pablo y Mariana están en premium por cortesía y no
  // pagan, así que inflaban el contador del panel (8 cuando los que pagan son
  // 3). El badge y el filtro «Premium» cuentan sólo ingreso real.
  premium: boolean;
  // Premium vigente pero regalado (cortesía interna o venta a mano). Se
  // muestra aparte en vez de esconderse: sirve saber a quién le regalamos.
  comped: boolean;
  plan_source: string | null;
  plan_expires_at: string | null;
  // Activity numbers (Franz 2026-09-02): is this member actually working the
  // network? Open requerimientos, accepted contacts, events they were scanned
  // into, fichas sent to clients and the verified opens those got, and the
  // platforms their push registrations say they use.
  requests: number;
  contacts: number;
  events_attended: number;
  sends: number;
  opens: number;
  platforms: string[];
};

export type Overview = {
  brokers: BrokerRow[];
  totals: {
    brokers: number;
    approved: number;
    pending: number;
    properties: number;
    blocked: number;
  };
};

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

export async function fetchOverview(): Promise<Overview> {
  // One query (admin_members_overview, admin-members-overview-2026-10-13.sql):
  // the database counts listings, open requerimientos, accepted contacts,
  // events attended, fichas sent and their opens, push platforms and the ban
  // state per member, and returns them as one jsonb — ~80 ms. Until 2026-10-13
  // this read nine whole tables page by page on every visit (~2.5 s).
  const { data, error } = await supabaseAdmin().rpc("admin_members_overview");
  if (error) throw new Error(error.message);
  type Row = Omit<BrokerRow, "premium" | "comped" | "mb_used"> & {
    plan: string | null;
  };
  const brokers: BrokerRow[] = ((data ?? []) as Row[]).map(({ plan, ...row }) => {
    const active = activePlan({ plan, plan_expires_at: row.plan_expires_at });
    return {
      ...row,
      profile_type: row.profile_type ?? "asesor",
      mb_used: null,
      premium: active && PAID_SOURCES.has(row.plan_source ?? ""),
      comped: active && !PAID_SOURCES.has(row.plan_source ?? ""),
    };
  });

  return {
    brokers,
    totals: {
      brokers: brokers.length,
      approved: brokers.filter((b) => b.status === "approved").length,
      pending: brokers.filter((b) => b.status === "pending").length,
      properties: brokers.reduce((n, b) => n + b.inventory, 0),
      blocked: brokers.filter((b) => b.blocked).length,
    },
  };
}

export type Listing = {
  id: string;
  name: string | null;
  type: string | null;
  transaction: string | null;
  price: number | null;
  currency: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
  source: string | null;
  created_at: string | null;
  thumb_url: string | null;
  // What the network can see: 'network' | 'public' | 'private', and whether
  // it is live (lifecycle active, not archived). A regional viewer gets only
  // live, non-private listings (app/broker/[id]).
  visibility: string | null;
  live: boolean;
};

export type BrokerDetail = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  states: string[];
  status: string | null;
  created_at: string | null;
  last_active: string | null;
  avatar_url: string | null;
  blocked: boolean;
  listings: Listing[];
};

export async function fetchBroker(id: string): Promise<BrokerDetail | null> {
  const sb = supabaseAdmin();

  const [userRes, authRes, propRows] = await Promise.all([
    sb
      .from("users")
      .select(
        "id, name, first_name, last_name, company, phone, states, status, created_at, last_active, avatar_url",
      )
      .eq("id", id)
      .maybeSingle(),
    sb.auth.admin.getUserById(id),
    pageAll<Record<string, unknown>>(() =>
      sb
        .from("properties")
        .select(
          "id, name, type, transaction, price, currency, state, bedrooms, bathrooms, address, source, created_at, visibility, lifecycle, archived_at, property_photos(thumb_url, position)",
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ),
  ]);

  if (userRes.error) throw userRes.error;
  if (!userRes.data) return null;

  const u = userRes.data as {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    states: string[] | null;
    status: string | null;
    created_at: string | null;
    last_active: string | null;
    avatar_url: string | null;
  };

  const full =
    [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || null;

  const listings: Listing[] = propRows.map((row) => {
    const p = row as {
      id: string;
      name: string | null;
      type: string | null;
      transaction: string | null;
      price: number | null;
      currency: string | null;
      state: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      address: string | null;
      source: string | null;
      created_at: string | null;
      visibility: string | null;
      lifecycle: string | null;
      archived_at: string | null;
      property_photos: { thumb_url: string; position: number }[] | null;
    };
    const photos = [...(p.property_photos ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      transaction: p.transaction,
      price: p.price,
      currency: p.currency,
      state: p.state,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      address: p.address,
      source: p.source,
      created_at: p.created_at,
      thumb_url: photos[0]?.thumb_url ?? null,
      visibility: p.visibility,
      live: p.lifecycle === "active" && !p.archived_at,
    };
  });

  return {
    id: u.id,
    name: full,
    company: u.company,
    phone: u.phone,
    states: u.states ?? [],
    status: u.status,
    created_at: u.created_at,
    last_active: u.last_active,
    avatar_url: u.avatar_url,
    blocked: isBanned(authRes.data?.user?.banned_until),
    listings,
  };
}
