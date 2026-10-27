-- 个人访问令牌：让用户授权的外部工具向自己的账号写入原文。
-- 只新增表与函数，不修改既有表。令牌明文只在创建时返回一次，库里只存 SHA-256。

create table public.personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  revoked_at timestamptz null
);

create index personal_access_tokens_user_created_idx
  on public.personal_access_tokens (user_id, created_at desc);

alter table public.personal_access_tokens enable row level security;
revoke all on public.personal_access_tokens from anon, authenticated;
grant select, insert, update, delete on public.personal_access_tokens to service_role;

-- 令牌创建过的想法：令牌只能向这些想法追加，碰不到用户自己写的想法。
-- 指向 thoughts 的外键随想法物理删除级联清理，符合删除语义。
create table public.personal_access_token_thoughts (
  token_id uuid not null references public.personal_access_tokens (id) on delete cascade,
  thought_id uuid not null references public.thoughts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (token_id, thought_id)
);

create index personal_access_token_thoughts_thought_idx
  on public.personal_access_token_thoughts (thought_id);

alter table public.personal_access_token_thoughts enable row level security;
revoke all on public.personal_access_token_thoughts from anon, authenticated;
grant select, insert, update, delete on public.personal_access_token_thoughts to service_role;

-- 在同一事务里判断归属、确保想法存在并登记归属：
-- 令牌建过的想法可以追加；用户已有（含已删除墓碑）的想法一律拒绝；新ID则创建并登记。
create or replace function public.retniw_ensure_token_thought(
  target_user_id uuid,
  target_token_id uuid,
  target_thought_id uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_thought_id::text, 0)
  );

  if not exists (
    select 1
      from public.personal_access_tokens
     where id = target_token_id
       and user_id = target_user_id
       and revoked_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_TOKEN_REVOKED';
  end if;

  if not exists (
    select 1
      from public.personal_access_token_thoughts
     where token_id = target_token_id
       and thought_id = target_thought_id
  ) and exists (
    select 1
      from public.thoughts
     where id = target_thought_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RETNIW_TOKEN_THOUGHT_FORBIDDEN';
  end if;

  result := public.retniw_ensure_thought(target_user_id, target_thought_id);

  insert into public.personal_access_token_thoughts (token_id, thought_id, user_id)
  values (target_token_id, target_thought_id, target_user_id)
  on conflict (token_id, thought_id) do nothing;

  return result;
end;
$$;

revoke all on function public.retniw_ensure_token_thought(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.retniw_ensure_token_thought(uuid, uuid, uuid) to service_role;
