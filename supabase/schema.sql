--
-- PostgreSQL database dump
--

\restrict WOo8BvBdQPAfxmHPVNfQasrjJl9dC5tNoQd8uaHiwRdBFQf6Hpy1wnxU10gcaSD

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: retniw_delete_thought(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_delete_thought(target_user_id uuid, target_thought_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: retniw_ensure_thought(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_ensure_thought(target_user_id uuid, target_thought_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: retniw_ensure_token_thought(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_ensure_token_thought(target_user_id uuid, target_token_id uuid, target_thought_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: retniw_guard_thought_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_guard_thought_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

  if exists (select 1 from auth.users where id = target_user_id) then
    insert into public.deleted_thought_tombstones (user_id, thought_id)
    values (target_user_id, target_thought_id)
    on conflict (user_id, thought_id) do nothing;
  end if;
  return old;
end;
$$;


--
-- Name: retniw_lock_writable_connection_thoughts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_lock_writable_connection_thoughts() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: retniw_lock_writable_thought(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retniw_lock_writable_thought() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clarifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clarifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fragment_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clarifications_answer_length CHECK (((answer IS NULL) OR ((char_length(btrim(answer)) >= 1) AND (char_length(btrim(answer)) <= 10000)))),
    CONSTRAINT clarifications_answer_state CHECK ((((answer IS NULL) AND (answered_at IS NULL)) OR ((answer IS NOT NULL) AND (answered_at IS NOT NULL)))),
    CONSTRAINT clarifications_question_length CHECK (((char_length(btrim(question)) >= 1) AND (char_length(btrim(question)) <= 1000)))
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_fragment_id uuid NOT NULL,
    target_fragment_id uuid NOT NULL,
    rationale text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connections_decision_state CHECK ((((status = 'pending'::text) AND (decided_at IS NULL)) OR ((status = ANY (ARRAY['confirmed'::text, 'rejected'::text])) AND (decided_at IS NOT NULL)))),
    CONSTRAINT connections_distinct_fragments CHECK ((source_fragment_id < target_fragment_id)),
    CONSTRAINT connections_rationale_length CHECK (((char_length(btrim(rationale)) >= 1) AND (char_length(btrim(rationale)) <= 1000))),
    CONSTRAINT connections_status CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: deleted_thought_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_thought_tombstones (
    user_id uuid NOT NULL,
    thought_id uuid NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thought_id uuid NOT NULL,
    client_request_id uuid NOT NULL,
    entry_type text NOT NULL,
    content text NOT NULL,
    source_label text,
    ai_action text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    review_checked_at timestamp with time zone,
    CONSTRAINT entries_ai_action_check CHECK ((((entry_type = 'ai'::text) AND (ai_action = ANY (ARRAY['advance'::text, 'question'::text, 'organize'::text]))) OR ((entry_type <> 'ai'::text) AND (ai_action IS NULL)))),
    CONSTRAINT entries_content_length CHECK (((char_length(btrim(content)) >= 1) AND (char_length(btrim(content)) <= 1000000))),
    CONSTRAINT entries_source_label_length CHECK (((source_label IS NULL) OR ((char_length(source_label) >= 1) AND (char_length(source_label) <= 255)))),
    CONSTRAINT entries_type_check CHECK ((entry_type = ANY (ARRAY['user'::text, 'import'::text, 'ai'::text])))
);


--
-- Name: fragments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fragments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_request_id uuid NOT NULL,
    content text NOT NULL,
    input_mode text NOT NULL,
    reconnect_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fragments_content_length CHECK (((char_length(btrim(content)) >= 1) AND (char_length(btrim(content)) <= 10000))),
    CONSTRAINT fragments_input_mode CHECK ((input_mode = ANY (ARRAY['text'::text, 'voice'::text])))
);


--
-- Name: personal_access_token_thoughts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_access_token_thoughts (
    token_id uuid NOT NULL,
    thought_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: personal_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_access_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT personal_access_tokens_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40))),
    CONSTRAINT personal_access_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: product_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_name text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_day date GENERATED ALWAYS AS (((occurred_at AT TIME ZONE 'Asia/Shanghai'::text))::date) STORED,
    client_request_id uuid,
    thought_id uuid,
    connection_id uuid,
    scan_status text,
    created_count smallint,
    CONSTRAINT product_events_shape_check CHECK ((((event_name = ANY (ARRAY['workspace_active_day'::text, 'review_opened'::text])) AND (client_request_id IS NULL) AND (thought_id IS NULL) AND (connection_id IS NULL) AND (scan_status IS NULL) AND (created_count IS NULL)) OR ((event_name = 'review_scan_finished'::text) AND (client_request_id IS NOT NULL) AND (thought_id IS NULL) AND (connection_id IS NULL) AND (scan_status IS NOT NULL) AND (scan_status = ANY (ARRAY['disabled'::text, 'not-enough-content'::text, 'processed'::text, 'provider-failed'::text, 'persistence-failed'::text])) AND (created_count IS NOT NULL) AND ((created_count >= 0) AND (created_count <= 3))) OR ((event_name = 'connection_opened'::text) AND (client_request_id IS NOT NULL) AND (thought_id IS NOT NULL) AND (connection_id IS NOT NULL) AND (scan_status IS NULL) AND (created_count IS NULL))))
);


--
-- Name: thought_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thought_checkpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thought_id uuid NOT NULL,
    client_request_id uuid NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thought_checkpoints_note_length CHECK (((char_length(note) >= 0) AND (char_length(note) <= 500)))
);


--
-- Name: thought_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thought_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thought_collections_name_length CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
);


--
-- Name: thought_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thought_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_thought_id uuid NOT NULL,
    target_thought_id uuid NOT NULL,
    source_entry_id uuid NOT NULL,
    target_entry_id uuid NOT NULL,
    rationale text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thought_connections_decision_state CHECK ((((status = 'pending'::text) AND (decided_at IS NULL)) OR ((status = ANY (ARRAY['confirmed'::text, 'rejected'::text])) AND (decided_at IS NOT NULL)))),
    CONSTRAINT thought_connections_distinct_thoughts CHECK ((source_thought_id < target_thought_id)),
    CONSTRAINT thought_connections_rationale_length CHECK (((char_length(btrim(rationale)) >= 1) AND (char_length(btrim(rationale)) <= 1000))),
    CONSTRAINT thought_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: thoughts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thoughts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    relation_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    collection_id uuid,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    summary_content text,
    summary_entry_type text,
    summary_source_label text,
    CONSTRAINT thoughts_relation_check_order CHECK (((relation_checked_at IS NULL) OR (relation_checked_at >= created_at))),
    CONSTRAINT thoughts_summary_content_length CHECK (((summary_content IS NULL) OR ((char_length(summary_content) >= 1) AND (char_length(summary_content) <= 500)))),
    CONSTRAINT thoughts_summary_entry_type_check CHECK (((summary_entry_type IS NULL) OR (summary_entry_type = ANY (ARRAY['user'::text, 'import'::text, 'ai'::text])))),
    CONSTRAINT thoughts_summary_source_length CHECK (((summary_source_label IS NULL) OR ((char_length(summary_source_label) >= 1) AND (char_length(summary_source_label) <= 255))))
);


--
-- Name: user_review_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_review_preferences (
    user_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clarifications clarifications_fragment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarifications
    ADD CONSTRAINT clarifications_fragment_id_key UNIQUE (fragment_id);


--
-- Name: clarifications clarifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarifications
    ADD CONSTRAINT clarifications_pkey PRIMARY KEY (id);


--
-- Name: connections connections_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pair_unique UNIQUE (user_id, source_fragment_id, target_fragment_id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: deleted_thought_tombstones deleted_thought_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_thought_tombstones
    ADD CONSTRAINT deleted_thought_tombstones_pkey PRIMARY KEY (user_id, thought_id);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);


--
-- Name: entries entries_user_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_user_id_id_unique UNIQUE (user_id, id);


--
-- Name: entries entries_user_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_user_request_unique UNIQUE (user_id, client_request_id);


--
-- Name: entries entries_user_thought_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_user_thought_id_unique UNIQUE (user_id, thought_id, id);


--
-- Name: fragments fragments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_pkey PRIMARY KEY (id);


--
-- Name: fragments fragments_user_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_user_id_id_unique UNIQUE (user_id, id);


--
-- Name: fragments fragments_user_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_user_request_unique UNIQUE (user_id, client_request_id);


--
-- Name: personal_access_token_thoughts personal_access_token_thoughts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_token_thoughts
    ADD CONSTRAINT personal_access_token_thoughts_pkey PRIMARY KEY (token_id, thought_id);


--
-- Name: personal_access_tokens personal_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: personal_access_tokens personal_access_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: product_events product_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_pkey PRIMARY KEY (id);


--
-- Name: thought_checkpoints thought_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_checkpoints
    ADD CONSTRAINT thought_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: thought_checkpoints thought_checkpoints_user_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_checkpoints
    ADD CONSTRAINT thought_checkpoints_user_request_unique UNIQUE (user_id, client_request_id);


--
-- Name: thought_collections thought_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_collections
    ADD CONSTRAINT thought_collections_pkey PRIMARY KEY (id);


--
-- Name: thought_collections thought_collections_user_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_collections
    ADD CONSTRAINT thought_collections_user_id_id_unique UNIQUE (user_id, id);


--
-- Name: thought_collections thought_collections_user_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_collections
    ADD CONSTRAINT thought_collections_user_name_unique UNIQUE (user_id, name);


--
-- Name: thought_connections thought_connections_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_pair_unique UNIQUE (user_id, source_thought_id, target_thought_id);


--
-- Name: thought_connections thought_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_pkey PRIMARY KEY (id);


--
-- Name: thoughts thoughts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thoughts
    ADD CONSTRAINT thoughts_pkey PRIMARY KEY (id);


--
-- Name: thoughts thoughts_user_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thoughts
    ADD CONSTRAINT thoughts_user_id_id_unique UNIQUE (user_id, id);


--
-- Name: user_review_preferences user_review_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_review_preferences
    ADD CONSTRAINT user_review_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: connections_user_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_user_status_created_idx ON public.connections USING btree (user_id, status, created_at DESC);


--
-- Name: connections_user_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_user_target_idx ON public.connections USING btree (user_id, target_fragment_id);


--
-- Name: entries_user_thought_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entries_user_thought_created_idx ON public.entries USING btree (user_id, thought_id, created_at, id);


--
-- Name: fragments_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fragments_user_created_idx ON public.fragments USING btree (user_id, created_at DESC, id DESC);


--
-- Name: personal_access_token_thoughts_thought_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_access_token_thoughts_thought_idx ON public.personal_access_token_thoughts USING btree (thought_id);


--
-- Name: personal_access_tokens_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_access_tokens_user_created_idx ON public.personal_access_tokens USING btree (user_id, created_at DESC);


--
-- Name: product_events_daily_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_events_daily_unique ON public.product_events USING btree (user_id, event_name, event_day) WHERE (event_name = ANY (ARRAY['workspace_active_day'::text, 'review_opened'::text]));


--
-- Name: product_events_name_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_events_name_time_idx ON public.product_events USING btree (event_name, occurred_at, user_id);


--
-- Name: product_events_request_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_events_request_unique ON public.product_events USING btree (user_id, event_name, client_request_id) WHERE (client_request_id IS NOT NULL);


--
-- Name: thought_checkpoints_user_thought_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thought_checkpoints_user_thought_created_idx ON public.thought_checkpoints USING btree (user_id, thought_id, created_at, id);


--
-- Name: thought_collections_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thought_collections_user_created_idx ON public.thought_collections USING btree (user_id, created_at, id);


--
-- Name: thought_connections_user_id_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX thought_connections_user_id_id_unique_idx ON public.thought_connections USING btree (user_id, id);


--
-- Name: thought_connections_user_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thought_connections_user_status_created_idx ON public.thought_connections USING btree (user_id, status, created_at DESC);


--
-- Name: thought_connections_user_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thought_connections_user_target_idx ON public.thought_connections USING btree (user_id, target_thought_id);


--
-- Name: thoughts_user_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thoughts_user_activity_idx ON public.thoughts USING btree (user_id, last_activity_at DESC, id DESC);


--
-- Name: thoughts_user_collection_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thoughts_user_collection_activity_idx ON public.thoughts USING btree (user_id, collection_id, last_activity_at DESC, id DESC);


--
-- Name: thoughts_user_id_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX thoughts_user_id_id_unique_idx ON public.thoughts USING btree (user_id, id);


--
-- Name: thoughts_user_state_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thoughts_user_state_activity_idx ON public.thoughts USING btree (user_id, deleted_at, archived_at, last_activity_at DESC, id DESC);


--
-- Name: thought_checkpoints checkpoints_lock_writable_thought; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER checkpoints_lock_writable_thought BEFORE INSERT OR UPDATE OF user_id, thought_id ON public.thought_checkpoints FOR EACH ROW EXECUTE FUNCTION public.retniw_lock_writable_thought();


--
-- Name: thought_connections connections_lock_writable_thoughts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER connections_lock_writable_thoughts BEFORE INSERT OR UPDATE ON public.thought_connections FOR EACH ROW EXECUTE FUNCTION public.retniw_lock_writable_connection_thoughts();


--
-- Name: entries entries_lock_writable_thought; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER entries_lock_writable_thought BEFORE INSERT OR UPDATE OF user_id, thought_id ON public.entries FOR EACH ROW EXECUTE FUNCTION public.retniw_lock_writable_thought();


--
-- Name: thoughts retniw_guard_thought_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER retniw_guard_thought_identity BEFORE INSERT OR DELETE ON public.thoughts FOR EACH ROW EXECUTE FUNCTION public.retniw_guard_thought_identity();


--
-- Name: clarifications clarifications_fragment_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarifications
    ADD CONSTRAINT clarifications_fragment_owner_fk FOREIGN KEY (user_id, fragment_id) REFERENCES public.fragments(user_id, id) ON DELETE CASCADE;


--
-- Name: clarifications clarifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarifications
    ADD CONSTRAINT clarifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: connections connections_source_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_source_owner_fk FOREIGN KEY (user_id, source_fragment_id) REFERENCES public.fragments(user_id, id) ON DELETE CASCADE;


--
-- Name: connections connections_target_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_target_owner_fk FOREIGN KEY (user_id, target_fragment_id) REFERENCES public.fragments(user_id, id) ON DELETE CASCADE;


--
-- Name: connections connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: deleted_thought_tombstones deleted_thought_tombstones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_thought_tombstones
    ADD CONSTRAINT deleted_thought_tombstones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entries entries_thought_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_thought_owner_fk FOREIGN KEY (user_id, thought_id) REFERENCES public.thoughts(user_id, id) ON DELETE CASCADE;


--
-- Name: entries entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entries
    ADD CONSTRAINT entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fragments fragments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fragments
    ADD CONSTRAINT fragments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personal_access_token_thoughts personal_access_token_thoughts_thought_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_token_thoughts
    ADD CONSTRAINT personal_access_token_thoughts_thought_id_fkey FOREIGN KEY (thought_id) REFERENCES public.thoughts(id) ON DELETE CASCADE;


--
-- Name: personal_access_token_thoughts personal_access_token_thoughts_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_token_thoughts
    ADD CONSTRAINT personal_access_token_thoughts_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.personal_access_tokens(id) ON DELETE CASCADE;


--
-- Name: personal_access_token_thoughts personal_access_token_thoughts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_token_thoughts
    ADD CONSTRAINT personal_access_token_thoughts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personal_access_tokens personal_access_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_events product_events_connection_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_connection_owner_fk FOREIGN KEY (user_id, connection_id) REFERENCES public.thought_connections(user_id, id) ON DELETE CASCADE;


--
-- Name: product_events product_events_thought_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_thought_owner_fk FOREIGN KEY (user_id, thought_id) REFERENCES public.thoughts(user_id, id) ON DELETE CASCADE;


--
-- Name: product_events product_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: thought_checkpoints thought_checkpoints_thought_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_checkpoints
    ADD CONSTRAINT thought_checkpoints_thought_owner_fk FOREIGN KEY (user_id, thought_id) REFERENCES public.thoughts(user_id, id) ON DELETE CASCADE;


--
-- Name: thought_checkpoints thought_checkpoints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_checkpoints
    ADD CONSTRAINT thought_checkpoints_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: thought_collections thought_collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_collections
    ADD CONSTRAINT thought_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: thought_connections thought_connections_source_entry_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_source_entry_owner_fk FOREIGN KEY (user_id, source_thought_id, source_entry_id) REFERENCES public.entries(user_id, thought_id, id) ON DELETE CASCADE;


--
-- Name: thought_connections thought_connections_source_thought_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_source_thought_owner_fk FOREIGN KEY (user_id, source_thought_id) REFERENCES public.thoughts(user_id, id) ON DELETE CASCADE;


--
-- Name: thought_connections thought_connections_target_entry_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_target_entry_owner_fk FOREIGN KEY (user_id, target_thought_id, target_entry_id) REFERENCES public.entries(user_id, thought_id, id) ON DELETE CASCADE;


--
-- Name: thought_connections thought_connections_target_thought_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_target_thought_owner_fk FOREIGN KEY (user_id, target_thought_id) REFERENCES public.thoughts(user_id, id) ON DELETE CASCADE;


--
-- Name: thought_connections thought_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thought_connections
    ADD CONSTRAINT thought_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: thoughts thoughts_collection_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thoughts
    ADD CONSTRAINT thoughts_collection_owner_fk FOREIGN KEY (user_id, collection_id) REFERENCES public.thought_collections(user_id, id) ON DELETE SET NULL (collection_id);


--
-- Name: thoughts thoughts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thoughts
    ADD CONSTRAINT thoughts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_review_preferences user_review_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_review_preferences
    ADD CONSTRAINT user_review_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: clarifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clarifications ENABLE ROW LEVEL SECURITY;

--
-- Name: connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

--
-- Name: deleted_thought_tombstones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deleted_thought_tombstones ENABLE ROW LEVEL SECURITY;

--
-- Name: entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

--
-- Name: fragments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fragments ENABLE ROW LEVEL SECURITY;

--
-- Name: personal_access_token_thoughts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personal_access_token_thoughts ENABLE ROW LEVEL SECURITY;

--
-- Name: personal_access_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: product_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

--
-- Name: thought_checkpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.thought_checkpoints ENABLE ROW LEVEL SECURITY;

--
-- Name: thought_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.thought_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: thought_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.thought_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: thoughts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.thoughts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_review_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_review_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION retniw_delete_thought(target_user_id uuid, target_thought_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retniw_delete_thought(target_user_id uuid, target_thought_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retniw_delete_thought(target_user_id uuid, target_thought_id uuid) TO service_role;


--
-- Name: FUNCTION retniw_ensure_thought(target_user_id uuid, target_thought_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retniw_ensure_thought(target_user_id uuid, target_thought_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retniw_ensure_thought(target_user_id uuid, target_thought_id uuid) TO service_role;


--
-- Name: FUNCTION retniw_ensure_token_thought(target_user_id uuid, target_token_id uuid, target_thought_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retniw_ensure_token_thought(target_user_id uuid, target_token_id uuid, target_thought_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retniw_ensure_token_thought(target_user_id uuid, target_token_id uuid, target_thought_id uuid) TO service_role;


--
-- Name: FUNCTION retniw_guard_thought_identity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retniw_guard_thought_identity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.retniw_guard_thought_identity() TO service_role;


--
-- Name: FUNCTION retniw_lock_writable_connection_thoughts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.retniw_lock_writable_connection_thoughts() TO anon;
GRANT ALL ON FUNCTION public.retniw_lock_writable_connection_thoughts() TO authenticated;
GRANT ALL ON FUNCTION public.retniw_lock_writable_connection_thoughts() TO service_role;


--
-- Name: FUNCTION retniw_lock_writable_thought(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.retniw_lock_writable_thought() TO anon;
GRANT ALL ON FUNCTION public.retniw_lock_writable_thought() TO authenticated;
GRANT ALL ON FUNCTION public.retniw_lock_writable_thought() TO service_role;


--
-- Name: TABLE clarifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clarifications TO anon;
GRANT ALL ON TABLE public.clarifications TO authenticated;
GRANT ALL ON TABLE public.clarifications TO service_role;


--
-- Name: TABLE connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.connections TO anon;
GRANT ALL ON TABLE public.connections TO authenticated;
GRANT ALL ON TABLE public.connections TO service_role;


--
-- Name: TABLE deleted_thought_tombstones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.deleted_thought_tombstones TO service_role;


--
-- Name: TABLE entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entries TO anon;
GRANT ALL ON TABLE public.entries TO authenticated;
GRANT ALL ON TABLE public.entries TO service_role;


--
-- Name: TABLE fragments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fragments TO anon;
GRANT ALL ON TABLE public.fragments TO authenticated;
GRANT ALL ON TABLE public.fragments TO service_role;


--
-- Name: TABLE personal_access_token_thoughts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personal_access_token_thoughts TO service_role;


--
-- Name: TABLE personal_access_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personal_access_tokens TO service_role;


--
-- Name: TABLE product_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_events TO service_role;


--
-- Name: TABLE thought_checkpoints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thought_checkpoints TO service_role;


--
-- Name: TABLE thought_collections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thought_collections TO service_role;


--
-- Name: TABLE thought_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thought_connections TO anon;
GRANT ALL ON TABLE public.thought_connections TO authenticated;
GRANT ALL ON TABLE public.thought_connections TO service_role;


--
-- Name: TABLE thoughts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thoughts TO anon;
GRANT ALL ON TABLE public.thoughts TO authenticated;
GRANT ALL ON TABLE public.thoughts TO service_role;


--
-- Name: TABLE user_review_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_review_preferences TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict WOo8BvBdQPAfxmHPVNfQasrjJl9dC5tNoQd8uaHiwRdBFQf6Hpy1wnxU10gcaSD

