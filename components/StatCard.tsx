// Shared stat tile (home + brokers header). Extracted from the original
// dashboard page when Inicio took over "/".
export function StatCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tint: { bg: string; fg: string };
}) {
  return (
    <div className="group rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-5 shadow-soft backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <span
        className="grid h-9 w-9 place-items-center rounded-xl ring-1 ring-black/[0.04] transition group-hover:scale-105"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </span>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">
        {value}
      </div>
      <div className="mt-0.5 text-sm text-neutral-500">{label}</div>
    </div>
  );
}
