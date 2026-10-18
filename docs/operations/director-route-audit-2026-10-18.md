# Director coverage fixture

Branch: test/audit-director-route-coverage. Base: 21ce102733e817638f71d545a96fadd87cd0221d.

The manager/trial route sweep redirected eight settings/finance routes. Add a third isolated synthetic organization, enterprise entitlements and a director account without altering existing manager/staff/other-tenant fixtures. The existing seed refuses non-local Supabase URLs and NODE_ENV=production. A query verifies the director profile after upsert; browser/API reachability is verified by CI.

The added browser sweep records screenshots, redirects, HTTP errors, exceptions and overflow at 390/768/1440 in both themes. INITIAL_RENDER_ONLY is not full form verification. It never activates providers or sends messages. Remaining workflows, tabs, modals, real form persistence and role combinations require separate testing.

Files: nmt-analytics-api/src/scripts/seed_acceptance.ts; .github/workflows/staging-acceptance.yml; nmt-analytics-admin/e2e/pilot-director-route-audit.spec.ts; this report; docs/tasks/active/director-route-audit.md. No migrations or production changes. Execution pending isolated CI; no PASS claimed in advance.
