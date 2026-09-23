export const median=values=>{const a=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export const rate=(post,field,metric)=>known(post[field])&&known(post[metric])&&post[metric]>0?post[field]/post[metric]*1000:null;
export function filterPosts(posts,{topic='all',hook='all',dimension='mechanism',minAgeDays=0,minConfidence=0,maxDuration=0,dedupe=true,now=Date.now()}={}){
 return posts.filter(p=>(!dedupe||!p.duplicateOf)&&(!minAgeDays||(p.publishedAt&&(now-Date.parse(p.publishedAt))/864e5>=minAgeDays))&&(!maxDuration||(known(p.duration)&&p.duration<=maxDuration))&&(topic==='all'||(!p.excludedReason&&p.analysis?.labels.topic?.value===topic))&&(hook==='all'||(!p.excludedReason&&p.analysis?.labels.mechanism?.value===hook))&&(!minConfidence||[dimension,...(topic==='all'?[]:['topic']),...(hook==='all'?[]:['mechanism'])].every(key=>p.analysis?.labels[key]?.confidence>=minConfidence)));
}
export function summarize(posts,metric='views'){
 const values={reach:posts.map(p=>p[metric]).filter(known),likes:posts.map(p=>p.likes).filter(known),likeRate:posts.map(p=>rate(p,'likes',metric)).filter(v=>v!==null),commentRate:posts.map(p=>rate(p,'comments',metric)).filter(v=>v!==null)};
 return {n:posts.length,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,median(v)])),counts:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.length]))};
}
export function groupPosts(posts,dimension='mechanism',metric='views'){
 const buckets=new Map();for(const p of posts){if(!p.analysis||p.excludedReason)continue;const key=p.analysis.labels[dimension]?.value||'unclear';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
 return [...buckets].map(([key,posts])=>({key,posts,...summarize(posts,metric)}));
}
export function sortExamples(posts,sort='reach',metric='views'){
 const score=p=>sort==='likeRate'?rate(p,'likes',metric):sort==='commentRate'?rate(p,'comments',metric):known(p[metric])?p[metric]:null;
 return posts.slice().sort((a,b)=>{const av=score(a),bv=score(b);if(av===null)return bv===null?a.id.localeCompare(b.id):1;if(bv===null)return -1;return bv-av||a.id.localeCompare(b.id);});
}
