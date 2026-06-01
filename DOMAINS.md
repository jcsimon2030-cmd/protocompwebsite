# ProtoComp — domain & deployment architecture

Intended split between the **public marketing site** and the **private app shell**.
This document is the source of truth for which surface owns which domain.

## Intended split

| Surface | What it is | Domain | Status |
|---------|-----------|--------|--------|
| **Public marketing site** | This repo — static HTML/CSS. Marketing-first, universal positioning. | **protocomp.app** (root) | Public |
| **App shell** | The `p4-portal` Next.js application (auth, AI coaching, billing, coach routes, Supabase). | A **private/internal app URL** (e.g. `app.protocomp.com`) | **Private until launch — must NOT be presented as launched** |

**Rule of thumb:** the root domain is the website. The app lives on its own subdomain and stays gated until we explicitly launch.

## Vercel projects

| Project | Serves | Git source | Notes |
|---------|--------|-----------|-------|
| `protocomp-marketing` | The public marketing site (this repo) | deployed from this repo | Owns the public domains. |
| `protocompwebsite` | The `p4-portal` app shell | `p4-pppp/p4-portal` (auto-deploy) | App project. **Do not point public root at this.** |

> Naming note: the `protocompwebsite` Vercel project currently hosts the *app*, not the website — a historical artifact. The website lives in `protocomp-marketing`.

## Domains

- `protocomp.app` + `www.protocomp.app` → **public marketing site** (`protocomp-marketing`). `www` 308-redirects to the apex.
- `protocomp.health` / `protocomp.fitness` (+ `www`) → 308-redirect to `protocomp.app` (registered at Namecheap).
- The app shell should only ever be reachable at its private/internal URL until launch.

## Incident log

- **Accidental re-alias:** the app shell was deployed into the `protocompwebsite` project and a deployment-level alias re-pointed `protocomp.app` at an app deployment, exposing the unlaunched app on the public root. Fix = ensure the public domains resolve to `protocomp-marketing` and remove/override any deployment alias pointing the root at an app deployment.

## Guardrails

- Public pages stay marketing-first and universal (natural + enhanced athletes). No exposed pharma/medication specifics.
- The app is not presented as launched. Use waitlist / early-access / private-beta language only.
- Do not change app logic, engines, Supabase schema, billing, coach routes, or native builds from this repo.
