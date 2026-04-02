import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./types";

const COOKIE = "usta_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set (min 32 characters)");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: {
  userId: string;
  telegramId: string;
  role: Role;
}): Promise<string> {
  return new SignJWT({
    telegramId: payload.telegramId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
}

export async function verifySession(
  token: string | undefined
): Promise<{ userId: string; telegramId: string; role: Role } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const sub = payload.sub;
    const telegramId = payload.telegramId;
    const role = payload.role;
    if (typeof sub !== "string" || typeof telegramId !== "string") {
      return null;
    }
    if (role !== "client" && role !== "worker" && role !== "admin") {
      return null;
    }
    return { userId: sub, telegramId, role };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE;

export function sessionCookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
