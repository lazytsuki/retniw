create table voice_notes (
  id uuid default gen_random_uuid() primary key,
  title text,
  content text not null,
  duration integer default 0,
  created_at timestamptz default now()
);

create index idx_voice_notes_created_at on voice_notes (created_at desc);

alter table voice_notes enable row level security;

create policy "Allow all for anon" on voice_notes
  for all using (true) with check (true);
