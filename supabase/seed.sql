-- ============================================================================
-- OBSCURA STUDIO — starter data (OPTIONAL)
-- ----------------------------------------------------------------------------
-- Run this AFTER schema.sql if you want the studio to start with your real
-- equipment inventory already loaded, plus a couple of example clients and
-- projects so the dashboard isn't empty on day one.
--
-- Safe to run more than once — nothing is duplicated.
-- To start completely clean instead, just skip this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Equipment inventory (from the Obscura gear list)
-- ---------------------------------------------------------------------------
-- Matched on name, so re-running this file never duplicates the inventory.
insert into public.gear (name, category, note, qty, rate, status)
select v.name, v.category, v.note, v.qty, v.rate, v.status::public.gear_status
from (values
  ('Godox SK300 II',            'Lighting',    'Studio flash',      2, 300,  'in'),
  ('Nanlite 200W',              'Lighting',    'Continuous',        2, 300,  'in'),
  ('Namtu 300W',                'Lighting',    'Continuous',        1, 300,  'in'),
  ('Nanlite Forza 300',         'Lighting',    'Continuous',        1, 300,  'in'),
  ('Godox 150 RGB',             'Lighting',    'Full colour',       1, 500,  'in'),
  ('Nanlite tube 77cm',         'Lighting',    'Tube light',        1, 250,  'in'),
  ('Neewer tube 77cm',          'Lighting',    'Tube light',        1, 250,  'in'),
  ('Nanlite Litolite 5C',       'Lighting',    'Pocket LED panel',  2, 50,   'in'),
  ('Octabox 90cm',              'Modifiers',   'Softbox',           3, 50,   'in'),
  ('Lantern box 65cm',          'Modifiers',   'Bela',              1, 50,   'in'),
  ('Fresnel',                   'Modifiers',   'Spot',              1, 50,   'in'),
  ('Strip box 90cm',            'Modifiers',   'Softbox',           1, 50,   'in'),
  ('Sony A7 III',               'Cameras',     'Body',              1, 800,  'in'),
  ('Sony A7S III',              'Cameras',     'Body',              1, 1500, 'in'),
  ('Sigma 24-70mm V2',          'Lenses',      'Zoom',              1, 600,  'in'),
  ('Samyang 24mm',              'Lenses',      'Cine T-stop',       1, 500,  'in'),
  ('Samyang 75mm',              'Lenses',      'Cine T-stop',       1, 500,  'in'),
  ('DJI Ronin RS4',             'Accessories', 'Gimbal',            2, 1000, 'in'),
  ('Hollyland mic',             'Accessories', 'Wireless',          2, 300,  'in'),
  ('Super clamp',               'Accessories', 'Rigging',           1, 200,  'in'),
  ('Magic arm',                 'Accessories', 'Rigging',           1, 200,  'in'),
  ('Video + Photo tripod',      'Grip',        'Pair',              2, 100,  'in'),
  ('C-stand',                   'Grip',        'Support',           1, 50,   'in'),
  ('Reflectors S + L',          'Grip',        'Bounce',            2, 50,   'in'),
  ('White / green backdrop',    'Backdrops',   'Cyclorama',         1, 300,  'in'),
  ('Tree lamp',                 'Props',       'Lamp',              1, 350,  'in'),
  ('Jute lamp',                 'Props',       'Lamp',              1, 100,  'in'),
  ('Wood lamp',                 'Props',       'Lamp',              1, 200,  'in'),
  ('Live-edge wooden table',    'Props',       'Furniture',         1, 150,  'in'),
  ('Vintage Sony TV',           'Props',       'Furniture',         1, 150,  'in'),
  ('Vintage cameras',           'Props',       'Display only',      4, 50,   'in')
) as v(name, category, note, qty, rate, status)
where not exists (select 1 from public.gear g where g.name = v.name);

-- Only seed the sample business data if the studio is still empty.
do $$
declare
  v_zeina uuid; v_cairo uuid; v_nile uuid;
  v_youssef uuid; v_mariam uuid; v_karim uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
begin
  if exists (select 1 from public.clients) then
    raise notice 'Clients already exist — skipping sample data.';
    return;
  end if;

  insert into public.clients(name, company, phone) values
    ('Zeina Cosmetics', 'Zeina Group',    '0100 221 8890') returning id into v_zeina;
  insert into public.clients(name, company, phone) values
    ('Cairo Motors',    'Cairo Motors',   '0122 447 1120') returning id into v_cairo;
  insert into public.clients(name, company, phone) values
    ('Nile Apparel',    'Nile Apparel',   '0111 908 3345') returning id into v_nile;
  insert into public.clients(name, phone) values
    ('Halwa Bakery', '0106 553 7781'),
    ('Orbit Media',  '0128 330 6612');

  insert into public.team_members(name, role_title, salary, per_video) values
    ('Youssef Adel', 'Senior editor',      9000, 220) returning id into v_youssef;
  insert into public.team_members(name, role_title, salary, per_video) values
    ('Mariam Fathy', 'Editor · colorist',  7500, 190) returning id into v_mariam;
  insert into public.team_members(name, role_title, salary, per_video) values
    ('Karim Nabil',  'Motion designer',    8000, 250) returning id into v_karim;

  insert into public.projects(client_id, client_name, title, value, total_videos) values
    (v_zeina, 'Zeina Cosmetics', 'Ramadan campaign edits', 10000, 30) returning id into v_p1;
  insert into public.projects(client_id, client_name, title, value, total_videos) values
    (v_cairo, 'Cairo Motors',    'Showroom reels',         18000, 24) returning id into v_p2;
  insert into public.projects(client_id, client_name, title, value, total_videos) values
    (v_nile,  'Nile Apparel',    'Lookbook cutdowns',       7500, 15) returning id into v_p3;

  insert into public.project_deliveries(project_id, member_id, member_name, count) values
    (v_p1, v_youssef, 'Youssef Adel', 12),
    (v_p1, v_mariam,  'Mariam Fathy',  6),
    (v_p2, v_karim,   'Karim Nabil',   9),
    (v_p2, v_youssef, 'Youssef Adel',  4),
    (v_p3, v_mariam,  'Mariam Fathy', 15);

  -- A few sessions around today so the calendar has something in it.
  insert into public.sessions(client_id, client_name, phone, shoot_type, date, start_hour,
                              package, hours, base_amount, addons_amount, total_amount,
                              deposit_paid, deposit_amount, status)
  values
    (v_zeina, 'Zeina Cosmetics', '0100 221 8890', 'product', current_date,               11, 'half',   5, 1200, 0, 1200, true,  600,  'confirmed'),
    (v_cairo, 'Cairo Motors',    '0122 447 1120', 'auto',    current_date,               17, 'hourly', 3,  900, 0,  900, false, 450,  'pending'),
    (v_nile,  'Nile Apparel',    '0111 908 3345', 'fashion', current_date + 3,           10, 'full',  10, 2500, 0, 2500, true,  1250, 'confirmed'),
    (null,    'Halwa Bakery',    '0106 553 7781', 'food',    current_date + 7,           13, 'half',   5, 1200, 0, 1200, false, 600,  'pending');

  insert into public.ledger_entries(type, category, label, amount, date) values
    ('out', 'Rent',      'Studio rent — this month',   12000, date_trunc('month', current_date)::date),
    ('out', 'Salary',    'Youssef Adel — salary',       9000, date_trunc('month', current_date)::date),
    ('out', 'Utilities', 'Electricity + internet',       1850, date_trunc('month', current_date)::date),
    ('out', 'Gear',      'Replacement bulbs',             640, current_date);
end $$;
