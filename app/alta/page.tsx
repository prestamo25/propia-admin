import { TopNav } from "@/components/TopNav";
import { RescueOtpCard } from "@/components/RescueOtpCard";

export const dynamic = "force-dynamic";

export default function AltaPage() {
  return (
    <div className="min-h-screen">
      <TopNav active="alta" />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            ¿No le llega el código?
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Activa el rescate para su número: el broker pide el código otra vez
            en la app y escribe{" "}
            <span className="font-mono font-semibold text-neutral-700">
              123456
            </span>
            . Se registra o entra igual que siempre — solo que sin esperar el
            SMS.
          </p>
        </div>

        <RescueOtpCard />
      </main>
    </div>
  );
}
