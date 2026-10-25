# POS release 1.5.2

The release includes the migration dialog fix and the portable browser checks from commit 796fd8391c82348d97c4a4cfe814bf4ebce80284.

A delayed close event no longer cancels a newly opened migration dialog or stops its camera. Closing the current dialog still works.

The owner and customer APKs use version name 1.5.2 and version code 152. The builder keeps the original signing certificate and native program. It changes the manifest version and replaces the bundled web files. The customer package excludes owner and staff assets.

The server database schema, persistence code, dependency versions and signing keys are unchanged. CARİ is a separate application. This release does not include the separate hardening changes in PR 9.

## Checks

The application fix passed 172 unit tests, 5 available private panel tests and 92 isolated browser checks. See evidence/pos-migration-20261012 for those logs.

During release preparation, the native SQLite HTTP test passed. It checks login, reset, access control and database reopening. The three dialog regression tests and 15 packaging checks passed again. The Android asset compiler accepted both changed manifests with version code 152 and version name 1.5.2.

Installed dependencies were reused. A clean dependency install was not run. PostgreSQL integration, real email delivery and physical Android/iOS tests were not run for this release.

## Delivery proof

Build evidence must name the source commit and the live backend commit. Verify both APK signatures, package names, version codes and embedded asset hashes. Compare Drive download hashes with the signed local files. Keep the existing Drive file IDs and permissions.

Local delivery records are in /workspace/aesd-delivery/current-apks.json. Do not treat this release note or a passing source test as proof of a successful deployment or upload.
