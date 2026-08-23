import { NextResponse } from "next/server";
import type { AnnouncementItem, WelfareItem } from "../../data/apiPreview";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// 자격 진단 화면이 매번 8개 공공 API를 실시간으로 호출하면 API 호출 한도에 걸릴 수 있어서,
// sync-announcements가 주기적으로 채워둔 DB(announcements_all)에서 승인된 공고만 읽어온다.
//
// QA-3 보안 수정: 예전에는 service role 키(createSupabaseAdminClient)로 조회하면서
// review_status='approved' 필터를 애플리케이션 코드에만 걸었다 — 필터를 실수로 빼면 그대로
// 뚫리는 구조였다. 0002_security_fix.sql로 announcements_all 뷰에 RLS를 걸었으니 이제
// anon 클라이언트를 쓴다. 코드의 필터는 그대로 두되(가독성 + 방어), DB의 RLS가 실제 방어선이라
// 코드에서 필터가 빠져도 approved 아닌 행은 내려가지 않는다.
export async function GET() {
  if (!supabase) {
    console.warn("[api/announcements] Supabase 환경변수가 설정되지 않아 빈 목록을 반환해요.");
    return NextResponse.json({ items: [] as AnnouncementItem[] });
  }

  const { data, error } = await supabase
    .from("announcements_all")
    // 한 줄 문자열 리터럴이어야 supabase-js가 select() 문자열을 파싱해 행 타입을 추론한다.
    // join()이나 템플릿 문자열로 만들면 타입이 GenericStringError로 무너진다.
    .select(
      "source, id, source_id, raw_data, criteria, conditions, region_scope, deadline, mentions_care_leaver, mentions_youth, requires_enrolled, requires_no_home, requires_basic_livelihood, requires_already_ended, protection_years_limit, review_status, reviewed_at"
    )
    .eq("review_status", "approved");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: AnnouncementItem[] = (data ?? [])
    .map((row): AnnouncementItem | null => {
      const raw = row.raw_data as WelfareItem | null;
      if (!raw) return null;
      return {
        ...raw,
        id: row.id,
        sourceId: row.source_id,
        criteria: row.criteria ?? [],
        conditions: row.conditions ?? [],
        regionScope: row.region_scope,
        deadline: row.deadline ?? raw.deadline,
        mentionsCareLeaver: row.mentions_care_leaver,
        mentionsYouth: row.mentions_youth,
        requiresEnrolled: row.requires_enrolled,
        requiresNoHome: row.requires_no_home,
        requiresBasicLivelihood: row.requires_basic_livelihood,
        requiresAlreadyEnded: row.requires_already_ended,
        protectionYearsLimit: row.protection_years_limit,
        reviewStatus: row.review_status,
        reviewedAt: row.reviewed_at,
      };
    })
    .filter((item): item is AnnouncementItem => item != null);

  return NextResponse.json({ items });
}
