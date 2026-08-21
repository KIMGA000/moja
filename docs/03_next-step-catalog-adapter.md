# 다음 단계 — 자연어 기준 카탈로그 + 프로필 어댑터

`01_통합_프롬프트.md`의 **[2단계]를 이 문서로 대체**합니다. 실제 저장소(`moja`, `dev` 기반)에는
팀원분이 만든 온보딩 프로필이 이미 있어서, 필드 이름을 우리가 새로 정할 수 없습니다.

---

## 0. 먼저 — 두 개의 프로필 모양이 충돌한다

| 팀원분 `OnboardingProfile`<br>(`app/data/eligibility.ts`) | 우리 엔진 `Profile`<br>(`lib/engine/types.ts`) | 문제 |
|---|---|---|
| `hasInstitutionalExperience: boolean \| null` | `hasInstitutionalCare: boolean` | 이름만 다름 |
| `protectionEndType`: `AGE18_END` / `EXTENDED_END` / `EARLY_END` / `REPROTECTED_END` / `CURRENTLY_PROTECTED` (5종 enum) | `exitType`: `만기`/`연장`/`조기` + `isCurrentlyProtected` + `isCurrentlyReprotected` (enum + boolean 2개) | **팀원분 쪽이 낫다** |
| `currentStatus`: `UNIV`/`GRAD`/`EMPLOYED`/`UNEMPLOYED`/`OTHER` (**단일선택**) | `isEnrolled` + `isEmployed` (**독립 2개**) | **우리 쪽이 맞다** |
| `ownsHome` | `ownsHouse` | 이름만 다름 |
| `maritalStatus` | `isMarried` | 이름만 다름 |
| `basicLivelihoodRecipient`: `Y`/`N`/`UNKNOWN` | `isBasicLivelihoodRecipient: boolean` | **정책 충돌** (아래 참고) |
| `nearPoorMedicalReduction`: `Y`/`N`/`UNKNOWN` | `isNearPoorMedicalDiscount: boolean` | **정책 충돌** |
| `currentBenefits: string[]` | `currentSupports: string[]` | 이름만 다름 |
| `returnedToBirthFamily` | (없음) | 조기종료자 원가정 복귀 여부 — 엔진에 추가 필요 |
| (없음) | `incomeBracket` | **온보딩에 소득 문항이 없다** |

### 결정: 팀원분 `OnboardingProfile`을 정본으로 삼고 어댑터를 만든다

이유:
1. `EligibilityFlow.tsx`(1032줄)가 이미 이 모양으로 답변을 만든다. 이걸 다시 짜는 건 비용이 크다.
2. **`protectionEndType` 5종 enum이 우리 boolean 조합보다 우수하다.** 내가
   `01_통합_프롬프트.md` 4단계에서 "정합성 이슈 ①③④"로 지적했던 문제
   (재보호가 exitType 값이라 절대 참이 안 됨 / 현재 보호중 경로가 없음)를 팀원분은
   **이미 구조적으로 해결해뒀다.** 5종 단일 enum이면 그런 모순이 생길 수 없다.
3. 우리 `lib/engine`은 순수 함수다. 입력 모양만 맞춰주면 로직은 그대로 쓸 수 있다.

**따라서 `lib/engine/types.ts`의 `RawProfileInput`을 고치지 말고, 어댑터를 새로 만든다.**

---

## [작업 1] 프로필 어댑터 — `lib/criteria/adaptProfile.ts`

`OnboardingProfile` → 엔진 `RawProfileInput` 변환 함수를 만들어줘.

```ts
export function toEngineProfile(p: OnboardingProfile): RawProfileInput
```

### 변환 규칙

```
hasInstitutionalExperience  →  hasInstitutionalCare   (null 은 false 로 보지 말고 undefined 로.
                                                       게이트 미응답과 "아니오"는 다르다)
birthDate                   →  birthDate
protectionEndDate           →  protectionEndDate      (빈 문자열이면 null)
region                      →  region
ownsHome                    →  ownsHouse
maritalStatus               →  isMarried
currentBenefits             →  currentSupports        ("NONE"/"UNKNOWN" 토큰은 걸러낸다)

protectionEndType 분해:
  AGE18_END           →  exitType='만기',  isCurrentlyProtected=false, isCurrentlyReprotected=false
  EXTENDED_END        →  exitType='연장',  isCurrentlyProtected=false, isCurrentlyReprotected=false
  EARLY_END           →  exitType='조기',  isCurrentlyProtected=false, isCurrentlyReprotected=false
  REPROTECTED_END     →  exitType='만기',  isCurrentlyProtected=false, isCurrentlyReprotected=true
  CURRENTLY_PROTECTED →  exitType=undefined, isCurrentlyProtected=true, isCurrentlyReprotected=false
                         + protectionEndDate 는 "예정일"이므로 null 로 넘긴다
                           (그러면 daysUntilFiveYearDeadline 이 null 이 되고,
                            classify() 가 '예정' 상태로 분류한다 — 4단계 이슈 ③ 해결)

currentStatus 분해 (⚠️ 정보 손실 있음):
  UNIV       →  isEnrolled=true,  isEmployed=false
  GRAD       →  isEnrolled=true,  isEmployed=false
  EMPLOYED   →  isEnrolled=false, isEmployed=true
  UNEMPLOYED →  isEnrolled=false, isEmployed=false
  OTHER      →  isEnrolled=false, isEmployed=false
  null       →  둘 다 undefined
```

### ⚠️ `currentStatus` 단일선택은 실제 결함이다 — 반드시 표시해줘

`docs/모자_온보딩10문항_검증보고서.pdf` Q4가 이걸 **"가장 시급한 수정 대상"** 으로 지목했다.
근거: 대한법률구조공단은 `청년미취업자(15~29세)` 트랙과 `대학생(재학·휴학)` 트랙을 **서로 다른
트랙으로 관리**하고, 자립지원시설 입소 경로도 `취업 중` / `취업 준비 중` / `기초생활수급자`가
**각각 독립된 축**이다. 즉 "재학이면서 미취업"인 사람이 실제로 많고 제도가 그걸 구분한다.

그런데 `currentStatus`는 배타적 단일선택이라 이 상태를 표현할 수 없다.
`UNIV`를 고른 재학생은 어댑터에서 `isEmployed=false`로 강제되는데, 실제로 일하는 재학생은
취업 관련 지원에서 잘못 판정된다.

**어댑터에서 이 손실을 숨기지 말고 표시해줘.**

```ts
export type AdaptResult = {
  profile: RawProfileInput;
  /** 온보딩 문항 구조 때문에 확정할 수 없었던 필드 + 사용자에게 보여줄 안내 문구 */
  lossyFields: { field: string; reason: string }[];
};
```

`lossyFields`에 들어간 필드를 참조하는 조건은 결과 카드에 **`확인 필요`** 배지가 뜨게 해줘.
(엔진의 `riskyField` / `uncertaintyFlags` 경로를 그대로 쓴다.)

**문항 분리는 지금 하지 마.** `EligibilityFlow.tsx`(1032줄)를 손대는 건 별도 작업으로 미룬다.
지금은 어댑터가 손실을 정직하게 표시하는 것까지만 한다.

### `Y`/`N`/`UNKNOWN` 처리 — "확답만 받는다" 원칙과 맞추기

팀원분 코드는 `basicLivelihoodRecipient`, `nearPoorMedicalReduction`을 `Y`/`N`/`UNKNOWN`
3지선다로 받는다. 우리는 **입력에서 `모름`을 없애고, 불확실성은 결과 카드에서 처리**하기로 정했다.

**지금 당장 UI를 바꾸지는 말고, 어댑터에서 이렇게 처리해줘.**

```
'Y'       →  true
'N'       →  false
'UNKNOWN' →  false  +  lossyFields 에 추가
             (탈락시키지 않는다. 다만 이 필드를 쓰는 제도는 '확인 필요' 배지가 뜬다)
```

`UNKNOWN`을 `true`로 보내면 안 된다. `near_poor_excluded`가 `exclude` 방향이라
`true`면 **탈락**이 되고, 모르는 사람이 받을 수 있는 지원을 놓친다.
`false` + `확인 필요`가 맞다 — **놓치는 오류가 헛걸음 오류보다 나쁘다.**

나중에 UI를 고칠 때는 문항 자체를 답할 수 있게 바꾼다:
- "차상위 본인부담경감 대상자로 **선정된 적이 있나요**?" (예/아니오)
  힌트: *"직접 신청해서 선정되는 제도예요. 신청한 기억이 없으면 아니오예요."*

### `incomeBracket` — 온보딩에 소득 문항이 없다

팀원분 온보딩에 소득 문항이 아예 없어서 `incomeBracket`을 채울 수 없다.
어댑터에서 `undefined`로 두고 `lossyFields`에 추가해줘.
`income_at_most` 기준이 붙은 제도는 전부 `확인 필요`로 나간다.

문항 추가는 나중에. 추가할 때는 **"중위소득 몇 %"가 아니라 실제 월 소득 금액 범위**로 묻고
% 환산은 엔진이 한다 (사용자에게 판단을 시키지 않는다).

---

## [작업 2] 자연어 기준 카탈로그 — `lib/criteria/catalog.ts`

`01_통합_프롬프트.md` [2단계]의 카탈로그를 그대로 만들되, **`onboardingField`는 아래 표에
있는 이름만** 쓴다 (팀원분 `OnboardingProfile` 기준).

### `onboardingField`에 쓸 수 있는 값

| 값 | 출처 | 상태 |
|---|---|---|
| `hasInstitutionalExperience` | 온보딩 Q1 게이트 | 사용 가능 |
| `birthDate` | 온보딩 | 사용 가능 |
| `protectionEndType` | 온보딩 | 사용 가능 |
| `protectionEndDate` | 온보딩 | 사용 가능 |
| `region` | 온보딩 | 사용 가능 |
| `ownsHome` | 온보딩 | 사용 가능 |
| `maritalStatus` | 온보딩 | 사용 가능 |
| `basicLivelihoodRecipient` | 온보딩 | 사용 가능 (UNKNOWN 시 확인 필요) |
| `nearPoorMedicalReduction` | 온보딩 | 사용 가능 (UNKNOWN 시 확인 필요) |
| `currentBenefits` | 온보딩 | 사용 가능 |
| `currentStatus` | 온보딩 | **부분 사용** — 재학·취업 동시 상태를 구분 못 함 |
| `returnedToBirthFamily` | 온보딩 | 사용 가능 (조기종료자만 의미 있음) |
| `incomeBracket` | **없음** | **문항 추가 전까지 확인 필요로만** |
| `protectionStartDate` | **없음** | **문항 추가 전까지 확인 필요로만** |

카탈로그 항목에 `blockedBy?: 'missing_question' \| 'lossy_question'` 필드를 추가해서,
아직 온보딩으로 판정 불가한 기준을 명시적으로 표시해줘. 검수 화면에서 이 기준을 붙일 때
검수자에게 *"이 조건은 지금 자동 판정이 안 되고 '확인 필요'로만 나갑니다"* 라고 알려준다.

### 반드시 지킬 것 (01 프롬프트 2단계와 동일)

1. `no_house_required` / `unmarried_required` 등 "~면 제외"류는 **`direction: 'exclude'`**.
   문장은 긍정형인데 조건은 exclude다. 섞으면 판정이 정반대가 된다.
2. `manual_check_only` / `first_come_first_served` / `one_time_only`는
   **`toCondition`이 `null`을 반환**하고 판정에서 탈락시키지 않는다.
   `확인 필요` 배지만 띄우고 `신청가능`은 유지한다.
3. `toCondition` 출력은 **`lib/engine/evaluate.ts`를 한 줄도 고치지 않고** 먹혀야 한다.
4. 새 필드를 쓰면 **`lib/engine/fields.ts`의 목록에도 추가**해라.
   안 하면 `npm run qa:engine`이 실패한다.
5. 문장 스타일: 해요체 / 행정용어 풀어쓰기 / 부정의 부정 금지 / 숫자는 굵게 /
   `rejectSentence`는 사람을 탓하지 않게. `checkSentenceStyle()`로 lint까지 만들어라.

---

## [작업 3] 검증

```
npm run typecheck
npm run qa:engine     ← 새로운 차이가 나면 안 된다
```

그리고 **어댑터 테스트**를 `docs/qa/adapt-profile.test.ts`로 만들어줘.
`protectionEndType` 5종 × `currentStatus` 5종 = 25조합을 어댑터에 넣고,
- `CURRENTLY_PROTECTED`가 `예정` 상태로 분류되는지
- `REPROTECTED_END`가 `isCurrentlyReprotected=true`로 가는지
- `UNKNOWN`이 `false` + `lossyFields`로 가는지 (`true`가 되면 실패)
- `UNIV`가 `isEnrolled=true`로 가는지

를 확인해줘. `package.json`에 `"qa:adapter"` 스크립트도 추가해라.

---

## 이번 단계에서 하지 않을 것 (다음으로 미룸)

- `EligibilityFlow.tsx` 문항 분리 (재학/취업, 소득 구간, 보호 시작일)
- `realMatch.ts`를 엔진 어댑터로 교체 → **이게 바로 다음 단계**
- 관리자 검수 화면
- `app/data/eligibility.ts`의 21개 제도 룰 → `data/seed/policies.json`으로 통합

한 번에 다 건드리면 무엇이 깨졌는지 못 찾는다. 카탈로그와 어댑터까지만 하고 멈춰줘.
