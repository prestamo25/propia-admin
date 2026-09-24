"use server";

import { randomInt } from "node:crypto";
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

// Premium plan by hand (premium-plan-2026-09-08): Pablo's manual sales and
// courtesies. set_user_plan() is the one writer (service_role only) and logs
// to plan_events with who did it; a store/Stripe purchase later overwrites
// this through RevenueCat's webhook, which is the intended precedence.
export type PlanMotivo = "venta_whatsapp" | "cortesia" | "prueba" | "otro";

// Premium by hand (Plan card on /broker/[id]): Pablo closes a sale on
// WhatsApp, grants a courtesy or opens a trial. `motivo` + `note` land in
// plan_events.raw so the history explains every decision; the source stays
// «promotional» for courtesies/trials and «manual» for a sale closed by hand.
// Store / Stripe purchases arrive on their own through RevenueCat and
// overwrite whatever is set here.
export async function setUserPlan(
  id: string,
  plan: "free" | "premium",
  expiresAt: string | null,
  motivo: PlanMotivo | "quitar" = "otro",
  note: string | null = null,
): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  if (plan !== "free" && plan !== "premium") return { error: "Plan inválido." };
  let expires: string | null = null;
  if (plan === "premium" && expiresAt) {
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return { error: "Fecha inválida." };
    // End of that day, CDMX (UTC-6): «hasta el 30 de septiembre» includes it.
    expires = /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? new Date(`${expiresAt}T23:59:59-06:00`).toISOString() : d.toISOString();
  }
  const source = plan !== "premium" ? null : motivo === "venta_whatsapp" ? "manual" : "promotional";
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("set_user_plan", {
    p_user: id,
    p_plan: plan,
    p_expires_at: expires,
    p_source: source,
    p_kind: plan === "premium" ? `admin_${motivo}` : "admin_quitar",
    p_actor: await reviewer(),
    p_product_id: null,
    p_raw: { motivo: plan === "premium" ? motivo : "quitar", note: note?.trim() || null },
  });
  if (error) return { error: error.message };
  revalidatePath(`/broker/${id}`);
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
        phone10: p.replace(/^(52|1)(?=\d{10}$)/, ""),
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
// Alta manual con PIN temporal 123456 (restaurado 2026-09-24 para el Foro:
// el WhatsApp de códigos quedó sin cupo con Meta). La app obliga a cambiar el
// PIN en el primer login (must_change_pin) — no se envía ningún código.
// ---------------------------------------------------------------------------

type AltaResult = { pin?: string; error?: string };

// "temp" issues the shared default 123456 with users.must_change_pin=true —
// the app forces the broker to replace it on their FIRST login (create-pin
// hides "más tarde"), so the shared code dies the moment they enter.
export type PinMode = "temp" | "chosen" | "random";

const TEMP_PIN = "123456";

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
  mode: PinMode = "temp",
  chosenPin?: string,
): Promise<AltaResult> {
  // Names are optional: an empty name routes the broker through onboarding
  // after the (forced) PIN step, so they type their own.
  const first = firstName.trim();
  const last = lastName.trim();
  const digits = phone10.replace(/\D/g, "");
  if (digits.length !== 10)
    return { error: "El teléfono debe tener 10 dígitos." };
  if (mode === "chosen") {
    if (!chosenPin || !/^\d{6}$/.test(chosenPin))
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
      error: `Este número ya está registrado${existing.name ? ` (${existing.name})` : ""}. Puede entrar con su PIN o recuperarlo por SMS.`,
    };

  const pin =
    mode === "temp" ? TEMP_PIN : mode === "chosen" ? chosenPin! : generatePin();
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
    name: [first, last].filter(Boolean).join(" "),
    states: [],
    pin_set: true,
    must_change_pin: mode === "temp",
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


// «Ubicaciones dudosas» (metro plan, 2026-09-07). Accepting rewrites the
// listing's location to the resolver's suggestion: a point keeps lat/lng and
// takes the colonia under it, an area keeps only the colonia. The broker's
// original map pick (place_id) is cleared — a human just overruled it. Keeping
// closes the case so the sweep never raises it again.
export async function acceptGeoReview(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from("geo_review")
    .select("id, kind, ref_id, suggested, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row || row.status !== "pending") return { error: "Este caso ya se decidió." };
  const s = (row.suggested ?? {}) as {
    precision?: string | null; lat?: number | null; lng?: number | null; colonia_key?: string | null;
  };
  if (row.kind === "property") {
    let coloniaKey = s.colonia_key ?? null;
    if (!coloniaKey && s.lat != null && s.lng != null) {
      const { data: prop } = await sb.from("properties").select("state").eq("id", row.ref_id).maybeSingle();
      const { data: k } = await sb.rpc("colonia_key_at", { p_lat: s.lat, p_lng: s.lng, p_estado: prop?.state ?? null });
      coloniaKey = (k as string | null) ?? null;
    }
    const isPoint = s.precision === "point" && s.lat != null && s.lng != null;
    if (!isPoint && !coloniaKey) return { error: "La sugerencia no trae una ubicación aplicable." };
    const { error: e2 } = await sb
      .from("properties")
      .update({
        lat: isPoint ? s.lat : null,
        lng: isPoint ? s.lng : null,
        place_id: null,
        colonia_key: coloniaKey,
        colonia_sweep_at: new Date().toISOString(),
      })
      .eq("id", row.ref_id);
    if (e2) return { error: e2.message };
  } else {
    return { error: "Por ahora sólo se revisan propiedades." };
  }
  const { error: e3 } = await sb
    .from("geo_review")
    .update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: await reviewer() })
    .eq("id", id);
  if (e3) return { error: e3.message };
  revalidatePath("/ubicaciones");
  return {};
}

export async function keepGeoReview(id: string): Promise<Result> {
  if (!id) return { error: "Falta el id." };
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("geo_review")
    .update({ status: "kept", decided_at: new Date().toISOString(), decided_by: await reviewer() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/ubicaciones");
  return {};
}

// ── Avisos masivos (broadcasts-2026-09-21) ──────────────────────────────────
// El 09-21 Franz/Pablo pidieron un push promocional a Puebla y salió con un
// script suelto porque no existe push de texto libre. Franz: «this could
// become a habit» ⇒ vive aquí, con historial y con el conteo a la vista.
//
// ⚠ A propósito NO inserta filas en `notifications`: sin un tipo de aviso en
// la app, la campanita mostraría un tipo desconocido. Llega a la pantalla de
// bloqueo; la campanita y el switch de Ajustes llegan con un OTA posterior.
// El apagador `notif_avisos` YA se respeta (lo aplica broadcast_tokens).
export async function sendBroadcast(input: {
  body: string;
  estado?: string | null;
  tier?: string | null;
  eventId?: string | null;
}): Promise<Result & { sent?: number }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "Sin permiso." };

  const body = input.body?.trim();
  if (!body) return { error: "El texto va vacío." };
  if (body.length > 300) return { error: "El texto pasa de 300 caracteres." };

  const sb = supabaseAdmin();
  const estado = input.estado?.trim() || null;
  const tier = input.tier === "premium" || input.tier === "free" ? input.tier : null;

  const { data: rows, error: tokErr } = await sb.rpc("broadcast_tokens", {
    p_state: estado,
    p_tier: tier,
  });
  if (tokErr) return { error: tokErr.message };

  const tokens = [
    ...new Set(
      ((rows ?? []) as { token: string }[])
        .map((r) => r.token)
        .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken")),
    ),
  ];
  const people = new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id)).size;
  if (tokens.length === 0) return { error: "Ese filtro no alcanza a ningún dispositivo." };

  const { data: bc, error: insErr } = await sb
    .from("broadcasts")
    .insert({
      body,
      audience: { state: estado, tier },
      event_id: input.eventId || null,
      sent_by: role,
      devices: tokens.length,
      people,
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };

  // Mismo formato que push-fanout, para que un aviso se vea igual que
  // cualquier otra notificación de Propia en la pantalla de bloqueo.
  const path = input.eventId ? `/(tabs)/events/${input.eventId}` : "/(tabs)/events";
  const messages = tokens.map((to) => ({
    to,
    title: "Propia",
    body,
    sound: "default",
    data: { path },
  }));

  let ok = 0;
  let failed = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { status: string; details?: { error?: string } }[];
      } | null;
      const tickets = json?.data ?? [];
      tickets.forEach((t, j) => {
        if (t.status === "ok") ok++;
        else {
          failed++;
          if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[j].to);
        }
      });
    } catch {
      failed += chunk.length;
    }
  }

  // Un teléfono que desinstaló la app vuelve DeviceNotRegistered — se tira el
  // token para dejar de empujar al vacío (igual que push-fanout).
  if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
  await sb.from("broadcasts").update({ ok, failed }).eq("id", bc.id);

  revalidatePath("/avisos");
  return { sent: ok };
}
