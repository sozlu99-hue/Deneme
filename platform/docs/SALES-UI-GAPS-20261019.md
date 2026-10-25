# AESD satış paneli — eksikler ve fazlalıklar

Date: 19 October 2026. ASD-STE100 short facts. No certification claim.

## Eksikler (before redesign)

1. **Install dock covered the checkout CTA (high).** The fixed “AESD · Web” bar sat on top of **Satışı Tamamla** on the sale screen.
2. **First viewport was a report, not a sale (high).** Three large ciro cards pushed search and products below the fold.
3. **Customer field always visible (medium).** Cari hesabı showed for cash and card, not only credit / split.
4. **Mobile basket fell under the catalog (medium).** No sticky checkout strip on narrow screens.
5. **Brand continuity weak after login (medium).** Auth had green atmosphere and monogram; sale was flat grey with no mark in the header.
6. **Hardcoded blue-grey leftovers in `styles.css` (medium).** Tabs, empty states and button hovers still used `#f7f8fb` / `#d4dbe6` instead of brand tokens.
7. **Empty catalog still showed “Tüm Ürünler” chip (low).**
8. **Business name repeated** in header and page heading (low).
9. **Almost no sale motion** (product press / basket line) (low).
10. **Settings felt like a second product (medium).** Same grey card stack as before login redesign; no shared brand field with sales.

## Fazlalıklar (before redesign)

1. Always-on install dock on the sale screen.
2. Oversized three-stat dashboard on every sale open.
3. Empty basket still showed Clear, full payment chrome and a long note with equal weight.
4. Dense card shadows on every product / basket / stat block.
5. Header chrome crowded: menu + brand + tabs + sync + owner badge.
6. Cari + vadeli fields when payment did not need them.

## Changes in this redesign

- Hide install dock while the user is inside the app (show only on auth).
- Compact one-row stats strip; catalog and search lead the sale viewport.
- Basket: disable checkout when empty; show cari only for credit/split; quiet clear action.
- Mobile: catalog first, full-width basket below (no overlay); sticky only on checkout CTA; stats stay 3 labelled cells.
- Brand soft field on sale shell; header monogram.
- Align leftover greys to `--brand` / `--soft` / `--line`.
- Light press motion on products and basket lines (respects reduced motion).
- Settings shell: same green canvas, quieter rows, brand hover (no duplicate heading / business name noise beyond header).
- Empty catalog: hide category chips until products exist.

## Kept

- Turkish copy, Market/Restoran/Kafe sale flow, camera search, split payment rules, stock note meaning.
- Owner console path for OWNER settings (unchanged entry).
