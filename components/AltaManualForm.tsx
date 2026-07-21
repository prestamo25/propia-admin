"use client";

import { useState } from "react";
import { createBroker, type PinMode } from "@/app/actions";

type Created = {
  name: string;
  phone10: string;
  pin: string;
  temp: boolean;
};

const MODES: { key: PinMode; label: string; desc: string }[] = [
  {
    key: "temp",
    label: "Código 123456",
    desc: "Temporal — al entrar, la app le exige crear su propio PIN. Ideal para el evento.",
  },
  {
    key: "chosen",
    label: "El broker lo elige",
    desc: "Pásale el teclado para que escriba 6 dígitos que recuerde (como su NIP del banco).",
  },
  {
    key: "random",
    label: "Aleatorio",
    desc: "Generamos uno seguro — tendrás que dictárselo o enviárselo.",
  },
];

export function AltaManualForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<PinMode>("temp");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const digits = phone.replace(/\D/g, "");
  const pinDigits = pin.replace(/\D/g, "");
  const valid =
    digits.length === 10 && (mode !== "chosen" || pinDigits.length === 6);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await createBroker(
      firstName,
      lastName,
      digits,
      mode,
      mode === "chosen" ? pinDigits : undefined,
    );
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCreated({
      name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
      phone10: digits,
      pin: res.pin!,
      temp: mode === "temp",
    });
  }

  function reset() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setPin("");
    setMode("temp");
    setError(null);
    setCreated(null);
  }

  if (created) {
    return (
      <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-neutral-900">
            {created.name || "El broker"} ya tiene acceso
          </h2>
        </div>

        <div className="mt-5 rounded-xl bg-neutral-50 p-5 text-center ring-1 ring-black/[0.04]">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {created.temp ? "Código temporal" : "PIN"}
          </div>
          <div className="mt-1 font-mono text-4xl font-bold tracking-[0.25em] text-[#1c4588] sm:text-5xl sm:tracking-[0.3em]">
            {created.pin}
          </div>
          <div className="mt-2 text-sm text-neutral-500">
            Teléfono: {created.phone10.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}
          </div>
        </div>

        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-neutral-600">
          <li>
            El broker abre{" "}
            <span className="font-semibold text-neutral-900">app.propia.dev</span>{" "}
            (o la app) y escribe su número.
          </li>
          <li>
            En la pantalla de PIN escribe{" "}
            <span className="font-mono font-semibold text-neutral-900">
              {created.pin}
            </span>{" "}
            — sin SMS.
          </li>
          {created.temp ? (
            <li>
              La app le pedirá{" "}
              <span className="font-semibold text-neutral-900">
                crear su propio PIN
              </span>
              {created.name ? "" : " y escribir su nombre"} en ese momento — el
              código temporal deja de funcionar.
            </li>
          ) : (
            <li>Después puede cambiarlo en Ajustes → Seguridad.</li>
          )}
        </ol>

        <button
          onClick={reset}
          className="mt-6 w-full rounded-xl bg-[#1c4588] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163669]"
        >
          Dar de alta a otro broker
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-soft"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">
          Teléfono (10 dígitos)
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-neutral-100 px-3 py-2.5 text-[15px] font-medium text-neutral-500">
            +52
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="222 123 4567"
            inputMode="numeric"
            autoFocus
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-[15px] tabular-nums text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-[#1c4588] focus:ring-2 focus:ring-[#1c4588]/15"
          />
        </div>
      </label>

      <div className="mt-4">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">
          Nombre{" "}
          <span className="font-normal text-neutral-400">
            — opcional; si lo dejas vacío, el broker escribe el suyo al entrar
          </span>
        </span>
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-[#1c4588] focus:ring-2 focus:ring-[#1c4588]/15"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Apellido"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-[#1c4588] focus:ring-2 focus:ring-[#1c4588]/15"
          />
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-neutral-700">PIN</legend>
        <div className="space-y-2">
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <label
                key={m.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                  selected
                    ? "border-[#1c4588]/40 bg-[#eef2fa] ring-1 ring-[#1c4588]/20"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="pinMode"
                  checked={selected}
                  onChange={() => setMode(m.key)}
                  className="mt-0.5 h-4 w-4 accent-[#1c4588]"
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold ${
                      selected ? "text-[#1c4588]" : "text-neutral-800"
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-neutral-500">
                    {m.desc}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {mode === "chosen" ? (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">
            PIN del broker (6 dígitos)
          </span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6 dígitos"
            inputMode="numeric"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-[15px] tabular-nums tracking-widest text-neutral-900 outline-none transition placeholder:tracking-normal placeholder:text-neutral-300 focus:border-[#1c4588] focus:ring-2 focus:ring-[#1c4588]/15"
          />
        </label>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!valid || busy}
        className="mt-6 w-full rounded-xl bg-[#1c4588] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163669] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Creando acceso…" : "Crear acceso"}
      </button>
    </form>
  );
}
