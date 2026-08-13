import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Salidas — the exit surveys brokers answer when deleting a requerimiento
// (and, later, a property): the WHY behind every removal. «Por conexión de
// Propia» is the network's win metric. Rows live in exit_surveys and survive
// the deletion of what they describe (no FKs, snapshot inside).

export type ExitReason =
  | "sold_via_propia"
  | "sold_outside"
  | "promotion_ended"
  | "created_by_error";

export const REASON_META: Record<
  ExitReason,
  { label: string; long: string; tone: "emerald" | "amber" | "sky" | "neutral" }
> = {
  sold_via_propia: {
    label: "Por conexión de Propia",
    long: "Se vendió por o a través de una conexión de Propia",
    tone: "emerald",
  },
  sold_outside: {
    label: "Fuera de Propia",
    long: "Se vendió por otro asesor o fuera de Propia",
    tone: "amber",
  },
  promotion_ended: {
    label: "Terminó la promoción",
    long: "Se acabó el tiempo de promoción o el cliente ya no busca",
    tone: "sky",
  },
  created_by_error: {
    label: "Error al crear",
    long: "Hay un error o se equivocó creando la ficha",
    tone: "neutral",
  },
};

type Snapshot = {
  transaction?: string | null;
  types?: string[] | null;
  states?: string[] | null;
  price_min?: number | null;
  price_max?: number | null;
  created_at?: string | null;
};

export type SalidaRow = {
  id: string;
  kind: "request" | "property";
  reason: ExitReason;
  created_at: string;
  broker_id: string;
  broker_name: string | null;
  summary: string; // «Compra · Casa · Chihuahua · Hasta $15M»
  lived_days: number | null; // how long the ficha lived before its exit
};

export type SalidasData = {
  rows: SalidaRow[];
  counts: Record<ExitReason, number>;
  total: number;
};

type UserLite = { id: string; name: string | null; first_name: string | null; last_name: string | null };

const fullName = (u: UserLite | undefined): string | null =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || null : null;

const TYPE_LABELS: Record<string, string> = {
  casa: "Casa",
  departamento: "Departamento",
  terreno: "Terreno",
  oficina: "Oficina",
  local: "Local",
  bodega: "Bodega",
  nave: "Nave",
};

const short = (n: number): string =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}k`
      : `$${n}`;

function summarize(kind: SalidaRow["kind"], s: Snapshot): string {
  const parts: string[] = [];
  // Demand-side direction: on a requerimiento «venta» means the client BUYS.
  if (s.transaction) {
    parts.push(kind === "request" ? (s.transaction === "venta" ? "Compra" : "Renta") : s.transaction === "venta" ? "Venta" : "Renta");
  }
  const types = (s.types ?? []).map((t) => TYPE_LABELS[t] ?? t);
  if (types.length) parts.push(types.join(" / "));
  if (s.states?.length) parts.push(s.states.join(", "));
  if (s.price_max != null) {
    // A property's snapshot carries its fixed price; a request's is a budget.
    parts.push(
      kind === "property"
        ? short(s.price_max)
        : s.price_min != null && s.price_min > 0 && s.price_min !== s.price_max
          ? `${short(s.price_min)} – ${short(s.price_max)}`
          : `Hasta ${short(s.price_max)}`,
    );
  }
  return parts.join(" · ") || "—";
}

export async function fetchSalidas(): Promise<SalidasData> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("exit_surveys")
    .select("id, kind, entity_id, user_id, reason, snapshot, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const raw = data ?? [];

  const userIds = [...new Set(raw.map((r) => r.user_id as string))];
  const { data: users } = userIds.length
    ? await sb.from("users").select("id, name, first_name, last_name").in("id", userIds)
    : { data: [] as UserLite[] };
  const byId = new Map((users ?? []).map((u) => [u.id, u as UserLite]));

  const counts: Record<ExitReason, number> = {
    sold_via_propia: 0,
    sold_outside: 0,
    promotion_ended: 0,
    created_by_error: 0,
  };

  const rows: SalidaRow[] = raw.map((r) => {
    const snapshot = (r.snapshot ?? {}) as Snapshot;
    const reason = r.reason as ExitReason;
    if (reason in counts) counts[reason] += 1;
    const born = snapshot.created_at ? new Date(snapshot.created_at).getTime() : NaN;
    const died = new Date(r.created_at as string).getTime();
    return {
      id: r.id as string,
      kind: r.kind as SalidaRow["kind"],
      reason,
      created_at: r.created_at as string,
      broker_id: r.user_id as string,
      broker_name: fullName(byId.get(r.user_id as string)),
      summary: summarize(r.kind as SalidaRow["kind"], snapshot),
      lived_days: Number.isFinite(born) ? Math.max(0, Math.round((died - born) / 86400000)) : null,
    };
  });

  return { rows, counts, total: rows.length };
}
