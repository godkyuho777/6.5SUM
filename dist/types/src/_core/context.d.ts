import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { type AuthUser } from "./auth";
export type TrpcContext = {
    req: CreateExpressContextOptions["req"];
    res: CreateExpressContextOptions["res"];
    user: AuthUser | null;
};
export declare function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext>;
