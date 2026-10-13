import { fetchOverview, type BrokerRow } from "@/lib/data";
import { BrokerTable, type MemberStats } from "@/components/BrokerTable";
import { TopNav } from "@/components/TopNav";
import { requireViewer, type Access } from "@/lib/access";
import { tierOf } from "@/lib/profileTypes";
import { isTeamAccount } from "@/lib/team";

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

// Acceso regional (Pablo 2026-10-13: «the members only chihuahua»): approved,
// unblocked asesores and service providers — the people the app itself shows
// the network; clientes and invitados never appear in its directory — who
// list one of the viewer's estados (Propia's own team and test accounts left
// out), with everything the
// team keeps to itself stripped HERE — whatever a server component hands to
// BrokerTable is readable in the page payload, hidden or not. No email, plan
// or premium, WhatsApp opt-in, devices or block state; the phone only if the
// grant says so (the app already lets any broker reach any other on WhatsApp).
function forRegional(brokers: BrokerRow[], a: Access): BrokerRow[] {
  return brokers
    .filter(
      (b) =>
        b.status === "approved" &&
        !b.blocked &&
        !isTeamAccount(b.id, b.phone) &&
        (tierOf(b.profile_type) === "asesor" || tierOf(b.profile_type) === "servicios") &&
        b.states.some((s) => a.estados.includes(s)),
    )
    .map((b) => ({
      ...b,
      phone: a.verTelefonos ? b.phone : null,
      email: null,
      whatsapp_opt_in: false,
      mb_used: null,
      premium: false,
      comped: false,
      plan_source: null,
      plan_expires_at: null,
      platforms: [],
    }));
}

// Always fetch fresh — this is an ops view, never cache it.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const viewer = await requireViewer("miembros");

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

  const brokers = viewer.kind === "regional" ? forRegional(data.brokers, viewer.access) : data.brokers;

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="brokers" />
      <BrokerTable
        brokers={brokers}
        stats={memberStats(brokers)}
        limited={viewer.kind === "regional" ? { estados: viewer.access.estados } : null}
      />
    </div>
  );
}
