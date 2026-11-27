# Intelligence M2 — Document Audit & Corrections

**Status:** DONE  
**Priority:** P0  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`, `docs/audits/intelligence/ISSUE_REGISTER.md`

## 1. Goal
Fix all P0 and P1 PDF/document defects identified in Milestone 1 so that every generated document (departure manifests, batch vouchers, reservation invoices, receipts, and quotation PDFs) is accurate, tenant-safe, properly authenticated, and legally/fiscally truthful.

## 2. Scope (In)
1. **ISS-003 (`departureDocuments.ts`):**
   - Fix `customers` query (`full_name` instead of nonexistent `first_name`/`last_name`) across manifest, CSV, and batch vouchers.
   - Fail loudly on query errors instead of silently rendering blank documents.
   - Filter out `status = 'cancelled'` reservations when generating departure manifests and batch vouchers.
2. **ISS-002 (`reservations.ts` + `pdfTemplateRenderer.ts`):**
   - Stop `invoice.pdf` from summing all `package_services` (including `is_optional=true`) and overriding `reservation.total_amount`.
   - Ensure `reservation.total_amount` is authoritative, optional services are not forced into the invoice total, and agency `tax_id`/`bank_account` appear cleanly on the invoice.
3. **ISS-005 (`receipts.ts` + `pdfTemplateRenderer.ts`):**
   - Replace un-fiscalized fiscal claims (`Fiskalni račun`, `Avansni račun`, `RAČUN`, `FR-YYYY-XXXX`) with accurate non-fiscal terminology (`Potvrda uplate`, `Predračun` / `PU-YYYY-XXXX`) when no real fiscal provider is connected (`fiscal_status !== 'fiscalized'` / `!fiscal_data?.jir`).
   - Enforce immutability on issued receipts (reject `PATCH`/`DELETE` on issued receipts; refunds/stornos create a new refund/cancellation record).
4. **ISS-008 (`quotations.ts` + `QuotationDetail.tsx`):**
   - Fix Quotation PDF rendering so it renders a real Quotation (`PONUDA` / `QUOTATION`) with `sellTotal` and line items instead of miswired `INVOICE` (`0.00 BAM`).
   - Replace unauthenticated `window.open(quotationPdfUrl(id), '_blank')` in `QuotationDetail.tsx` with authenticated fetch/blob download.

## 3. Out of scope
- Real `BA`/`HR` live fiscalization provider integration (remains stubbed/deferred until owner supplies fiscal specs/credentials).
- FIT / individual holiday schema changes (Milestone 3).
- AI infrastructure (Milestone 5+).

## 4. Acceptance criteria
- [x] `departureDocuments.ts` uses `customers.full_name`, surfaces DB errors, and excludes cancelled reservations.
- [x] `invoice.pdf` respects `reservation.total_amount` and does not sum unselected optional `package_services`.
- [x] Un-fiscalized receipts use non-fiscal labels and `PU-YYYY-XXXX` numbering (or clearly non-fiscal prefix) and block `PATCH`/`DELETE` on issued receipts.
- [x] Quotation PDF renders accurate quotation data and `QuotationDetail.tsx` downloads it with auth.
- [x] Existing + new unit tests pass (`nmt-analytics-api` and `nmt-analytics-admin`).
