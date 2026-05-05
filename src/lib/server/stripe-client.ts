import Stripe from "stripe";

let cached: Stripe | null = null;

/** Stripe 服务端客户端；不传 apiVersion（使用账户默认值）。未配置密钥时返回 null。 */
export function getStripeServerClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}
