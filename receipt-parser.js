(function(root, factory){
  var api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  else root.BetCoreReceiptParser = api;
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  function compatta(v){
    return String(v || "")
      .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/[\u00A0\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function righePulite(testo){
    return String(testo || "")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map(compatta)
      .filter(Boolean);
  }

  function numeroItaliano(v){
    var s = String(v || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function numeroQuota(v){
    var s = String(v || "").replace(/\s/g, "").replace(",", ".");
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function dataIso(giorno, mese, anno){
    return String(anno).padStart(4, "0") + "-" + String(mese).padStart(2, "0") + "-" + String(giorno).padStart(2, "0");
  }

  function dataOraLocale(match){
    if(!match) return "";
    return dataIso(match[1], match[2], match[3]) + "T" + String(match[4]).padStart(2, "0") + ":" + String(match[5]).padStart(2, "0");
  }

  function normalizzaAdm(v){
    return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/Z/g, "2").replace(/G/g, "6");
  }

  function normalizzaEvento(v){
    return compatta(v)
      .replace(/\s+v(?:s|\.)?\s+/i, " vs ")
      .replace(/\s*\(\s*\d+\s*:\s*\d+\s*\).*$/i, "")
      .replace(/\s*[~\-]+\s*$/g, "")
      .replace(/^[-|:;,.\s]+|[-|:;,.\s]+$/g, "");
  }

  function sembraEvento(linea){
    var s = compatta(linea);
    if(s.length < 7 || s.length > 100) return false;
    if(/\b(?:quota|importo|vincita|giocata|calcio|adm)\b/i.test(s)) return false;
    return /\s+v(?:s|\.)?\s+/i.test(s);
  }

  function sembraRigaProgramma(linea){
    return /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}[:.]\d{2}\b/.test(compatta(linea));
  }

  function rumoreInterfaccia(linea){
    var s = compatta(linea).toUpperCase();
    return /^(?:CARICA|STAMPA|CONDIVIDI|CASH\s*OUT|CERCA|SPORT|LIVE|SCHEDINA|GIOCHI|ACCOUNT|GIOCATA)$/.test(s) ||
      /^(?:ACQUISTATO PRESSO|SERVIZIO CONTI GIOCO)/.test(s) ||
      /^(?:QUOTA TOTALE|IMPORTO PAGATO|VINCITA POTENZIALE)/.test(s);
  }

  function normalizzaParoleMercato(v){
    var s = compatta(v).toUpperCase();
    s = s
      .replace(/MULTI\s*GOAL/g, "MULTIGOAL")
      .replace(/\bMULTIG(?:L|OL)?\b/g, "MULTIGOAL")
      .replace(/\bDC\s+OUT\b/g, "X2")
      .replace(/\bMG\s*(\d+\s*-\s*\d+)\b/g, "MULTIGOAL $1")
      .replace(/NO\s+GOL\b/g, "NO GOAL")
      .replace(/\bSORE\b/g, "OSPITE")
      .replace(/\b(?:SEITE|SE1TE|5EITE)\b/g, "OSPITE")
      .replace(/\bOSPI(?:R|T|I|L|1)[A-Z0-9]*\b/g, "OSPITE")
      .replace(/\bOSP\s*ITE\b/g, "OSPITE")
      .replace(/\bCAS[A4]\b/g, "CASA")
      .replace(/^\W+/, "")
      .replace(/[\"'`\u2018\u2019\u201C\u201D]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return s;
  }

  function pulisciMercato(righe, quota){
    var parti = [];
    (righe || []).forEach(function(riga){
      var s = normalizzaParoleMercato(riga);
      if(!s || rumoreInterfaccia(s) || sembraRigaProgramma(s) || sembraEvento(s)) return;
      s = s
        .replace(/\bS[I1]\s*[\[\](){|Il!]?\s*\d+[.,]\d{1,3}\s*$/i, "")
        .replace(/\bS[I1]\s*[\[\](){|Il!]?\s*\d{2,4}\s*$/i, "")
        .replace(/[\[\](){|Il!]\s*\d+[.,]\d{1,3}\s*$/i, "")
        .replace(/[\[\](){|Il!]\s*\d{2,4}\s*$/i, "")
        .replace(/\s+\d+[.,]\d{1,3}\s*$/i, "")
        .replace(/^S[I1]\s*[|Il!]\s*/i, "")
        .replace(/^[-+|:;,.\s]+|[-+|:;,.\s]+$/g, "")
        .trim();
      if(s && !/^(?:SI|NO)$/.test(s)) parti.push(s);
    });
    var mercato = compatta(parti.join(" ")).toUpperCase();
    if(quota){
      var q = String(quota.toFixed(2)).replace(".", "[.,]");
      mercato = mercato.replace(new RegExp("(?:SI\\s*)?[|Il!]?\\s*" + q + "\\s*$", "i"), "").trim();
    }
    var combo = mercato.match(/\b(1X|X2|12)\s*\+\s*MULTIGOAL\s+(\d+)\s*-\s*(\d+)/i);
    if(combo) mercato = combo[1].toUpperCase() + " + MULTIGOAL " + combo[2] + "-" + combo[3];
    return mercato;
  }

  function tipoMercato(mercato){
    var s = String(mercato || "").toUpperCase();
    var componenti = [];
    var reMultigol = /MULTIGOAL\s+(\d+)\s*-\s*(\d+)\s+(CASA|OSPITE)/g;
    var m;
    while((m = reMultigol.exec(s))){
      componenti.push({tipo:"MULTIGOAL_SQUADRA", squadra:m[3], min:Number(m[1]), max:Number(m[2])});
    }
    if(componenti.length) return {tipo:componenti.length > 1 ? "COMBO" : "MULTIGOAL_SQUADRA", componenti:componenti};
    var dc=s.match(/(?:^|\W)(1X|X2|12)(?:\W|$)/);
    var mg=s.match(/MULTIGOAL\s+(\d+)\s*-\s*(\d+)/);
    if(dc&&mg) return {tipo:"COMBO",componenti:[
      {tipo:"DOPPIA_CHANCE",selezione:dc[1]},
      {tipo:"MULTIGOAL",min:Number(mg[1]),max:Number(mg[2])}
    ]};
    if(mg) return {tipo:"MULTIGOAL",componenti:[{tipo:"MULTIGOAL",min:Number(mg[1]),max:Number(mg[2])}]};
    if(/\bNO GOAL\b/.test(s)) return {tipo:"NO_GOAL", componenti:[]};
    if(/\bGOAL\b/.test(s)) return {tipo:"GOAL", componenti:[]};
    if(/\bOVER\b/.test(s)) return {tipo:"OVER", componenti:[]};
    if(/\bUNDER\b/.test(s)) return {tipo:"UNDER", componenti:[]};
    if(/HANDICAP/.test(s)) return {tipo:"HANDICAP", componenti:[]};
    if(/^(?:1|X|2|1X|X2|12)(?:\b|\s|\+)/.test(s)) return {tipo:"ESITO", componenti:[]};
    return {tipo:"ALTRO", componenti:[]};
  }

  function parseSportium(testo){
    var raw = String(testo || "");
    var righe = righePulite(raw);
    var unito = righe.join("\n");
    var avvisi = [];

    var adm = unito.match(/\bADM\s*[:;]?\s*([A-Z0-9]{12,30})\b/i);
    var giocata = unito.match(/GIOCATA\s+DEL\s*[:;]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:.](\d{2})/i);
    var quotaMatch = unito.match(/QUOTA\s+TOTALE\s*[:;]?\s*([0-9]+[.,][0-9]{1,3})/i);
    var stakeMatch = unito.match(/IMPORTO\s+PAGATO\s*[:;]?\s*([0-9.]+(?:,[0-9]{1,2})?)/i);
    var vincitaMatch = unito.match(/VINCITA\s+POTENZIALE\s*[:;]?\s*([0-9.]+(?:,[0-9]{1,2})?)/i);
    var quota = quotaMatch ? numeroQuota(quotaMatch[1]) : null;
    var stake = stakeMatch ? numeroItaliano(stakeMatch[1]) : null;

    var eventi = [];
    var corrente = null;
    var stop = false;
    righe.forEach(function(linea){
      if(/^QUOTA\s+TOTALE/i.test(linea)) stop = true;
      if(stop) return;
      if(sembraEvento(linea)){
        if(corrente) eventi.push(corrente);
        corrente = {evento:normalizzaEvento(linea), righeMercato:[]};
        return;
      }
      if(!corrente || sembraRigaProgramma(linea) || rumoreInterfaccia(linea)) return;
      corrente.righeMercato.push(linea);
    });
    if(corrente) eventi.push(corrente);

    eventi = eventi.map(function(x){
      var mercato = pulisciMercato(x.righeMercato, quota);
      var struttura = tipoMercato(mercato);
      return {evento:x.evento, mercato:mercato, struttura:struttura};
    }).filter(function(x){ return x.evento; });

    if(!adm) avvisi.push("Codice ADM non riconosciuto");
    if(!giocata) avvisi.push("Data e ora della giocata non riconosciute");
    if(!quota || quota <= 1) avvisi.push("Quota non riconosciuta");
    if(!stake || stake <= 0) avvisi.push("Importo non riconosciuto");
    if(!eventi.length) avvisi.push("Evento non riconosciuto");
    eventi.forEach(function(x, i){ if(!x.mercato) avvisi.push("Mercato non riconosciuto per l'evento " + (i + 1)); });

    var data = giocata ? dataIso(giocata[1], giocata[2], giocata[3]) : "";
    return {
      bookmaker:"Sportium",
      ticketId:adm ? normalizzaAdm(adm[1]) : "",
      data:data,
      orarioIngresso:dataOraLocale(giocata),
      quota:quota,
      stake:stake,
      vincitaPotenziale:vincitaMatch ? numeroItaliano(vincitaMatch[1]) : null,
      tipoSchedina:eventi.length > 1 ? "MULTIPLA" : "SINGOLA",
      eventi:eventi,
      avvisi:avvisi,
      testoOcr:raw
    };
  }

  // Sportbet stampa sempre gli importi e le quote con due decimali: se l'OCR
  // perde il separatore ("100 €" per 1,00 €, "135" per 1.35) le ultime due
  // cifre sono i decimali.
  function numeroSportbet(v){
    var s = String(v || "").replace(/\s/g, "");
    if(/^\d{3,}$/.test(s)) return Number(s) / 100;
    if(/[.,]\d{2}$/.test(s)) return numeroItaliano(s.replace(/\.(?=\d{2}$)/, ","));
    return null;
  }

  function lineaIntestazioneSportbet(linea){
    return /\|/.test(linea) && !/\bRef\b/i.test(linea) && /\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}[:.]\d{2}/.test(linea);
  }

  function eventoSportbet(linea){
    var s = compatta(linea).replace(/\s+\d+\s*[-:]\s*\d+\s*$/, "");
    var parti = s.split(/\s*-\s+|\s+-\s*/);
    if(parti.length !== 2 || !parti[0] || !parti[1]) return "";
    return normalizzaEvento(parti[0] + " vs " + parti[1]);
  }

  function mercatoSportbet(nome, segno){
    var n = compatta(nome).toUpperCase();
    var s = compatta(segno).toUpperCase().replace(/[^0-9A-Z+.,\/ ]/g, "");
    if(/^[1IL|]?X2$/.test(n.replace(/\s/g, "")) || n === "1X2" || n === "ESITO FINALE") return s;
    return compatta(n + " " + s);
  }

  // La lista "Mie scommesse" di Sportbet puo' contenere piu' schedine una
  // sotto l'altra: ognuna finisce con la riga "Ref. <codice> | <data ora>".
  // Si legge la prima che ha gli eventi visibili (dettagli aperti).
  function bloccoSportbet(righe){
    var blocchi = [], corrente = [];
    righe.forEach(function(linea){
      corrente.push(linea);
      if(/\bRef\b\.?\s*[A-Z0-9]{10,}/i.test(linea)){ blocchi.push(corrente); corrente = []; }
    });
    var conEventi = blocchi.filter(function(b){ return b.some(lineaIntestazioneSportbet); });
    return {blocco: conEventi[0] || blocchi[0] || righe, totale: blocchi.length};
  }

  function parseSportbet(testo){
    var raw = String(testo || "");
    var sel = bloccoSportbet(righePulite(raw));
    var righe = sel.blocco;
    var avvisi = [];

    var eventi = [];
    for(var i = 0; i < righe.length; i++){
      if(!lineaIntestazioneSportbet(righe[i])) continue;
      var evento = eventoSportbet(righe[i + 1] || "");
      var gamba = {evento:evento, mercato:"", quota:null};
      for(var j = i + 2; j < righe.length && !lineaIntestazioneSportbet(righe[j]); j++){
        if(/^(?:HT|FT|CARDS|CORNERS)\b/i.test(righe[j])) continue;
        var m = righe[j].match(/^(.*?\S)\s+(\S{1,6})\s+(\d+[.,]\d{2}|\d{3,4})\b/);
        if(m){ gamba.mercato = mercatoSportbet(m[1], m[2]); gamba.quota = numeroSportbet(m[3]); break; }
        if(/^IMPORTO\b/i.test(righe[j])) break;
      }
      eventi.push(gamba);
    }

    var stake = null, bonus = null, quota = null, importoFinale = null, esitoBook = "";
    var iImporto = righe.findIndex(function(l){ return /^IMPORTO\b/i.test(l); });
    if(iImporto >= 0 && righe[iImporto + 1]){
      var etichette = righe[iImporto];
      var valori = righe[iImporto + 1];
      var esitoMatch = valori.match(/\b(VIN\w*\s+POTENZIALE|VIN\w*|PERDENT\w*|RIMBORS\w*)\s*([0-9.,]+)\s*€/i);
      if(esitoMatch){
        var tipo = esitoMatch[1].toUpperCase();
        esitoBook = /POTENZIALE/.test(tipo) ? "aperta" : /^VIN/.test(tipo) ? "vinta" : /^PERD/.test(tipo) ? "persa" : "rimborsata";
        importoFinale = numeroSportbet(esitoMatch[2]);
        valori = valori.replace(esitoMatch[0], " ");
      }
      var euro = [], reEuro = /([0-9][0-9.,]*)\s*€/g, e;
      while((e = reEuro.exec(valori))) euro.push(numeroSportbet(e[1]));
      stake = euro[0] != null ? euro[0] : null;
      if(/BONUS/i.test(etichette) && euro.length > 1) bonus = euro[1];
      var resto = valori.replace(/[0-9][0-9.,]*\s*€/g, " ").match(/\b(\d+[.,]\d{2}|\d{3,4})\b/);
      if(resto) quota = numeroSportbet(resto[1]);
    }

    // Controllo incrociato: la quota totale e' il prodotto delle gambe.
    var prodotto = eventi.length && eventi.every(function(x){ return x.quota > 1; })
      ? eventi.reduce(function(p, x){ return p * x.quota; }, 1) : null;
    if(prodotto && (!quota || Math.abs(quota - prodotto) / prodotto > .03)){
      if(quota) avvisi.push("Quota totale letta (" + quota.toFixed(2) + ") diversa dal prodotto delle gambe: uso " + prodotto.toFixed(2));
      quota = Math.round(prodotto * 100) / 100;
    }

    var ref = righe.join("\n").match(/\bRef\b\.?\s*([A-Z0-9]{10,})\s*\|?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:.](\d{2})/i);

    if(!ref) avvisi.push("Codice Ref. e data della giocata non riconosciuti");
    if(!quota || quota <= 1) avvisi.push("Quota non riconosciuta");
    if(!stake || stake <= 0) avvisi.push("Importo non riconosciuto");
    if(!eventi.length) avvisi.push("Evento non riconosciuto (apri i Dettagli della schedina prima dello screenshot)");
    eventi.forEach(function(x, n){
      if(!x.evento) avvisi.push("Evento non riconosciuto per la gamba " + (n + 1));
      if(!x.mercato) avvisi.push("Mercato non riconosciuto per l'evento " + (n + 1));
    });
    if(sel.totale > 1) avvisi.push("Nello screenshot ci sono " + sel.totale + " schedine: letta solo quella con i dettagli aperti");

    return {
      bookmaker:"Sportbet",
      ticketId:ref ? normalizzaAdm(ref[1]) : "",
      data:ref ? dataIso(ref[2], ref[3], ref[4]) : "",
      orarioIngresso:ref ? dataOraLocale([null, ref[2], ref[3], ref[4], ref[5], ref[6]]) : "",
      quota:quota,
      stake:stake,
      bonus:bonus,
      vincitaPotenziale:esitoBook === "persa" ? null : importoFinale,
      esitoBook:esitoBook,
      tipoSchedina:eventi.length > 1 ? "MULTIPLA" : "SINGOLA",
      eventi:eventi.filter(function(x){ return x.evento; }).map(function(x){
        return {evento:x.evento, mercato:x.mercato, quota:x.quota, struttura:tipoMercato(x.mercato)};
      }),
      avvisi:avvisi,
      testoOcr:raw
    };
  }

  function riconosciBookmaker(testo){
    var s = String(testo || "");
    if(/\bADM\s*[:;]/i.test(s) || /GIOCATA\s+DEL/i.test(s)) return "Sportium";
    if(/sportbet/i.test(s) || /\bRef\b\.?\s*[A-Z0-9]{10,}/i.test(s) || /\bSEGNO\b/i.test(s)) return "Sportbet";
    return "Sportium";
  }

  function parseRicevuta(testo){
    return riconosciBookmaker(testo) === "Sportbet" ? parseSportbet(testo) : parseSportium(testo);
  }

  return {
    parseRicevuta:parseRicevuta,
    parseSportbet:parseSportbet,
    riconosciBookmaker:riconosciBookmaker,
    parseSportium:parseSportium,
    tipoMercato:tipoMercato,
    pulisciMercato:pulisciMercato
  };
});
