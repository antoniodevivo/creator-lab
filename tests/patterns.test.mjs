import test from 'node:test';
import assert from 'node:assert/strict';
import { findPatterns, recurringPhrases, recurringOpenings, keyTerms, labelCombos, minReels } from '../public/patterns.mjs';

let n = 0;
const reel = (text, { topic = 'business', hook = 'direct', structure = 'steps', plays = 1000 } = {}) => ({
  id: `r${n++}`, plays, likes: plays / 50, transcript: { text },
  analysis: { labels: { topic: { value: topic }, mechanism: { value: hook }, structure: { value: structure } } },
});

test('a phrase counts once per Reel and needs several Reels', () => {
  const posts = [
    reel('Cash flow is king. Cash flow, cash flow, cash flow.'),
    reel('Without cash flow you are dead.'),
    reel('Pricing is the lever nobody pulls.'),
  ];
  const phrases = recurringPhrases(posts);
  const cash = phrases.find(p => p.label === 'cash flow');
  assert.equal(cash.n, 2, 'counted in 2 Reels, not 5 times');
  assert.ok(!phrases.some(p => p.label.includes('pricing')), 'said in only one Reel');
});

test('filler phrases are dropped, content phrases kept', () => {
  const posts = [0, 1, 2].map(() => reel('You make sure, a little bit, to make money with a better offer every single time.'));
  const labels = recurringPhrases(posts).map(p => p.label);
  assert.ok(labels.some(l => l.includes('make money')));
  for (const filler of ['make sure', 'little bit', 'every single']) assert.ok(!labels.includes(filler), filler);
});

test('a shorter phrase inside a longer one in the same Reels is not listed twice', () => {
  const posts = [0, 1].map(() => reel('Make the offer so good people feel stupid saying no.'));
  const labels = recurringPhrases(posts).map(p => p.label);
  assert.ok(labels.some(l => l.split(' ').length === 4));
  assert.ok(!labels.includes('offer so'), 'fragment of the longer phrase');
});

test('openings group Reels by their first spoken words', () => {
  const posts = [reel('I sell pizza. We do four million.'), reel('I sell welding gear to shops.'), reel('Stop hiring your friends.')];
  const [first] = recurringOpenings(posts);
  assert.equal(first.label, 'i sell…');
  assert.equal(first.n, 2);
});

test('key terms rank what is over-represented in the selection', () => {
  const all = [
    reel('Our revenue doubled after pricing changes.', { topic: 'business' }),
    reel('Revenue and pricing drive valuation.', { topic: 'business' }),
    reel('Discipline beats motivation every morning.', { topic: 'mindset' }),
    reel('Motivation fades, discipline stays.', { topic: 'mindset' }),
  ];
  const business = all.filter(p => p.analysis.labels.topic.value === 'business');
  const terms = keyTerms(business, all).map(t => t.label);
  assert.ok(terms.includes('revenue') && terms.includes('pricing'));
  assert.ok(!terms.includes('discipline'));
});

test('label combinations report size, share and median reach', () => {
  const posts = [reel('a b', { plays: 100 }), reel('c d', { plays: 300 }), reel('e f', { topic: 'mindset', plays: 50 })];
  const [top] = labelCombos(posts, { metric: 'plays' });
  assert.deepEqual([top.label, top.n, top.reach], ['business · direct · steps', 2, 200]);
  assert.equal(minReels(10), 2);
  assert.equal(minReels(200), 6);
});

test('findPatterns ignores Reels without speech and flags a narrower selection', () => {
  const all = [reel('Cash flow matters.'), reel('Cash flow again.'), { id: 'silent', analysis: { labels: {} } }];
  const r = findPatterns(all.slice(0, 1), all);
  assert.equal(r.n, 1);
  assert.equal(r.narrower, true);
  assert.equal(findPatterns(all, all).narrower, false);
});
