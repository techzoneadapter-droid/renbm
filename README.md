# RENBM Control

Node.js 20+ / Vercel-compatible internal web tool for BM inventory and controlled mutation job orchestration.

## Safety model
`META_MUTATIONS_ENABLED=false` is the default. The server-only adapter intentionally returns `needs_verification` until an official Meta API endpoint and required permissions are verified for the connected app. There is no browser automation, session-cookie scraping, private endpoint, CAPTCHA bypass, proxy/token rotation, or quota-evasion fallback. Never put Meta credentials in client code or this repository.

## Setup
1. Use Node.js 20+ and install dependencies with `npm install`.
2. Create a Supabase project and apply `supabase/migrations/001_bm_automation.sql`.
3. Copy `.env.example` to local environment configuration and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_API_KEY`, and comma-separated `STAFF_ALLOWED_BM_IDS` server-side only.
4. Keep `META_MUTATIONS_ENABLED=false` unless official provider write capabilities have been independently verified and implemented in `api/_metaMutations.js`.
5. Start through Vercel-compatible local tooling using `npm run dev`. Worker execution is separate: `npm run worker` performs one reconciliation/work pass.

## Modules
- `api/_auth.js`: staff/admin RBAC and BM scope boundary.
- `api/_db.js`: Supabase persistence + secret-filtered audit helper.
- `api/_metaMutations.js`: server-only fail-closed provider capability adapter.
- `api/bm-jobs.js`: quantity/rate enqueue and pause/resume/cancel state transitions.
- `api/admin-invitations.js`: email-only admin invitation queue; URLs are rejected.
- `api/partner-shares.js`: ownership-aware explicit/random selection, deterministic preview hash and confirm.
- `worker/bm-job-worker.js`: safe rate cap, transient-only retry/backoff and reconciliation flags.
- `api/inventory.js`: safe inventory/status read model.
- `public/`: minimal admin UI.

## Data model
Migration creates `bm_inventory`, `ad_account_inventory`, `bm_batch_jobs`, `bm_batch_items`, `admin_invitations`, `partner_share_jobs`, `partner_share_items`, and `audit_events`. Provider-derived BM health/verification fields are distinct from internal BM0/BM3/BM5/BM10, region/IP metadata and limit metadata. Job tables use idempotency keys, state/error metadata, provider references and reconciliation flags.

## Provider capability states
Current mutation capabilities are `needs_verification`. This is deliberate: internal workflows can be reviewed without pretending a Meta write succeeded. A future provider implementation must use only documented official Meta APIs and verified permissions.

## Authentication
Mutation APIs require `x-staff-key`, `x-staff-role`, and resource scope. This minimal boundary is intended for internal deployment and should be replaced/integrated with production identity before public exposure.
