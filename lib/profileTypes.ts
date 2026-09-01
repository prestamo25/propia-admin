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
