const {test}=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../chat-engine.js');
const ai=require('../chat-ai.js');
const {items}=require('./catalog.cjs');

const local=engine.createLocalProvider();
const URL_='https://reseguide-ai.example.workers.dev/api/travel-chat';
const kohChang=items.find(p=>p.id==='place:112');
const hotel=items.find(p=>p.type==='hotel'&&p.region==='Koh Chang');
const {toCompact}=ai.compactIds(items);
const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('Payload carries only question, previous context and the visible public catalog',()=>{
  const favorites=new Set([kohChang.id,hotel.id]);
  const hidden=new Set(['place:111']);
  const body=ai.buildPayload('Var kan jag snorkla?',{items,favorites,hidden,previous:{regions:['Östra Thailand'],categories:['Strand'],types:[],favoritesOnly:false,terms:['x']},previousQuery:'Stränder i östra Thailand',previousIds:[kohChang.id,'place:9999']});
  assert.deepEqual(Object.keys(body).sort(),['catalog','previous','query','v']);
  assert.equal(body.catalog.length,items.length-1);
  assert.ok(!body.catalog.some(e=>e[0]==='p111'));
  assert.deepEqual(body.catalog.find(e=>e[0]==='p112'),['p112',kohChang.name,kohChang.region,'',kohChang.country,kohChang.category,'']);
  assert.deepEqual(body.previous,{query:'Stränder i östra Thailand',ids:['p112'],filter:{regions:['Östra Thailand'],categories:['Strand'],types:[],favoritesOnly:false}});
  const text=JSON.stringify(body);
  assert.ok(!/favorit|vn2_|sea\d+_/i.test(text.replace('"favoritesOnly":false','')),'no favorites or storage keys');
  assert.equal(new Set(body.catalog.map(e=>e[0])).size,body.catalog.length);
});

test('AI answer resolves only known local IDs and keeps hidden objects out',()=>{
  const hidden=new Set([hotel.id]);
  const r=ai.toResult({reply:'Koh Chang passar bra.',ids:['p112',toCompact.get(hotel.id),'p9999','place:1',42]},'Snorkling?',{items,hidden});
  assert.deepEqual(r.items.map(p=>p.id),['place:112']);
  assert.equal(r.source,'ai');
  assert.equal(r.message,'Koh Chang passar bra.');
  assert.equal(r.intent.favoritesOnly,false);
});

test('Favorites and broad filters are applied locally, with fixed safety notes',()=>{
  const favorites=new Set([kohChang.id,hotel.id]);
  const fav=ai.toResult({reply:'Dina favoriter i Thailand:',ids:['p1'],filter:{regions:['Thailand'],favoritesOnly:true}},'mina favoriter i thailand',{items,favorites});
  assert.deepEqual(fav.items.map(p=>p.id).sort(),[kohChang.id,hotel.id].sort());
  assert.equal(fav.intent.favoritesOnly,true);
  assert.match(fav.message,/ungefärliga områdespunkter/);
  const none=ai.toResult({reply:'',ids:[],filter:{favoritesOnly:true}},'mina favoriter',{items});
  assert.equal(none.items.length,0);
  assert.match(none.message,/Inga sparade favoriter/);
  const beaches=ai.toResult({reply:'Alla stränder i norra Vietnam.',ids:[],filter:{regions:['Norr'],categories:['Strand'],types:['place','robot']}},'alla stränder',{items});
  assert.ok(beaches.items.length>1&&beaches.items.every(p=>p.region==='Norr'&&p.category==='Strand'));
  const price=ai.toResult({reply:'Det kostar 300 kr.',ids:[toCompact.get(hotel.id)]},'Hotell på Koh Chang under 500 kr med AC',{items});
  assert.match(price.message,/inte verifierade/);
});

test('Provider posts JSON without credentials and returns AI results',async()=>{
  let call;
  const fetch=async(url,init)=>{call={url,init};return reply(200,{reply:'Prova Koh Chang.',ids:['p112'],model:'m'});};
  const p=ai.createAIProvider({endpoint:URL_,local,fetch});
  const r=await p.search('Snorkling i Thailand?',{items});
  assert.equal(call.url,URL_);
  assert.equal(call.init.method,'POST');
  assert.equal(call.init.credentials,'omit');
  assert.equal(call.init.headers['Content-Type'],'application/json');
  assert.equal(JSON.parse(call.init.body).query,'Snorkling i Thailand?');
  assert.equal(r.source,'ai');
  assert.deepEqual(r.items.map(p=>p.id),['place:112']);
});

test('Quota, rate limit, server errors, bad JSON and timeouts fall back to local search',async()=>{
  const cases=[
    [async()=>reply(503,{error:'quota'}),/gratiskvot/],
    [async()=>reply(429,{error:'rate_limited'}),/Vänta en minut/],
    [async()=>reply(502,{error:'ai_failed'}),/inte tillgänglig/],
    [async()=>({ok:true,status:200,json:async()=>{throw new Error('bad');}}),/inte tillgänglig/],
    [async()=>{throw new TypeError('Failed to fetch');},/inte tillgänglig/],
    [(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted')))),/inte i tid/]
  ];
  for(const [fetch,note] of cases){
    const r=await ai.createAIProvider({endpoint:URL_,local,fetch,timeoutMs:30}).search('Hotell på Koh Chang',{items});
    assert.equal(r.source,'local');
    assert.match(r.message,note);
    assert.ok(r.items.length>0&&r.items.every(p=>p.type==='hotel'&&p.region==='Koh Chang'));
  }
});

test('Clearing the chat aborts the request without a fallback answer',async()=>{
  const controller=new AbortController();
  const fetch=(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  const pending=ai.createAIProvider({endpoint:URL_,local,fetch}).search('Hej',{items,signal:controller.signal});
  controller.abort();
  await assert.rejects(pending);
});

test('Only https endpoints (or local test servers) are accepted',()=>{
  assert.equal(ai.ENDPOINT,'https://reseguide-ai.andersmarieresa.workers.dev/api/travel-chat');
  for(const bad of ['','http://example.com/api','javascript:alert(1)','https://','ftp://x/y']) assert.equal(ai.createAIProvider({endpoint:bad,local,fetch:async()=>{}}),null);
  assert.ok(ai.createAIProvider({endpoint:'http://127.0.0.1:8787/api/travel-chat',local,fetch:async()=>{}}));
});
