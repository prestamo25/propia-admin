"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";
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

// Approve a pending account. The app's pending screen listens on the users
// row over Realtime, so the member's phone flips to "¡Listo!" live.
export async function approveUser(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ status: "approved", rejection_reason: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/aprobaciones");
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
    .update({ status: "rejected", rejection_reason: clean })
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
  const role = await getRole();
  if (!role || !roleCan(role, "dev")) return { error: "No autorizado." };

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
