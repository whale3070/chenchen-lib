import { NextResponse, type NextRequest } from "next/server";

import { buildAuthSetCookie } from "@/lib/auth/cookie";
import { signAuthToken } from "@/lib/auth/jwt";
import {
  normalizeEmail,
  persistEmailUserRecord,
  prepareEmailRegistration,
} from "@/lib/server/email-auth-file-store";

export const runtime = "nodejs";

const AUTH_CONFIG_ERROR =
  "服务器未配置 AUTH_SECRET，无法签发登录凭证。请在运行环境中设置 AUTH_SECRET（至少 16 位随机字符串，例如 openssl rand -hex 32），然后重启应用。";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "请填写邮箱与密码" }, { status: 400 });
  }

  const prep = await prepareEmailRegistration(process.cwd(), email, password);
  if (!prep.ok) {
    return NextResponse.json({ error: prep.error }, { status: 400 });
  }

  const normalized = normalizeEmail(email);
  let token: string;
  try {
    token = await signAuthToken({
      sub: prep.record.authorId,
      email: normalized,
    });
  } catch {
    return NextResponse.json({ error: AUTH_CONFIG_ERROR }, { status: 503 });
  }

  try {
    await persistEmailUserRecord(process.cwd(), prep.record);
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err.message === "duplicate_email") {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          "无法写入用户数据（请检查进程对项目目录 .data 的写权限，或磁盘空间）。",
      },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    authorId: prep.record.authorId,
    email: normalized,
  });
  res.headers.append("Set-Cookie", buildAuthSetCookie(token, req));
  return res;
}
