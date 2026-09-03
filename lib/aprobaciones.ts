import { supabaseAdmin } from "./supabaseAdmin";
import { pageAll } from "./pageAll";

// Pending-account review (proveedores/asesores awaiting approval) plus their
// verification documents. Docs live in the PRIVATE `verification-docs` bucket
// (owner-scoped RLS on the app side); the panel reads them with the secret key
// and hands the browser short-lived signed URLs — never public paths.

export type PendingDoc = {
  key: "constancia" | "ine";
  name: string;
  url: string;
};

// An approved member whose name, company or email matches a pending signup —
// the «Cuenta duplicada» reject reason exists, this is what lets the reviewer
// actually spot one.
export type Duplicate = {
  id: string;
  name: string | null;
  company: string | null;
  profile_type: string;
  via: "nombre" | "empresa" | "correo";
};

export type PendingUser = {
  id: string;
  profile_type: string;
  status: string | null;
  rejection_reason: string | null;
  // Who decided and when (panel role label / Telegram first name / «la
  // persona» for the self-service invitado switch); stamped by the DB.
  reviewed_at: string | null;
  reviewed_by: string | null;
  name: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  states: string[] | null;
  avatar_url: string | null;
  created_at: string;
  // What the account said it does — the signup's extra fields (giro,
  // descripción, sitio web, cédula…) keyed exactly as the app stores them.
  profile_data: Record<string, unknown> | null;
  docs: PendingDoc[];
  duplicates: Duplicate[];
};

type Row = Omit<PendingUser, "docs" | "duplicates">;
type Approved = { id: string; name: string | null; company: string | null; email: string | null; profile_type: string };

// Accent-insensitive, case-insensitive, whitespace-collapsed key.
const norm = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function findDuplicates(u: Row, approved: Approved[]): Duplicate[] {
  const name = norm(u.name);
  const company = norm(u.company);
  const email = norm(u.email);
  const out: Duplicate[] = [];
  for (const a of approved) {
    if (a.id === u.id) continue;
    const via: Duplicate["via"] | null =
      email && norm(a.email) === email
        ? "correo"
        : name.length >= 6 && norm(a.name) === name
          ? "nombre"
          : company.length >= 4 && norm(a.company) === company
            ? "empresa"
            : null;
    if (via) out.push({ id: a.id, name: a.name, company: a.company, profile_type: a.profile_type, via });
    if (out.length === 3) break;
  }
  return out;
}

const SIGNED_URL_TTL = 600; // 10 min — a review session, not a bookmark.

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const sb = supabaseAdmin();
  const rows = await pageAll<Row>(() =>
    sb
      .from("users")
      .select("id, name, company, phone, email, states, avatar_url, created_at, profile_type, status, rejection_reason, reviewed_at, reviewed_by, profile_data")
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false }),
  );

  // One read of the approved roster (~1k rows) beats three lookups per row.
  const approved = rows.length
    ? await pageAll<Approved>(() =>
        sb.from("users").select("id, name, company, email, profile_type").eq("status", "approved"),
      )
    : [];

  return Promise.all(
    rows.map(async (u) => {
      const { data: files } = await sb.storage
        .from("verification-docs")
        .list(u.id);
      const docs: PendingDoc[] = [];
      for (const f of files ?? []) {
        const key = f.name.startsWith("constancia_")
          ? ("constancia" as const)
          : f.name.startsWith("ine_")
            ? ("ine" as const)
            : null;
        if (!key) continue;
        const { data: signed } = await sb.storage
          .from("verification-docs")
          .createSignedUrl(`${u.id}/${f.name}`, SIGNED_URL_TTL);
        if (signed) docs.push({ key, name: f.name, url: signed.signedUrl });
      }
      return { ...u, docs, duplicates: findDuplicates(u, approved) };
    }),
  );
}

// Nav badge counts only what needs a decision — rejected accounts are done.
export async function countPendingUsers(): Promise<number> {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
