# Login Entry, Version A

## Why This Page Is Transitional

`trace_itself` is currently in family-and-friends testing behind Tailscale, with optional Tailscale Funnel exposure for demos, but the product is being shaped as a real public-facing system rather than an internal tool.

Version A of the login page is the transition layer between those two realities:

- it looks and behaves like a serious product entry point
- it still supports the current private-testing access model
- it prepares the UI and component structure for future public multi-user auth

## Current Stage

Today, access is still controlled in two layers:

- `Tailscale` often provides the network boundary in private deployments, while Funnel can be used as an explicit public-demo path
- product accounts provide the application session

That means the login page should feel trustworthy and product-grade, while still acknowledging that access is limited and invite-based.

## What Version A Supports

- public-facing product framing
- a responsive desktop and mobile login experience
- a working credential-based entry path for current private beta accounts
- visible placeholders for future `Google` and `GitHub` sign-in options

The current working path is surfaced as `Continue with Email`, but users are still signing in with issued credentials while the broader public auth system is not live yet. Even if the page is made public through Funnel, there is no self-serve signup flow yet.

## What It Deliberately Does Not Do Yet

- full OAuth implementation
- self-serve account creation
- waitlist automation
- enterprise or admin-oriented auth UX

Those are intentionally deferred so the current product can stay clean and understandable.

## Internal And Admin Access

Internal or admin-only routes should remain separate from the public login surface.

That means:

- no prominent admin login CTA on the main public auth card
- no internal control language in the primary sign-in experience
- internal routing and elevated access should remain behind existing app-level access control

This keeps the public entry focused on product users rather than operational staff workflows.

## Expected Evolution

The intended path from Version A is:

1. keep the current credential flow available for private testing
2. connect the public provider buttons to real OAuth flows
3. add public-facing `Privacy`, `Terms`, and access-request destinations
4. preserve separation between public product auth and internal/admin-only access paths

That gives the product a stable, believable login experience now without pretending the final auth stack already exists.
