-- Sistema integrale del Veggente (deciso da Carmine il 17/10/2026): una
-- terza proposta del giorno, accanto a raddoppio e multipla quota 5, in prova
-- sulla carta fino al 07/11/2026.

alter table public.veggente_proposte drop constraint if exists veggente_proposte_tipo_check;
alter table public.veggente_proposte add constraint veggente_proposte_tipo_check
  check (tipo in ('RADDOPPIO','MULTIPLA_5','PERSONALE','ALTRA','SISTEMA'));

-- Colonne, importo a colonna, costo e vincita (sulla carta finche' e' in prova).
alter table public.veggente_proposte
  add column if not exists colonne integer,
  add column if not exists importo_colonna numeric(6,2),
  add column if not exists costo numeric(8,2),
  add column if not exists vincita numeric(10,2);

-- Ruolo della gamba nel sistema, segni coperti e quote 1X2 complete.
alter table public.veggente_proposte_gambe
  add column if not exists ruolo text check (ruolo in ('FISSA','DOPPIA','TRIPLA')),
  add column if not exists segni text,
  add column if not exists quote_esiti jsonb;

-- L'app abbina le ricevute a raddoppi, multiple e personali: un sistema non
-- si gioca come schedina normale e resta fuori dall'elenco.
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
      and p.tipo <> 'SISTEMA'
      and auth.uid() = '67f50b6a-bac2-4e51-9f92-7a8fee648293'::uuid
  ) s;
$$;
