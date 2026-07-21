import { fetchReports, type ReportsData } from "@/lib/reports";
import { ReportsQueue } from "@/components/ReportsQueue";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  let data: ReportsData;
  try {
    data = await fetchReports();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="reportes" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav active="reportes" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Reportes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Contenido reportado por la red. Revisa y actúa.
          </p>
        </div>
        <ReportsQueue data={data} />
      </main>
    </div>
  );
}
