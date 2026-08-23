import { NextResponse } from "next/server";

/**
 * 검수자 로그인. 접근 코드가 맞으면 httpOnly 쿠키를 굽는다.
 * 검수자 이름은 review_log.reviewed_by 에 쓰려고 함께 저장한다(이건 httpOnly 아님 — 화면에 표시해야 함).
 *
 * ⚠️ 해커톤 수준 구현 — middleware.ts 주석 참고.
 */
export async function POST(req: Request) {
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_ACCESS_CODE 가 설정되지 않았어요." },
      { status: 500 }
    );
  }

  let body: { code?: string; reviewer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  if (body.code !== expected) {
    return NextResponse.json({ error: "접근 코드가 맞지 않아요." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const common = {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12시간이면 하루 검수 세션으로 충분하다
  };
  res.cookies.set("moja_admin", expected, { ...common, httpOnly: true });
  res.cookies.set("moja_reviewer", (body.reviewer || "").slice(0, 40), {
    ...common,
    httpOnly: false, // 화면에 "○○님으로 검수 중"을 표시해야 해서 JS 에서 읽을 수 있어야 한다
  });
  return res;
}
