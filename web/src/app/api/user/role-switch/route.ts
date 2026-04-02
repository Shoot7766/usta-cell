import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireSession } from "@/lib/api-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

const Body = z.object({
  targetRole: z.enum(["client", "worker"]),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSession();
  if (ctx instanceof Response) return ctx;
  if (ctx.role === "admin") {
    return NextResponse.json({ error: "Admin uchun almashtirish yo'q" }, { status: 400 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  if (body.targetRole === ctx.role) {
    return NextResponse.json({ error: "Allaqachon shu rol" }, { status: 400 });
  }
  const confirm = crypto.randomBytes(16).toString("hex");
  const sb = getServiceSupabase();
  await sb
    .from("users")
    .update({
      pending_role: body.targetRole,
      role_switch_confirm_token: confirm,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.userId);
  return NextResponse.json({
    ok: true,
    message:
      "Rol almashtirishni tasdiqlang. Bu xavfsizlik uchun ikki bosqichda amalga oshiriladi.",
    confirmToken: confirm,
  });
}
