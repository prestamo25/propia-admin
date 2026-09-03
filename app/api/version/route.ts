import { NextResponse } from "next/server";

// Which build is live. deploy-admin.sh reads this after every deploy to
// prove admin.propia.dev serves the commit it just shipped (2026-09-03: two
// "deploys" had silently never reached Lambda). Public on purpose —
// proxy.ts exempts it — it reveals a commit hash and a timestamp, nothing
// else. Values are baked at build time by the deploy script.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      commit: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev",
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
