import { NextResponse } from "next/server";
import { SOURCE_LABEL, type WelfareItem, type WelfareSource } from "../../data/apiPreview";
import {
  CENTRAL_API_BASE,
  DUAL_TRAINING_API_BASE,
  LOCAL_API_BASE,
  TRAINING_API_BASE,
  dedupeItems,
  fetchAllFromSource,
  fetchAllGov24,
  fetchAllHousing,
  fetchAllJobseekerProgram,
  fetchAllTrainingLike,
  fetchAllYouthCenterPolicy,
  isAboutCareLeavers,
  isAboutYouth,
  mapCentralBlock,
  mapLocalBlock,
} from "../../../lib/govApis";

export const dynamic = "force-dynamic";

type SourceBucket = { totalCount: number; fetchedCount: number; filteredCount: number; youthCount: number };

function emptyBucket(): SourceBucket {
  return { totalCount: 0, fetchedCount: 0, filteredCount: 0, youthCount: 0 };
}

export async function GET() {
  // 실제 서비스 로직과 무관한 API 테스트용 라우트라 배포 환경에서는 막아둔다 (관리자/개발자만
  // 로컬에서 확인하는 용도).
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.WELFARE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "WELFARE_API_KEY가 설정되지 않았어요. .env.local을 확인해주세요." },
      { status: 500 }
    );
  }

  const jaripParams = { srchKeyCode: "003", searchWrd: "자립", lifeArray: "004" };
  const youthParams = { srchKeyCode: "003", searchWrd: "청년", lifeArray: "004" };
  const trainingKey = process.env.WORK24_TOMORROW_CARD_KEY;
  const jobseekerProgramKey = process.env.WORK24_JOBSEEKER_PROGRAM_KEY;
  const dualTrainingKey = process.env.WORK24_DUAL_TRAINING_KEY;
  const youthCenterKey = process.env.YOUTHCENTER_API_KEY;

  // 중앙부처·지자체·정부24·온통청년은 검색어로 서버 단에서 좁혀지는 API라, "자립"과 "청년" 두 키워드로
  // 각각 조회한 뒤 합쳐야 두 분류 모두 놓치지 않는다. 나머지 4개는 애초에 키워드 없이 전체를 가져오므로
  // 한 번만 조회하고, 자립/청년 분류는 클라이언트 로직과 같은 텍스트 매칭으로 나눈다.
  const [
    centralJaripResult,
    centralYouthResult,
    localJaripResult,
    localYouthResult,
    gov24JaripResult,
    gov24YouthResult,
    housingResult,
    trainingResult,
    jobseekerProgramResult,
    dualTrainingResult,
    youthCenterJaripResult,
    youthCenterYouthResult,
  ] = await Promise.allSettled([
    fetchAllFromSource(CENTRAL_API_BASE, apiKey, mapCentralBlock, jaripParams),
    fetchAllFromSource(CENTRAL_API_BASE, apiKey, mapCentralBlock, youthParams),
    fetchAllFromSource(LOCAL_API_BASE, apiKey, mapLocalBlock, jaripParams),
    fetchAllFromSource(LOCAL_API_BASE, apiKey, mapLocalBlock, youthParams),
    fetchAllGov24(apiKey, jaripParams.searchWrd),
    fetchAllGov24(apiKey, youthParams.searchWrd),
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
    youthCenterKey
      ? fetchAllYouthCenterPolicy(youthCenterKey, youthParams.searchWrd)
      : Promise.reject(new Error("YOUTHCENTER_API_KEY가 설정되지 않았어요.")),
  ]);

  if (
    centralJaripResult.status === "rejected" &&
    centralYouthResult.status === "rejected" &&
    localJaripResult.status === "rejected" &&
    localYouthResult.status === "rejected" &&
    gov24JaripResult.status === "rejected" &&
    gov24YouthResult.status === "rejected" &&
    housingResult.status === "rejected" &&
    trainingResult.status === "rejected" &&
    jobseekerProgramResult.status === "rejected" &&
    dualTrainingResult.status === "rejected" &&
    youthCenterJaripResult.status === "rejected" &&
    youthCenterYouthResult.status === "rejected"
  ) {
    return NextResponse.json(
      { error: centralJaripResult.reason?.message ?? "공공데이터 API 호출에 실패했어요." },
      { status: 502 }
    );
  }

  const bySource: Record<WelfareSource, SourceBucket> = {
    central: emptyBucket(),
    local: emptyBucket(),
    gov24: emptyBucket(),
    housing: emptyBucket(),
    training: emptyBucket(),
    jobseekerProgram: emptyBucket(),
    dualTraining: emptyBucket(),
    youthCenter: emptyBucket(),
  };
  const allItems: WelfareItem[] = [];

  // 자립/청년 두 키워드로 나눠 조회한 소스는 합치고 중복을 제거한다.
  function mergeKeywordSearches(
    source: WelfareSource,
    jaripResult: PromiseSettledResult<{ totalCount: number; items: WelfareItem[] }>,
    youthResult: PromiseSettledResult<{ totalCount: number; items: WelfareItem[] }>
  ) {
    const jarip = jaripResult.status === "fulfilled" ? jaripResult.value : null;
    const youth = youthResult.status === "fulfilled" ? youthResult.value : null;
    if (!jarip && !youth) return;

    const merged = dedupeItems([...(jarip?.items ?? []), ...(youth?.items ?? [])]);
    bySource[source].totalCount = (jarip?.totalCount ?? 0) + (youth?.totalCount ?? 0);
    bySource[source].fetchedCount = merged.length;
    allItems.push(...merged);
  }

  mergeKeywordSearches("central", centralJaripResult, centralYouthResult);
  mergeKeywordSearches("local", localJaripResult, localYouthResult);
  mergeKeywordSearches("gov24", gov24JaripResult, gov24YouthResult);
  mergeKeywordSearches("youthCenter", youthCenterJaripResult, youthCenterYouthResult);

  if (housingResult.status === "fulfilled") {
    bySource.housing.totalCount = housingResult.value.totalCount;
    bySource.housing.fetchedCount = housingResult.value.items.length;
    allItems.push(...housingResult.value.items);
  }
  if (trainingResult.status === "fulfilled") {
    bySource.training.totalCount = trainingResult.value.totalCount;
    bySource.training.fetchedCount = trainingResult.value.items.length;
    allItems.push(...trainingResult.value.items);
  }
  if (jobseekerProgramResult.status === "fulfilled") {
    bySource.jobseekerProgram.totalCount = jobseekerProgramResult.value.totalCount;
    bySource.jobseekerProgram.fetchedCount = jobseekerProgramResult.value.items.length;
    allItems.push(...jobseekerProgramResult.value.items);
  }
  if (dualTrainingResult.status === "fulfilled") {
    bySource.dualTraining.totalCount = dualTrainingResult.value.totalCount;
    bySource.dualTraining.fetchedCount = dualTrainingResult.value.items.length;
    allItems.push(...dualTrainingResult.value.items);
  }

  const careLeaverItems = allItems.filter(isAboutCareLeavers);
  for (const item of careLeaverItems) {
    bySource[item.source].filteredCount += 1;
  }

  const youthItems = allItems.filter(isAboutYouth);
  for (const item of youthItems) {
    bySource[item.source].youthCount += 1;
  }

  return NextResponse.json({
    bySource,
    sourceLabel: SOURCE_LABEL,
    filteredItems: careLeaverItems,
    youthItems,
    allItems,
  });
}
