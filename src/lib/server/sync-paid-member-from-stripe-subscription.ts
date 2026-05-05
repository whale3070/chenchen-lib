import type Stripe from "stripe";

import {
  replacePaidMemberRecord,
  type PaidMemberRecord,
} from "@/lib/server/paid-membership";

export function paidMemberStatusFromStripeSubscription(
  subscription: Stripe.Subscription,
): PaidMemberRecord["status"] {
  const s = subscription.status;
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due") return "past_due";
  return "canceled";
}

function resolveStripeCustomerId(
  subscription: Stripe.Subscription,
  explicit?: string | null,
): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  const c = subscription.customer;
  if (typeof c === "string" && c.trim()) return c;
  if (c && typeof c === "object" && "id" in c && typeof c.id === "string") {
    return c.id;
  }
  return undefined;
}

function resolveSubscriptionCurrentPeriodEndUnix(subscription: Stripe.Subscription): number {
  const item0 = subscription.items?.data?.[0];
  const fromItem = item0?.current_period_end;
  if (typeof fromItem === "number" && Number.isFinite(fromItem)) {
    return fromItem;
  }
  const legacy = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof legacy === "number" && Number.isFinite(legacy)) {
    return legacy;
  }
  if (subscription.status === "canceled" || subscription.status === "unpaid") {
    const canceled =
      subscription.canceled_at ?? subscription.cancel_at ?? null;
    if (typeof canceled === "number" && Number.isFinite(canceled)) {
      return canceled;
    }
  }
  return Math.floor(Date.now() / 1000);
}

/** 根据 Stripe Subscription 覆盖本地 `.data/billing/members/` 会员文件。 */
export async function syncPaidMemberRecordFromStripeSubscription(params: {
  authorWalletLower: string;
  subscription: Stripe.Subscription;
  stripeCustomerId?: string | null;
}): Promise<void> {
  const periodEndUnix = resolveSubscriptionCurrentPeriodEndUnix(params.subscription);
  const endIso = new Date(periodEndUnix * 1000).toISOString();
  const rec: PaidMemberRecord = {
    status: paidMemberStatusFromStripeSubscription(params.subscription),
    currentPeriodEnd: endIso,
    updatedAt: new Date().toISOString(),
    stripeSubscriptionId: params.subscription.id,
    stripeCustomerId: resolveStripeCustomerId(
      params.subscription,
      params.stripeCustomerId,
    ),
  };
  await replacePaidMemberRecord(params.authorWalletLower, rec);
}
