-- =========================================================================
-- MOJA 자연어 기준 레이어 추가
--
-- 기존 8개 테이블에 컬럼 2개만 더한다. 기존 컬럼(mentions_* / requires_* 등)은
-- 지우지 않는다 — 역할을 나눈다:
--
--   mentions_* / requires_* / region_scope / protection_years_limit
--     → classify.ts가 키워드로 뽑은 "자동 초안". 검수 큐 필터링·정렬용. 신뢰도 낮음.
--   criteria / conditions
--     → 사람이 검수해서 확정한 "판정 기준". 판정은 이것만 쓴다.
--
-- criteria 형태 (lib/criteria/catalog.ts 의 CriterionSpec 과 1:1 대응):
--   [
--     { "key": "has_institutional_care", "params": {},
--       "sentence": "시설·위탁가정에서 지낸 경험이 있어야 해요",
--       "source": "auto", "verified": true },
--     { "key": "within_years_after_exit", "params": { "years": 5 },
--       "sentence": "보호가 끝난 뒤 **5년** 안에 신청해야 해요",
--       "source": "human", "verified": true }
--   ]
--
-- conditions 는 criteria 를 lib/criteria/toCondition.ts 로 변환한 캐시다.
-- 매 판정마다 변환하면 느리므로 저장 시점에 굳혀둔다.
--
-- 실행: Supabase 대시보드 → SQL Editor. 0002_security_fix.sql 을 먼저 실행하세요.
-- =========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'announcements_central', 'announcements_local', 'announcements_gov24',
    'announcements_housing', 'announcements_training',
    'announcements_jobseeker_program', 'announcements_dual_training',
    'announcements_youth_center'
  ]
  loop
    -- 자연어 기준 + 기계 조건 캐시
    execute format(
      'alter table %I add column if not exists criteria jsonb not null default ''[]''::jsonb', t);
    execute format(
      'alter table %I add column if not exists conditions jsonb not null default ''[]''::jsonb', t);

    -- 검수 진행 상태를 세분화: 여러 명이 나눠 검수할 때 "내가 보고 있는 건"을 잠근다.
    -- 기존 check 제약(pending/approved/rejected)에 in_review / hold 를 추가한다.
    execute format('alter table %I drop constraint if exists %I', t, t || '_review_status_check');
    execute format(
      'alter table %I add constraint %I check (review_status in (''pending'',''in_review'',''approved'',''rejected'',''hold''))',
      t, t || '_review_status_check');

    -- 잠금 시각 — 30분 넘게 방치된 in_review 를 자동으로 풀어주기 위해 필요하다.
    execute format(
      'alter table %I add column if not exists claimed_at timestamptz', t);

    -- 재검수 기한 — 법령·금액이 자주 바뀌는 항목은 짧게(3개월) 잡는다.
    execute format(
      'alter table %I add column if not exists reverify_by date', t);

    -- 검수가 끝난 건(criteria 가 비어있지 않은 것)을 빠르게 찾기 위한 인덱스
    execute format(
      'create index if not exists %I on %I ((criteria <> ''[]''::jsonb))',
      t || '_criteria_done_idx', t);
  end loop;
end $$;

-- 뷰를 다시 만든다 (새 컬럼이 포함되게). security_invoker 는 유지한다.
create or replace view announcements_all as
  select 'central' as source, * from announcements_central
  union all select 'local' as source, * from announcements_local
  union all select 'gov24' as source, * from announcements_gov24
  union all select 'housing' as source, * from announcements_housing
  union all select 'training' as source, * from announcements_training
  union all select 'jobseekerProgram' as source, * from announcements_jobseeker_program
  union all select 'dualTraining' as source, * from announcements_dual_training
  union all select 'youthCenter' as source, * from announcements_youth_center;

alter view announcements_all set (security_invoker = on);
grant select on announcements_all to anon, authenticated;

-- =========================================================================
-- 검수 이력 — 여러 명이 나눠 검수하니 누가 언제 뭘 바꿨는지 남긴다.
-- 공고는 (source, source_id) 로 특정한다. id 는 테이블마다 1부터 독립이라 단독으로는
-- 공고를 특정할 수 없다 (like ... including all 이 시퀀스를 따로 만들기 때문).
-- =========================================================================

create table if not exists review_log (
  id         bigserial primary key,
  source     text not null,
  source_id  text not null,
  reviewer   text not null,
  action     text not null
             check (action in ('claim','release','edit','approve','reject','hold','mark_duplicate','reopen')),
  before     jsonb,
  after      jsonb,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists review_log_target_idx on review_log (source, source_id, created_at desc);

alter table review_log enable row level security;
-- 익명 사용자는 검수 이력을 볼 수 없다. 서버(secret key)만 읽고 쓴다.
drop policy if exists "검수 이력은 서버만" on review_log;

-- =========================================================================
-- 검수 큐 뷰 — 관리자 화면이 한 번에 읽는다.
-- 우선순위: 검수 안 된 것 > 자립준비청년 관련 확실 > 초안 근거 적음(사람 손 필요) > 그 외
-- =========================================================================

create or replace view v_review_queue as
select
  a.source,
  a.id,
  a.source_id,
  a.serv_nm,
  a.org,
  a.region,
  a.region_scope,
  a.deadline,
  a.mentions_care_leaver,
  a.mentions_youth,
  a.interest_categories,
  a.review_status,
  a.reviewed_by,
  a.reviewed_at,
  a.claimed_at,
  a.criteria,
  jsonb_array_length(a.criteria)                                    as criteria_count,
  (a.criteria = '[]'::jsonb)                                        as needs_review,
  -- 자동 초안이 잡아낸 신호 개수 — 적을수록 사람이 원문을 읽어야 한다
  (a.requires_enrolled::int + a.requires_no_home::int
   + a.requires_basic_livelihood::int + a.requires_already_ended::int
   + (a.protection_years_limit is not null)::int
   + (a.region_scope is not null)::int)                             as auto_signal_count,
  -- 검수 우선순위 점수 (낮을수록 먼저)
  ( case when a.criteria = '[]'::jsonb then 0 else 100 end
  + case when a.mentions_care_leaver then 0 else 10 end
  + case when a.review_status = 'in_review' then 50 else 0 end
  + least( (a.requires_enrolled::int + a.requires_no_home::int
            + a.requires_basic_livelihood::int + a.requires_already_ended::int), 4 )
  )                                                                  as priority_score
from announcements_all a;

alter view v_review_queue set (security_invoker = on);

-- 검수 큐는 익명에게 노출하지 않는다 (검수 전 데이터가 섞여 있음).
-- 관리자 화면은 서버 라우트에서 secret key 로 조회한다.
revoke all on v_review_queue from anon, authenticated;

-- =========================================================================
-- 재검수 대상 — reverify_by 가 지난 것. 법령·금액이 바뀌었을 수 있다.
-- =========================================================================

create or replace view v_needs_reverify as
select source, id, source_id, serv_nm, reverify_by, reviewed_by, reviewed_at
from announcements_all
where reverify_by is not null
  and reverify_by < current_date
  and review_status = 'approved';

alter view v_needs_reverify set (security_invoker = on);
revoke all on v_needs_reverify from anon, authenticated;
