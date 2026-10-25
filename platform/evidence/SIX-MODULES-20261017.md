# Server audit corrections

Use short technical sentences based on ASD-STE100 principles.
This document does not claim formal compliance.

1. Identity: Reject old sessions and old OAuth states. Bind one device atomically.
2. Finance: Add a bounded customer refund. Retain private history. Check balance deltas.
3. Storage: Use one process connection with a 5-second busy timeout and WAL.

A legacy request has a 30-second response limit. After a timeout or disconnect,
stop new platform writes until restart. Reject late SQL writes from that request.
Keep failed-login counters and audit records durable.

The snapshot service requires one process and one Render instance.
Do not enable multiple writers or autoscaling with the snapshot backend.
Keep snapshot compare-and-swap checks. A conflict must reject the stale writer.
Use shared row storage before scaling this backend.

Configuration uses the network first. An offline fallback lasts at most 24 hours,
matching the maximum owner offline permit. A new shell release uses a new cache.
Never cache account APIs, authenticated responses or private financial records.

Before its first lease, a trial is ready to start but is not authorized.
The first lease starts the existing trial once. Reinstallation does not reset it.

Publish these source corrections as Server Web 1.5.7 and backend 1.0.4.
Keep the delivered Android package unchanged. Verify the live commit separately.
