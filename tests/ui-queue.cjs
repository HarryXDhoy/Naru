'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
let resolvePost;const post=new Promise(r=>{resolvePost=r}),requests=[];
const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url.endsWith('/queue'))return post;if(url==='/api/sessions/s1')return response({session:{provider_id:'p',model:'model-1',mode:'agent'},runs:[{id:'r1',status:'running'}],messages:[],queue:[]});if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,send,queueHTML,enqueueMode,renderTools}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[{id:'skill',enabled:true}],sessions:[],active:{s1:'running'},csrf_token:'test'};
S.accounts={codex:{available:true,authenticated:true}};S.sid='s1';S.providerId='p';S.model='model-1';S.mode='agent';S.skillIds=['skill'];S.view='models';
S.detail={session:{provider_id:'p',model:'model-1',mode:'agent'},runs:[{id:'r1',status:'running'}],messages:[],queue:[]};
const input=c.document.getElementById('input');input.value='먼저 검토해 줘';S.drafts.s1=input.value;S.files.s1=[{name:'notes.txt',text:'original content'}];
(async()=>{
 renderTools();assert.match(c.document.getElementById('tools').innerHTML,/대기열에 추가/);assert.match(c.document.getElementById('tools').innerHTML,/data-act="stop"/);
 const pending=send();input.value='다음 초안';S.drafts.s1=input.value;S.files.s1=[{name:'new.txt',text:'new'}];
 assert.equal(requests[0].url,'/api/sessions/s1/queue');assert.equal(requests[0].body.provider_id,'p');assert.equal(requests[0].body.model,'model-1');assert.equal(requests[0].body.mode,'agent');assert.deepEqual(requests[0].body.skill_ids,['skill']);assert.match(requests[0].body.content,/original content/);
 resolvePost(response({queued:{id:'q'}}));await pending;assert.equal(S.drafts.s1,'다음 초안');assert.equal(S.files.s1[0].name,'new.txt');
 const item={id:'q" onclick="bad',content:'<script>alert(1)</script>\n\n다음은 사용자가 첨부한 참고 자료입니다.\n\n--- 첨부: <a>.txt ---\nbody\n--- 첨부 끝 ---'};
 const html=queueHTML([item],true,false,'<error>');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;a&gt;.txt/);assert.match(html,/&lt;error&gt;/);assert.match(html,/data-act="queue-resume"/);assert.match(html,/data-act="queue-edit"/);assert.match(html,/data-act="queue-remove"/);assert.doesNotMatch(queueHTML([item],true,true,''),/data-act="queue-resume"/);
 S.detail={runs:[{id:'r1',status:'cancelled'}],queue:[item],queue_paused:true};assert.equal(enqueueMode(),true,'paused queue accepts messages');
 console.log('Queue UI: active enqueue, snapshots, draft safety, escaping and pause controls passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
