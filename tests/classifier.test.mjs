import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pipeline } from '../lib/pipeline.mjs';

const rows = [{ id: 'sample', ownerUsername: 'tester', transcript: 'one two three four five six seven' }];

async function withPipeline(keys, options, fn) {
  const root = await mkdtemp(join(tmpdir(), 'creator-lab-classifier-'));
  try { await fn(await new Pipeline(root, () => keys, options).init()); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('a run stores the classifier chosen in the form, Laya by default', async () => {
  await withPipeline({}, {}, async p => {
    assert.equal((await p.create({ creator: 'tester', limit: 1 }, rows)).classifier, 'laya');
    assert.equal((await p.create({ creator: 'tester', limit: 1, classifier: 'jev' }, rows)).classifier, 'jev');
    await assert.rejects(p.create({ creator: 'tester', limit: 1, classifier: 'gpt' }, rows), /Choose Laya or Jev/);
  });
});

test('only Jev runs require a TypeSafe key', async () => {
  await withPipeline({}, {}, async p => {
    const jev = await p.create({ creator: 'tester', limit: 1, classifier: 'jev' }, rows);
    await assert.rejects(p.run(jev.id), /Connect Jev/);
    // No transcript and no speech key: the key check fails before any work starts, naming only the speech provider.
    const laya = await p.create({ creator: 'tester', limit: 1, classifier: 'laya' }, [{ id: 'silent', ownerUsername: 'tester' }]);
    const message = await p.run(laya.id).then(() => '', e => e.message);
    assert.match(message, /Connect/);
    assert.doesNotMatch(message, /Jev/);
  });
});

test('runs created before the choice existed were classified by Jev', async () => {
  await withPipeline({}, {}, async p => {
    assert.equal(p.classifierFor({}), 'jev');
    assert.equal(p.classifierFor({ classifier: 'laya' }), 'laya');
  });
});

test('Laya on CUDA is offered only where the GPU runtime is installed', async () => {
  const { availableClassifiers } = await import('../lib/providers.mjs');
  const { cudaAvailable } = await import('../lib/laya.mjs');
  const list = availableClassifiers();
  assert.ok(list.includes('laya') && list.includes('jev'));
  assert.equal(list.includes('laya-cuda'), cudaAvailable());
  await withPipeline({}, {}, async p => {
    const attempt = p.create({ creator: 'tester', limit: 1, classifier: 'laya-cuda' }, rows);
    if (cudaAvailable()) assert.equal((await attempt).classifier, 'laya-cuda');
    else await assert.rejects(attempt, /CUDA is not available/);
  });
});
