# Server Web 1.5.7 and backend 1.0.4

Publish the six-module audit corrections. Keep the existing Android APK unchanged.

- Reject stale legacy sessions and OAuth states. Require a matching verified email.
- Bind the first device atomically after password verification.
- Add a bounded customer refund. Retain collection and sale history.
- Check private customer and cash deltas. Reject changes to historical movements.
- Validate exact money input. Keep valid zero-cost products.
- Share one SQLite connection. Keep WAL, a 5-second busy timeout and snapshot CAS.
- Reject late writes after a request timeout. Stop new writes until restart.
- Return 404 for absent admin records. Keep valid repeated actions idempotent.
- Bound cached configuration to 24 hours. Do not cache private API data.
- Update table scrolling, message styles, installation and viewport handling.

Validation: the audit suite passed 485 tests across both repositories and
81 Chromium checks. Three Windows-only tests skipped on Linux.
The real legacy host also passes its release health and served-asset checks
against a separate temporary PostgreSQL database.

The snapshot backend requires one process and one service instance.
Keep the existing database and secrets. Confirm the live Render commit and
release_verification log. A source commit alone is not proof of deployment.
