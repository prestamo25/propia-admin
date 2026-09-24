import { TopNav } from "@/components/TopNav";
import { RaffleDraw, type RaffleEvent } from "@/components/RaffleDraw";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EVENT_TYPE_LABEL, fmtWhen } from "@/lib/eventos";

// Rifas (Franz 2026-09-24): elegir el evento y sacar un ganador al azar para
// proyectarlo en pantalla. ⚠ Regla de Pablo: esta página NUNCA muestra cuánta
// gente asistió — ni conteos en el selector ni la lista. El sorteo corre en el
// servidor (drawRaffleWinner) y aquí sólo llega el ganador.
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;

// Ventana: lo de las últimas dos semanas y lo que viene en el próximo mes.
// Preselección: el foro más cercano a hoy; si no hay, el evento más cercano.
async function loadEvents(): Promise<{ events: RaffleEvent[]; initialId: string; error: string | null }> {
  const now = Date.now();
  const { data, error } = await supabaseAdmin()
    .from("events")
    .select("id, title, type, start_at, end_at, image_url")
    .gte("start_at", new Date(now - 14 * DAY).toISOString())
    .lte("start_at", new Date(now + 30 * DAY).toISOString())
    .order("start_at", { ascending: false });

  const events: RaffleEvent[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    label: `${EVENT_TYPE_LABEL[e.type] ?? e.type} · ${fmtWhen(e.start_at, e.end_at)}`,
    isForo: e.type === "foro",
    image: e.image_url,
    start: new Date(e.start_at).getTime(),
  }));
  const nearest = (list: RaffleEvent[]) =>
    list.reduce<RaffleEvent | null>(
      (best, e) => (!best || Math.abs(e.start - now) < Math.abs(best.start - now) ? e : best),
      null,
    );
  const initial = nearest(events.filter((e) => e.isForo)) ?? nearest(events);
  return { events, initialId: initial?.id ?? "", error: error?.message ?? null };
}

export default async function RifasPage() {
  await requireRole("admin");
  const { events, initialId, error } = await loadEvents();

  return (
    <div className="min-h-screen">
      <TopNav active="rifas" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-lg font-semibold text-neutral-900">Rifas</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Elige el evento y saca un ganador al azar. Ábrelo en pantalla completa para proyectarlo.
        </p>
        {error ? (
          <p className="mt-6 text-sm text-rose-600">No se pudieron cargar los eventos: {error}</p>
        ) : (
          <div className="mt-5">
            <RaffleDraw events={events} initialId={initialId} />
          </div>
        )}
      </main>
    </div>
  );
}
