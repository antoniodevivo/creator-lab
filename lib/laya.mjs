// Local, Jev-compatible classification with Laya (github.com/receptron/laya).
//
// Laya answers the same `system_one` questions as Jev, but reads at most 512 tokens per question,
// including the question and its options. Sending Jev's single combined state (opening + transcript +
// every segment) would be cut off after the first few sentences, so each question gets the part of the
// transcript it is actually about:
//   opening, mechanism          -> the opening words
//   topic, structure, evidence,
//   emotion, specificity        -> the transcript, in ~200-word windows whose probabilities are averaged
//   cta                         -> the closing words
//   role_sN                     -> segment N, with the preceding words as context
// The answers are returned in Jev's response shape, so schema.parseResult validates them unchanged.
import { buildRequest, parseResult, guard } from './schema.mjs';

const WINDOW_WORDS = 200;
const CLOSING_WORDS = 70;
const CONTEXT_WORDS = 40;
const OPENING_KEYS = ['opening', 'mechanism'];
const CLOSING_KEYS = ['cta'];

let loading = null;
let queue = Promise.resolve();

// One model instance (~2 GB RAM) for the whole server. The first call downloads ~1.7 GB from Hugging Face.
export function loadLaya() {
  loading ??= import('@receptron/laya')
    .then(({ Laya }) => Laya.load({ cacheDir: process.env.LAYA_CACHE || undefined }))
    .catch(e => { loading = null; throw new Error(`Laya could not load: ${e.message}`); });
  return loading;
}

export async function checkLaya() {
  try { await loadLaya(); return { configured: true, verified: true }; }
  catch (e) { return { configured: true, verified: false, error: e.message }; }
}

const words = text => text.trim().split(/\s+/).filter(Boolean);
const entropyConfidence = p => {
  if (p.length < 2) return 1;
  let h = 0;
  for (const x of p) h -= x * Math.log(Math.max(x, 1e-12));
  return 1 - h / Math.log(p.length);
};
// Laya is not generative, so the prompt-injection guard only spends the 192-token question budget.
const local = q => ({ ...q, instructions: q.instructions.replace(guard, '') });

export function windows(text, size = WINDOW_WORDS) {
  const w = words(text);
  if (w.length <= size) return [{ text: w.join(' '), weight: w.length }];
  const count = Math.ceil(w.length / size), step = Math.ceil(w.length / count);
  const out = [];
  for (let i = 0; i < w.length; i += step) out.push({ text: w.slice(i, i + step).join(' '), weight: Math.min(step, w.length - i) });
  return out;
}

// Weighted average of per-window probabilities, re-deriving choice and Jev-style confidence.
export function mergeAnswers(parts) {
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const keys = Object.keys(parts[0].answer.probabilities);
  const probs = keys.map(k => parts.reduce((s, p) => s + (p.answer.probabilities[k] ?? 0) * p.weight, 0) / total);
  const best = probs.indexOf(Math.max(...probs));
  return {
    type: 'choice', choice: keys[best],
    probabilities: Object.fromEntries(keys.map((k, i) => [k, Math.round(probs[i] * 1e4) / 1e4])),
    confidence: Math.round(entropyConfidence(probs) * 1e4) / 1e4,
  };
}

export async function classifyLocal(transcript, laya) {
  const req = buildRequest(transcript);
  const { state, questions } = req;
  const run = async (st, qs) => {
    const r = await laya.systemOne(st, Object.fromEntries(Object.entries(qs).map(([k, q]) => [k, local(q)])));
    tokens += r.usage.input_tokens;
    return r.answers;
  };
  let tokens = 0;
  const answers = {};
  const pick = keys => Object.fromEntries(keys.filter(k => questions[k]).map(k => [k, questions[k]]));
  const all = words(state.transcript);

  Object.assign(answers, await run({ opening: state.opening }, pick(OPENING_KEYS)));
  Object.assign(answers, await run({ closing: all.slice(-CLOSING_WORDS).join(' ') }, pick(CLOSING_KEYS)));

  const whole = pick(Object.keys(questions).filter(k => !k.startsWith('role_') && !OPENING_KEYS.includes(k) && !CLOSING_KEYS.includes(k)));
  const parts = [];
  for (const w of windows(state.transcript)) parts.push({ weight: w.weight, answers: await run({ transcript: w.text }, whole) });
  for (const k of Object.keys(whole)) answers[k] = mergeAnswers(parts.map(p => ({ weight: p.weight, answer: p.answers[k] })));

  let before = [];
  for (const [i, seg] of state.segments.entries()) {
    const role = await run({
      position: `segment ${i + 1} of ${state.segments.length}`,
      previous: before.slice(-CONTEXT_WORDS).join(' '),
      segment: seg.text,
    }, { [`role_${seg.id}`]: { ...questions[`role_${seg.id}`], instructions: questions[`role_${seg.id}`].instructions.replace(/ Use the surrounding transcript.*$/, ' Label only the text in "segment"; "previous" is the speech just before it.') } });
    Object.assign(answers, role);
    before = before.concat(words(seg.text));
  }

  const raw = { model: 'laya', answers, usage: { input_tokens: tokens, output_tokens: 0 } };
  return { ...parseResult(raw, req), costUsd: 0, raw };
}

// Serialize requests: one ONNX session, and batches are already parallel inside the model.
export function classifyWithLaya(transcript) {
  const job = queue.then(async () => classifyLocal(transcript, await loadLaya()));
  queue = job.catch(() => {});
  return job;
}
