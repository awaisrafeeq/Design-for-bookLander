# BookLender API

This is the first backend milestone: FastAPI, PostgreSQL, Redis, SQLAlchemy/Alembic, Celery, first-admin bootstrap, database-backed HTTP-only sessions, persistent Brand/Spend/Team settings, source preferences, audit logs, and a manual Ideas/Board/Review workflow. AI generation and live publishing are deliberately not simulated; those actions report that the provider integration is not ready until the real adapters are wired. No provider keys or account credentials belong in source control.

## Cloud environment

Development and deployment use Hostinger cloud services; do not start this Compose stack on the workstation. `compose.yaml` defines the VPS services. The manual [Hostinger deployment workflow](../.github/workflows/deploy-hostinger.yml) copies source without environment files, then builds and starts the containers on the VPS.

Configure a protected GitHub `production` environment with these secrets: `HOSTINGER_HOST`, `HOSTINGER_USER`, `HOSTINGER_SSH_PRIVATE_KEY`, and `HOSTINGER_KNOWN_HOSTS`. On Hostinger, install Docker Compose and `rsync`, create `/opt/booklender`, then create `/opt/booklender/backend/.env` from `backend/.env.example`. The app connects to the existing Hostinger PostgreSQL service over its private Docker network `postgresql-oao5_default`; set `DATABASE_URL` with that service's username, password, and database name, using host `postgresql-oao5-postgresql-1` and port `5432`. URL-encode reserved characters in the database password. For temporary IP-only smoke testing, use `APP_ENV=staging`, `BOOKLENDER_CADDY_ADDRESS=http://<VPS-IP>`, `COOKIE_SECURE=false`, and `ALLOWED_ORIGINS=["http://<VPS-IP>"]`; allow inbound TCP 80. This is unencrypted HTTP: use dummy test data only and do not use real account credentials or private content. Once a domain is available, point its DNS A record at the VPS, allow inbound TCP 80/443, set `APP_ENV=production`, `BOOKLENDER_CADDY_ADDRESS=<domain>` (no scheme, so Caddy enables HTTPS), `COOKIE_SECURE=true`, and `ALLOWED_ORIGINS` to the HTTPS origin, then redeploy. The workflow only runs when manually dispatched, so an ordinary push does not deploy unfinished work.

The first administrator and baseline settings have already been bootstrapped in the current database. A newly provisioned Hostinger database is a separate, empty database: after the first cloud deploy, set a unique `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in the private Hostinger environment file, then run this one-time command **on Hostinger**: `cd /opt/booklender && docker compose --env-file backend/.env -f backend/compose.yaml --profile setup run --rm bootstrap`. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the private file immediately after it succeeds. The bootstrap command refuses to run if any user already exists. Keep bootstrap secrets out of the API, worker, and scheduler environments.

The API health endpoints are `/health/live` and `/health/ready`; API docs are at `/docs` outside production. Production database, Redis, signing/session, provider, and SSH credentials must be configured as deployment secrets, never committed to Git.

## Current API

- `POST /api/v1/auth/login` accepts `{ "email": "…", "password": "…" }`, sets a random HTTP-only session cookie, and returns the user plus a CSRF token.
- Login attempts are rate-limited per client IP in Redis; production requests use the client address forwarded by Caddy through the Next.js BFF.
- `POST /api/v1/auth/activate-invitation` accepts an expiring, one-time invitation token and a new password. Admins create and copy activation links in Team; email delivery is not configured yet.
- `GET /api/v1/auth/me` returns the signed-in user's public profile.
- `POST /api/v1/auth/profile` updates the signed-in user's display name.
- `POST /api/v1/auth/password` changes the password, closes other sessions and rotates the current session.
- `POST /api/v1/auth/logout` requires the `X-CSRF-Token` header and revokes the session.
- `GET /api/v1/studio/posts` reads the persistent workflow posts; the matching `POST` endpoint accepts explicit workflow commands and enforces role/module checks.
- Manual workflow: add an idea, pick it, enter a human-written caption in the Board drawer, send it to Review, and approve it as an assigned approver. Approval places the exact content version on Schedule; it does not publish it.
- Post edits create a new version and clear any prior approval. A stale editor receives a conflict response instead of overwriting the newer revision.
- AI generation and revisions return a clear “not connected” response for now. No fake AI result or spend entry is created.
- All account passwords are Argon2-hashed. Only a SHA-256 hash of the random session token is stored in PostgreSQL.

The API is a foundation, not yet a production release. Email delivery, finer page/action permission policies, outbox-backed jobs, automated backups/restore, provider integrations, complete page data, and operational monitoring remain subsequent milestones. Keep the VPS workflow manual and deploy to a staging hostname until these controls are complete.
