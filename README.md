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
  (Users → Invite user, or Team → Create login). Without it you can only create
  accounts from the Supabase dashboard. **Never** put this key anywhere public.
- **`CRON_SECRET`** stops strangers from calling the keep-alive endpoint. Vercel sends
  it automatically on scheduled runs.

> **Heads up:** the `NEXT_PUBLIC_*` variables are baked in when the site is built.
> If you add them after a deploy, **redeploy** for them to take effect.

If the app can't find them it shows a `/setup` page that tells you exactly what is
missing — nothing crashes.

### 5 · Close the door, then make your account

**There is no registration page, by design.** Nobody can create their own account —
accounts are issued by an admin. Two things make that true:

**a. Turn off public sign-up in Supabase**

> Authentication → Sign In / Providers → Email → uncheck
> **"Allow new users to sign up"** → Save

This is what actually enforces it. Removing the form only hides the door; this locks
it, including against anyone calling the API directly.

**b. Create the first admin by hand**

> Authentication → Users → **Add user** → Create new user
> - email, and a password you choose
> - ✅ tick **Auto Confirm User** — without it you cannot sign in until you click a
>   confirmation email, and Supabase's built-in mailer is rate limited and often
>   lands in spam

**The first account created becomes the studio admin automatically** — every
permission, active immediately. Sign in with it and you are running the studio.

---

## Adding your team

Two routes to the same place, both needing `SUPABASE_SERVICE_ROLE_KEY`:

- **Users & access → Invite user** — pick a role, get a generated temporary password
  to hand over.
- **Team → a member's card → Create login** — creates the account *and* links it to
  their delivery history, so their output and their login are the same person.

They can change the password themselves from Account → Password.

### Suspending someone

Open them in Users & access → **Suspend**. It records who did it and why, drops them
from the presence board, revokes their session tokens, and strips every permission at
once — enforced in the database, not just hidden in the UI. **Reinstate** puts them
back and clears the suspension.

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

## Sending an invoice to a client

Open the invoice → **Create client link**. That produces a private URL like
`https://your-app.vercel.app/i/9f3c…` which you can send over WhatsApp or email.

The client opens it on any device with **no account and no login**, sees the invoice
on Obscura letterhead, and can tap **Save as PDF** (on iPhone that is the same Share
sheet, via "Save to Files"). You can see how many times it has been opened, and the
audit log records the first open.

How it is kept safe:

- The token is 16 random bytes — 32 hex characters, not guessable.
- Anonymous visitors are granted exactly **one** database function, which returns
  only that invoice's lines, payments and totals. No client record, no phone number,
  no other invoice, no studio data.
- **Withdraw** kills the link instantly. **New link** rotates it, and the old URL
  stops working the moment you do.
- Links can carry an expiry date; without one they stay live until withdrawn.

Anyone holding the link can view that one invoice — treat it like the invoice
itself, and withdraw it if it goes astray.

---

## Terms & Conditions

The studio's T&C lives in the database, not in a flat image, and is served as real
text at **`/terms`** — a public page anyone can open, read, translate, search, or
save as a PDF. Every shared invoice links to it, and every printed invoice carries
the reference line.

Edit it in **Settings → Terms & Conditions**: add or remove sections and points, and
wrap a phrase in `**double asterisks**` to bold it. Changes are live immediately —
no deploy, no designer. The original design is kept in
[`design/`](design/obscura-terms-and-conditions.pdf) for reference.

The seeded copy is the studio's real one: booking and time, studio care, payment and
cancellation, house rules, the three house-rule pictograms, and
*"By booking a session at OBSCURA you agree to these terms."*

---

## Installing on iPhone

1. Open the site in **Safari** (it must be Safari, not Chrome).
2. Tap the **Share** button.
3. Choose **Add to Home Screen** → **Add**.

The app prompts you with these steps on your first visit, and Settings →
*Install on your phone* has them too.

Once installed it behaves like a real app rather than a saved page:

- **Full screen**, no browser chrome or address bar
- **Its own launch screen** with the Obscura mark at six device sizes, so it opens on
  the brand rather than a white flash
- **Pull down to refresh** — added because standalone iOS has no reload button, which
  is the usual way a web app feels stuck
- No rubber-band scroll, no text selection or magnifier when tapping around, no
  double-tap zoom
- Respects the notch and the home indicator
- Home-screen shortcuts straight into Calendar, Rentals and Gear (long-press the icon)

Android works the same way through Chrome's "Install app".

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
      invoices/       billing, payments, client links
    i/[token]/        the invoice a client opens — no account needed
    print/            invoice + statement on letterhead, for paper or PDF
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
