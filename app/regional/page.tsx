import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getRegional, homeOf } from "@/lib/access";

export const dynamic = "force-dynamic";

// Landing for a regional session (acceso regional, 2026-10-13): login, the
// logo and any path outside the grant land here, and it forwards to the first
// section the grant includes. Staff never need it.
export default async function RegionalHome() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind === "password" || s.equipo) redirect("/");
  const access = await getRegional();
  if (!access) redirect("/api/logout?motivo=vencido");
  redirect(homeOf(access));
}
