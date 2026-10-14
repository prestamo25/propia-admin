import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countPendingUsers } from "@/lib/aprobaciones";
import { countPendingVerifications } from "@/lib/verificaciones";
import { countOpenReports } from "@/lib/reports";
import { countGeoReview } from "@/lib/geoReview";
import type { Role } from "@/lib/auth";

// «Atención hoy» (Franz 2026-10-14, UI/UX batch A): the first thing on Inicio
// — everything waiting on someone from the team, one line each, linking to
// where it gets done. Before, it was spread over nav badges, a «Necesita una
// mano» box further down, and the «Ubicaciones dudosas» queue no one but the
// técnico could see. A quiet day says so in one line.

export type AtencionItem = {
  key: string;
  tone: "rose" | "amber" | "sky" | "neutral";
  text: string;
  href: string;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export async function fetchAtencion(input: {
  role: Role;
  receiptsWaiting: number;
  emptyUpcoming: { id: string; title: string }[];
}): Promise<AtencionItem[]> {
  const sb = supabaseAdmin();
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const grants = input.role === "admin" || input.role === "dev";
  const owner = input.role === "dev";

  const [users, ine, reports, geo, expiring, team] = await Promise.all([
    countPendingUsers(),
    countPendingVerifications(),
    countOpenReports(),
    countGeoReview(),
    grants
      ? sb
          .from("admin_access")
          .select("id", { count: "exact", head: true })
          .eq("rol", "regional")
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .lt("expires_at", weekAhead)
          .then(({ count }) => count ?? 0)
      : Promise.resolve(0),
    owner
      ? sb
          .from("admin_access")
          .select("alias, user:users(first_name, name)")
          .neq("rol", "regional")
          .is("revoked_at", null)
          .is("last_login_at", null)
          .then(({ data }) => (data ?? []) as unknown as { alias: string | null; user: { first_name: string | null; name: string | null } | null }[])
      : Promise.resolve([]),
  ]);

  const items: AtencionItem[] = [];
  if (reports) items.push({ key: "reportes", tone: "rose", href: "/reportes", text: plural(reports, "reporte abierto", "reportes abiertos") });
  if (users) items.push({ key: "aprobaciones", tone: "amber", href: "/aprobaciones", text: `${plural(users, "cuenta espera", "cuentas esperan")} aprobación` });
  if (ine) items.push({ key: "verificaciones", tone: "amber", href: "/verificaciones", text: `${plural(ine, "INE", "INE")} por revisar` });
  if (geo) items.push({ key: "ubicaciones", tone: "sky", href: "/ubicaciones", text: `${plural(geo, "ubicación dudosa", "ubicaciones dudosas")} por decidir` });
  if (input.receiptsWaiting) {
    items.push({
      key: "comprobantes",
      tone: "neutral",
      href: "/eventos",
      text: `${plural(input.receiptsWaiting, "comprobante de pago espera", "comprobantes de pago esperan")} al organizador`,
    });
  }
  for (const e of input.emptyUpcoming) {
    items.push({ key: `vacio-${e.id}`, tone: "neutral", href: `/eventos/${e.id}`, text: `«${e.title}» todavía no tiene inscritos` });
  }
  if (expiring) {
    items.push({ key: "accesos", tone: "sky", href: "/accesos", text: `${plural(expiring, "acceso regional vence", "accesos regionales vencen")} esta semana` });
  }
  for (const t of team) {
    const who = t.alias || t.user?.first_name || t.user?.name || "Alguien del equipo";
    items.push({ key: `equipo-${who}`, tone: "neutral", href: "/accesos", text: `${who} todavía no entra al panel con su teléfono` });
  }
  return items;
}
