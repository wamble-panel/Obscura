-- ===========================================================================
-- Obscura — Hazem X, programme quotation
--
-- Only needed if you would rather not type the lines into the invoice editor.
-- Paste it into the Supabase SQL editor and run it; everything worth changing
-- is in the SETTINGS block. Safe to re-run — the invoice is rebuilt rather
-- than duplicated.
--
-- The 10% only comes off the studio's own equipment, never the gear hired in,
-- so it is a line inside that section rather than the invoice-wide discount
-- field. It shows on the invoice as its own line, which is what a client
-- querying the total wants to see.
-- ===========================================================================

do $$
declare
  -- ======================== SETTINGS — EDIT THESE ========================
  v_client_name text := 'Hazem X';
  v_reference   text := 'HAZEM-001';
  v_title       text := 'Programme quotation';
  v_issue_date  date := current_date;
  v_due_days    int  := 14;

  -- The one figure your list did not carry a price for.
  v_lens_2470 numeric := 0;

  -- Ten per cent, off the studio's own kit only.
  v_equipment_discount_pct numeric := 10;
  -- ====================== END OF SETTINGS ================================

  v_client_id uuid;
  v_invoice   uuid;
  v_equipment numeric;
  v_discount  numeric;
begin
  select id into v_client_id
    from public.clients where lower(name) = lower(trim(v_client_name)) limit 1;
  if v_client_id is null then
    insert into public.clients(name) values (trim(v_client_name)) returning id into v_client_id;
  end if;

  select id into v_invoice
    from public.invoices where notes like '%[' || v_reference || ']%' limit 1;

  if v_invoice is null then
    insert into public.invoices(client_id, client_name, currency, issue_date, due_date, status, notes)
    values (v_client_id, trim(v_client_name), 'EGP', v_issue_date, v_issue_date + v_due_days, 'draft',
      'This quotation covers a 9-hour shooting day, up to 3 episodes.' || chr(10) ||
      'It assumes a minimum of 6 shooting days per month.' || chr(10) ||
      'Figures may be revised once the final script and full brief for the programme are confirmed.'
      || chr(10) || chr(10) || v_title || ' [' || v_reference || ']')
    returning id into v_invoice;
  else
    delete from public.invoice_items where invoice_id = v_invoice;
  end if;

  -- ---- crew -------------------------------------------------------------
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values
    (v_invoice, 'Crew', 'Director of photography', null, 1, 5000, 1),
    (v_invoice, 'Crew', 'Assistant camera',        null, 1, 1500, 2);

  -- ---- the studio's own equipment ---------------------------------------
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values
    (v_invoice, 'Equipment', 'Sony A7 III',            'Wide camera',     1,  450,  3),
    (v_invoice, 'Equipment', 'Sony A7S III',           'Close-up camera', 1, 1100,  4),
    (v_invoice, 'Equipment', 'Tripod',                 null,              1,  150,  5),
    (v_invoice, 'Equipment', 'Hollyland wireless mic', null,              2,  250,  6),
    (v_invoice, 'Equipment', '24mm lens',              null,              1,  400,  7),
    (v_invoice, 'Equipment', '300W light head',        'With Bella',      1,  450,  8),
    (v_invoice, 'Equipment', '200W light head',        'With Octa',       1,  300,  9),
    (v_invoice, 'Equipment', 'Tube light',             null,              2,  150, 10),
    (v_invoice, 'Equipment', 'Light stands',           'Included',        1,    0, 11),
    (v_invoice, 'Equipment', 'Ronin RS 4',             null,              1,  800, 12);

  -- Worked out from the lines above rather than typed, so editing a price
  -- above and re-running keeps the discount honest.
  select coalesce(sum(amount), 0) into v_equipment
    from public.invoice_items where invoice_id = v_invoice and section = 'Equipment';
  v_discount := round(v_equipment * v_equipment_discount_pct / 100);

  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values (v_invoice, 'Equipment', 'Equipment discount',
          v_equipment_discount_pct || '% off Obscura equipment', 1, -v_discount, 13);

  -- ---- hired in, at full price ------------------------------------------
  insert into public.invoice_items(invoice_id, section, description, detail, qty, unit_price, sort)
  values
    (v_invoice, 'Rented in', 'Sony A7S III',  null, 1, 1100, 14),
    (v_invoice, 'Rented in', '24-70mm lens',
       case when v_lens_2470 = 0 then 'Price to confirm' else null end, 2, v_lens_2470, 15),
    (v_invoice, 'Rented in', 'Monitor',       null, 3,  400, 16),
    (v_invoice, 'Rented in', 'Tripod',        null, 2,  250, 17);

  raise notice 'Quotation ready for % — equipment %, less % discount',
    trim(v_client_name), v_equipment, v_discount;
end $$;

select it.section, sum(it.amount) as section_total
  from public.invoice_items it
  join public.invoices i on i.id = it.invoice_id
 where i.notes like '%[HAZEM-001]%'
 group by it.section order by min(it.sort);

select number, client_name, subtotal, total
  from public.invoices where notes like '%[HAZEM-001]%';
