import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocal, mergeAnswers, windows } from '../lib/laya.mjs';
import { buildRequest, cacheKey, guard } from '../lib/schema.mjs';

// Mimics Laya.systemOne: favours the first option, records every state and question it saw.
function fakeLaya() {
  const calls = [];
  return {
    calls,
    async systemOne(state, questions) {
      calls.push({ state, questions });
      const answers = {};
      for (const [k, q] of Object.entries(questions)) {
        const keys = Object.keys(q.criteria);
        const p = keys.map((_, i) => (i === 0 ? 0.7 : 0.3 / (keys.length - 1)));
        answers[k] = { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map((kk, i) => [kk, p[i]])), confidence: 0.5, rl_agent: { act_probability: 0 } };
      }
      return { model: 'laya', answers, usage: { input_tokens: 100, output_tokens: 0 } };
    },
  };
}

const sentence = i => `Sentence number ${i} explains one more idea about pricing your offer.`;
const long = { text: Array.from({ length: 60 }, (_, i) => sentence(i)).join(' '), segments: [] };

test('windows split long transcripts evenly and keep every word', () => {
  const w = windows(long.text);
  assert.ok(w.length >= 3);
  assert.equal(w.reduce((s, x) => s + x.weight, 0), long.text.split(/\s+/).length);
  assert.deepEqual(windows('short text'), [{ text: 'short text', weight: 2 }]);
});

test('mergeAnswers weights probabilities and recomputes choice and confidence', () => {
  const m = mergeAnswers([
    { weight: 1, answer: { probabilities: { a: 0.9, b: 0.1 } } },
    { weight: 3, answer: { probabilities: { a: 0.2, b: 0.8 } } },
  ]);
  assert.equal(m.choice, 'b');
  assert.equal(m.probabilities.a, 0.375);
  assert.ok(m.confidence > 0 && m.confidence < 1);
});

test('classifyLocal answers every Jev question in the shape parseResult accepts', async () => {
  const laya = fakeLaya();
  const result = await classifyLocal(long, laya);
  const req = buildRequest(long);
  assert.deepEqual(Object.keys(result.labels).sort(), Object.keys(req.questions).filter(k => !k.startsWith('role_')).sort());
  assert.equal(result.anatomy.length, req.state.segments.length);
  assert.equal(result.model, 'laya');
  assert.equal(result.costUsd, 0);
  assert.equal(result.inputTokens, laya.calls.length * 100);
});

test('each Laya call gets a focused state that fits its 512-token window', async () => {
  const laya = fakeLaya();
  await classifyLocal(long, laya);
  for (const { state, questions } of laya.calls) {
    assert.ok(JSON.stringify(state).split(/\s+/).length <= 260, 'state too long for Laya');
    for (const q of Object.values(questions)) assert.ok(!q.instructions.includes(guard), 'guard text should be stripped');
  }
  const opening = laya.calls.find(c => c.questions.mechanism);
  assert.deepEqual(Object.keys(opening.state), ['opening']);
  assert.ok(laya.calls.find(c => c.questions.cta).state.closing.endsWith(sentence(59)));
  assert.ok(laya.calls.filter(c => c.questions.topic).length >= 3, 'long transcript should be read in windows');
});

test('Laya results are cached separately from Jev results', () => {
  assert.notEqual(cacheKey(long, 'laya'), cacheKey(long));
  assert.equal(cacheKey(long, 'jev'), cacheKey(long));
});
