/**
 * KRW/USD FX source — stub.
 *
 * STUB FOR PR-1. PR-2 will fetch from a free endpoint
 * (e.g. exchangerate.host) and compute the 30d delta.
 *
 * BOK base rate comes from FRED (`IRSTCB01KRM156N`) via `fred.ts`.
 */
export interface KrwUsdSnapshot {
    rate: number;
    /** 30d change in fractional units, e.g. +0.04 = KRW weakened 4%. */
    change30d: number;
    asOf: number;
}
export declare function fetchKrwUsd(): Promise<KrwUsdSnapshot | null>;
