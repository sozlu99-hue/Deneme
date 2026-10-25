# POS migration and browser review

This change starts from main commit e14ff2c86544c263684b4563ddbb01945de2e720. It was prepared in a separate checkout. It does not copy the unavailable working tree from another Codex account.

## Fault and behavior

The dialog close event can arrive after the dialog opens again. The old listener canceled the current migration and stopped the new camera. The listener now ignores that event while the dialog is open. Closing the current dialog still cancels migration and stops its camera.

Three new tests exercise these event sequences. Before the fix, two failed. After the fix, all three passed. These tests are included in the main test count.

## Test setup

Browser tests accept AESD_CHROMIUM_PATH. Without that variable, they use the browser installed by Playwright. Each browser group has a new local server and SQLite database. Login rate limits are unchanged.

The missing WebView origin test was restored from the earlier local source. It checks login and recovery routing from HTTPS localhost with isolated HTTP responses. It does not test a real Android WebView.

The remembered-role checks use separate browser contexts. Service workers are blocked only for those mocked configuration checks. The general browser group still tests normal service-worker behavior and crash reopening. Both wrong-role checks require no API access, no private frame and no retained saved session.

The cloud browser test waits for the purchased stock to appear before closing the dialog. It does not force a click through an open dialog or skip the stock assertion.

Four test imports now resolve the server from the actual repository root. They no longer require an external parent-server folder.

## Validation in this checkout

- Main unit tests: 172 passed, 0 failed.
- Available private panel tests: 5 passed, 0 failed.
- Browser groups: 92 checks passed. General: 26. Auth: 15. WebView origin: 3. Review: 12. Panels: 28. Cloud: 8.
- APK packaging tests: 15 passed. No APK was built or signed.
- Node 24.19.0 was used. Existing installed dependencies were reused. A clean dependency install was not run.

The first cloud browser run failed because the test closed the purchase dialog before its asynchronous update finished. The test now waits for the updated stock. The first log is retained with the evidence.

Native HTTP and PostgreSQL integration tests were not run in this checkout. No real Gmail delivery or physical Android/iOS test was run. The legacy email test requires healthy storage before login. Its 503 guard was not removed or reported as a successful email delivery.

## Delivery status

This is source for review. No merge, Render deploy, environment publication, Drive write or APK update was performed. Existing POS and CARİ services and data remain unchanged. The app.js fix needs a later APK build for bundled Android assets.

## Repeat the checks

Install root and platform dependencies in an isolated checkout. From platform, run npm test and npm run test:private. Install the Playwright Chromium browser, or set AESD_CHROMIUM_PATH to an installed Chromium executable. Run npm run test:browser. To select one group, use npm run test:browser -- tests/review-browser.mjs. Run python tests/apk-packaging-check.py for packaging checks.

Fresh evidence is in evidence/pos-migration-20261012. Historical counts and hashes are not current build evidence.
