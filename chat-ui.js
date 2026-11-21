/* Adapter around existing app state. Chat never changes existing filters or plan. */
(() => {
  'use strict';
  if(!globalThis.TravelChat) return;
  const catalog=TravelChat.catalog(places,hotelCandidates,hotelAreaCoords);
  const byId=new Map(catalog.map(p=>[p.id,p]));
  const provider=TravelChat.createLocalProvider();
  // Optional free server AI (chat-ai.js). Local search remains the default and fallback.
  const aiProvider=globalThis.TravelChatAI?.createAIProvider({local:provider})||null;
  const AI_KEY='sea15_chat_ai';
  let aiOn=false;try{aiOn=Boolean(aiProvider)&&localStorage.getItem(AI_KEY)==='1';}catch{}
  let previous=null, previousQuery='', layer=null, active=[], request=0, controller=null;
  const localHint=`Sök på svenska bland ${places.length} platser och ${hotelCandidates.length} hotellkandidater. Regelbaserad sökning utan AI-API. Chatten sparas inte eller skickas till en server. Kartor och bilder använder internet.`;
  const aiHint='AI-läge: din fråga, din föregående fråga och appens publika platskatalog skickas till Cloudflare Workers AI (gratis, utan konto). Favoriter, resplan och annan lagring stannar på enheten. Chatten sparas inte. Svarar inte AI:n används den lokala sökningen. AI kan ta fel – kontrollera viktiga uppgifter.';
  const host=document.createElement('details');host.className='chat-panel';host.id='travelChat';
  host.innerHTML=`<summary>💬 Kartassistent · gratis${aiProvider?' AI':''}</summary>${aiProvider?'<label class="chat-ai-toggle"><input type="checkbox" id="chatAI"> 🤖 Använd riktig AI (gratis)</label>':''}<p class="hint" id="chatMode"></p><div class="chat-examples"><button class="btn" type="button">Stränder i östra Thailand</button><button class="btn" type="button">Hotell på Koh Chang</button><button class="btn" type="button">Mina favoriter i Vietnam</button></div><div class="chat-log" role="log" aria-label="Samtal med kartassistenten" aria-live="polite" aria-relevant="additions"></div><form><div class="chat-field"><label for="chatQuery">Vad vill du hitta?</label><input id="chatQuery" maxlength="500" autocomplete="off" placeholder="T.ex. natur och stränder i Vietnam" required></div><button class="btn primary" type="submit">Sök</button></form><p class="hint">Fortsätt med ”och bara favoriter”. En ny vanlig fråga startar en ny sökning. Gula numrerade nålar visar chattens träffar, även utanför vanliga kartfilter.</p><div class="row"><button class="btn" type="button" id="chatMap">Visa träffarna på kartan</button><button class="btn" type="button" id="chatClear">Rensa chatten</button></div><div class="chat-results" aria-label="Sökresultat"></div>`;
  document.querySelector('.hero').after(host);
  const log=host.querySelector('.chat-log'), results=host.querySelector('.chat-results'), input=host.querySelector('#chatQuery'), submit=host.querySelector('[type=submit]'), mode=host.querySelector('#chatMode'), aiToggle=host.querySelector('#chatAI');
  function updateMode(){const on=aiOn&&aiProvider;mode.textContent=on?aiHint:localHint;input.placeholder=on?'T.ex. var kan jag snorkla med barn i Thailand?':'T.ex. natur och stränder i Vietnam';submit.textContent=on?'Fråga':'Sök';host.classList.toggle('ai-on',Boolean(on));if(aiToggle)aiToggle.checked=Boolean(on);}
  const badge=document.createElement('div');badge.className='chat-map-status';badge.hidden=true;document.querySelector('.mapwrap').append(badge);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=fn;return b;};
  function state(){return {items:catalog,previous,previousQuery,previousIds:active.map(p=>p.id),favorites:new Set([...favorites].map(id=>'place:'+id).concat([...hotelFavorites].flatMap(name=>catalog.filter(p=>p.type==='hotel'&&p.name===name).map(p=>p.id)))),hidden:new Set([...hiddenPlaces].map(id=>'place:'+id).concat([...hiddenHotels].map(key=>'hotel:'+key)))};}
  const speakers={user:'Du: ',local:'Assistent: ',ai:'AI: '};
  function say(text,who='local',el=null){const p=el&&el.isConnected?el:document.createElement('p');p.className='chat-'+who;p.textContent=speakers[who]+text;if(p!==el)log.append(p);while(log.children.length>12)log.firstChild.remove();log.scrollTop=log.scrollHeight;return p;}
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
    const token=++request;say(query,'user');submit.disabled=true;
    controller?.abort();controller=new AbortController();
    const useAI=Boolean(aiOn&&aiProvider), pending=useAI?say('tänker …','ai'):null;
    if(pending)pending.classList.add('pending');
    try{const response=await (useAI?aiProvider:provider).search(query,{...state(),signal:controller.signal});if(token!==request)return;
      previous=response.intent;previousQuery=query;
      // Only known local IDs can ever reach the map, including with a future provider.
      const hidden=state().hidden;active=[...new Set(response.items.map(p=>p.id))].map(id=>byId.get(id)).filter(p=>p&&!hidden.has(p.id));
      say(response.message,response.source==='ai'?'ai':'local',pending);draw();if(!showMap(true)&&active.length)say('Kartan kunde inte laddas. Du kan fortfarande använda resultatlistan.');
    }catch{if(token===request)say('Sökningen kunde inte slutföras. Prova igen.','local',pending);}
    finally{if(token===request)submit.disabled=false;}
  }
  host.querySelector('form').onsubmit=e=>{e.preventDefault();const q=input.value.trim();if(q){input.value='';ask(q);}};
  host.querySelectorAll('.chat-examples button').forEach(b=>b.onclick=()=>ask(b.textContent));
  document.getElementById('chatMap').onclick=()=>{if(!showMap(true))say('Kartan är inte tillgänglig. Resultatlistan fungerar fortfarande.');};
  if(aiToggle)aiToggle.onchange=()=>{aiOn=aiToggle.checked;try{localStorage.setItem(AI_KEY,aiOn?'1':'0');}catch{}updateMode();};
  document.getElementById('chatClear').onclick=()=>{request++;controller?.abort();controller=null;submit.disabled=false;previous=null;previousQuery='';active=[];input.value='';log.replaceChildren();draw();showMap(false);input.focus();};
  // Keep hidden/favorite changes synchronized, without changing existing implementations.
  const originalRender=render;render=function(...args){const result=originalRender.apply(this,args);refresh();return result;};
  const originalHotels=renderHotels;renderHotels=function(...args){const result=originalHotels.apply(this,args);refresh();return result;};
  updateMode();draw();
})();
