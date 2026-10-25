# POS Android 1.5.7 delivery

Version code: 157. Owner package: com.oses.pos. Customer package: com.aesd.pos.

Both APK bundles include the audited Server Web 1.5.7 assets. These contain customer refund controls, amount and backup validation, error notice styles and visible-viewport dialog handling. The owner bundle also contains the staff manifest required by the staff entry page. The customer bundle excludes staff entry and private owner assets. Native bridge bytes, security settings, local storage names and the original signing identity must stay unchanged.

Both original-key signed APKs were delivered on 2026-10-17. They replace 1.5.6, code 156, in the existing Drive files. The user supplied the original keystore and its password file. Both certificates match SHA-256 ccc5e236fd30d0a395d49121bf1129a905a0ccf9fc952242eb920c8a8e04e2d9. Signature schemes 1, 2 and 3, zip alignment, source asset matching and retained native bytes passed. Each Drive download has the same SHA-256 as its signed local APK. File IDs, parent folders and permissions were preserved. The owner filename now shows 1.5.7.

APK source commit: 780df7cb34d6a0f5107957a3b53428644a05e60d. Live backend commit: 48304455a9d28e1c1abc4915e8c6a843ea87401e. A fresh Render live deploy check and source hash comparison confirmed that the bundled sources match the deployed platform code. External production HTTP and physical Android acceptance were not run in this release.

Owner APK SHA-256: 31c6c25a369b87204ae76d8d94913e2b7317e894e378f6bf2ddd62c2bfbef9ad.

Customer APK SHA-256: a664134bcf5cff43ca1a3501e7652834d97e054d39726f32df48a37dc8de94c0.

[Download owner APK](https://drive.google.com/file/d/10sUlB9DaS2Bem1_kH9SHeyeAvyXRXJiW/view?usp=drivesdk).

[Download customer APK](https://drive.google.com/file/d/1U_abIPFs79QfiarGxTf5fzbbndr10Yni/view?usp=drivesdk).

The user authorized APK updates and Drive uploads after each project update without another approval request. Keep the existing owner and customer Drive IDs and sharing state. Increase version codes, verify source assets and original signatures, then download the Drive files and compare SHA-256. Desktop and packaging checks do not establish a physical Android installation, keyboard, camera or session-persistence test.

Checks passed: 15 packaging tests and source dependency checks for both audiences. The owner bundle contains 31 files. The customer bundle contains 22 files. Both bundles keep the lease public key. Build verification also checked the actual signed files. No private signing material is in either APK or the Git repository.
