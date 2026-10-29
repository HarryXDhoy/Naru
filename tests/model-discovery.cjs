const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map(), node=()=>({addEventListener(){},classList:{add(){},remove(){},toggle(){}},dataset:{},style:{}});
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;c.window=Object.assign(c.window,c);
let calls=[];c.fetch=async url=>{calls.push(url);if(url.includes('ollama'))throw Error('offline');return {ok:true,json:async()=>({models:['model-a','model-b','model-a']})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,loadProviderModels,modelMenuHTML,approvalHTML,detailHTML}=c.NaruUI;
const chat={id:'codex',kind:'codex',name:'ChatGPT'},local={id:'ollama',kind:'ollama',name:'Ollama'};
S.data={providers:[chat,local],accounts:{codex:{available:true,authenticated:true}}};S.accounts=S.data.accounts;S.providerId='codex';S.model='my-current-model';
(async()=>{
 await Promise.all([loadProviderModels(chat),loadProviderModels(local)]);
 assert.deepEqual([...S.models.codex],['model-a','model-b']);
 assert.equal(S.model,'my-current-model');
 let html=modelMenuHTML();
 assert(html.includes('my-current-model') && html.includes('model-a'));
 assert(html.includes('서버에 연결되지 않아요') && html.includes('계정 사용 가능 여부는 실행 시 확인'));
 assert(html.includes('모델 목록 새로고침'));
 await loadProviderModels(chat);assert.equal(calls.length,2,'fresh cache avoids duplicate requests');
 await loadProviderModels(chat,true);assert.equal(calls.length,3,'manual refresh fetches');
 html=approvalHTML({id:'abc',tool:'search_sessions',arguments:{query:'<private>'}});
 assert(html.includes('이전 대화 검색')&&html.includes('현재 모델 제공자')&&html.includes('&lt;private&gt;'));
 assert(!html.includes('approve_all'),'search requires per-query approval');
 html=detailHTML({name:'search_sessions',args:{query:'test'},result:{matches:[{title:'Prior <chat>',role:'user',excerpt:'found & here'}]}});
 assert(html.includes('Prior &lt;chat&gt; · 사용자')&&html.includes('found &amp; here'));
 html=detailHTML({name:'todo',args:{},result:{items:[{text:'Finish',status:'completed'},{text:'Next',status:'in_progress'}]}});
 assert(html.includes('☑ Finish')&&html.includes('◐ Next (진행 중)'));
 console.log('Model discovery and search approval UI checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
