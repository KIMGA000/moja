import { NextResponse } from "next/server";
import type { WelfareItem } from "../../data/apiPreview";
import { createSupabaseAdminClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

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

  const { data, error } = await supabase
    .from("announcements_all")
    .select("raw_data")
    .eq("review_status", "approved");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? [])
    .map((row) => row.raw_data as WelfareItem | null)
    .filter((item): item is WelfareItem => item != null);

  return NextResponse.json({ items });
}
