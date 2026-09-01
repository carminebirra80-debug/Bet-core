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

  return {
    parseSportium:parseSportium,
    tipoMercato:tipoMercato,
    pulisciMercato:pulisciMercato
  };
});
