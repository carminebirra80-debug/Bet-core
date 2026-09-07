(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.BetCoreSyncMerge=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  // Il cloud e' autorevole per le righe gia note. Il locale prevale soltanto
  // quando porta una modifica esplicitamente marcata o una riga mai inviata.
  function pianifica(locali,remoti,chiave){
    var perId={},invio=[],uniti=[];
    (remoti||[]).forEach(function(r){perId[String(chiave(r))]=r;});
    (locali||[]).forEach(function(l){
      var k=String(chiave(l)),r=perId[k];
      if(l.cloudDirty||(!r&&!l.cloudSynced)){
        invio.push(l);uniti.push(l);delete perId[k];
      }else if(r){
        uniti.push(r);delete perId[k];
      }
      // Se era gia sincronizzato ed e' scomparso dal cloud, resta escluso:
      // cosi una cancellazione remota non viene ricreata da una cache vecchia.
    });
    Object.keys(perId).forEach(function(k){uniti.push(perId[k]);});
    return {invio:invio,uniti:uniti};
  }

  return {pianifica:pianifica};
});
