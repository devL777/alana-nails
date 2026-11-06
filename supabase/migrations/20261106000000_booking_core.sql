-- Alana Nails booking database.
-- Customer booking is passwordless. Only Alana's admin account may read customer data.

create extension if not exists btree_gist;

create table if not exists public.studio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_services (
  id text primary key,
  name text not null,
  detail text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes between 30 and 480),
  price numeric(10,2) not null default 0 check (price >= 0),
  symbol text not null default '',
  active boolean not null default true,
  display_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  enabled boolean not null default false,
  opens_at time,
  closes_at time,
  break_starts_at time,
  break_ends_at time,
  check (not enabled or (opens_at is not null and closes_at is not null and opens_at < closes_at)),
  check ((break_starts_at is null and break_ends_at is null) or
         (break_starts_at is not null and break_ends_at is not null and break_starts_at < break_ends_at))
);

create table if not exists public.blocked_dates (
  blocked_date date primary key,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.studio_settings (
  singleton boolean primary key default true check (singleton),
  deposit_percent smallint not null default 30 check (deposit_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  email text not null check (char_length(email) between 5 and 254),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists clients_email_lower_unique on public.clients (lower(email));

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  service_id text not null references public.studio_services(id),
  service_name text not null,
  service_price numeric(10,2) not null check (service_price >= 0),
  duration_minutes integer not null check (duration_minutes between 30 and 480),
  appointment_date date not null,
  starts_at time not null,
  notes text not null default '' check (char_length(notes) <= 280),
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'cancelado')),
  created_at timestamptz not null default now(),
  appointment_range tsrange generated always as (
    tsrange(appointment_date + starts_at,
            appointment_date + starts_at + make_interval(mins => duration_minutes), '[)')
  ) stored
);
alter table public.appointments
  drop constraint if exists appointments_no_overlapping_active;
alter table public.appointments
  add constraint appointments_no_overlapping_active
  exclude using gist (appointment_range with &&)
  where (status in ('pendente', 'confirmado'));

create or replace function public.is_studio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.studio_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_studio_admin() from public, anon;
grant execute on function public.is_studio_admin() to authenticated;

alter table public.studio_admins enable row level security;
alter table public.studio_services enable row level security;
alter table public.studio_hours enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.studio_settings enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "admins manage studio admins" on public.studio_admins;
create policy "admins manage studio admins" on public.studio_admins
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

drop policy if exists "public read active services" on public.studio_services;
create policy "public read active services" on public.studio_services
  for select to anon, authenticated using (active);
drop policy if exists "admins manage services" on public.studio_services;
create policy "admins manage services" on public.studio_services
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

drop policy if exists "public read opening hours" on public.studio_hours;
create policy "public read opening hours" on public.studio_hours
  for select to anon, authenticated using (true);
drop policy if exists "admins manage opening hours" on public.studio_hours;
create policy "admins manage opening hours" on public.studio_hours
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

drop policy if exists "public read blocked dates" on public.blocked_dates;
create policy "public read blocked dates" on public.blocked_dates
  for select to anon, authenticated using (true);
drop policy if exists "admins manage blocked dates" on public.blocked_dates;
create policy "admins manage blocked dates" on public.blocked_dates
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

drop policy if exists "public read studio settings" on public.studio_settings;
create policy "public read studio settings" on public.studio_settings
  for select to anon, authenticated using (true);
drop policy if exists "admins manage studio settings" on public.studio_settings;
create policy "admins manage studio settings" on public.studio_settings
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

drop policy if exists "admins manage clients" on public.clients;
create policy "admins manage clients" on public.clients
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());
drop policy if exists "admins manage appointments" on public.appointments;
create policy "admins manage appointments" on public.appointments
  for all to authenticated using (public.is_studio_admin()) with check (public.is_studio_admin());

grant select on public.studio_services, public.studio_hours, public.blocked_dates, public.studio_settings to anon, authenticated;
grant select, insert, update, delete on public.studio_admins, public.clients, public.appointments to authenticated;
grant insert, update, delete on public.studio_services, public.studio_hours, public.blocked_dates, public.studio_settings to authenticated;

create or replace function public.create_public_appointment(
  p_service_id text,
  p_date date,
  p_time time,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default ''
)
returns table (appointment_id uuid, appointment_date date, starts_at time, service_name text, booking_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.studio_services%rowtype;
  v_hours public.studio_hours%rowtype;
  v_client_id uuid;
  v_appointment_id uuid;
  v_end_time time;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 80 then
    raise exception 'Informe seu nome completo.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_email, ''))) not between 5 and 254 or btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10,11}$' then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 280 then
    raise exception 'As observações passaram do limite.' using errcode = '22023';
  end if;
  if p_date < (now() at time zone 'America/Sao_Paulo')::date or extract(isodow from p_date) not between 1 and 7 then
    raise exception 'Data indisponível.' using errcode = '22023';
  end if;
  if extract(minute from p_time)::integer % 30 <> 0 or extract(second from p_time) <> 0 then
    raise exception 'Horário indisponível.' using errcode = '22023';
  end if;

  -- Serialize new appointments for the same day so simultaneous requests cannot take overlapping times.
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select * into v_service from public.studio_services where id = p_service_id and active;
  if not found or v_service.duration_minutes is null then
    raise exception 'Serviço indisponível.' using errcode = '22023';
  end if;
  select * into v_hours from public.studio_hours where weekday = extract(dow from p_date)::smallint and enabled;
  if not found or p_time < v_hours.opens_at or p_time + make_interval(mins => v_service.duration_minutes) > v_hours.closes_at then
    raise exception 'Horário indisponível.' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocked_dates where blocked_date = p_date) then
    raise exception 'Data indisponível.' using errcode = '22023';
  end if;
  if v_hours.break_starts_at is not null and
     tsrange(p_date + p_time, p_date + p_time + make_interval(mins => v_service.duration_minutes), '[)') &&
     tsrange(p_date + v_hours.break_starts_at, p_date + v_hours.break_ends_at, '[)') then
    raise exception 'Horário indisponível.' using errcode = '22023';
  end if;
  if p_date = (now() at time zone 'America/Sao_Paulo')::date and
     p_time <= ((now() at time zone 'America/Sao_Paulo')::time + interval '1 hour') then
    raise exception 'Horário indisponível.' using errcode = '22023';
  end if;
  v_end_time := p_time + make_interval(mins => v_service.duration_minutes);
  if exists (
    select 1 from public.appointments a
    where a.appointment_date = p_date and a.status in ('pendente', 'confirmado')
      and tsrange(p_date + a.starts_at, p_date + a.starts_at + make_interval(mins => a.duration_minutes), '[)')
          && tsrange(p_date + p_time, p_date + v_end_time, '[)')
  ) then
    raise exception 'Horário indisponível.' using errcode = '23P01';
  end if;

  insert into public.clients (name, email, phone)
  values (btrim(p_name), lower(btrim(p_email)), p_phone)
  on conflict (lower(email)) do update
    set name = excluded.name, phone = excluded.phone, updated_at = now()
  returning id into v_client_id;

  insert into public.appointments (
    client_id, service_id, service_name, service_price, duration_minutes,
    appointment_date, starts_at, notes
  ) values (
    v_client_id, v_service.id, v_service.name, v_service.price, v_service.duration_minutes,
    p_date, p_time, coalesce(btrim(p_notes), '')
  ) returning id into v_appointment_id;

  return query select v_appointment_id, p_date, p_time, v_service.name, 'pendente'::text;
end;
$$;
revoke all on function public.create_public_appointment(text, date, time, text, text, text, text) from public;
grant execute on function public.create_public_appointment(text, date, time, text, text, text, text) to anon, authenticated;

create or replace function public.get_public_busy_slots(p_date date)
returns table (service_id text, starts_at time, duration_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  select a.service_id, a.starts_at, a.duration_minutes
  from public.appointments a
  where a.appointment_date = p_date and a.status in ('pendente', 'confirmado')
  order by a.starts_at;
$$;
revoke all on function public.get_public_busy_slots(date) from public;
grant execute on function public.get_public_busy_slots(date) to anon, authenticated;

insert into public.studio_settings (singleton, deposit_percent) values (true, 30)
on conflict (singleton) do nothing;

insert into public.studio_services (id, name, detail, duration_minutes, price, symbol, active, display_order)
values
  ('banho-gel', 'Banho de gel', 'Resistência e acabamento delicado', null, 100, '01', true, 1),
  ('molde-f1', 'Molde F1', 'Alongamento com molde F1', null, 130, '02', true, 2),
  ('fibra-vidro', 'Fibra de vidro', 'Alongamento em fibra de vidro', null, 140, '03', true, 3),
  ('esmaltacao-gel', 'Esmaltação em gel', 'Cor e brilho com esmaltação em gel', null, 50, '04', true, 4),
  ('nail-art', 'Nail art', 'Decoração personalizada para suas unhas', null, 145, '05', true, 5)
on conflict (id) do nothing;
