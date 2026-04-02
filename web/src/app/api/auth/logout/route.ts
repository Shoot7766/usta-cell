import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOpts } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOpts(0),
    maxAge: 0,
  });
  return res;
}
