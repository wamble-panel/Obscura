<div align="center">
  <img src="public/brand/lockup.png" alt="Obscura" width="220">
  <h3>Studio management system</h3>
  <p><em>Orders · Rentals · Gear · Projects · Finance · Team — with a full audit trail.</em></p>
</div>

---

An internal system for running the studio: booking sessions, renting equipment out,
tracking project deliverables, keeping the books, paying the team — and knowing
exactly who did what, and who is signed in right now.

Built as a Next.js app on Supabase, deployed on Vercel, and installable on an
iPhone home screen so it behaves like a native app.

---

## Get it running (about 10 minutes)

### 1 · Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick a region close to you (Frankfurt is a good choice for Egypt).
3. Save the database password somewhere safe.

### 2 · Create the database

1. In your project, open **SQL Editor** → **New query**.
2. Copy the whole of [`supabase/schema.sql`](supabase/schema.sql), paste it, press **Run**.
3. *(Optional but recommended)* Do the same with [`supabase/seed.sql`](supabase/seed.sql) —
   it loads the studio's real equipment list plus a few example clients so nothing
   looks empty on day one.

Both files are safe to run again at any time; they never duplicate or destroy data.

### 3 · Deploy to Vercel

1. Push this repository to GitHub (already done if you are reading this there).
2. [vercel.com](https://vercel.com) → **Add New… → Project** → import the repo.
3. Vercel detects Next.js automatically — no build settings to change.
4. Before the first deploy finishes, add the environment variables below.

> `vercel.json` pins `"framework": "nextjs"` deliberately. This repo started life
> as plain HTML design files, so a Vercel project imported back then detected the
> framework as *Other* and kept it — the build ran and compiled fine, but the output
> was served as a static site: anything in `public/` resolved and every real route
> returned a 404. Settings in `vercel.json` override the dashboard, so pinning it
> here makes that impossible. `outputDirectory: null` clears any dashboard override
> and lets the framework choose its own.
>
> A healthy build log contains `Detected Next.js version:` just before the build
> starts. If that line is missing, the framework was not detected.

### 4 · Environment variables

In Vercel: **Settings → Environment Variables**. Add each one to
*Production*, *Preview* and *Development*, then **redeploy**.

| Variable | Required | Where to find it |
| --- | :---: | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → **Data API** → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase → Project Settings → **API Keys** → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | ⭐ | Supabase → Project Settings → **API Keys** → `service_role` |
| `CRON_SECRET` | ⭐ | Invent one: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | – | Your final URL, e.g. `https://obscura.vercel.app` |

⭐ = not strictly required, but you want it:

- **`SUPABASE_SERVICE_ROLE_KEY`** lets you create team accounts from inside the app
  (Users → Invite user). Without it, people sign up on the login page and you approve
  them instead. **Never** put this key anywhere public.
- **`CRON_SECRET`** stops strangers from calling the keep-alive endpoint. Vercel sends
  it automatically on scheduled runs.

> **Heads up:** the `NEXT_PUBLIC_*` variables are baked in when the site is built.
> If you add them after a deploy, **redeploy** for them to take effect.

If the app can't find them it shows a `/setup` page that tells you exactly what is
missing — nothing crashes.

### 5 · Create your account

Open the deployed site → **Create account**.

**The very first account created becomes the admin automatically**, with every
permission, and is active immediately. Everyone who signs up after that lands in a
pending state until you activate them from **Users & access**.

---

## Adding your team

Two ways, both fine:

**You create their account** *(needs `SUPABASE_SERVICE_ROLE_KEY`)*
Users & access → **Invite user** → pick a role → a temporary password is generated
for you to pass on. They can change it later from Account → Password.

**They sign up themselves**
They use **Create account** on the login page, then you open Users & access and hit
**Activate**, and set their role.

### Roles

| Role | What they get |
| --- | --- |
| **Admin** | Everything, including users, permissions and the audit log |
| **Manager** | Runs the studio day to day — everything except managing accounts |
| **Accountant** | Finance, payroll, reports, read-only elsewhere |
| **Coordinator** | Front desk: books sessions, handles rentals and clients |
| **Editor** | Their projects, and logging deliveries |
| **Photographer** | Calendar and gear |
| **Viewer** | Read-only dashboard and calendar |

Roles are only the starting point. Two levels of control sit on top:

- **Role defaults** — Users & access → *Role defaults* changes what a whole role can
  do. Affects everyone holding it.
- **Per-person overrides** — open anyone in Users & access and tap individual
  permissions to grant or revoke them just for that person. Overrides are highlighted
  in green (granted) or red (revoked), and *Reset to role defaults* clears them.

Permissions are enforced by the database itself (PostgreSQL row level security), not
just hidden in the UI. Someone without `finance.view` cannot read the ledger even if
they go looking for it with the API.

---

## The audit page

**Admin → Audit log** answers "what happened, and who did it".

- **Online right now** — everyone signed in this minute, which page they are on,
  what device, and how long they have been there. Updates live.
- **Activity feed** — every insert, update and delete on every table, written by
  database triggers, so nothing can slip past. Expand a row to see the exact
  before → after values that changed.
- Sign-ins, failed sign-ins, sign-outs, permission changes, and denied access
  attempts are recorded too.
- Filter by kind, search by person or record, and export to CSV.

The audit log is append-only. Nobody — not even an admin — can edit or delete it
through the app; the permission is revoked at the database level.

---

## Installing on iPhone

1. Open the site in **Safari** (it must be Safari, not Chrome).
2. Tap the **Share** button.
3. Choose **Add to Home Screen** → **Add**.

It launches full screen with no browser chrome, respects the notch and home
indicator, and has its own icon. Same flow works on Android via Chrome's
"Install app". Settings → *Install on your phone* has these steps in-app.

---

## Keeping Supabase awake

A free Supabase project is paused after about a week of inactivity, which would
take the studio offline. Two independent jobs prevent that:

1. **Vercel Cron** — `vercel.json` schedules `/api/keepalive` daily at 06:00 UTC.
   Nothing to configure; it works as soon as you deploy.
2. **GitHub Action** — `.github/workflows/keepalive.yml` does the same at 05:30 UTC
   as a backup, in case the deployment moves or is paused. To enable it, add two
   repository secrets under **Settings → Secrets and variables → Actions**:
   - `KEEPALIVE_URL` → `https://your-app.vercel.app/api/keepalive`
   - `CRON_SECRET` → the same value you used in Vercel

The same job also flags rentals that have gone past their due date, so overdue
badges are correct first thing in the morning.

**Settings → System health** shows when the last ping landed and lets you fire one
by hand. If the dot turns red, the crons have stopped and it needs a look.

---

## Working on it locally

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
npm run dev                    # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run icons` | Rebuild app icons from `design/obscura-logo.png` |

---

## How it is put together

```
src/
  app/
    (app)/            every signed-in page — the shell, nav and guards live here
      calendar/       month grid + drag-across-the-hours booking
      orders/         every session, filterable, exportable
      rentals/        gear out on rent, overdue tracking, returns
      gear/           inventory by category, repair status
      projects/       deliverables, per-editor progress
      clients/        contacts and spend
      finance/        ledger, monthly summary
      team/           members, output, payroll
      admin/users/    accounts, roles, per-person permissions
      admin/audit/    live activity + who is online
      settings/       rates, hours, system health
    login/  setup/  pending/  no-access/  offline/
    api/keepalive/    the cron endpoint
  components/         UI kit, shell, shared modals
  lib/                permissions, i18n, formatting, Supabase clients
  server/             all mutations, as Server Actions
supabase/
  schema.sql          the entire database — tables, RLS, triggers, audit
  seed.sql            optional starter data
design/               the original design files this was built from
```

**A few decisions worth knowing about:**

- **Prices are calculated on the server.** The booking form shows a total, but the
  number that gets saved is recomputed from the studio's own rate settings. Editing
  the page in a browser cannot change what a session costs.
- **Double bookings are impossible.** A database trigger rejects any session that
  overlaps another on the same day, so two people booking at once cannot collide.
- **Gear status follows its rentals.** Renting something out marks it `out`; marking
  it returned puts it back to `in`. No manual bookkeeping and no drift.
- **Everything is bilingual.** English and Arabic, with a full RTL layout. The toggle
  is in the sidebar; numbers, prices and times stay left-to-right in both.
- **The service worker is deliberately cautious.** Pages are always fetched fresh —
  showing a stale booking would be worse than showing a spinner — and only static
  assets are cached.
