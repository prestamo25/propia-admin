#!/usr/bin/env node
// Bulk pre-provision brokers for an event: confirmed phone + a temporary PIN
// they are FORCED to change on first login (users.must_change_pin=true; the
// app's resolveDestination routes them straight to create-pin, no skip).
//
// Usage:
//   node scripts/bulk-alta.mjs guests.txt            # dry-run: parse + report
//   node scripts/bulk-alta.mjs guests.txt --apply    # create the accounts
//   node scripts/bulk-alta.mjs guests.txt --apply --pin 123456
//
// Input: one guest per line, free-form "Nombre Apellido(s), 2221234567" or
// "Nombre Apellido 222 123 4567" — the last 10-digit run is the phone, the
// rest is the name. Lines without a 10-digit phone are reported and skipped.
// Existing accounts (by phone) are skipped and reported — never modified.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
const pinFlag = process.argv.indexOf("--pin");
const PIN = pinFlag > -1 ? process.argv[pinFlag + 1] : "123456";

if (!file) {
  console.error("Uso: node scripts/bulk-alta.mjs <lista.txt> [--apply] [--pin 123456]");
  process.exit(1);
}
if (!/^\d{6}$/.test(PIN)) {
  console.error(`PIN inválido: "${PIN}" — deben ser 6 dígitos.`);
  process.exit(1);
}

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const sb = createClient(get("SUPABASE_URL"), get("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- parse ---------------------------------------------------------------
const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const guests = [];
const bad = [];
for (const line of lines) {
  const digits = line.replace(/\D/g, "");
  const m = digits.match(/(\d{10})$/); // last 10 digits = phone
  const name = line
    .replace(/[\d()+\-.,;·|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!m) {
    bad.push(line);
    continue;
  }
  // Name optional: without one the broker fills onboarding after the forced
  // PIN change.
  const [first = "", ...rest] = name ? name.split(" ") : [];
  guests.push({
    phone: `52${m[1]}`,
    first,
    last: rest.join(" "),
    name,
  });
}

// De-dup within the file itself.
const seen = new Set();
const unique = guests.filter((g) => !seen.has(g.phone) && seen.add(g.phone));

console.log(`Líneas: ${lines.length} · válidas: ${unique.length} · duplicadas en archivo: ${guests.length - unique.length} · ilegibles: ${bad.length}`);
bad.forEach((l) => console.log(`  ✗ ilegible: ${l}`));

if (!apply) {
  unique.forEach((g) => console.log(`  ✓ ${g.name || "(sin nombre — onboarding)"} — ${g.phone}`));
  console.log("\nDry-run. Agrega --apply para crear las cuentas.");
  process.exit(0);
}

// --- apply ---------------------------------------------------------------
let created = 0, existing = 0, failed = 0;
for (const g of unique) {
  const { data: prev } = await sb.from("users").select("id").eq("phone", g.phone).maybeSingle();
  if (prev) {
    existing++;
    console.log(`  = ya existe: ${g.name || g.phone}`);
    continue;
  }
  const { data: createdUser, error: authErr } = await sb.auth.admin.createUser({
    phone: g.phone,
    phone_confirm: true,
    password: PIN,
  });
  if (authErr) {
    failed++;
    console.log(`  ✗ auth: ${g.name} (${g.phone}): ${authErr.message}`);
    continue;
  }
  const { error: profErr } = await sb.from("users").insert({
    id: createdUser.user.id,
    phone: g.phone,
    first_name: g.first,
    last_name: g.last,
    name: g.name,
    states: [],
    pin_set: true,
    must_change_pin: true,
  });
  if (profErr) {
    await sb.auth.admin.deleteUser(createdUser.user.id);
    failed++;
    console.log(`  ✗ perfil: ${g.name} (${g.phone}): ${profErr.message}`);
    continue;
  }
  created++;
  console.log(`  ✓ creada: ${g.name || "(sin nombre)"} (${g.phone})`);
}

console.log(`\nCreadas: ${created} · ya existían: ${existing} · fallidas: ${failed}`);
console.log(`PIN temporal: ${PIN} — cambio OBLIGATORIO en el primer login.`);
console.log("Después del evento corre: node scripts/sweep-default-pins.mjs --apply");
