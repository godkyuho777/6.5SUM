import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // P1-#4 (2026-05-23): tradelabCode + tradelabContext 를 client error.data 로 전송.
  // tradelabError(code, opts) 헬퍼로 throw 시 자동으로 metadata 첨부됨.
  errorFormatter({ shape, error }) {
    const tradelabCode = (error as any).tradelabCode;
    const tradelabContext = (error as any).tradelabContext;
    return {
      ...shape,
      data: {
        ...shape.data,
        ...(tradelabCode ? { tradelabCode } : {}),
        ...(tradelabContext ? { tradelabContext } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
