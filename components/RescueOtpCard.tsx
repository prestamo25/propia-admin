"use client";

import { useEffect, useState } from "react";
import {
  addRescuePair,
  listRescuePairs,
  removeRescuePair,
  type RescuePair,
} from "@/app/actions";

function formatPhone(p: string): string {
  return p.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3");
}

export function RescueOtpCard() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ phone10: string; already: boolean } | null>(
    null,
  );
  const [pairs, setPairs] = useState<RescuePair[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, "");

  async function refresh() {
    const res = await listRescuePairs();
    if (res.error) setListError(res.error);
    else {
      setListError(null);
      setPairs(res.pairs ?? []);
    }
  }

  useEffect(() => {
    let active = true;
    listRescuePairs()
      .then((res) => {
        if (!active) return;
        if (res.error) setListError(res.error);
        else {
          setListError(null);
          setPairs(res.pairs ?? []);
        }
      })
      .catch(() => {
        if (active) setListError("No se pudo cargar la lista.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (digits.length !== 10 || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await addRescuePair(digits);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone({ phone10: digits, already: !!res.already });
    setPhone("");
    refresh();
  }

  async function handleRemove(phone10: string) {
    if (removing) return;
    setRemoving(phone10);
    const res = await removeRescuePair(phone10);
    setRemoving(null);
    if (res.error) setListError(res.error);
    else {
      if (done?.phone10 === phone10) setDone(null);
      refresh();
    }
  }

  return (
    <section className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-soft">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <span className="rounded-xl bg-neutral-100 px-3 py-2.5 text-[15px] font-medium text-neutral-500">
          +52
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="222 123 4567"
          inputMode="numeric"
          className="w-full min-w-0 flex-1 rounded-xl border border-neutral-200 px-3.5 py-2.5 text-[15px] tabular-nums text-neutral-900 outline-none transition placeholder:text-neutral-300 focus:border-[#1c4588] focus:ring-2 focus:ring-[#1c4588]/15"
        />
        <button
          type="submit"
          disabled={digits.length !== 10 || busy}
          className="shrink-0 rounded-xl bg-[#1c4588] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163669] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Activando…" : "Activar"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      ) : null}

      {done ? (
        <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
          <span className="font-semibold">
            Listo — {formatPhone(done.phone10)}
            {done.already ? " ya estaba activo" : ""}.
          </span>{" "}
          Dile que pida el código otra vez y escriba{" "}
          <span className="font-mono font-semibold">123456</span>. Cuando ya
          esté dentro, quítalo aquí abajo.
        </div>
      ) : null}

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <h3 className="text-sm font-medium text-neutral-700">
          Rescates activos
        </h3>
        {listError ? (
          <p className="mt-2 text-sm text-rose-600">{listError}</p>
        ) : pairs === null ? (
          <p className="mt-2 text-sm text-neutral-400">Cargando…</p>
        ) : pairs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            Ninguno — todo despejado.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {pairs.map((p) => (
              <li
                key={p.phone10}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[15px] tabular-nums text-neutral-900">
                    {formatPhone(p.phone10)}
                  </span>
                  {p.name ? (
                    <span className="ml-2 truncate text-sm text-neutral-500">
                      {p.name}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => handleRemove(p.phone10)}
                  disabled={removing !== null}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                >
                  {removing === p.phone10 ? "Quitando…" : "Quitar"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-400">
          Mientras un rescate esté activo, cualquiera que escriba ese número
          entra con 123456 — quítalo en cuanto el broker esté dentro.
        </p>
      </div>
    </section>
  );
}
