"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// --- Alta manual -----------------------------------------------------------
// Pre-provisions a broker with a confirmed phone and a temporary PIN, skipping
// SMS entirely. The app's phone screen routes any account with pin_set=true
// straight to PIN login, so the broker signs in with phone + this PIN and can
// change it later in Ajustes → Seguridad.

type AltaResult = { pin?: string; error?: string };

// Same weak-PIN rules as the app (src/lib/auth.ts): repeated digit or a
// straight ascending/descending run.
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  return "0123456789".includes(pin) || "9876543210".includes(pin);
}

function generatePin(): string {
  let pin: string;
  do {
    pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  } while (isWeakPin(pin));
  return pin;
}

export async function createBroker(
  firstName: string,
  lastName: string,
  phone10: string,
  chosenPin?: string,
): Promise<AltaResult> {
  const first = firstName.trim();
  const last = lastName.trim();
  const digits = phone10.replace(/\D/g, "");
  if (!first || !last) return { error: "Falta el nombre o el apellido." };
  if (digits.length !== 10)
    return { error: "El teléfono debe tener 10 dígitos." };
  if (chosenPin) {
    if (!/^\d{6}$/.test(chosenPin))
      return { error: "El PIN debe tener exactamente 6 dígitos." };
    if (isWeakPin(chosenPin))
      return {
        error:
          "Ese PIN es demasiado fácil de adivinar (dígitos repetidos o en orden). Elige otro.",
      };
  }

  const phone = `52${digits}`; // users.phone format: 52 + 10 digits, no "+"
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("users")
    .select("id, name")
    .eq("phone", phone)
    .maybeSingle();
  if (existing)
    return {
      error: `Este número ya está registrado (${existing.name}). Puede entrar con su PIN o recuperarlo por SMS.`,
    };

  const pin = chosenPin || generatePin();
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    phone,
    phone_confirm: true,
    password: pin,
  });
  if (authErr) {
    const msg = /already|exists|registered/i.test(authErr.message)
      ? "Este número ya tiene una cuenta. Puede entrar con su PIN o recuperarlo por SMS."
      : authErr.message;
    return { error: msg };
  }

  const { error: profileErr } = await sb.from("users").insert({
    id: created.user.id,
    phone,
    first_name: first,
    last_name: last,
    name: `${first} ${last}`,
    states: [],
    pin_set: true,
  });
  if (profileErr) {
    // Don't leave a half-created account: without the profile row the app
    // would route this phone to SMS OTP, which is exactly what we're avoiding.
    await sb.auth.admin.deleteUser(created.user.id);
    return { error: `No se pudo crear el perfil: ${profileErr.message}` };
  }

  revalidatePath("/");
  return { pin };
}
