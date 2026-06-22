-- MT-4 RLS DB-layer proof. Run as the table owner against the app DB, e.g.:
--   docker exec -i -e PGPASSWORD=<pw> <pg-container> \
--     psql -U postgres -d pharmacy_mcq -f - < scripts/mt4-rls-db-verify.sql
--
-- Acts as the least-privilege `pharmacy_app` role (which RLS applies to) and proves: a tenant only
-- sees shared (organizationId NULL) + its own rows, and cannot write into another org.
SET ROLE pharmacy_app;
SET app.is_super = 'on';                          -- bypass while we seed two synthetic orgs
\set orgA '11111111-1111-1111-1111-111111111111'
\set orgB '22222222-2222-2222-2222-222222222222'
DELETE FROM curriculums WHERE code LIKE 'RLSTEST-%';
INSERT INTO curriculums (id,code,name,status,"organizationId","createdAt","updatedAt") VALUES
 (gen_random_uuid(),'RLSTEST-A','A','DRAFT', :'orgA', now(), now()),
 (gen_random_uuid(),'RLSTEST-B','B','DRAFT', :'orgB', now(), now()),
 (gen_random_uuid(),'RLSTEST-SHARED','S','DRAFT', NULL, now(), now());

-- Scope to org A (non-super) and read.
SET app.is_super = 'off';
SELECT set_config('app.current_org', :'orgA', false);
\echo '--- expect see_a=1 see_b=0 see_shared=1 ---'
SELECT count(*) FILTER (WHERE code='RLSTEST-A')      AS see_a,
       count(*) FILTER (WHERE code='RLSTEST-B')      AS see_b,
       count(*) FILTER (WHERE code='RLSTEST-SHARED') AS see_shared
FROM curriculums;

\echo '--- expect ERROR: cross-org INSERT blocked by WITH CHECK ---'
INSERT INTO curriculums (id,code,name,status,"organizationId","createdAt","updatedAt")
  VALUES (gen_random_uuid(),'RLSTEST-CROSS','x','DRAFT', :'orgB', now(), now());

-- Cleanup (bypass).
SET app.is_super = 'on';
DELETE FROM curriculums WHERE code LIKE 'RLSTEST-%';
RESET ROLE;
