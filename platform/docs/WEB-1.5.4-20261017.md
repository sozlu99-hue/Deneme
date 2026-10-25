# AESD Server Web 1.5.4

The browser app uses the existing `/aesd/` address, accounts and storage.
The Web release is 1.5.4. The server package stays at 1.0.3.
The delivered owner and customer APKs stay at 1.5.3. No APK is rebuilt.

## Browser entry

The Web app now has a manifest, a PNG icon and installation help.
Chrome and Edge can use an offered installation prompt. Safari users get
manual Home Screen steps. A dismissed prompt can open manual help.
Installed and native apps do not show the Web installation controls.
Staff still use the separate staff login. Existing roles and device approval apply.

The worker caches public app files. It does not cache authenticated API
responses, private panel HTML or financial responses. An offline shell is
not a successful login or a confirmed shared sale. Existing owner private
panel offline rules stay in effect.

## Corrected business date

Finding S05-001: the sector summary used the device timezone. Staff summaries
used Europe/Istanbul. A sale at 2026-10-16T21:00:00Z could appear on October 16
in a UTC browser and October 17 in the staff summary. Month totals could differ.

`web/pos.js` now uses Europe/Istanbul for business dates. The sector heading
uses the same timezone. No stored timestamp, sale amount or record is changed.
The four-zone regression had three failures before this change and none after it.
Old submitted summaries update when the client next sends its current summary.
Existing packaged APKs keep their own older interface until a separate APK release.

## Validation

See `../evidence/web154-validation.json` for the test groups and source hashes.
185 platform tests, 91 browser checks, 7 cloud PostgreSQL tests, 4 server storage
tests with PostgreSQL, 16 recovery tests, 5 private panel tests, 1 native SQLite
HTTP test and 15 packaging checks pass. The email and Gmail checks use mocks.

The unchanged CARI source also passes 272 tests, 31 targeted PostgreSQL checks,
11 Web cash checks, 11 Android-interface browser checks and 11 packaging checks.
Eight tests in the default CARI command are skipped. The PostgreSQL subset is
run separately. Windows-only checks need Windows.

Browser tests use isolated accounts, local databases and desktop Chromium.
No production finance operation is sent. No physical Android, iPhone or real
browser installation acceptance is claimed. Live deployment metadata must be
checked separately. No formal ASD-STE100 certification or fault-free claim is made.
