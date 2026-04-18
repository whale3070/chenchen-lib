import { NextResponse, type NextRequest } from "next/server";

import { buildAuthSetCookie } from "@/lib/auth/cookie";
import { signAuthToken } from "@/lib/auth/jwt";
import { verifyEmailLogin } from "@/lib/server/email-auth-file-store";

export const runtime = "nodejs";

const AUTH_CONFIG_ERROR =
  "服务器未配置 AUTH_SECRET，无法签发登录凭证。请在运行环境中设置 AUTH_SECRET（至少 16 位随机字符串），然后重启应用。";

export async function POST(req: NextRequest) {
  try {
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

    let login: Awaited<ReturnType<typeof verifyEmailLogin>>;
    try {
      login = await verifyEmailLogin(process.cwd(), email, password);
    } catch (inner: unknown) {
      if (
        inner instanceof Error &&
        inner.message === "EMAIL_AUTH_STORE_CORRUPT"
      ) {
        return NextResponse.json(
          {
            error:
              "用户数据文件损坏或无法读取，请检查服务器 .data/auth 目录或联系管理员。",
          },
          { status: 503 },
        );
      }
      throw inner;
    }
    if (!login.ok) {
      return NextResponse.json({ error: login.error }, { status: 401 });
    }

    let token: string;
    try {
      token = await signAuthToken({
        sub: login.authorId,
        email: login.email,
      });
    } catch {
      return NextResponse.json({ error: AUTH_CONFIG_ERROR }, { status: 503 });
    }
    const res = NextResponse.json({
      authorId: login.authorId,
      email: login.email,
    });
    res.headers.append("Set-Cookie", buildAuthSetCookie(token, req));
    return res;
  } catch (e: unknown) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { error: "登录处理失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
