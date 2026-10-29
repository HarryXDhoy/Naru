'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const requests=[];let resolveAnswer,resolveMode;
c.fetch=async(url,opts={})=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url==='/api/questions/q1')return new Promise(resolve=>{resolveAnswer=resolve});if(url==='/api/sessions/s1'&&opts.method==='PATCH')return new Promise(resolve=>{resolveMode=resolve});throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,questionHTML,answerQuestion,runHTML,renderTools,renderWorkflows,editWorkflow,ACT}=c.NaruUI;
const question={id:'q1',run_id:'r1',kind:'question',tool:'ask_user',status:'pending',arguments:{question:'어느 것? <script>',options:['하나','둘 <b>']}};
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],sessions:[{id:'s1'}],skills:[],workflows:[{id:'w',name:'계획',prompt:'조사',mode:'plan'}],active:{s1:'awaiting_user'},settings:{},csrf_token:'test'};
S.sid='s1';S.providerId='p';S.mode='plan';S.view='chat';S.detail={session:{id:'s1',mode:'plan'},runs:[{id:'r1',mode:'plan',status:'awaiting_user'}],events:[],approvals:[question],messages:[],artifacts:[],queue:[]};
(async()=>{
 let html=questionHTML(question);assert.match(html,/어느 것\? &lt;script&gt;/);assert.match(html,/둘 &lt;b&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/직접 답변하기/);
 html=runHTML(S.detail.runs[0],true);assert.match(html,/답변 대기/);assert.match(html,/Naru의 질문/);assert.doesNotMatch(html,/모두 허용/);
 renderTools();html=nodes.get('tools').innerHTML;assert.match(html,/data-mode="steer" aria-pressed="false" disabled/);assert.match(html,/이미지 만들기" disabled/);assert.match(html,/대기열에 추가/);S.detail.runs=[];renderTools();assert.match(nodes.get('tools').innerHTML,/data-mode="plan" aria-pressed="true"/);S.detail.runs=[{id:'r1',mode:'plan',status:'awaiting_user'}];
 S.view='workflows';renderWorkflows();assert.match(nodes.get('main').innerHTML,/badge neutral">계획/);editWorkflow('w');assert.match(nodes.get('dialog').innerHTML,/value="plan" selected/);
 S.view='chat';S.mode='chat';S.detail.runs=[];const changing=ACT.mode({dataset:{mode:'plan'}});assert.equal(S.mode,'plan');assert.equal(S.modeSaving,true);assert.equal(requests[0].body.mode,'plan');await ACT.mode({dataset:{mode:'agent'}});assert.equal(requests.length,1,'모드 저장이 끝나기 전 두 번째 변경 금지');resolveMode({ok:true,json:async()=>({})});await changing;assert.equal(S.modeSaving,false);requests.length=0;S.detail.runs=[{id:'r1',mode:'plan',status:'awaiting_user'}];const pending=answerQuestion('q1','  하나  ');await answerQuestion('q1','두 번');assert.equal(requests.length,1);assert.equal(requests[0].body.answer,'하나');
 S.sid='s2';S.epoch++;S.detail={session:{id:'s2'},runs:[],messages:[],events:[],approvals:[],queue:[]};resolveAnswer({ok:true,json:async()=>({ok:true})});await pending;assert.equal(S.sid,'s2');assert.equal(requests.length,1,'늦은 답변이 새 대화를 갱신하지 않음');
 await answerQuestion('q1','stale');assert.equal(requests.length,1,'질문이 만료되거나 다른 대화면 답변하지 않음');
 console.log('Question cards, escaped options, answer snapshot, pending status and plan controls passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
