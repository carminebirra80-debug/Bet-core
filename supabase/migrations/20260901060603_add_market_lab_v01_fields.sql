alter table public.picks
  add column if not exists quota_chiusura numeric,
  add column if not exists probabilita_stimata numeric,
  add column if not exists probabilita_timestamp timestamptz,
  add column if not exists famiglia_mercato text not null default 'NON_CLASSIFICATO',
  add column if not exists ambito_mercato text not null default 'PARTITA',
  add column if not exists selezione_normalizzata text,
  add column if not exists linea_mercato text,
  add column if not exists componenti_mercato jsonb not null default '[]'::jsonb,
  add column if not exists versione_tassonomia text not null default 'v0.1';

alter table public.picks
  add constraint picks_quota_chiusura_valida
    check (quota_chiusura is null or quota_chiusura > 1),
  add constraint picks_probabilita_stimata_valida
    check (probabilita_stimata is null or (probabilita_stimata > 0 and probabilita_stimata < 1)),
  add constraint picks_famiglia_mercato_valida
    check (famiglia_mercato in (
      'NON_CLASSIFICATO','ESITO_1X2','DOPPIA_CHANCE','DRAW_NO_BET','TOTALI_GOL',
      'GOAL_NO_GOAL','MULTIGOL','MULTIGOL_SQUADRA','GOL_SQUADRA','HANDICAP',
      'CORNER','CARTELLINI','PLAYER_PROP','COMBO','MULTIPLA','ALTRO'
    )),
  add constraint picks_ambito_mercato_valido
    check (ambito_mercato in ('PARTITA','CASA','OSPITE','GIOCATORE','MULTIPLA','MISTA')),
  add constraint picks_componenti_mercato_array
    check (jsonb_typeof(componenti_mercato) = 'array');

comment on column public.picks.mercato is
  'Descrizione originale del mercato, preservata come dato sorgente.';
comment on column public.picks.famiglia_mercato is
  'Famiglia normalizzata dal Market Lab; non implica promozione automatica nel BET Core.';
comment on column public.picks.probabilita_stimata is
  'Probabilita indipendente congelata prima dell evento, espressa tra 0 e 1.';
comment on column public.picks.quota_chiusura is
  'Closing line usata per il calcolo del CLV.';

create index if not exists picks_user_famiglia_data_idx
  on public.picks (user_id, famiglia_mercato, data desc);

update public.picks
set ticket_id = upper(btrim(ticket_id)),
    legacy_id = 'ticket:' || upper(btrim(ticket_id))
where ticket_id is not null
  and btrim(ticket_id) <> '';

update public.picks
set famiglia_mercato = 'MULTIPLA',
    ambito_mercato = 'MULTIPLA',
    selezione_normalizzata = case
      when jsonb_typeof(gambe) = 'array' and jsonb_array_length(gambe) > 0
        then 'Multipla · ' || jsonb_array_length(gambe)::text || ' gambe'
      else 'Multipla'
    end,
    linea_mercato = null,
    versione_tassonomia = 'v0.1'
where upper(coalesce(tipo_schedina,'')) = 'MULTIPLA'
   or upper(btrim(coalesce(mercato,''))) = 'MULTIPLA';

update public.picks
set famiglia_mercato = 'ESITO_1X2',
    ambito_mercato = 'PARTITA',
    selezione_normalizzata = upper(btrim(mercato)),
    linea_mercato = null,
    componenti_mercato = jsonb_build_array(jsonb_build_object(
      'famiglia','ESITO_1X2','ambito','PARTITA',
      'selezione',upper(btrim(mercato)),'linea',null
    )),
    versione_tassonomia = 'v0.1'
where upper(btrim(coalesce(mercato,''))) in ('1','X','2')
  and upper(coalesce(tipo_schedina,'SINGOLA')) <> 'MULTIPLA';

update public.picks
set famiglia_mercato = 'COMBO',
    ambito_mercato = 'PARTITA',
    selezione_normalizzata = '1X + Over 1.5',
    linea_mercato = null,
    componenti_mercato = jsonb_build_array(
      jsonb_build_object('famiglia','DOPPIA_CHANCE','ambito','PARTITA','selezione','1X','linea',null),
      jsonb_build_object('famiglia','TOTALI_GOL','ambito','PARTITA','selezione','Over 1.5','linea','1.5')
    ),
    versione_tassonomia = 'v0.1'
where lower(regexp_replace(coalesce(mercato,''),'\s','','g')) in ('1x+ov1.5','1x+over1.5');

update public.picks
set famiglia_mercato = 'COMBO',
    ambito_mercato = 'PARTITA',
    selezione_normalizzata = 'X2 + Multigol 2-4',
    linea_mercato = null,
    componenti_mercato = jsonb_build_array(
      jsonb_build_object('famiglia','DOPPIA_CHANCE','ambito','PARTITA','selezione','X2','linea',null),
      jsonb_build_object('famiglia','MULTIGOL','ambito','PARTITA','selezione','Multigol 2-4','linea','2-4')
    ),
    versione_tassonomia = 'v0.1'
where upper(coalesce(mercato,'')) like '%DC OUT%'
   or upper(coalesce(mercato,'')) like '%X2+ MULTIG%';

update public.picks
set famiglia_mercato = 'COMBO',
    ambito_mercato = 'MISTA',
    selezione_normalizzata = 'Multigol casa 3-5 + Multigol ospite 0-1',
    linea_mercato = null,
    componenti_mercato = jsonb_build_array(
      jsonb_build_object('famiglia','MULTIGOL_SQUADRA','ambito','CASA','selezione','Multigol casa 3-5','linea','3-5'),
      jsonb_build_object('famiglia','MULTIGOL_SQUADRA','ambito','OSPITE','selezione','Multigol ospite 0-1','linea','0-1')
    ),
    versione_tassonomia = 'v0.1'
where upper(coalesce(mercato,'')) like '%MULTIGOAL 3-5 CASA%'
  and upper(coalesce(mercato,'')) like '%MULTIGOAL 0-1 OSPITE%';
