create table public.user_review_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_review_preferences enable row level security;

revoke all on public.user_review_preferences from anon, authenticated;
grant select, insert, update, delete on public.user_review_preferences to service_role;
