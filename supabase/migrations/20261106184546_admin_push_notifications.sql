create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.admin_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.studio_admins(user_id) on delete cascade,
  subscription jsonb not null,
  updated_at timestamptz not null default now(),
  constraint admin_push_subscriptions_subscription_object
    check (
      jsonb_typeof(subscription) = 'object'
      and subscription ->> 'endpoint' = endpoint
      and jsonb_typeof(subscription -> 'keys') = 'object'
    )
);

create index if not exists admin_push_subscriptions_user_id_idx
  on public.admin_push_subscriptions (user_id);

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "admins manage own push subscriptions" on public.admin_push_subscriptions;
create policy "admins manage own push subscriptions"
  on public.admin_push_subscriptions
  for all
  to authenticated
  using (public.is_studio_admin() and user_id = auth.uid())
  with check (public.is_studio_admin() and user_id = auth.uid());

grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;

create or replace function public.notify_admin_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  webhook_url text;
  webhook_secret text;
  subscriptions_payload jsonb;
begin
  if new.status <> 'pendente' then
    return new;
  end if;

  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'alana_push_webhook_url';

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'alana_push_webhook_secret';

  select coalesce(jsonb_agg(subscription), '[]'::jsonb)
  into subscriptions_payload
  from public.admin_push_subscriptions;

  if webhook_url is null or webhook_secret is null or subscriptions_payload = '[]'::jsonb then
    return new;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alana-push-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'appointment', jsonb_build_object(
        'id', new.id,
        'client_name', (select name from public.clients where id = new.client_id),
        'service_name', new.service_name,
        'appointment_date', to_char(new.appointment_date, 'YYYY-MM-DD'),
        'starts_at', to_char(new.starts_at, 'HH24:MI')
      ),
      'subscriptions', subscriptions_payload
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'Could not enqueue Alana Nails appointment notification: %', SQLERRM;
    return new;
end;
$function$;

drop trigger if exists appointments_notify_admin_new_insert on public.appointments;
create trigger appointments_notify_admin_new_insert
  after insert on public.appointments
  for each row
  execute function public.notify_admin_new_appointment();
