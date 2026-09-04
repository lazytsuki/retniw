create table public.deleted_thought_tombstones (
  user_id uuid not null references auth.users (id) on delete cascade,
  thought_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, thought_id)
);

alter table public.deleted_thought_tombstones enable row level security;

revoke all on public.deleted_thought_tombstones from anon, authenticated;
grant select, insert, update, delete on public.deleted_thought_tombstones to service_role;

create or replace function public.retniw_ensure_thought(
  target_user_id uuid,
  target_thought_id uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  stored_thought public.thoughts%rowtype;
  inserted_count integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_thought_id::text, 0)
  );

  if exists (
    select 1
      from public.deleted_thought_tombstones
     where user_id = target_user_id
       and thought_id = target_thought_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_THOUGHT_DELETED';
  end if;

  insert into public.thoughts (id, user_id)
  values (target_thought_id, target_user_id)
  on conflict (id) do nothing
  returning * into stored_thought;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select *
      into stored_thought
      from public.thoughts
     where user_id = target_user_id
       and id = target_thought_id;
  end if;

  if stored_thought.id is null or stored_thought.deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_THOUGHT_DELETED';
  end if;

  return jsonb_build_object(
    'thought', to_jsonb(stored_thought),
    'created', inserted_count = 1
  );
end;
$$;

create or replace function public.retniw_delete_thought(
  target_user_id uuid,
  target_thought_id uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  owned_thought_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_thought_id::text, 0)
  );

  select id
    into owned_thought_id
    from public.thoughts
   where user_id = target_user_id
     and id = target_thought_id
     and deleted_at is null
   for update;

  if owned_thought_id is null then
    return false;
  end if;

  insert into public.deleted_thought_tombstones (user_id, thought_id)
  values (target_user_id, target_thought_id)
  on conflict (user_id, thought_id) do nothing;

  delete from public.thoughts
   where user_id = target_user_id
     and id = target_thought_id
     and deleted_at is null;

  return found;
end;
$$;

revoke all on function public.retniw_ensure_thought(uuid, uuid) from public, anon, authenticated;
revoke all on function public.retniw_delete_thought(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retniw_ensure_thought(uuid, uuid) to service_role;
grant execute on function public.retniw_delete_thought(uuid, uuid) to service_role;
