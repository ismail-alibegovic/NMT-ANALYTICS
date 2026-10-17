# Auth provider readiness

Scope authorized by owner: signup, confirmation, login and recovery support for later Supabase Auth SMTP activation. No live settings or real email sends.

Use normal anonymous signUp in a fresh server client (admin.createUser never sends confirmation), preserving the existing API organization provisioning boundary. Never return sessions or raw Auth provider errors from signup. ADMIN_URL controls a server-owned confirmation URL /auth/signin; no browser-provided redirect is accepted. Reset redirects to the current origin /auth/reset-password. Supabase Auth's Site URL and redirect allowlist must include these exact approved origins/paths. Configure Auth SMTP separately from tenant transactional SMTP. Enable confirm-email when activating; do not auto-confirm accounts in application code.

Recovery update form requires an established recovery session/event, ignores forged hash-only links, presents localized expired-link feedback, and signs out the recovery session after password update. Keep existing session-expiry protections.

Validation: API signup contract tests; frontend recovery rendering/redirect/error tests; existing login acceptance with isolated Auth; PR CI. Live SMTP delivery and confirmation/recovery links through the owner's provider remain deferred acceptance steps.
