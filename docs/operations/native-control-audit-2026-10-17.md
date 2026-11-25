# Native control theme audit

Base: 21ce102733e817638f71d545a96fadd87cd0221d. Branch: fix/audit-native-date-theme.

Confirmed in Chromium: native controls inherited `color-scheme: normal` even with the application dark class, and the loaded stylesheet globally suppressed date/time calendar picker indicators. All seven new browser cases failed on baseline. The fix explicitly aligns the browser color scheme with the existing light/dark class and removes the indicator suppression. No redesign or date data conversion is introduced.

Seven browser regressions pass after the fix: both themes at 390/768/1440, date/time/number edits, select changes, reset behavior, no page overflow, theme persistence after reload, and no loaded indicator-hiding rule. These are synthetic component fixtures, not proof of page-specific validation or database persistence. Native OS popup behavior on Safari/iOS remains untested. Screenshots are captured as CI artifacts.

Admin build passes. Lint exits 0 with 52 existing warnings. No TypeScript application changes; unit tests were not rerun locally for this CSS-only change. API code/tests/build and migrations are unchanged/not run locally. CI remains required. No production data modified. This is an independent slice of the incomplete full application audit; do not merge automatically.

Files: src/index.css; e2e-native/controls.spec.ts; e2e-native/fixtures/controls.html and controls.tsx; playwright.native.config.ts (under nmt-analytics-admin); .github/workflows/native-controls.yml; this report.
