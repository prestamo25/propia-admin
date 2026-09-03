"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";
import { PROFILE_TYPE_LABEL } from "@/lib/profileTypes";
import {
  CANONICAL_PAIRS,
  RESCUE_OTP,
  getOtpConfig,
  saveOtpConfig,
} from "@/lib/testOtp";

// ~100 years — an effectively permanent ban until explicitly lifted.
const BAN_DURATION = "876600h";

type Result = { error?: string };

// Block a broker at the AUTH layer: they can no longer sign in or refresh their
// session. (Their current access token stays valid until it expires — Supabase
// can't revoke an already-issued JWT — so worst case they're fully out within
// the token lifetime, and immediately on the app's next cold start.)
export async function blockBroker(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(id, {
    ban_duration: BAN_DURATION,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

// Who is deciding — stored on users.reviewed_by next to the DB-stamped
// reviewed_at, so a rejected row can say «por Mariana el 30 ago». Same labels
// as the header badge.
async function reviewer(): Promise<string> {
  const role = await getRole();
  return role === "dev" ? "Técnico" : role === "mariana" ? "Mariana" : "Admin";
}

// Approve a pending account. The app's pending screen listens on the users
// row over Realtime, so the member's phone flips to "¡Listo!" live; the DB
// trigger also mirrors the decision to WhatsApp (cuenta_aprobada).
export async function approveUser(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ status: "approved", rejection_reason: null, reviewed_by: await reviewer() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/aprobaciones");
  return {};
}

// Approve AS another type (Franz 2026-09-03): people pick the wrong category
// — a valuador under «Otros», a loan seeker under «Créditos», a company that
// isn't a real-estate service at all. Invitado is the common case (eventos +
// servicios, never in the directory). Same UPDATE as approveUser plus the
// type; the tier gates key off profile_type, and the app lands them on the
// right tab on its next check. Works on pending AND rejected rows.
export async function approveUserAs(id: string, profileType: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  if (!(profileType in PROFILE_TYPE_LABEL)) return { error: "Tipo de perfil inválido." };
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({
      profile_type: profileType,
      status: "approved",
      rejection_reason: null,
      reviewed_by: await reviewer(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/aprobaciones");
  revalidatePath("/brokers");
  return {};
}

// Reject a pending account. status='rejected' + the reason the applicant is
// shown. Reversible: re-approving simply sets status back and clears it.
export async function rejectUser(id: string, reason: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const clean = reason.trim();
  if (clean.length < 3) return { error: "Escribe un motivo." };
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ status: "rejected", rejection_reason: clean, reviewed_by: await reviewer() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/aprobaciones");
  return {};
}

export async function unblockBroker(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(id, {
    ban_duration: "none",
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

export async function setReportStatus(
  id: string,
  status: "open" | "actioned" | "dismissed",
): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb.from("reports").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/reportes");
  return {};
}

// --- SMS de rescate ---------------------------------------------------------
// When Twilio won't deliver the code: register the phone as a Supabase
// test-OTP pair so the app's normal code screen accepts 123456 (no SMS is sent
// for test numbers). Signup/login proceeds exactly as always — this only
// replaces the SMS. Remove the pair once the broker is in: while it's active,
// anyone entering that phone can log in with 123456.

export type RescuePair = { phone10: string; name: string | null };

export async function listRescuePairs(): Promise<{
  pairs?: RescuePair[];
  error?: string;
}> {
  try {
    const cfg = await getOtpConfig();
    const phones = [...cfg.pairs.keys()].filter((p) => !CANONICAL_PAIRS.has(p));
    const names = new Map<string, string>();
    if (phones.length) {
      const sb = supabaseAdmin();
      const { data } = await sb
        .from("users")
        .select("phone, name, first_name, last_name")
        .in("phone", phones);
      for (const u of data ?? []) {
        const row = u as {
          phone: string;
          name: string | null;
          first_name: string | null;
          last_name: string | null;
        };
        const full =
          [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
          row.name;
        if (full) names.set(row.phone, full);
      }
    }
    return {
      pairs: phones.map((p) => ({
        phone10: p.slice(2),
        name: names.get(p) ?? null,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addRescuePair(
  phone10: string,
): Promise<{ error?: string; already?: boolean }> {
  const digits = phone10.replace(/\D/g, "");
  if (digits.length !== 10)
    return { error: "El teléfono debe tener 10 dígitos." };
  const phone = `52${digits}`;
  try {
    const cfg = await getOtpConfig();
    if (cfg.pairs.get(phone) === RESCUE_OTP) return { already: true };
    cfg.pairs.set(phone, RESCUE_OTP);
    await saveOtpConfig(cfg);
    // The auth server reloads its config asynchronously (a code request that
    // races the reload still fires a real SMS), so hold the action a few
    // seconds and confirm the write before reporting success.
    await new Promise((r) => setTimeout(r, 6000));
    const after = await getOtpConfig();
    if (after.pairs.get(phone) !== RESCUE_OTP)
      return {
        error:
          "El cambio no se guardó (otro cambio lo pisó). Inténtalo de nuevo.",
      };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeRescuePair(phone10: string): Promise<Result> {
  const digits = phone10.replace(/\D/g, "");
  const phone = `52${digits}`;
  if (CANONICAL_PAIRS.has(phone))
    return { error: "Ese número es una cuenta de prueba fija." };
  try {
    const cfg = await getOtpConfig();
    if (!cfg.pairs.has(phone)) return {};
    cfg.pairs.delete(phone);
    await saveOtpConfig(cfg);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Zonas — Propia's editorial layer over the INEGI catalog.
// ---------------------------------------------------------------------------

// Create or update a macro-zone from an explicit member list. Geometry is the
// union of the members, so re-running with an edited list rebuilds the shape.
// Returns how many listings the change re-homed, which is the whole point of
// the exercise and worth showing back to whoever pressed the button.
export async function crearZona(
  nombre: string,
  estado: string,
  miembros: string[],
): Promise<Result & { movidas?: number; key?: string }> {
  // The middleware only proves *a* session exists; it knows nothing about
  // roles. An action that writes to production matching enforces its own
  // gate, same tier as the page that hosts it.
  // Franz 08-31: zone curation opens to the admin tier (Pablo, Mariana).
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };

  const clean = nombre.trim();
  if (clean.length < 3) return { error: "Ponle un nombre a la zona." };
  if (!miembros.length) return { error: "Selecciona al menos un polígono." };

  // zona-<slug>: accent-stripped, non-alphanumerics collapsed to hyphens.
  const slug = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return { error: "Ese nombre no produce una clave válida." };

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_create_zona", {
    p_key: `zona-${slug}`,
    p_nombre: clean,
    p_estado: estado,
    p_miembros: miembros,
  });
  if (error) return { error: error.message };
  revalidatePath("/zonas");
  const res = (data ?? {}) as { propiedades_movidas?: number; key?: string };
  return { movidas: res.propiedades_movidas ?? 0, key: res.key };
}

// Create/update a HAND-DRAWN zone — for places brokers name but INEGI has no
// polygon for (Bello Horizonte, Tlaxcalancingo). The ring is the person's own
// judgment of the boundary; nothing is extracted from the basemap.
export async function crearZonaDibujada(
  nombre: string,
  estado: string,
  ring: [number, number][],
): Promise<Result & { movidas?: number; key?: string }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };

  const clean = nombre.trim();
  if (clean.length < 3) return { error: "Ponle un nombre a la zona." };
  if (!Array.isArray(ring) || ring.length < 4)
    return { error: "El dibujo necesita al menos tres vértices." };
  if (!ring.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])))
    return { error: "El dibujo trae coordenadas inválidas." };

  const slug = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return { error: "Ese nombre no produce una clave válida." };

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_create_zona_drawn", {
    p_key: `zona-${slug}`,
    p_nombre: clean,
    p_estado: estado,
    p_geojson: { type: "Polygon", coordinates: [ring] },
  });
  if (error) return { error: error.message };
  revalidatePath("/zonas");
  const res = (data ?? {}) as { propiedades_movidas?: number; key?: string };
  return { movidas: res.propiedades_movidas ?? 0, key: res.key };
}

// Save edits to an EXISTING zone (same key, membership or boundary replaced —
// the create RPCs upsert by key, which is exactly a rebuild).
export async function guardarZona(
  key: string,
  nombre: string,
  estado: string,
  cambio: { miembros: string[] } | { ring: [number, number][] },
): Promise<Result & { movidas?: number }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  if (!/^zona-[a-z0-9-]+$/.test(key)) return { error: "Clave de zona inválida." };
  const clean = nombre.replace(/ \(ZONA\)$/i, "").trim();

  const sb = supabaseAdmin();
  const { data, error } =
    "miembros" in cambio
      ? await sb.rpc("admin_create_zona", {
          p_key: key, p_nombre: clean, p_estado: estado, p_miembros: cambio.miembros,
        })
      : await sb.rpc("admin_create_zona_drawn", {
          p_key: key, p_nombre: clean, p_estado: estado,
          p_geojson: { type: "Polygon", coordinates: [cambio.ring] },
        });
  if (error) return { error: error.message };
  revalidatePath("/zonas");
  return { movidas: (data as { propiedades_movidas?: number })?.propiedades_movidas ?? 0 };
}

// Delete a zone; its listings are re-homed before anything else happens.
export async function borrarZona(key: string): Promise<Result & { movidas?: number }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_delete_zona", { p_key: key });
  if (error) return { error: error.message };
  revalidatePath("/zonas");
  return { movidas: (data as { propiedades_reasignadas?: number })?.propiedades_reasignadas ?? 0 };
}

// "This is not a zone" — junk names leave the queue for good.
export async function ignorarNombre(estado: string, nombre: string): Promise<Result> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("admin_dismiss_zona_name", {
    p_estado: estado, p_nombre: nombre,
  });
  if (error) return { error: error.message };
  revalidatePath("/zonas");
  return {};
}
