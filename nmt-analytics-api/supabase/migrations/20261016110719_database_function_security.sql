BEGIN;

-- Trigger-only maintenance: PostgreSQL checks EXECUTE when a trigger is created,
-- not each time it fires. Existing INSERT/DELETE triggers continue to run as
-- their function owner; browser roles have no legitimate direct call path.
REVOKE EXECUTE ON FUNCTION public.recompute_group_member_count()
  FROM PUBLIC, anon, authenticated;
-- Preserve the API's existing service-role ACL for compatibility.
GRANT EXECUTE ON FUNCTION public.recompute_group_member_count() TO service_role;

-- Advisor 0011: this invoker trigger only raises an append-only exception.
-- Pin resolution without changing its body, owner, security mode or trigger.
ALTER FUNCTION public.prevent_supplier_confirmation_event_mutation()
  SET search_path = pg_catalog, public;
REVOKE EXECUTE ON FUNCTION public.prevent_supplier_confirmation_event_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_supplier_confirmation_event_mutation() TO service_role;

COMMIT;
