/**
 * FRED API client — stub.
 *
 * STUB FOR PR-1. PR-2 will fetch:
 *   - SOFR
 *   - IORB
 *   - RRPONTSYD (RRP balance)
 *   - WTREGEN (Treasury General Account)
 *   - WALCL (Fed balance sheet)
 *   - FEDFUNDS
 *   - CPIAUCSL (for real-rate calc)
 *   - IRSTCB01KRM156N (BOK rate)
 *
 * Each behind a simple wrapper around `https://api.stlouisfed.org/`,
 * cached 12h. Falls back to last-cached value on 429 (free-tier
 * rate limit). Add `FRED_API_KEY` to `.env` for production.
 */
export interface FredSeriesSnapshot {
    seriesId: string;
    /** Latest observed value. */
    value: number;
    /** Date of the observation as ISO 8601. */
    date: string;
}
export declare function fetchFredSeries(_seriesId: string): Promise<FredSeriesSnapshot | null>;
