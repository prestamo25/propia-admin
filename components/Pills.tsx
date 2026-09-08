"use client";

// The pill toolkit behind every admin toolbar (Mapa first, Eventos after it):
// one height, one radius, one tray. Add here, never re-style per page.

// A native <select> dressed as a pill: white, soft shadow, our own chevron.
export function PillSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  ariaLabel?: string;
}) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-8 appearance-none rounded-full bg-white pl-3.5 pr-8 text-sm font-medium text-neutral-900 shadow-sm outline-none ring-brand/40 focus:ring-2"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

// The light segmented control that lives inside a tray: the active option
// is a white pill, the rest are quiet text.
export function PillSegment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="inline-flex items-center rounded-full">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={`h-8 rounded-full px-3.5 text-sm font-medium transition ${
            value === k
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The grey tray that groups the filters on the left of a toolbar.
export function PillTray({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-neutral-100 p-1">
      {children}
    </div>
  );
}

export function FilterChip({
  on,
  onClick,
  label,
  title,
  count,
  tone = "neutral",
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  count?: number;
  tone?: "neutral" | "amber";
}) {
  const onCls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-neutral-900 bg-neutral-900 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
        on
          ? onCls
          : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {on ? <span aria-hidden>✓</span> : null}
      {label}
      {count != null ? (
        <span
          className={`tabular-nums ${on ? "text-white/70" : "text-neutral-400"}`}
        >
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </button>
  );
}

// A search box shaped like the chips next to it.
export function PillSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <span className="relative inline-flex">
      <svg
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-64 rounded-full border border-neutral-300 bg-white pl-9 pr-3.5 text-sm text-neutral-900 shadow-sm outline-none ring-brand/40 placeholder:text-neutral-400 focus:w-72 focus:ring-2 transition-[width]"
      />
    </span>
  );
}

// Toolbar frame: the white bar under the nav, filters left, extras right.
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-neutral-200 bg-white px-4 py-2.5 text-sm">
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return (
    <span className="mx-1 hidden h-6 w-px bg-neutral-200 sm:inline-block" />
  );
}
