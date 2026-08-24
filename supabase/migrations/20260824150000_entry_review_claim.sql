alter table public.entries
  add column if not exists review_checked_at timestamptz null;
