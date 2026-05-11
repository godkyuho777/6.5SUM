/**
 * MacroLayer 공용 타입 — MACRO_LIQUIDITY_TRACKER_v2 §1.2 의 macro layer 표면.
 *
 * 본 파일은 백테스트 timeline (3-layer LayeredSnapshot) 의 macro layer 와
 * 동일한 형상이며, `src/backtest/timeline-types.ts` 의 `MacroLayer` 를 그대로
 * 재노출한다. macro 도메인 내부 / 다른 비-백테스트 모듈이 import 할 때
 * "backtest" 경로를 거치지 않도록 분리.
 *
 * 신규 모듈은 본 파일을 사용. 기존 백테스트 코드는 `timeline-types` 를 계속.
 */
export type { MacroLayer, CompositeSignals, CyclePhase, MacroRegime, } from "../backtest/timeline-types";
