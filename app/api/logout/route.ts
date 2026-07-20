import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function GET() {
  // Relative Location — see api/login (Lambda Web Adapter host gotcha).
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
