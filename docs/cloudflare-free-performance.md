# Cloudflare Free performance changes (2026-11-05)

Game detail pages retain on-demand ISR and complete server-rendered SEO content. No game detail pages are pre-rendered during build.

ROM loading in the player now retries the initial probe, truncated full responses, and small-file downloads up to twice. Transient HTTP statuses use backoff and Retry-After (requests requiring over 30 seconds of backoff are returned as errors without retrying early). Permanent HTTP errors stop immediately. Chunked downloads no longer split HTTP failures into many smaller requests, while incomplete byte ranges retain the existing split fallback and validation. Cancellation interrupts backoff.

These changes apply to player fetch-based downloads. The download page's native browser download remains managed by the browser. They cannot repair persistent origin blocks, missing objects, or Worker CPU termination.

Validation: npm run test:rom (15 tests), npm run test:static, ESLint for changed source and tests. Existing ROM proxy test mocks were updated to the current sb-games API. Full type checking currently fails on stale .next room route types and the unavailable @supabase/supabase-js dependency. No production deployment or before/after latency measurements have been performed.
