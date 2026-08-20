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

export type PendingUser = {
  id: string;
  profile_type: string;
  status: string | null;
  rejection_reason: string | null;
  name: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  states: string[] | null;
  avatar_url: string | null;
  created_at: string;
  docs: PendingDoc[];
};

type Row = Omit<PendingUser, "docs">;

const SIGNED_URL_TTL = 600; // 10 min — a review session, not a bookmark.

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const sb = supabaseAdmin();
  const rows = await pageAll<Row>(() =>
    sb
      .from("users")
      .select("id, name, company, phone, email, states, avatar_url, created_at, profile_type, status, rejection_reason")
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false }),
  );

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
      return { ...u, docs };
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
