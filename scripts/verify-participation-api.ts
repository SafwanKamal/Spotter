import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {loadEnvConfig} from '@next/env';
import {generateSessionCookie} from '@auth0/nextjs-auth0/testing';
loadEnvConfig(process.cwd());
const url='http://localhost:3012';
async function main(){
 const dir=await mkdtemp(join(tmpdir(),'participation-api-'));let server:ChildProcess|undefined;
 async function start(){
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','localhost','--port','3012'],{env:{...process.env,NODE_ENV:'production',REWARDS_DB_PATH:join(dir,'rewards.sqlite')},stdio:'ignore'});
  for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error('Test server failed to start');try{const r=await fetch(url+'/api/rewards/leaderboard');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Test server timeout');
 }
 async function stop(){if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}}
 try{
 await start();
 const now=Math.floor(Date.now()/1000);
 const cookie=await generateSessionCookie({user:{sub:'auth0|reward-integration',name:'Test'},tokenSet:{accessToken:'test',expiresAt:now+3600},internal:{sid:'reward-test',createdAt:now}},{secret:process.env.AUTH0_SECRET!});
 const headers={'Content-Type':'application/json',Cookie:`__session=${cookie}`,Origin:url};
 const input={source:'live',exercise:'pushup',duration:10,coverage:.9,reps:[{start:1,end:4}]};
 const claim=(data:unknown,extra:Record<string,string>={})=>fetch(url+'/api/rewards/claim',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 assert.equal((await fetch(url+'/api/rewards/claim',{method:'POST',body:'{}'})).status,401);
 assert.equal((await claim(input,{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await claim({...input,source:'synthetic'})).status,400);
 assert.equal((await claim({...input,source:'video'})).status,400);
 const first=await claim(input);assert.equal(first.status,201);assert.equal((await first.json()).awardedPoints,12);
 const second=await claim(input);assert.equal(second.status,200);assert.equal((await second.json()).alreadyClaimed,true);
 await stop();await start();
 const board=await (await fetch(url+'/api/rewards/leaderboard?period=all',{headers})).json();assert.equal(board.me.points,12);assert.equal(board.entries.length,1);assert.equal(board.history.length,1);
 assert.equal((await claim(input)).status,200);
 assert.equal((await fetch(url+'/api/rewards/demo')).status,410);
 console.log('PASS: authenticated claim, rejected synthetic/cross-origin requests, duplicate prevention, leaderboard/history, and persistence across server restart.');
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
