# Compact stock and customer collections — 19 October 2026

The user approved the compact list and 8 px stock card corners.
Keep the approved green brand, stock units and dough-only sale deduction.
Stock entry, exit, waste, product editing, deletion and purchase links remain available.
Wait for the shared-state acknowledgement before closing an editor.
Keep the editor open when a write fails.

Customer account cards keep collection actions visible on narrow screens.
The customer detail has a direct `Tahsilat al` action.
Enter the amount and payment method. Review the remaining balance before saving.
Reject amounts above the current balance. Do not silently reduce the entered amount.
Read balances from current customer state after each change.

A cash collection creates one customer transaction and one linked entry in an open register.
A card collection changes the customer ledger without adding cash.
The server checks the method, cash reference, customer, amount and open register.
Keep historical transactions without a payment-method field compatible.
Do not rewrite old balances, users or receipt history.

New readable screen components replace only the stock and customer account components in the existing private template.
The original state names, authentication bridge and server-controlled OWNER access remain in place.
The unified APK still fetches the private template after OWNER authentication.

Web and unified Android source: 1.6.4/code 164.
Verify the live deployment, original signature and Drive readback separately.
No physical Android, iPhone or real payment acceptance is implied.
Use short technical sentences based on ASD-STE100 principles. Do not claim formal certification.
