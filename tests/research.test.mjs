import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPosts,groupPosts,summarize,sortExamples,rate} from '../public/research.mjs';
const now=Date.UTC(2026,8,22);
const reel=(id,topic,hook,props={})=>({id,views:100,plays:200,likes:10,comments:2,publishedAt:'2026-08-01',duration:25,analysis:{labels:{topic:{value:topic,confidence:.9},mechanism:{value:hook,confidence:.9},structure:{value:'story',confidence:.95}}},...props});
test('topic and hook intersect and confidence applies to both selected filters',()=>{
 const rows=[reel('a','mindset','curiosity'),reel('b','mindset','direct'),reel('c','business','curiosity'),reel('d','mindset','curiosity',{duplicateOf:'a'}),reel('e','mindset','curiosity',{excludedReason:'No audio'})];
 assert.deepEqual(filterPosts(rows,{topic:'mindset',hook:'curiosity',minAgeDays:7,now}).map(p=>p.id),['a']);
 rows[0].analysis.labels.topic.confidence=.5;assert.equal(filterPosts(rows,{topic:'mindset',hook:'curiosity',dimension:'structure',minConfidence:.85,now}).length,0);
 assert.deepEqual(filterPosts(rows,{topic:'mindset',hook:'direct',now}).map(p=>p.id),['b']);
});
test('engagement comparisons use median per-Reel rates with independent known counts',()=>{
 const rows=[reel('a','mindset','direct'),reel('b','mindset','direct',{views:1000,likes:20,comments:null}),reel('c','mindset','direct',{views:null,likes:300,comments:5}),reel('d','mindset','direct',{views:0,likes:0,comments:0})];
 const s=summarize(rows);assert.equal(s.n,4);assert.equal(s.likeRate,60);assert.equal(s.commentRate,20);assert.deepEqual(s.counts,{reach:3,likes:4,likeRate:2,commentRate:1});assert.equal(s.likes,15);
 assert.equal(rate(rows[0],'likes','plays'),50);assert.equal(rate(rows[2],'likes','views'),null);assert.equal(rate(rows[3],'likes','views'),null);
 assert.equal(summarize([reel('z','mindset','direct',{likes:null,comments:null})]).likeRate,null);
});
test('group comparisons exclude unclassified and excluded items; sort missing metrics last',()=>{
 const rows=[reel('a','mindset','direct',{views:1000,likes:10}),reel('b','mindset','curiosity',{likes:50}),reel('c','mindset','direct',{likes:null}),reel('d','mindset','direct',{analysis:null}),reel('e','mindset','direct',{excludedReason:'Too little speech'})];
 const groups=groupPosts(rows);assert.equal(groups.length,2);assert.equal(groups.find(g=>g.key==='direct').n,2);assert.equal(groups.find(g=>g.key==='direct').likeRate,10);
 assert.deepEqual(sortExamples(rows.slice(0,3),'likeRate').map(p=>p.id),['b','a','c']);assert.deepEqual(sortExamples(rows.slice(0,3),'reach').map(p=>p.id),['a','b','c']);
});
