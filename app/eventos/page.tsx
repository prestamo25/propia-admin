import { fetchEvents } from "@/lib/eventos";
import { EventsTable } from "@/components/EventsTable";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { isPast } from "@/lib/eventos";

export const dynamic = "force-dynamic";

export default async function EventosPage() {
  await requireRole("admin");

  let events;
  try {
    events = await fetchEvents();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="eventos" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">{e instanceof Error ? e.message : "Error desconocido."}</p>
        </main>
      </div>
    );
  }

  const upcoming = events.filter((e) => !isPast(e));
  const privados = events.filter((e) => e.visibility === "private").length;
  const seats = events.reduce((n, e) => n + e.counts.registered, 0);
  const attended = events.reduce((n, e) => n + e.counts.attended, 0);

  return (
    <div className="min-h-screen">
      <TopNav active="eventos" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Eventos</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Todos los eventos de la red, privados incluidos. Entra a uno para ver a sus participantes y quién los escaneó.
            </p>
          </div>
          <div className="flex gap-4 text-sm text-neutral-500">
            <span><span className="font-semibold text-neutral-900">{events.length}</span> eventos</span>
            <span><span className="font-semibold text-neutral-900">{upcoming.length}</span> próximos</span>
            <span><span className="font-semibold text-neutral-900">{privados}</span> privados</span>
            <span><span className="font-semibold text-neutral-900">{attended}</span> asistencias de {seats} inscritos</span>
          </div>
        </div>
        <EventsTable events={events} />
      </main>
    </div>
  );
}
