import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import worker, { systemPrompt, parseModelOutput, validateAnswer } from '../ai-worker/worker.mjs';

const require = createRequire(import.meta.url);
const { items } = require('./catalog.cjs');
const ai = require('../chat-ai.js');

const ORIGIN = 'https://newchalange.github.io';
const payload = ai.buildPayload('Var kan jag snorkla?', { items });
const allowed = { success: true };

function env(run, extra = {}) {
  return { AI: { run }, ALLOWED_ORIGINS: ORIGIN, MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', FALLBACK_MODEL: '@cf/google/gemma-4-26b-a4b-it', ...extra };
}
function post(body, headers = {}) {
  return new Request('https://reseguide-ai.example.workers.dev/api/travel-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
async function call(request, e) {
  const res = await worker.fetch(request, e);
  return { res, body: await res.json() };
}

test('Real catalog fits the worker limits and the prompt stays compact', () => {
  assert.equal(payload.catalog.length, items.length);
  assert.ok(JSON.stringify(payload).length < 40 * 1024);
  const prompt = systemPrompt(payload.catalog.map(([id, name, region, group, country, category, note]) => ({ id, name, region, group, country, category, note })));
  assert.ok(prompt.length < 24000, 'prompt ' + prompt.length);
  assert.match(prompt, /Norr \(= norra Vietnam\)/);
  assert.match(prompt, /p112 Koh Chang/);
});

test('Answer is validated: unknown IDs dropped, filter normalised, text cleaned', async () => {
  let seen;
  const run = async (model, input) => {
    seen = { model, input };
    return { response: { reply: 'Prova Koh Chang!‮', ids: ['p112', 'p9999', 'x1', 'p112', 'h5'], filter: { regions: ['norra vietnam', 'Atlantis'], categories: ['natur', 'Pengar'], types: ['hotel', 'robot'] } } };
  };
  const { res, body } = await call(post(payload), env(run));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(body.ids, ['p112', 'h5']);
  assert.deepEqual(body.filter, { regions: ['Norr'], categories: ['Natur'], types: ['hotel'], favoritesOnly: false });
  assert.equal(body.reply, 'Prova Koh Chang!');
  assert.equal(seen.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(seen.input.response_format.type, 'json_schema');
  assert.equal(seen.input.messages[1].content, 'FRÅGA: Var kan jag snorkla?');
});

test('Origin, method, content type, size and catalog are enforced', async () => {
  const run = async () => { throw new Error('should not run'); };
  assert.equal((await call(post(payload, { Origin: 'https://evil.example' }), env(run))).res.status, 403);
  assert.equal((await worker.fetch(new Request('https://x.workers.dev/api/travel-chat', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env(run))).status, 403);
  const pre = await worker.fetch(new Request('https://x.workers.dev/api/travel-chat', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env(run));
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.equal((await call(post(payload, { 'Content-Type': 'text/plain' }), env(run))).res.status, 415);
  assert.equal((await call(post('x'.repeat(100 * 1024)), env(run))).res.status, 413);
  assert.equal((await call(post({ ...payload, v: 2 }), env(run))).body.error, 'bad_request');
  assert.equal((await call(post({ ...payload, query: '   ' }), env(run))).body.error, 'empty_query');
  assert.equal((await call(post({ ...payload, catalog: [['<script>', 'x', 'y']] }), env(run))).body.error, 'bad_catalog');
  assert.equal((await call(post({ ...payload, catalog: Array.from({ length: 401 }, (_, i) => ['p' + i, 'n', 'r']) }), env(run))).body.error, 'bad_catalog');
  const health = await worker.fetch(new Request('https://x.workers.dev/health'), env(run));
  assert.deepEqual(await health.json(), { ok: true, service: 'southeast-asia-explorer-ai', version: 1, ai: true });
});

test('Rate limits apply per IP and globally before the model is called', async () => {
  let calls = 0;
  const run = async () => { calls++; return { response: { reply: 'Hej', ids: [] } }; };
  const keys = [];
  const deny = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  assert.equal((await call(post(payload), env(run, { LIMITER: deny }))).body.error, 'rate_limited');
  assert.deepEqual(keys, ['198.51.100.7']);
  const ok = { limit: async () => allowed };
  assert.equal((await call(post(payload), env(run, { LIMITER: ok, GLOBAL_LIMITER: deny }))).res.status, 429);
  assert.equal(calls, 0);
});

test('Quota, failing schema and timeouts give clear errors and at most two model calls', async () => {
  const quota = async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); };
  const q = await call(post(payload), env(quota));
  assert.equal(q.res.status, 503);
  assert.equal(q.body.error, 'quota');
  const models = [];
  const flaky = async (model, input) => {
    models.push(model + (input.response_format ? '+schema' : ''));
    if (input.response_format) throw new Error("JSON Mode couldn't be met");
    return { choices: [{ message: { content: '<think>hmm</think>```json\n{"reply":"Hoi An är fint.","ids":["p40"]}\n```' } }] };
  };
  const f = await call(post(payload), env(flaky));
  assert.equal(f.res.status, 200);
  assert.equal(f.body.reply, 'Hoi An är fint.');
  assert.equal(f.body.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.deepEqual(models, ['@cf/meta/llama-3.3-70b-instruct-fp8-fast+schema', '@cf/google/gemma-4-26b-a4b-it']);
  const broken = async () => ({ response: 'not json { at all' });
  assert.equal((await call(post(payload), env(broken))).body.error, 'ai_failed');
  assert.equal((await call(post(payload), env(async () => { throw new Error('boom'); }, { AI: undefined }))).body.error, 'ai_binding_missing');
});

test('Follow-up context only carries validated IDs and filters', async () => {
  let content;
  const run = async (_, input) => { content = input.messages[1].content; return { response: { reply: 'Ok', ids: [] } }; };
  await call(post({ ...payload, query: 'och bara favoriter', previous: { query: 'Natur i norra Vietnam', ids: ['p1', 'p9999', 'h5'], filter: { regions: ['Norr'], categories: ['Natur'], favoritesOnly: 'yes' } } }), env(run));
  assert.equal(content, 'FÖREGÅENDE FRÅGA: Natur i norra Vietnam\nFÖREGÅENDE TRÄFFAR: p1, h5\nFÖREGÅENDE FILTER: {"regions":["Norr"],"categories":["Natur"],"types":[],"favoritesOnly":false}\nFRÅGA: och bara favoriter');
});

test('Model output parsing is tolerant but never invents content', () => {
  const list = [{ id: 'p1', name: 'A', region: 'Norr', country: 'Vietnam', category: 'Kultur' }];
  assert.deepEqual(parseModelOutput('Bara text'), { reply: 'Bara text', ids: [] });
  assert.equal(parseModelOutput('{trasig'), null);
  assert.equal(validateAnswer({ reply: '', ids: ['p2'] }, list), null);
  assert.equal(validateAnswer({ reply: 'x'.repeat(5000), ids: [] }, list).reply.length, 1200);
  assert.equal(validateAnswer({ reply: '', ids: [], filter: { favoritesOnly: true } }, list).reply, 'Här är förslag ur katalogen.');
});
