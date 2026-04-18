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

/** 单条会员记录是否处于「当前可视为付费有效」的窗口（与 isPaidMemberActive 判定一致，不读盘时可配合已有 record 使用） */
export function isPaidMemberRecordActive(rec: PaidMemberRecord | null): boolean {
  if (membershipCheckDisabled()) return true;
  if (!rec || rec.status !== "active") return false;
  const end = new Date(rec.currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/** 订阅有效：status 为 active 且 currentPeriodEnd 晚于当前时间 */
export async function isPaidMemberActive(walletLower: string): Promise<boolean> {
  if (membershipCheckDisabled()) return true;
  const rec = await readPaidMemberRecord(walletLower);
  return isPaidMemberRecordActive(rec);
}

export type PaidMemberListItem = {
  address: string;
  record: PaidMemberRecord;
};

/** 列出 `.data/billing/members/*.json` 中的会员记录（用于管理员后台） */
export async function listPaidMemberRecords(): Promise<PaidMemberListItem[]> {
  await fs.mkdir(MEMBERS_DIR, { recursive: true });
  let names: string[] = [];
  try {
    names = await fs.readdir(MEMBERS_DIR);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
  const out: PaidMemberListItem[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const base = name.slice(0, -5);
    if (!/^0x[a-f0-9]{40}$/.test(base)) continue;
    const rec = await readPaidMemberRecord(base);
    if (rec) out.push({ address: base, record: rec });
  }
  out.sort((a, b) => a.address.localeCompare(b.address));
  return out;
}

/**
 * 授予或续期 VIP：在现有周期结束时间基础上顺延 extendDays（若仍在有效期内），否则从当前时间起算。
 */
export async function grantPaidMember(params: {
  walletLower: string;
  extendDays: number;
}): Promise<PaidMemberRecord> {
  const base = memberJsonBasename(params.walletLower);
  if (!base) {
    throw new Error("invalid_wallet");
  }
  const days = params.extendDays;
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    throw new Error("invalid_extend_days");
  }
  const existing = await readPaidMemberRecord(base);
  const now = Date.now();
  let startMs = now;
  if (existing && existing.status === "active") {
    const curEnd = new Date(existing.currentPeriodEnd).getTime();
    if (Number.isFinite(curEnd) && curEnd > now) startMs = curEnd;
  }
  const end = new Date(startMs + Math.floor(days) * 86_400_000);
  const rec: PaidMemberRecord = {
    status: "active",
    currentPeriodEnd: end.toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(MEMBERS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(MEMBERS_DIR, `${base}.json`),
    `${JSON.stringify(rec, null, 2)}\n`,
    "utf8",
  );
  return rec;
}

/** 撤销 VIP：删除对应会员文件（与「未订阅」一致） */
export async function revokePaidMember(walletLower: string): Promise<boolean> {
  const base = memberJsonBasename(walletLower);
  if (!base) return false;
  const fp = path.join(MEMBERS_DIR, `${base}.json`);
  try {
    await fs.unlink(fp);
    return true;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return false;
    throw e;
  }
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
