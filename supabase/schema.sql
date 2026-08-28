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
  description_tags text[] not null default '{}', -- 원문에서 찾은 핵심 키워드 (화면에 #태그로 표시)

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

-- 이미 만들어져 있던 테이블에는 위 create table이 안 먹히니 따로 컬럼을 추가해준다.
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
      'alter table %I add column if not exists description_tags text[] not null default ''{}''', t
    );
    -- 공고 원문을 AI(Gemini)가 한 문장으로 쉽게 풀어 쓴 요약. 동기화 때 servDgst가 안 바뀐 공고는
    -- 재생성하지 않고 이 값을 그대로 재사용한다 (app/api/sync-announcements/route.ts 참고).
    execute format(
      'alter table %I add column if not exists plain_summary text', t
    );
    -- 접수기간이 이미 지난 공고는 기본적으로 화면에서 숨긴다(app/api/announcements/route.ts).
    -- 검수자가 "그래도 보여줘야 한다"고 판단하면 이 값을 true로 바꿔서 숨김을 해제할 수 있다
    -- (아직 검수 UI가 없어서 지금은 Supabase SQL Editor에서 직접 바꾼다).
    execute format(
      'alter table %I add column if not exists force_visible boolean not null default false', t
    );
  end loop;
end $$;

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

-- security_invoker 없이는 뷰가 정의자(뷰 생성자) 권한으로 실행돼서 개별 테이블의
-- RLS(승인된 공고만 노출)를 우회한다. anon 키로 이 뷰를 직접 조회하면 pending 공고까지
-- 새어나가던 문제라서, 조회자(anon/authenticated) 권한으로 실행되도록 강제한다.
alter view announcements_all set (security_invoker = on);

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
  -- 글쓰기는 로그인해야만 가능(2026-08-25부터). auth.uid()가 자동으로 채워져서, author를
  -- "익명"으로 표시해도 본인은 나중에 수정·삭제할 수 있다.
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author text not null,
  body text not null,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table community_posts add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();
alter table community_comments add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();

create index if not exists community_comments_post_id_idx on community_comments(post_id);
create index if not exists community_posts_user_id_idx on community_posts(user_id);
create index if not exists community_comments_user_id_idx on community_comments(user_id);

alter table community_posts enable row level security;
alter table community_comments enable row level security;

drop policy if exists "누구나 게시글 조회 가능" on community_posts;
create policy "누구나 게시글 조회 가능" on community_posts for select to anon, authenticated using (true);
drop policy if exists "누구나 게시글 작성 가능" on community_posts;
drop policy if exists "로그인해야 게시글 작성 가능" on community_posts;
create policy "로그인해야 게시글 작성 가능" on community_posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "본인 게시글만 수정 가능" on community_posts;
create policy "본인 게시글만 수정 가능" on community_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "본인 게시글만 삭제 가능" on community_posts;
create policy "본인 게시글만 삭제 가능" on community_posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "누구나 댓글 조회 가능" on community_comments;
create policy "누구나 댓글 조회 가능" on community_comments for select to anon, authenticated using (true);
drop policy if exists "누구나 댓글 작성 가능" on community_comments;
drop policy if exists "로그인해야 댓글 작성 가능" on community_comments;
create policy "로그인해야 댓글 작성 가능" on community_comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "본인 댓글만 수정 가능" on community_comments;
create policy "본인 댓글만 수정 가능" on community_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "본인 댓글만 삭제 가능" on community_comments;
create policy "본인 댓글만 삭제 가능" on community_comments for delete to authenticated using (auth.uid() = user_id);

-- =========================================================================
-- 로그인(카카오) 기반 개인화 프로필 — 신원인증은 아직 없고, 카카오 로그인만으로
-- "이 저장된 데이터가 진짜 그 사람 것"임을 보장하는 최소 계정 계층이다.
-- 온보딩 자격 진단 답변을 저장해두면 재방문 시 다시 입력하지 않아도 되고,
-- 이후 알림·로드맵 기능이 이 테이블을 기준으로 동작한다.
-- =========================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  onboarding_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "본인 프로필만 조회 가능" on profiles;
create policy "본인 프로필만 조회 가능" on profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "본인 프로필만 생성 가능" on profiles;
create policy "본인 프로필만 생성 가능" on profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "본인 프로필만 수정 가능" on profiles;
create policy "본인 프로필만 수정 가능" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- =========================================================================
-- 관심공고(북마크) — 로그인한 사용자가 개인화 화면에서 공고를 별표 저장/해제.
-- =========================================================================

create table if not exists bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source text not null,
  source_id text not null,
  -- 북마크 시점의 만 나이 스냅샷. "20대가 어떤 공고에 관심 가졌는지" 같은 연령대별 집계용이라
  -- 정확한 생년월일이 아니라 정수 나이만 남긴다 — 집계 낼 때도 user_id는 절대 같이 노출하지 않기.
  age_at_action int,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

alter table bookmarks add column if not exists age_at_action int;

create index if not exists bookmarks_user_id_idx on bookmarks(user_id);

alter table bookmarks enable row level security;

drop policy if exists "본인 북마크만 조회 가능" on bookmarks;
create policy "본인 북마크만 조회 가능" on bookmarks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "본인 북마크만 추가 가능" on bookmarks;
create policy "본인 북마크만 추가 가능" on bookmarks for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "본인 북마크만 삭제 가능" on bookmarks;
create policy "본인 북마크만 삭제 가능" on bookmarks for delete to authenticated using (auth.uid() = user_id);

-- =========================================================================
-- 공고 클릭 로그 — "공식 안내 페이지 바로가기"를 얼마나 누르는지 집계용.
-- ⚠️ 의도적으로 user_id를 안 넣는다: 누가 눌렀는지가 아니라 "어떤 공고가 인기 있는지"
-- 집계만 필요하고, 개인 식별이 가능한 클릭 로그는 만들지 않기로 했다 (2026-08-21 논의).
-- select 정책이 없어서 service role(관리자)만 조회 가능 — 클라이언트/anon은 insert만 가능.
-- =========================================================================

create table if not exists announcement_clicks (
  id bigint generated always as identity primary key,
  source text not null,
  source_id text not null,
  clicked_at timestamptz not null default now()
);

create index if not exists announcement_clicks_source_idx on announcement_clicks(source, source_id);

alter table announcement_clicks enable row level security;

drop policy if exists "누구나 클릭 기록 추가 가능" on announcement_clicks;
create policy "누구나 클릭 기록 추가 가능" on announcement_clicks for insert to anon, authenticated with check (true);
