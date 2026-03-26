# trace_itself

`trace_itself` is a private, self-hosted execution dashboard for long-horizon learning and project management. It stays intentionally narrow, but it now supports multiple private user accounts with isolated data.

## MVP scope

- Multi-user account login with per-user private data
- Admin-managed user accounts and password resets
- Temporary account lockout after repeated failed login attempts
- Projects, milestones, tasks, and daily logs
- Dashboard for active work, today tasks, overdue tasks, upcoming milestones, recent logs, and lightweight progress visuals
- FastAPI backend with PostgreSQL
- React frontend served behind Nginx
- Docker Compose deployment with localhost-only exposure by default

## Architecture

- Frontend: React + Vite + React Router
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL 16
- Auth: username/password login with hashed passwords, signed session cookies, and temporary lockouts
- Deployment: Docker Compose
- Remote access: keep services local to the host and expose the frontend through a private network tool such as Tailscale

Why this shape:

- React + Vite keeps the frontend small and easy to ship because the MVP does not need SSR.
- FastAPI + SQLAlchemy gives us typed APIs and a clean data layer without extra framework weight.
- Postgres stays on the internal Docker network and is never published.
- The frontend and backend bind to `127.0.0.1` on the host so the default posture is private-first.

## Repo layout

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── docs/
│   └── deployment.md
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── .env.example
├── docker-compose.yml
└── README.md
```

## Quick start

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set at least:

   - `POSTGRES_PASSWORD`
   - `SECRET_KEY`
   - `INITIAL_ADMIN_USERNAME`
   - `INITIAL_ADMIN_PASSWORD`

3. Start the stack:

   ```bash
   docker compose up --build -d
   ```

4. Open the app locally:

   - Frontend: `http://127.0.0.1:3000`
   - Backend API: `http://127.0.0.1:8000`

5. Sign in with:

   - username from `INITIAL_ADMIN_USERNAME`
   - password from `INITIAL_ADMIN_PASSWORD`

6. If you need more accounts, sign in as the admin user and open the `Users` page.

The backend auto-creates the MVP tables on startup and bootstraps the initial admin account if no users exist yet.

## Local development

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --reload
```

Use `docker compose up -d db` if you want Postgres running in Docker while developing locally.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8000` by default.

## Deployment

Use the guide in [docs/deployment.md](/home/jnln3799/every_on_git_ubuntu/trace_itself/docs/deployment.md) for the lab-server setup and private remote access flow.

## Suggested next steps after MVP

1. Add Alembic migrations before the schema starts changing often.
2. Add tags or focus areas across tasks and daily logs.
3. Add project health metrics such as open-task count and milestone completion trends.
4. Add backups and restore scripts for the Postgres volume.
5. Add email-based password recovery or MFA if the app ever moves beyond a small trusted environment.
