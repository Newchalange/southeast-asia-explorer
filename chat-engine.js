/* Local, deterministic provider. No network, keys, generated facts or persistent chat. */
(function (root) {
  'use strict';
  const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const contains = (text, phrase) => (' ' + text + ' ').includes(' ' + phrase + ' ');
  const categories = {
    Strand: ['strand', 'strander', 'stranderna', 'strandnara', 'bad', 'beach', 'beaches'],
    Natur: ['natur', 'naturupplevelser', 'vattenfall', 'nationalparker'],
    Kultur: ['kultur', 'tempel', 'sevardheter'],
    Historia: ['historia', 'historiska', 'museum', 'museer', 'sevardheter'],
    Mat: ['mat', 'gatumat', 'matmarknader', 'restauranger'],
    Äventyr: ['aventyr', 'aktiviteter', 'utflykter', 'snorkling', 'kajak']
  };
  const country = region => ['Norr', 'Mitten', 'Söder', 'Ho Chi Minh City', 'Mekongdeltat'].includes(region) ? 'Vietnam' : /Kambodja/.test(region) || ['Koh Kong','Kampot / Kep','Koh Rong','Phnom Penh'].includes(region) ? 'Kambodja' : 'Thailand';
  function catalog(places, hotels, coords) {
    return [
      ...places.map(p => ({id:'place:'+p.id, sourceId:p.id, type:'place', name:p.name, region:p.region, country:country(p.region), category:p.cat, description:p.desc, lat:p.lat, lon:p.lon})),
      ...hotels.map(h => ({id:'hotel:'+h[0]+'::'+h[1], sourceId:h[1], type:'hotel', name:h[1], region:h[0], regionGroup:country(h[0])==='Thailand'?(h[0]==='Bangkok'?'Bangkok':'Östra Thailand'):country(h[0])==='Kambodja'?'Södra Kambodja':'Söder', country:country(h[0]), category:h[3].includes('strand')?'Strand':h[3]==='natur'?'Natur':'', description:h[2], lat:coords[h[0]]?.[0], lon:coords[h[0]]?.[1], approximate:true}))
    ];
  }
  function search(query, context) {
    const {items, favorites = new Set(), hidden = new Set(), previous} = context;
    let text = normalize(query).slice(0, 500);
    text=text.replace(/\bstrandhotell\b/g,'hotell strand');
    const help = 'Prova ”stränder i östra Thailand”, ”mina favoriter i Vietnam” eller ett hotellnamn. Kombinera med ”hotell” och ”natur”. Fortsätt med ”och bara favoriter” eller starta en ny sökning.';
    if (!text || /^(hjalp|hej|vad kan du gora)$/.test(text)) return {items:[], message:help, intent:null};
    const followup = /^(och|bara|endast|aven|dessutom)\b/.test(text) && previous;
    const intent = followup ? {...previous, regions:[...previous.regions], categories:[...previous.categories]} : {regions:[], categories:[], types:[], favoritesOnly:false, terms:[], limit:null};
    const price = /\b(pris|priser|livepris|livepriser|billig|billiga|billigaste|budget|kr|kronor|sek|lediga|tillganglighet|ac|badrum)\b/.test(text);
    if (/\b(inte|utan|utom|exklusive)\b/.test(text)) return {items:[], intent:null, message:'Jag kan ännu inte tolka undantag säkert. Skriv vad du vill ha, till exempel ”stränder i Thailand”.'};
    text = text.replace(/\b(under|max|hogst|over)\s*\d+\s*(kr|kronor|sek)?\b/g, ' ');
    const count = text.match(/\b(?:visa|hitta|de)\s+(\d+)\b/);
    if(count) {intent.limit = Math.max(1, Math.min(100, Number(count[1]))); text=text.replace(count[0], ' ');}
    const aliases = new Map();
    for(const r of new Set(items.flatMap(p=>[p.region,p.country]))) aliases.set(normalize(r), r);
    for(const [a,r] of [['norra vietnam','Norr'],['norr vietnam','Norr'],['centrala vietnam','Mitten'],['mellersta vietnam','Mitten'],['sodra vietnam','Söder'],['ostthailand','Östra Thailand'],['saigon','Ho Chi Minh City'],['ho chi minh','Ho Chi Minh City']]) aliases.set(a,r);
    const regions=[];
    for(const [alias,r] of [...aliases].sort((a,b)=>b[0].length-a[0].length)) if(contains(text,alias)){regions.push(r);text=(' '+text+' ').split(' '+alias+' ').join(' ').trim();}
    if(regions.length) intent.regions=[...new Set(regions)];
    const cats=[];
    // Match all categories before removing shared synonyms such as "sevärdheter".
    for(const [cat,words] of Object.entries(categories)) if(words.some(w=>contains(text,w))) cats.push(cat);
    for(const words of Object.values(categories)) for(const w of words) text=(' '+text+' ').split(' '+w+' ').join(' ').trim();
    if(cats.length) intent.categories=cats;
    const hotel = /\b(hotell|hotellen|boende|boenden|strandhotell)\b/.test(text);
    const place = /\b(platser|upplevelser|besoksmal)\b/.test(text);
    if(hotel || place) intent.types=hotel && (place || /\boch\b/.test(text) && cats.length) ? ['place','hotel'] : hotel ? ['hotel'] : ['place'];
    if(/\b(favoriter|favorit|favorithotell|sparade|sparat)\b/.test(text)) intent.favoritesOnly=true;
    if(contains(text,'favorithotell')) intent.types=['hotel'];
    const stop = new Set(normalize('visa hitta sok jag vill ha kan du mig oss vi vara mina alla i pa vid nara kring runt och eller med som ar bara endast aven dessutom de den det ett en nagra fina finaste basta tack hotell hotellen boende boenden strandhotell platser upplevelser besoksmal favoriter favorit favorithotell sparade sparat pris priser livepris livepriser billig billiga billigaste budget kr kronor sek lediga tillganglighet ac eget badrum').split(' '));
    const terms=text.split(/\s+/).filter(w=>w&&!stop.has(w));
    if(terms.length || !followup) intent.terms=terms;
    const constraints=intent.regions.length||intent.categories.length||intent.types.length||intent.favoritesOnly||intent.terms.length||contains(normalize(query),'alla');
    if(!constraints) return {items:[], intent:null, message:help};
    const results=items.filter(p=>!hidden.has(p.id)
      && (!intent.types.length||intent.types.includes(p.type))
      && (!intent.regions.length||intent.regions.some(r=>p.region===r||p.regionGroup===r||p.country===r||contains(normalize(p.name+' '+p.description),normalize(r))))
      && (!intent.categories.length||intent.categories.includes(p.category))
      && (!intent.favoritesOnly||favorites.has(p.id))
      && intent.terms.every(w=>contains(normalize(p.name+' '+p.region+' '+p.description),w)));
    const selected=intent.limit?results.slice(0,intent.limit):results;
    const notes=[];
    if(price) notes.push('Jag kan inte filtrera på aktuellt pris, ledighet, AC eller badrum. Kandidaterna är inte bekräftade för dessa krav; kontrollera vald rumstyp på bokningssidan.');
    if(selected.some(p=>p.type==='hotel')) notes.push('Hotell visas som ungefärliga områdespunkter, inte exakta adresser.');
    if(/\b(nara|finaste|basta|billigaste)\b/.test(normalize(query))) notes.push('Matchningen använder katalogens namn, områden och kategorier, inte avstånd eller kvalitetsranking.');
    return {items:selected,intent,total:results.length,message:(selected.length?`${selected.length} träffar${selected.length<results.length?' av '+results.length:''} i den lokala katalogen. `:'Inga träffar. Prova färre villkor eller ett annat ortsnamn. Dolda objekt tas inte med. ')+notes.join(' ')};
  }
  // A future server provider must implement the same interface; UI resolves IDs locally.
  const createLocalProvider = () => ({async search(query, context){return search(query,context);}});
  const api={normalize,catalog,search,createLocalProvider};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.TravelChat=api;
})(globalThis);
