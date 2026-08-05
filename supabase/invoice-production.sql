-- ===========================================================================
-- Obscura — production shoot invoice
--
-- Creates one invoice covering crew, the studio's own kit, gear hired in and
-- transport, grouped into sections so it reads cleanly on paper and on the
-- link the client opens.
--
-- Run it in the Supabase SQL editor. Everything you might want to change is in
-- the "SETTINGS" block at the top; nothing below it needs editing.
--
-- Safe to re-run: an invoice with the same reference is rebuilt from scratch
-- rather than duplicated, so you can tweak a number and run it again.
-- ===========================================================================

do $$
declare
  -- ======================== SETTINGS — EDIT THESE ========================

  -- Who it is for. If the name is not in the client list yet it gets added,
  -- so the invoice, their statement and their future bookings stay joined up.
  v_client_name    text := 'Client name';
  v_client_company text := null;
  v_client_phone   text := null;
  v_client_email   text := null;

  -- What the shoot was, and when. The reference is how a re-run finds this
  -- invoice again — give each production its own.
  v_reference   text := 'PROD-001';
  v_shoot_title text := 'Production shoot';
  v_issue_date  date := current_date;
  v_due_days    int  := 14;

  -- Camera and light assistant: 'one' bills a single assistant at 4,000.
  -- 'two' bills two assistants at 2,500 each (5,000).
  v_assistants text := 'one';

  -- Money off, and tax. Leave both at 0 for a plain invoice.
  v_discount numeric := 0;
  v_tax_rate numeric := 0;

  -- ---- crew ----
  v_dop            numeric := 4000;
  v_sound          numeric := 4000;
  v_assistant_one  numeric := 4000;   -- when v_assistants = 'one'
  v_assistant_each numeric := 2500;   -- when v_assistants = 'two'

  -- ---- the studio's own kit, billed as one package ----
  v_own_kit numeric := 4000;

  -- ---- gear hired in ----
  v_fx3        numeric := 2000;
  v_lens_70200 numeric := 800;
  v_lens_35    numeric := 500;
  v_lens_2470  numeric := 500;
  v_tripod     numeric := 250;
  v_nd_each    numeric := 200;   -- 2 filters, 400 in total

  -- ---- transport ----
  v_transport numeric := 1500;

  -- ====================== END OF SETTINGS ================================

  v_client_id uuid;
  v_invoice   uuid;
  v_sort      int := 0;
begin
  if v_assistants not in ('one', 'two') then
    raise exception 'v_assistants must be ''one'' or ''two'', not %', v_assistants;
  end if;

  -- ---- the client -------------------------------------------------------
  select id into v_client_id
    from public.clients
   where lower(name) = lower(trim(v_client_name))
   limit 1;

  if v_client_id is null then
    insert into public.clients(name, company, phone, email)
    values (trim(v_client_name), v_client_company, v_client_phone, v_client_email)
    returning id into v_client_id;
  end if;

  -- ---- the invoice ------------------------------------------------------
  -- Re-running replaces the lines rather than stacking a second copy on top.
  select id into v_invoice
    from public.invoices
   where notes like '%[' || v_reference || ']%'
   limit 1;

  if v_invoice is null then
    insert into public.invoices(
      client_id, client_name, client_company, client_phone, client_email,
      issue_date, due_date, discount, tax_rate, status, notes)
    values (
      v_client_id, trim(v_client_name), v_client_company, v_client_phone, v_client_email,
      v_issue_date, v_issue_date + v_due_days, v_discount, v_tax_rate, 'draft',
      v_shoot_title || ' [' || v_reference || ']')
    returning id into v_invoice;
  else
    delete from public.invoice_items where invoice_id = v_invoice;
    update public.invoices set
      client_id      = v_client_id,
      client_name    = trim(v_client_name),
      client_company = v_client_company,
      client_phone   = v_client_phone,
      client_email   = v_client_email,
      issue_date     = v_issue_date,
      due_date       = v_issue_date + v_due_days,
      discount       = v_discount,
      tax_rate       = v_tax_rate,
      notes          = v_shoot_title || ' [' || v_reference || ']'
    where id = v_invoice;
  end if;

  -- =======================================================================
  -- CREW
  -- =======================================================================
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values
    (v_invoice, 'Crew', 'Director of photography', null, 1, v_dop,   v_sort + 1),
    (v_invoice, 'Crew', 'Sound engineer',          null, 1, v_sound, v_sort + 2);
  v_sort := v_sort + 2;

  if v_assistants = 'two' then
    insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
    values (v_invoice, 'Crew', 'Camera & light assistant',
            'Two assistants on set', 2, v_assistant_each, v_sort + 1);
  else
    insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
    values (v_invoice, 'Crew', 'Camera & light assistant',
            null, 1, v_assistant_one, v_sort + 1);
  end if;
  v_sort := v_sort + 1;

  -- =======================================================================
  -- EQUIPMENT — the studio's own kit, one package price
  -- =======================================================================
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values (v_invoice, 'Equipment — Obscura kit', 'Studio equipment package',
          'Sony A7S III · Sony A7 III · 24mm lens · tripod · Ronin RS 4 · '
          || '2 × Forza 200 · Forza 300 · 2 × Octa 90 softbox · Fresnel · '
          || 'tube light · light stands',
          1, v_own_kit, v_sort + 1);
  v_sort := v_sort + 1;

  -- =======================================================================
  -- EQUIPMENT — hired in for this shoot
  -- =======================================================================
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values
    (v_invoice, 'Equipment — rented in', 'Sony FX3 body',   null, 1, v_fx3,        v_sort + 1),
    (v_invoice, 'Equipment — rented in', '70–200mm lens',   null, 1, v_lens_70200, v_sort + 2),
    (v_invoice, 'Equipment — rented in', '35mm lens',       null, 1, v_lens_35,    v_sort + 3),
    (v_invoice, 'Equipment — rented in', '24–70mm lens',    null, 1, v_lens_2470,  v_sort + 4),
    (v_invoice, 'Equipment — rented in', 'Tripod',          null, 1, v_tripod,     v_sort + 5),
    (v_invoice, 'Equipment — rented in', 'ND filters',
     'Two filters', 2, v_nd_each, v_sort + 6);
  v_sort := v_sort + 6;

  -- =======================================================================
  -- TRANSPORT
  -- =======================================================================
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values (v_invoice, 'Transport', 'Transportation',
          'Sound engineer', 1, v_transport, v_sort + 1);

  raise notice 'Invoice ready — reference %, client %', v_reference, trim(v_client_name);
end $$;

-- What was built, section by section.
select i.number,
       i.client_name,
       i.issue_date,
       i.due_date,
       i.subtotal,
       i.total
  from public.invoices i
 where i.notes like '%[PROD-001]%';

select it.section,
       it.description,
       it.detail,
       it.qty,
       it.unit_price,
       it.amount
  from public.invoice_items it
  join public.invoices i on i.id = it.invoice_id
 where i.notes like '%[PROD-001]%'
 order by it.sort;

select it.section,
       sum(it.amount) as section_total
  from public.invoice_items it
  join public.invoices i on i.id = it.invoice_id
 where i.notes like '%[PROD-001]%'
 group by it.section
 order by min(it.sort);
