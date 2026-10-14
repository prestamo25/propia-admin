"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Feedback on every click (Franz 2026-10-14, UI/UX batch A). Each panel page
// takes ~1.5 s to answer (the Lambda runs in Virginia, the database in Oregon),
// and until now a click showed nothing at all for that long. A thin brand bar
// sweeps across the top from the click until the new page is on screen.
//
// It starts on any same-site link click (capture phase, before Next's Link
// handles it) and on `startNavProgress()` for navigations done in code (table
// rows that router.push). It stops by itself: it remembers the URL it started
// from, so arriving anywhere else ends it — no effect needed. A 15 s ceiling
// keeps it from sticking if a navigation never lands.

const EVENT = "propia:nav";

export function startNavProgress() {
  window.dispatchEvent(new Event(EVENT));
}

const keyOf = (pathname: string, search: string) => `${pathname}?${search}`;

export function NavProgress() {
  const here = keyOf(usePathname(), useSearchParams().toString());
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    let ceiling: ReturnType<typeof setTimeout> | undefined;
    const current = () =>
      keyOf(window.location.pathname, new URLSearchParams(window.location.search).toString());
    const start = () => {
      setFrom(current());
      clearTimeout(ceiling);
      ceiling = setTimeout(() => setFrom(null), 15_000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (keyOf(url.pathname, url.searchParams.toString()) === current()) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(EVENT, start);
      clearTimeout(ceiling);
    };
  }, []);

  return <div aria-hidden className={`nav-progress${from !== null && from === here ? " nav-progress-on" : ""}`} />;
}
