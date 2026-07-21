import { TopNav } from "@/components/TopNav";
import { LiveBoard } from "@/components/LiveBoard";

export const dynamic = "force-dynamic";

// Live registration board — built for event nights (Cumbre 2026-07-21):
// leave it open on a laptop and watch signups land as brokers register.
export default function EnVivoPage() {
  return (
    <div className="min-h-screen">
      <TopNav active="envivo" />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            En vivo
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Registros en tiempo real — se actualiza solo cada 5 segundos.
          </p>
        </div>

        <LiveBoard />
      </main>
    </div>
  );
}
