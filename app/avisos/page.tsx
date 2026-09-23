import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BroadcastComposer, type EventOption } from "@/components/BroadcastComposer";

// Avisos masivos (broadcasts-2026-09-21). Nació de que el 09-21 hubo que
// mandar una promo por push a Puebla con un script suelto, porque no existe
// push de texto libre en la app. Franz: «this could become a habit».
//
// ⚠ Hoy el aviso llega SÓLO a la pantalla de bloqueo: no queda en la
// campanita, porque sin un tipo de aviso en la app se vería como un tipo
// desconocido. El apagador `notif_avisos` ya se respeta en el envío; su
// switch en Ajustes llega con un OTA posterior.
export const dynamic = "force-dynamic";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

type Sent = {
  id: string;
  body: string;
  audience: { state?: string | null; tier?: string | null } | null;
  devices: number | null;
  people: number | null;
  ok: number | null;
  failed: number | null;
  sent_by: string | null;
  created_at: string;
};

export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; tier?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const estado = sp.estado?.trim() || "";
  const tier = sp.tier === "free" || sp.tier === "premium" ? sp.tier : "";

  const sb = supabaseAdmin();
  const [{ data: aud }, { data: evs }, { data: hist }] = await Promise.all([
    sb.rpc("broadcast_audience", { p_state: estado || null, p_tier: tier || null }),
    sb
      .from("events")
      .select("id, title, start_at")
      .gt("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(20),
    sb
      .from("broadcasts")
      .select("id, body, audience, devices, people, ok, failed, sent_by, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const row = Array.isArray(aud) ? aud[0] : aud;
  const count = { devices: row?.devices ?? 0, people: row?.people ?? 0 };
  const events: EventOption[] = ((evs ?? []) as { id: string; title: string; start_at: string }[]).map(
    (e) => ({ id: e.id, title: e.title, when: fmtWhen(e.start_at) }),
  );
  const sent = (hist ?? []) as Sent[];

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav active="avisos" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-lg font-semibold text-neutral-900">Avisos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Un push a muchos a la vez. Llega a la pantalla de bloqueo; todavía no queda en la campanita.
        </p>

        <div className="mt-5">
          <BroadcastComposer estado={estado} tier={tier} count={count} events={events} />
        </div>

        <h2 className="mt-10 text-sm font-semibold text-neutral-900">Enviados</h2>
        {sent.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Todavía no se ha mandado ninguno desde aquí.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sent.map((b) => (
              <li key={b.id} className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-soft">
                <div className="text-sm text-neutral-900">{b.body}</div>
                <div className="mt-1.5 text-[11px] text-neutral-500">
                  {fmtWhen(b.created_at)}
                  {" · "}
                  {b.audience?.state ?? "toda la red"}
                  {b.audience?.tier ? ` · ${b.audience.tier === "free" ? "sin Premium" : "Premium"}` : ""}
                  {" · "}
                  <span className="tabular-nums">{(b.ok ?? 0).toLocaleString("es-MX")}</span> entregados de{" "}
                  <span className="tabular-nums">{(b.devices ?? 0).toLocaleString("es-MX")}</span>
                  {b.failed ? ` · ${b.failed} fallaron` : ""}
                  {b.sent_by ? ` · ${b.sent_by}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
