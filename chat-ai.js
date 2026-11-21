/* Server-AI provider for the map assistant (Cloudflare Workers AI, free tier).
   Local search stays the default and the fallback. Only the question, the previous
   question/result IDs and the public catalog leave the device; favorites, plan and
   storage never do. The UI still resolves every ID in its own local catalog. */
(function (root) {
  'use strict';
  // Address of the deployed Cloudflare Worker. Empty = AI mode is not offered.
  const DEFAULT_ENDPOINT = '';
  const TIMEOUT_MS = 35000;
  const MAX_IDS = 8;
  const MAX_PREVIOUS_IDS = 12;
  const engine = root.TravelChat || (typeof require === 'function' ? require('./chat-engine.js') : null);
  const override = typeof root.TRAVEL_AI_ENDPOINT === 'string' ? root.TRAVEL_AI_ENDPOINT : '';
  const validEndpoint = url => /^https:\/\/[^\s/]+\/[^\s]*$/.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[^\s]*$/.test(url);
  const ENDPOINT = [override, DEFAULT_ENDPOINT].find(validEndpoint) || '';
  const PRICE = /\b(pris|priser|livepris|livepriser|billig|billiga|billigaste|budget|kr|kronor|sek|lediga|ledigt|tillganglighet|ac|badrum)\b/;

  // Stable short IDs for the model: p<place id>, h<hotel index in the full catalog>.
  function compactIds(items) {
    const toCompact = new Map(), toFull = new Map();
    let hotel = 0;
    for (const p of items) {
      const cid = p.type === 'place' ? 'p' + p.sourceId : 'h' + (hotel++);
      toCompact.set(p.id, cid);
      toFull.set(cid, p.id);
    }
    return {toCompact, toFull};
  }

  const filterOf = intent => intent && (intent.regions?.length || intent.categories?.length || intent.types?.length || intent.favoritesOnly)
    ? {regions: [...(intent.regions || [])], categories: [...(intent.categories || [])], types: [...(intent.types || [])], favoritesOnly: Boolean(intent.favoritesOnly)}
    : null;

  function buildPayload(query, context) {
    const {items, hidden = new Set(), previous = null, previousQuery = '', previousIds = []} = context;
    const {toCompact} = compactIds(items);
    const catalog = items.filter(p => !hidden.has(p.id)).map(p => [
      toCompact.get(p.id), p.name, p.region, p.regionGroup || '', p.country, p.category || '', p.type === 'hotel' ? p.description : ''
    ]);
    const body = {v: 1, query: String(query).slice(0, 500), catalog};
    const ids = previousIds.map(id => toCompact.get(id)).filter(Boolean).slice(0, MAX_PREVIOUS_IDS);
    const filter = filterOf(previous);
    if (previousQuery || ids.length || filter) body.previous = {query: String(previousQuery).slice(0, 500), ids, filter};
    return body;
  }

  const strings = (v, n) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string').slice(0, n);

  function toResult(data, query, context) {
    const {items, hidden = new Set(), favorites = new Set()} = context;
    const {toFull} = compactIds(items);
    const byId = new Map(items.map(p => [p.id, p]));
    const raw = data && typeof data.filter === 'object' && !Array.isArray(data.filter) ? data.filter : null;
    const filter = raw ? {
      regions: strings(raw.regions, 12), categories: strings(raw.categories, 6),
      types: strings(raw.types, 2).filter(t => t === 'place' || t === 'hotel'), favoritesOnly: raw.favoritesOnly === true
    } : null;
    const usable = filter && (filter.regions.length || filter.categories.length || filter.types.length || filter.favoritesOnly) ? filter : null;
    const ids = [...new Set(strings(data?.ids, MAX_IDS).map(cid => toFull.get(cid)).filter(Boolean))];
    // Favorites are only known on this device, so a favorites request is always filtered locally.
    let list = usable && (usable.favoritesOnly || !ids.length)
      ? engine.filterItems(items, {...usable, terms: []}, {favorites, hidden})
      : ids.map(id => byId.get(id));
    list = list.filter(p => p && !hidden.has(p.id));
    const notes = [];
    if (usable?.favoritesOnly && !list.length) notes.push('Inga sparade favoriter matchar.');
    if (PRICE.test(engine.normalize(query))) notes.push('Priser, lediga rum och faciliteter är inte verifierade. Kontrollera vald rumstyp på bokningssidan.');
    if (list.some(p => p.type === 'hotel')) notes.push('Hotell visas som ungefärliga områdespunkter, inte exakta adresser.');
    const reply = typeof data?.reply === 'string' ? data.reply.trim().slice(0, 1200) : '';
    return {
      items: list,
      intent: {regions: usable?.regions || [], categories: usable?.categories || [], types: usable?.types || [], favoritesOnly: Boolean(usable?.favoritesOnly), terms: [], limit: null, ai: true},
      total: list.length,
      message: [reply || (list.length ? 'Här är förslag ur katalogen.' : 'Jag hittade inget i katalogen.'), notes.join(' ')].filter(Boolean).join('\n\n'),
      source: 'ai'
    };
  }

  function fallbackNote(error) {
    const code = error && error.code;
    if (code === 'quota') return 'Dagens gratiskvot för AI:n är slut. Visar lokal sökning i stället.';
    if (code === 'rate_limited') return 'För många AI-frågor på kort tid. Vänta en minut. Visar lokal sökning i stället.';
    if (code === 'timeout') return 'AI:n svarade inte i tid. Visar lokal sökning i stället.';
    return 'AI:n är inte tillgänglig just nu. Visar lokal sökning i stället.';
  }

  function createAIProvider({endpoint = ENDPOINT, local, fetch: fetchImpl = root.fetch && root.fetch.bind(root), timeoutMs = TIMEOUT_MS} = {}) {
    if (!validEndpoint(endpoint) || typeof fetchImpl !== 'function' || !local) return null;
    return {
      async search(query, context) {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const outer = context.signal;
        const relay = () => controller.abort();
        if (outer) { if (outer.aborted) controller.abort(); else outer.addEventListener('abort', relay, {once: true}); }
        try {
          const res = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(buildPayload(query, context)),
            signal: controller.signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
          });
          let data = null;
          try { data = await res.json(); } catch { data = null; }
          if (!res.ok || !data || typeof data !== 'object') {
            const error = new Error('ai_http_' + res.status);
            error.code = data && typeof data.error === 'string' ? data.error : res.status === 429 ? 'rate_limited' : 'ai_failed';
            throw error;
          }
          return toResult(data, query, context);
        } catch (e) {
          if (outer && outer.aborted) throw e;
          if (timedOut) e.code = 'timeout';
          const result = await local.search(query, context);
          return {...result, source: 'local', message: fallbackNote(e) + ' ' + result.message};
        } finally {
          clearTimeout(timer);
          if (outer) outer.removeEventListener('abort', relay);
        }
      }
    };
  }

  const api = {ENDPOINT, createAIProvider, buildPayload, compactIds, toResult};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TravelChatAI = api;
})(globalThis);
