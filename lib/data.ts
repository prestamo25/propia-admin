import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const sb = supabaseAdmin();

  // Every list here is a FULL-table read → paged (pageAll), or PostgREST's
  // 1,000-row cap silently truncates: the overview froze at "1000 Propiedades"
  // and per-broker inventory counts went quietly wrong (2026-08-17).
  const [userRows, propRows, authUsers] = await Promise.all([
    pageAll<Record<string, unknown>>(() =>
      sb
        .from("users")
        .select(
          "id, name, first_name, last_name, company, phone, email, states, status, created_at, last_active, avatar_url, whatsapp_opt_in",
        )
        .order("created_at", { ascending: false }),
    ),
    pageAll<{ user_id: string }>(() => sb.from("properties").select("user_id")),
    // Ban state lives in the auth schema, reachable only via the admin API —
    // its own pagination (page/perPage), same silent-truncation rule.
    (async () => {
      const users: { id: string; banned_until?: string | null }[] = [];
      for (let page = 1; ; page++) {
        const res = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (res.error) throw res.error;
        users.push(...(res.data.users as typeof users));
        if (res.data.users.length < 1000) return users;
      }
    })(),
  ]);

  const counts = new Map<string, number>();
  for (const p of propRows) {
    counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);
  }

  const banned = new Map<string, boolean>();
  for (const u of authUsers) {
    banned.set(u.id, isBanned(u.banned_until));
  }

  const brokers: BrokerRow[] = userRows.map((u) => {
    const row = u as {
      id: string;
      name: string | null;
      first_name: string | null;
      last_name: string | null;
      company: string | null;
      phone: string | null;
      email: string | null;
      states: string[] | null;
      status: string | null;
      created_at: string | null;
      last_active: string | null;
      avatar_url: string | null;
      whatsapp_opt_in: boolean | null;
    };
    const full =
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      row.name ||
      null;
    return {
      id: row.id,
      name: full,
      company: row.company,
      phone: row.phone,
      email: row.email,
      states: row.states ?? [],
      status: row.status,
      created_at: row.created_at,
      last_active: row.last_active,
      avatar_url: row.avatar_url,
      whatsapp_opt_in: Boolean(row.whatsapp_opt_in),
      inventory: counts.get(row.id) ?? 0,
      mb_used: null,
      blocked: banned.get(row.id) ?? false,
    };
  });

  const approved = brokers.filter((b) => b.status === "approved").length;
  const pending = brokers.filter((b) => b.status === "pending").length;
  const blocked = brokers.filter((b) => b.blocked).length;

  return {
    brokers,
    totals: {
      brokers: brokers.length,
      approved,
      pending,
      properties: propRows.length,
      blocked,
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
          "id, name, type, transaction, price, currency, state, bedrooms, bathrooms, address, source, created_at, property_photos(thumb_url, position)",
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
