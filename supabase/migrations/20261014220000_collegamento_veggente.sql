-- Collegamento diretto fra le giocate dell'app e le proposte del Veggente
-- (deciso da Carmine il 14/10/2026).
--
-- L'app non scrive sulle tabelle veggente_: salva su picks quale proposta ha
-- giocato, e un trigger aggiorna la proposta. Cosi' la skill del Veggente
-- trova gia' CONFERMATA la proposta giocata tale e quale (§7-bis) e non la
-- abbina una seconda volta; le varianti le restano da registrare come
-- PERSONALE, con il riferimento alla proposta di partenza.

alter table public.picks
  add column if not exists proposta_veggente_id bigint
    references public.veggente_proposte(id) on delete set null,
  add column if not exists proposta_tipo text,
  add column if not exists proposta_variante boolean not null default false;

comment on column public.picks.proposta_veggente_id is
  'Proposta del Veggente da cui e'' partita la giocata (scelta nell''app).';
comment on column public.picks.proposta_tipo is
  'Tipo della proposta al momento della scelta: RADDOPPIO, MULTIPLA_5, PERSONALE, ALTRA.';
comment on column public.picks.proposta_variante is
  'true se Carmine ha cambiato le gambe rispetto alla proposta.';

-- Lettura delle proposte per l'app. Le tabelle veggente_ non hanno user_id
-- ne' policy: invece di aprirle, una funzione restituisce solo i campi che
-- servono, e solo all'account di Carmine.
create or replace function public.proposte_veggente_app(p_dal date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'data' desc, (x->>'id')::bigint), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'data', p.data, 'tipo', p.tipo, 'stato', p.stato,
      'quota_totale', p.quota_totale, 'esito', p.esito,
      'giocata', p.pick_id is not null,
      'gambe', coalesce((
        select jsonb_agg(jsonb_build_object(
          'partita', g.partita, 'mercato', g.mercato, 'competizione', g.competizione,
          'kickoff', g.kickoff, 'voto', g.voto,
          'quota', coalesce(pg.quota, g.quota_sportbet, g.quota_rif)
        ) order by g.kickoff nulls last, g.id)
        from public.veggente_proposte_gambe pg
        join public.veggente_giocate g on g.id = pg.giocata_id
        where pg.proposta_id = p.id
      ), '[]'::jsonb)
    ) as x
    from public.veggente_proposte p
    where p.data >= p_dal
      and p.stato <> 'SCARTATA'
      and auth.uid() = '67f50b6a-bac2-4e51-9f92-7a8fee648293'::uuid
  ) s;
$$;

revoke all on function public.proposte_veggente_app(date) from public, anon;
grant execute on function public.proposte_veggente_app(date) to authenticated;

-- Quando una giocata reale arriva con una proposta collegata e non e' una
-- variante, la proposta diventa CONFERMATA con puntata e bookmaker presi
-- dalla giocata. Si aggiorna una volta sola: se la proposta e' gia'
-- collegata a un'altra giocata non si tocca.
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
  return new;
end;
$$;

revoke all on function public.collega_proposta_veggente() from public, anon, authenticated;

drop trigger if exists picks_collega_proposta_veggente on public.picks;
create trigger picks_collega_proposta_veggente
  after insert or update of proposta_veggente_id, proposta_variante on public.picks
  for each row execute function public.collega_proposta_veggente();
