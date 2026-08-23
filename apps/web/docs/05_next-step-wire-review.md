# [다음 단계] 검수 결과를 화면에 연결하기 — realMatch.ts 교체

이 프로젝트에서 가장 중요한 작업이다. 지금까지 만든 것(자연어 기준 카탈로그, 검수 컬럼,
판정엔진)이 **여기서 처음으로 사용자 화면과 이어진다.**

## ⚠️ 먼저 — 이 작업 전에 반드시 해야 할 것

Supabase 대시보드 SQL Editor에서 **순서대로** 실행되어 있어야 한다. 안 되어 있으면
`criteria` / `conditions` 컬럼이 없어서 이 작업 전체가 막힌다.

```
apps/web/supabase/0002_security_fix.sql   ← 아직이면 지금. 검수 전 데이터가 새고 있다
apps/web/supabase/0003_criteria.sql
```

실행 여부는 SQL Editor에서 확인할 수 있다:
```sql
select column_name from information_schema.columns
where table_name = 'announcements_central' and column_name in ('criteria','conditions');
-- 2행이 나와야 한다
```

---

## 지금 무엇이 잘못되어 있나

`apps/web/app/api/announcements/route.ts`는 `raw_data`만 꺼내고,
`apps/web/app/data/realMatch.ts`가 그 원문 텍스트를 **매 요청마다 정규식으로 다시 분석**한다.

```ts
// realMatch.ts 현재 구조
if (!/5년/.test(text)) return null;
if (!text.includes("무주택")) return null;
const eduKeywords = ["등록금", "학자금", "장학금", "대학생"];
```

그래서 DB의 `criteria`·`conditions`는 물론이고 `mentions_care_leaver` 같은 분류 컬럼도
**아무도 읽지 않는다.** 팀이 며칠 검수해도 사용자 화면은 그대로다.
`review_status`만 예외적으로 반영된다(approved 필터).

**검수 시스템을 만드는 이유 자체가 무력화된 상태다.** 이번에 그걸 끝낸다.

---

## [작업 1] 판정엔진에 '예정' 상태 추가 — 4분류로 확장

`packages/core/src/engine/evaluate.ts`의 `classify()`를 고친다. 이건 지금까지 미뤄온
`01_통합_프롬프트.md` [4단계] 정합성 이슈 ③이다.

### 문제

`evalOp`의 `>=`는 `actual != null && actual >= expected`다. 그래서 아직 보호가 끝나지
않은 사용자(`protectionEndDate`가 없어 `daysUntilFiveYearDeadline`이 null)는
**5년 조건이 붙은 제도 전부에서 탈락**한다.

하지만 보호종료 예정자에게 "5년 이내" 제도는 **놓친 게 아니라 아직 시작 전**이다.
`이미놓침`이라고 안내하면 받을 수 있는 지원을 포기하게 만든다.

### 고칠 내용

`ClassificationStatus`에 `'예정'`을 추가하고, `classify()`에서:

```
eligible = false 이고,
  탈락 사유가 daysUntilFiveYearDeadline 이 null 인 것뿐이라면
    → '예정'
  그 외
    → '이미놓침'
```

"탈락 사유가 그것뿐인지"를 알려면 `evaluatePolicy`가 **어느 조건 때문에 떨어졌는지**를
남겨야 한다. `PolicyEvalResult`에 `failedFields: string[]`를 추가해서, 실패한 조건이
참조한 필드명을 모아줘. `classify()`는 그걸 보고 판단한다.

```
failedFields 가 ['daysUntilFiveYearDeadline'] 하나뿐이고
profile.daysUntilFiveYearDeadline === null  →  '예정'
```

`evalOp` 자체는 **고치지 마.** 엔진의 비교 로직을 건드리면 회귀 테스트의 기준이 사라진다.
`classify()`와 `evaluatePolicy`의 결과 수집만 바꾼다.

정렬 순서: `곧마감` > `신청가능` > `예정` > `이미놓침`

### 회귀 테스트 갱신

`packages/core/docs/qa/engine-diff.ts`의 `EXPECTED_DIFFS`에 항목을 추가해줘.

```ts
{ id: 'status:planned',
  why: "보호가 아직 끝나지 않은 사용자(daysUntilFiveYearDeadline=null)를 '이미놓침'이 " +
       "아니라 '예정'으로 분류. 아직 시작 전인 것을 놓쳤다고 안내하면 안 된다." }
```

그리고 **차분 로직도 이 케이스를 인식하게** 고쳐줘 — 지금은 status가 다르면
`status:${policyId}` 태그를 붙이는데, `이미놓침 → 예정` 변화는 `status:planned`로 태그해야
EXPECTED_DIFFS에 걸린다.

`docs/qa/adapt-profile.test.ts`의 "[2] CURRENTLY_PROTECTED" 항목도 이제 `예정`까지
검증하도록 확장해줘 (지금은 daysUntilFiveYearDeadline이 null인지까지만 본다).

---

## [작업 2] API가 검수 결과를 내려보내게

`apps/web/app/api/announcements/route.ts`를 고친다.

### 2-1. 보안 수정 (QA-3) — 같이 한다

지금 이 라우트는 **service role 키**(`createSupabaseAdminClient`)로 조회하면서
`review_status = 'approved'` 필터를 애플리케이션 코드에 건다. 코드 주석도
*"이 필터를 빼면 안 된다"*고 경고한다 — **보안이 주석에 의존하는 상태**다.

0002를 실행했으면 뷰에 RLS가 걸렸으니, **anon 클라이언트로 바꿔라.**
그러면 코드에서 필터를 실수로 빼도 DB가 막아준다. 이중 방어선이다.

```ts
import { supabase } from '../../../lib/supabase';   // anon 클라이언트
```

`supabase`가 null일 수 있으니(환경변수 미설정) 그 경우 500 대신 **빈 배열 + 경고 로그**로
응답해줘. 키 하나 없다고 화면 전체가 죽으면 안 된다.

### 2-2. 내려보낼 필드 추가

`raw_data`만이 아니라 아래를 함께 반환한다.

```
source, id, source_id, raw_data,
criteria, conditions,          -- 검수된 기준
region_scope, deadline,
mentions_care_leaver, mentions_youth,
requires_enrolled, requires_no_home, requires_basic_livelihood, requires_already_ended,
protection_years_limit,
review_status, reviewed_at
```

응답 타입은 `packages/core`가 아니라 `apps/web`에 정의해라 — 이건 웹 API 계약이다.

---

## [작업 3] realMatch.ts 를 얇은 어댑터로 교체 ★

`apps/web/app/data/realMatch.ts`를 **판정엔진 호출로 완전히 바꾼다.**

### 새 구조

```ts
import { toEngineProfile, computeProfile, evaluateAll, type Policy } from '@moja/core';

export function matchRealItems(items: AnnouncementItem[], profile: OnboardingProfile, todayIso: string) {
  const { profile: raw, lossyFields } = toEngineProfile(profile);
  const engineProfile = computeProfile(raw, new Date(todayIso));

  const policies: Policy[] = items.map(toPolicyShape);   // 아래 참고
  const results = evaluateAll(engineProfile, policies, []);
  // → lossyFields 를 결과의 '확인 필요'에 합쳐서 반환
}
```

### 공고 → Policy 변환 (`toPolicyShape`)

```
검수된 공고 (conditions 가 비어있지 않음)
  → conditions 를 그대로 쓴다. 이게 목표 경로다.

검수 전 공고 (conditions 가 빈 배열)
  → mentions_* / requires_* / region_scope / protection_years_limit 컬럼으로
    조건을 조립한다. 그리고 결과에 '검수 전' 배지를 붙인다.
```

**폴백에서도 원문 정규식을 다시 돌리지 마라.** DB 컬럼만 쓴다.
정규식을 남겨두면 두 개의 판정 경로가 생기고, 그게 이 프로젝트에서 이미 두 번 사고를 낸
패턴이다(지역 로직 복붙 → 전북 공고가 전국으로 분류).

### 삭제할 것

`realMatch.ts`에서 아래를 **전부 지운다.** 남겨두면 언젠가 누가 다시 쓴다.

- `protectionYearsCheck` (`/5년/.test(text)`)
- `educationCheck` (`["등록금","학자금","장학금","대학생"]`)
- `homeCheck` (`text.includes("무주택")`)
- `basicLivelihoodCheck`
- `currentlyProtectedCheck`
- `duplicateNote` (중복수급은 엔진의 `applyRelationRules`가 한다)

`regionCheck`는 이미 `@moja/core`의 `matchesUserRegion`을 부르고 있으니, 그 판정도
**엔진 조건(`region_in`)으로 옮겨라.** 지역만 따로 처리하면 또 두 경로가 된다.

### 출력 모양

`app/page.tsx`가 `RealMatchSummary { eligible, uncertain, ineligible }`를 쓰고 있다.
**UI를 크게 고치지 말고**, 4분류를 이렇게 매핑해줘.

```
곧마감  → eligible   (dDay 를 함께 실어서 UI가 "D-15" 를 보여줄 수 있게)
신청가능 → eligible
예정     → uncertain  + reason: "아직 신청 시기가 아니에요 (보호종료 후 신청 가능)"
이미놓침 → ineligible
uncertaintyFlags 가 있으면 → eligible 이어도 uncertain 으로 내리지 말고,
                            eligible 에 두되 '확인 필요' 라벨을 실어라
```

마지막 줄이 중요하다. **'확인 필요'는 탈락이 아니다.** uncertain 버킷으로 내리면
사용자가 "안 되는 것"으로 읽는다.

`EvaluatedRealItem`에 `status`, `dDay`, `needsCheck`, `notReviewed` 필드를 추가해서
UI가 배지를 그릴 수 있게 해줘.

---

## [작업 4] 결과 화면에 배지 반영

`apps/web/app/page.tsx`에서:

- `예정` 배지 (`--plan` / `--plan-bg` 색은 `app/globals.css`에 이미 있다)
- `확인 필요` 배지 (`--danger` 계열) + `uncertaintyFlags` 문장 표시
- `검수 전` 배지 (회색) — "아직 사람이 확인하지 않은 공고예요"
- `곧마감`이면 D-day 표시

**`확인 필요` 문장은 반드시 화면에 보여줘.** "어디에 물어보면 되는지"가 그 안에 들어 있다.
배지만 띄우고 문장을 숨기면 사용자는 뭘 확인해야 할지 모른다.

---

## [작업 5] 검증

```
npm run check          # typecheck + qa 4종 + build
```

`qa:engine`은 이제 **EXPECTED_DIFFS 3건**(기존 2 + status:planned)이 되어야 하고,
그 외 의도하지 않은 차이는 0건이어야 한다.

그리고 **직접 눈으로 확인해줘.**

```
npm run dev
```

1. 온보딩에서 **"아직 보호받고 있어요"**(CURRENTLY_PROTECTED)를 고르고 끝까지 진행 →
   자립수당·의료비 같은 5년 제도가 **`이미놓침`이 아니라 `예정`**으로 나오는지
2. 보호종료 6년차로 진행 → 5년 제도가 `이미놓침`으로 나오는지
3. `확인 필요` 배지가 붙은 항목에 **안내 문장이 같이 보이는지**
4. 브라우저 네트워크 탭에서 `/api/announcements` 응답에 `criteria`·`conditions`가
   들어 있는지
5. **온보딩 답변이 서버로 전송되는 요청이 하나도 없는지** (개인정보 최소화 원칙)

---

## 이번 단계에서 하지 않을 것

- 관리자 검수 화면 (다음)
- 온보딩 문항 분리 (재학/취업, 소득, 보호 시작일)
- `app/data/eligibility.ts`의 21개 제도 룰을 `data/seed/policies.json`으로 통합
- React Native 앱

작업 1(엔진)과 작업 3(realMatch)은 **커밋을 나눠라.** 엔진 변경으로 판정이 바뀐 것인지
어댑터 교체로 바뀐 것인지 구분할 수 있어야 한다.
