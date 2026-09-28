"use client";

import { useTransition } from "react";
import { blockBroker, unblockBroker } from "@/app/actions";

export function BlockButton({
  id,
  name,
  blocked,
  size = "sm",
  variant = "button",
  onDone,
}: {
  id: string;
  name: string | null;
  blocked: boolean;
  size?: "sm" | "md";
  // "menu" = a row inside a ⋯ menu (Miembros table) instead of a bordered button.
  variant?: "button" | "menu";
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (blocked) {
      startTransition(async () => {
        const res = await unblockBroker(id);
        if (res?.error) alert(res.error);
        onDone?.();
      });
    } else {
      const ok = window.confirm(
        `¿Bloquear a ${name ?? "este broker"}?\n\nNo podrá iniciar sesión ni entrar a la app.`,
      );
      if (!ok) return;
      startTransition(async () => {
        const res = await blockBroker(id);
        if (res?.error) alert(res.error);
        onDone?.();
      });
    }
  }

  if (variant === "menu") {
    return (
      <button
        role="menuitem"
        onClick={onClick}
        disabled={pending}
        className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:opacity-50 ${
          blocked ? "text-emerald-700 hover:bg-emerald-50" : "text-rose-600 hover:bg-rose-50"
        }`}
      >
        {pending ? "…" : blocked ? "Reactivar" : "Bloquear"}
      </button>
    );
  }

  const pad = size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1 text-xs";

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={`rounded-lg font-medium ring-1 ring-inset transition disabled:opacity-50 ${pad} ${
        blocked
          ? "text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
          : "text-rose-600 ring-rose-200 hover:bg-rose-50"
      }`}
    >
      {pending ? "…" : blocked ? "Reactivar" : "Bloquear"}
    </button>
  );
}
