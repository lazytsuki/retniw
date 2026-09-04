create or replace function public.retniw_guard_thought_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user_id uuid;
  target_thought_id uuid;
begin
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  target_thought_id := case when tg_op = 'DELETE' then old.id else new.id end;

  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_thought_id::text, 0)
  );

  if tg_op = 'INSERT' then
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
    return new;
  end if;

  insert into public.deleted_thought_tombstones (user_id, thought_id)
  values (target_user_id, target_thought_id)
  on conflict (user_id, thought_id) do nothing;
  return old;
end;
$$;

revoke all on function public.retniw_guard_thought_identity() from public, anon, authenticated;

create trigger retniw_guard_thought_identity
before insert or delete on public.thoughts
for each row execute function public.retniw_guard_thought_identity();
