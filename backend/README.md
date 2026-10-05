# BookLender API and cloud deployment

FastAPI + PostgreSQL + Redis/Celery serve the Next.js Studio. Development containers are not started on the workstation. The existing Hostinger PostgreSQL container remains the application database over `postgresql-oao5_default`.

## Current implemented pages

| Page | Backend functionality |
| --- | --- |
| Ideas | Manual team topics, OpenRouter suggestions with source evidence and normalized-title deduplication, pick/skip/new angle. External feeds are deferred. |
| Board | Versioned draft editor, AI captions/scripts/briefs, persistent uploads, Predis images/carousels, Creatify avatar videos, asynchronous job reconciliation. |
| Review / Brand | Saved policy version and automatic prohibited-phrase/availability checks. Tone, evidence and political context still require human review. Approval applies to the exact content revision and platforms. |
| Schedule | Eastern week/month calendar, held slots before approval, FB/IG account selection, future scheduling, cancellation/rescheduling, per-platform provider status and published links. No immediate publication command. |
| Team | Admin-controlled module and action permissions, client users, expiring one-time invitations, optional SMTP delivery with manual link fallback. |
| Logs | Audit actors, persisted background jobs, provider IDs, attempts, retry times/history, causes/fixes and recorded provider usage/credits. |
| Spend | OpenRouter USD usage when returned by the provider. Media credits are shown in Logs when returned. Daily cap enforcement is deferred pending client confirmation. |

Results analytics, external discovery feeds, catalogue availability, ads/inbox and production backup/monitoring automation remain separate work. Provider adapters are implemented; account API entitlement and live output must be verified after server credentials are supplied.

## Domain

App: **https://booklender.tech**. DNS `A` record `@` points to `2.25.242.183`. Caddy obtains/renews HTTPS and redirects HTTP. Allow TCP 80 and 443 on the VPS.

Keep these values in `/opt/booklender/backend/.env`:

```dotenv
APP_ENV=production
BOOKLENDER_CADDY_ADDRESS=booklender.tech
PUBLIC_APP_URL=https://booklender.tech
COOKIE_SECURE=true
ALLOWED_ORIGINS=["https://booklender.tech"]
BOOKLENDER_TIMEZONE=America/New_York
```

Preserve the existing `DATABASE_URL`. It uses container host `postgresql-oao5-postgresql-1`, private port `5432`, and URL-encoded credentials. Do not replace it with the public port or create a second database.

## Integration credentials

Edit the private server file; do not commit or send keys in chat.

| Capability | Environment fields |
| --- | --- |
| Text and ideas | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (explicit supported model ID) |
| Publishing | `ZERNIO_API_KEY`; optional `ZERNIO_PROFILE_ID` to limit account discovery |
| Image/carousel | `PREDIS_API_KEY`, `PREDIS_BRAND_ID` |
| Directed video | `CREATIFY_API_ID`, `CREATIFY_API_KEY`, `CREATIFY_TTS_ACCENT` (choose an accent ID from `GET /api/voices/`; no avatar ID required) |
| Provider media download | `MEDIA_SIGNING_KEY` (generate once using `openssl rand -hex 32`) |
| Invite emails | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURITY` (`ssl` or `starttls`) |
| Zernio callbacks | `ZERNIO_WEBHOOK_SECRET` matching the webhook configured in Zernio |

A domain purchase does not create an email mailbox. Create a sender such as `noreply@booklender.tech` through the available email service, then use that mailbox's supplied SMTP configuration. Without it, Team provides manual activation links.

After configuration and deployment:

1. Open Schedule as Super admin → **Sync accounts** → explicitly choose the FB and IG accounts. Test accounts are not automatically selected for BookLender.
2. Configure Zernio's webhook URL as `https://booklender.tech/api/v1/webhooks/zernio`, subscribe to the relevant post lifecycle events and use its signing secret in the server environment. Polling also reconciles post status.
3. Use Team's **Resend invite** for pending client users. No default passwords are assigned. BookLender admin is Super admin; Krishna is the initial approver with Content/Campaigns titles; Ronnie has no action rights until Super admin grants them. Existing account passwords are preserved.
4. Add a manual topic → suggest ideas → pick one → write/generate/upload → review → approve → choose a future schedule. Choosing a slot before approval holds it locally.

Paid jobs run only after a deliberate command by an authorized user. An ambiguous provider timeout is shown for manual inspection before retrying. Zernio create requests use stable idempotency keys, and stale approvals cannot be sent. Zernio's immediate retry endpoint is deliberately not used: scheduling retries require a future time.

## Deploy

GitHub `production` environment secrets: `HOSTINGER_HOST`, `HOSTINGER_USER`, `HOSTINGER_SSH_PRIVATE_KEY`, `HOSTINGER_KNOWN_HOSTS`. Push reviewed code, then manually run **Actions → Deploy BookLender to Hostinger → Run workflow**. The workflow preserves the server `.env`, builds on Hostinger and runs Alembic migration `0006_integrations` plus idempotent client-user provisioning. An ordinary push does not deploy.

On the VPS, after changing environment values:

```sh
cd /opt/booklender
docker compose --parallel 1 --env-file backend/.env -f backend/compose.yaml up --build -d --remove-orphans
docker compose --env-file backend/.env -f backend/compose.yaml up -d --no-deps --force-recreate proxy
```

Media is stored in the persistent `backend_media_data` volume shared by API and worker. Back up this volume with PostgreSQL before deploying further schema changes; deleting it breaks existing post attachments. Signing links are temporary, private previews require login, and no provider key is passed to Next.js.

The API process provides `/health/live` and `/health/ready`; public routing exposes only Next.js plus signed media and the verified webhook. Provider failure details are sanitized. The first-admin bootstrap is for an empty database only and must not be repeated on the current installation.
