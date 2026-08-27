create unique index if not exists thoughts_user_id_id_unique_idx
  on public.thoughts (user_id, id);

create unique index if not exists thought_connections_user_id_id_unique_idx
  on public.thought_connections (user_id, id);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  occurred_at timestamptz not null default now(),
  event_day date generated always as (
    (occurred_at at time zone 'Asia/Shanghai')::date
  ) stored,
  client_request_id uuid,
  thought_id uuid,
  connection_id uuid,
  scan_status text,
  created_count smallint,
  constraint product_events_thought_owner_fk
    foreign key (user_id, thought_id)
    references public.thoughts (user_id, id)
    on delete cascade,
  constraint product_events_connection_owner_fk
    foreign key (user_id, connection_id)
    references public.thought_connections (user_id, id)
    on delete cascade,
  constraint product_events_shape_check check (
    (
      event_name in ('workspace_active_day', 'review_opened')
      and client_request_id is null
      and thought_id is null
      and connection_id is null
      and scan_status is null
      and created_count is null
    )
    or
    (
      event_name = 'review_scan_finished'
      and client_request_id is not null
      and thought_id is null
      and connection_id is null
      and scan_status is not null
      and scan_status in (
        'disabled',
        'not-enough-content',
        'processed',
        'provider-failed',
        'persistence-failed'
      )
      and created_count is not null
      and created_count between 0 and 3
    )
    or
    (
      event_name = 'connection_opened'
      and client_request_id is not null
      and thought_id is not null
      and connection_id is not null
      and scan_status is null
      and created_count is null
    )
  )
);

create unique index product_events_daily_unique
  on public.product_events (user_id, event_name, event_day)
  where event_name in ('workspace_active_day', 'review_opened');

create unique index product_events_request_unique
  on public.product_events (user_id, event_name, client_request_id)
  where client_request_id is not null;

create index product_events_name_time_idx
  on public.product_events (event_name, occurred_at asc, user_id);

alter table public.product_events enable row level security;

revoke all on public.product_events from anon, authenticated;
grant select, insert, delete on public.product_events to service_role;
