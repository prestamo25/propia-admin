// Mirror of the app's profile-type config (src/constants/profileTypes.ts in
// the Propia repo) — labels and tier grouping for users.profile_type. Keep the
// two lists in sync when a type is added.

export const PROFILE_TYPE_LABEL: Record<string, string> = {
  asesor: "Asesor",
  notaria: "Notaría",
  creditos: "Créditos",
  polizas: "Pólizas jurídicas",
  constructor: "Constructor",
  decoracion: "Decoración",
  valuador: "Valuador",
  asociacion: "Asociación",
  educacion: "Educación",
  otros: "Otros",
  cliente: "Cliente",
  invitado: "Invitado",
};

export type Tier = "asesor" | "servicios" | "cliente" | "invitado";

export function tierOf(profileType: string | null | undefined): Tier {
  if (!profileType || profileType === "asesor") return "asesor";
  if (profileType === "cliente") return "cliente";
  // Event-goers (back per Franz 2026-09-01): eventos + servicios in the app.
  if (profileType === "invitado") return "invitado";
  return "servicios";
}

export function profileTypeLabel(profileType: string | null | undefined): string {
  return PROFILE_TYPE_LABEL[profileType ?? "asesor"] ?? profileType ?? "Asesor";
}

// users.profile_data keys the service signup writes (app: onboarding.tsx +
// each type's `extras` in profileTypes.ts), with the labels the form showed.
// Order = how a reviewer reads a card: what they do, then the type's own
// fields, then the pitch and the website.
const PROFILE_DATA_FIELDS: { key: string; label: string; link?: boolean }[] = [
  { key: "giro", label: "Giro" }, // «Otros»: their whole identity
  { key: "numero_notaria", label: "Notaría" },
  { key: "titular", label: "Titular" },
  { key: "auxiliar", label: "Auxiliar" },
  { key: "distrito", label: "Distrito" },
  { key: "cedula", label: "Cédula" },
  { key: "cargo", label: "Cargo" },
  { key: "descripcion", label: "Descripción" },
  { key: "sitio_web", label: "Sitio web", link: true },
];

export type ProfileDetail = { key: string; label: string; value: string; href?: string };

// The non-empty profile_data fields of a service account, ready to render.
// Unknown keys are kept (prettified) so a field added in the app never goes
// unseen here; empty strings and nulls are dropped.
export function profileDetails(
  profileType: string | null | undefined,
  data: Record<string, unknown> | null | undefined,
): ProfileDetail[] {
  if (!data || tierOf(profileType) !== "servicios") return [];
  const out: ProfileDetail[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, raw: unknown, link?: boolean) => {
    const value = Array.isArray(raw)
      ? raw.filter((v) => typeof v === "string" && v.trim()).join(", ")
      : typeof raw === "string" || typeof raw === "number"
        ? String(raw).trim()
        : "";
    if (!value) return;
    seen.add(key);
    const href = link ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : undefined;
    out.push({ key, label, value, href });
  };
  for (const f of PROFILE_DATA_FIELDS) push(f.key, f.label, data[f.key], f.link);
  for (const [key, raw] of Object.entries(data)) {
    if (seen.has(key) || PROFILE_DATA_FIELDS.some((f) => f.key === key)) continue;
    push(key, key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), raw);
  }
  return out;
}
