# UI audit integration

User scope: sequential Travline release prompts, step 4. Start from current main and reconcile the missing changes in #120–#126 without replacing newer forms, finance, security or seat-map work.

## Changes to verify
- Nested modal focus ownership, scroll locking, Escape, localization and viewport reachability; preserve current scrollable and closeLabel props.
- Native light/dark color scheme and visible date/time picker controls.
- Departure editing displays local wall time and sends the same instant to the API; mobile field layout.
- Itinerary/quotation cards, reservation actions/tabs and commission preview controls fit mobile layouts.
- Retain existing FormModal draft preservation, validation and save locking; add missing rejected-save/customer regression fixtures.

## Evidence requirements
Run component browser regressions plus all six required checks. Staging Acceptance must execute authenticated customer editing/conflict recovery, departure persistence, mobile populated layouts and initial route inventories in both themes at 390/768/1440. An initial route render is not full workflow verification. Use only disposable synthetic data. Screenshots are CI evidence; no manual visual inspection has been performed in the unavailable local execution environment.

## Remaining blockers
Waiver schema/API/token/public form contract is confirmed broken and requires a separate coordinated fix with migration and security regression coverage. This integration does not certify every form, portal or production deployment. Final release remains NO-GO until critical gaps and infrastructure verification are resolved.
