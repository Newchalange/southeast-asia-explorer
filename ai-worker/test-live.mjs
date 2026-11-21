// Testar den driftsatta workern med en riktig AI-fråga.
// Användning:  node test-live.mjs https://reseguide-ai.<ditt-namn>.workers.dev
const base = String(process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(base)) {
  console.error('Ange workerns adress, t.ex: node test-live.mjs https://reseguide-ai.dittnamn.workers.dev');
  process.exit(1);
}
const origin = process.argv[3] || 'https://newchalange.github.io';
const catalog = [
  ['p101', 'Wat Arun', 'Bangkok', '', 'Thailand', 'Kultur', ''],
  ['p104', 'Chinatown Bangkok', 'Bangkok', '', 'Thailand', 'Mat', ''],
  ['p111', 'Koh Samet', 'Östra Thailand', '', 'Thailand', 'Strand', ''],
  ['p112', 'Koh Chang', 'Östra Thailand', '', 'Thailand', 'Strand', ''],
  ['p1', 'Hanois gamla kvarter', 'Norr', '', 'Vietnam', 'Kultur', ''],
  ['p5', 'Ha Long-bukten', 'Norr', '', 'Vietnam', 'Natur', ''],
  ['h0', 'ibis Bangkok Riverside', 'Bangkok', 'Bangkok', 'Thailand', '', 'Stadshotell vid floden; ej strandboende'],
  ['h5', 'Nature Beach Resort', 'Koh Chang', 'Östra Thailand', 'Thailand', 'Strand', 'Strandnära']
];

const health = await fetch(base + '/health');
console.log('Hälsokontroll:', health.status, await health.text());

const started = Date.now();
const res = await fetch(base + '/api/travel-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ v: 1, query: 'Var kan jag bada och snorkla i östra Thailand?', catalog })
});
const text = await res.text();
console.log(`AI-fråga: HTTP ${res.status} på ${((Date.now() - started) / 1000).toFixed(1)} s`);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
console.log(res.ok ? '\nOK – workern och AI:n fungerar.' : '\nFEL – klistra in utskriften ovan i chatten.');
