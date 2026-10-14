import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtStamp } from "@/lib/eventos";
import { fmtPhone } from "@/lib/format";

// «Actividad del equipo» (Franz 2026-10-13, «i'm the top admin»): every change
// someone on the team made through the panel — approvals, blocks, Premium,
// zones, notifications, raffles, test-OTP pairs, verifications, access — with
// who did it. Written by lib/audit.ts from every server action; kept a year.
// The dueño's view only.
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  actor: string;
  accion: string;
  objetivo_tipo: string | null;
  objetivo_id: string | null;
  objetivo: string | null;
  detalle: Record<string, unknown> | null;
  at: string;
};

const VERB: Record<string, string> = {
  aprobar: "aprobó a",
  aprobar_como: "aprobó con otro tipo a",
  rechazar: "rechazó a",
  bloquear: "bloqueó a",
  desbloquear: "desbloqueó a",
  premium: "dio Premium a",
  quitar_premium: "quitó Premium a",
  reporte: "cambió un reporte",
  otp_rescate_agregar: "activó el código de rescate para",
  otp_rescate_quitar: "quitó el código de rescate de",
  alta_manual: "dio de alta a",
  zona_crear: "creó la zona",
  zona_dibujar: "dibujó la zona",
  zona_editar: "editó la zona",
  zona_borrar: "borró la zona",
  zona_ignorar_nombre: "descartó el nombre",
  zona_reemplazar_en_requerimientos: "movió requerimientos de la zona",
  ubicacion_aceptar: "aceptó una ubicación sugerida",
  ubicacion_mantener: "dejó una ubicación como estaba",
  aviso: "mandó el aviso",
  rifa: "sacó un ganador en la rifa",
  verificar: "verificó a",
  verificacion_rechazar: "rechazó la verificación de",
  verificacion_quitar: "quitó la verificación de",
  propuesta_aprobada: "aprobó una propuesta de zona",
  propuesta_descartada: "descartó una propuesta de zona",
  propuesta_pendiente: "reabrió una propuesta de zona",
  veredicto_aplicado: "aplicó un veredicto de zona",
  veredicto_reabierto: "reabrió un veredicto de zona",
  acceso_regional: "dio acceso regional a",
  acceso_quitar: "quitó el acceso de",
  acceso_restaurar: "deshizo el retiro del acceso de",
  acceso_renovar: "renovó el acceso de",
  equipo_rol: "cambió el rol en el equipo de",
  equipo_quitar: "sacó del equipo a",
  sesiones_cerradas: "cerró las sesiones de",
  desbloquear_login: "desbloqueó el login de",
};

// The few detail fields worth a glance, in plain words.
function resumen(r: Row): string {
  const d = r.detalle ?? {};
  const parts: string[] = [];
  if (typeof d.motivo === "string" && d.motivo) parts.push(`motivo: ${d.motivo}`);
  if (typeof d.vence === "string") parts.push(`hasta ${new Date(d.vence).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric" })}`);
  if (typeof d.nota === "string" && d.nota) parts.push(`«${d.nota}»`);
  if (typeof d.tipo === "string") parts.push(`como ${d.tipo}`);
  if (typeof d.status === "string") parts.push(d.status);
  if (typeof d.rol === "string") parts.push(`rol ${d.rol}`);
  if (Array.isArray(d.estados)) parts.push((d.estados as string[]).join(", "));
  if (typeof d.estado === "string" && d.estado) parts.push(d.estado);
  if (typeof d.movidas === "number" && d.movidas) parts.push(`${d.movidas} propiedades movidas`);
  if (typeof d.movidos === "number" && d.movidos) parts.push(`${d.movidos} requerimientos movidos`);
  if (typeof d.enviados === "number") parts.push(`${d.enviados} enviados`);
  if (typeof d.ganador === "string") parts.push(`ganó ${d.ganador}`);
  if (typeof d.dias === "number") parts.push(`${d.dias} días`);
  return parts.join(" · ");
}

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ quien?: string }>;
}) {
  await requireRole("dev");
  const { quien } = await searchParams;
  const sb = supabaseAdmin();

  const q = sb
    .from("admin_audit")
    .select("id, actor, accion, objetivo_tipo, objetivo_id, objetivo, detalle, at")
    .order("at", { ascending: false })
    .limit(300);
  const [{ data, error }, { data: actorRows }] = await Promise.all([
    quien ? q.eq("actor", quien) : q,
    sb.from("admin_audit").select("actor").order("at", { ascending: false }).limit(1000),
  ]);
  const rows = (data ?? []) as Row[];
  const actores = [...new Set(((actorRows ?? []) as { actor: string }[]).map((r) => r.actor))];

  // Member names for the rows that point at a member.
  const ids = [...new Set(rows.filter((r) => r.objetivo_tipo === "miembro" && r.objetivo_id).map((r) => r.objetivo_id!))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await sb.from("users").select("id, name").in("id", ids);
    for (const u of (us ?? []) as { id: string; name: string | null }[]) names.set(u.id, u.name ?? "Sin nombre");
  }

  const objetivo = (r: Row) => {
    if (r.objetivo_tipo === "miembro" && r.objetivo_id) {
      return (
        <Link href={`/broker/${r.objetivo_id}`} className="font-medium text-neutral-900 hover:text-brand">
          {names.get(r.objetivo_id) ?? r.objetivo ?? "un miembro"}
        </Link>
      );
    }
    if (r.objetivo_tipo === "telefono" && r.objetivo_id) return <span className="tabular-nums">{fmtPhone(r.objetivo_id)}</span>;
    if (r.objetivo) return <span className="font-medium text-neutral-900">{r.objetivo}</span>;
    if (r.objetivo_tipo === "zona" && r.objetivo_id) return <span className="font-medium text-neutral-900">{r.objetivo_id}</span>;
    return null;
  };

  return (
    <div className="min-h-screen">
      <TopNav active="actividad" />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Actividad del equipo</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Cada cambio que alguien del equipo hizo desde el panel, y quién lo hizo. Se guarda un año.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/actividad"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${!quien ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"}`}
          >
            Todos
          </Link>
          {actores.map((a) => (
            <Link
              key={a}
              href={`/actividad?quien=${encodeURIComponent(a)}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${quien === a ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"}`}
            >
              {a}
            </Link>
          ))}
        </div>

        {error ? (
          <p className="mt-6 text-sm text-rose-600">{error.message}</p>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-6 py-10 text-center text-sm text-neutral-400">
            Todavía no hay cambios registrados. Se empiezan a guardar desde el 13 de octubre de 2026.
          </div>
        ) : (
          <ol className="mt-6 divide-y divide-neutral-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
            {rows.map((r) => {
              const extra = resumen(r);
              return (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-neutral-400">{fmtStamp(r.at)}</span>
                  <span className="font-semibold text-neutral-900">{r.actor}</span>
                  <span className="text-neutral-600">{VERB[r.accion] ?? r.accion}</span>
                  {objetivo(r)}
                  {extra ? <span className="basis-full pl-[7.75rem] text-xs text-neutral-400">{extra}</span> : null}
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
