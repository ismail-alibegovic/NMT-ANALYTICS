# Initial isolated acceptance — no persistence PASS

Commit: `688cd38929397e7cfd314f3f3cc3aeb3ddd967ba`.
Run: https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39220842587

- All existing 37 scenarios passed.
- Six new Flight scenarios timed out waiting for New flight.
- The artifact page snapshot shows the guarded 404 page.
- The original acceptance organization has no enabled module rows. `/operations/flights` requires `travel_core`; the production ModuleGuard correctly denied access.
- No Flight record was created by these blocked cases, and database persistence was not verified.

Correction: a separate synthetic organization `00000000-0000-4000-8000-0000000000f1`, a manager and only the `travel_core` module are created by the existing localhost-only acceptance fixture script. The original two fixtures, authorization code and database schema are unchanged. Dedicated credentials are passed only through the acceptance environment; the test checks `/api/me/context` before interacting with the page. The next run must provide persistence evidence.
