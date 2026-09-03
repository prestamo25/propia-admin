import Link from "next/link";
import { countOpenReports } from "@/lib/reports";
import { countPendingUsers } from "@/lib/aprobaciones";
import { getRole } from "@/lib/session";
import { MobileNav } from "@/components/MobileNav";

type NavKey =
  | "inicio"
  | "brokers"
  | "aprobaciones"
  | "eventos"
  | "alta"
  | "envivo"
  | "panorama"
  | "reportes"
  | "salidas"
  | "whatsapp"
  | "almacenamiento"
  | "lifecycle"
  | "zonas";

// The tab row folds from the right into a «Más» menu as the window narrows
// (Franz 2026-09-03: his everyday window is ~960px wide and the row
// overflowed — "SalidasSalirZonas" piled up and the brand read "Pro").
// Tiers are the `nav*` breakpoints in globals.css, set from the measured
// width of the real row (brand 154 + row 912 + Salir 52 + gaps ≈ 1,154px):
//   navlg ≥ 1240px  everything is a tab; brand word, «Técnico ▾», «Salir» text
//   navmd ≥ 1000px  Salidas · Zonas · Técnico fold into «Más»; Salir → icon;
//                    the brand word goes (logo + role badge stay)
//   navsm ≥  890px  Panorama folds too
//   md     ≥  768px  Reportes folds too (its badge moves onto «Más»); no badge
// Pure CSS: every foldable item renders twice (tab + menu row) and the
// breakpoint variants pick which copy shows — no measuring, no hydration
// flash, and TopNav stays a server component. Below md = MobileNav drawer.
type Tier = "sm" | "md" | "lg";

// Static class strings (Tailwind's scanner needs them literal).
const TAB_AT: Record<Tier, string> = {
  sm: "hidden navsm:inline-flex",
  md: "hidden navmd:inline-flex",
  lg: "hidden navlg:inline-flex",
};
const MENU_BELOW: Record<Tier, string> = {
  sm: "navsm:hidden",
  md: "navmd:hidden",
  lg: "navlg:hidden",
};
const ACTIVE = "bg-white text-brand shadow-sm ring-1 ring-black/[0.04]";
// «Más» looks active only while the active page is folded inside it.
const ACTIVE_BELOW: Record<Tier, string> = {
  sm: "max-navsm:bg-white max-navsm:text-brand max-navsm:shadow-sm max-navsm:ring-1 max-navsm:ring-black/[0.04]",
  md: "max-navmd:bg-white max-navmd:text-brand max-navmd:shadow-sm max-navmd:ring-1 max-navmd:ring-black/[0.04]",
  lg: ACTIVE, // the «Más» trigger itself only exists below navlg
};

type Item = {
  href: string;
  label: string;
  key: NavKey;
  tier?: Tier; // a tab from this breakpoint up; folded into «Más» below it
  badge?: number;
};

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
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export async function TopNav({ active }: { active: NavKey }) {
  const [openReports, pendingUsers, role] = await Promise.all([
    countOpenReports(),
    countPendingUsers(),
    getRole(),
  ]);
  const isDev = role === "dev";
  const roleBadge =
    role === "dev"
      ? { label: "Técnico", cls: "bg-violet-100 text-violet-700" }
      : role === "mariana"
        ? { label: "Mariana", cls: "bg-sky-100 text-sky-700" }
        : { label: "Admin", cls: "bg-neutral-100 text-neutral-500" };

  const main: Item[] = [
    { href: "/", label: "Inicio", key: "inicio" },
    { href: "/brokers", label: "Miembros", key: "brokers" },
    {
      href: "/aprobaciones",
      label: "Aprobaciones",
      key: "aprobaciones",
      badge: pendingUsers,
    },
    { href: "/eventos", label: "Eventos", key: "eventos" },
    { href: "/en-vivo", label: "En vivo", key: "envivo" },
    { href: "/panorama", label: "Panorama", key: "panorama", tier: "md" },
    {
      href: "/reportes",
      label: "Reportes",
      key: "reportes",
      tier: "sm",
      badge: openReports,
    },
    { href: "/salidas", label: "Salidas", key: "salidas", tier: "lg" },
    { href: "/zonas", label: "Zonas", key: "zonas", tier: "lg" },
  ];
  // The three dev tools live behind ONE nav item (Franz 2026-08-20: the tab
  // row got too wide): «Técnico ▾» at navlg, a section inside «Más» below.
  const dev: Item[] = [
    { href: "/whatsapp", label: "WhatsApp", key: "whatsapp", tier: "lg" },
    {
      href: "/almacenamiento",
      label: "Almacenamiento",
      key: "almacenamiento",
      tier: "lg",
    },
    { href: "/lifecycle", label: "Ciclo de vida", key: "lifecycle", tier: "lg" },
  ];
  const folded = main.filter((i) => i.tier);
  const activeMain = main.find((i) => i.key === active);
  const devActive = dev.some((i) => i.key === active);
  const moreActive = activeMain?.tier
    ? ACTIVE_BELOW[activeMain.tier]
    : devActive
      ? ACTIVE
      : "";

  const badge = (n: number | undefined, extra = "") =>
    n && n > 0 ? (
      <span
        className={`grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white ${extra}`}
      >
        {n}
      </span>
    ) : null;

  const tab = (i: Item) => (
    <Link
      key={i.key}
      href={i.href}
      className={`${i.tier ? TAB_AT[i.tier] : "inline-flex"} items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active === i.key ? ACTIVE : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {i.label}
      {badge(i.badge)}
    </Link>
  );

  // Menu row. `tiered` rows hide themselves once their tab is back in the
  // row; the «Técnico ▾» dropdown's rows are untiered (that menu only
  // exists at navlg, where every dev tool is folded by definition).
  const menuItem = (i: Item, tiered: boolean) => (
    <Link
      key={i.key}
      href={i.href}
      className={`${tiered && i.tier ? MENU_BELOW[i.tier] : ""} flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
        active === i.key
          ? "bg-neutral-100 text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {i.label}
      {badge(i.badge, "ml-auto")}
    </Link>
  );

  // CSS-only hover/focus dropdown (shared by «Más» and «Técnico»). The
  // trigger is a real button so a click focuses it and the menu stays open
  // until focus leaves — hover alone works too.
  const dropdown = (
    trigger: React.ReactNode,
    triggerCls: string,
    body: React.ReactNode,
    align: "left" | "right",
  ) => (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="menu"
        className={`inline-flex cursor-default items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${triggerCls}`}
      >
        {trigger}
        {chevron}
      </button>
      <div
        className={`invisible absolute top-full z-30 pt-1.5 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        <div className="min-w-44 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/[0.06]">
          {body}
        </div>
      </div>
    </div>
  );

  const devSectionLabel = (
    <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      Técnico
    </div>
  );
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
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900 md:hidden navlg:inline">
                Propia
              </span>
            </Link>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium md:hidden navsm:inline ${roleBadge.cls}`}
            >
              {roleBadge.label}
            </span>
          </div>
          <nav className="hidden items-center gap-1 rounded-xl bg-neutral-200/40 p-1 md:flex">
            {main.map(tab)}
            {isDev ? (
              <div className="hidden items-center navlg:flex">
                <span className="mx-1 h-4 w-px bg-neutral-300/70" />
                {dropdown(
                  "Técnico",
                  devActive
                    ? ACTIVE
                    : "text-neutral-500 group-hover:text-neutral-800",
                  <>
                    {dev.map((i) => menuItem(i, false))}
                    {buildStamp}
                  </>,
                  "left",
                )}
              </div>
            ) : null}
            <div className="navlg:hidden">
              {dropdown(
                <>
                  Más
                  {folded.map((i) =>
                    i.badge && i.badge > 0 ? (
                      <span key={i.key} className={MENU_BELOW[i.tier!]}>
                        {badge(i.badge)}
                      </span>
                    ) : null,
                  )}
                </>,
                moreActive || "text-neutral-500 group-hover:text-neutral-800",
                <>
                  {folded.map((i) => menuItem(i, true))}
                  {isDev ? (
                    <>
                      <div className="mx-2 my-1 h-px bg-neutral-100" />
                      {devSectionLabel}
                      {dev.map((i) => menuItem(i, true))}
                      {buildStamp}
                    </>
                  ) : null}
                </>,
                "right",
              )}
            </div>
          </nav>
        </div>
        <div className="hidden shrink-0 items-center md:flex">
          <a
            href="/api/logout"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800 navlg:inline-block"
          >
            Salir
          </a>
          <a
            href="/api/logout"
            title="Salir"
            aria-label="Salir"
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800 navlg:hidden"
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
        />
      </div>
    </header>
  );
}
