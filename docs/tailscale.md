# Tailscale Setup For trace_itself

This guide shows how to make `trace_itself` reachable from anywhere without exposing the app's ports directly to the public internet.

It matches this repo's deployment model:

- `db` is only on Docker's internal network
- `backend` listens on `127.0.0.1:8000`
- `frontend` listens on `127.0.0.1:3000`
- Tailscale Serve publishes the frontend privately to your tailnet

This is the recommended production path for a personal or small trusted deployment.

## Why Tailscale here

`trace_itself` is meant to be a private execution dashboard, not a public SaaS app.

Using Tailscale gives you:

- private network access without exposing `3000` or `8000` publicly
- encrypted access between your devices
- a stable `https://...ts.net` URL when Serve is enabled
- optional device approval and access-control policies for tighter control

## Before you start

You need:

- Docker Engine and Docker Compose on the Ubuntu lab server
- a Tailscale account and tailnet
- Tailscale installed on the server and on the devices that should reach the app

Set your app secrets first:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`
- `SESSION_COOKIE_SECURE=true` for remote HTTPS use over Tailscale Serve

Then start the app:

```bash
docker compose up --build -d
docker compose ps
```

Basic local checks on the server:

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:3000/
```

## Step 1: Install Tailscale on the Ubuntu server

On the lab server:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Useful checks:

```bash
tailscale status
tailscale ip -4
```

If you will lock SSH down to Tailscale later, test a Tailscale-based SSH path before removing any public SSH rule.

## Step 2: Prepare your tailnet settings

In the Tailscale admin console, review these settings:

1. Enable `MagicDNS` if it is not already enabled.
2. Enable `HTTPS` so `ts.net` HTTPS URLs can be issued.
3. Consider switching to a randomized tailnet DNS name if you do not want your personal email domain reflected in the tailnet name.
4. Enable `Device approval` if you want new devices to require approval before they can connect.
5. Enable MFA on your identity provider or Tailscale account.

Important HTTPS note:

- Tailscale documents that enabling HTTPS and issuing certificates can publish the machine name and tailnet name in public certificate-transparency logs.
- Before relying on the `https://...ts.net` URL, rename the server to something non-sensitive if needed.

## Step 3: Keep the app private on the server

Do not open these app ports publicly:

- `3000/tcp`
- `8000/tcp`

Do not create router/NAT port-forwarding for this app.

`docker-compose.yml` already binds the frontend and backend only to `127.0.0.1`, which is the right private-first posture.

## Step 4: Publish the frontend privately with Tailscale Serve

From the Ubuntu server:

```bash
sudo tailscale serve --bg 3000
tailscale serve status
tailscale funnel status
```

What you want to see:

- `tailscale serve status` shows a `https://...ts.net` URL proxying to `http://127.0.0.1:3000`
- `tailscale funnel status` shows no active Funnel config

If you accidentally enabled Funnel in the past, turn it off:

```bash
sudo tailscale funnel reset
sudo tailscale serve --bg 3000
```

Why this matters:

- `tailscale serve` keeps the site private to devices in your tailnet
- `tailscale funnel` exposes the site to the public internet

## Step 5: Open the app from another device

On the laptop, phone, or tablet you want to use:

1. Install Tailscale.
2. Sign into the same tailnet.
3. Open the `https://...ts.net` URL shown by `tailscale serve status`.
4. Sign in to `trace_itself` using your app account username and password.

To verify connectivity from another Tailscale device:

```bash
tailscale ping <server-name>
```

You can also connect using the Tailscale IP or MagicDNS hostname for server operations.

## Step 6: Lock down Ubuntu firewall rules

If you use `ufw`, the safe default is:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0
sudo ufw reload
sudo ufw status verbose
```

This keeps the server reachable from Tailscale while denying ordinary inbound internet traffic by default.

Recommended checks:

```bash
sudo ss -tulpn
sudo ufw status numbered
```

If you see unneeded public inbound rules, review and remove them carefully, for example:

```bash
sudo ufw delete allow 3000/tcp
sudo ufw delete allow 8000/tcp
```

Do not remove your working SSH path until you have confirmed you can still administer the box safely over Tailscale.

## Optional: Use Tailscale SSH for server administration

If you want SSH administration to stay inside Tailscale too, you can enable Tailscale SSH on the server:

```bash
sudo tailscale set --ssh
```

Notes:

- Tailscale SSH is optional for `trace_itself`
- it only affects SSH traffic that arrives over the Tailscale IP
- if you have customized Tailscale access policies, you may need explicit SSH rules in the Tailscale admin console

You can then connect from another Tailscale device with:

```bash
ssh <user>@<server-name>
```

If you do not want Tailscale SSH later:

```bash
sudo tailscale set --ssh=false
```

## Day-2 operations

Check the app:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

Check Tailscale:

```bash
tailscale status
tailscale serve status
tailscale funnel status
```

Restart the app after `.env` changes:

```bash
docker compose down
docker compose up --build -d
```

Stop private web publishing:

```bash
sudo tailscale serve reset
```

Clear public Funnel publishing if it was enabled:

```bash
sudo tailscale funnel reset
```

## Troubleshooting

### I can open the login page locally but not remotely

Check:

```bash
docker compose ps
tailscale status
tailscale serve status
```

If `tailscale serve status` shows no config, re-run:

```bash
sudo tailscale serve --bg 3000
```

### I am seeing scanner traffic like `/payment` or `/.env` in Nginx logs

That usually means the site was published with Funnel instead of private Serve.

Check:

```bash
tailscale funnel status
```

If Funnel is active:

```bash
sudo tailscale funnel reset
sudo tailscale serve --bg 3000
```

### Remote login works inconsistently

Make sure `.env` contains:

```bash
SESSION_COOKIE_SECURE=true
```

Then restart:

```bash
docker compose down
docker compose up --build -d
```

### I cannot reach the server over Tailscale after tightening UFW

Check:

```bash
sudo ufw status verbose
tailscale status
tailscale ip -4
```

Make sure the firewall still allows:

```bash
sudo ufw allow in on tailscale0
```

## Official references

- Tailscale Serve: https://tailscale.com/docs/reference/tailscale-cli/serve
- Tailnet-only website hosting: https://tailscale.com/docs/features/tailscale-funnel/how-to/host-websites
- UFW lockdown on Ubuntu: https://tailscale.com/docs/how-to/secure-ubuntu-server-with-ufw
- Device approval: https://tailscale.com/docs/features/access-control/device-management/device-approval
- HTTPS certificates and `ts.net`: https://tailscale.com/docs/how-to/set-up-https-certificates
- Tailscale SSH: https://tailscale.com/docs/features/tailscale-ssh
- SSH over Tailscale reference: https://tailscale.com/docs/reference/ssh-over-tailscale
