import Link from "next/link";
import { countOpenReports } from "@/lib/reports";
import { getRole } from "@/lib/session";
import { MobileNav } from "@/components/MobileNav";

type NavKey =
  | "brokers"
  | "alta"
  | "envivo"
  | "panorama"
  | "reportes"
  | "salidas"
  | "whatsapp"
  | "almacenamiento"
  | "lifecycle";

export async function TopNav({ active }: { active: NavKey }) {
  const [openReports, role] = await Promise.all([countOpenReports(), getRole()]);
  const isDev = role === "dev";

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
          ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.04]"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt="Propia"
              className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-black/[0.06]"
            />
            <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
              Propia
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                isDev
                  ? "bg-violet-100 text-violet-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {isDev ? "Técnico" : "Admin"}
            </span>
          </div>
          <nav className="hidden items-center gap-1 rounded-xl bg-neutral-200/40 p-1 md:flex">
            {tab("/", "Brokers", "brokers")}
            {tab("/alta", "SMS", "alta")}
            {tab("/en-vivo", "En vivo", "envivo")}
            {tab("/panorama", "Panorama", "panorama")}
            {tab("/reportes", "Reportes", "reportes", openReports)}
            {tab("/salidas", "Salidas", "salidas")}
            {isDev ? (
              <>
                <span className="mx-1 h-4 w-px bg-neutral-300/70" />
                {tab("/whatsapp", "WhatsApp", "whatsapp")}
                {tab("/almacenamiento", "Almacenamiento", "almacenamiento")}
                {tab("/lifecycle", "Ciclo de vida", "lifecycle")}
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
        <MobileNav active={active} isDev={isDev} openReports={openReports} />
      </div>
    </header>
  );
}
