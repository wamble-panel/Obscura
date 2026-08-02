-- ============================================================================
-- OBSCURA STUDIO — wipe the working data, keep the setup
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor when you want a clean page to start
-- working from — after trying the sample data, or at the end of a trial run.
--
-- IT DELETES        bookings, rentals, projects, deliveries, clients,
--                   invoices, payments, ledger entries, payroll, team members,
--                   and the whole audit trail
--
-- IT KEEPS          your login and everyone else's, roles and permissions,
--                   studio settings and rates, and the equipment inventory
--
-- Equipment is kept because re-entering 31 items by hand is miserable. If you
-- want that gone too, uncomment the marked line near the bottom.
--
-- There is no undo. If you are unsure, take a backup first:
-- Supabase -> Database -> Backups.
-- ============================================================================

begin;

-- Order matters only where a foreign key would complain; the cascades handle
-- the rest (invoice_items follow invoices, session_addons follow sessions).
truncate table
  public.payments,
  public.invoice_items,
  public.invoices,
  public.project_deliveries,
  public.projects,
  public.session_addons,
  public.sessions,
  public.rentals,
  public.ledger_entries,
  public.payroll,
  public.team_members,
  public.clients
restart identity cascade;

-- Equipment goes back to "in studio" — any rental that had it out is gone now.
update public.gear
   set status = 'in'
 where status <> 'maint';

-- Start the human-facing numbers again from 1001.
alter sequence public.session_code_seq   restart with 1001;
alter sequence public.rental_code_seq    restart with 1001;
alter sequence public.invoice_number_seq restart with 1001;

-- Clear the history of all of the above. Everything from here on is real.
truncate table public.audit_log restart identity;

-- Nobody is mid-session after a wipe.
truncate table public.user_presence;

-- ---------------------------------------------------------------------------
-- Uncomment to clear the equipment inventory as well:
-- truncate table public.gear restart identity cascade;
-- ---------------------------------------------------------------------------

insert into public.audit_log(action, entity, summary, severity)
values ('system.reset', 'app',
        'Working data cleared from the SQL editor — studio started fresh',
        'critical');

commit;

-- What you are left with:
select 'clients'   as table_name, count(*) from public.clients
union all select 'sessions',      count(*) from public.sessions
union all select 'rentals',       count(*) from public.rentals
union all select 'projects',      count(*) from public.projects
union all select 'invoices',      count(*) from public.invoices
union all select 'payments',      count(*) from public.payments
union all select 'ledger',        count(*) from public.ledger_entries
union all select 'team_members',  count(*) from public.team_members
union all select 'gear (kept)',   count(*) from public.gear
union all select 'people (kept)', count(*) from public.profiles;
