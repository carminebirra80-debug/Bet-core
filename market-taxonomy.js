(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.BetCoreMarketTaxonomy=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  var VERSIONE="v0.1";
  var ETICHETTE={
    NON_CLASSIFICATO:"Non classificato",ESITO_1X2:"Esito 1X2",DOPPIA_CHANCE:"Doppia chance",
    DRAW_NO_BET:"Draw no bet",TOTALI_GOL:"Over/Under",GOAL_NO_GOAL:"Goal/No Goal",
    MULTIGOL:"Multigol",MULTIGOL_SQUADRA:"Multigol squadra",GOL_SQUADRA:"Gol squadra",
    HANDICAP:"Handicap",CORNER:"Corner",CARTELLINI:"Cartellini",PLAYER_PROP:"Giocatori",
    COMBO:"Combo",MULTIPLA:"Multipla",ALTRO:"Altro"
  };

  function compatta(v){
    return String(v||"").replace(/[\u2012\u2013\u2014\u2212]/g,"-")
      .replace(/,/g,".").replace(/\s+/g," ").trim();
  }

  function normalizza(v){
    return compatta(v).toUpperCase()
      .replace(/MULTI\s*GOAL/g,"MULTIGOL")
      .replace(/\bMULTIG(?:L|OL)?\b/g,"MULTIGOL")
      .replace(/\bDC\s+OUT\b/g,"X2")
      .replace(/\bMG\s*(\d+\s*-\s*\d+)\b/g,"MULTIGOL $1")
      .replace(/\bOV\s*(\d)/g,"OVER $1")
      .replace(/\bUN\s*(\d)/g,"UNDER $1")
      .replace(/NO\s+GOL\b/g,"NO GOAL")
      .replace(/\bBTTS\s*NO\b/g,"NO GOAL")
      .replace(/\bBTTS\s*(?:YES|SI)?\b/g,"GOAL")
      .replace(/\bSQUADRA\s+CASA\b/g,"CASA")
      .replace(/\bSQUADRA\s+OSPITE\b/g,"OSPITE")
      .replace(/\s*\+\s*/g," + ")
      .replace(/\s*-\s*/g,"-")
      .replace(/\s+/g," ").trim();
  }

  function componente(famiglia,ambito,selezione,linea){
    return {famiglia:famiglia,ambito:ambito||"PARTITA",selezione:selezione||"",linea:linea||null};
  }

  function risultato(famiglia,ambito,selezione,linea,componenti){
    return {versione:VERSIONE,famiglia:famiglia,ambito:ambito||"PARTITA",
      selezione:selezione||"",linea:linea||null,componenti:componenti||[]};
  }

  function classificaSingola(mercato){
    var s=normalizza(mercato),m,componenti=[];
    if(!s) return risultato("NON_CLASSIFICATO","PARTITA","",null,[]);
    if(s==="MULTIPLA") return risultato("MULTIPLA","MULTIPLA","Multipla",null,[]);

    var reTeam=/MULTIGOL\s+(\d+)-(\d+)\s+(CASA|OSPITE)/g;
    while((m=reTeam.exec(s))){
      var team=m[3],lineaTeam=m[1]+"-"+m[2];
      componenti.push(componente("MULTIGOL_SQUADRA",team,"Multigol "+team.toLowerCase()+" "+lineaTeam,lineaTeam));
    }
    if(componenti.length){
      if(componenti.length===1) return risultato("MULTIGOL_SQUADRA",componenti[0].ambito,componenti[0].selezione,componenti[0].linea,componenti);
      return risultato("COMBO","MISTA",componenti.map(function(x){return x.selezione;}).join(" + "),null,componenti);
    }

    var dc=s.match(/(?:^|\W)(1X|X2|12)(?:\W|$)/);
    var esito=s.match(/^(1|X|2)(?:\s*\+|\s*$)/);
    var mg=s.match(/MULTIGOL\s+(\d+)-(\d+)/);
    var totale=s.match(/\b(OVER|UNDER)\s*(\d+(?:\.\d+)?)\b/);
    var noGoal=/\bNO GOAL\b/.test(s);
    var goal=!noGoal&&/\bGOAL\b/.test(s);
    if(esito) componenti.push(componente("ESITO_1X2","PARTITA",esito[1],null));
    if(dc) componenti.push(componente("DOPPIA_CHANCE","PARTITA",dc[1],null));
    if(mg) componenti.push(componente("MULTIGOL","PARTITA","Multigol "+mg[1]+"-"+mg[2],mg[1]+"-"+mg[2]));
    if(totale) componenti.push(componente("TOTALI_GOL","PARTITA",(totale[1]==="OVER"?"Over ":"Under ")+totale[2],totale[2]));
    if(noGoal) componenti.push(componente("GOAL_NO_GOAL","PARTITA","No Goal",null));
    else if(goal) componenti.push(componente("GOAL_NO_GOAL","PARTITA","Goal",null));
    if(componenti.length>1 || (/\+/.test(s)&&componenti.length)){
      return risultato("COMBO","PARTITA",componenti.map(function(x){return x.selezione;}).join(" + "),null,componenti);
    }

    if(/\b(?:MARCATORE|TIR(?:O|I)\s+IN\s+PORTA|ASSIST|GIOCATORE|PLAYER)\b/.test(s))
      return risultato("PLAYER_PROP","GIOCATORE",compatta(mercato),null,[]);
    if(/\b(?:CARTELLIN|AMMONIT|ESPULS|BOOKING)\w*\b/.test(s))
      return risultato("CARTELLINI","PARTITA",compatta(mercato),null,[]);
    if(/\b(?:CORNER|CALCI\s+D.ANGOLO)\b/.test(s))
      return risultato("CORNER","PARTITA",compatta(mercato),null,[]);
    if(/\bHANDICAP\b|(?:^|\s)[+-]\d/.test(s))
      return risultato("HANDICAP","PARTITA",compatta(mercato),null,[]);

    var teamGoal=s.match(/\b(CASA|OSPITE)\b.*\b(OVER|UNDER)\s*(\d+(?:\.\d+)?)\b/);
    if(teamGoal){
      var selTeam=(teamGoal[1]==="CASA"?"Casa ":"Ospite ")+(teamGoal[2]==="OVER"?"Over ":"Under ")+teamGoal[3];
      return risultato("GOL_SQUADRA",teamGoal[1],selTeam,teamGoal[3],[componente("GOL_SQUADRA",teamGoal[1],selTeam,teamGoal[3])]);
    }
    if(mg) return risultato("MULTIGOL","PARTITA","Multigol "+mg[1]+"-"+mg[2],mg[1]+"-"+mg[2],[componente("MULTIGOL","PARTITA","Multigol "+mg[1]+"-"+mg[2],mg[1]+"-"+mg[2])]);
    if(totale) return risultato("TOTALI_GOL","PARTITA",(totale[1]==="OVER"?"Over ":"Under ")+totale[2],totale[2],[componente("TOTALI_GOL","PARTITA",totale[0],totale[2])]);
    if(noGoal||goal) return risultato("GOAL_NO_GOAL","PARTITA",noGoal?"No Goal":"Goal",null,[componente("GOAL_NO_GOAL","PARTITA",noGoal?"No Goal":"Goal",null)]);
    if(/^DNB\s*[12]$|DRAW\s+NO\s+BET/.test(s)) return risultato("DRAW_NO_BET","PARTITA",s,null,[]);
    if(/^(?:1X|X2|12)$/.test(s)) return risultato("DOPPIA_CHANCE","PARTITA",s,null,[componente("DOPPIA_CHANCE","PARTITA",s,null)]);
    if(/^(?:1|X|2)$/.test(s)) return risultato("ESITO_1X2","PARTITA",s,null,[componente("ESITO_1X2","PARTITA",s,null)]);
    return risultato("ALTRO","PARTITA",compatta(mercato),null,[]);
  }

  function classifica(mercato,tipoSchedina,gambe){
    if(String(tipoSchedina||"").toUpperCase()==="MULTIPLA"){
      var parti=(Array.isArray(gambe)?gambe:[]).map(function(g){
        var c=classificaSingola(g&&g.mercato);
        return {evento:String(g&&g.evento||""),famiglia:c.famiglia,ambito:c.ambito,
          selezione:c.selezione,linea:c.linea,componenti:c.componenti};
      });
      return risultato("MULTIPLA","MULTIPLA",parti.length?"Multipla · "+parti.length+" gambe":"Multipla",null,parti);
    }
    return classificaSingola(mercato);
  }

  function faseCampione(n){
    n=Number(n)||0;
    if(n<20) return {codice:"OSSERVAZIONE",etichetta:"Osservazione",nota:"Campione descrittivo"};
    if(n<50) return {codice:"SEGNALE_PRELIMINARE",etichetta:"Segnale preliminare",nota:"Non modifica il Core"};
    if(n<100) return {codice:"EVIDENZA_UTILE",etichetta:"Evidenza utile",nota:"Da validare walk-forward"};
    return {codice:"BASE_SOLIDA",etichetta:"Base più solida",nota:"Serve comunque verifica out-of-sample"};
  }

  function etichetta(famiglia){return ETICHETTE[famiglia]||ETICHETTE.ALTRO;}

  return {VERSIONE:VERSIONE,ETICHETTE:ETICHETTE,normalizza:normalizza,
    classifica:classifica,classificaSingola:classificaSingola,faseCampione:faseCampione,etichetta:etichetta};
});
