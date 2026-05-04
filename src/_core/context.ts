import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authenticateRequest, type AuthUser } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await authenticateRequest(opts.req);
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
