import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: Request) {
  // A regional grant that was revoked or ran out lands here from lib/access.ts
  // with ?motivo=vencido, so the login screen can say why.
  const motivo = new URL(req.url).searchParams.get("motivo");
  // Relative Location — see api/login (Lambda Web Adapter host gotcha).
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: motivo === "vencido" ? "/login?modo=propia&error=vencido" : "/login" },
  });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
