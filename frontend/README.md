# trace_itself frontend

This is the React + Vite client for the trace_itself MVP.

It now supports username/password sign-in, an admin-only Users page, and lightweight progress visuals on the dashboard and project detail views.

## Development

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:8000` by default. You can override that target with `VITE_BACKEND_URL`.

## Production

The included `Dockerfile` builds the app and serves it through Nginx. The Nginx config proxies `/api` to the backend service at `backend:8000`.

## Notes

The app assumes cookie-based auth and a same-origin `/api` prefix so it can sit behind a private reverse proxy or VPN-style deployment.
