create or replace function public.normalize_pick_ticket_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_id is not null and btrim(new.ticket_id) <> '' then
    new.ticket_id := upper(btrim(new.ticket_id));
    new.legacy_id := 'ticket:' || new.ticket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_pick_ticket_identity_before_write on public.picks;
create trigger normalize_pick_ticket_identity_before_write
before insert or update of ticket_id, legacy_id on public.picks
for each row
execute function public.normalize_pick_ticket_identity();
