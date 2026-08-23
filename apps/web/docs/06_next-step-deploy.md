# [다음 단계] 배포 준비 — 공개 라우트 보호 + Vercel 1차 배포

사용자 화면은 완성됐다. 실기기에서만 드러나는 문제(모바일 레이아웃, iOS Safari)가 있고
팀·심사자에게 보여줄 URL도 필요하니 **사용자 웹만 먼저 배포**한다.
`/admin`(검수 화면)은 아직 없으므로 2차 배포로 미룬다.

---

## ⚠️ [작업 1] 공개 API 라우트 보호 — 배포 전 반드시

지금 이 세 라우트가 **인증 없이, GET으로** 열려 있다.

| 라우트 | 문제 |
|---|---|
| `/api/sync-announcements` | 공공API 8종을 전부 긁어 DB에 쓴다. **service_role 사용** |
| `/api/welfare` | 공공API 8종을 실시간 호출한다 |
| `/api/posts` (POST) | 커뮤니티 글 작성 — 로그인 없는 게시판이라 의도된 것. 이번 범위 밖 |

**GET이라는 게 특히 위험하다.** 링크 미리보기, 검색엔진 크롤러, 브라우저 프리페치가
**의도 없이도 실행시킨다.** 공공데이터포털 개발계정은 일일 1,000건 한도라, 크롤러 한 번에
하루치가 날아갈 수 있다. 그리고 sync는 service_role로 DB에 쓴다.

### 고칠 내용

1. **`lib/apiAuth.ts`** 를 새로 만들어라.

```ts
/**
 * 운영/수집용 라우트를 보호한다.
 *
 * 왜 필요한가: sync·welfare 는 공공API를 대량 호출하고 sync 는 service_role 로 DB에 쓴다.
 * 공개 배포된 상태에서 인증이 없으면 크롤러나 링크 프리뷰가 눌러도 실행되고,
 * 공공데이터포털 개발계정의 일일 한도(1,000건)가 한 번에 소진된다.
 *
 * CRON_SECRET 이 설정되지 않은 환경(로컬 개발)에서는 통과시킨다 —
 * 팀원이 로컬에서 개발할 때마다 토큰을 요구하면 개발이 막힌다.
 * 운영에서는 Vercel 환경변수로 반드시 설정한다.
 */
export function assertOperatorRequest(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;                       // 로컬 개발
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return null;   // Vercel Cron 도 이 형식으로 보낸다
  return Response.json({ error: '권한이 없어요.' }, { status: 401 });
}
```

2. **`/api/sync-announcements`** 와 **`/api/welfare`**:
   - 시그니처를 `export async function GET(req: Request)` 로 바꾸고
   - 함수 첫 줄에서 `const denied = assertOperatorRequest(req); if (denied) return denied;`
   - `sync-announcements`는 **`POST`도 함께 export** 해라 (`export const POST = GET`).
     Vercel Cron은 GET을 쓰지만, 사람이 수동으로 돌릴 때는 POST가 안전하다.

3. **`apps/web/middleware.ts`** 를 만들어라. 지금은 `/admin/*`을 막는 게 주 목적이고,
   검수 화면이 생기기 전이라도 미리 깔아둔다 — 나중에 화면만 추가하면 자동으로 보호된다.

```ts
import { NextResponse, type NextRequest } from 'next/server';

// /admin/* 과 /api/admin/* 은 ADMIN_ACCESS_CODE 쿠키가 있어야 접근할 수 있다.
// ⚠️ 해커톤 수준 구현이다. 실서비스에서는 Supabase Auth + role 로 바꿔야 한다.
export function middleware(req: NextRequest) {
  const code = process.env.ADMIN_ACCESS_CODE;
  if (!code) return NextResponse.next();          // 미설정이면 통과 (로컬)
  if (req.cookies.get('moja_admin')?.value === code) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/admin/login', req.url));
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
```

`/admin/login` 페이지는 아직 없으니, **최소 화면 하나만** 만들어라 — 접근 코드를 입력받아
`moja_admin` 쿠키(httpOnly, sameSite=lax)를 굽는 폼. 검수 화면은 다음 단계에서 만든다.

4. **`.env.local`에 `CRON_SECRET` 추가.** 아무 긴 무작위 문자열이면 된다.
   로컬에서는 비워둬도 되지만, 값이 있는 상태로도 개발이 되는지 한 번 확인해라.

---

## [작업 2] Vercel 설정 — 모노레포라 기본값으로는 실패한다

`git push` 로 GitHub에 올린 뒤 Vercel에서 저장소를 임포트한다.

| 설정 | 값 | 이유 |
|---|---|---|
| **Root Directory** | `apps/web` | 모노레포로 바꿨다. 저장소 루트에는 Next 앱이 없다 |
| Framework Preset | Next.js | 자동 감지됨 |
| Install Command | (기본값) | npm workspaces를 Vercel이 인식해 루트에서 설치한다 |
| Build Command | (기본값) | `apps/web`의 `next build` |
| Node.js Version | **22.x** | `package.json`의 `engines`가 `>=22.5` |
| Production Branch | `dev` 또는 `main` | 팀원과 합의해서 정할 것 |

`next.config.ts`에 `transpilePackages: ["@moja/core"]`가 이미 들어 있으니 그대로 두면 된다
(이게 없으면 `@moja/core` import에서 빌드가 깨진다).

### 환경변수 (Production + Preview 양쪽에 등록)

```
NEXT_PUBLIC_SUPABASE_URL          https://hoemgmadhkzfeqjejgfg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY         sb_secret_...      ← NEXT_PUBLIC_ 접두사 절대 금지
CRON_SECRET                       (긴 무작위 문자열)
ADMIN_ACCESS_CODE                 (팀 공용 코드)
WELFARE_API_KEY                   (아직 없으면 비워둠)
WORK24_TOMORROW_CARD_KEY          (비워둠)
WORK24_JOBSEEKER_PROGRAM_KEY      (비워둠)
WORK24_DUAL_TRAINING_KEY          (비워둠)
YOUTHCENTER_API_KEY               (비워둠)
```

**API 키가 비어 있어도 배포는 된다.** 이미 DB에 팀원이 동기화해둔 공고가 있어서 사용자
화면은 정상 동작한다. 키가 없으면 sync만 못 돌린다.

> **`SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_`을 붙이면 브라우저 번들에 그대로 박힌다.**
> 그 키는 RLS를 전부 무시하므로, 붙는 순간 DB 전체가 공개된다. 등록 후 이름을 다시 확인해라.

---

## [작업 3] 배포 후 확인 — 여기까지 해야 배포가 끝난 것

배포 URL을 받으면 순서대로 확인해라.

1. **랜딩 → 온보딩 12문항 → 결과**가 로컬과 똑같이 나오는지
2. **`/api/sync-announcements`를 브라우저 주소창에 그냥 쳐보기**
   → **401이 나와야 한다.** 200이 나오면 작업 1이 적용되지 않은 것이다
3. **`/api/welfare`** 도 401
4. **`/admin`** → `/admin/login`으로 리디렉션되는지
5. **브라우저 개발자도구 → Sources**에서 `sb_secret_` 을 검색
   → **하나도 안 나와야 한다.** 나오면 즉시 배포를 내리고 Supabase에서 키를 rotate해라
6. **실제 휴대폰으로 접속** — 안드로이드 Chrome, 가능하면 iPhone Safari.
   하단 버튼이 홈바에 가리지 않는지, 온보딩 드롭다운이 조작되는지
7. **개인정보** — 네트워크 탭에서 온보딩 답변이 서버로 가는 요청이 하나도 없는지
   (로컬에서 확인했지만 배포본에서 다시 본다)

---

## [작업 4] (선택) Vercel Cron 으로 동기화 자동화

API 키를 받은 뒤에 하면 된다. `apps/web/vercel.json`:

```json
{
  "crons": [{ "path": "/api/sync-announcements", "schedule": "0 18 * * *" }]
}
```

Vercel Cron은 `Authorization: Bearer $CRON_SECRET` 헤더를 자동으로 붙여 보내므로
작업 1의 인증을 그대로 통과한다. 시각은 UTC 기준이라 `0 18 * * *`이 **한국시간 새벽 3시**다.

> 공공데이터포털 개발계정은 일일 한도가 있다. **하루 1회로 충분하다.**
> 더 자주 돌리면 한도만 태우고 얻는 게 없다 — 공고는 그렇게 자주 바뀌지 않는다.

---

## [작업 5] 검증

```
npm run check     # typecheck + qa 4종 + build
```

그리고 **`CRON_SECRET`을 설정한 상태에서 로컬 확인**:

```
npm run dev
curl -i http://localhost:3000/api/sync-announcements          # 401 이어야 함
curl -i -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/sync-announcements   # 통과
```

---

## 이번 단계에서 하지 않을 것

- 관리자 검수 화면 본체 (다음 단계 — `/admin/login`만 만든다)
- 온보딩 문항 분리 / 소득 문항 추가
- React Native 앱
- `sync-announcements`의 `review_status: "approved"` → `pending` 되돌리기
  (검수 화면이 생긴 뒤에 해야 한다. 지금 바꾸면 사용자 화면이 비어버린다)
