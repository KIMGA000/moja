-- MOJA 공고 저장/검수/중복탐지용 스키마 (v2)
-- API 소스별로 테이블을 따로 두고, 온보딩 질문과 매칭할 조건을 저장 시점에 미리 분류해서 컬럼으로 굳혀둔다.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행하세요.
-- 이미 v1 스키마(단일 announcements 테이블)를 실행했다면 먼저 `drop table if exists announcements cascade;`
-- 로 지우고 이 파일을 실행하세요.

create extension if not exists pg_trgm;

-- =========================================================================
-- 소스별 테이블 7개. 컬럼 구성은 전부 동일하다 (app/data/apiPreview.ts의 WelfareItem +
-- app/data/classify.ts가 뽑아내는 분류 컬럼).
-- =========================================================================

create table if not exists announcements_central (
  id bigint generated always as identity primary key,
  source_id text not null unique,          -- 각 API의 servId

  serv_nm text not null,
  serv_dgst text,
  org text,
  region text,
  target_traits text,
  deadline text,
  link text,
  raw_data jsonb,

  -- 온보딩 질문 매칭용 분류 (app/data/classify.ts에서 계산)
  mentions_care_leaver boolean not null default false,
  mentions_youth boolean not null default false,
  protection_years_limit int,                        -- "5년 이내" 같은 조건이면 5
  requires_enrolled boolean not null default false,   -- 재학(등록금·학자금·장학금) 요건
  requires_no_home boolean not null default false,    -- 무주택 요건
  requires_basic_livelihood boolean not null default false, -- 기초생활수급 요건
  requires_already_ended boolean not null default false,    -- 퇴소·보호종료·종결 전제
  region_scope text,                                  -- 특정 시·도명, 전국이면 null
  interest_categories text[] not null default '{}',   -- INCOME/HOUSING/MEDICAL/EDUCATION/JOB/ASSET/MENTAL/MENTORING/ETC
  protection_end_types_applicable text[] not null default '{}', -- AGE18_END 등 5종 중 해당하는 것

  -- 검수 워크플로우
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  duplicate_of_source text,      -- 중복이면 대표 공고가 속한 테이블 소스명 (예: 'local')
  duplicate_of_source_id text,   -- 그 테이블에서의 source_id
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,

  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists announcements_local (like announcements_central including all);
create table if not exists announcements_gov24 (like announcements_central including all);
create table if not exists announcements_housing (like announcements_central including all);
create table if not exists announcements_training (like announcements_central including all);
create table if not exists announcements_jobseeker_program (like announcements_central including all);
create table if not exists announcements_dual_training (like announcements_central including all);
create table if not exists announcements_youth_center (like announcements_central including all);

-- `like ... including all`은 identity/제약조건까지 복사하지만 시퀀스는 테이블마다 독립적으로 생성된다.
-- (즉 각 테이블의 id는 1부터 따로 시작한다 — 소스 내에서만 고유하면 되므로 문제 없음)

-- =========================================================================
-- 인덱스: 이름 유사도 검색(중복 후보 찾기) + 검수 상태 필터링
-- =========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'announcements_central', 'announcements_local', 'announcements_gov24',
    'announcements_housing', 'announcements_training',
    'announcements_jobseeker_program', 'announcements_dual_training',
    'announcements_youth_center'
  ]
  loop
    execute format(
      'create index if not exists %I_servnm_trgm on %I using gin (serv_nm gin_trgm_ops)', t, t
    );
    execute format(
      'create index if not exists %I_review_status_idx on %I (review_status)', t, t
    );
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "공개: 승인된 공고만 조회 가능" on %I', t
    );
    execute format(
      'create policy "공개: 승인된 공고만 조회 가능" on %I for select to anon, authenticated using (review_status = ''approved'')',
      t
    );
  end loop;
end $$;

-- =========================================================================
-- 전체 소스를 한 번에 조회하는 통합 뷰 (앱 화면·중복 탐지 쿼리에서 사용)
-- =========================================================================

create or replace view announcements_all as
  select 'central' as source, * from announcements_central
  union all
  select 'local' as source, * from announcements_local
  union all
  select 'gov24' as source, * from announcements_gov24
  union all
  select 'housing' as source, * from announcements_housing
  union all
  select 'training' as source, * from announcements_training
  union all
  select 'jobseekerProgram' as source, * from announcements_jobseeker_program
  union all
  select 'dualTraining' as source, * from announcements_dual_training
  union all
  select 'youthCenter' as source, * from announcements_youth_center;

-- =========================================================================
-- 참고용 쿼리 (검수 시 활용)
-- =========================================================================

-- 소스 간 이름이 비슷한 중복 후보 찾기:
-- select a.source, a.id, a.serv_nm, b.source, b.id, b.serv_nm,
--        similarity(a.serv_nm, b.serv_nm) as score
-- from announcements_all a
-- join announcements_all b
--   on (a.source, a.id) < (b.source, b.id)
-- where similarity(a.serv_nm, b.serv_nm) > 0.4
-- order by score desc;

-- 특정 프로필(서울 거주, 조기퇴소, 미재학)에 맞는 승인된 공고 찾기 예시:
-- select * from announcements_all
-- where review_status = 'approved'
--   and mentions_care_leaver = true
--   and (region_scope is null or region_scope = '서울특별시')
--   and (protection_years_limit is null or protection_years_limit >= 5)
--   and requires_enrolled = false;

-- =========================================================================
-- 커뮤니티 게시판 (로그인 없이 익명 닉네임으로 작성) — 기존에 로컬 JSON 파일로 저장하던 것을
-- Supabase 테이블로 옮긴다. 배포 환경(Vercel)은 파일시스템이 읽기 전용이라 JSON 파일 저장이
-- 동작하지 않기 때문. 이 게시판은 회원가입이 없어서 누구나 읽고 쓸 수 있게 RLS를 열어둔다
-- (공고 테이블처럼 승인 대기 상태를 두지 않음 — 악용 방지는 이번 MVP 범위 밖).
-- =========================================================================

create extension if not exists pgcrypto;

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('free', 'info', 'counsel', 'question')),
  title text not null,
  body text not null,
  author text not null,
  badge text,
  created_at timestamptz not null default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_id_idx on community_comments(post_id);

alter table community_posts enable row level security;
alter table community_comments enable row level security;

drop policy if exists "누구나 게시글 조회 가능" on community_posts;
create policy "누구나 게시글 조회 가능" on community_posts for select to anon, authenticated using (true);
drop policy if exists "누구나 게시글 작성 가능" on community_posts;
create policy "누구나 게시글 작성 가능" on community_posts for insert to anon, authenticated with check (true);

drop policy if exists "누구나 댓글 조회 가능" on community_comments;
create policy "누구나 댓글 조회 가능" on community_comments for select to anon, authenticated using (true);
drop policy if exists "누구나 댓글 작성 가능" on community_comments;
create policy "누구나 댓글 작성 가능" on community_comments for insert to anon, authenticated with check (true);
