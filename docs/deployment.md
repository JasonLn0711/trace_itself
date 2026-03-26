# Deploying trace_itself On A Lab Server

This guide assumes you want a private-first deployment on a lab machine that you can reach remotely without broadly exposing the app to the public internet.

## Deployment model

- `db` stays on the internal Docker network only.
- `backend` binds to `127.0.0.1:8000` on the host.
- `frontend` binds to `127.0.0.1:3000` on the host.
- Remote access is provided through Tailscale Serve so the app stays private to your tailnet.

## Prerequisites

- Docker Engine with the Compose plugin installed on the lab machine
- Tailscale installed on the lab machine
- A tailnet with HTTPS enabled

## Recommended environment settings

Start from:

```bash
cp .env.example .env
```

Then change these values:

- `POSTGRES_PASSWORD` to a strong database password
- `SECRET_KEY` to a long random secret
- `INITIAL_ADMIN_USERNAME` to the first admin login name
- `INITIAL_ADMIN_PASSWORD` to the first admin password
- `AUTH_MAX_FAILED_ATTEMPTS` if you want a different lockout threshold
- `AUTH_LOCKOUT_MINUTES` if you want a different lockout duration

Use these security settings:

- For local-only testing on the lab machine: `SESSION_COOKIE_SECURE=false`
- For real remote access over Tailscale HTTPS: `SESSION_COOKIE_SECURE=true`

After first login, use the `Users` page to create more accounts, reset passwords, or unlock accounts that hit the failed-login threshold.

## Start the app

```bash
docker compose up --build -d
docker compose ps
```

Local checks on the server:

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:3000/
```

## Private remote access with Tailscale Serve

1. Install and authenticate Tailscale on the lab machine.
2. Bring the app up with Docker Compose.
3. Keep the app bound to localhost as configured in `docker-compose.yml`.
4. Publish the frontend privately to your tailnet:

   ```bash
   sudo tailscale serve --bg 3000
   ```

5. Confirm the published URL:

   ```bash
   tailscale serve status
   ```

6. Open the HTTPS URL shown by Tailscale from another device on your tailnet.

This gives you a private HTTPS entrypoint for the dashboard while keeping the underlying containers off the public internet.

## Day-2 operations

View logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

Restart the stack:

```bash
docker compose restart
```

Update after pulling repo changes:

```bash
git pull
docker compose up --build -d
```

Stop the stack:

```bash
docker compose down
```

Stop Tailscale Serve:

```bash
sudo tailscale serve reset
```

## Backup note

The Postgres data lives in the Docker volume `trace_itself_postgres_data`. For a basic logical backup:

```bash
docker compose exec db sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > trace_itself_backup.sql
```

## Operational assumptions

- This MVP supports multiple users, but each user's data is private to their own account.
- User management is admin-led through the app.
- The app expects a trusted private network entrypoint rather than a public open-internet deployment.
