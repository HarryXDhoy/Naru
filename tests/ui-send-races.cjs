'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null}};}
const nativePrefs={};
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){},naruDesktop:{getPreference:k=>nativePrefs[k]??null,setPreference:(k,v)=>{if(v==null)delete nativePrefs[k];else nativePrefs[k]=v;return true}}},
 addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
let session=deferred(),message=deferred();const requests=[];
const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url==='/api/sessions')return session.promise;if(url.endsWith('/messages'))return message.promise;if(url==='/api/state')return response(c.NaruUI.S.data);if(url==='/api/sessions/existing'||url==='/api/sessions/created2')return response({session:{provider_id:'p1',model:'original',mode:'agent'},runs:[],messages:[]});throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,send,pref}=c.NaruUI;
S.data={providers:[{id:'p1',kind:'codex',name:'ChatGPT'},{id:'p2',kind:'openai',name:'Other'}],skills:[{id:'s1',enabled:true},{id:'s2',enabled:true}],sessions:[],active:{},csrf_token:'test'};
S.accounts={codex:{available:true,authenticated:true}};S.providerId='p1';S.model='original';S.mode='agent';S.skillIds=['s1'];S.view='models';
const input=c.document.getElementById('input');input.value='first request';S.drafts.new=input.value;
(async()=>{
 const pending=send();
 // Switching workspaces during the asynchronous session creation must not alter the request.
 S.epoch++;S.sid='other';S.providerId='p2';S.model='different';S.mode='chat';S.skillIds=['s2'];S.drafts.new='new unsent draft';
 session.resolve(response({id:'created'}));
 while(requests.length<2)await new Promise(r=>setImmediate(r));
 assert.deepEqual(requests[1].body,{content:'first request',provider_id:'p1',model:'original',mode:'agent',skill_ids:['s1']});
 message.resolve(response({run_id:'run'}));await pending;
 assert.equal(S.drafts.new,'new unsent draft','later draft is retained');
 // Typing or attaching another file while a send is pending must not be erased.
 message=deferred();S.sid='existing';S.providerId='p1';S.model='original';S.mode='agent';S.skillIds=['s1'];S.detail=null;S.drafts.existing='first';
 input.value='first';const firstFile={name:'a.txt',text:'alpha',size:5};S.files.existing=[firstFile];
 const next=send();input.value='next draft';S.drafts.existing=input.value;const secondFile={name:'b.txt',text:'beta',size:4};S.files.existing=[secondFile];
 message.resolve(response({run_id:'next'}));await next;
 assert.equal(input.value,'next draft');assert.equal(S.drafts.existing,'next draft');assert.equal(S.files.existing[0],secondFile);
 // Edits made while the new session is being created move into that session.
 session=deferred();message=deferred();S.sid=null;S.detail=null;S.drafts.new='first';input.value='first';S.files.new=[firstFile];
 const creating=send();input.value='later';S.drafts.new='later';S.files.new=[secondFile];
 session.resolve(response({id:'created2'}));
 while(S.sid!=='created2')await new Promise(r=>setImmediate(r));
 assert.equal(S.drafts.created2,'later');assert.equal(S.files.created2[0],secondFile);
 message.resolve(response({run_id:'created2-run'}));await creating;
 assert.equal(S.drafts.created2,'later');assert.equal(S.files.created2[0],secondFile);
 pref.set('theme','light');assert.equal(nativePrefs.theme,'light');
 // A fresh renderer/localStorage origin should read the durable desktop value.
 assert.equal(pref.get('theme','dark'),'light');pref.set('theme',null);assert.equal(pref.get('theme','dark'),'dark');
 console.log('Session-bound sending, draft retention and desktop preference bridge passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
