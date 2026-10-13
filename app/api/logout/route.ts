import { NextResponse } from "next/server";
import { PENDING_COOKIE, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: Request) {
  // A phone login whose grant was revoked, closed or ran out lands here from
  // lib/session.ts / lib/access.ts with ?motivo=vencido, so the login screen
  // can say why.
  const motivo = new URL(req.url).searchParams.get("motivo");
  // Relative Location — see api/login (Lambda Web Adapter host gotcha).
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: motivo === "vencido" ? "/login?error=vencido" : "/login" },
  });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(PENDING_COOKIE);
  return res;
}
