import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Windows mirror the lifecycle-sweep Edge Function.
export const NUDGE_DAY = 25;
export const GRAY_DAY = 30;
export const ARCHIVE_DAY = 37;
export const PURGE_DAY = 67;

export type LifeRow = {
  id: string;
  name: string | null;
  owner: string | null;
  brokerId: string;
  lifecycle: string;
  idleDays: number | null;
  archived: boolean;
  daysUntilGray: number | null;
};

export type LifecycleData = {
  counts: { total: number; active: number; stale: number; archived: number; manual: number };
  nextSweep: { gray: LifeRow[]; archive: LifeRow[]; purge: LifeRow[] };
  watch: LifeRow[];
};

const DAY = 86400000;

export async function fetchLifecycle(): Promise<LifecycleData> {
  const sb = supabaseAdmin();

  // Paged: properties passed 1,000 rows (PostgREST's per-response cap) —
  // an unpaged read here undercounts every lifecycle bucket.
  const data = await pageAll<Record<string, unknown>>(() =>
    sb
      .from("properties")
      .select("id, name, user_id, lifecycle, renewed_at, archived_at"),
  );

  const rows = data as {
    id: string;
    name: string | null;
    user_id: string;
    lifecycle: string | null;
    renewed_at: string | null;
    archived_at: string | null;
  }[];

  const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const usersRes = uids.length
    ? await sb.from("users").select("id, name, first_name, last_name").in("id", uids)
    : { data: [] as { id: string; name: string | null; first_name: string | null; last_name: string | null }[] };
  const nameOf = new Map(
    (usersRes.data ?? []).map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || null,
    ]),
  );

  const now = Date.now();
  const mapped: LifeRow[] = rows.map((r) => {
    const idle = r.renewed_at ? Math.floor((now - new Date(r.renewed_at).getTime()) / DAY) : null;
    const lifecycle = r.lifecycle ?? "active";
    const archived = !!r.archived_at;
    return {
      id: r.id,
      name: r.name,
      owner: nameOf.get(r.user_id) ?? null,
      brokerId: r.user_id,
      lifecycle,
      idleDays: idle,
      archived,
      daysUntilGray:
        lifecycle === "active" && !archived && idle != null ? Math.max(0, GRAY_DAY - idle) : null,
    };
  });

  const active = mapped.filter((r) => r.lifecycle === "active" && !r.archived);
  const stale = mapped.filter((r) => r.lifecycle === "stale" && !r.archived);
  const archived = mapped.filter((r) => r.lifecycle === "archived" && !r.archived);
  const manual = mapped.filter((r) => r.archived);

  const byIdleDesc = (a: LifeRow, b: LifeRow) => (b.idleDays ?? 0) - (a.idleDays ?? 0);

  return {
    counts: {
      total: rows.length,
      active: active.length,
      stale: stale.length,
      archived: archived.length,
      manual: manual.length,
    },
    nextSweep: {
      gray: active.filter((r) => r.idleDays != null && r.idleDays >= GRAY_DAY).sort(byIdleDesc),
      archive: stale.filter((r) => r.idleDays != null && r.idleDays >= ARCHIVE_DAY).sort(byIdleDesc),
      purge: archived.filter((r) => r.idleDays != null && r.idleDays >= PURGE_DAY).sort(byIdleDesc),
    },
    watch: [...active].filter((r) => r.idleDays != null).sort(byIdleDesc).slice(0, 12),
  };
}
