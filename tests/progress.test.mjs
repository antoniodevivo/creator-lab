import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pipeline } from '../lib/pipeline.mjs';

const transcript = { text: 'Why keep waiting? Pick one task. Finish it today.', segments: [] };
const answers = req => ({ model: req.model, answers: Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.9, probabilities: {} }])), usage: { input_tokens: 10 } });

test('a run tracks each phase: thumbnails fetched, video handled remotely, transcript, classification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'creator-lab-progress-'));
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('thumb-ok')) return new Response(Buffer.from('jpeg-bytes'), { headers: { 'content-type': 'image/jpeg' } });
    if (u.includes('thumb-bad')) return new Response('nope', { status: 404 });
    if (u.includes('groq.com')) return Response.json({ ...transcript, duration: 8 });
    if (u.includes('typesafe.ai')) return Response.json(answers(JSON.parse(opts.body)));
    throw new Error(`Unexpected request ${u}`);
  };
  try {
    const p = await new Pipeline(root, () => ({ groq: 'test', jev: 'test' })).init();
    const row = (id, thumb) => ({ id, ownerUsername: 'tester', videoPlayCount: 100, likesCount: 1, videoUrl: 'https://scontent.cdninstagram.com/v.mp4', displayUrl: `https://scontent.cdninstagram.com/${thumb}.jpg` });
    const run = await p.create({ creator: 'tester', limit: 2, classifier: 'jev' }, [row('a', 'thumb-ok'), row('b', 'thumb-bad')]);
    await p.run(run.id);
    while (p.active.size) await new Promise(r => setTimeout(r, 5));
    await p.writes.get(run.id);
    const [a, b] = run.posts;
    assert.equal(a.thumbnail, 'ready');
    assert.equal(b.thumbnail, 'failed');
    assert.equal(String(await readFile(p.thumbnailPath(a))), 'jpeg-bytes');
    for (const post of run.posts) {
      assert.equal(post.media, 'remote', 'Groq fetched the video URL itself');
      assert.ok(post.transcript);
      assert.equal(post.status, 'complete');
    }
    // A failed thumbnail does not fail the run: it only affects the wall.
    assert.equal(run.status, 'complete');
  } finally {
    global.fetch = realFetch;
    await rm(root, { recursive: true, force: true });
  }
});
