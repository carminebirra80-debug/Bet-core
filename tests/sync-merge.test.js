"use strict";

const assert=require("node:assert/strict");
const sync=require("../sync-merge.js");
const key=x=>x.id;

const locale=[
  {id:"cloud-wins",debrief:"cache vecchia",cloudSynced:true},
  {id:"local-dirty",debrief:"correzione locale",cloudSynced:true,cloudDirty:true},
  {id:"new-local",debrief:"nuova",cloudDirty:true},
  {id:"deleted-remote",cloudSynced:true}
];
const remoto=[
  {id:"cloud-wins",debrief:"debrief remoto",cloudSynced:true},
  {id:"local-dirty",debrief:"prima della correzione",cloudSynced:true},
  {id:"remote-only",debrief:"altro dispositivo",cloudSynced:true}
];

const piano=sync.pianifica(locale,remoto,key);
assert.deepEqual(piano.invio.map(x=>x.id),["local-dirty","new-local"]);
assert.equal(piano.uniti.find(x=>x.id==="cloud-wins").debrief,"debrief remoto");
assert.equal(piano.uniti.find(x=>x.id==="local-dirty").debrief,"correzione locale");
assert.ok(piano.uniti.some(x=>x.id==="remote-only"));
assert.ok(!piano.uniti.some(x=>x.id==="deleted-remote"),"una cache vecchia non deve ricreare una cancellazione remota");

console.log("sync-merge: ok");
