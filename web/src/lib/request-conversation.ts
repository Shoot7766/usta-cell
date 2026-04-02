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
