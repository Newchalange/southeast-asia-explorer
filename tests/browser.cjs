const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Optional: PW_CHANNEL=chrome and UNPKG_DIR=<folder with leaflet@1.9.4/...> for machines without Edge or CDN access.
async function cdn(page){
  if(!process.env.UNPKG_DIR)return;
  await page.route(/^https:\/\/unpkg\.com\//,r=>{const rel=decodeURIComponent(new URL(r.request().url()).pathname);const file=path.join(process.env.UNPKG_DIR,rel);
    try{r.fulfill({status:200,contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});}catch{r.abort();}});
}
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:process.env.PW_CHANNEL||'msedge',headless:true});
  try{
    for(const width of [1280,390,320]){
      const page=await browser.newPage({viewport:{width,height:850}});const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      // Suppress image/tiles only; the real Leaflet scripts still run.
      await page.route(/wikipedia\.org|wikimedia\.org|arcgisonline\.com/,r=>r.abort());await cdn(page);
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>typeof L?.layerGroup==='function');
      const before=await page.evaluate(()=>({days:JSON.stringify(days),favorites:JSON.stringify([...favorites]),hidden:JSON.stringify([...hiddenPlaces]),layers:JSON.stringify([...selectedMapLayers])}));
      await page.locator('#travelChat summary').click();
      async function ask(q){await page.locator('#chatQuery').fill(q);await page.locator('#travelChat form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.querySelector('#travelChat [type=submit]').disabled);}
      await ask('Hotell på Koh Chang under 500 kr');
      assert.ok(await page.locator('.chat-result').count()>0);
      assert.match(await page.locator('.chat-log').innerText(),/inte bekräftade/);
      assert.equal(await page.locator('.chat-result-pin').count(),1,'same-area hotels grouped');
      assert.ok(await page.evaluate(()=>map.getZoom())>5);
      await page.locator('.chat-result .row button').nth(1).click();
      await ask('och bara favoriter');assert.equal(await page.locator('.chat-result').count(),1);
      await ask('Stränder i östra Thailand');assert.ok(await page.locator('.chat-result').count()>1);
      await page.evaluate(()=>hidePlace(111));
      assert.ok(!(await page.locator('.chat-result strong').allTextContents()).some(t=>/^\d+\. Koh Samet$/.test(t)));
      await page.evaluate(()=>restorePlace(111));
      await ask('Atlantis');assert.equal(await page.locator('.chat-result-pin').count(),0);
      await ask('<img src=x onerror=alert(1)>');assert.equal(await page.locator('.chat-log img').count(),0);
      await page.locator('#chatClear').click();assert.equal(await page.locator('.chat-result').count(),0);
      const after=await page.evaluate(()=>({days:JSON.stringify(days),favorites:JSON.stringify([...favorites]),hidden:JSON.stringify([...hiddenPlaces]),layers:JSON.stringify([...selectedMapLayers])}));
      assert.deepEqual(after,before,'chat preserves existing plan, place favorites and filters');
      for(const tab of ['favorites','plan','budget','transport','hotels','explore']){await page.locator('[data-tab="'+tab+'"]').click();assert.ok(await page.locator('#'+tab).isVisible());}
      await page.locator('#search').fill('Wat Pho');assert.ok(await page.locator('#results .place').count()>0);
      await page.locator('#search').fill('');
      await page.locator('[data-layer="flights"]').click();assert.ok(await page.locator('.flightAirportPin').count()>0);
      await page.locator('[data-layer="all"]').click();
      await ask('Natur i Vietnam');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
      await page.locator('#travelChat').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(root,'test-results','chat-'+width+'.png'),fullPage:false});
      assert.deepEqual(errors,[]);console.log('PASS browser '+width+'px: chat, map, favorites, filters, flights, tabs, storage, layout');await page.close();
    }
    // AI mode against a mocked worker endpoint: opt-in, payload privacy, ID validation, text-only replies and fallback.
    {
      const endpoint='https://reseguide-ai.test.workers.dev/api/travel-chat';
      const page=await browser.newPage({viewport:{width:390,height:850}});const errors=[];const bodies=[];const answers=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(url=>{globalThis.TRAVEL_AI_ENDPOINT=url;},endpoint);
      await page.route(/wikipedia\.org|wikimedia\.org|arcgisonline\.com/,r=>r.abort());await cdn(page);
      await page.route(endpoint,r=>{bodies.push(r.request().postDataJSON());const [status,body]=answers.shift();r.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});});
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>typeof L?.layerGroup==='function');
      const before=await page.evaluate(()=>({days:JSON.stringify(days),favorites:JSON.stringify([...favorites]),layers:JSON.stringify([...selectedMapLayers])}));
      await page.locator('#travelChat summary').click();
      assert.match(await page.locator('#travelChat summary').innerText(),/gratis AI/);
      assert.equal(await page.locator('#chatAI').isChecked(),false,'AI is opt-in');
      assert.match(await page.locator('#chatMode').innerText(),/utan AI-API/);
      async function ask(q){await page.locator('#chatQuery').fill(q);await page.locator('#travelChat form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.querySelector('#travelChat [type=submit]').disabled);}
      await ask('Hotell på Koh Chang');assert.equal(bodies.length,0,'nothing is sent before opt-in');
      await page.locator('#chatAI').check();
      assert.match(await page.locator('#chatMode').innerText(),/Cloudflare Workers AI/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('sea15_chat_ai')),'1');
      answers.push([200,{reply:'Koh Chang passar bra.\n\nTa båten från Trat.',ids:['p112','h5','p9999','place:1'],model:'test'}]);
      await ask('Var kan jag snorkla med barn?');
      assert.match(await page.locator('.chat-log').innerText(),/AI: Koh Chang passar bra\./);
      assert.equal(await page.locator('.chat-result').count(),2,'unknown IDs are ignored');
      assert.ok(await page.locator('.chat-result-pin').count()>=1);
      const first=bodies[0];
      assert.equal(first.v,1);assert.equal(first.catalog.length,264);assert.equal(first.query,'Var kan jag snorkla med barn?');
      assert.deepEqual(first.previous.ids.length>0,true,'previous local results are context');
      assert.ok(!/vn2_|sea\d+_|days/.test(JSON.stringify(first)),'no storage or plan is sent');
      await page.locator('.chat-result .row button').nth(1).click();
      answers.push([200,{reply:'Här är dina sparade favoriter.',ids:[],filter:{favoritesOnly:true}}]);
      await ask('och bara favoriter');
      assert.equal(await page.locator('.chat-result').count(),1,'favorites filtered locally');
      assert.equal(bodies[1].previous.query,'Var kan jag snorkla med barn?');
      answers.push([200,{reply:'<img src=x onerror=alert(1)>',ids:['p1']}]);
      await ask('test');assert.equal(await page.locator('.chat-log img').count(),0);
      answers.push([503,{error:'quota'}]);
      await ask('Hotell på Koh Chang');
      assert.match(await page.locator('.chat-log').innerText(),/gratiskvot för AI:n är slut/);
      assert.ok(await page.locator('.chat-result').count()>0,'local fallback results');
      await page.reload({waitUntil:'networkidle'});await page.locator('#travelChat summary').click();
      assert.equal(await page.locator('#chatAI').isChecked(),true,'choice remembered');
      await page.locator('#chatAI').uncheck();await ask('Stränder i östra Thailand');assert.equal(bodies.length,4,'AI off sends nothing');
      const after=await page.evaluate(()=>({days:JSON.stringify(days),favorites:JSON.stringify([...favorites]),layers:JSON.stringify([...selectedMapLayers])}));
      assert.equal(after.days,before.days);assert.equal(after.layers,before.layers);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
      await page.locator('#chatAI').check();await page.locator('#travelChat').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(root,'test-results','chat-ai-390.png')});
      assert.deepEqual(errors,[]);console.log('PASS AI mode: opt-in, privacy, validated IDs, local favorites, text-only, quota fallback');await page.close();
    }
    const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#travelChat summary').click();await page.locator('#chatQuery').fill('Hotell på Koh Chang');await page.locator('#travelChat form').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>!document.querySelector('#travelChat [type=submit]').disabled);
    assert.ok(await page.locator('.chat-result').count()>0);assert.match(await page.locator('.chat-log').innerText(),/Kartan kunde inte laddas/);console.log('PASS unavailable map: local search remains usable');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
