# Departure datetime audit

Base main: 21ce102733e817638f71d545a96fadd87cd0221d. Branch: fix/audit-departure-timezone.

All six browser baseline cases reproduced UTC timestamps being sliced into datetime-local controls: 07:00Z displayed as 07:00 instead of Sarajevo 09:00 in July. Datetime-local values were then sent without an offset. The fix formats initial values using browser-local calendar components and serializes submitted local values to explicit UTC ISO timestamps. Invalid/empty values continue to the existing validation/error path.

Seven component browser regressions pass: light/dark × 390/768/1440, unchanged save retains 07:00Z, local 10:15 edit submits 08:15Z, and winter local 08:00 saves as 07:00Z. Theme class verified. These component fixtures do not certify database persistence. Real isolated-API edit/save/reload regressions are added for both themes and all three widths; CI execution pending.

Application changes: DepartureFormModal.tsx and utils/dateTimeInput.ts. Regression files: e2e-dates fixture/spec, playwright.dates.config.ts, e2e/pilot-departure-datetime.spec.ts and .github/workflows/departure-datetime.yml. Admin build/lint results recorded in PR. API implementation and migrations unchanged/not run locally. No production data, demo generation or merge. Other datetime forms remain unaudited.

Mobile visual inspection also reproduced clipped datetime values in two narrow columns (163px input width at 390px viewport). A focused browser regression failed before the change. Date and numeric/status grids now stack on mobile and retain their existing columns from sm upwards; the regression requires full-width mobile datetime controls.
