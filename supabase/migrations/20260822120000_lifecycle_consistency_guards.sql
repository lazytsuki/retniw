create or replace function public.retniw_lock_writable_thought()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_deleted_at timestamptz;
begin
  select deleted_at
    into parent_deleted_at
    from public.thoughts
   where user_id = new.user_id
     and id = new.thought_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_THOUGHT_NOT_WRITABLE';
  end if;

  if parent_deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_THOUGHT_DELETED';
  end if;

  return new;
end;
$$;

create or replace function public.retniw_lock_writable_connection_thoughts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  locked_thought record;
  locked_count integer := 0;
begin
  for locked_thought in
    select id, deleted_at
      from public.thoughts
     where user_id = new.user_id
       and id in (new.source_thought_id, new.target_thought_id)
     order by id
     for update
  loop
    locked_count := locked_count + 1;
    if locked_thought.deleted_at is not null then
      raise exception using
        errcode = 'P0001',
        message = 'RETNIW_THOUGHT_DELETED';
    end if;
  end loop;

  if locked_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_THOUGHT_NOT_WRITABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists entries_lock_writable_thought on public.entries;
create trigger entries_lock_writable_thought
before insert or update of user_id, thought_id on public.entries
for each row execute function public.retniw_lock_writable_thought();

drop trigger if exists checkpoints_lock_writable_thought on public.thought_checkpoints;
create trigger checkpoints_lock_writable_thought
before insert or update of user_id, thought_id on public.thought_checkpoints
for each row execute function public.retniw_lock_writable_thought();

drop trigger if exists connections_lock_writable_thoughts on public.thought_connections;
create trigger connections_lock_writable_thoughts
before insert or update
on public.thought_connections
for each row execute function public.retniw_lock_writable_connection_thoughts();

update public.thoughts as thought
   set collection_id = null
 where collection_id is not null
   and not exists (
     select 1
       from public.thought_collections as collection
      where collection.user_id = thought.user_id
        and collection.id = thought.collection_id
   );

alter table public.thoughts
  drop constraint if exists thoughts_collection_id_fkey;

alter table public.thoughts
  add constraint thoughts_collection_owner_fk
  foreign key (user_id, collection_id)
  references public.thought_collections (user_id, id)
  on delete set null (collection_id);
