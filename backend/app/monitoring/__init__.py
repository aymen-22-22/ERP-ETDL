"""Settings → Logs and the notifications bell.

`AppErrorLog` is written by the global exception handlers (no RLS — errors can
happen before tenant resolution; isolation is enforced in queries). `Notification`
is tenant-scoped RLS data carrying low-stock alerts generated from the current
`product_stock_snapshots`.
"""
