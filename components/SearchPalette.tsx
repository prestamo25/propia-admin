"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { startNavProgress } from "@/components/NavProgress";
import { avatarColors, fmtPhone, initials } from "@/lib/format";

// Search from anywhere (Franz 2026-10-14, UI/UX batch B). The magnifier in the
// top bar (icon only: with the «Buscar ⌘K» label the dueño's tabs ran under
// it), ⌘K / Ctrl+K, or «/» anywhere outside a text field: one box that finds
// a member by name, company or phone, an event, a zone — and the panel's own
// pages by name — and jumps there. Server side: /api/buscar → admin_search().

type Miembro = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  estado: string | null;
};
type Evento = { id: string; title: string; start_at: string; state: string | null };
type Zona = { key: string; nombre: string; municipio: string | null; estado: string };
type Found = { miembros: Miembro[]; eventos: Evento[]; zonas: Zona[] };

type Item = {
  key: string;
  group: "Páginas" | "Miembros" | "Eventos" | "Zonas";
  href: string;
  title: string;
  sub: string;
  avatar?: { url: string | null; name: string | null };
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric" });
const zonaLabel = (n: string) => n.replace(/\s*\(ZONA\)\s*$/i, "");

export function SearchPalette({ pages }: { pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; data: Found } | null>(null);
  const [active, setActive] = useState({ q: "", i: 0 });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const q = query.trim();

  // Open/close from the keyboard, anywhere in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While open: no page scroll behind it, and the text ready to retype.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => input.current?.select());
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Ask the server, 180 ms after the last keystroke.
  useEffect(() => {
    if (!open || q.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/buscar?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Found | null) => {
          if (data) setFound({ q, data });
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, open]);

  const items = useMemo<Item[]>(() => {
    if (q.length < 1) return [];
    const nq = norm(q);
    const out: Item[] = pages
      .filter((p) => norm(p.label).includes(nq))
      .slice(0, 4)
      .map((p) => ({ key: `p:${p.href}`, group: "Páginas", href: p.href, title: p.label, sub: "Ir a la página" }));
    const data = found?.data;
    if (data && q.length >= 2) {
      for (const m of data.miembros) {
        out.push({
          key: `m:${m.id}`,
          group: "Miembros",
          href: `/broker/${m.id}`,
          title: m.name ?? "Sin nombre",
          sub: [m.company, m.estado, m.phone ? fmtPhone(m.phone) : null, m.status && m.status !== "approved" ? m.status : null]
            .filter(Boolean)
            .join(" · "),
          avatar: { url: m.avatar_url, name: m.name },
        });
      }
      for (const e of data.eventos) {
        out.push({ key: `e:${e.id}`, group: "Eventos", href: `/eventos/${e.id}`, title: e.title, sub: [when(e.start_at), e.state].filter(Boolean).join(" · ") });
      }
      for (const z of data.zonas) {
        out.push({
          key: `z:${z.key}`,
          group: "Zonas",
          href: `/zonas?estado=${encodeURIComponent(z.estado)}&zona=${encodeURIComponent(z.key)}`,
          title: zonaLabel(z.nombre),
          sub: [z.municipio, z.estado].filter(Boolean).join(" · "),
        });
      }
    }
    return out;
  }, [q, pages, found]);

  const searching = q.length >= 2 && found?.q !== q;
  const activeIndex = active.q === q ? Math.min(active.i, Math.max(0, items.length - 1)) : 0;
  const setActiveIndex = (i: number) => setActive({ q, i });

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    startNavProgress();
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(items.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[activeIndex]);
    }
  }

  // Keep the highlighted row in view while moving with the arrows.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        title="Buscar (⌘K)"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/30 p-4 pt-[8vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Buscar en el panel"
                className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-black/[0.06]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 border-b border-neutral-100 px-4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    ref={input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onInputKey}
                    autoFocus
                    placeholder="Miembro, teléfono, evento, zona o página…"
                    className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                  {searching ? <span className="shrink-0 text-xs text-neutral-400">Buscando…</span> : null}
                  <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-neutral-400 ring-1 ring-neutral-200 hover:text-neutral-700">
                    Esc
                  </button>
                </div>

                {q.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-neutral-500">
                    Escribe un nombre, empresa, teléfono, evento, zona o página. Desde cualquier página: <b className="font-semibold text-neutral-700">⌘K</b> o <b className="font-semibold text-neutral-700">/</b>.
                  </p>
                ) : items.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-neutral-500">{searching || q.length < 2 ? "Buscando…" : "Sin resultados."}</p>
                ) : (
                  <ul ref={list} className="overflow-y-auto py-2">
                    {items.map((it, i) => (
                      <li key={it.key}>
                        {i === 0 || items[i - 1].group !== it.group ? (
                          <div className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{it.group}</div>
                        ) : null}
                        <button
                          type="button"
                          data-i={i}
                          onClick={() => go(it)}
                          onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                          className={`flex w-full items-center gap-3 px-5 py-2 text-left ${i === activeIndex ? "bg-neutral-100" : ""}`}
                        >
                          {it.avatar ? (
                            it.avatar.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.avatar.url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]" />
                            ) : (
                              <span
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                                style={{ background: avatarColors(it.avatar.name).bg, color: avatarColors(it.avatar.name).fg }}
                              >
                                {initials(it.avatar.name)}
                              </span>
                            )
                          ) : (
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-[11px] font-semibold text-neutral-500">
                              {it.group === "Eventos" ? "Ev" : it.group === "Zonas" ? "Z" : "↗"}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-neutral-900">{it.title}</span>
                            {it.sub ? <span className="block truncate text-xs text-neutral-500">{it.sub}</span> : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="hidden border-t border-neutral-100 px-5 py-2 text-[11px] text-neutral-400 sm:block">
                  ↑↓ para moverte · Enter para abrir · Esc para cerrar
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
