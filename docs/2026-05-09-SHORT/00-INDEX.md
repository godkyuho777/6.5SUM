# 2026-05-09 SHORT 듀얼 시스템 — 작업 색인

오늘 (2026-05-09) 한 작업을 6 개의 MD 파일로 분리. 시간 순 / 영역별 정렬.

## 파일 목록

| # | 파일 | 영역 | 내용 |
|---|---|---|---|
| 00 | [00-INDEX.md](00-INDEX.md) | 메타 | 이 색인 |
| 01 | [01-BACKEND-SHORT-CORE.md](01-BACKEND-SHORT-CORE.md) | Backend / indicators | `decideShortEntry` / `detectBBStructureShort` / `calculateShortSignalStrength` / `isRisingKnife` 4 함수 + scanner 통합 |
| 02 | [02-BACKEND-ONCHAIN-SHORT-MIRROR.md](02-BACKEND-ONCHAIN-SHORT-MIRROR.md) | Backend / onchain | `applyOnchainShortToEntry` — multiplier 부호 반전 + 자본 보호 미러 |
| 03 | [03-BACKEND-LITE-TRANSLATOR.md](03-BACKEND-LITE-TRANSLATOR.md) | Backend / lite | `Recommendation` enum 에 `SHORT` / `STRONG_SHORT` 추가 + `deriveRecommendation` 확장 |
| 04 | [04-FRONTEND-SHORT-UI.md](04-FRONTEND-SHORT-UI.md) | Frontend | `LiteRecommendationBadge` SHORT 라벨, `Home.tsx` SIGNAL 배지, `Dashboard.tsx` variant 매핑, neon-orange 토큰 |
| 05 | [05-DEPLOYMENT-6-WAY-PUSH.md](05-DEPLOYMENT-6-WAY-PUSH.md) | DevOps | 백엔드 3 / 프론트엔드 3 = 6 push 타겟, 트러블슈팅 |
| 06 | [06-CHARTER-COMPLIANCE.md](06-CHARTER-COMPLIANCE.md) | 검증 | BBDX 헌장 5 규칙 점검 (4/5 통과, alpha 미검증) |

## 한 줄 요약

기존 LONG-only BBDX 시그널 시스템에 **SHORT 진입 path 를 별개로 추가** —
EXIT (LONG 청산) 의미 보존, 헌장 규칙 3 (modifier-only) 유지, 자본 보호
미러 (`strong_accumulation` × 평균회귀 SHORT BLOCKED) 적용. 백엔드 3 곳 +
프론트엔드 3 곳 = **6 push 완료**.

## 최종 SHA

| 영역 | SHA | 브랜치 |
|---|---|---|
| Backend | `329e226` | `feat/v6.5-merge`, `dev`, `v65sum/main`, `v65sum/dev` |
| Frontend | `6a00bc1` | `feat/v6.5-merge-frontend`, `dev`, `fe65/main` |

## 헌장 점검 (간략)

| 규칙 | 상태 |
|---|---|
| 1. 차원 중복 X | ✓ (LONG 미러) |
| 2. 백테스트 알파 | ⚠️ **미검증** — 후속 작업 |
| 3. 단독 시그널 X | ✓ (BBDX core + onchain modifier) |
| 4. 자본 보호 | ✓ (strong_accumulation BLOCKED) |
| 5. Knife 차단 | ✓ (isRisingKnife + lowerRiding 예외) |

## 다음 단계 (우선순위 순)

1. **백테스트 SHORT path 추가** — Charter Rule 2 (alpha 검증)
   - `signal-extractor.ts` lookahead-free SHORT 재생
   - `metrics.ts` LONG/SHORT 분리 집계
   - `cli.ts --side=long|short|both` flag
2. **사용자 Railway 인스턴스에 godkyuho777/6.5SUM 배포 활성화**
3. **Alpha 통과 시**:
   - `indicators-client.ts` 클라이언트 SHORT 미러
   - Lite Alerts SHORT 발송 활성화
4. **`translator.test.ts`** 에 SHORT 시나리오 3 케이스 추가
