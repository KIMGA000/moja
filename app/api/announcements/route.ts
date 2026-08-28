import { NextResponse } from "next/server";
import type { AnnouncementRecord, WelfareItem } from "../../data/apiPreview";
import { isExpiredDeadline } from "../../data/classify";
import { createSupabaseAdminClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// 매일 동기화가 이 값보다 오래 안 됐으면(=최근 API 조회에서 계속 보이면) 노출한다.
// 하루 한 번 도는 크론이 하루쯤 밀려도(주말 장애 등) 잘못 숨기지 않도록 여유를 둔다.
const STALE_AFTER_DAYS = 3;

// 자격 진단 화면이 매번 8개 공공 API를 실시간으로 호출하면 API 호출 한도에 걸릴 수 있어서,
// sync-announcements가 주기적으로 채워둔 DB(announcements_all)에서 승인된 공고만 읽어온다.
// admin 클라이언트로 조회하되 review_status='approved' 필터는 앱에서 직접 건다 — RLS가 걸린
// 각 테이블과는 달리 announcements_all 뷰는 RLS를 우회하니 이 필터를 빼면 안 된다.
export async function GET() {
  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("announcements_all")
    .select(
      "raw_data, region_scope, requires_enrolled, interest_categories, description_tags, force_visible, fetched_at"
    )
    .eq("review_status", "approved")
    .gte("fetched_at", staleBefore);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: AnnouncementRecord[] = (data ?? [])
    .map((row) => {
      const raw = row.raw_data as WelfareItem | null;
      if (!raw) return null;
      // 접수기간이 이미 끝난 공고는 기본적으로 숨긴다. 검수자가 force_visible을 켜두면
      // (아직 검수 UI가 없어 지금은 SQL Editor로 직접) 그래도 계속 보여준다.
      if (!row.force_visible && isExpiredDeadline(raw.deadline)) return null;
      return {
        ...raw,
        regionScope: (row.region_scope as string | null) ?? null,
        requiresEnrolled: Boolean(row.requires_enrolled),
        interestCategories: (row.interest_categories as string[] | null) ?? [],
        descriptionTags: (row.description_tags as string[] | null) ?? [],
      };
    })
    .filter((item): item is AnnouncementRecord => item != null);

  return NextResponse.json({ items });
}
