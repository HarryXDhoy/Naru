'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map(),events={};
function node(){return {value:'',innerHTML:'',textContent:'',style:{},hidden:false,disabled:false,events:{},scrollHeight:40,offsetWidth:60,offsetHeight:32,classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){this.events[name]=fn},setAttribute(){},querySelector(){return null},contains(){return false},focus(){this.focused=true},setSelectionRange(start,end){this.caret=[start,end]}};}
let selection=null,button=null;
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:800,innerHeight:600,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement(){return node()},body:{appendChild(el){button=el}},addEventListener(name,fn){events[name]=fn},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},window:{addEventListener(){},getSelection(){return selection}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);const requests=[];
const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url.endsWith('/messages')||url.endsWith('/queue'))return response({});if(url==='/api/sessions/s1')return response({session:{provider_id:'p',model:'m',mode:'chat'},runs:[],messages:[],queue:[],artifacts:[]});if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,send,messageHTML,showSelectionReply,replyToSelection}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[],sessions:[],active:{},csrf_token:'test'};S.accounts={codex:{available:true,authenticated:true}};S.sid='s1';S.providerId='p';S.model='m';S.mode='chat';S.view='chat';S.detail={session:{provider_id:'p',model:'m'},runs:[],messages:[],queue:[],artifacts:[]};
const root={},other={},outside={};const col=nodes.get('col')||c.document.getElementById('col');col.contains=el=>el===root||el===other;
function select(text,a=root,b=a){selection={isCollapsed:false,rangeCount:1,anchorNode:{nodeType:3,parentElement:{closest(){return a}}},focusNode:{nodeType:3,parentElement:{closest(){return b}}},toString(){return text},getRangeAt(){return {getBoundingClientRect(){return {left:790,width:50,top:2,bottom:20}}}},removeAllRanges(){this.removed=true}};}
const input=c.document.getElementById('input');
(async()=>{
 assert.match(messageHTML({id:'m1',role:'assistant',content:'답'},true),/md selectable-message/);
 assert.match(messageHTML({id:'m2',role:'user',content:'질문'},true),/<span class="selectable-message">질문<\/span>/);
 input.value='기존 초안';S.drafts.s1=input.value;select('첫 줄\n두 번째 줄');showSelectionReply();assert.equal(button.hidden,false);assert.equal(button.style.left,'732px');assert.equal(button.style.top,'26px');assert.equal(button.textContent,'답장');
 let prevented=false;button.events.pointerdown({preventDefault(){prevented=true}});assert.ok(prevented,'pointerdown retains the selection');
 replyToSelection();assert.equal(input.value,'> 첫 줄\n> 두 번째 줄\n\n기존 초안');assert.equal(S.drafts.s1,input.value);assert.ok(input.focused);assert.ok(button.hidden);assert.ok(selection.removed);
 await send();assert.equal(requests[0].url,'/api/sessions/s1/messages');assert.equal(requests[0].body.content,'> 첫 줄\n> 두 번째 줄\n\n기존 초안');
 S.detail={session:{provider_id:'p',model:'m'},runs:[{id:'r1',status:'running'}],messages:[],queue:[],artifacts:[]};input.value='이어서';S.drafts.s1=input.value;select('인용');showSelectionReply();replyToSelection();await send();assert.equal(requests.find(r=>r.url.endsWith('/queue')).body.content,'> 인용\n\n이어서');
 input.value='다른 대화';S.sid='s1';S.epoch++;select('이전 대화');showSelectionReply();S.sid='s2';S.epoch++;replyToSelection();assert.equal(input.value,'다른 대화');
 S.sid='s1';select('여러 메시지',root,other);showSelectionReply();assert.ok(button.hidden,'cross-message selection is rejected');select('첨부',outside);showSelectionReply();assert.ok(button.hidden,'outside content is rejected');
 select('키보드 선택');events.keyup({key:'Shift',shiftKey:false});assert.equal(button.hidden,false);events.keydown({key:'Escape',metaKey:false,ctrlKey:false});assert.ok(button.hidden);
 console.log('Selection reply: scoped selection, draft, message, queue and session safety passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
