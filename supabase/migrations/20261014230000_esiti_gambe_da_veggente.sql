-- Esiti delle gambe presi dal Veggente (deciso da Carmine il 14/10/2026).
--
-- Allo scandaglio la skill del Veggente chiude ogni gamba delle proposte con
-- il risultato vero (veggente_giocate.esito). Per le giocate collegate a una
-- proposta e giocate tale e quale, l'esito si copia nella gamba
-- corrispondente di picks.gambe: a Carmine resta solo Vinta / Persa sulla
-- schedina. Le varianti restano a mano, perche' una gamba puo' avere un
-- mercato diverso da quello proposto. Un esito gia' segnato non si tocca.
--
-- Le partite si riconoscono come nell'app: per ogni squadra la parola piu'
-- lunga del nome, cercata come parola intera nella gamba della ricevuta.

create or replace function public.norm_partita_veggente(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(translate(coalesce(t,''),
    'àáâäãèéêëìíîïòóôöõùúûüçñøåæÀÁÂÄÃÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑØÅÆ',
    'aaaaaeeeeiiiiooooouuuucnoaaAAAAAEEEEIIIIOOOOOUUUUCNOAA')), '[^a-z0-9]+', ' ', 'g');
$$;

create or replace function public.stessa_partita_veggente(p_partita text, p_evento text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(p_partita,''), '\s+(vs\.?|v|-|–)\s+')) as t(squadra)
    cross join lateral (
      select w from regexp_split_to_table(public.norm_partita_veggente(t.squadra), ' ') w
      where length(w) >= 3 order by length(w) desc, w limit 1
    ) k
    where (' ' || public.norm_partita_veggente(p_evento) || ' ') like ('% ' || k.w || ' %')
  );
$$;

create or replace function public.propaga_esiti_veggente(p_pick uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick record;
  v_gambe jsonb;
  v_gamba jsonb;
  v record;
  v_esito text;
  v_cambiato boolean := false;
  i int;
begin
  select id, gambe, proposta_veggente_id into v_pick
    from picks
   where id = p_pick and tipo = 'reale' and tipo_schedina = 'MULTIPLA'
     and proposta_veggente_id is not null and not proposta_variante;
  if not found then return; end if;

  v_gambe := coalesce(v_pick.gambe, '[]'::jsonb);
  for v in
    select g.partita, g.esito
      from veggente_proposte_gambe pg
      join veggente_giocate g on g.id = pg.giocata_id
     where pg.proposta_id = v_pick.proposta_veggente_id
       and g.esito in ('WIN','LOSE','VOID')
  loop
    v_esito := case v.esito when 'WIN' then 'vinta' when 'LOSE' then 'persa' else 'rimborsata' end;
    for i in 0 .. jsonb_array_length(v_gambe) - 1 loop
      v_gamba := v_gambe -> i;
      if coalesce(v_gamba->>'esito','') = ''
         and public.stessa_partita_veggente(v.partita, v_gamba->>'evento') then
        v_gambe := jsonb_set(v_gambe, array[i::text], v_gamba || jsonb_build_object('esito', v_esito));
        v_cambiato := true;
        exit;
      end if;
    end loop;
  end loop;

  if v_cambiato then
    update picks set gambe = v_gambe, updated_at = now() where id = p_pick;
  end if;
end;
$$;

revoke all on function public.propaga_esiti_veggente(uuid) from public, anon, authenticated;

-- Quando la skill chiude una gamba del Veggente.
create or replace function public.esito_giocata_veggente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick uuid;
begin
  if new.esito is not distinct from old.esito or new.esito not in ('WIN','LOSE','VOID') then
    return new;
  end if;
  for v_pick in
    select distinct p.id
      from picks p
      join veggente_proposte_gambe pg on pg.proposta_id = p.proposta_veggente_id
     where pg.giocata_id = new.id
  loop
    perform public.propaga_esiti_veggente(v_pick);
  end loop;
  return new;
end;
$$;

revoke all on function public.esito_giocata_veggente() from public, anon, authenticated;

drop trigger if exists veggente_giocate_esito_a_picks on public.veggente_giocate;
create trigger veggente_giocate_esito_a_picks
  after update of esito on public.veggente_giocate
  for each row execute function public.esito_giocata_veggente();

-- Quando una giocata viene collegata dopo che i risultati sono gia' chiusi.
create or replace function public.collega_proposta_veggente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposta_veggente_id is null or new.proposta_variante or new.tipo <> 'reale' then
    return new;
  end if;
  update public.veggente_proposte p
     set pick_id = new.id,
         stato = 'CONFERMATA',
         puntata = new.stake,
         bookmaker = new.bookmaker,
         confermata_at = coalesce(p.confermata_at, now()),
         note = concat_ws(' · ', nullif(p.note, ''),
           'giocata dall''app BET Core' ||
           coalesce(', quota ' || to_char(new.quota, 'FM990.00'), '') ||
           coalesce(', ticket ' || new.ticket_id, ''))
   where p.id = new.proposta_veggente_id
     and p.pick_id is null;
  perform public.propaga_esiti_veggente(new.id);
  return new;
end;
$$;
