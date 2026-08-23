import { NextResponse, type NextRequest } from "next/server";

/**
 * /admin/* 과 /api/admin/* 을 접근 코드로 막는다.
 *
 * ⚠️ 해커톤 수준 구현이다. 팀 공용 코드 하나를 쿠키에 담아 비교할 뿐이라,
 *    코드가 새면 누구나 들어온다. 실서비스로 갈 때는 Supabase Auth + role 로 바꿔야 한다.
 *    검수 화면에는 아직 검수 전(pending)·반려(rejected) 공고 원문이 들어 있으므로
 *    무방비로 공개하면 안 된다.
 *
 * ADMIN_ACCESS_CODE 가 설정되지 않은 환경(로컬 첫 실행)에서는 통과시킨다 —
 * 팀원이 로컬에서 개발할 때마다 막히면 개발이 안 된다. Vercel 에는 반드시 설정한다.
 */

/** 로그인 화면과 로그인 API 자체는 막으면 안 된다(막으면 들어갈 방법이 없어진다). */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const code = process.env.ADMIN_ACCESS_CODE;
  if (!code) return NextResponse.next();

  if (req.cookies.get("moja_admin")?.value === code) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "권한이 없어요." }, { status: 401 });
  }

  const url = new URL("/admin/login", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
