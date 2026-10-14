"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Confirmations (Franz 2026-10-14, UI/UX batch B): every action that changes
// something says so in a short line at the bottom of the screen — «Aprobado ✓»,
// «Premium otorgado hasta 13 ene» — and the risky ones (block, take access
// away, close a report) offer «Deshacer» for a few seconds. Mounted once in the
// root layout; any client component calls toast(). Client navigations keep the
// layout mounted, so a confirmation survives the page changing under it.

type Tone = "ok" | "error";
type Undo = () => Promise<{ error?: string } | void> | void;
type ToastInput = { text: string; tone?: Tone; undo?: Undo; undoLabel?: string };
type ToastItem = ToastInput & { id: number };

const EVENT = "propia:toast";
let seq = 0;

export function toast(text: string, opts: Omit<ToastInput, "text"> = {}) {
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: ++seq, text, ...opts } }));
}

export function Toaster() {
  const router = useRouter();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const dismiss = (id: number) => {
      setItems((xs) => xs.filter((x) => x.id !== id));
      clearTimeout(timers.get(id));
      timers.delete(id);
    };
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail;
      setItems((xs) => [...xs.slice(-2), t]);
      timers.set(t.id, setTimeout(() => dismiss(t.id), t.undo ? 8000 : t.tone === "error" ? 7000 : 4000));
    };
    window.addEventListener(EVENT, onToast);
    const onDismiss = (e: Event) => dismiss((e as CustomEvent<number>).detail);
    window.addEventListener(`${EVENT}:dismiss`, onDismiss);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.removeEventListener(`${EVENT}:dismiss`, onDismiss);
      timers.forEach(clearTimeout);
    };
  }, []);

  const close = (id: number) => window.dispatchEvent(new CustomEvent(`${EVENT}:dismiss`, { detail: id }));

  async function undo(t: ToastItem) {
    close(t.id);
    const r = await t.undo?.();
    if (r && r.error) toast(r.error, { tone: "error" });
    else {
      toast("Deshecho");
      // The undo ran from here, not from the page that did the action: show
      // its result on the page now.
      router.refresh();
    }
  }

  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-lift ring-1 ${
            t.tone === "error" ? "bg-rose-600 text-white ring-rose-700" : "bg-neutral-900 text-white ring-black/20"
          }`}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.undo ? (
            <button type="button" onClick={() => undo(t)} className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-sky-300 hover:bg-white/10">
              {t.undoLabel ?? "Deshacer"}
            </button>
          ) : null}
          <button type="button" onClick={() => close(t.id)} aria-label="Cerrar" className="shrink-0 rounded-md px-1.5 text-white/60 hover:text-white">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
