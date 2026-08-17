// PostgREST caps EVERY single response at 1,000 rows (db-max-rows), no matter
// the .limit() — a full-table read that trusts one response silently truncates.
// That was the dashboard's "1000 Propiedades" freeze (2026-08-17, real count
// 1,15x). Any admin query that wants the WHOLE table must page through this.
//
// `make` must return a FRESH query builder on every call — PostgREST builders
// are single-use; .range() is applied here.

type PageResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

export async function pageAll<T>(
  make: () => { range(from: number, to: number): PromiseLike<PageResult> },
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await make().range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}
