'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,disabled:false,isConnected:true,classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false},focus(){}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
let requests=[],result={ok:true},stateFail=false,statePending=null;const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,method:opts.method});if(opts.method==='DELETE')return result.ok?response({ok:true}):{ok:false,json:async()=>({error:'실행 중'})};if(url==='/api/state'){if(statePending){const pending=statePending;statePending=null;return pending;}if(stateFail)throw Error('offline');return response(c.NaruUI.S.data);}throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,renderSide,deleteChat,refreshState}=c.NaruUI;
const a={id:'a',title:'<첫 대화>'},b={id:'b',title:'둘째 대화'};
S.data={sessions:[a,b],active:{},providers:[],skills:[],settings:{},csrf_token:'test'};S.view='chat';S.sid='b';S.detail={session:b,runs:[],messages:[],artifacts:[]};S.drafts.a='a draft';S.files.a=[{name:'a file'}];S.drafts.b='b draft';
(async()=>{
 renderSide();const html=nodes.get('side').innerHTML;
 assert.match(html,/data-act="delete-chat" data-id="a"/);assert.match(html,/&lt;첫 대화&gt; 대화 삭제/);assert(!html.includes('<첫 대화>'));
 let resolveState;statePending=new Promise(resolve=>{resolveState=resolve});const stale=refreshState();requests=[];
 S.sid='a';S.detail={session:a,runs:[],messages:[],artifacts:[]};deleteChat('a');assert.match(nodes.get('dialog').innerHTML,/&lt;첫 대화&gt;/);assert.match(nodes.get('dialog').innerHTML,/대기 메시지/);
 S.sid='b';S.detail={session:b,runs:[],messages:[],artifacts:[]};stateFail=true;await nodes.get('confirm-yes').handlers.click({currentTarget:nodes.get('confirm-yes')});
 assert.equal(requests[0].url,'/api/sessions/a');assert.equal(S.sid,'b');assert.equal(S.drafts.b,'b draft');assert(!S.data.sessions.some(s=>s.id==='a'));assert.equal(S.drafts.a,undefined);assert.equal(S.files.a,undefined);resolveState(response({...S.data,sessions:[a,b]}));await stale;assert(!S.data.sessions.some(s=>s.id==='a'),'a stale response must not restore a deleted chat');
 S.data.sessions=[a,b];S.data.active={a:'running'};requests=[];deleteChat('a');assert.equal(requests.length,0);assert.match(nodes.get('toast').textContent,/멈춘 뒤/);
 S.data.active={};result={ok:false};deleteChat('a');await nodes.get('confirm-yes').handlers.click({currentTarget:nodes.get('confirm-yes')});assert(S.data.sessions.some(s=>s.id==='a'));assert.equal(S.sid,'b');assert.match(nodes.get('dlg-err').textContent,/실행 중/);
 console.log('Chat deletion controls, target capture, active protection and refresh failure passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
