import { SignJWT, jwtVerify } from "jose";

import { AUTH_JWT_ISS } from "@/lib/auth/constants";

function getSecretKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET?.trim();
  const effective =
    raw && raw.length >= 16
      ? raw
      : process.env.NODE_ENV !== "production"
        ? "chenchen-lib-dev-auth-secret-not-for-prod"
        : "";
  if (!effective || effective.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short; set a long random string in the environment.",
    );
  }
  return new TextEncoder().encode(effective);
}

/** Issue a session JWT; `sub` is the author id (checksummed 0x address string). */
export async function signAuthToken(payload: {
  sub: string;
  email: string;
}): Promise<string> {
  const key = getSecretKey();
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(AUTH_JWT_ISS)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

export type VerifiedAuthPayload = {
  sub: string;
  email: string;
};

export async function verifyAuthToken(
  token: string,
): Promise<VerifiedAuthPayload | null> {
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: AUTH_JWT_ISS,
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email =
      typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}
