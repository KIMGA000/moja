import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── QA-4 수정: AnnouncementRow 를 실제 스키마(supabase/schema.sql + 0003_criteria.sql)에 맞춤 ──
//
// 고친 것:
//   · duplicate_of: number        → 실제로는 duplicate_of_source + duplicate_of_source_id 두 컬럼
//   · source: string (테이블 행)  → source 는 announcements_all 뷰에만 있는 컬럼이다.
//                                   개별 테이블을 조회하면 undefined 인데 타입은 string 이라고 해서
//                                   런타임에 조용히 undefined 가 흘러다녔다.
//                                   → AnnouncementRow(테이블) / AnnouncementViewRow(뷰) 로 분리
//   · 분류 컬럼 12개가 전부 누락되어 있었다 → 추가
//   · 0003_criteria.sql 로 추가된 criteria / conditions / claimed_at / reverify_by 추가
//   · review_status 에 in_review / hold 추가 (0003 에서 check 제약을 5개로 늘림)

/** 검수 워크플로우 상태. 0003_criteria.sql 의 check 제약과 일치해야 한다. */
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected" | "hold";

/** 8개 소스 테이블의 source 키. announcements_all 뷰의 source 컬럼 값과 같다. */
export type AnnouncementSource =
  | "central"
  | "local"
  | "gov24"
  | "housing"
  | "training"
  | "jobseekerProgram"
  | "dualTraining"
  | "youthCenter";

/** source 키 → 실제 테이블명. 쓰기는 뷰가 아니라 개별 테이블에 해야 한다. */
export const TABLE_BY_SOURCE: Record<AnnouncementSource, string> = {
  central: "announcements_central",
  local: "announcements_local",
  gov24: "announcements_gov24",
  housing: "announcements_housing",
  training: "announcements_training",
  jobseekerProgram: "announcements_jobseeker_program",
  dualTraining: "announcements_dual_training",
  youthCenter: "announcements_youth_center",
};

/** 관심분야 분류 (classify.ts 의 InterestCategory 와 동일 집합). */
export type InterestCategoryCode =
  | "INCOME" | "HOUSING" | "MEDICAL" | "EDUCATION"
  | "JOB" | "ASSET" | "MENTAL" | "MENTORING" | "ETC";

/**
 * 자연어 기준 한 개. lib/criteria/catalog.ts 의 CriterionSpec 과 1:1 대응한다.
 * source: 'auto'  = 자동 초안 (아직 사람 손을 안 탐)
 *         'human' = 검수자가 직접 넣거나 확정한 것
 */
export type StoredCriterion = {
  key: string;
  params: Record<string, unknown>;
  sentence: string;
  source: "auto" | "human";
  verified: boolean;
};

/**
 * 개별 announcements_* 테이블의 행.
 * ⚠️ id 는 테이블마다 1부터 독립이다 (schema.sql 의 `like ... including all` 이 시퀀스를
 *    따로 만든다). 공고 하나를 특정하려면 반드시 (source, id) 또는 (source, source_id) 쌍을
 *    써야 한다. id 만 쓰면 8개 테이블에서 겹친다.
 */
export type AnnouncementRow = {
  id: number;
  source_id: string;

  // 원문
  serv_nm: string;
  serv_dgst: string | null;
  org: string | null;
  region: string | null;
  target_traits: string | null;
  deadline: string | null;   // 원문 텍스트 그대로 (date 타입이 아니다)
  link: string | null;
  raw_data: unknown;         // WelfareItem — 쓰는 쪽에서 좁혀서 쓴다

  // 자동 초안 (classify.ts 가 저장 시점에 계산 — 키워드 추정이라 신뢰도 낮음)
  mentions_care_leaver: boolean;
  mentions_youth: boolean;
  protection_years_limit: number | null;
  requires_enrolled: boolean;
  requires_no_home: boolean;
  requires_basic_livelihood: boolean;
  requires_already_ended: boolean;
  region_scope: string | null;                    // null = 전국
  interest_categories: InterestCategoryCode[];
  protection_end_types_applicable: string[];      // ⚠️ 지금은 항상 5종 전부 (placeholder)

  // 사람이 검수해 확정한 판정 기준 (0003_criteria.sql)
  criteria: StoredCriterion[];
  conditions: unknown[];     // toCondition() 변환 캐시. lib/engine 의 PolicyCondition[]

  // 검수 워크플로우
  review_status: ReviewStatus;
  duplicate_of_source: string | null;      // 중복이면 대표 공고의 source
  duplicate_of_source_id: string | null;   // 그 테이블에서의 source_id
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  claimed_at: string | null;               // "내가 검수 중" 잠금 시각
  reverify_by: string | null;              // 재검수 기한 (date)

  fetched_at: string;
  created_at: string;
};

/** announcements_all 뷰의 행 = 테이블 행 + source 컬럼. */
export type AnnouncementViewRow = AnnouncementRow & { source: AnnouncementSource };

/** 검수 큐 뷰(v_review_queue)의 행. 0003_criteria.sql 의 select 목록과 일치. */
export type ReviewQueueRow = {
  source: AnnouncementSource;
  id: number;
  source_id: string;
  serv_nm: string;
  org: string | null;
  region: string | null;
  region_scope: string | null;
  deadline: string | null;
  mentions_care_leaver: boolean;
  mentions_youth: boolean;
  interest_categories: InterestCategoryCode[];
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  claimed_at: string | null;
  criteria: StoredCriterion[];
  criteria_count: number;
  needs_review: boolean;
  auto_signal_count: number;
  priority_score: number;
};


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 브라우저/일반 서버 코드에서 쓰는 공개 클라이언트. RLS 때문에 review_status='approved'만 읽힌다.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// 검수·동기화용 관리자 클라이언트. service role 키는 절대 클라이언트로 내려보내면 안 되므로
// API 라우트 등 서버 코드에서만 호출한다.
export function createSupabaseAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았어요.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았어요. .env.local을 확인해주세요.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
