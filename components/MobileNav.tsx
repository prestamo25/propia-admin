"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const emptySubscribe = () => () => {};

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

type Item = {
  href: string;
  label: string;
  key: NavKey;
  icon: React.ReactNode;
  badge?: number;
};

const STROKE = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MobileNav({
  active,
  isDev,
  openReports,
}: {
  active: NavKey;
  isDev: boolean;
  openReports: number;
}) {
  const [open, setOpen] = useState(false);
  // Portal target only exists client-side; false during SSR/hydration.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Lock page scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const main: Item[] = [
    {
      href: "/",
      label: "Brokers",
      key: "brokers",
      icon: (
        <svg {...STROKE}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      href: "/alta",
      label: "SMS",
      key: "alta",
      icon: (
        <svg {...STROKE}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      ),
    },
    {
      href: "/en-vivo",
      label: "En vivo",
      key: "envivo",
      icon: (
        <svg {...STROKE}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
        </svg>
      ),
    },
    {
      href: "/panorama",
      label: "Panorama",
      key: "panorama",
      icon: (
        <svg {...STROKE}>
          <line x1="12" x2="12" y1="20" y2="10" />
          <line x1="18" x2="18" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="16" />
        </svg>
      ),
    },
    {
      href: "/reportes",
      label: "Reportes",
      key: "reportes",
      badge: openReports,
      icon: (
        <svg {...STROKE}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" x2="4" y1="22" y2="15" />
        </svg>
      ),
    },
    {
      href: "/salidas",
      label: "Salidas",
      key: "salidas",
      icon: (
        <svg {...STROKE}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
      ),
    },
  ];

  const dev: Item[] = [
    {
      href: "/whatsapp",
      label: "WhatsApp",
      key: "whatsapp",
      icon: (
        <svg {...STROKE}>
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      ),
    },
    {
      href: "/almacenamiento",
      label: "Almacenamiento",
      key: "almacenamiento",
      icon: (
        <svg {...STROKE}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5V19A9 3 0 0 0 21 19V5" />
          <path d="M3 12A9 3 0 0 0 21 12" />
        </svg>
      ),
    },
    {
      href: "/lifecycle",
      label: "Ciclo de vida",
      key: "lifecycle",
      icon: (
        <svg {...STROKE}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
  ];

  const item = (i: Item) => {
    const isActive = active === i.key;
    return (
      <Link
        key={i.key}
        href={i.href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition ${
          isActive
            ? "bg-brand-light text-brand"
            : "text-neutral-600 active:bg-neutral-100"
        }`}
      >
        <span className={isActive ? "text-brand" : "text-neutral-400"}>
          {i.icon}
        </span>
        {i.label}
        {i.badge && i.badge > 0 ? (
          <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">
            {i.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 ring-1 ring-neutral-200 transition active:bg-neutral-100"
      >
        <svg {...STROKE}>
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {/* The sticky header's backdrop-blur creates a CSS containing block, so
          fixed elements inside it would anchor to the header — portal the
          overlay to <body> to escape it. */}
      {mounted
        ? createPortal(
            <div className="md:hidden">
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] transform flex-col bg-white shadow-lift transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3.5">
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
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition active:bg-neutral-100"
          >
            <svg {...STROKE}>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {main.map(item)}
          {isDev ? (
            <>
              <div className="px-3.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Técnico
              </div>
              {dev.map(item)}
            </>
          ) : null}
        </nav>

        <div className="border-t border-neutral-100 p-3">
          <a
            href="/api/logout"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-neutral-600 transition active:bg-neutral-100"
          >
            <span className="text-neutral-400">
              <svg {...STROKE}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </span>
            Cerrar sesión
          </a>
        </div>
      </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
