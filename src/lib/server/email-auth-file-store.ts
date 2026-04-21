import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { getAddress } from "viem";

export type EmailUserRecord = {
  email: string;
  passwordHash: string;
  authorId: string;
  createdAt: string;
};

type StoreFile = {
  users: EmailUserRecord[];
};

const STORE_VERSION = 1 as const;

function storePath(cwd: string) {
  return path.join(cwd, ".data", "auth", `email-users.v${STORE_VERSION}.json`);
}

async function readStore(cwd: string): Promise<StoreFile> {
  const fp = storePath(cwd);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return { users: parsed.users };
  } catch (e: unknown) {
    const err = e as { code?: string; name?: string };
    if (err.code === "ENOENT") return { users: [] };
    if (e instanceof SyntaxError) {
      console.error("[email-auth] invalid JSON in store:", fp, e);
      throw new Error("EMAIL_AUTH_STORE_CORRUPT");
    }
    throw e;
  }
}

async function writeStore(cwd: string, data: StoreFile): Promise<void> {
  const fp = storePath(cwd);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Random checksummed 0x address — used as authorId for email accounts (compatible with viem isAddress). */
export function newEmailAuthorId(): `0x${string}` {
  const hex = randomBytes(20).toString("hex");
  return getAddress(`0x${hex}`);
}

/**
 * 校验并生成待入库用户（尚未写入磁盘）。用于在签发 JWT 成功后再持久化，避免 AUTH_SECRET 缺失时已写入导致 500。
 */
export async function prepareEmailRegistration(
  cwd: string,
  emailRaw: string,
  password: string,
): Promise<
  { ok: true; record: EmailUserRecord } | { ok: false; error: string }
> {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "邮箱格式无效" };
  }
  if (password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }

  const store = await readStore(cwd);
  if (store.users.some((u) => u.email === email)) {
    return { ok: false, error: "该邮箱已注册" };
  }

  const authorId = newEmailAuthorId();
  const passwordHash = await hash(password, 10);
  const record: EmailUserRecord = {
    email,
    passwordHash,
    authorId,
    createdAt: new Date().toISOString(),
  };
  return { ok: true, record };
}

export async function persistEmailUserRecord(
  cwd: string,
  record: EmailUserRecord,
): Promise<void> {
  const store = await readStore(cwd);
  if (store.users.some((u) => u.email === record.email)) {
    throw new Error("duplicate_email");
  }
  store.users.push(record);
  await writeStore(cwd, store);
}

/** @deprecated 使用 prepareEmailRegistration + persistEmailUserRecord；保留兼容导出 */
export async function registerEmailUser(
  cwd: string,
  emailRaw: string,
  password: string,
): Promise<{ ok: true; authorId: string } | { ok: false; error: string }> {
  const prep = await prepareEmailRegistration(cwd, emailRaw, password);
  if (!prep.ok) return prep;
  await persistEmailUserRecord(cwd, prep.record);
  return { ok: true, authorId: prep.record.authorId };
}

/** 供管理员等场景：根据注册邮箱解析作者 ID（与 VIP 文件名一致）。未注册则返回 null。 */
export async function findAuthorIdByEmail(
  cwd: string,
  emailRaw: string,
): Promise<string | null> {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  const store = await readStore(cwd);
  const user = store.users.find((u) => u.email === email);
  return user?.authorId ?? null;
}

/** 会员列表展示：由作者 ID（小写 0x）反查注册邮箱，无则 null。 */
export async function findEmailByAuthorId(
  cwd: string,
  authorIdLower: string,
): Promise<string | null> {
  const id = authorIdLower.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(id)) return null;
  const store = await readStore(cwd);
  const user = store.users.find((u) => u.authorId.toLowerCase() === id);
  return user?.email ?? null;
}

export async function verifyEmailLogin(
  cwd: string,
  emailRaw: string,
  password: string,
): Promise<
  { ok: true; authorId: string; email: string } | { ok: false; error: string }
> {
  const email = normalizeEmail(emailRaw);
  const store = await readStore(cwd);
  const user = store.users.find((u) => u.email === email);
  if (!user) {
    return { ok: false, error: "邮箱或密码错误" };
  }
  const hashStr =
    typeof user.passwordHash === "string" ? user.passwordHash : "";
  if (!hashStr) {
    return { ok: false, error: "邮箱或密码错误" };
  }
  let match = false;
  try {
    match = await compare(password, hashStr);
  } catch (e) {
    console.error("[email-auth] bcrypt.compare failed", e);
    return { ok: false, error: "邮箱或密码错误" };
  }
  if (!match) {
    return { ok: false, error: "邮箱或密码错误" };
  }
  return { ok: true, authorId: user.authorId, email: user.email };
}
