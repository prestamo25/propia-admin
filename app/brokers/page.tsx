import { fetchOverview } from "@/lib/data";
import { StatCard } from "@/components/StatCard";
import { BrokerTable } from "@/components/BrokerTable";
import { TopNav } from "@/components/TopNav";

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

  const { brokers, totals } = data;

  return (
    <div className="min-h-screen">
      <TopNav active="brokers" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Miembros de la red
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Vista general de la red en tiempo real.
          </p>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Miembros"
            value={totals.brokers}
            tint={{ bg: "#e8edff", fg: "#1c4588" }}
            icon={
              <>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </>
            }
          />
          <StatCard
            label="Aprobados"
            value={totals.approved}
            tint={{ bg: "#d8f5e6", fg: "#047857" }}
            icon={
              <>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="m9 11 3 3L22 4" />
              </>
            }
          />
          <StatCard
            label="Pendientes"
            value={totals.pending}
            tint={{ bg: "#fdf0d5", fg: "#b45309" }}
            icon={
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </>
            }
          />
          <StatCard
            label="Propiedades"
            value={totals.properties}
            tint={{ bg: "#ede9fe", fg: "#7c3aed" }}
            icon={
              <>
                <path d="M3 9.5 12 3l9 6.5" />
                <path d="M5 10v10h14V10" />
                <path d="M9 21v-6h6v6" />
              </>
            }
          />
        </section>

        <BrokerTable brokers={brokers} />

        <p className="mt-4 text-xs text-neutral-400">
          MB = almacenamiento en R2 (pendiente de conectar).
        </p>
      </main>
    </div>
  );
}
