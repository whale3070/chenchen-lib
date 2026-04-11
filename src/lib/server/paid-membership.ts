import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export type PaidMemberRecord = {
  status: "active" | "canceled" | "past_due";
  /** ISO 8601，当前计费周期结束时间 */
  currentPeriodEnd: string;
  updatedAt?: string;
};

const MEMBERS_DIR = path.join(process.cwd(), ".data", "billing", "members");

function membershipCheckDisabled(): boolean {
  const v = process.env.AUTHOR_AI_SKIP_MEMBERSHIP_CHECK?.trim();
  return v === "1" || v === "true";
}

function memberJsonBasename(walletLower: string): string | null {
  const w = walletLower.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(w) ? w : null;
}

export async function readPaidMemberRecord(
  walletLower: string,
): Promise<PaidMemberRecord | null> {
  const base = memberJsonBasename(walletLower);
  if (!base) return null;
  const fp = path.join(MEMBERS_DIR, `${base}.json`);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const rec = JSON.parse(raw) as PaidMemberRecord;
    if (!rec || typeof rec !== "object") return null;
    if (rec.status !== "active" && rec.status !== "canceled" && rec.status !== "past_due") {
      return null;
    }
    if (typeof rec.currentPeriodEnd !== "string" || !rec.currentPeriodEnd.trim()) {
      return null;
    }
    return rec;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

/** 订阅有效：status 为 active 且 currentPeriodEnd 晚于当前时间 */
export async function isPaidMemberActive(walletLower: string): Promise<boolean> {
  if (membershipCheckDisabled()) return true;
  const rec = await readPaidMemberRecord(walletLower);
  if (!rec || rec.status !== "active") return false;
  const end = new Date(rec.currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/** 未通过时返回 403 JSON，通过时返回 null */
export async function paidMemberForbiddenResponse(
  walletLower: string,
): Promise<NextResponse | null> {
  if (membershipCheckDisabled()) return null;
  if (await isPaidMemberActive(walletLower)) return null;
  return NextResponse.json(
    {
      error: "需要有效的付费会员订阅才可使用此 AI 功能",
      code: "subscription_required",
    },
    { status: 403 },
  );
}
