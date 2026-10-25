# Module fixes 1.6.3 — 19 October 2026

## Account access
Password changes now increase the legacy session version. They also expire unused reset codes and remove platform sessions in the same transaction.
Existing users, roles and credentials remain in the same database.

## Register history
Reject changes to closed register sessions. Reject deletion and reopening.
Keep opening data when an open register closes. Permit the existing register rollover.
A delayed offline sale can retain its original closed register and warning.

## Provider receipts
Keep the first final provider result. Ignore a late uncertain result.
Return a conflict for a different final result. Keep the stored provider reference.

## Verification
The local Node run passed 226 checks. Four test files could not load the missing QR dependency.
The new regression cases cover password sessions, reset codes, register history and concurrent provider responses.
Use the current GitHub checks for full Linux and PostgreSQL results.
Desktop and isolated tests do not prove physical Android or provider acceptance.

Source version: 1.6.3/163. Build and Drive verification remain separate delivery steps.
Use short technical sentences based on ASD-STE100 principles. This is not a formal compliance claim.
