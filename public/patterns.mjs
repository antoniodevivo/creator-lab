// Recurring patterns in the spoken scripts of a set of Reels: label combinations, phrases, openings and
// distinctive terms. Everything counts Reels (document frequency), not raw occurrences, so one Reel that
// repeats a phrase ten times still counts once. Pure functions: used by the dashboard and by the tests.
import { median, rate } from './research.mjs';

// Function words in English and Italian. Phrases may contain them but cannot start or end with them,
// and single-word terms never are one.
const STOPWORDS = new Set(`a about above after again against all am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further get
gets got gonna had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i
i'd i'll i'm i've if in into is isn't it it's its itself just let's like me more most mustn't my myself no nor not now of off on once
only or other ought our ours ourselves out over own really right same she she'd she'll she's should shouldn't so some such than that
that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too
um uh under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who
who's whom why why's will with won't would wouldn't yeah you you'd you'll you're you've your yours yourself yourselves okay ok
also actually thing things going want know say said go one two lot kind
il lo la i gli le un uno una di da in con su per tra fra e ed o ma se che chi cui non più come anche già poi del dello della dei degli
delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono
sei siamo siete era ho hai ha abbiamo avete hanno mi ti si ci vi me te lui lei noi voi loro mio mia tuo tua suo sua questo questa
quello quella cosa cose fare fatto molto tutto tutti ora qui lì là perché quando dove quindi allora però cioè tipo ok`.split(/\s+/));

// Common spoken words that carry little topic on their own. They can sit inside a phrase ("make money")
// but a phrase made only of these and function words ("little bit", "make sure") is filler, and they are
// never key terms.
const GENERIC = new Set(`think make makes made making need needs way much well probably maybe little bit every single sure take takes
took good great better best bad many even still back first next last mean means look looks come comes came give gives gave put see
saw something anything everything nothing someone somebody anybody everybody anyone everyone people person guy guys else time times
year years day days week weeks month months three four five six seven eight nine ten hundred thousand oh god literally basically
different whole able start started keep kept feel felt tell told try trying new old big small long real always never ever
usually often around another part point pretty alright yes yep stopped let hey stuff sort whatever getting enough find found either
fatto dire detto vuol volta volte anno anni giorno giorni sempre mai davvero proprio bene male tanto poco gente persone`.split(/\s+/));
const words = text => (text || '').toLowerCase().replace(/[’`]/g, "'").match(/[\p{L}\p{N}']+/gu)?.map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean) || [];
const isStop = w => STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 2;
const isWeak = w => isStop(w) || GENERIC.has(w);
const transcriptOf = p => p.transcript?.text || '';
const openingOf = p => p.analysis?.opening || transcriptOf(p).split(/(?<=[.!?])\s/)[0] || '';
const reach = (p, metric) => (typeof p[metric] === 'number' && p[metric] >= 0 ? p[metric] : null);

// A pattern needs at least 2 Reels, and at least 3% of the set once the set is large.
export const minReels = n => Math.max(2, Math.ceil(n * 0.03));

function describe(label, posts, metric, total) {
  return {
    label,
    ids: posts.map(p => p.id),
    n: posts.length,
    share: total ? posts.length / total : 0,
    reach: median(posts.map(p => reach(p, metric))),
    likeRate: median(posts.map(p => rate(p, 'likes', metric)).filter(v => v !== null)),
  };
}

// Topic × hook × structure combinations that repeat.
export function labelCombos(posts, { metric = 'views', limit = 8 } = {}) {
  const groups = new Map();
  for (const p of posts) {
    const l = p.analysis?.labels;
    if (!l) continue;
    const key = [l.topic?.value, l.mechanism?.value, l.structure?.value].map(v => v || 'unclear').join(' · ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups].filter(([, g]) => g.length >= minReels(posts.length))
    .map(([key, g]) => describe(key, g, metric, posts.length))
    .sort((a, b) => b.n - a.n || (b.reach ?? -1) - (a.reach ?? -1)).slice(0, limit);
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const g = tokens.slice(i, i + n);
    if (isStop(g[0]) || isStop(g[n - 1]) || g.every(isWeak)) continue;
    out.push(g.join(' '));
  }
  return out;
}

// Phrases of 2–4 words said in several Reels. A shorter phrase is dropped when a longer one that contains
// it appears in the same Reels ("the offer" inside "make the offer so good").
export function recurringPhrases(posts, { metric = 'views', limit = 15, sizes = [2, 3, 4] } = {}) {
  const byPhrase = new Map();
  for (const p of posts) {
    const tokens = words(transcriptOf(p));
    const seen = new Set(sizes.flatMap(n => ngrams(tokens, n)));
    for (const g of seen) { if (!byPhrase.has(g)) byPhrase.set(g, []); byPhrase.get(g).push(p); }
  }
  const min = minReels(posts.length);
  const kept = [...byPhrase].filter(([, g]) => g.length >= min);
  const ids = new Map(kept.map(([k, g]) => [k, g.map(p => p.id).join()]));
  const subsumed = k => kept.some(([o]) => o !== k && o.length > k.length && ` ${o} `.includes(` ${k} `) && ids.get(o) === ids.get(k));
  return kept.filter(([k]) => !subsumed(k))
    .map(([k, g]) => describe(k, g, metric, posts.length))
    .sort((a, b) => b.n - a.n || b.label.split(' ').length - a.label.split(' ').length || (b.reach ?? -1) - (a.reach ?? -1))
    .slice(0, limit);
}

// How Reels start: the first 2 and 3 spoken words, kept when several Reels share them.
export function recurringOpenings(posts, { metric = 'views', limit = 10 } = {}) {
  const byStart = new Map();
  for (const p of posts) {
    const w = words(openingOf(p));
    for (const n of [3, 2]) {
      if (w.length < n) continue;
      const k = w.slice(0, n).join(' ');
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(p);
    }
  }
  const min = minReels(posts.length);
  const kept = [...byStart].filter(([, g]) => g.length >= min);
  // Prefer the 3-word start when it covers the same Reels as its 2-word prefix.
  const same = new Map(kept.map(([k, g]) => [k, g.map(p => p.id).join()]));
  return kept.filter(([k]) => !(k.split(' ').length === 2 && kept.some(([o]) => o.startsWith(k + ' ') && same.get(o) === same.get(k))))
    .map(([k, g]) => describe(`${k}…`, g, metric, posts.length))
    .sort((a, b) => b.n - a.n || (b.reach ?? -1) - (a.reach ?? -1)).slice(0, limit);
}

// Content words and word pairs that characterise the selection. Against the whole archive they are ranked
// by lift (how much more often they appear here than overall); with no narrower selection, by how many
// Reels use them.
export function keyTerms(posts, allPosts, { metric = 'views', limit = 15 } = {}) {
  const docs = list => {
    const df = new Map();
    for (const p of list) {
      const tokens = words(transcriptOf(p));
      const terms = new Set([...tokens.filter(w => !isWeak(w) && w.length > 2), ...ngrams(tokens, 2).filter(g => g.split(' ').every(w => !isStop(w)) && !g.split(' ').every(isWeak))]);
      for (const t of terms) { if (!df.has(t)) df.set(t, []); df.get(t).push(p); }
    }
    return df;
  };
  const here = docs(posts), everywhere = docs(allPosts);
  const narrower = posts.length < allPosts.length;
  const min = minReels(posts.length);
  return [...here].filter(([, g]) => g.length >= min).map(([t, g]) => {
    const overall = (everywhere.get(t)?.length || g.length);
    const lift = ((g.length + 1) / (posts.length + 2)) / ((overall + 1) / (allPosts.length + 2));
    return { ...describe(t, g, metric, posts.length), lift };
  }).filter(t => !narrower || t.lift > 1.2)
    .sort((a, b) => narrower ? b.lift * Math.log2(1 + b.n) - a.lift * Math.log2(1 + a.n) : b.n - a.n)
    .slice(0, limit);
}

export function findPatterns(posts, allPosts, { metric = 'views' } = {}) {
  const spoken = posts.filter(p => transcriptOf(p).trim());
  const allSpoken = allPosts.filter(p => transcriptOf(p).trim());
  return {
    n: spoken.length,
    baseline: { reach: median(spoken.map(p => reach(p, metric))), likeRate: median(spoken.map(p => rate(p, 'likes', metric)).filter(v => v !== null)) },
    combos: labelCombos(posts, { metric }),
    phrases: recurringPhrases(spoken, { metric }),
    openings: recurringOpenings(spoken, { metric }),
    terms: keyTerms(spoken, allSpoken, { metric }),
    narrower: spoken.length < allSpoken.length,
  };
}
