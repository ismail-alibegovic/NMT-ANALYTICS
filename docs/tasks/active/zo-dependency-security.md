# Zo stabilization: dependency security

User-authorized security hardening. Apply compatible security patches to existing development/build dependencies and pin Vitest to patched 4.1.12 in both subprojects. No forced major upgrades, new features, schema changes, paid services or production writes. Preserve lockfile reproducibility and existing test assertions.

Run npm ci, API build/tests, admin lint/build/tests, strict serverless/NodeNext checks, complete npm audit and protected GitHub CI including browser/database acceptance. Audit evidence must distinguish production dependencies from all dependencies. Zo remains responsible for runtime verification.
