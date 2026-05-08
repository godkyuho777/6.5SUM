import type { Request } from "express";
export type AuthUser = {
    /** Supabase auth.users.id (UUID) */
    id: string;
    email: string | null;
    role: "user" | "admin";
};
/**
 * Verify the Supabase access token attached to the request and return the
 * derived application user. Returns null if no token is present or the token
 * is invalid — public procedures continue to work in either case.
 */
export declare function authenticateRequest(req: Request): Promise<AuthUser | null>;
