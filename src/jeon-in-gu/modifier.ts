/**
 * JEON_IN_GU Contrarian Modifier — Phase 3 placeholder (stub).
 *
 * 명세: JEON_IN_GU_SIGNAL_TRACKER.md §3.3 (Phase 3).
 *
 * 현재 상태: stub-only. 항상 modifierValue=0 / contrarianDirection="neutral".
 * 실제 산출은 Phase 3 에서 구현 — 외부 의존성 (YOUTUBE_API_KEY + ANTHROPIC_API_KEY
 * + 변호사 검토) 통과 후. 자세한 대기 사유는 docs/SCHEDULE_DEFERRED.md D-002.
 *
 * 헌장 R3 (modifier-only): 본 함수의 반환값은 BBDX v6.6 weighted sum 의 6차원
 * macro layer 항으로만 흘러간다. 단독 진입 시그널 발행 X.
 *
 * 활성 조건:
 *   - YOUTUBE_API_KEY + JEON_IN_GU_CHANNEL_ID + ANTHROPIC_API_KEY 모두 설정
 *   - ENABLE_JEON_IN_GU=true Feature Flag
 *   - 변호사 검토 완료 (명예훼손 위험)
 *   - DB 0006 마이그레이션 적용
 */

import type { JeonInGuModifierResult } from "./types";
import { JEON_IN_GU_CONFIG, isJeonInGuEnabled } from "./constants";

/**
 * 단일 (symbol, side) 의 전인구 contrarian modifier 산출 — 현재 stub.
 *
 * Phase 3 실제 구현 시 동작:
 *   1. DB `jeon_in_gu_contents` SELECT — processed=true AND
 *      published_at >= now() - 36h AND sentiment_confidence >= 0.7.
 *   2. 각 콘텐츠의 시간 감쇠 계산: decay = max(0, 1 - age_hours / 36).
 *   3. contrarian = -sentiment_score  (역지표 반전).
 *   4. side="long" 이면 modifier = contrarian × 0.50 × decay × confidence,
 *      side="short" 이면 modifier = -contrarian × 0.50 × decay × confidence.
 *   5. 여러 콘텐츠 평균화 (최근 가중 60%, 평균 40%).
 *   6. clamp [-0.50, +0.50].
 *
 * @param symbol "BTCUSDT" 등. detected_assets 매칭에 사용 (Phase 3).
 * @param side   "long" | "short" — BBDX 진입 방향에 맞춘 역지표 반전.
 */
export async function computeJeonInGuModifier(
  symbol: string,
  side: "long" | "short",
): Promise<JeonInGuModifierResult> {
  // 헌장 R3 + 안전 장치: 외부 의존성 미설정 → 0 반환 (BBDX 점수 영향 X).
  if (!isJeonInGuEnabled()) {
    return {
      modifierValue: 0,
      source: "jeon_in_gu",
      decay: 0,
      contrarianDirection: "neutral",
      sourceCount: 0,
      reason:
        "JEON_IN_GU integration pending — API keys + lawyer review required (see docs/SCHEDULE_DEFERRED.md D-002)",
    };
  }

  // TODO(Phase 3): 실제 구현
  //   1. DB jeon_in_gu_contents fetch (processed=true,
  //      published_at >= now() - JEON_IN_GU_CONFIG.DECAY_HOURS,
  //      sentiment_confidence >= JEON_IN_GU_CONFIG.MIN_CONFIDENCE,
  //      market_direction != 'unclear')
  //   2. detected_assets 에 symbol 베이스 (BTC, ETH 등) 포함된 콘텐츠 우선
  //   3. age_hours = (now - published_at) / 1h
  //      decay = max(0, 1 - age_hours / DECAY_HOURS)
  //   4. contrarian = -sentiment_score
  //      매칭 부호 = side === 'long' ? +1 : -1
  //      contribution = contrarian × matchSign × WEIGHT × decay × confidence
  //   5. 다중 콘텐츠: 최근 가중 60% + 평균 40%
  //   6. clamp [-WEIGHT, +WEIGHT] = [-0.50, +0.50]
  //   7. contrarianDirection 결정:
  //        modifier >  0.05 → side (long/short)
  //        modifier < -0.05 → opposite side
  //        else            → "neutral"
  void symbol;
  void side;
  void JEON_IN_GU_CONFIG;

  return {
    modifierValue: 0,
    source: "jeon_in_gu",
    decay: 0,
    contrarianDirection: "neutral",
    sourceCount: 0,
    reason: "stub — Phase 3 implementation pending",
  };
}
