import Link from "next/link";
import type { ReactNode } from "react";

// Detail pages (a member, an event) keep the panel's top bar like every other
// page (Franz 2026-10-14, UI/UX batch A — before, they had only «‹ back» and
// «Salir», a dead end) and put the way back to their list, plus the page's own
// action, in this slim row under it.
export function BackBar({
  href,
  label,
  right,
  width = "max-w-6xl",
}: {
  href: string;
  label: string;
  right?: ReactNode;
  width?: string;
}) {
  return (
    <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 pt-5 sm:px-6`}>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
        {label}
      </Link>
      {right}
    </div>
  );
}
