import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

const DIR = path.join(process.cwd(), ".data", "billing", "stripe-customers");

export type StripeCustomerLinkFile = {
  customerId: string;
  updatedAt: string;
};

function safeBasename(walletLower: string): string | null {
  const w = walletLower.trim().toLowerCase();
  return isAddress(w) ? w : null;
}

function filePath(walletLower: string): string | null {
  const base = safeBasename(walletLower);
  if (!base) return null;
  return path.join(DIR, `${base}.json`);
}

export async function readStripeCustomerId(walletLower: string): Promise<string | null> {
  const fp = filePath(walletLower);
  if (!fp) return null;
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as StripeCustomerLinkFile;
    const id = typeof data.customerId === "string" ? data.customerId.trim() : "";
    return id || null;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function saveStripeCustomerId(
  walletLower: string,
  customerId: string,
): Promise<void> {
  const fp = filePath(walletLower);
  if (!fp) throw new Error("invalid_wallet");
  await fs.mkdir(DIR, { recursive: true });
  const payload: StripeCustomerLinkFile = {
    customerId: customerId.trim(),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(fp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
