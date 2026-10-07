# Tape

Private Instagram content platform for the three Tradr accounts (@tradr__app EN, @tradr.social ES, @tradrsocial IT).
One user, one email. Every post is a carousel published to all three accounts, each ending with that language's Tradr slide.

## Stack

- **Next.js 16** (App Router) on **Vercel** (Hobby). `src/proxy.ts` blocks everything without a valid session.
- **Upstash Redis** (Vercel Marketplace) for all data. Documents are JSON in hashes, every write is a compare-and-set in Lua
  (`src/lib/server/store.ts`), and two sorted sets (`due`, `inflight`) drive the scheduler.
- **Vercel Blob** (public store) for images. Meta must be able to fetch slide URLs at publish time.
- **Scheduler**: `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`, called every minute by cron-job.org and
  daily by Vercel Cron (`vercel.json`) as a backstop. It publishes due posts, recovers interrupted attempts, refreshes numbers,
  snapshots followers and writes a nightly JSON backup to Blob.
- **Meta**: Instagram API with Facebook Login, Graph API v26.0 (`src/lib/server/meta/`). Page tokens don't expire.

## Environment

| Variable | What |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (set by the integration) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (set by the store) |
| `TAPE_SECRET` | Signs sessions and encrypts Meta tokens. Changing it signs everyone out and requires reconnecting Meta. |
| `ALLOWED_EMAIL` | The only email that can sign in |
| `CRON_SECRET` | Bearer secret for `/api/cron/tick` |
| `META_APP_ID`, `META_APP_SECRET` | Meta app (Settings → Basic) |
| `META_LOGIN_CONFIG_ID` | Optional. Facebook Login for Business configuration id; otherwise scopes are requested directly |
| `APP_URL` | Optional. Public origin for OAuth redirects if it differs from the request origin |

Local: `vercel env pull .env.local && npm run dev`. Note that development uses the same database as production.

## Scripts

```sh
npx tsx --env-file=.env.local --conditions=react-server scripts/set-password.ts '<new password>'
npx tsx --env-file=.env.local --conditions=react-server scripts/import-posts.ts "<folder>"
```
