create table public.global_products (
  id uuid primary key,
  name text not null,
  calories_per_100g numeric not null check (calories_per_100g >= 0),
  protein_per_100g numeric not null check (protein_per_100g >= 0),
  carbs_per_100g numeric not null check (carbs_per_100g >= 0),
  fat_per_100g numeric not null check (fat_per_100g >= 0),
  units jsonb not null default '[]'::jsonb check (jsonb_typeof(units) = 'array'),
  sort_order integer not null check (sort_order >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  constraint global_products_live_name check (deleted_at is not null or btrim(name) <> '')
);

create table public.products (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null,
  calories_per_100g numeric not null check (calories_per_100g >= 0),
  protein_per_100g numeric not null check (protein_per_100g >= 0),
  carbs_per_100g numeric not null check (carbs_per_100g >= 0),
  fat_per_100g numeric not null check (fat_per_100g >= 0),
  units jsonb not null default '[]'::jsonb check (jsonb_typeof(units) = 'array'),
  deleted_at timestamptz,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint products_live_name check (deleted_at is not null or btrim(name) <> '')
);

create table public.meals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null,
  tags text[] not null,
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
  deleted_at timestamptz,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint meals_live_name check (deleted_at is not null or btrim(name) <> ''),
  constraint meals_allowed_tags check (
    tags <@ array['breakfast', 'lunch', 'dinner', 'snack', 'dessert']::text[]
  )
);

create table public.day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'object'),
  deleted_at timestamptz,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, date_key),
  constraint day_plans_slots_shape check (
    slots ?& array['breakfast', 'lunch', 'dinner', 'snacks']
    and jsonb_typeof(slots->'breakfast') = 'array'
    and jsonb_typeof(slots->'lunch') = 'array'
    and jsonb_typeof(slots->'dinner') = 'array'
    and jsonb_typeof(slots->'snacks') = 'array'
  )
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calories numeric not null check (calories >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  allowed_calorie_overage integer not null check (allowed_calorie_overage between 0 and 500),
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.shopping_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  selection_key text not null check (btrim(selection_key) <> ''),
  checked jsonb not null default '{}'::jsonb check (jsonb_typeof(checked) = 'object'),
  deleted_at timestamptz,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, selection_key)
);

create or replace function public.set_private_sync_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  maximum_updated_at timestamptz := clock_timestamp() + interval '5 minutes';
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := caller_id;
    new.created_at := coalesce(new.created_at, now());
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;

  new.updated_at := least(new.updated_at, maximum_updated_at);

  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;

  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.set_global_product_sync_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  else
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := least(new.updated_at, clock_timestamp() + interval '5 minutes');
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger products_sync_metadata before insert or update on public.products
for each row execute function public.set_private_sync_metadata();
create trigger meals_sync_metadata before insert or update on public.meals
for each row execute function public.set_private_sync_metadata();
create trigger day_plans_sync_metadata before insert or update on public.day_plans
for each row execute function public.set_private_sync_metadata();
create trigger user_settings_sync_metadata before insert or update on public.user_settings
for each row execute function public.set_private_sync_metadata();
create trigger shopping_checks_sync_metadata before insert or update on public.shopping_checks
for each row execute function public.set_private_sync_metadata();
create trigger global_products_sync_metadata before insert or update on public.global_products
for each row execute function public.set_global_product_sync_metadata();

create index products_user_server_updated_idx on public.products (user_id, server_updated_at);
create index meals_user_server_updated_idx on public.meals (user_id, server_updated_at);
create index day_plans_user_server_updated_idx on public.day_plans (user_id, server_updated_at);
create index user_settings_user_server_updated_idx on public.user_settings (user_id, server_updated_at);
create index shopping_checks_user_server_updated_idx on public.shopping_checks (user_id, server_updated_at);
create index global_products_server_updated_idx on public.global_products (server_updated_at);

alter table public.global_products enable row level security;
alter table public.products enable row level security;
alter table public.meals enable row level security;
alter table public.day_plans enable row level security;
alter table public.user_settings enable row level security;
alter table public.shopping_checks enable row level security;

create policy global_products_select on public.global_products
for select to authenticated using (true);

create policy products_select on public.products for select to authenticated
using ((select auth.uid()) = user_id);
create policy products_insert on public.products for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy products_update on public.products for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy products_delete on public.products for delete to authenticated
using ((select auth.uid()) = user_id);

create policy meals_select on public.meals for select to authenticated
using ((select auth.uid()) = user_id);
create policy meals_insert on public.meals for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy meals_update on public.meals for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_delete on public.meals for delete to authenticated
using ((select auth.uid()) = user_id);

create policy day_plans_select on public.day_plans for select to authenticated
using ((select auth.uid()) = user_id);
create policy day_plans_insert on public.day_plans for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy day_plans_update on public.day_plans for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy day_plans_delete on public.day_plans for delete to authenticated
using ((select auth.uid()) = user_id);

create policy user_settings_select on public.user_settings for select to authenticated
using ((select auth.uid()) = user_id);
create policy user_settings_insert on public.user_settings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy user_settings_update on public.user_settings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_settings_delete on public.user_settings for delete to authenticated
using ((select auth.uid()) = user_id);

create policy shopping_checks_select on public.shopping_checks for select to authenticated
using ((select auth.uid()) = user_id);
create policy shopping_checks_insert on public.shopping_checks for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy shopping_checks_update on public.shopping_checks for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy shopping_checks_delete on public.shopping_checks for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.global_products, public.products, public.meals,
  public.day_plans, public.user_settings, public.shopping_checks from anon;
revoke all on table public.global_products from authenticated;
grant select on table public.global_products to authenticated;
grant select, insert, update, delete on table public.products, public.meals,
  public.day_plans, public.user_settings, public.shopping_checks to authenticated;
