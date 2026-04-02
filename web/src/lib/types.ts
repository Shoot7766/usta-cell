import { z } from "zod";

export const RoleSchema = z.enum(["client", "worker", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

export const OrderStatusSchema = z.enum([
  "new",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const AiDispatcherSchema = z.object({
  category: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
  questions: z.array(z.string()).max(4),
  summary: z.string(),
  tags: z.array(z.string()).max(12),
  price_min_cents: z.number().int().nonnegative().optional(),
  price_max_cents: z.number().int().nonnegative().optional(),
});

export type AiDispatcherResult = z.infer<typeof AiDispatcherSchema>;

export type SessionPayload = {
  sub: string;
  telegramId: string;
  role: Role;
  iat: number;
  exp: number;
};

export type WorkerMatchRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  services: string[];
  lat: number | null;
  lng: number | null;
  price_min_cents: number;
  price_max_cents: number;
  is_available: boolean;
  avg_response_seconds: number;
  rating_avg: number;
  rating_count: number;
  subscription_tier: "free" | "pro";
  distance_km: number | null;
  /** Mijozga ko‘rinadigan oxirgi ishlar (rasmlar havolasi). */
  portfolio_preview: { image_url: string; caption?: string | null }[];
};

export type MatchBadge = "top_worker" | "fast_response" | "nearby";

export type ScoredWorker = WorkerMatchRow & {
  score: number;
  badges: MatchBadge[];
};
