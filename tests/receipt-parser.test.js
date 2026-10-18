"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const P=require("../receipt-parser.js");

// Testi reali prodotti dall'OCR sulle ricevute Sportium del 31/08/2026.
const barca=`< Giocata
Giocata del: 31/08/2026 21:09
ADM: DF07EA081F319A693C05
31/08/2026 21:30 - Calcio - LaLiga
Barcellona vs Rayo Vallecano
MULTIGOAL 3-5 CASA + MULTIGOAL 0-1
© OsPire “SI |2.00
Quota totale : 2.00
Importo pagato: 5,00 €
Vincita potenziale 10,00 €`;

const arsenalAltoContrasto=`< Giocata
Stato: @ VENDUTO
Giocata del: 31/08/2026 20:45
ADM: DF07EA081F319A4BA004
W 31/08/2026 21:00 - Calcio - Premier League
Aston Villa vs Arsenal ( 0: 0 )
DC OUT + MG 2-4 X2+ MULTIG | 1.65
Quota totale : 1.65
Importo pagato: 6,00 €
Vincita potenziale 9,90 €`;

const b=P.parseSportium(barca);
assert.equal(b.ticketId,"DF07EA081F319A693C05");
assert.equal(b.data,"2026-08-31");
assert.equal(b.quota,2);
assert.equal(b.stake,5);
assert.equal(b.eventi.length,1);
assert.equal(b.eventi[0].evento,"Barcellona vs Rayo Vallecano");
assert.equal(b.eventi[0].mercato,"MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE");
assert.deepEqual(b.avvisi,[]);

const a=P.parseSportium(arsenalAltoContrasto);
assert.equal(a.ticketId,"DF07EA081F319A4BA004");
assert.equal(a.quota,1.65);
assert.equal(a.stake,6);
assert.equal(a.eventi[0].evento,"Aston Villa vs Arsenal");
assert.equal(a.eventi[0].mercato,"X2 + MULTIGOAL 2-4");
assert.equal(a.eventi[0].struttura.tipo,"COMBO");
assert.deepEqual(a.eventi[0].struttura.componenti.map(x=>x.tipo),["DOPPIA_CHANCE","MULTIGOAL"]);
assert.deepEqual(a.avvisi,[]);


// Sportbet: testi reali prodotti da Tesseract (stessi parametri dell'app) sullo
// screenshot "Mie scommesse" del 25/09/2026. Tema scuro: l'app inverte i
// colori prima dell'OCR; il secondo testo e' la lettura SENZA inversione, in
// cui gli importi sono illeggibili.
const sportbetInvertito=`07:44 @ — N                             e Riu
oy a                     sportbet.it                     @
=                          Sportber               a
=
= [WEE (sporese             3121€
LIVE 0  IN CORSO 0  CONCLUSE ES  CASHOUT 0
Multipla (2)                                  Dettagli -
Evento                      SEGNO           QUOTA ESITO
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Svezia - Romania 2-1
HT: 2:1
x2                                        1                1.44      )
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Turchia - Francia 0-1
Cards: 4:3 | Corners: 5:3 | HT: 0:0
x2                                        2)                1.35      )
Importo              Bonus                Quota totale
9,00 €              0,04 €              1.94                  Vinita 17,54 €
Multipla              Ref. DFO7EA091931B226C50A | 25/09/2026 20:42
Multipla (5)                                 Dettagli +
Importo                      Quota totale
100 €                 21.99                    Perdente 23,09 €
Multipla                     Ref. DFO7EA09193211DA6903 | 25/09/2026 19:59
® 0
Prematch      Live      Carrello Mie scommesse Casino
+                                    .
<          >         ®        & =          :`;

const sportbetNonInvertito=`07:44 @ — N                             © Abul
wy a                     sportbet.it                     @)
=                          Sportber               a
=
=      Ricarica     Cla t LLL             31.21€
LIVE 0  IN CORSO 0  CONCLUSE Eo  CASHOUT ©
Multipla (2)                                  Dettagli -
Evento                      SEGNO           QUOTA ESITO
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Svezia - Romania 2-1
HT: 2:1
1x2                                        1                1.44      ®
#2 Internazionale | UEFA Nations League | 25/09/2026 20:45
Turchia - Francia 0-1
Cards: 4:3 | Corners: 5:3 | HT: 0:0
x2                                        2                135      ®
Importo              Bonus                Quota totale
so0e  ovhe 1%              Vincita 17,54 €
Multipla              Ref. DFO7EA091931B226C50A | 25/09/2026 20:42
Multipla (5)                                 Dettagli +
Importo                      Quota totale
T00€                  2199                   ‘Perdente 2309 €
Multipla                     Ref. DFO7EA09193211DA6903 | 25/09/2026 19:59
Prematch      Live  Carrello Mie scommesse Casino
+                                    .
<          >         ®        & =          :`;

assert.equal(P.riconosciBookmaker(sportbetInvertito),"Sportbet");
assert.equal(P.riconosciBookmaker(barca),"Sportium");
assert.equal(P.parseRicevuta(barca).bookmaker,"Sportium");
assert.equal(P.parseRicevuta(barca).eventi[0].mercato,"MULTIGOAL 3-5 CASA + MULTIGOAL 0-1 OSPITE");

const sb=P.parseRicevuta(sportbetInvertito);
assert.equal(sb.bookmaker,"Sportbet");
assert.equal(sb.ticketId,"DF07EA091931B226C50A");
assert.equal(sb.data,"2026-09-25");
assert.equal(sb.orarioIngresso,"2026-09-25T20:42");
assert.equal(sb.quota,1.94);
assert.equal(sb.stake,9);
assert.equal(sb.bonus,0.04);
assert.equal(sb.esitoBook,"vinta");
assert.equal(sb.tipoSchedina,"MULTIPLA");
assert.deepEqual(sb.eventi.map(x=>[x.evento,x.mercato,x.quota]),[
  ["Svezia vs Romania","1",1.44],
  ["Turchia vs Francia","2",1.35]
]);
assert.deepEqual(sb.avvisi,["Nello screenshot ci sono 2 schedine: letta solo quella con i dettagli aperti"]);

// Senza inversione l'importo non si legge: deve dirlo, non inventarlo.
const sbGrezzo=P.parseRicevuta(sportbetNonInvertito);
assert.equal(sbGrezzo.stake,null);
assert.ok(sbGrezzo.avvisi.includes("Importo non riconosciuto"));
assert.equal(sbGrezzo.quota,1.94);

// Importi e quote senza separatore: Sportbet usa sempre due decimali.
const compatto=P.parseSportbet(`Singola (1) Dettagli -
Evento SEGNO QUOTA ESITO
Serie A | 27/09/2026 15:00
Juventus - Milan
1X2 X 320
Importo Quota totale
500 € 320 Vincita potenziale 1600 €
Singola Ref. DF07EA0000000000ABCD | 27/09/2026 14:10`);
assert.equal(compatto.stake,5);
assert.equal(compatto.quota,3.2);
assert.equal(compatto.esitoBook,"aperta");
assert.equal(compatto.vincitaPotenziale,16);
assert.equal(compatto.tipoSchedina,"SINGOLA");
assert.deepEqual(compatto.eventi.map(x=>[x.evento,x.mercato]),[["Juventus vs Milan","X"]]);
assert.deepEqual(compatto.avvisi,[]);

// Schedina chiusa (senza dettagli) sopra quella aperta: va letta la seconda.
const dueSchedine=P.parseSportbet(`Multipla (5) Dettagli +
Importo Quota totale
1,00 € 21.99 Perdente 23,09 €
Multipla Ref. DF07EA09193211DA6903 | 25/09/2026 19:59
`+sportbetInvertito.split("\n").slice(6,20).join("\n"));
assert.equal(dueSchedine.ticketId,"DF07EA091931B226C50A");
assert.equal(dueSchedine.eventi.length,2);

// Schedina vera del 07/10/2026 (multipla con selezioni ancora aperte): testo
// OCR dell'immagine ingrandita 2x. Sportbet aggiunge la colonna "Selezioni
// aperte 2/2", cosi' "Importo" non e' a inizio riga e i valori stanno su
// tre righe; "Vincita" esce come "\\/jncita". Prima: importo non letto e
// primo mercato letto "1X + UNDER/OVER 3.5 1X + UN" (classificato Over!).
const aperte=P.parseRicevuta(`13:48 © —                                            BAR
—                             Spartbet                -
=
= [WE (sportier             94,02 €
LIVE 0  IN CORSO @  CONCLUSE 7  CASHOUT Q
Multipla (2)                                  Dettagli -
Evento                        SEGNO            QUOTA ESITO

«2 Brasile | Brasileiro Serie A | 08/10/2026 00:30

Internacional - Corinthians

1X + Under/Over 3.5                     1X + UN              1.64       o

&2 Brasile | Brasileiro Serie A | 08/10/2026 01:00

EC Vitoria BA - Chapecoense SC

1X2                                            1                  1.52       ®
Selezioni  Importo Bonus    Quota
aperte                totale \\/jncita potenziale 25,00 €

10,00 € 0,07 €

2/2                           2.49

Questo ticket puo essere riscosso prima          Ce |      Cashout

della sua chiusura, per una cifra di 1,99 €                       1,99 €
Multipla                    Ref. DFO7EAOA083IDCOIBEOC | 07/10/2026 13:48

® Esitovincente         Esito perdente  @ Esito in corsc
@    ®     4     od
Prematch      Live      Carrello Mie scommesse Casino
`);
assert.equal(aperte.bookmaker,"Sportbet");
assert.equal(aperte.stake,10);
assert.equal(aperte.bonus,0.07);
assert.equal(aperte.quota,2.49);
assert.equal(aperte.esitoBook,"aperta");
assert.equal(aperte.vincitaPotenziale,25);
assert.equal(aperte.orarioIngresso,"2026-10-07T13:48");
assert.deepEqual(aperte.eventi.map(x=>[x.evento,x.mercato,x.quota]),[
  ["Internacional vs Corinthians","1X + UNDER 3.5",1.64],
  ["EC Vitoria BA vs Chapecoense SC","1",1.52]
]);
// Limite noto: l'OCR legge "9" come "O" nel Ref. (vero: DF07EA0A0831DC91BE0C).
assert.equal(aperte.ticketId,"DF07EA0A0831DC01BE0C");

// Ticket Sportbet da computer ("Controlla il tuo ticket"), sistema su 7
// partite del 17/10/2026. Testo vero di Tesseract sull'immagine ingrandita 2x
// e invertita sul canale piu' luminoso (il segno e' arancione).
const sistemaPc=fs.readFileSync(require.resolve("./dati/sportbet-sistema-pc.txt"),"utf8");
const sis=P.parseRicevuta(sistemaPc);
assert.equal(sis.bookmaker,"Sportbet");
assert.equal(sis.sistema,7,"riconosce il sistema");
assert.equal(sis.quota,null,"un sistema non ha quota totale: niente prodotto delle gambe");
assert.equal(sis.stake,2.2);
assert.equal(sis.ticketId,"DF07EA0A1110CF360907");
assert.deepEqual(sis.eventi.map(e=>e.evento+" | "+e.mercato),[
  "Venezia vs Napoli | 2 + GG",
  "Amburgo vs Stoccarda | 2 + GG",
  "Schalke 04 vs Mainz | 2 + GG",
  "Union Berlino vs Borussia Dortmund | 2 + GG",
  "Brentford vs Liverpool | GG + OVER 2.5",
  "Fulham FC vs Hull City | 1 + GG",
  "Villarreal vs Elche | 1 + GG"
],"partite pulite dal punteggio e mercati combinati letti, anche con 1+6G e GG+OVV");
assert.ok(sis.avvisi.some(a=>/Sistema su 7/.test(a)));

// Stessa immagine senza ingrandimento: due segni persi. Quelle gambe devono
// restare senza mercato (il Live non le segue), mai con un mercato a meta'.
const scarso=P.parseRicevuta("Controlla il tuo Ticket Poportbette sc ety sportbetitscommes.. \u2014 [J        x\n23 sportbet.it/xsportapp/xsport_desktop/checkbetticket...\n                   RN\nSistema (7)\nEvento                      SEGNO           QUOTA ESITO\n2 Italia | Serie a | 17/10/2026 15:00\nVenezia - Napoli 1-0                                                     iche\nHT 0:0\n1X2 + GG/NG                     2+66           3.25 @            .\ne cliccas\n8 Germania | Bundesliga | 17/10/2026 15:30\n\u2018Amburgo - Stoccarda 1-0\nComers: 5:9 | ComersHT: 2:4 | HT: 0:0\nI 1X2 + GG/NG                  2466         275 @\n\u20ac3 Germania | Bundesliga | 17/10/2026 15:30                                e A Quota Fi\nSchalke 04- Mainz 0-1\nComers: 4:1 | ComersHT: 2:3 | HT: 0:1\n1X2 + GG/NG                         2+6G            395 @\n3 Germania | Bundesliga | 17/10/2026 15:30\nUnion Berlino - Borussia Dortmund 0 - 0\nCards: 3:3 | Corners: 5:5 | CornersHT: 2:2 | HT: 0:0\n1X2 + GG/NG                    2466          275 @       Enporto\n\u2018\u20ac Inghilterra | Premier League | 17/10/2026 16:00\nBrentford - Liverpool 1 - 2\nCards: 7:3 | Comers: 3:10 | ComerstT: 3:4 | HT: 1:0                                        43\nU/0 2.5 + GG/NG                      GG+OV              169 @\n@ Inghilterra | Premier League | 17/10/2026 16:00                      1,00 \u20ac\nFulham FC - Hull City 1-0\nCards: 4:2 | Comers: 10:2 | ComerstT: 7:1 | HT: 1:0\n1X2 + GG/NG                      1+6G           3.30     e       2,20\u20ac\n\u2018\u20ac8 Spagna | Laliga | 17/10/2026 16:15\nVillarreal - Elche 0-0                                                     00 \u20ac\nCards: 2:4 | Comers: 10:5 | ComersHT: 5:1 | HT? 0:0\n1X2 + GG/NG                    1+6G          246 @\nBooe\nImporto                                         Quota totale\n2,20\u20ac                                 Non disponibile\n00 \u20ac\nRigioca\n6 \u00a9 @ Ga                            a         oo \u20ac\nSistema                         Ref, DFO7EADAI110CF260907 | 17/10/2026 12:15\nVerifica sistema\nSistema: 5-pla                                                             Combinazioni: 23\nImporto: 0,10 \u20ac             Vincita minima: 10,72             Vincita massimar 22,69 \u20ac\nSictomat 7a\n5\n");
const perGamba=Object.fromEntries(scarso.eventi.map(e=>[e.evento,e.mercato]));
assert.equal(perGamba["Amburgo vs Stoccarda"],"","segno perso: niente mercato");
assert.equal(perGamba["Union Berlino vs Borussia Dortmund"],"","segno perso: niente mercato");
assert.equal(perGamba["Fulham FC vs Hull City"],"1 + GG","1+6G corretto in 1 + GG");
assert.ok(scarso.avvisi.some(a=>/evento 2 .*il Live non la seguira/.test(a)),"l'avviso dice cosa e' stato letto");

// Ticket Sportbet da telefono del 18/10/2026 (codice 664156): intestazione
// semplice "U/O 2,5" col segno scritto per esteso "OVER". La v4.40 la
// scartava (regola di sicurezza troppo larga): il Live le dava "non seguite".
const tel=P.parseRicevuta(fs.readFileSync(require.resolve("./dati/sportbet-multipla-telefono.txt"),"utf8"));
assert.equal(tel.sistema,0);
assert.equal(tel.quota,10.06);
assert.equal(tel.ticketId,"DF07EA0A123279BC1504");
assert.deepEqual(tel.eventi.map(e=>e.evento+" | "+e.mercato),[
  "Osasuna vs Racing Santander | OVER 2.5",
  "Valerenga IF vs Brann | OVER 2.5",
  "Milan vs Atalanta | OVER 2.5",
  "CF Malaga vs Real Sociedad | OVER 2.5",
  "Al-Fateh SC vs Al-Khaleej Club | OVER 2.5"
]);
// Intestazioni semplici: segno per esteso o abbreviato, e niente mercato se
// il segno non si capisce.
assert.equal(P.parseSportbet("Italia | Serie A | 18/10/2026 15:00\nJuventus - Lazio\nGG/NG    GOAL    1.80\nRef. DF07EA0A123279BC1599 | 18/10/2026 13:49").eventi[0].mercato,"GG");
assert.equal(P.parseSportbet("Italia | Serie A | 18/10/2026 15:00\nJuventus - Lazio\nU/O 1,5    UNDER    3.10\nRef. DF07EA0A123279BC1599 | 18/10/2026 13:49").eventi[0].mercato,"UNDER 1.5");
assert.equal(P.parseSportbet("Italia | Serie A | 18/10/2026 15:00\nJuventus - Lazio\nU/O 2,5    0VFR    1.80\nRef. DF07EA0A123279BC1599 | 18/10/2026 13:49").eventi[0].mercato,"","segno illeggibile: niente mercato");

// Letture storpiate di "U/O 2,5" (codice 331860 del 18/10): "V/O 2,5", "UFO 25".
const storpia=t=>P.parseSportbet("Italia | Serie A | 18/10/2026 15:00\nJuventus - Lazio\n"+t+"    OVER    1.80\nRef. DF07EA0A123279BC1599 | 18/10/2026 13:49").eventi[0].mercato;
assert.equal(storpia("V/O 2,5"),"OVER 2.5");
assert.equal(storpia("UFO 25"),"OVER 2.5");
assert.equal(storpia("U/O25"),"OVER 2.5");

console.log("receipt-parser: ok");
