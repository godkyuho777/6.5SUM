import type { TimeframeTrend, TrendDirection } from "../../trend/multi-tf";

export const tfTrendFixture = (
  tf: string,
  direction: TrendDirection
): TimeframeTrend => ({
  tf,
  direction,
  adx: 25,
  plusDi: 25,
  minusDi: 18,
  emaAlignment: "mixed",
});
