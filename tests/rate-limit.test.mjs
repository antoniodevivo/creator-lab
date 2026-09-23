import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestPacer,request,RunPausedError} from '../lib/providers.mjs';

test('concurrent workers share a paced queue and a provider cooldown',async()=>{
 let clock=0;const starts=[];const pacer=createRequestPacer(20,{now:()=>clock,sleep:async ms=>{clock+=ms;}});
 await Promise.all(Array.from({length:24},async()=>{await pacer.wait();starts.push(clock);}));
 for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=3100);
 assert.ok(starts.filter(t=>t<60000).length<=20);
 const before=clock;pacer.cooldown(45000);await pacer.wait();assert.ok(clock>=before+45000);
});
test('pausing cancels queued requests without sending or consuming their slot',async()=>{
 let clock=0,cancelled=false;const pacer=createRequestPacer(20,{now:()=>clock,sleep:async ms=>{clock+=ms;cancelled=true;}});
 await pacer.wait();await assert.rejects(pacer.wait(()=>cancelled),RunPausedError);cancelled=false;await pacer.wait();assert.equal(clock,3100);
});
test('short Groq limits retry through the shared gate beyond three attempts',async()=>{
 const original=global.fetch;let calls=0,starts=0;const waits=[],cooldowns=[];
 global.fetch=async()=>++calls<=4?Response.json({error:{message:'Requests per minute exceeded'}},{status:429,headers:{'retry-after':'3'}}):Response.json({text:'Recovered'});
 try{const result=await request('https://api.groq.com/test',{}, {service:'Groq',rateRetries:10,beforeAttempt:()=>{starts++;},onRateLimit:ms=>cooldowns.push(ms),sleep:async ms=>{waits.push(ms);}});assert.equal((await result.json()).text,'Recovered');assert.equal(starts,5);assert.deepEqual(waits,[3000,3000,3000,3000]);assert.deepEqual(cooldowns,[3250,3250,3250,3250]);}finally{global.fetch=original;}
});
test('long quota resets still pause rather than retrying indefinitely',async()=>{
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;return Response.json({error:{message:'Audio seconds per hour exceeded'}},{status:429,headers:{'retry-after':'1800'}});};
 try{await assert.rejects(request('https://api.groq.com/test',{}, {service:'Groq',rateRetries:10,sleep:async()=>assert.fail('Must not wait for a long quota reset')}),/Audio seconds per hour/);assert.equal(calls,1);}finally{global.fetch=original;}
});
