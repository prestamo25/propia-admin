import Link from "next/link";
import { countOpenReports } from "@/lib/reports";
import { countPendingUsers } from "@/lib/aprobaciones";
import { countPendingVerifications } from "@/lib/verificaciones";
import { getRole } from "@/lib/session";
import { MobileNav } from "@/components/MobileNav";
import { countFor, navFor, type NavCounts, type NavKey, type NavLink } from "@/lib/nav";

// Grouped nav (2026-09-28): Inicio · Miembros · Aprobaciones · Verificaciones (10-06) · Reportes ·
// Eventos ▾ · Avisos · Datos ▾ · Técnico ▾ — the entries live in lib/nav.ts.
// The old fold-into-«Más» tiers are gone: below navmd (1000px) the tabs just
// tighten (px-2, no brand word / role badge / «Grupo · Página» hint, Salir →
// icon) so all eight fit down to navsm (840px). A group's trigger carries the
// sum of its badges. Below navsm = MobileNav drawer.

// Build stamp baked in by deploy-admin.sh — shown at the foot of the
// «Técnico» menu so what is live is never a guess (same values as
// /api/version).
const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME
  ? new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(process.env.NEXT_PUBLIC_BUILD_TIME))
  : null;

const ACTIVE = "bg-white text-brand shadow-sm ring-1 ring-black/[0.04]";
const IDLE = "text-neutral-500 hover:text-neutral-800";

const chevron = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="transition group-focus-within:rotate-180 group-hover:rotate-180"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export async function TopNav({ active }: { active: NavKey }) {
  const [openReports, pendingUsers, pendingVerifications, role] = await Promise.all([
    countOpenReports(),
    countPendingUsers(),
    countPendingVerifications(),
    getRole(),
  ]);
  const counts: NavCounts = { openReports, pendingUsers, pendingVerifications };
  const isDev = role === "dev";
  const roleBadge =
    role === "dev"
      ? { label: "Técnico", cls: "bg-violet-100 text-violet-700" }
      : role === "mariana"
        ? { label: "Mariana", cls: "bg-sky-100 text-sky-700" }
        : { label: "Admin", cls: "bg-neutral-100 text-neutral-500" };

  const badge = (n: number, extra = "") =>
    n > 0 ? (
      <span
        className={`grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white ${extra}`}
      >
        {n}
      </span>
    ) : null;

  const tab = (l: NavLink) => (
    <Link
      key={l.key}
      href={l.href}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition navmd:px-3 ${
        active === l.key ? ACTIVE : IDLE
      }`}
    >
      {l.label}
      {badge(countFor(l, counts))}
    </Link>
  );

  const menuItem = (l: NavLink) => (
    <Link
      key={l.key}
      href={l.href}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
        active === l.key
          ? "bg-neutral-100 text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {l.label}
      {badge(countFor(l, counts), "ml-auto")}
    </Link>
  );

  // CSS-only hover/focus dropdown. With `href` it's a split button: the name
  // is a link to the group's main page (click-through, no extra click) and
  // the ▾ is a real button — clicking it focuses it, so the menu stays open
  // until focus leaves. Hover over either half opens the menu too.
  const dropdown = (
    id: string,
    label: string,
    items: NavLink[],
    href?: string,
    footer?: React.ReactNode,
  ) => {
    const current = items.find((l) => l.key === active);
    const total = items.reduce((n, l) => n + countFor(l, counts), 0);
    const tone = current ? "text-brand" : "text-neutral-500 group-hover:text-neutral-800";
    const name = (
      <>
        {label}
        {current && current.label !== label ? (
          <span className="hidden font-normal text-neutral-400 navmd:inline">
            · {current.label}
          </span>
        ) : null}
        {badge(total)}
      </>
    );
    return (
      <div key={id} className="group relative">
        <div
          className={`inline-flex items-center whitespace-nowrap rounded-lg text-sm font-medium transition ${
            current ? ACTIVE : ""
          }`}
        >
          {href ? (
            <>
              <Link
                href={href}
                className={`inline-flex items-center gap-1.5 py-1.5 pl-2 pr-1 transition navmd:pl-3 ${tone}`}
              >
                {name}
              </Link>
              <button
                type="button"
                aria-haspopup="menu"
                aria-label={`Más de ${label}`}
                className={`grid cursor-default place-items-center self-stretch rounded-r-lg pl-0.5 pr-2 transition navmd:pr-2.5 ${tone}`}
              >
                {chevron}
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-haspopup="menu"
              className={`inline-flex cursor-default items-center gap-1.5 px-2 py-1.5 transition navmd:px-3 ${tone}`}
            >
              {name}
              {chevron}
            </button>
          )}
        </div>
        <div className="invisible absolute left-0 top-full z-30 pt-1.5 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
          <div className="min-w-44 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/[0.06]">
            {items.map(menuItem)}
            {footer}
          </div>
        </div>
      </div>
    );
  };

  const buildStamp = (
    <>
      <div className="mx-2 my-1 h-px bg-neutral-100" />
      <div className="px-3 py-1.5 text-[11px] tabular-nums text-neutral-400" title="Build en producción">
        build {BUILD_COMMIT}
        {BUILD_TIME ? ` · ${BUILD_TIME}` : ""}
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/65 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 transition hover:opacity-80"
              aria-label="Inicio"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="Propia"
                className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-black/[0.06]"
              />
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900 navsm:hidden navmd:inline">
                Propia
              </span>
            </Link>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium hidden navmd:inline ${roleBadge.cls}`}
            >
              {roleBadge.label}
            </span>
          </div>
          <nav className="hidden items-center gap-0.5 rounded-xl navmd:gap-1 bg-neutral-200/40 p-1 navsm:flex">
            {navFor(isDev).map((e) =>
              e.kind === "link" ? (
                tab(e)
              ) : e.devOnly ? (
                <div key={e.id} className="flex items-center">
                  <span className="mx-1 h-4 w-px bg-neutral-300/70" />
                  {dropdown(e.id, e.label, e.items, e.href, buildStamp)}
                </div>
              ) : (
                dropdown(e.id, e.label, e.items, e.href)
              ),
            )}
          </nav>
        </div>
        <div className="hidden shrink-0 items-center navsm:flex">
          <a
            href="/api/logout"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800 navmd:inline-block"
          >
            Salir
          </a>
          <a
            href="/api/logout"
            title="Salir"
            aria-label="Salir"
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800 navmd:hidden"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </a>
        </div>
        <MobileNav
          active={active}
          isDev={isDev}
          roleBadge={roleBadge}
          openReports={openReports}
          pendingUsers={pendingUsers}
          pendingVerifications={pendingVerifications}
        />
      </div>
    </header>
  );
}
