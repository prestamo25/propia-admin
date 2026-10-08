// One source of truth for the admin nav — TopNav (desktop) and MobileNav
// (drawer) both render from here, so the two never drift apart.
//
// Grouped 2026-09-28 (Franz: "there are a lot, maybe categorize them"): the
// flat row had grown to 12 tabs + «Técnico» and only fit thanks to a
// fold-into-«Más» breakpoint system. A 6-item version was "too little", so:
// daily pages and the two badge queues (Aprobaciones, Reportes) stay tabs;
// only occasional pages go into Eventos ▾ / Datos ▾. URLs are unchanged.

export type NavKey =
  | "inicio"
  | "brokers"
  | "aprobaciones"
  | "verificaciones"
  | "eventos"
  | "alta"
  | "envivo"
  | "panorama"
  | "reportes"
  | "salidas"
  | "whatsapp"
  | "almacenamiento"
  | "lifecycle"
  | "zonas"
  | "mapa"
  | "ubicaciones"
  | "avisos"
  | "rifas"
  | "desarrollos";

export type NavCounts = { pendingUsers: number; openReports: number; pendingVerifications: number };

export type NavLink = {
  key: NavKey;
  href: string;
  label: string;
  badge?: keyof NavCounts;
};

// A top-level entry: a plain link, or a group rendered as a dropdown
// (desktop) / a titled section (mobile).
export type NavEntry =
  | ({ kind: "link" } & NavLink)
  | {
      kind: "group";
      id: string;
      label: string;
      items: NavLink[];
      // Click-through: the group's name opens this page, the ▾ opens the menu.
      href?: string;
      devOnly?: boolean;
    };

export const NAV: NavEntry[] = [
  { kind: "link", key: "inicio", href: "/", label: "Inicio" },
  { kind: "link", key: "brokers", href: "/brokers", label: "Miembros" },
  {
    kind: "link",
    key: "aprobaciones",
    href: "/aprobaciones",
    label: "Aprobaciones",
    badge: "pendingUsers",
  },
  {
    kind: "link",
    key: "verificaciones",
    href: "/verificaciones",
    label: "Verificaciones",
    badge: "pendingVerifications",
  },
  {
    kind: "link",
    key: "reportes",
    href: "/reportes",
    label: "Reportes",
    badge: "openReports",
  },
  {
    kind: "group",
    id: "eventos",
    label: "Eventos",
    href: "/eventos",
    items: [
      { key: "eventos", href: "/eventos", label: "Eventos" },
      { key: "envivo", href: "/en-vivo", label: "En vivo" },
      { key: "rifas", href: "/rifas", label: "Rifas" },
    ],
  },
  { kind: "link", key: "avisos", href: "/avisos", label: "Avisos" },
  // Constructora developments (app 2.0.0; pilot since 2026-10-07).
  { kind: "link", key: "desarrollos", href: "/desarrollos", label: "Desarrollos" },
  {
    kind: "group",
    id: "datos",
    label: "Datos",
    href: "/panorama",
    items: [
      { key: "panorama", href: "/panorama", label: "Panorama" },
      { key: "salidas", href: "/salidas", label: "Salidas" },
      { key: "mapa", href: "/mapa", label: "Mapa" },
      { key: "zonas", href: "/zonas", label: "Zonas" },
    ],
  },
  {
    kind: "group",
    id: "tecnico",
    label: "Técnico",
    devOnly: true,
    items: [
      { key: "whatsapp", href: "/whatsapp", label: "WhatsApp" },
      { key: "almacenamiento", href: "/almacenamiento", label: "Almacenamiento" },
      { key: "lifecycle", href: "/lifecycle", label: "Ciclo de vida" },
      { key: "ubicaciones", href: "/ubicaciones", label: "Ubicaciones" },
    ],
  },
];

export const navFor = (isDev: boolean) =>
  NAV.filter((e) => e.kind === "link" || !e.devOnly || isDev);

export const countFor = (l: NavLink, counts: NavCounts) =>
  l.badge ? counts[l.badge] : 0;
