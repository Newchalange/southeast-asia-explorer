/* Adapter around existing app state. Chat never changes existing filters or plan. */
(() => {
  'use strict';
  if(!globalThis.TravelChat) return;
  const catalog=TravelChat.catalog(places,hotelCandidates,hotelAreaCoords);
  const byId=new Map(catalog.map(p=>[p.id,p]));
  const provider=TravelChat.createLocalProvider();
  let previous=null, layer=null, active=[], request=0;
  const host=document.createElement('details');host.className='chat-panel';host.id='travelChat';
  host.innerHTML=`<summary>💬 Kartassistent · gratis</summary><p class="hint">Sök på svenska bland ${places.length} platser och ${hotelCandidates.length} hotellkandidater. Regelbaserad sökning utan AI-API. Chatten sparas inte eller skickas till en server. Kartor och bilder använder internet.</p><div class="chat-examples"><button class="btn" type="button">Stränder i östra Thailand</button><button class="btn" type="button">Hotell på Koh Chang</button><button class="btn" type="button">Mina favoriter i Vietnam</button></div><div class="chat-log" role="log" aria-label="Samtal med kartassistenten" aria-live="polite" aria-relevant="additions"></div><form><div class="chat-field"><label for="chatQuery">Vad vill du hitta?</label><input id="chatQuery" maxlength="500" autocomplete="off" placeholder="T.ex. natur och stränder i Vietnam" required></div><button class="btn primary" type="submit">Sök</button></form><p class="hint">Fortsätt med ”och bara favoriter”. En ny vanlig fråga startar en ny sökning. Gula numrerade nålar visar chattens träffar, även utanför vanliga kartfilter.</p><div class="row"><button class="btn" type="button" id="chatMap">Visa träffarna på kartan</button><button class="btn" type="button" id="chatClear">Rensa chatten</button></div><div class="chat-results" aria-label="Sökresultat"></div>`;
  document.querySelector('.hero').after(host);
  const log=host.querySelector('.chat-log'), results=host.querySelector('.chat-results'), input=host.querySelector('input'), submit=host.querySelector('[type=submit]');
  const badge=document.createElement('div');badge.className='chat-map-status';badge.hidden=true;document.querySelector('.mapwrap').append(badge);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=fn;return b;};
  function state(){return {items:catalog,previous,favorites:new Set([...favorites].map(id=>'place:'+id).concat([...hotelFavorites].flatMap(name=>catalog.filter(p=>p.type==='hotel'&&p.name===name).map(p=>p.id)))),hidden:new Set([...hiddenPlaces].map(id=>'place:'+id).concat([...hiddenHotels].map(key=>'hotel:'+key)))};}
  function say(text,user=false){const p=document.createElement('p');p.textContent=(user?'Du: ':'Assistent: ')+text;log.append(p);while(log.children.length>12)log.firstChild.remove();log.scrollTop=log.scrollHeight;}
  function mapReady(){return typeof L!=='undefined'&&typeof L.layerGroup==='function'&&map&&typeof map.fitBounds==='function';}
  function showMap(focus=false){
    if(layer){layer.remove();layer=null;}
    const hidden=state().hidden;active=active.filter(p=>!hidden.has(p.id));
    badge.hidden=!active.length;
    badge.textContent='💬 '+active.length+' chatträffar · gula numrerade nålar';
    if(!mapReady()){badge.hidden=true;return false;}
    layer=L.layerGroup().addTo(map);
    const groups=new Map();
    active.forEach((p,i)=>{if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;const key=p.lat+','+p.lon;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,n:i+1});});
    for(const group of groups.values()){
      const first=group[0], popup=document.createElement('div');
      group.forEach(({p,n})=>{const line=document.createElement('p');line.textContent=n+'. '+p.name+(p.approximate?' · ungefärlig områdespunkt':'');popup.append(line,button(p.type==='place'?'Visa detaljer':'Visa hotell',()=>openResult(p)));});
      const label=group.length>1?first.n+'+':String(first.n);
      L.marker([first.p.lat,first.p.lon],{zIndexOffset:1000,title:group.map(x=>x.p.name).join(', '),icon:L.divIcon({className:'',html:'<div class="chat-result-pin">'+label+'</div>',iconSize:[36,36],iconAnchor:[18,18]})}).bindPopup(popup,{maxHeight:220}).addTo(layer);
    }
    if(focus&&groups.size){document.querySelector('.mapwrap').scrollIntoView({behavior:'smooth',block:'center'});map.invalidateSize();map.fitBounds([...groups.values()].map(g=>[g[0].p.lat,g[0].p.lon]),{paddingTopLeft:[45,150],paddingBottomRight:[45,65],maxZoom:12});}
    return true;
  }
  function openResult(p){if(p.type==='place')openModal(p.sourceId);else{hotelAreaSelect.value=p.region;document.getElementById('hotelFavOnly').checked=false;renderHotels();setTab('hotels');document.getElementById('hotels').scrollIntoView({behavior:'smooth'});}}
  function draw(){
    results.replaceChildren();const favs=state().favorites;
    active.forEach((p,i)=>{const card=document.createElement('article');card.className='chat-result';const title=document.createElement('strong');title.textContent=(i+1)+'. '+p.name;const meta=document.createElement('small');meta.textContent=p.region+' · '+(p.type==='hotel'?'Hotellkandidat · ungefärligt område':p.category);const row=document.createElement('div');row.className='row';row.append(button('Visa',()=>{showMap(false);if(mapReady())map.setView([p.lat,p.lon],12);openResult(p);}),button(favs.has(p.id)?'♥ Sparad':'♡ Spara',()=>{if(p.type==='place')toggleFav(p.sourceId);else toggleHotelFavorite(p.name);refresh();}));card.append(title,meta,row);results.append(card);});
    document.getElementById('chatMap').disabled=!active.length;
  }
  function refresh(){const s=state();active=active.filter(p=>!s.hidden.has(p.id)&&(!previous?.favoritesOnly||s.favorites.has(p.id)));draw();showMap(false);}
  async function ask(query){
    const token=++request;say(query,true);submit.disabled=true;
    try{const response=await provider.search(query,state());if(token!==request)return;
      previous=response.intent;
      // Only known local IDs can ever reach the map, including with a future provider.
      const hidden=state().hidden;active=[...new Set(response.items.map(p=>p.id))].map(id=>byId.get(id)).filter(p=>p&&!hidden.has(p.id));
      say(response.message);draw();if(!showMap(true)&&active.length)say('Kartan kunde inte laddas. Du kan fortfarande använda resultatlistan.');
    }catch{if(token===request)say('Sökningen kunde inte slutföras. Prova igen.');}
    finally{if(token===request)submit.disabled=false;}
  }
  host.querySelector('form').onsubmit=e=>{e.preventDefault();const q=input.value.trim();if(q){input.value='';ask(q);}};
  host.querySelectorAll('.chat-examples button').forEach(b=>b.onclick=()=>ask(b.textContent));
  document.getElementById('chatMap').onclick=()=>{if(!showMap(true))say('Kartan är inte tillgänglig. Resultatlistan fungerar fortfarande.');};
  document.getElementById('chatClear').onclick=()=>{request++;submit.disabled=false;previous=null;active=[];input.value='';log.replaceChildren();draw();showMap(false);input.focus();};
  // Keep hidden/favorite changes synchronized, without changing existing implementations.
  const originalRender=render;render=function(...args){const result=originalRender.apply(this,args);refresh();return result;};
  const originalHotels=renderHotels;renderHotels=function(...args){const result=originalHotels.apply(this,args);refresh();return result;};
  draw();
})();
