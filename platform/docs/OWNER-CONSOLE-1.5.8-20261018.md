# AESD Server owner console 1.5.8

The owner uses a compact customer list with search, status filters and account counters. A customer detail page opens its panel licenses and bound-device state. License changes show the customer, panel, package and resulting date before confirmation. Payment confirmation remains mandatory. Customer devices and staff device requests have separate screens. The owner can also open staff invitations, audit history, consent-based revenue summaries, account settings and the existing sales panels.

The design uses the approved light AESD colours. It replaces the large management tiles and repeated status headings. A fixed mobile navigation bar opens Customers, Licenses, Approvals, History and Settings. Installation help is in Settings. Form drafts require a discard decision. Offline reads show their state and disable management writes. An uncertain write remains locked after refresh or reload. The application never repeats that write automatically. The owner checks the license and audit history before clearing the lock.

The registered owner can sign in with email or the existing registered phone number and password. Phone entry does not create an account or change its role. Customer phone login is not enabled by this change. Existing session revocation still applies. The server returns a device-bound flag; it does not return the license device hash.

The Server owner and customer packages remain separate. CARİ is unchanged. The owner module and style sheet are excluded from the customer APK. Native bridge bytes, package identities, signing identity and existing storage names are preserved. The current green Server application icon is retained.

## Validation

199 platform unit checks passed. Five root checks passed; three PostgreSQL integration checks were skipped because their integration runtime was not configured. Fifteen packaging checks passed. The browser checks use an isolated local server, sample accounts and Chromium. The new owner flow checks Turkish search, draft cancellation, payment confirmation, a real license extension, staff verification codes, consent filtering, offline writes, uncertain responses, session isolation and widths of 320, 390, 768 and 1366 pixels. Existing sales-panel, login, recovery and installation flows are also checked. In total, 83 distinct browser checks passed: 28 panel checks, 15 authentication checks, 12 sales regression checks, 15 PWA checks and 13 owner-console checks.

The browser tests do not establish physical Android operation, real email delivery or a new physical device installation. The phone tests use isolated registered accounts. A real owner's stored phone number is not changed by these tests.

## Publication and Android delivery

Web 1.5.8 is live at [AESD Server](https://aesd-server.onrender.com/aesd/). Render deploy dep-dba4a7u1egvs73db2qsg serves commit 2389647969e356d51d7b24f79b2bf00605091124. The production startup check passed. It verified loopback health and the hashes of app.js, config.json, owner-console.js and owner-console.css. An external production HTTP acceptance test was not run.

Both APKs were signed with the original certificate and delivered on 2026-10-18. Version 1.5.8, code 158 replaces 1.5.7, code 157. Source and live backend commit: 2389647969e356d51d7b24f79b2bf00605091124. The certificate SHA-256 is ccc5e236fd30d0a395d49121bf1129a905a0ccf9fc952242eb920c8a8e04e2d9. Signature schemes 1, 2 and 3, zip alignment, package identity, bundled source matching and retained native bytes passed. The owner bundle contains 33 public assets. The customer bundle contains 22. The customer bundle excludes owner management and staff entry files.

Each existing Drive file was updated in place. Its parent and permissions were preserved. Each downloaded APK matches the local signed APK by SHA-256. The downloads also passed the package, version, source asset, certificate and alignment checks. CARİ delivery is unchanged.

[Owner APK 1.5.8](https://drive.google.com/file/d/10sUlB9DaS2Bem1_kH9SHeyeAvyXRXJiW/view?usp=drivesdk). SHA-256: 67a4fb559421f9003a61c3bb05cb40b4a21fc385d36b6b7a02d277a96cd37cac.

[Customer APK 1.5.8](https://drive.google.com/file/d/1U_abIPFs79QfiarGxTf5fzbbndr10Yni/view?usp=drivesdk). SHA-256: c6ae22e47c8a9b78b24b70d409a1eeed9d951bfd2093174594c73bfc26ed12aa.

Physical Android installation, update and keyboard acceptance were not run. Install the owner update over the existing owner application. Do not uninstall the existing application to apply this update.

The technical instructions use short sentences and consistent terms based on ASD-STE100 principles. This document does not claim formal ASD-STE100 certification.
