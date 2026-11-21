const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const width of [1280,390,320]){
      const page=await browser.newPage({viewport:{width,height:850}});const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      // Suppress image/tiles only; the real Leaflet scripts still run.
      await page.route(/wikipedia\.org|wikimedia\.org|arcgisonline\.com/,r=>r.abort());
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
    const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#travelChat summary').click();await page.locator('#chatQuery').fill('Hotell på Koh Chang');await page.locator('#travelChat form').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>!document.querySelector('#travelChat [type=submit]').disabled);
    assert.ok(await page.locator('.chat-result').count()>0);assert.match(await page.locator('.chat-log').innerText(),/Kartan kunde inte laddas/);console.log('PASS unavailable map: local search remains usable');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
