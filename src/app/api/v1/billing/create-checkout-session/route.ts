import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import { resolveBillingPublicOrigin } from "@/lib/server/billing-public-origin";
import { getStripeServerClient } from "@/lib/server/stripe-client";
import {
  readStripeCustomerId,
  saveStripeCustomerId,
} from "@/lib/server/stripe-customer-links";

export const runtime = "nodejs";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseWallet(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const addr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(addr)) return { ok: false, res: unauthorized("缺少或无效的登录身份（x-wallet-address）") };
  return { ok: true, walletLower: addr.toLowerCase() };
}

/**
 * 已登录作者创建 Stripe Checkout 订阅会话（按月 Price），返回跳转 URL。
 * 需在 Dashboard 预先创建 Product + recurring Price，填入 STRIPE_AUTHOR_AI_SUBSCRIPTION_PRICE_ID。
 */
export async function POST(req: NextRequest) {
  const wh = parseWallet(req);
  if (!wh.ok) return wh.res;

  const priceId = process.env.STRIPE_AUTHOR_AI_SUBSCRIPTION_PRICE_ID?.trim();
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "未配置 STRIPE_AUTHOR_AI_SUBSCRIPTION_PRICE_ID（请在 Stripe 创建按月 Price 并写入环境变量）",
      },
      { status: 503 },
    );
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "未配置 STRIPE_SECRET_KEY，无法在服务端创建结账会话" },
      { status: 503 },
    );
  }

  const origin = resolveBillingPublicOrigin(req);
  if (!origin) {
    return badRequest(
      "无法解析站点公网地址，请配置 NEXT_PUBLIC_APP_ORIGIN（示例：https://babeltowel.com）",
    );
  }

  const successUrl = `${origin}/workspace?tab=settings&billing=stripe_success`;
  const cancelUrl = `${origin}/workspace?tab=settings&billing=stripe_cancel`;

  let customerId = await readStripeCustomerId(wh.walletLower);
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { author_id: wh.walletLower },
    });
    customerId = customer.id;
    await saveStripeCustomerId(wh.walletLower, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: wh.walletLower,
    metadata: { author_id: wh.walletLower },
    subscription_data: {
      metadata: { author_id: wh.walletLower },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe 未返回结账 URL，请稍后重试" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
