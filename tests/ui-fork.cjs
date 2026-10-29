'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();function node(){return {value:'',innerHTML:'',textContent:'',hidden:false,style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},focus(){}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};c.globalThis=c;Object.assign(c.window,c);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};const response=x=>({ok:true,json:async()=>x});let fork=deferred();const requests=[];
c.fetch=async(url,opts={})=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url.endsWith('/fork'))return fork.promise;if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,messageHTML,forkMessage}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],sessions:[{id:'s1',title:'원본'},{id:'s2',title:'다른 대화'}],skills:[],active:{},settings:{},csrf_token:'test'};S.view='chat';S.sid='s1';S.providerId='p';S.detail={session:{id:'s1'},runs:[],messages:[{id:'u1',role:'user',content:'질문'},{id:'a1',role:'assistant',content:'완료'}],artifacts:[{id:'img1',image_generated:true,message_id:'a1',name:'그림.png'}]};
(async()=>{
 const user=messageHTML(S.detail.messages[0],false),assistant=messageHTML(S.detail.messages[1],true);
 assert.match(user,/data-act="fork-message" data-id="u1"/);assert.match(assistant,/data-act="fork-message" data-id="a1"/);assert.match(assistant,/\/api\/artifacts\/img1\/download/);
 S.drafts.s1='기존 초안';const pending=forkMessage('a1');await forkMessage('a1');assert.equal(requests.length,1,'더블 클릭 시 분기는 하나만 생성');assert.equal(requests[0].url,'/api/sessions/s1/fork');assert.equal(requests[0].body.message_id,'a1');
 S.sid='s2';S.epoch++;S.detail={session:{id:'s2'},runs:[],messages:[],artifacts:[]};fork.resolve(response({session:{id:'new',title:'원본 · 분기',provider_id:'p'}}));await pending;
 assert.equal(S.sid,'s2','대화 전환 뒤 새 대화로 이동하지 않음');assert(S.data.sessions.some(x=>x.id==='new'));assert.equal(S.drafts.s1,'기존 초안');
 const before=requests.length;await forkMessage('missing');assert.equal(requests.length,before,'현재 대화에 없는 메시지로 분기하지 않음');
 console.log('Fork controls, copied image, session race, double click and draft preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
