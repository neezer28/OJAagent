-- Oja database setup. Run once in the Supabase SQL Editor.
-- Safe to run again: it only creates what is missing.
-- Order statuses used by the bot: awaiting_payment, pending_approval, paid, rejected.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'yard',
  price_ngn numeric not null,
  stock numeric not null default 0,
  active boolean not null default true
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  name text,
  refund_address text,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  status text not null default 'draft',
  total_ngn numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id),
  quantity numeric not null,
  unit_price_ngn numeric not null
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  deposit_address text,
  origin_asset text,
  amount_in text,
  amount_out text,
  status text not null default 'PENDING_DEPOSIT',
  quote jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists merchant_policy (
  id integer primary key default 1 check (id = 1),
  max_discount_percent numeric not null default 5,
  approval_above_ngn numeric not null default 200000,
  allow_refunds boolean not null default false
);

create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  action text not null,
  detail jsonb,
  created_at timestamptz default now()
);

-- Row level security on, with no public policies:
-- only the server-side secret key can read or write.
alter table products enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table merchant_policy enable row level security;
alter table agent_actions enable row level security;

-- Starting data: the owner's policy and three sample products.
insert into merchant_policy (id) values (1) on conflict (id) do nothing;

insert into products (name, unit, price_ngn, stock)
select * from (values
  ('Ankara Wax Print - Blue', 'yard', 4500, 120),
  ('Ankara Wax Print - Red', 'yard', 4500, 80),
  ('Aso Oke - Gold', 'yard', 12000, 30)
) as v(name, unit, price_ngn, stock)
where not exists (select 1 from products);