import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import { ENV } from "./env";

export type AuthUser = {
  /** Supabase auth.users.id (UUID) */
  id: string;
  email: string | null;
  role: "user" | "admin";
};

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (_jwks) return _jwks;
  if (!ENV.supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured");
  }
  _jwks = createRemoteJWKSet(
    new URL(`${ENV.supabaseUrl}/auth/v1/.well-known/jwks.json`)
  );
  return _jwks;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Verify the Supabase access token attached to the request and return the
 * derived application user. Returns null if no token is present or the token
 * is invalid — public procedures continue to work in either case.
 */
export async function authenticateRequest(
  req: Request
): Promise<AuthUser | null> {
  const token = extractBearer(req);
  if (!token) return null;

  if (!ENV.supabaseUrl) {
    console.warn("[Auth] SUPABASE_URL missing — rejecting token");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["RS256", "ES256"],
    });

    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) return null;

    const email =
      typeof payload.email === "string" && payload.email.length > 0
        ? payload.email
        : null;

    const role: AuthUser["role"] = ENV.adminUserIds.includes(sub)
      ? "admin"
      : "user";

    return { id: sub, email, role };
  } catch (error) {
    console.warn("[Auth] JWT verification failed:", String(error));
    return null;
  }
}
