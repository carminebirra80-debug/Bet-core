-- Operational traceability v0.1. Additive: no changes to stakes, prices or outcomes.
-- This is not a new statistical model or an automatic model promotion.
create schema if not exists betcore_private;
revoke all on schema betcore_private from public, anon, authenticated;

create table public.betcore_pick_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  pick_id uuid not null,
  operation text not null check (operation in ('BASELINE','INSERT','UPDATE','DELETE')),
  recorded_at timestamptz not null default clock_timestamp(),
  before_row jsonb,
  after_row jsonb,
  actor_id uuid,
  actor_role text not null
);
create index betcore_history_owner_pick on public.betcore_pick_history(user_id,pick_id,recorded_at);
alter table public.betcore_pick_history enable row level security;
revoke all on public.betcore_pick_history from public, anon, authenticated;
grant select on public.betcore_pick_history to authenticated;
create policy history_owner_read on public.betcore_pick_history for select to authenticated
using ((select auth.uid())=user_id);

-- Private SECURITY DEFINER is necessary: clients must not forge or overwrite history.
-- Only the trigger may call this function; no public RPC is exposed.
create function betcore_private.capture_pick_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; actor uuid := auth.uid();
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'picks' then
    raise exception 'Invalid journal target';
  end if;
  owner_id := case when tg_op='DELETE' then old.user_id else new.user_id end;
  if actor is not null and actor <> owner_id then
    raise exception 'Journal owner mismatch';
  end if;
  if actor is null and current_setting('role',true) in ('anon','authenticated') then
    raise exception 'Authenticated journal owner required';
  end if;
  if tg_op='UPDATE' and new.user_id <> old.user_id then
    raise exception 'Pick ownership cannot change';
  end if;
  if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then return new; end if;
  insert into public.betcore_pick_history(user_id,pick_id,operation,before_row,after_row,actor_id,actor_role)
  values(owner_id,case when tg_op='DELETE' then old.id else new.id end,tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    actor,coalesce(nullif(current_setting('role',true),'none'),session_user));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function betcore_private.capture_pick_history() from public,anon,authenticated;
create trigger betcore_journal after insert or update or delete on public.picks
for each row execute function betcore_private.capture_pick_history();

insert into public.betcore_pick_history(user_id,pick_id,operation,after_row,actor_role)
select user_id,id,'BASELINE',to_jsonb(p),'audit-baseline' from public.picks p;

create table public.betcore_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  batch_key text not null,
  event_key text not null,
  market_key text not null,
  phase text not null default 'PRE' check (phase in ('PRE','LIVE','NA')),
  stage text not null check (stage in ('UNIVERSE','BLIND','MARKET','DECISION','RESULT','LEGACY','AUDIT','PROTOCOL')),
  parent_id uuid,
  pick_id uuid,
  kickoff_at timestamptz,
  observed_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  provenance text not null default 'unverified' check (provenance in ('quantitative','subjective','unverified','none')),
  blind_status text not null default 'unknown' check (blind_status in ('clean','contaminated','unknown','not_applicable')),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  idempotency_key text not null,
  unique(user_id,id),
  unique(user_id,idempotency_key),
  foreign key(user_id,parent_id) references public.betcore_snapshots(user_id,id)
);
create index betcore_snapshots_owner_event on public.betcore_snapshots(user_id,event_key,market_key,recorded_at);
create index betcore_snapshots_parent on public.betcore_snapshots(user_id,parent_id);
create index betcore_snapshots_batch on public.betcore_snapshots(user_id,batch_key,stage);
alter table public.betcore_snapshots enable row level security;
revoke all on public.betcore_snapshots from public,anon,authenticated;
grant select,insert on public.betcore_snapshots to authenticated;
create policy snapshots_owner_read on public.betcore_snapshots for select to authenticated
using ((select auth.uid())=user_id);
create policy snapshots_owner_insert on public.betcore_snapshots for insert to authenticated
with check ((select auth.uid())=user_id);

create function betcore_private.validate_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare par public.betcore_snapshots; item record; total numeric := 0; count_values integer := 0;
begin
  if tg_op <> 'INSERT' then raise exception 'Snapshots are append-only; insert a new version'; end if;
  new.recorded_at := clock_timestamp();
  if btrim(new.batch_key)='' or btrim(new.event_key)='' or btrim(new.market_key)='' or btrim(new.idempotency_key)='' then
    raise exception 'Snapshot keys cannot be empty';
  end if;
  if new.stage in ('BLIND','MARKET','DECISION') and new.kickoff_at is null then
    raise exception 'Verified kickoff is required for prospective snapshots';
  end if;
  if new.stage in ('BLIND','MARKET','DECISION') and new.phase='PRE' and new.recorded_at>=new.kickoff_at then
    raise exception 'Cannot backdate a PRE snapshot; use LEGACY';
  end if;
  if new.stage in ('BLIND','MARKET','DECISION','RESULT') and new.observed_at is null then
    raise exception 'Observation time required';
  end if;
  if new.observed_at > new.recorded_at + interval '1 minute' then
    raise exception 'Observation time is in the future';
  end if;
  if new.stage='BLIND' then
    if new.provenance not in ('quantitative','subjective') or new.blind_status not in ('clean','contaminated') then
      raise exception 'Declare model provenance and blind status';
    end if;
    if jsonb_typeof(new.payload->'probabilities') is distinct from 'object'
       or jsonb_typeof(new.payload->'evidence') is distinct from 'array'
       or coalesce(new.payload->>'method','')='' then
      raise exception 'BLIND requires probabilities, method and evidence array';
    end if;
    for item in select * from jsonb_each(new.payload->'probabilities') loop
      if jsonb_typeof(item.value)<>'number' then raise exception 'Probabilities must be numbers'; end if;
      if (item.value::text)::numeric<=0 or (item.value::text)::numeric>=1 then raise exception 'Probabilities must be between zero and one'; end if;
      total:=total+(item.value::text)::numeric; count_values:=count_values+1;
    end loop;
    if count_values<2 or abs(total-1)>0.000001 then raise exception 'Complete probability vector must sum to one'; end if;
    if new.provenance='quantitative' and (coalesce(new.payload->>'model_version','')='' or coalesce(new.payload->>'data_ref','')='') then
      raise exception 'Quantitative forecasts require model version and reproducible data reference';
    end if;
    if new.phase='LIVE' and (not(new.payload?'minute') or not(new.payload?'score')) then
      raise exception 'LIVE forecasts require minute and score';
    end if;
  end if;
  if new.stage in ('MARKET','DECISION','RESULT') then
    if new.parent_id is null then raise exception 'Linked snapshot required'; end if;
    select * into par from public.betcore_snapshots where id=new.parent_id and user_id=new.user_id;
    if not found then raise exception 'Parent not found or not owned'; end if;
    if (par.event_key,par.market_key,par.phase,par.batch_key) is distinct from (new.event_key,new.market_key,new.phase,new.batch_key) then
      raise exception 'Parent event, market, phase and batch must match';
    end if;
    if new.stage='MARKET' and par.stage<>'BLIND' then raise exception 'MARKET must follow BLIND'; end if;
    if new.stage='DECISION' and par.stage<>'MARKET' then raise exception 'DECISION must follow MARKET'; end if;
    if new.stage='RESULT' and par.stage<>'DECISION' then raise exception 'RESULT must follow DECISION'; end if;
    if new.kickoff_at is distinct from par.kickoff_at then raise exception 'Kickoff mismatch'; end if;
  end if;
  if new.stage='MARKET' then
    if jsonb_typeof(new.payload->'odds') is distinct from 'object' or coalesce(new.payload->>'provider','')='' or coalesce(new.payload->>'source_url','')='' then
      raise exception 'Market requires full odds vector, provider and source URL';
    end if;
    if (select array_agg(key order by key) from jsonb_each(new.payload->'odds')) is distinct from
       (select array_agg(key order by key) from jsonb_each(par.payload->'probabilities')) then
      raise exception 'Odds and probabilities must describe the same exhaustive outcomes';
    end if;
    for item in select * from jsonb_each(new.payload->'odds') loop
      if jsonb_typeof(item.value)<>'number' then raise exception 'Odds must be numbers'; end if;
      if (item.value::text)::numeric<=1 then raise exception 'Decimal odds must exceed one'; end if;
    end loop;
    if new.observed_at<par.recorded_at then raise exception 'Market was observed before blind snapshot; declare contamination in a new sequence'; end if;
  end if;
  if new.stage='DECISION' then
    if coalesce(new.payload->>'classification','') not in ('SEGNALE DA VALUTARE','WATCHLIST','HOLD','PASS','MODEL CONFLICT','SUSPICIOUS VALUE') then
      raise exception 'Explicit analysis classification required';
    end if;
    if coalesce(new.payload->>'reason','')='' then raise exception 'Decision reason required'; end if;
    if new.payload?'lambda' and new.payload->'lambda'<>'null'::jsonb then
      if jsonb_typeof(new.payload->'lambda')<>'number' then raise exception 'Lambda must be numeric'; end if;
      if (new.payload->>'lambda')::numeric<0 or (new.payload->>'lambda')::numeric>1 then raise exception 'Invalid lambda'; end if;
    end if;
  end if;
  if new.stage='RESULT' then
    if coalesce(new.payload->>'source_url','')='' or coalesce(new.payload->>'status','') not in ('final','void') then
      raise exception 'Result requires source and final/void status';
    end if;
    if new.payload->>'status'='final' and coalesce(new.payload->>'outcome','')='' then raise exception 'Final outcome required'; end if;
  end if;
  return new;
end $$;
revoke all on function betcore_private.validate_snapshot() from public,anon,authenticated;
create trigger betcore_snapshot_guard before insert or update or delete on public.betcore_snapshots
for each row execute function betcore_private.validate_snapshot();

create view public.betcore_data_quality with (security_invoker=true) as
select user_id, tipo, classificazione, count(*) as records,
  count(probabilita_stimata) as probability_present,
  count(quota_check) as check_price_present,
  count(quota_chiusura) as closing_price_present,
  count(nullif(debrief,'')) as debrief_present,
  count(*) filter(where probabilita_stimata is null and probabilita_timestamp is not null) as timestamp_without_probability,
  count(*) filter(where tipo='osservata' and (stake<>0 or profitto<>0)) as observed_with_amounts
from public.picks group by user_id,tipo,classificazione;
revoke all on public.betcore_data_quality from public,anon,authenticated;
grant select on public.betcore_data_quality to authenticated;

comment on table public.betcore_snapshots is 'BET Core operational traceability v0.1: append-only; LEGACY is retrospective and excluded from prospective validation. No stake authorization.';
comment on table public.betcore_pick_history is 'Server journal and initial baseline. App clients can read own history but cannot insert, update or delete it.';
comment on view public.betcore_data_quality is 'Coverage counts only; not evidence of model calibration or profitability.';
