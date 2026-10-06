import Link from "next/link";
import { VerifyButtons } from "@/components/VerifyButtons";
import type { VerificationEvent, VerificationStatus } from "@/lib/verificaciones";

// «Verificación» on the member dossier (/broker/[id]): current state, the
// one action that makes sense from here, and the history. Approving or
// rejecting a PENDING request happens in /verificaciones, where the INE is
// on screen — never blind from here.

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const STATE: Record<VerificationStatus, { label: string; hint: string; cls: string }> = {
  none: { label: "Sin verificar", hint: "No ha pedido la verificación.", cls: "bg-neutral-100 text-neutral-600 ring-neutral-200" },
  pending: { label: "En revisión", hint: "Subió su INE y espera respuesta.", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  verified: { label: "Verificado", hint: "Lleva la palomita azul en toda la red.", cls: "bg-brand-light text-brand ring-brand/20" },
  rejected: { label: "Rechazado", hint: "Puede volver a subir su INE desde la app.", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  revoked: { label: "Verificación retirada", hint: "Puede volver a pedirla desde la app.", cls: "bg-neutral-100 text-neutral-600 ring-neutral-300" },
};

const KIND: Record<VerificationEvent["kind"], string> = {
  submitted: "Pidió la verificación",
  verified: "Verificado",
  rejected: "Rechazado",
  revoked: "Verificación retirada",
};

export function VerificationCard({
  id,
  name,
  eligible,
  status,
  verifiedAt,
  events,
}: {
  id: string;
  name: string | null;
  // invitado / cliente never get the check (not in the directory).
  eligible: boolean;
  status: VerificationStatus;
  verifiedAt: string | null;
  events: VerificationEvent[];
}) {
  const s = STATE[status];
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${s.cls}`}>
            {status === "verified" ? "✓ " : ""}
            {s.label}
          </span>
          <p className="text-sm text-neutral-500">
            {eligible ? s.hint : "Su tipo de cuenta no lleva verificación (no aparece en el directorio)."}
            {status === "verified" && verifiedAt ? ` Desde ${fmt(verifiedAt)}.` : ""}
          </p>
        </div>
        {status === "verified" ? (
          <VerifyButtons id={id} name={name} mode="verified" />
        ) : status === "pending" ? (
          <Link
            href="/verificaciones"
            className="rounded-lg border border-brand/25 px-3 py-2 text-sm font-medium text-brand transition hover:border-brand/50 hover:bg-brand-light"
          >
            Revisar su INE →
          </Link>
        ) : null}
      </div>
      {events.length ? (
        <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          {events.map((e, i) => (
            <li key={i}>
              <span className="font-medium text-neutral-700">{KIND[e.kind]}</span>
              {` · ${e.actor} · ${fmt(e.created_at)}`}
              {e.reason ? `: ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
