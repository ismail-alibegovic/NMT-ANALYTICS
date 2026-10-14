# Pilot — Recover failed installments and report payment conflicts

**Status:** ACTIVE
**Priority:** P0
**Branch:** `fix/pilot-payment-recovery`
**Baseline:** `a7f6c4be4416e5c4c80b74cf2e1d1906ebc79e7f`
**Authority:** User authorized completing Travline in order on 2026-10-14.

## Goal and verified gaps

A manager can retry a failed scheduled payment using the existing canonical payment row. Two requests must not both transition the same pending/failed installment. Expected overpayment/database concurrency rejection must be a 4xx response instead of a generic 500. PR #79's acceptance test currently accepts 500 during concurrent payment attempts and treats a rejected failed-installment retry as success; those are recorded product gaps, not acceptance waivers.

## Scope

Permit pending or failed installments to be recorded, preserving installment ID, amount, tenant and currency validation. Use conditional updates against the observed status; reject already recorded/refunded/cancelled rows. Record old/new installment state in audit history. Translate named overpayment constraints and database serialization/deadlock errors without masking unrelated database faults. Expose retry for failed payments in the existing payment modal with BS/EN copy. Strengthen real database-backed acceptance to require successful recovery and a 4xx concurrent rejection.

No schema change, new payment ledger, historical payment rewrite, supplier finance or broad UI redesign. General payment request idempotency remains a separate finance slice; reusing installment identity does not certify arbitrary payment retries.

## Acceptance and verification

- Failed installment can become succeeded exactly once; paid amount and balance match the canonical ledger.
- Retry of a recorded installment and concurrent losing transition are rejected.
- Invalid amounts, currency or foreign reservation/installment IDs remain rejected.
- Overpayment constraints return 422; serialization/deadlock or the named canonical-cache conflict guard return 409; unrelated database errors stay 500. The guard is a rejected write, never success.
- Failed payment retry is reachable in the modal in BS/EN.
- API build/full suite and admin lint/build/full suite pass; isolated acceptance and Vercel preview remain green.
