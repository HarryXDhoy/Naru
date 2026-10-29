'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,disabled:false,classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}let session=deferred(),message=deferred();const requests=[];
const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url==='/api/sessions')return session.promise;if(url.endsWith('/messages'))return message.promise;if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,renderWorkflows,editWorkflow,runWorkflow}=c.NaruUI;
S.data={providers:[{id:'p1',kind:'codex',name:'ChatGPT'},{id:'p2',kind:'openai',name:'Other'}],workflows:[{id:'w1',name:'<script>flow</script>',prompt:'original work',mode:'agent'}],skills:[{id:'s1',enabled:true},{id:'s2',enabled:true}],sessions:[],active:{},csrf_token:'test'};
S.accounts={codex:{available:true,authenticated:true}};S.providerId='p1';S.model='original';S.mode='chat';S.skillIds=['s1'];S.view='workflows';S.drafts.new='unsent';S.files.new=[{name:'keep.txt'}];
(async()=>{
 renderWorkflows();let html=nodes.get('main').innerHTML;assert(html.includes('&lt;script&gt;flow&lt;/script&gt;')&&!html.includes('<script>flow</script>'));assert.match(html,/모델 사용량과 도구 승인/);assert.match(html,/에이전트/);
 editWorkflow('w1');html=nodes.get('dialog').innerHTML;assert(html.includes('&lt;script&gt;flow&lt;/script&gt;')&&!html.includes('<script>flow</script>'));assert.match(html,/original work/);
 const pending=runWorkflow('w1');await runWorkflow('w1');assert.equal(requests.length,1,'repeated click does not start another workflow');
 S.view='models';S.epoch++;S.providerId='p2';S.model='different';S.skillIds=['s2'];
 session.resolve(response({id:'new-session',title:'flow',provider_id:'p1',model:'original',mode:'agent'}));
 while(requests.length<2)await new Promise(r=>setImmediate(r));
 assert.deepEqual(requests[1].body,{content:'original work',provider_id:'p1',model:'original',mode:'agent',skill_ids:['s1']});
 message.resolve(response({run_id:'run'}));await pending;
 assert.equal(S.view,'models','navigation while starting is preserved');assert.equal(S.drafts.new,'unsent');assert.equal(S.files.new[0].name,'keep.txt');assert.equal(S.workflowStarting,false);
 session=deferred();message=deferred();S.view='workflows';S.providerId='p1';S.model='original';const failed=runWorkflow('w1');S.view='models';S.epoch++;
 session.resolve(response({id:'failed-session',title:'flow',provider_id:'p1',model:'original',mode:'agent'}));
 while(!requests.some(r=>r.url==='/api/sessions/failed-session/messages'))await new Promise(r=>setImmediate(r));
 message.resolve({ok:false,json:async()=>({error:'model unavailable'})});await assert.rejects(failed,/초안에 보관/);
 assert.equal(S.drafts['failed-session'],'original work','failed prompt is recoverable');assert.equal(S.drafts.new,'unsent');assert(S.data.sessions.some(s=>s.id==='failed-session'));assert.equal(S.view,'models');
 console.log('Workflow render, request snapshots, double-click and draft preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
