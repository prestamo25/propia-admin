import { supabaseAdmin } from "./supabaseAdmin";
import { pageAll } from "./pageAll";

// «Verificado» review (verificacion-asesor-2026-10-06): a member — asesor or
// proveedor, never invitado/cliente — asks for the blue check from the app
// with only their INE. The panel shows the INE next to the account so the
// reviewer can compare name and face, and decides through set_verification()
// (the single writer; it logs to verification_events).
//
// INE files live in the PRIVATE `verification-docs` bucket (same as the
// signup docs); the browser only ever gets 10-minute signed URLs.

export type VerificationStatus = "none" | "pending" | "verified" | "rejected" | "revoked";

export type IneFile = {
  name: string;
  url: string;
  // Chrome can't draw HEIC and an <img> can't draw a PDF: those open in a
  // new tab instead of rendering inline.
  inline: boolean;
};

export type VerificationEvent = {
  kind: "submitted" | "verified" | "rejected" | "revoked";
  reason: string | null;
  actor: string;
  created_at: string;
};

export type VerificationRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string;
  avatar_url: string | null;
  profile_type: string;
  created_at: string;
  verification_status: VerificationStatus;
  verification_submitted_at: string | null;
  verified_at: string | null;
  ine: IneFile[];
  // Last decision (reason + who) — for the folded «decididas» list.
  last: VerificationEvent | null;
};

type Base = Omit<VerificationRow, "ine" | "last">;

const COLS =
  "id, name, first_name, last_name, company, phone, avatar_url, profile_type, created_at, verification_status, verification_submitted_at, verified_at";
const SIGNED_URL_TTL = 600; // 10 min — a review session, not a bookmark.
const INLINE_EXT = /\.(jpe?g|png|webp|gif)$/i;

export async function fetchIne(userId: string): Promise<IneFile[]> {
  const sb = supabaseAdmin();
  const { data: files } = await sb.storage
    .from("verification-docs")
    .list(userId, { sortBy: { column: "created_at", order: "asc" } });
  const out: IneFile[] = [];
  for (const f of files ?? []) {
    if (!f.name.startsWith("ine_")) continue;
    const { data: signed } = await sb.storage
      .from("verification-docs")
      .createSignedUrl(`${userId}/${f.name}`, SIGNED_URL_TTL);
    if (signed) out.push({ name: f.name, url: signed.signedUrl, inline: INLINE_EXT.test(f.name) });
  }
  return out;
}

async function lastEvents(ids: string[]): Promise<Map<string, VerificationEvent>> {
  const map = new Map<string, VerificationEvent>();
  if (!ids.length) return map;
  const sb = supabaseAdmin();
  const rows = await pageAll<VerificationEvent & { user_id: string }>(() =>
    sb
      .from("verification_events")
      .select("user_id, kind, reason, actor, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
  );
  for (const r of rows) {
    if (!map.has(r.user_id)) {
      map.set(r.user_id, { kind: r.kind, reason: r.reason, actor: r.actor, created_at: r.created_at });
    }
  }
  return map;
}

// The queue (oldest request first) + the most recent decisions (folded).
export async function fetchVerifications(): Promise<{
  pending: VerificationRow[];
  decided: VerificationRow[];
}> {
  const sb = supabaseAdmin();
  const [pendingRes, decidedRes] = await Promise.all([
    sb
      .from("users")
      .select(COLS)
      .eq("verification_status", "pending")
      .eq("status", "approved")
      .order("verification_submitted_at", { ascending: true }),
    sb
      .from("users")
      .select(COLS)
      .in("verification_status", ["verified", "rejected", "revoked"])
      .order("verification_submitted_at", { ascending: false })
      .limit(40),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (decidedRes.error) throw new Error(decidedRes.error.message);
  const pendingBase = (pendingRes.data ?? []) as Base[];
  const decidedBase = (decidedRes.data ?? []) as Base[];

  const events = await lastEvents([...pendingBase, ...decidedBase].map((u) => u.id));
  const pending = await Promise.all(
    pendingBase.map(async (u) => ({ ...u, ine: await fetchIne(u.id), last: events.get(u.id) ?? null })),
  );
  // Newest decision first; INE not loaded — revoking happens from the list,
  // re-reviewing a rejected one means the person uploads again (→ pending).
  const decided = decidedBase
    .map((u) => ({ ...u, ine: [], last: events.get(u.id) ?? null }))
    .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
  return { pending, decided };
}

// One member's verification state + history, for the dossier (/broker/[id]).
export async function fetchMemberVerification(id: string): Promise<{
  status: VerificationStatus;
  submitted_at: string | null;
  verified_at: string | null;
  events: VerificationEvent[];
} | null> {
  const sb = supabaseAdmin();
  const [{ data: u }, { data: ev }] = await Promise.all([
    sb
      .from("users")
      .select("verification_status, verification_submitted_at, verified_at")
      .eq("id", id)
      .maybeSingle(),
    sb
      .from("verification_events")
      .select("kind, reason, actor, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (!u) return null;
  return {
    status: u.verification_status as VerificationStatus,
    submitted_at: u.verification_submitted_at,
    verified_at: u.verified_at,
    events: (ev ?? []) as VerificationEvent[],
  };
}

// Nav badge: requests waiting for a decision.
export async function countPendingVerifications(): Promise<number> {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("verification_status", "pending")
    .eq("status", "approved");
  return count ?? 0;
}
