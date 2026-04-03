/** Foydalanuvchi xabarlaridagi matnlar ([Rasm yuborildi] qatorlari chiqarib tashlanadi). */
export function clientUserTextFromConversation(conversation: unknown): string {
  if (!Array.isArray(conversation)) return "";
  const parts: string[] = [];
  for (const m of conversation) {
    const msg = m as { role?: string; content?: string };
    if (msg.role !== "user" || typeof msg.content !== "string") continue;
    const t = msg.content.replace(/\n*\[Rasm yuborildi\]\n*/g, "").trim();
    if (t) parts.push(t);
  }
  return parts.join("\n\n").trim();
}

/** Suhbatdan oxirgi foydalanuvchi rasm-xabarining matn izohi ([Rasm yuborildi] dan tashqari). */
export function lastImageCaptionFromConversation(conversation: unknown): string | null {
  if (!Array.isArray(conversation)) return null;
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i] as { role?: string; content?: string };
    if (m.role !== "user" || typeof m.content !== "string") continue;
    if (!m.content.includes("[Rasm yuborildi]")) continue;
    const caption = m.content.replace(/\n*\[Rasm yuborildi\]\n*/g, "").trim();
    return caption || null;
  }
  return null;
}
