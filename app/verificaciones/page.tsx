import Link from "next/link";
import { fetchVerifications, type IneFile, type VerificationRow } from "@/lib/verificaciones";
import { TopNav } from "@/components/TopNav";
import { VerifyButtons } from "@/components/VerifyButtons";
import { requireRole } from "@/lib/session";
import { avatarColors, fmtPhone, initials } from "@/lib/format";
import { profileTypeLabel, tierOf } from "@/lib/profileTypes";

export const dynamic = "force-dynamic";

// «Verificaciones» (verificacion-asesor-2026-10-06): the blue check. A member
// uploads their INE in the app and lands here; the reviewer compares the INE
// with the account (name + photo) and decides. The app promises «Lo
// revisamos en menos de 24 h», so anything older is tinted amber — same
// queue language as /aprobaciones.

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

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
// Seeded rows (INE uploaded at signup, before this feature existed) never
// asked — the 24 h promise starts with a real request from the app.
const isSeeded = (u: VerificationRow) => !!u.last?.actor.startsWith("semilla");
const isStale = (u: VerificationRow) =>
  !isSeeded(u) &&
  !!u.verification_submitted_at &&
  Date.now() - new Date(u.verification_submitted_at).getTime() > DAY_MS;

const waLink = (phone: string, text: string) =>
  `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;

// The name the INE should show: first + last as typed at signup, falling
// back to the display name.
const legalName = (u: VerificationRow) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.name || "Sin nombre";

function Avatar({ u, size }: { u: VerificationRow; size: "lg" | "sm" }) {
  const c = avatarColors(u.id);
  const cls = size === "lg" ? "h-20 w-20 text-lg" : "h-9 w-9 text-xs";
  return u.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={u.avatar_url} alt="" className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]`} />
  ) : (
    <div
      className={`${cls} grid shrink-0 place-items-center rounded-full font-semibold`}
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {initials(u.name)}
    </div>
  );
}

function TypePill({ type }: { type: string }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
        tierOf(type) === "asesor"
          ? "bg-neutral-100 text-neutral-500 ring-neutral-500/10"
          : "bg-indigo-50 text-indigo-700 ring-indigo-600/10"
      }`}
    >
      {profileTypeLabel(type)}
    </span>
  );
}

function IneView({ files }: { files: IneFile[] }) {
  if (!files.length) {
    // Shouldn't happen (request_verification() requires an INE) unless the
    // file was replaced/removed after asking — say so instead of a blank.
    return (
      <div className="grid h-40 w-full place-items-center rounded-xl border border-dashed border-rose-200 bg-rose-50/40 px-4 text-center text-xs text-rose-700 sm:w-64">
        No encontramos la INE en su carpeta. Recházala con «Otro» pidiéndole que la vuelva a subir.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) =>
        f.inline ? (
          <a
            key={f.name}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            title="Abrir en grande"
            className="group relative block overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/[0.06]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={`INE ${i + 1}`} className="h-40 w-auto max-w-[18rem] object-contain transition group-hover:scale-[1.02]" />
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
              Abrir en grande ↗
            </span>
          </a>
        ) : (
          <a
            key={f.name}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="grid h-40 w-48 place-items-center rounded-xl border border-brand/25 bg-white px-4 text-center text-sm font-medium text-brand shadow-sm transition hover:border-brand/50 hover:bg-brand-light"
          >
            <span>
              Abrir INE ↗
              <span className="mt-1 block text-[11px] font-normal text-neutral-500">
                {f.name.toLowerCase().endsWith(".pdf") ? "PDF" : "HEIC · se abre en Safari / Vista Previa"}
              </span>
            </span>
          </a>
        ),
      )}
    </div>
  );
}

function PendingRow({ u }: { u: VerificationRow }) {
  const stale = isStale(u);
  const seeded = isSeeded(u);
  const first = (u.first_name || u.name || "").split(" ")[0];
  const hello = `Hola ${first}, te escribo de Propia por la verificación de tu cuenta.`;
  return (
    <li
      className={`flex flex-col gap-4 rounded-2xl p-4 shadow-sm ring-1 lg:flex-row lg:items-center ${
        stale ? "bg-amber-50/40 ring-amber-300/60" : "bg-white ring-black/[0.05]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-4 lg:w-72 lg:shrink-0">
        <Avatar u={u} size="lg" />
        <div className="min-w-0">
          <Link href={`/broker/${u.id}`} className="block truncate font-medium text-neutral-900 underline-offset-2 hover:underline">
            {legalName(u)}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <TypePill type={u.profile_type} />
            {u.company ? <span className="truncate text-xs text-neutral-500">{u.company}</span> : null}
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
            <a
              href={waLink(u.phone, hello)}
              target="_blank"
              rel="noreferrer"
              className="tabular-nums text-brand underline-offset-2 hover:underline"
            >
              {fmtPhone(u.phone)}
            </a>
            <span>Miembro desde {fmtDate(u.created_at)}</span>
            {seeded ? (
              <span className="text-neutral-400">
                INE de su registro
                {u.verification_submitted_at ? ` · ${fmtDate(u.verification_submitted_at)}` : ""}
              </span>
            ) : u.verification_submitted_at ? (
              <span className={stale ? "font-medium text-amber-700" : ""}>
                Pidió {sinceLabel(u.verification_submitted_at)}
                {stale ? " · más de 24 h" : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <IneView files={u.ine} />
      </div>
      <div className="shrink-0 self-end lg:self-center">
        <VerifyButtons id={u.id} name={legalName(u)} mode="pending" />
      </div>
    </li>
  );
}

const DECIDED: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verificado", cls: "bg-brand-light text-brand ring-brand/20" },
  rejected: { label: "Rechazado", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  revoked: { label: "Verificación retirada", cls: "bg-neutral-100 text-neutral-600 ring-neutral-300" },
};

function DecidedRow({ u }: { u: VerificationRow }) {
  const s = DECIDED[u.verification_status];
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/[0.05] sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar u={u} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/broker/${u.id}`} className="truncate text-sm font-medium text-neutral-900 underline-offset-2 hover:underline">
              {legalName(u)}
            </Link>
            <TypePill type={u.profile_type} />
            {s ? <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${s.cls}`}>{s.label}</span> : null}
          </div>
          {u.last ? (
            <p className="mt-0.5 text-xs text-neutral-500">
              {u.last.actor} · {fmtStamp(u.last.created_at)}
              {u.last.reason ? `: ${u.last.reason}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      {u.verification_status === "verified" ? (
        <div className="shrink-0 self-end sm:self-center">
          <VerifyButtons id={u.id} name={legalName(u)} mode="verified" />
        </div>
      ) : null}
    </li>
  );
}

export default async function VerificacionesPage() {
  await requireRole("admin");

  let data;
  try {
    data = await fetchVerifications();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="verificaciones" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">{e instanceof Error ? e.message : "Error desconocido."}</p>
        </main>
      </div>
    );
  }

  const { pending, decided } = data;
  const stale = pending.filter(isStale).length;

  return (
    <div className="min-h-screen">
      <TopNav active="verificaciones" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Verificaciones</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Compara la INE con el nombre y la foto de la cuenta. Verificado = palomita azul en toda la red.
            </p>
          </div>
          <span className="text-sm text-neutral-500">
            {pending.length === 1 ? "1 pendiente" : `${pending.length} pendientes`}
            {stale ? (
              <>
                {" · "}
                <span className="font-medium text-amber-700">{stale} con más de 24 h</span>
              </>
            ) : null}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-black/[0.05]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-light text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="mt-2 text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="text-sm text-neutral-500">No hay verificaciones esperando.</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {pending.map((u) => (
              <PendingRow key={u.id} u={u} />
            ))}
          </ul>
        )}

        {decided.length ? (
          <details className="group mt-8">
            <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
              Decididas recientemente ({decided.length})
              <span className="font-normal text-neutral-400">· desde aquí se puede quitar una verificación</span>
            </summary>
            <ul className="mt-3 space-y-2">
              {decided.map((u) => (
                <DecidedRow key={u.id} u={u} />
              ))}
            </ul>
          </details>
        ) : null}
      </main>
    </div>
  );
}
