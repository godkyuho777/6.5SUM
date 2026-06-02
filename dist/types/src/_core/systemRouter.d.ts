export declare const systemRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: import("./context").TrpcContext;
    meta: object;
    errorShape: {
        data: {
            tradelabContext?: any;
            tradelabCode?: any;
            code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
        };
        message: string;
        code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
    };
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    health: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            timestamp: number;
        };
        output: {
            ok: boolean;
        };
        meta: object;
    }>;
}>>;
