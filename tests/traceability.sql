-- Run inside BEGIN/ROLLBACK. No test rows are retained.
select set_config('request.jwt.claim.sub',(select user_id::text from public.picks limit 1),true);
set local role authenticated;
do $$
declare b uuid; m uuid; d uuid; failed boolean; mine uuid:=auth.uid(); n bigint;
begin
  select count(*) into n from public.betcore_pick_history;
  if n=0 then raise exception 'Owner cannot read baseline'; end if;
  insert into public.betcore_snapshots(user_id,batch_key,event_key,market_key,stage,kickoff_at,observed_at,provenance,blind_status,payload,idempotency_key)
  values(mine,'test-only','fixture','1X2','BLIND',clock_timestamp()+interval '2 days',clock_timestamp(),'subjective','clean',
    '{"probabilities":{"1":0.5,"X":0.3,"2":0.2},"method":"test fixture","evidence":[]}','test-blind') returning id into b;
  failed:=false;
  begin
    update public.betcore_snapshots set payload='{}' where id=b;
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Owner can overwrite snapshot'; end if;
  failed:=false;
  begin delete from public.betcore_snapshots where id=b;
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Owner can delete snapshot'; end if;
  failed:=false;
  begin
    insert into public.betcore_pick_history(user_id,pick_id,operation,actor_role)
    values(mine,gen_random_uuid(),'INSERT','forged');
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Client can forge journal'; end if;
  failed:=false;
  begin
    insert into public.betcore_snapshots(user_id,batch_key,event_key,market_key,stage,kickoff_at,observed_at,provenance,blind_status,payload,idempotency_key)
    values(mine,'test-only','fixture','1X2','BLIND',clock_timestamp()+interval '2 days',clock_timestamp(),'subjective','clean',
      '{"probabilities":{"1":0.8,"X":0.3,"2":0.2},"method":"bad sum","evidence":[]}','bad-sum');
  exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Invalid probability vector accepted'; end if;
  failed:=false;
  begin
    insert into public.betcore_snapshots(user_id,batch_key,event_key,market_key,stage,kickoff_at,observed_at,provenance,blind_status,payload,idempotency_key)
    values(mine,'test-only','fixture','1X2','BLIND',clock_timestamp()-interval '1 day',clock_timestamp(),'subjective','clean',
      '{"probabilities":{"1":0.5,"X":0.3,"2":0.2},"method":"backdated","evidence":[]}','bad-time');
  exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Backdated PRE accepted'; end if;
  insert into public.betcore_snapshots(user_id,batch_key,event_key,market_key,stage,parent_id,kickoff_at,observed_at,payload,idempotency_key)
    select mine,batch_key,event_key,market_key,'MARKET',id,kickoff_at,clock_timestamp(),
    '{"odds":{"1":2.0,"X":3.5,"2":4.0},"provider":"test","source_url":"https://example.invalid"}','test-market'
    from public.betcore_snapshots where id=b returning id into m;
  insert into public.betcore_snapshots(user_id,batch_key,event_key,market_key,stage,parent_id,kickoff_at,observed_at,payload,idempotency_key)
    select mine,batch_key,event_key,market_key,'DECISION',id,kickoff_at,clock_timestamp(),
    '{"classification":"PASS","reason":"test only","lambda":0.3}','test-decision'
    from public.betcore_snapshots where id=m returning id into d;
  -- Ordinary app writes still work and are journaled, then rolled back by caller.
  select count(*) into n from public.betcore_pick_history;
  update public.picks set debrief=coalesce(debrief,'')||' [rollback test]' where id=(select id from public.picks limit 1);
  if (select count(*) from public.betcore_pick_history)<>n+1 then raise exception 'App update not journaled'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.betcore_pick_history) or exists(select 1 from public.betcore_snapshots) then
    raise exception 'Cross-owner history exposure';
  end if;
end $$;
reset role;
set local role anon;
do $$ declare failed boolean:=false; begin
  begin perform 1 from public.betcore_snapshots;
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Anonymous snapshot access'; end if;
end $$;
reset role;
