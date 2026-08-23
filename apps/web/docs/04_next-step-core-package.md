# [다음 단계] 판정 로직을 웹·앱 공용 패키지로 분리

웹페이지와 앱을 **따로** 만들기로 정했다. 그러면 판정 로직을 어디에 둘지가 가장 중요한
결정이 된다. 이 문서는 그 준비 작업이다.

## 왜 지금 이걸 먼저 하는가

**같은 로직을 두 곳에 두면 반드시 갈라진다.** 이 저장소에서 이미 그 일이 일어났다.

`app/data/classify.ts`와 `app/data/realMatch.ts`에 지역 매칭 로직이 복붙되어 있었고,
한쪽 별칭 목록에 개편 전 지명(`전라북도`)이 빠져서 **전북 지자체 공고가 "전국" 공고로
분류되어 다른 지역 사용자에게 노출**됐다. `lib/regions.ts`로 합쳐서 고쳤다.

웹과 앱이 각자 판정을 구현하면 같은 사용자가 **웹에서는 "신청가능", 앱에서는 "이미놓침"** 을
보게 된다. 자립준비청년에게 잘못된 안내를 하는 서비스가 되는 것이고, 이건 신뢰를 잃는
종류의 버그다. 화면은 두 개여도 **판정은 한 곳**이어야 한다.

다행히 지금 코드는 준비가 되어 있다. 확인해봤다:

```
lib/engine, lib/criteria 의 외부 의존성 → app/data/eligibility(타입만), lib/engine/types
window / document / next/* / react 사용 → 없음
```

플랫폼 독립적이다. 옮기기만 하면 React Native에서 그대로 import된다.

---

## [작업 1] npm workspaces 로 모노레포 만들기

지금 저장소를 이렇게 바꿔줘. **한 번에 다 옮기지 말고 아래 순서를 지켜.**

```
moja/
├─ package.json              ← workspaces 루트 (앱 코드 없음)
├─ packages/
│  └─ core/                  ★ 웹·앱 공용. Next도 React도 DOM도 쓰지 않는다
│     ├─ package.json        name: "@moja/core"
│     ├─ tsconfig.json
│     └─ src/
│        ├─ engine/          lib/engine/* 를 그대로 이동
│        ├─ criteria/        lib/criteria/* 를 그대로 이동
│        ├─ regions.ts       lib/regions.ts 를 이동
│        ├─ types/
│        │  └─ onboarding.ts ★ 아래 [작업 2] 참고
│        ├─ data/seed/       policies.json / rules.json / notices.json
│        └─ index.ts         공개 API 재수출
└─ apps/
   └─ web/                   ← 지금 있는 Next.js 앱 전체를 여기로 이동
      ├─ app/  lib/  supabase/  docs/
      └─ package.json        "@moja/core": "*" 의존성 추가
```

`apps/app/`(React Native)은 **이번에 만들지 마.** 자리만 비워둔다.

### 이동 규칙

- `lib/engine/*`, `lib/criteria/*`, `lib/regions.ts` → `packages/core/src/`
- `data/seed/*.json` → `packages/core/src/data/seed/`
- 그 외 전부(`app/`, `lib/supabase.ts`, `lib/govApis.ts`, `lib/communityDb.ts`,
  `supabase/`, `docs/`) → `apps/web/`
- **`lib/supabase.ts`와 `lib/govApis.ts`는 core에 넣지 마.** Supabase 클라이언트와
  공공API fetch는 웹 서버 전용이다. 앱은 웹의 API 라우트를 HTTP로 호출한다.
- `docs/qa/*` 테스트는 `packages/core/`로 옮기고 import 경로를 고쳐줘.
  `npm run qa` 가 루트에서 돌아가게 workspaces 스크립트를 연결해줘.

---

## [작업 2] ★ 순환 의존을 끊어라 — 가장 중요한 부분

지금 `lib/criteria/adaptProfile.ts`가 이렇게 되어 있다.

```ts
import type { OnboardingProfile } from '../../app/data/eligibility';
```

**core가 web의 코드를 import하고 있다.** 이대로 옮기면 `packages/core`가 `apps/web`에
의존해서 앱에서 쓸 수 없다. 순환 구조다.

해결: `OnboardingProfile`과 그 부속 타입을 **core로 옮기고, web이 core에서 가져다 쓴다.**

1. `packages/core/src/types/onboarding.ts`를 만들고 `app/data/eligibility.ts`에서
   아래를 **타입·상수만** 옮겨줘 (판정 함수는 옮기지 마):
   - `ProtectionEndType`, `PROTECTION_END_TYPE_LABEL`
   - `CurrentStatus`, `CURRENT_STATUS_LABEL`
   - `YesNoUnknown`
   - `InterestCategory`, `INTEREST_CATEGORY_LABEL`
   - `OnboardingProfile`, `EMPTY_PROFILE`
   - `AgeInfo`
2. `app/data/eligibility.ts`는 이제 core에서 재수출만 한다:
   ```ts
   export type { OnboardingProfile, ProtectionEndType, ... } from '@moja/core';
   export { EMPTY_PROFILE, PROTECTION_END_TYPE_LABEL, ... } from '@moja/core';
   ```
   이렇게 하면 `EligibilityFlow.tsx`(1032줄)의 import를 **한 줄도 고치지 않아도** 된다.
3. `adaptProfile.ts`의 import를 `'../types/onboarding'`으로 바꿔줘.
4. `packages/core`가 `apps/web`을 참조하는 곳이 **하나도 남지 않았는지** 확인해줘:
   ```
   grep -rn "app/data\|apps/web\|next/" packages/core/src/
   ```
   결과가 비어야 한다.

`app/data/eligibility.ts`의 **21개 제도 판정 함수(`Program.evaluate`)는 web에 그대로 둬.**
그건 나중에 `data/seed/policies.json` + 카탈로그 체계로 통합할 대상이지, 지금 옮길 게 아니다.

---

## [작업 3] core 의 경계를 테스트로 못박기

`packages/core/src/__tests__/boundary.test.ts`를 만들어줘. core가 플랫폼에 오염되는 걸
막는 테스트다. 사람이 기억해서 지키는 규칙은 반드시 깨진다.

검사할 것:
1. `packages/core/src/**` 안의 모든 `import` 문이 아래만 참조하는지
   - 상대 경로(`./`, `../`)
   - Node 표준 모듈은 **금지** (`node:*`, `fs`, `path` 등 — RN에 없다)
   - `react`, `next`, `@supabase/*`, DOM 전역 **금지**
2. `packages/core/package.json`의 `dependencies`가 **비어 있는지**
   (devDependencies에 typescript/tsx만 허용)
3. 소스에 `window` / `document` / `localStorage` / `process.env` 문자열이 없는지
   → `process.env`도 금지다. RN은 다른 방식으로 환경변수를 다룬다.
   환경 의존값은 core 함수의 **인자로 받아라** (`computeProfile(raw, today)`가
   이미 그 방식이다 — `new Date()`를 안에서 부르지 않고 인자로 받는다).

`package.json`에 `"qa:boundary"` 스크립트를 추가하고 `"qa"`에 물려줘.

> `docs/qa/engine-diff.ts`는 `createRequire`와 `process.cwd()`를 쓴다.
> 이건 **테스트 파일**이라 core 소스 규칙에서 제외해도 된다. 테스트는 Node에서만 돈다.
> boundary 테스트가 `__tests__`와 `docs/qa`를 검사 대상에서 빼도록 해줘.

---

## [작업 4] 검증

```
npm run typecheck    # 루트에서 workspaces 전체
npm run qa           # qa:engine + qa:adapter + qa:catalog + qa:boundary
npm run build -w apps/web
```

**네 개 다 통과해야 한다.** 특히 `qa:engine`은 397건 비교에서 **의도하지 않은 차이가
0건**이어야 한다. 파일을 옮기는 작업이라 판정 결과가 바뀔 이유가 없다. 바뀌었다면 옮기다가
뭔가 잘못된 것이다.

그리고 이걸 꼭 확인해줘:
```
npm run dev -w apps/web
```
브라우저에서 온보딩을 끝까지 진행해서 결과 화면이 예전과 똑같이 나오는지 눈으로 봐줘.
`EligibilityFlow.tsx`를 안 고쳤으니 화면이 달라지면 import 재수출이 잘못된 것이다.

---

## 이번 단계에서 하지 않을 것

- React Native 앱 만들기 (`apps/app/`) — 자리만 비워둔다
- `realMatch.ts`를 엔진 어댑터로 교체 — **그다음 단계**
- 관리자 검수 화면
- 온보딩 문항 분리 (재학/취업, 소득, 보호 시작일)
- `app/data/eligibility.ts`의 21개 제도 룰 통합

파일을 대량으로 옮기는 작업이라, 옮기는 것과 로직 바꾸는 것을 **같은 커밋에 섞지 마.**
섞으면 판정 결과가 바뀌었을 때 원인을 찾을 수 없다.
