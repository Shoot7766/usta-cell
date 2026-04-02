import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=()");
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const ip = clientIp(req.headers);
    const rl = rateLimit(`mw:${ip}`, 200, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Juda ko'p so'rov" },
        { status: 429 }
      );
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
