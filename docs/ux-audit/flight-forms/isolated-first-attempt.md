# Initial isolated acceptance — no persistence PASS

Commit: `688cd38929397e7cfd314f3f3cc3aeb3ddd967ba`.
Run: https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39220842587

- All existing 37 scenarios passed.
- Six new Flight scenarios timed out waiting for New flight.
- The artifact page snapshot shows the guarded 404 page.
- The original acceptance organization has no enabled module rows. `/operations/flights` requires `travel_core`; the production ModuleGuard correctly denied access.
- No Flight record was created by these blocked cases, and database persistence was not verified.

Correction: a separate synthetic organization `00000000-0000-4000-8000-0000000000f1`, a manager and only the `travel_core` module are created by the existing localhost-only acceptance fixture script. The original two fixtures, authorization code and database schema are unchanged. Dedicated credentials are passed only through the acceptance environment; the test checks `/api/me/context` before interacting with the page. The next run must provide persistence evidence.

## Second isolated attempt

Commit: `69b7552280a33de138c13e4974117b2c1623e932`.
Run: https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39223246049

The dedicated entitlement assertion passed. All original 37 scenarios and the 14 fixture-browser cases passed, but the six real Flight cases timed out waiting for an `active=true` HTTP request before opening the create form. Source tracing confirmed that both Flight adapters supplied filter fields as bare Axios configuration instead of `config.params`, so Axios dropped them. The fixture had accepted the malformed shape and hid this bug.

Correction: both adapters now use `{ params }`, the shared GET configuration is statically typed, two regressions verify real Axios URL encoding, and the fixture accepts only the real contract. The real filter assertion remains in the acceptance test. No Flight persistence PASS is claimed for either failed attempt.

## Third isolated attempt

Commit: `807611953daa56022776aedd615a722ffe817a1c`.
Run: https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39225137815

41/43 passed: all existing 37 cases and the four light/dark 390/768 px Flight workflows. Real creation, edit, reload, cancel, persisted field values and cleanup were verified in those cases. Both desktop cases stopped at an ambiguous Create selector matching the header and the form submit button, before submitting. The test now scopes Create, Save changes and Cancel to their dialog. No product-code change is required for that selector correction; desktop persistence still requires a passing rerun.
