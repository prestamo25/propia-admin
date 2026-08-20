import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ReportStatus = "open" | "actioned" | "dismissed";
export type TargetType = "property" | "profile" | "request";

export type ReportRow = {
  id: string;
  target_type: TargetType;
  target_id: string;
  reason: string;
  note: string | null;
  status: ReportStatus;
  created_at: string;
  reporter_id: string;
  reporter_name: string | null;
  owner_name: string | null;
  owner_id: string | null; // the broker behind the reported content (to drill in)
  target_label: string | null; // property name / request title / profile name
};

export type ReportsData = {
  reports: ReportRow[];
  counts: { open: number; actioned: number; dismissed: number; total: number };
};

type UserLite = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
};

const fullName = (u: UserLite | undefined): string | null =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || null : null;

export async function fetchReports(): Promise<ReportsData> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("reports")
    .select("id, reporter_id, target_type, target_id, target_owner_id, reason, note, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    reporter_id: string;
    target_type: TargetType;
    target_id: string;
    target_owner_id: string | null;
    reason: string;
    note: string | null;
    status: ReportStatus;
    created_at: string;
  }[];

  // Phase 1 — resolve property/request targets (so we learn their owners too).
  const propIds = rows.filter((r) => r.target_type === "property").map((r) => r.target_id);
  const reqIds = rows.filter((r) => r.target_type === "request").map((r) => r.target_id);

  const [propsRes, reqsRes] = await Promise.all([
    propIds.length
      ? sb.from("properties").select("id, name, user_id").in("id", propIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; user_id: string }[] }),
    reqIds.length
      ? sb.from("search_requests").select("id, title, created_by").in("id", reqIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; created_by: string }[] }),
  ]);
  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, p]));
  const reqMap = new Map((reqsRes.data ?? []).map((q) => [q.id, q]));

  // Resolve the "owner" broker for each report (denormalized, else derived).
  const ownerOf = (r: (typeof rows)[number]): string | null => {
    if (r.target_owner_id) return r.target_owner_id;
    if (r.target_type === "property") return propMap.get(r.target_id)?.user_id ?? null;
    if (r.target_type === "request") return reqMap.get(r.target_id)?.created_by ?? null;
    if (r.target_type === "profile") return r.target_id;
    return null;
  };

  // Phase 2 — fetch every user we need a name for (reporters + owners + profiles).
  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.reporter_id);
    const o = ownerOf(r);
    if (o) userIds.add(o);
  }
  const usersRes = userIds.size
    ? await sb.from("users").select("id, name, first_name, last_name").in("id", [...userIds])
    : { data: [] as UserLite[] };
  const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u as UserLite]));

  const reports: ReportRow[] = rows.map((r) => {
    const owner_id = ownerOf(r);
    let target_label: string | null = null;
    if (r.target_type === "property") target_label = propMap.get(r.target_id)?.name ?? "Propiedad eliminada";
    else if (r.target_type === "request") target_label = reqMap.get(r.target_id)?.title ?? "Requerimiento";
    else if (r.target_type === "profile") target_label = fullName(userMap.get(r.target_id)) ?? "Perfil";

    return {
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      note: r.note,
      status: r.status,
      created_at: r.created_at,
      reporter_id: r.reporter_id,
    reporter_name: fullName(userMap.get(r.reporter_id)),
      owner_name: owner_id ? fullName(userMap.get(owner_id)) : null,
      owner_id,
      target_label,
    };
  });

  return {
    reports,
    counts: {
      open: reports.filter((r) => r.status === "open").length,
      actioned: reports.filter((r) => r.status === "actioned").length,
      dismissed: reports.filter((r) => r.status === "dismissed").length,
      total: reports.length,
    },
  };
}

export async function countOpenReports(): Promise<number> {
  try {
    const sb = supabaseAdmin();
    const { count } = await sb
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");
    return count ?? 0;
  } catch {
    return 0;
  }
}
