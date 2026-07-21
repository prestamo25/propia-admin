import { TopNav } from "@/components/TopNav";
import { AltaManualForm } from "@/components/AltaManualForm";

export const dynamic = "force-dynamic";

export default function AltaPage() {
  return (
    <div className="min-h-screen">
      <TopNav active="alta" />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Alta manual
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Crea acceso inmediato con PIN temporal — sin SMS. Úsalo cuando el
            código no llegue o para registrar brokers en persona.
          </p>
        </div>

        <AltaManualForm />

        <p className="mt-4 text-xs text-neutral-400">
          El alta confirma el teléfono sin verificarlo por SMS: úsala solo con
          brokers cuya identidad conozcas.
        </p>
      </main>
    </div>
  );
}
