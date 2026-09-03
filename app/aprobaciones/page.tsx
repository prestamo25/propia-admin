import { fetchPendingUsers, type PendingDoc, type PendingUser } from "@/lib/aprobaciones";
import { TopNav } from "@/components/TopNav";
import { ApproveButton } from "@/components/ApproveButton";
import { requireRole } from "@/lib/session";
import { initials, avatarColors } from "@/lib/format";
import { profileDetails, profileTypeLabel, tierOf } from "@/lib/profileTypes";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

// «hace 3 h» / «hace 2 días» — the queue's real currency. Pablo promised
// «en menos de 24 h», so anything older gets the amber treatment.
const DAY_MS = 86_400_000;
const sinceLabel = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
};
const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > DAY_MS;

// One-tap WhatsApp to the applicant with the context already typed. The
// api.whatsapp.com form keeps accents intact on desktop Chrome (wa.me
// mangles them). No emoji in the prefill for the same reason.
const waLink = (phone: string, text: string) =>
  `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;

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

function Row({ u }: { u: PendingUser }) {
  const c = avatarColors(u.id);
  // What they said they do. «Otros» carries its giro in the tag itself —
  // that word IS the category for that bucket.
  const details = profileDetails(u.profile_type, u.profile_data);
  const giro = u.profile_type === "otros" ? details.find((d) => d.key === "giro") : undefined;
  const rest = details.filter((d) => d !== giro);
  const rejected = u.status === "rejected";
  const stale = !rejected && isStale(u.created_at);
  const first = u.name?.split(" ")[0] ?? "";
  const tipo = profileTypeLabel(u.profile_type);
  const hello = `Hola ${first}, te escribo de Propia por tu registro como ${tipo}.`;
  const askDocs = `Hola ${first}, te escribo de Propia. Para aprobar tu cuenta como ${tipo} necesitamos tu constancia de situación fiscal y tu INE. ¿Nos los compartes por aquí o los subes en la app desde tu pantalla de espera? Gracias.`;
  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl p-4 shadow-sm ring-1 sm:flex-row sm:items-center sm:gap-4 ${
        rejected
          ? "bg-neutral-50/80 ring-black/[0.04]"
          : stale
            ? "bg-amber-50/40 ring-amber-300/60"
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
          <span className="truncate font-medium text-neutral-900">{u.name ?? "Sin nombre"}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
              tierOf(u.profile_type) === "asesor"
                ? "bg-neutral-100 text-neutral-500 ring-neutral-500/10"
                : "bg-indigo-50 text-indigo-700 ring-indigo-600/10"
            }`}
          >
            {profileTypeLabel(u.profile_type)}
            {giro ? ` · ${giro.value}` : ""}
          </span>
          {u.company ? <span className="truncate text-sm text-neutral-500">{u.company}</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <a
            href={waLink(u.phone, hello)}
            target="_blank"
            rel="noreferrer"
            title="Escribirle por WhatsApp"
            className="inline-flex items-center gap-1 tabular-nums text-brand underline-offset-2 hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
            {fmtPhone(u.phone)}
          </a>
          {u.email ? <span className="truncate">{u.email}</span> : null}
          {u.states?.length ? <span>{u.states.join(" · ")}</span> : null}
          <span>{fmtDate(u.created_at)}</span>
          {!rejected ? (
            <span className={stale ? "font-medium text-amber-700" : ""}>
              {sinceLabel(u.created_at)}
              {stale ? " · más de 24 h" : ""}
            </span>
          ) : null}
        </div>
        {rest.length > 0 ? (
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            {rest.map((d) => (
              <div key={d.key} className="flex min-w-0 max-w-full gap-1">
                <dt className="shrink-0 text-neutral-400">{d.label}:</dt>
                {d.href ? (
                  <dd className="truncate">
                    <a href={d.href} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                      {d.value}
                    </a>
                  </dd>
                ) : (
                  <dd className="min-w-0 break-words text-neutral-700">{d.value}</dd>
                )}
              </div>
            ))}
          </dl>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DocChips docs={u.docs} />
          {!rejected && u.docs.length < 2 ? (
            <a
              href={waLink(u.phone, askDocs)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-light"
            >
              Pedir documentos por WhatsApp
            </a>
          ) : null}
        </div>
        {u.duplicates.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {u.duplicates.map((d) => (
              <a
                key={d.id}
                href={`/brokers?q=${encodeURIComponent(d.name ?? d.company ?? "")}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
                title="Ver en Miembros"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                ¿Duplicado? Ya existe <span className="font-medium">{d.name ?? d.company}</span> ·{" "}
                {profileTypeLabel(d.profile_type)} ({d.via === "empresa" ? "misma empresa" : `mismo ${d.via}`})
              </a>
            ))}
          </div>
        ) : null}
        {rejected ? (
          <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-inset ring-rose-100">
            Rechazada
            {u.reviewed_by ? ` por ${u.reviewed_by}` : ""}
            {u.reviewed_at ? ` · ${fmtDate(u.reviewed_at)}` : ""}
            {u.rejection_reason ? `: ${u.rejection_reason}` : ""}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 self-end sm:self-center">
        <ApproveButton id={u.id} name={u.name} profileType={u.profile_type} rejected={rejected} />
      </div>
    </li>
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

  // Oldest first — a queue, not a feed. Past-24 h rows are tinted amber.
  const pendingRows = rows
    .filter((r) => r.status !== "rejected")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Newest decision first; folded away so the queue stays the page.
  const rejectedRows = rows
    .filter((r) => r.status === "rejected")
    .sort((a, b) => (b.reviewed_at ?? b.created_at).localeCompare(a.reviewed_at ?? a.created_at));
  const stale = pendingRows.filter((r) => isStale(r.created_at)).length;

  return (
    <div className="min-h-screen">
      <TopNav active="aprobaciones" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Aprobaciones</h1>
          <span className="text-sm text-neutral-500">
            {pendingRows.length === 1 ? "1 cuenta pendiente" : `${pendingRows.length} cuentas pendientes`}
            {stale ? (
              <>
                {" · "}
                <span className="font-medium text-amber-700">
                  {stale} con más de 24 h
                </span>
              </>
            ) : null}
          </span>
        </div>

        {pendingRows.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-black/[0.05]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="text-sm text-neutral-500">No hay cuentas esperando aprobación.</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {pendingRows.map((u) => (
              <Row key={u.id} u={u} />
            ))}
          </ul>
        )}

        {rejectedRows.length ? (
          <details className="group mt-8">
            <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
              {rejectedRows.length === 1 ? "1 rechazada" : `${rejectedRows.length} rechazadas`}
              <span className="font-normal text-neutral-400">· se pueden reconsiderar o aprobar como otro tipo</span>
            </summary>
            <ul className="mt-3 space-y-3">
              {rejectedRows.map((u) => (
                <Row key={u.id} u={u} />
              ))}
            </ul>
          </details>
        ) : null}
      </main>
    </div>
  );
}
