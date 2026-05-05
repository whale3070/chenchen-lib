import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

import { getStripeServerClient } from "@/lib/server/stripe-client";
import { syncPaidMemberRecordFromStripeSubscription } from "@/lib/server/sync-paid-member-from-stripe-subscription";

export const runtime = "nodejs";

const AUTHOR_META_KEY = "author_id";

function isAuthorWallet(raw: string | undefined): raw is string {
  const w = raw?.trim().toLowerCase();
  return Boolean(w && /^0x[a-f0-9]{40}$/.test(w));
}

async function applySubscription(params: {
  subscription: Stripe.Subscription;
  stripeCustomerId?: string | null;
}) {
  const raw = params.subscription.metadata?.[AUTHOR_META_KEY];
  if (!isAuthorWallet(raw)) {
    console.warn(
      `[stripe webhook] subscription ${params.subscription.id}: missing ${AUTHOR_META_KEY} metadata`,
    );
    return;
  }
  await syncPaidMemberRecordFromStripeSubscription({
    authorWalletLower: raw.trim().toLowerCase(),
    subscription: params.subscription,
    stripeCustomerId: params.stripeCustomerId,
  });
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "subscription") return;

  const subRef = session.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subId) return;

  let sub = await stripe.subscriptions.retrieve(subId, {
    expand: ["items.data"],
  });
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const fromSessionRaw = session.metadata?.[AUTHOR_META_KEY];
  const onSub = sub.metadata?.[AUTHOR_META_KEY];
  if (
    typeof fromSessionRaw === "string" &&
    isAuthorWallet(fromSessionRaw) &&
    !isAuthorWallet(onSub)
  ) {
    await stripe.subscriptions.update(sub.id, {
      metadata: {
        ...(sub.metadata ?? {}),
        [AUTHOR_META_KEY]: fromSessionRaw.trim(),
      },
    });
    sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data"],
    });
  }

  await applySubscription({
    subscription: sub,
    stripeCustomerId: customerId,
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripeServerClient();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !whSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe-Signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, sig, whSecret);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid webhook payload" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(stripe, session);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription({
          subscription: event.data.object as Stripe.Subscription,
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
