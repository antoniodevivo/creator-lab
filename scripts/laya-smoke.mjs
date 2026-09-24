// Downloads the Laya model on first use (~1.7 GB) and runs one tiny classification.
import { Laya } from '@receptron/laya';

let last = 0;
const begin = Date.now();
const laya = await Laya.load({
  onProgress: ({ file, received, total }) => {
    const pct = total ? Math.floor(received / total * 100) : 0;
    if (pct >= last + 10 || received === total) { last = pct; console.log(`download ${file} ${pct}%`); }
  },
});
console.log(`loaded in ${((Date.now() - begin) / 1000).toFixed(1)}s from ${laya.modelDir}`, laya.config.max_len, laya.config.head_max_len);
const r = await laya.systemOne({ opening: "Here are three things I wish I knew before starting my first job." }, {
  opening: { type: 'choice', instructions: 'Classify the first spoken sentence.', criteria: { question: 'Opens by asking a question', instruction: 'Opens with a directive to the viewer', claim: 'Opens with an assertion or observation', story: 'Opens by narrating an event or personal experience' } },
});
console.log(JSON.stringify(r));
await laya.close();
