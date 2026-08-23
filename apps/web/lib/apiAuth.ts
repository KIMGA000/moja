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
  if (!secret) return null; // 로컬 개발
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null; // Vercel Cron 도 이 형식으로 보낸다
  return Response.json({ error: "권한이 없어요." }, { status: 401 });
}
