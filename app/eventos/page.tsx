import { fetchEvents } from "@/lib/eventos";
import { EventsTable } from "@/components/EventsTable";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";

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

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="eventos" />
      <EventsTable events={events} />
    </div>
  );
}
