# Production activation follow-up

Owner-authorized scope: apply the four reviewed pending production migrations, verify database security and financial invariants, configure available operational controls, and implement read-only availability monitoring. Do not create or edit customer/payment records for verification. Keep communication jobs disabled until provider credentials and delivery readiness are established. External ingestion and alert receipt require real provider configuration; never fabricate success.

Use a dedicated branch and normal protected PR. Preserve existing test coverage and immutable migration files. Record activation limits separately from application build/test results.
