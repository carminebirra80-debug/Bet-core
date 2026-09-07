(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.BetCoreMarketMetrics=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  var VERSIONE="v0.2";

  function numero(v){
    var n=Number(v);
    return isFinite(n)?n:null;
  }

  function testo(v){
    return String(v==null?"":v).trim().toLowerCase().replace(/\s+/g," ");
  }

  function reale(r){
    return !r.osservata&&(!r.statoCore||r.statoCore==="ufficiale");
  }

  function esito(r){
    var e=testo(r.esito);
    if(e==="vinta"||e==="vinto"||e==="won"||e==="win") return 1;
    if(e==="persa"||e==="perso"||e==="lost"||e==="loss") return 0;
    if(e==="rimborsata"||e==="rimborsato"||e==="void"||e==="push"||e==="refund") return "push";
    return null;
  }

  function chiave(r,indice){
    var evento=testo(r.evento),mercato=testo(r.mercato),fase=String(r.faseIngresso||"PRE").toUpperCase();
    if(evento&&mercato) return [r.data||"",testo(r.tipster),evento,mercato,fase].join("|");
    return "storico|"+String(r.cloudLegacyId||r.id||indice)+"|"+fase;
  }

  function clamp(p){return Math.min(1-1e-15,Math.max(1e-15,p));}
  function brier(p,y){return Math.pow(p-y,2);}
  function logLoss(p,y){p=clamp(p);return -(y*Math.log(p)+(1-y)*Math.log(1-p));}

  function crea(famiglia,fase){
    return {famiglia:famiglia,fase:fase,n:0,vinte:0,perse:0,rimborsate:0,aperte:0,osservate:0,
      stake:0,profitto:0,quotaSomma:0,quotaN:0,clvSomma:0,clvN:0,
      scoreN:0,brierSomma:0,logLossSomma:0,marketBrierSomma:0,marketLogLossSomma:0,
      shrinkBrierSomma:0,shrinkLogLossSomma:0,pSomma:0,ySomma:0,marketPSomma:0,
      missingP:0,missingTimestamp:0,missingQuote:0,conflitti:0};
  }

  function calcola(righe){
    var gruppi={},ordine=[];
    (righe||[]).forEach(function(r,indice){
      var k=chiave(r,indice);
      if(!gruppi[k]){gruppi[k]={righe:[],chiave:k};ordine.push(k);}
      gruppi[k].righe.push(r);
    });

    var mappa={};
    function voce(famiglia,fase){
      var k=famiglia+"|"+fase;
      if(!mappa[k])mappa[k]=crea(famiglia,fase);
      return mappa[k];
    }

    ordine.forEach(function(k){
      var rs=gruppi[k].righe;
      var base=rs.find(function(r){return reale(r);})||rs[0];
      var famiglia=base.famigliaMercato||"NON_CLASSIFICATO";
      var fase=String(base.faseIngresso||"PRE").toUpperCase();
      var d=voce(famiglia,fase);
      var chiusi=rs.map(esito).filter(function(x){return x!==null;});
      var unici={};chiusi.forEach(function(x){unici[String(x)]=true;});
      var valori=Object.keys(unici);
      var haReale=rs.some(reale);
      if(!haReale)d.osservate++;
      rs.filter(reale).forEach(function(r){
        d.stake+=Number(r.stake||0);d.profitto+=Number(r.profitto||0);
        var q=numero(r.quota),qc=numero(r.quotaChiusura);
        if(q&&q>1){d.quotaSomma+=q;d.quotaN++;}
        if(q&&q>1&&qc&&qc>1){d.clvSomma+=(q/qc-1)*100;d.clvN++;}
      });
      if(!chiusi.length){d.aperte++;return;}
      d.n++;
      if(valori.length!==1){d.conflitti++;return;}
      if(valori[0]==="push"){d.rimborsate++;return;}
      var y=Number(valori[0]);
      if(y===1)d.vinte++;else d.perse++;

      var conP=rs.filter(function(r){
        var p=numero(r.probabilitaStimata);return p!==null&&p>0&&p<1;
      });
      if(!conP.length){d.missingP++;return;}
      var pUniche={};conP.forEach(function(r){pUniche[Number(r.probabilitaStimata).toFixed(12)]=true;});
      if(Object.keys(pUniche).length!==1){d.conflitti++;return;}
      var rP=conP.find(function(r){return reale(r);})||conP[0];
      if(!rP.probabilitaTimestamp){d.missingTimestamp++;return;}
      var p=Number(rP.probabilitaStimata),q=numero(rP.quota);
      if(q===null||q<=1){d.missingQuote++;return;}
      var pm=clamp(1/q);
      var ps=(p+pm)/2;
      d.scoreN++;d.pSomma+=p;d.ySomma+=y;d.marketPSomma+=pm;
      d.brierSomma+=brier(p,y);d.logLossSomma+=logLoss(p,y);
      d.marketBrierSomma+=brier(pm,y);d.marketLogLossSomma+=logLoss(pm,y);
      d.shrinkBrierSomma+=brier(ps,y);d.shrinkLogLossSomma+=logLoss(ps,y);
    });

    return Object.keys(mappa).map(function(k){
      var d=mappa[k];
      d.roi=d.stake?d.profitto/d.stake*100:0;
      d.quotaMedia=d.quotaN?d.quotaSomma/d.quotaN:null;
      d.clv=d.clvN?d.clvSomma/d.clvN:null;
      d.brier=d.scoreN?d.brierSomma/d.scoreN:null;
      d.logLoss=d.scoreN?d.logLossSomma/d.scoreN:null;
      d.marketBrier=d.scoreN?d.marketBrierSomma/d.scoreN:null;
      d.marketLogLoss=d.scoreN?d.marketLogLossSomma/d.scoreN:null;
      d.shrinkBrier=d.scoreN?d.shrinkBrierSomma/d.scoreN:null;
      d.shrinkLogLoss=d.scoreN?d.shrinkLogLossSomma/d.scoreN:null;
      d.calibrationGap=d.scoreN?Math.abs(d.pSomma/d.scoreN-d.ySomma/d.scoreN):null;
      d.edgeMedio=d.scoreN?(d.pSomma-d.marketPSomma)/d.scoreN:null;
      return d;
    }).sort(function(a,b){
      if(a.famiglia==="NON_CLASSIFICATO"&&b.famiglia!=="NON_CLASSIFICATO")return 1;
      if(b.famiglia==="NON_CLASSIFICATO"&&a.famiglia!=="NON_CLASSIFICATO")return -1;
      return b.n-a.n||a.famiglia.localeCompare(b.famiglia)||a.fase.localeCompare(b.fase);
    });
  }

  return {VERSIONE:VERSIONE,calcola:calcola,brier:brier,logLoss:logLoss};
});
