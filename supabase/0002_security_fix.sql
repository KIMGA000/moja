-- =========================================================================
-- MOJA 보안 수정 (긴급) — announcements_all 뷰의 RLS 우회 차단
--
-- 문제: announcements_all 뷰는 security_invoker가 꺼져 있어서 소유자(postgres) 권한으로
--       실행되고 RLS를 우회한다. 개별 8개 테이블은 "review_status = 'approved'" 정책이
--       정상 작동하는데 뷰만 전체 행이 anon 키로 읽힌다.
--       → 검수 전(pending)·반려(rejected) 공고의 원문이 브라우저에 공개된 키로 읽힌다.
--
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.
-- 필요 버전: PostgreSQL 15 이상 (Supabase는 충족)
--
-- 영향 범위:
--   · service role(secret key)로 조회하는 서버 코드 → 영향 없음 (원래 RLS를 우회)
--   · anon/authenticated 조회 → 이제 approved 행만 보인다 (의도한 동작)
-- =========================================================================

alter view announcements_all set (security_invoker = on);

-- 확인 쿼리 --------------------------------------------------------------
-- SQL Editor는 소유자 권한으로 돌기 때문에 여기서는 전체가 보이는 게 정상이다.
-- 실제 검증은 anon 키로 REST를 직접 때려봐야 한다:
--
--   curl "https://hoemgmadhkzfeqjejgfg.supabase.co/rest/v1/announcements_all?select=id,review_status&review_status=neq.approved" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--
-- 수정 전: pending/rejected 행이 그대로 나온다
-- 수정 후: [] 가 나와야 한다
-- ------------------------------------------------------------------------

-- 참고: 뷰에 anon 권한이 필요한지 다시 확인한다.
-- security_invoker가 켜지면 뷰를 조회하는 롤(anon)의 권한으로 기반 테이블을 읽으므로,
-- anon이 기반 테이블에 SELECT 권한을 갖고 있어야 뷰가 동작한다.
-- (schema.sql에서 RLS 정책을 anon에게 부여했으니 이미 충족되지만, grant도 확인해둔다.)
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
    execute format('grant select on %I to anon, authenticated', t);
  end loop;
end $$;

grant select on announcements_all to anon, authenticated;
