/**
 * Investment Simulator DB helpers — 2026-05-15.
 *
 * 가상 자금 $200,000 USD 로 모의 거래. 실제 자본 영향 X.
 *
 * 핵심 함수:
 *   - getOrCreateAccount(userId) — 첫 호출 시 $200k 입금 + transaction 기록
 *   - listOpenPositions(userId) — 보유 포지션
 *   - openPosition(...) — 포지션 진입 (cash → margin lock)
 *   - closePosition(positionId, exitPrice) — 청산 + P&L 정산
 *   - listTransactions(userId, limit) — 거래 내역
 *   - resetAccount(userId) — 초기화 ($200k 재입금)
 *
 * 모든 *cash 변동* 은 transactions 테이블에 audit trail 로 기록.
 */
import { type SimAccountRow, type SimPositionRow, type SimTransactionRow } from "../../drizzle/schema";
export declare const SIMULATOR_INITIAL_CASH = 200000;
export declare const SIMULATOR_COMMISSION_RATE = 0.0001;
/**
 * 계정 조회 or 신규 생성 ($200k 입금).
 * @returns null = DB 미사용 환경 (Supabase 미설정)
 */
export declare function getOrCreateAccount(userId: string): Promise<SimAccountRow | null>;
/** 보유 포지션 (open status) */
export declare function listOpenPositions(userId: string): Promise<SimPositionRow[]>;
/** 전체 포지션 (open + closed + liquidated) */
export declare function listAllPositions(userId: string, limit?: number): Promise<SimPositionRow[]>;
export interface OpenPositionInput {
    userId: string;
    symbol: string;
    productType: "spot" | "perp";
    side: "long" | "short";
    leverage: number;
    entryPrice: number;
    quantity: number;
}
export interface OpenPositionResult {
    position: SimPositionRow;
    commission: number;
    marginLocked: number;
    newCash: number;
}
/**
 * 포지션 진입.
 *
 * 정산:
 *   positionValue = entryPrice × quantity
 *   margin = positionValue / leverage   (spot leverage=1 → margin = positionValue)
 *   commission = positionValue × 0.0001 × leverage  (0.01% × leverage)
 *   cash 차감 = margin + commission
 *   liquidationPrice = entryPrice × (1 - 0.95/leverage)  (long, 5% maintenance margin)
 *                    = entryPrice × (1 + 0.95/leverage)  (short)
 */
export declare function openPosition(input: OpenPositionInput): Promise<OpenPositionResult | {
    error: string;
}>;
export interface ClosePositionInput {
    userId: string;
    positionId: number;
    exitPrice: number;
    reason?: string;
}
export interface ClosePositionResult {
    position: SimPositionRow;
    pnl: number;
    exitCommission: number;
    netCashReturn: number;
    newCash: number;
}
/**
 * 포지션 청산.
 *
 * 정산:
 *   pnl_raw = (exit - entry) × qty × leverage           (long)
 *           = (entry - exit) × qty × leverage           (short)
 *   exit_commission = positionValue(@exit) × 0.0001 × leverage
 *   net_return = margin + pnl_raw - exit_commission - accruedFunding
 *   cash 증가 = net_return
 */
export declare function closePosition(input: ClosePositionInput): Promise<ClosePositionResult | {
    error: string;
}>;
/** 거래 내역 */
export declare function listTransactions(userId: string, limit?: number): Promise<SimTransactionRow[]>;
/**
 * 계정 초기화 — 모든 open 포지션 강제 종료 + $200k 재입금.
 * 사용자가 "다시 시작" 클릭 시.
 */
export declare function resetAccount(userId: string): Promise<{
    reset: true;
}>;
/** 보유 포지션 currentPrice mark-to-market 갱신 */
export declare function markToMarket(userId: string, prices: Map<string, number>): Promise<void>;
