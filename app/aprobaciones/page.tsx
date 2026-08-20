import { fetchPendingUsers, type PendingDoc } from "@/lib/aprobaciones";
import { TopNav } from "@/components/TopNav";
import { ApproveButton } from "@/components/ApproveButton";
import { requireRole } from "@/lib/session";
import { initials, avatarColors } from "@/lib/format";
import { profileTypeLabel, tierOf } from "@/lib/profileTypes";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const fmtPhone = (p: string) =>
  p?.startsWith("52") && p.length === 12
    ? `+52 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}`
    : p;

const DOC_LABEL: Record<PendingDoc["key"], string> = {
  constancia: "Constancia",
  ine: "INE",
};

function DocChips({ docs }: { docs: PendingDoc[] }) {
  const keys: PendingDoc["key"][] = ["constancia", "ine"];
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => {
        const doc = docs.find((d) => d.key === k);
        // Uploaded docs are BUTTONS (blue, bordered, arrow — the panel's
        // "clickable" language); missing ones stay quiet gray tags.
        return doc ? (
          <a
            key={k}
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-white px-3 py-1.5 text-sm font-medium text-brand shadow-sm transition hover:-translate-y-px hover:border-brand/50 hover:bg-brand-light hover:shadow"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            Ver {DOC_LABEL[k]}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-60">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        ) : (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-200 px-3 py-1.5 text-sm text-neutral-400"
          >
            {DOC_LABEL[k]} · sin subir
          </span>
        );
      })}
    </div>
  );
}

export default async function AprobacionesPage() {
  await requireRole("admin");

  let rows;
  try {
    rows = await fetchPendingUsers();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="aprobaciones" />
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
      <TopNav active="aprobaciones" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Aprobaciones
          </h1>
          <span className="text-sm text-neutral-500">
            {(() => {
              const p = rows.filter((r) => r.status !== "rejected").length;
              const r = rows.length - p;
              return `${p === 1 ? "1 cuenta pendiente" : `${p} cuentas pendientes`}${r ? ` · ${r} rechazada${r > 1 ? "s" : ""}` : ""}`;
            })()}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="text-sm text-neutral-500">
              No hay cuentas esperando aprobación.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((u) => {
              const c = avatarColors(u.id);
              return (
                <li
                  key={u.id}
                  className={`flex flex-col gap-3 rounded-2xl p-4 shadow-sm ring-1 sm:flex-row sm:items-center sm:gap-4 ${
                    u.status === "rejected"
                      ? "bg-neutral-50/80 ring-black/[0.04]"
                      : "bg-white ring-black/[0.05]"
                  }`}
                >
                  {u.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatar_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]"
                    />
                  ) : (
                    <div
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      {initials(u.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate font-medium text-neutral-900">
                        {u.name ?? "Sin nombre"}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
                          tierOf(u.profile_type) === "asesor"
                            ? "bg-neutral-100 text-neutral-500 ring-neutral-500/10"
                            : "bg-indigo-50 text-indigo-700 ring-indigo-600/10"
                        }`}
                      >
                        {profileTypeLabel(u.profile_type)}
                      </span>
                      {u.company ? (
                        <span className="truncate text-sm text-neutral-500">
                          {u.company}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span className="tabular-nums">{fmtPhone(u.phone)}</span>
                      {u.email ? <span className="truncate">{u.email}</span> : null}
                      {u.states?.length ? <span>{u.states.join(" · ")}</span> : null}
                      <span>{fmtDate(u.created_at)}</span>
                    </div>
                    <div className="mt-2">
                      <DocChips docs={u.docs} />
                    </div>
                    {u.status === "rejected" && u.rejection_reason ? (
                      <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-100">
                        Rechazada: {u.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 self-end sm:self-center">
                    <ApproveButton id={u.id} name={u.name} rejected={u.status === "rejected"} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
