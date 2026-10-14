"use client";

import { WaGlyph } from "@/components/WaGlyph";
import { waHref } from "@/lib/format";

// Message a member on WhatsApp straight from a list row (Franz 2026-10-14,
// UI/UX batch C) — the member page already links the phone. Stops the click
// so the row doesn't also open the member.
export function WaLink({ phone, name, size = "md" }: { phone: string; name: string | null; size?: "sm" | "md" }) {
  return (
    <a
      href={waHref(phone)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`WhatsApp a ${name ?? "este miembro"}`}
      aria-label={`WhatsApp a ${name ?? "este miembro"}`}
      className={`grid shrink-0 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/15 transition hover:bg-emerald-100 ${
        size === "sm" ? "h-7 w-7" : "h-9 w-9"
      }`}
    >
      <WaGlyph size={size === "sm" ? 14 : 17} color="#16a34a" />
    </a>
  );
}
