import type { BrokerRow } from "@/lib/data";

// The brokers-table search, in one place: the table renders it and the Excel
// route re-runs it server-side, so the file you download is exactly the list
// you were looking at. Kept out of lib/data.ts because that module reaches for
// the service key and must never reach the browser.

type Searchable = Pick<
  BrokerRow,
  "name" | "company" | "phone" | "email" | "states"
>;

export function filterBrokers<T extends Searchable>(
  brokers: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return brokers;
  return brokers.filter((b) =>
    [b.name, b.company, b.phone, b.email, b.states.join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
