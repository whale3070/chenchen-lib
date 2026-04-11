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

function parseEnvFileAdminAddresses(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx <= 0) continue;
    const k = t.slice(0, idx).trim();
    if (k !== "ADMIN_ADDRESS") continue;
    let v = t.slice(idx + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    for (const part of v.split(/[,;\s]+/)) {
      const p = part.trim().toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(p)) out.push(p);
    }
  }
  return out;
}

let adminAddressCache: { addrs: Set<string>; at: number } | null = null;
const ADMIN_CACHE_MS = 60_000;

async function loadAdminAddresses(): Promise<Set<string>> {
  const now = Date.now();
  if (adminAddressCache && now - adminAddressCache.at < ADMIN_CACHE_MS) {
    return adminAddressCache.addrs;
  }
  const addrs = new Set<string>();
  const fromEnv = process.env.ADMIN_ADDRESS?.trim() ?? "";
  for (const part of fromEnv.split(/[,;\s]+/)) {
    const p = part.trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(p)) addrs.add(p);
  }
  const tryFiles = [
    path.join(process.cwd(), ".env.production"),
    path.join(process.cwd(), "..", "..", ".env.production"),
  ];
  for (const fp of tryFiles) {
    try {
      const raw = await fs.readFile(fp, "utf8");
      for (const a of parseEnvFileAdminAddresses(raw)) addrs.add(a);
    } catch {
      /* ignore */
    }
  }
  adminAddressCache = { addrs, at: now };
  return addrs;
}

export async function isAdminWallet(walletLower: string): Promise<boolean> {
  const w = walletLower.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return false;
  return (await loadAdminAddresses()).has(w);
}

export async function readPaidMemberRecord(
  walletLower: string,
): Promise<PaidMemberRecord | null> {
  const base = memberJsonBasename(walletLower);
  if (!base) return null;
  const fp = path.join(MEMBERS_DIR, `${base}.json`);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let rec: PaidMemberRecord;
    try {
      rec = JSON.parse(trimmed) as PaidMemberRecord;
    } catch {
      return null;
    }
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

/** 未通过时返回 403 JSON，通过时返回 null（管理员地址豁免） */
export async function paidMemberForbiddenResponse(
  walletLower: string,
): Promise<NextResponse | null> {
  if (membershipCheckDisabled()) return null;
  if (await isAdminWallet(walletLower)) return null;
  if (await isPaidMemberActive(walletLower)) return null;
  return NextResponse.json(
    {
      error: "需要有效的付费会员订阅才可使用此 AI 功能",
      code: "subscription_required",
    },
    { status: 403 },
  );
}
