create table public.thought_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thought_collections_user_id_id_unique unique (user_id, id),
  constraint thought_collections_user_name_unique unique (user_id, name),
  constraint thought_collections_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.thought_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thought_id uuid not null,
  client_request_id uuid not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint thought_checkpoints_thought_owner_fk
    foreign key (user_id, thought_id)
    references public.thoughts (user_id, id)
    on delete cascade,
  constraint thought_checkpoints_user_request_unique unique (user_id, client_request_id),
  constraint thought_checkpoints_note_length check (char_length(note) between 0 and 500)
);

alter table public.thoughts
  add column collection_id uuid references public.thought_collections (id) on delete set null,
  add column archived_at timestamptz,
  add column deleted_at timestamptz,
  add column summary_content text,
  add column summary_entry_type text,
  add column summary_source_label text,
  add constraint thoughts_summary_content_length check (
    summary_content is null or char_length(summary_content) between 1 and 500
  ),
  add constraint thoughts_summary_entry_type_check check (
    summary_entry_type is null or summary_entry_type in ('user', 'import', 'ai')
  ),
  add constraint thoughts_summary_source_length check (
    summary_source_label is null or char_length(summary_source_label) between 1 and 255
  );

create index thought_collections_user_created_idx
  on public.thought_collections (user_id, created_at asc, id asc);

create index thought_checkpoints_user_thought_created_idx
  on public.thought_checkpoints (user_id, thought_id, created_at asc, id asc);

create index thoughts_user_state_activity_idx
  on public.thoughts (user_id, deleted_at, archived_at, last_activity_at desc, id desc);

create index thoughts_user_collection_activity_idx
  on public.thoughts (user_id, collection_id, last_activity_at desc, id desc);

alter table public.thought_collections enable row level security;
alter table public.thought_checkpoints enable row level security;

revoke all on public.thought_collections from anon, authenticated;
revoke all on public.thought_checkpoints from anon, authenticated;
grant select, insert, update, delete on public.thought_collections to service_role;
grant select, insert, update, delete on public.thought_checkpoints to service_role;
