# AESD UI design gaps — 19 October 2026

ASD-STE100: short facts. No certification claim.

## Gaps found (before redesign)

1. **Brand mismatch (critical).** PWA and icons use Server green `#00843D`. The UI used red (`#ed3038` / `#c8243c`) as the primary action color. The first viewport did not read as AESD after removing chrome.
2. **No monogram on login.** Login showed only typed “AESD”. The approved green mark (`icon-512.png`) was unused on the auth screen.
3. **Flat grey auth canvas.** Login used a plain `#f6f7fa` field and a generic white card. No brand atmosphere.
4. **Install bar on top.** `#web-install-tools` sat above the login brand and split the first composition.
5. **System font stack.** `system-ui` / Segoe gave a default SaaS look. No product typeface.
6. **Token conflict.** `styles.css`, `appearance.css`, and `owner-console.css` used different reds and greens. Primary buttons forced `#c8243c!important`.
7. **Weak contrast.** Contact text `#768296` on `#f6f7fa` and muted greys were below solid AA for small text. Ciro strong used light red on pink (~3.8:1).
8. **Sector row cramped on 390px.** Three equal columns squeezed Market / Restoran / Kafe.
9. **Almost no motion.** Only a 0.12s button transition and a sync pulse. No auth or toast entrance.
10. **theme-color mismatch.** HTML meta used `#f6f7fa`; manifest used `#00843D`.
11. **Card fatigue.** Login, stats, basket, and settings all used the same bordered card language by default.
12. **Dark mode leaks.** Many hardcoded whites in `styles.css` were only partially overridden.

## What this redesign keeps

- Turkish copy and auth / sale / settings flow.
- Server monogram file and package `com.oses.pos`.
- Touch targets ≥ 44px.
- Red reserved for danger / errors, not for brand actions.

## What this redesign changes

- Brand green as primary action and brand mark color.
- Login hero with monogram, green field atmosphere, bottom install dock.
- Shared CSS tokens (`--brand`, `--danger`, stronger muted).
- Manrope typeface for UI text.
- Light motion on auth and toast (respects `prefers-reduced-motion`).
