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
};

export type Tier = "asesor" | "servicios" | "cliente";

export function tierOf(profileType: string | null | undefined): Tier {
  if (!profileType || profileType === "asesor") return "asesor";
  if (profileType === "cliente") return "cliente";
  return "servicios";
}

export function profileTypeLabel(profileType: string | null | undefined): string {
  return PROFILE_TYPE_LABEL[profileType ?? "asesor"] ?? profileType ?? "Asesor";
}
