import Link from "next/link";
import { countOpenReports } from "@/lib/reports";
import { countPendingUsers } from "@/lib/aprobaciones";
import { getRole } from "@/lib/session";
import { MobileNav } from "@/components/MobileNav";

type NavKey =
  | "inicio"
  | "brokers"
  | "aprobaciones"
  | "alta"
  | "envivo"
  | "panorama"
  | "reportes"
  | "salidas"
  | "whatsapp"
  | "almacenamiento"
  | "lifecycle"
  | "zonas";

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

  const devActive = ["whatsapp", "almacenamiento", "lifecycle", "zonas"].includes(active);

  const menuItem = (href: string, label: string, key: NavKey) => (
    <Link
      key={key}
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
        active === key
          ? "bg-neutral-100 text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {label}
    </Link>
  );

  const tab = (
    href: string,
    label: string,
    key: NavKey,
    badge?: number,
  ) => (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active === key
          ? "bg-white text-brand shadow-sm ring-1 ring-black/[0.04]"
          : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {label}
      {badge && badge > 0 ? (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/65 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex items-center gap-2.5">
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
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
                Propia
              </span>
            </Link>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${roleBadge.cls}`}
            >
              {roleBadge.label}
            </span>
          </div>
          <nav className="hidden items-center gap-1 rounded-xl bg-neutral-200/40 p-1 md:flex">
            {tab("/", "Inicio", "inicio")}
            {tab("/brokers", "Miembros", "brokers")}
            {tab("/aprobaciones", "Aprobaciones", "aprobaciones", pendingUsers)}
            {tab("/en-vivo", "En vivo", "envivo")}
            {tab("/panorama", "Panorama", "panorama")}
            {tab("/reportes", "Reportes", "reportes", openReports)}
            {tab("/salidas", "Salidas", "salidas")}
            {isDev ? (
              <>
                <span className="mx-1 h-4 w-px bg-neutral-300/70" />
                {/* The three dev tools live behind ONE nav item (Franz
                    2026-08-20: the tab row got too wide). CSS-only hover/
                    focus dropdown — TopNav stays a server component. */}
                <div className="group relative">
                  <span
                    className={`inline-flex cursor-default items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      devActive
                        ? "bg-white text-brand shadow-sm ring-1 ring-black/[0.04]"
                        : "text-neutral-500 group-hover:text-neutral-800"
                    }`}
                  >
                    Técnico
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                  <div className="invisible absolute left-0 top-full z-30 pt-1.5 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <div className="min-w-44 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/[0.06]">
                      {menuItem("/whatsapp", "WhatsApp", "whatsapp")}
                      {menuItem("/almacenamiento", "Almacenamiento", "almacenamiento")}
                      {menuItem("/lifecycle", "Ciclo de vida", "lifecycle")}
                      {menuItem("/zonas", "Zonas", "zonas")}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </nav>
        </div>
        <a
          href="/api/logout"
          className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800 md:inline-block"
        >
          Salir
        </a>
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
