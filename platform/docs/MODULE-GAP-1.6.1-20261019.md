# AESD 1.6.1 — Module gap review (ASD-STE100)

Date: 19 October 2026. Writing follows ASD-STE100: short sentences, one action per step, no certification claim, no claim of fault-free software.

This review checks the six modules in [UNIFIED-1.6.0](UNIFIED-1.6.0-20261018.md). It separates (A) code that this release fixes, (B) work that waits for a provider or a physical device.

## Module matrix

| Module | Internal status | Fixed in 1.6.1 | Still open (user or device) |
|---|---|---|---|
| 1. Account and access | Complete for in-app flows | Google fetch timeout 12 s; recovery start does not reveal account existence; recovery start rate limit; login lock by account and IP; private panel error text sanitised; SMS fetch timeout | SMS needs Twilio credentials. Device approval is not MFA. |
| 2. Sales and cash | Complete for recorded sales | None required in code | Card capture, ÖKC fiscal receipt and e-invoice need a chosen provider and a real adapter. |
| 3. Floor and orders | Complete for local tables and QR | None required in code | External order platforms need a chosen provider. Split or merge after kitchen send stays limited by design. |
| 4. Stock and supply | Complete for in-app stock | None required in code | Scale, camera and printer need physical acceptance. |
| 5. Receivables and finance | Complete for ledger records | None required in code | Bank API sync is not in scope. Reports use entered records only. |
| 6. Appearance and distribution | Web install incomplete on live 1.6.0 | 192 and maskable icons; manifests; shell worker cache; packaging of icons in the unified APK source set; version 1.6.1 / 161 | Live deploy after merge. Signed Drive APK update needs the original keystore in the build environment. Physical Android and iPhone acceptance not run. |

## Fixes delivered in source 1.6.1

1. Serve `icon-192.png` and `icon-maskable-512.png` with both web manifests.
2. Set manifesto media type to `application/manifest+json`.
3. Cache the three icons in the shell worker.
4. Stop Google recovery from revealing whether an e-mail has an account.
5. Limit Google recovery starts per client address.
6. Stop Google and Twilio HTTP calls after 12 seconds.
7. Lock login after repeated failures for one account or one address.
8. Hide unknown private-panel errors from the client.
9. Raise the package version to 1.6.1, code 161.

## Limits that stay open

1. Select ÖKC, e-invoice and order-platform vendors.
2. Connect real adapters and test accounts for those vendors.
3. Mount the original signing files and rebuild the signed APK.
4. Update the existing Drive APK file in place and compare SHA-256 after download.
5. Run physical Android update and iPhone install checks.

Do not treat this document as proof of a signed APK upload or a physical device test.

## Links

- Web: https://aesd-server.onrender.com/aesd/
- Current Drive APK (1.6.0 until a signed 1.6.1 upload): https://drive.google.com/file/d/10sUlB9DaS2Bem1_kH9SHeyeAvyXRXJiW/view
