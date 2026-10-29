'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const response=x=>({ok:true,json:async()=>x});let getWait,createWait,messageWait;const requests=[];
c.fetch=async(url,opts={})=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null,method:opts.method});
 if(url==='/api/sessions/s1'&&opts.method==='PATCH')return response({id:'s1',access_mode:JSON.parse(opts.body).access_mode});
 if(url==='/api/sessions/s1')return getWait.promise;
 if(url==='/api/sessions')return createWait.promise;
 if(url.endsWith('/messages'))return messageWait.promise;
 if(url==='/api/state')return response(c.NaruUI.S.data);
 throw Error('unexpected '+url);
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,sessionAccess,accessLabel,saveSessionAccess,send,loadDetail}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[],sessions:[{id:'s1',access_mode:'inherit'},{id:'s2',access_mode:'manual'}],settings:{access_mode:'auto_approve'},active:{},csrf_token:'test'};
S.accounts={codex:{available:true,authenticated:true}};S.providerId='p';S.model='test';S.mode='agent';S.view='models';
(async()=>{
 S.sid='s1';S.detail={session:{id:'s1',access_mode:'inherit'},runs:[]};assert.equal(sessionAccess(),'inherit');assert.equal(accessLabel(),'기본 · 자동 승인');
 getWait=deferred();const oldDetail=loadDetail();await saveSessionAccess('full_access','s1',S.epoch);assert.equal(sessionAccess(),'full_access');
 getWait.resolve(response({session:{id:'s1',access_mode:'inherit'},runs:[],messages:[]}));await oldDetail;
 assert.equal(sessionAccess(),'full_access','stale detail response cannot restore old privilege display');
 S.sid='s2';S.detail={session:{id:'s2',access_mode:'manual'},runs:[]};assert.equal(accessLabel(),'매번 승인','session access is independent');
 S.sid=null;S.detail=null;S.epoch++;await saveSessionAccess('full_access',null,S.epoch);
 const input=c.document.getElementById('input');input.value='hello';S.drafts.new='hello';createWait=deferred();messageWait=deferred();
 const pending=send();assert.equal(requests.find(r=>r.url==='/api/sessions').body.access_mode,'full_access','new session captures explicit access');
 S.epoch++;S.sid='s2';createWait.resolve(response({id:'created'}));
 while(!requests.some(r=>r.url==='/api/sessions/created/messages'))await new Promise(r=>setImmediate(r));
 assert.equal(S.newAccess,'inherit','a sent full-access draft does not affect the next new chat');
 messageWait.resolve(response({run_id:'r'}));await pending;
 S.sid=null;S.epoch++;await saveSessionAccess('auto_approve',null,S.epoch);input.value='next';S.drafts.new='next';createWait=deferred();messageWait=deferred();
 const next=send();S.epoch++;await saveSessionAccess('full_access',null,S.epoch);createWait.resolve(response({id:'created2'}));
 while(!requests.some(r=>r.url==='/api/sessions/created2/messages'))await new Promise(r=>setImmediate(r));
 assert.equal(S.newAccess,'full_access','a later explicit new-draft selection is retained');messageWait.resolve(response({run_id:'r2'}));await next;
 S.sid=null;S.detail=null;S.epoch++;input.value='retry';S.drafts.new='retry';createWait=deferred();messageWait=deferred();
 const failed=send();createWait.resolve(response({id:'failed',access_mode:'full_access'}));
 while(!requests.some(r=>r.url==='/api/sessions/failed/messages'))await new Promise(r=>setImmediate(r));
 messageWait.resolve({ok:false,json:async()=>({error:'failed'})});await failed;
 assert.equal(S.sid,'failed');assert.equal(S.drafts.failed,'retry','failed send keeps draft');assert.equal(sessionAccess(),'full_access','failed first send cannot hide the session’s actual access');
 S.data.sessions=[];assert.equal(sessionAccess(),'full_access','stale global state cannot hide a newly created session’s access');
 await assert.rejects(()=>saveSessionAccess('invalid',null,S.epoch));
 console.log('Per-chat access labels, persistence, stale responses and new-chat races passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
