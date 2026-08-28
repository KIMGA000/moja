import { NextRequest, NextResponse } from "next/server";
import type { WelfareItem, WelfareSource } from "../../data/apiPreview";
import { classifyItem, type AnnouncementClassification } from "../../data/classify";
import { createSupabaseAdminClient } from "../../../lib/supabase";
import {
  CENTRAL_API_BASE,
  DUAL_TRAINING_API_BASE,
  LOCAL_API_BASE,
  TRAINING_API_BASE,
  fetchAllFromSource,
  fetchAllGov24,
  fetchAllHousing,
  fetchAllJobseekerProgram,
  fetchAllTrainingLike,
  fetchAllYouthCenterPolicy,
  isAboutCareLeavers,
  mapCentralBlock,
  mapLocalBlock,
} from "../../../lib/govApis";

export const dynamic = "force-dynamic";

// 소스별로 별도 테이블에 저장한다 (supabase/schema.sql 참고).
const TABLE_BY_SOURCE: Record<WelfareSource, string> = {
  central: "announcements_central",
  local: "announcements_local",
  gov24: "announcements_gov24",
  housing: "announcements_housing",
  training: "announcements_training",
  jobseekerProgram: "announcements_jobseeker_program",
  dualTraining: "announcements_dual_training",
  youthCenter: "announcements_youth_center",
};

// classification을 안 넘기면 매번 새로 규칙 기반 분류를 계산한다(기본 동작). 이미 사람이
// 검수한 공고(reviewed_at 있음)는 호출하는 쪽에서 DB에 저장된 값을 그대로 넘겨서 재계산으로
// 검수 결과가 덮어써지지 않게 한다 — syncSource의 isReviewed 분기 참고.
function toRow(item: WelfareItem, classification: AnnouncementClassification = classifyItem(item)) {
  const c = classification;
  return {
    source_id: item.servId,
    serv_nm: item.servNm,
    serv_dgst: item.servDgst || null,
    org: item.org || null,
    region: item.region ?? null,
    target_traits: item.targetTraits ?? null,
    deadline: item.deadline ?? null,
    link: item.link || null,
    raw_data: item,
    mentions_care_leaver: c.mentionsCareLeaver,
    mentions_youth: c.mentionsYouth,
    protection_years_limit: c.protectionYearsLimit,
    requires_enrolled: c.requiresEnrolled,
    requires_no_home: c.requiresNoHome,
    requires_basic_livelihood: c.requiresBasicLivelihood,
    requires_already_ended: c.requiresAlreadyEnded,
    region_scope: c.regionScope,
    interest_categories: c.interestCategories,
    protection_end_types_applicable: c.protectionEndTypesApplicable,
    description_tags: c.descriptionTags,
    fetched_at: new Date().toISOString(),
    // duplicate_of_*·reviewed_by·reviewed_at·review_note는 일부러 안 넣는다 —
    // upsert 시 이 컬럼들은 건드리지 않아야 사람이 검수해둔 기록이 재동기화 때마다 초기화되지 않는다.
  };
}

async function syncSource(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  source: WelfareSource,
  rawFetchedCount: number,
  candidateItems: WelfareItem[]
): Promise<{ fetched: number; matched: number; skipped: number; upserted: number; error?: string }> {
  const valid = candidateItems.filter((item) => item.servId);
  const skipped = candidateItems.length - valid.length;
  if (valid.length === 0) {
    return { fetched: rawFetchedCount, matched: candidateItems.length, skipped, upserted: 0 };
  }

  const table = TABLE_BY_SOURCE[source];

  // reviewed_at도 같이 가져온다: 아직 검수 인력이 없어서 지금은 아무도 검수를 안 하고 있지만,
  // 나중에 사람이 Supabase 테이블에서 직접 reviewed_by/reviewed_at/review_status를 채워넣기
  // 시작하면(검수 UI 없이도 가능) 그 결정을 이 동기화 로직이 존중해야 한다 — 아니면 다음날
  // 자동으로 덮어써져서 검수한 의미가 없어진다. 지금은 reviewed_at이 항상 비어있으니 동작은
  // 예전과 완전히 같고(전부 재계산·자동승인), 나중에 검수를 시작하는 순간부터 바로 적용된다.
  const { data: existingRows } = await supabase
    .from(table)
    .select(
      "source_id, reviewed_at, review_status, mentions_care_leaver, " +
        "mentions_youth, protection_years_limit, requires_enrolled, requires_no_home, " +
        "requires_basic_livelihood, requires_already_ended, region_scope, interest_categories, " +
        "protection_end_types_applicable, description_tags"
    )
    .in(
      "source_id",
      valid.map((item) => item.servId)
    );
  type ExistingRow = {
    source_id: string;
    reviewed_at: string | null;
    review_status: string;
    mentions_care_leaver: boolean;
    mentions_youth: boolean;
    protection_years_limit: number | null;
    requires_enrolled: boolean;
    requires_no_home: boolean;
    requires_basic_livelihood: boolean;
    requires_already_ended: boolean;
    region_scope: string | null;
    interest_categories: AnnouncementClassification["interestCategories"];
    protection_end_types_applicable: AnnouncementClassification["protectionEndTypesApplicable"];
    description_tags: string[];
  };
  const existingBySourceId = new Map(
    ((existingRows ?? []) as unknown as ExistingRow[]).map((r) => [r.source_id, r])
  );

  const rows = [];
  for (const item of valid) {
    const existing = existingBySourceId.get(item.servId);

    const isReviewed = existing?.reviewed_at != null;
    if (isReviewed && existing) {
      // 검수된 공고: 사람이 정한 분류·승인 상태를 그대로 유지, 재계산하지 않는다.
      const preservedClassification: AnnouncementClassification = {
        mentionsCareLeaver: existing.mentions_care_leaver,
        mentionsYouth: existing.mentions_youth,
        protectionYearsLimit: existing.protection_years_limit,
        requiresEnrolled: existing.requires_enrolled,
        requiresNoHome: existing.requires_no_home,
        requiresBasicLivelihood: existing.requires_basic_livelihood,
        requiresAlreadyEnded: existing.requires_already_ended,
        regionScope: existing.region_scope,
        interestCategories: existing.interest_categories,
        protectionEndTypesApplicable: existing.protection_end_types_applicable,
        descriptionTags: existing.description_tags,
      };
      rows.push({
        ...toRow(item, preservedClassification),
        review_status: existing.review_status,
      });
    } else {
      // 아직 검수 안 된(reviewed_at 없는) 공고: 지금처럼 매번 새로 규칙 기반 분류하고
      // 자동 승인한다 — 검수 인력이 아직 없어서, 이게 지금 단계에서는 맞는 기본값이다.
      rows.push({ ...toRow(item), review_status: "approved" });
    }
  }

  const { error } = await supabase.from(table).upsert(rows, { onConflict: "source_id" });
  if (error) {
    return { fetched: rawFetchedCount, matched: candidateItems.length, skipped, upserted: 0, error: error.message };
  }

  return { fetched: rawFetchedCount, matched: candidateItems.length, skipped, upserted: rows.length };
}

// Vercel Cron이 매일 새벽 5시(KST)에 이 라우트를 자동 호출한다 (vercel.json 참고).
// CRON_SECRET을 설정해두면 Vercel이 그 값을 Authorization 헤더로 실어서 보내주는데,
// 이 라우트는 8개 외부 API를 호출하는 무거운 작업이라 아무나 반복 호출 못 하게 막아둔다.
// 환경변수를 아직 안 만들었다면(로컬 수동 테스트 등) 검사를 건너뛴다.
function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.WELFARE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "WELFARE_API_KEY가 설정되지 않았어요. .env.local을 확인해주세요." },
      { status: 500 }
    );
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const jaripParams = { srchKeyCode: "003", searchWrd: "자립", lifeArray: "004" };
  const trainingKey = process.env.WORK24_TOMORROW_CARD_KEY;
  const jobseekerProgramKey = process.env.WORK24_JOBSEEKER_PROGRAM_KEY;
  const dualTrainingKey = process.env.WORK24_DUAL_TRAINING_KEY;
  const youthCenterKey = process.env.YOUTHCENTER_API_KEY;

  const [
    centralResult,
    localResult,
    gov24Result,
    housingResult,
    trainingResult,
    jobseekerProgramResult,
    dualTrainingResult,
    youthCenterResult,
  ] = await Promise.allSettled([
    fetchAllFromSource(CENTRAL_API_BASE, apiKey, mapCentralBlock, jaripParams),
    fetchAllFromSource(LOCAL_API_BASE, apiKey, mapLocalBlock, jaripParams),
    fetchAllGov24(apiKey, jaripParams.searchWrd),
    fetchAllHousing(apiKey),
    trainingKey
      ? fetchAllTrainingLike(TRAINING_API_BASE, trainingKey, "training", "고용24 · 국민내일배움카드 훈련과정")
      : Promise.reject(new Error("WORK24_TOMORROW_CARD_KEY가 설정되지 않았어요.")),
    jobseekerProgramKey
      ? fetchAllJobseekerProgram(jobseekerProgramKey)
      : Promise.reject(new Error("WORK24_JOBSEEKER_PROGRAM_KEY가 설정되지 않았어요.")),
    dualTrainingKey
      ? fetchAllTrainingLike(
          DUAL_TRAINING_API_BASE,
          dualTrainingKey,
          "dualTraining",
          "고용24 · 일학습병행 훈련과정"
        )
      : Promise.reject(new Error("WORK24_DUAL_TRAINING_KEY가 설정되지 않았어요.")),
    youthCenterKey
      ? fetchAllYouthCenterPolicy(youthCenterKey, jaripParams.searchWrd)
      : Promise.reject(new Error("YOUTHCENTER_API_KEY가 설정되지 않았어요.")),
  ]);

  const summary: Record<
    string,
    { fetched: number; matched: number; skipped: number; upserted: number; error?: string }
  > = {};

  // 8개 소스 전부 "자립준비청년 관련" 텍스트 필터를 거친 것만 저장한다 (노이즈는 저장 전에 거름).
  if (centralResult.status === "fulfilled") {
    const raw = centralResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.central = await syncSource(supabase, "central", raw.length, filtered);
  } else {
    summary.central = { fetched: 0, matched: 0, skipped: 0, upserted: 0, error: centralResult.reason?.message };
  }
  if (localResult.status === "fulfilled") {
    const raw = localResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.local = await syncSource(supabase, "local", raw.length, filtered);
  } else {
    summary.local = { fetched: 0, matched: 0, skipped: 0, upserted: 0, error: localResult.reason?.message };
  }
  if (gov24Result.status === "fulfilled") {
    const raw = gov24Result.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.gov24 = await syncSource(supabase, "gov24", raw.length, filtered);
  } else {
    summary.gov24 = { fetched: 0, matched: 0, skipped: 0, upserted: 0, error: gov24Result.reason?.message };
  }

  if (housingResult.status === "fulfilled") {
    const raw = housingResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.housing = await syncSource(supabase, "housing", raw.length, filtered);
  } else {
    summary.housing = { fetched: 0, matched: 0, skipped: 0, upserted: 0, error: housingResult.reason?.message };
  }
  if (trainingResult.status === "fulfilled") {
    const raw = trainingResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.training = await syncSource(supabase, "training", raw.length, filtered);
  } else {
    summary.training = { fetched: 0, matched: 0, skipped: 0, upserted: 0, error: trainingResult.reason?.message };
  }
  if (jobseekerProgramResult.status === "fulfilled") {
    const raw = jobseekerProgramResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.jobseekerProgram = await syncSource(supabase, "jobseekerProgram", raw.length, filtered);
  } else {
    summary.jobseekerProgram = {
      fetched: 0,
      matched: 0,
      skipped: 0,
      upserted: 0,
      error: jobseekerProgramResult.reason?.message,
    };
  }
  if (dualTrainingResult.status === "fulfilled") {
    const raw = dualTrainingResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.dualTraining = await syncSource(supabase, "dualTraining", raw.length, filtered);
  } else {
    summary.dualTraining = {
      fetched: 0,
      matched: 0,
      skipped: 0,
      upserted: 0,
      error: dualTrainingResult.reason?.message,
    };
  }
  if (youthCenterResult.status === "fulfilled") {
    const raw = youthCenterResult.value.items;
    const filtered = raw.filter(isAboutCareLeavers);
    summary.youthCenter = await syncSource(supabase, "youthCenter", raw.length, filtered);
  } else {
    summary.youthCenter = {
      fetched: 0,
      matched: 0,
      skipped: 0,
      upserted: 0,
      error: youthCenterResult.reason?.message,
    };
  }

  return NextResponse.json({ summary });
}
