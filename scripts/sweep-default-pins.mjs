#!/usr/bin/env node
// Post-event sweep: any account still flagged must_change_pin=true never
// logged in to claim its temporary PIN. Rotate its password to a random one
// (killing the shared default) and put it back on the SMS login path.
//
//   node scripts/sweep-default-pins.mjs            # dry-run: list them
//   node scripts/sweep-default-pins.mjs --apply    # rotate + reset flags

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const sb = createClient(get("SUPABASE_URL"), get("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await sb
  .from("users")
  .select("id, name, phone")
  .eq("must_change_pin", true);
if (error) throw error;

if (!rows.length) {
  console.log("Nada que barrer — todas las cuentas provisionadas ya cambiaron su PIN.");
  process.exit(0);
}

console.log(`${rows.length} cuenta(s) siguen en el PIN temporal:`);
rows.forEach((r) => console.log(`  · ${r.name} (${r.phone})`));

if (!apply) {
  console.log("\nDry-run. Agrega --apply para rotar sus contraseñas y regresarlas a login por SMS.");
  process.exit(0);
}

for (const r of rows) {
  // 32 hex chars — unguessable; nobody knows it, so PIN login is dead for
  // this account until the user re-verifies by SMS and sets a real PIN.
  const random = randomBytes(16).toString("hex");
  const { error: authErr } = await sb.auth.admin.updateUserById(r.id, { password: random });
  if (authErr) {
    console.log(`  ✗ ${r.name}: ${authErr.message}`);
    continue;
  }
  const { error: profErr } = await sb
    .from("users")
    .update({ pin_set: false, must_change_pin: false })
    .eq("id", r.id);
  console.log(profErr ? `  ✗ ${r.name}: ${profErr.message}` : `  ✓ rotada: ${r.name} (${r.phone}) — volverá a entrar por SMS`);
}
