# propia-admin

Internal ops dashboard for Propia — the broker network at a glance: who's signed
up, what states they cover, their phone, inventory count, and (soon) storage
used. Lives at `admin.propia.dev`.

Stack: Next.js 16 · React 19 · Tailwind v4 · TypeScript (App Router) — mirrors
`propia-web`. Reads Supabase server-side with the **service role key**, so the
key never reaches the browser and no RLS gymnastics are needed.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

### Environment (`.env.local`, and the same in Vercel)

| var | what |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | a dedicated `sb_secret_…` key (server-only, **secret**, bypasses RLS) |
| `ADMIN_PASSWORD` | the shared password you type to log in |
| `SESSION_SECRET` | long random string to sign the cookie (`openssl rand -hex 32`) |

## Access

Single shared password (you + Pablo). The login form sets an httpOnly,
HMAC-signed session cookie; `middleware.ts` gates every route except `/login`.
To graduate to real per-admin accounts later, swap the check in
`app/api/login/route.ts` + `middleware.ts` for Supabase auth scoped to admin
user ids — the data layer (`lib/`) doesn't change.

## Deploy (AWS Lambda + CloudFront)

```bash
./deploy-admin.sh
```

Builds, ships the zip to Lambda `propia-admin` (us-east-1), invalidates
CloudFront `E2C70OEAOEPF0Y` and then checks that
`https://admin.propia.dev/api/version` reports the commit it just built.
**The last line must say `✓ LIVE`.** Anything else means production did NOT
change — the script aborts on a dirty tree, a checkout behind `origin/main`,
a missing `aws` CLI, a failed build, or a Lambda/CloudFront step that didn't
land. AWS creds come from `~/Developer/.env.work`; the runtime env
(Supabase, passwords, session secret) lives on the Lambda itself.

Check what is live any time:

```bash
curl -s https://admin.propia.dev/api/version   # {"commit":"29c2c83","builtAt":"…"}
git rev-parse --short HEAD                      # should match
```

The «Técnico ▾» menu in the panel shows the same build stamp.

## TODO

- **MB used** — photos live in Cloudflare R2 (`<uid>/` prefix), not Postgres, so
  storage isn't a DB column. Wire it by either summing the R2 prefix in a server
  route or recording byte size at upload. Column is stubbed as `—` for now.
- Client-side search / sort on the table.
- Per-broker drill-down (their listings, requerimientos).
