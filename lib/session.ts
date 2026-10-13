import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  verifySessionToken,
  roleCan,
  type Role,
  type Session,
} from "@/lib/auth";

// The session the cookie proves (staff role or regional grant), once per request.
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
});

// Current STAFF role (server-side), or null — also null for a regional session,
// so every `roleCan(role, …)` gate in the app refuses regional viewers by
// default; the few screens they may see opt in through lib/access.ts.
export async function getRole(): Promise<Role | null> {
  const s = await getSession();
  return s?.kind === "staff" ? s.role : null;
}

// Gate a page to a minimum role. dev is a superuser (sees everything); admin is
// limited to what it's granted. Redirects to /login if unauthenticated, to /
// (the shared home) if authenticated but not permitted, and a regional viewer
// to their own landing.
export async function requireRole(needs: Role): Promise<Role> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind === "regional") redirect("/regional");
  if (!roleCan(s.role, needs)) redirect("/");
  return s.role;
}
