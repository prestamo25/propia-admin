import { fetchOverview, type BrokerRow } from "@/lib/data";
import { BrokerTable, type MemberStats } from "@/components/BrokerTable";
import { TopNav } from "@/components/TopNav";

// Cards you'd act on (2026-09-28) — the old ones (Miembros / Aprobados /
// Pendientes / Propiedades) repeated the tab counts: 1,536 of 1,537 are
// approved, and pending already has its badge on «Aprobaciones».
function memberStats(brokers: BrokerRow[]): MemberStats {
  const now = Date.now();
  const within = (iso: string | null, days: number) =>
    !!iso && now - new Date(iso).getTime() <= days * 86_400_000;
  return {
    nuevos: brokers.filter((b) => within(b.created_at, 7)).length,
    activos: brokers.filter((b) => within(b.last_active, 7)).length,
    nunca: brokers.filter((b) => !b.last_active).length,
    conInventario: brokers.filter((b) => b.inventory > 0).length,
  };
}

// Always fetch fresh — this is an ops view, never cache it.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;
  try {
    data = await fetchOverview();
  } catch (e) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {e instanceof Error ? e.message : "Error desconocido."}
        </p>
        <p className="mt-4 text-sm text-neutral-500">
          Revisa SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno.
        </p>
      </main>
    );
  }

  const { brokers } = data;

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="brokers" />
      <BrokerTable
        brokers={brokers}
        stats={memberStats(brokers)}
      />
    </div>
  );
}
