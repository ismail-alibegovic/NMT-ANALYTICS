-- 033b_fix_package_services_org_id.sql
-- Fix: Add org_id to package_services (was missing from original 033)
-- Required for RLS policy and multitenancy

ALTER T