import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, type Role } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");

  let role: Role | null = null;
  if (password && password === process.env.ADMIN_PASSWORD) role = "admin";
  else if (password && password === process.env.DEV_PASSWORD) role = "dev";

  // Relative Location: behind Lambda Web Adapter the request host is the
  // adapter's local address, so absolute URLs built from req.url are wrong.
  if (!role) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/login?error=1" },
    });
  }

  const token = await createSessionToken(role, process.env.SESSION_SECRET ?? "");
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
