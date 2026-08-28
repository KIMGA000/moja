import { NextRequest, NextResponse } from "next/server";
import type { WelfareItem, WelfareSource } from "../../data/apiPreview";
import { classifyItem } from "../../data/classify";
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

// 공고 원문을 자립준비청년이 바로 이해할 수 있는 한 문장으로 풀어 쓴다. Gemini 무료 티어를 쓰므로
// 사용자 요청마다가 아니라 "동기화 시점에, 내용이 바뀐 공고만" 호출해서 호출 횟수를 낮게 유지한다
// (syncSource의 재사용 로직 참고). 실패해도 동기화 자체는 계속 진행되도록 null을 반환한다.
//
// 무료 티어는 하루/분당 호출 한도가 있다. 한도에 걸리면(429) 이번 동기화 실행 동안은 더 이상
// 호출을 시도하지 않는다 — 어차피 다 실패할 호출을 하나씩 재시도하며 시간을 낭비하지 않기 위해서.
// 다음 동기화(다음 날 크론)에서 한도가 풀렸으면 자동으로 다시 시도된다.
let geminiQuotaExhausted = false;

async function generatePlainSummary(servNm: string, servDgst: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || geminiQuotaExhausted) return null;

  const prompt =
    "다음은 자립준비청년(보육원·위탁가정 등에서 자란 뒤 보호가 끝난 청년) 지원 공고문입니다. " +
    "이 공고를 처음 보는 사람도 바로 이해할 수 있도록, 누가 받을 수 있고 무엇을 지원하는지 " +
    "한 문장(공백 포함 60자 이내)의 쉬운 한국어로만 답하세요. 다른 설명 없이 문장 하나만 출력하세요.\n\n" +
    `공고명: ${servNm}\n원문: ${servDgst}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (res.status === 429 || res.status === 403) {
      console.error("Gemini 무료 티어 한도 도달 — 이번 동기화에서는 요약 생성을 건너뜀");
      geminiQuotaExhausted = true;
      return null;
    }
    if (!res.ok) {
      console.error("Gemini 요약 생성 실패", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
    return text ? text.trim() : null;
  } catch (err) {
    console.error("Gemini 요약 생성 중 오류", err);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRow(item: WelfareItem) {
  const c = classifyItem(item);
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
    // review_status·duplicate_of_*·reviewed_by 등은 일부러 안 넣는다 —
    // upsert 시 이 컬럼들은 건드리지 않아야 사람이 검수해둔 상태가 재동기화 때마다 초기화되지 않는다.
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

  // AI 쉬운 요약(plain_summary)은 원문이 바뀌지 않았으면 재생성하지 않는다 — 무료 티어 호출
  // 횟수를 아끼고, "비용이 사용자 수에 비례하면 안 된다"는 원칙을 동기화 빈도에도 적용한 것.
  const { data: existingRows } = await supabase
    .from(table)
    .select("source_id, serv_dgst, plain_summary")
    .in(
      "source_id",
      valid.map((item) => item.servId)
    );
  const existingBySourceId = new Map(
    (existingRows ?? []).map((r) => [r.source_id as string, r as { serv_dgst: string | null; plain_summary: string | null }])
  );

  const rows = [];
  for (const item of valid) {
    const existing = existingBySourceId.get(item.servId);
    let plainSummary = existing && existing.serv_dgst === (item.servDgst || null) ? existing.plain_summary : null;
    if (!plainSummary && item.servDgst) {
      plainSummary = await generatePlainSummary(item.servNm, item.servDgst);
      if (process.env.GEMINI_API_KEY) await sleep(250); // 무료 티어 분당 호출 한도 여유 두기
    }
    rows.push({ ...toRow(item), plain_summary: plainSummary, review_status: "approved" });
  }

  // 검수 UI가 아직 없어서, 동기화되는 공고는 신규·기존 구분 없이 매번 review_status를
  // 'approved'로 채워서 바로 노출한다 (라이브 API 미리보기와 같은 신뢰 수준). 예전엔 "이미
  // 존재하는 공고는 건드리지 않는다"는 규칙이 있었는데, 그 결과 최초 저장 시점에 이 로직이
  // 없었던(또는 다른 코드로 저장된) 공고가 pending에 영구히 갇히는 문제가 있었다 — 지금은
  // 검수 UI가 없어서 어차피 사람이 pending을 approved로 승격시킬 방법이 없으므로, 매번
  // approved로 덮어써서 이런 정체가 재발하지 않게 한다.
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

  // 서버리스 인스턴스가 재사용(warm start)될 수 있어서, 지난 실행에서 한도에 걸렸어도
  // 이번 실행에서는 다시 시도해본다 (하루 지나 한도가 풀렸을 수 있으므로).
  geminiQuotaExhausted = false;

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

  // 7개 소스 전부 "자립준비청년 관련" 텍스트 필터를 거친 것만 저장한다 (노이즈는 저장 전에 거름).
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
