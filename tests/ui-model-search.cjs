const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let resolveModels,pop,doc;
const handlers={};
const anchor={id:'model-chip',setAttribute(){},focus(){doc.activeElement=this},getBoundingClientRect(){return {left:10,top:500,bottom:530}}};
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({}),
 fetch:()=>new Promise(r=>{resolveModels=r})};
doc=c.document={activeElement:null,addEventListener(type,fn){handlers[type]=fn},documentElement:{dataset:{},classList:{add(){}}},getElementById(id){return id==='model-chip'?anchor:{addEventListener(){}}},querySelector(){return null},querySelectorAll(){return []},body:{appendChild(){}},createElement(){
 const search={value:'',handlers:{},addEventListener(k,fn){this.handlers[k]=fn},focus(){doc.activeElement=this},matches(){return false}};
 const results={innerHTML:'',contains(el){return !!el?.isModel},querySelectorAll(){return this.buttons||[]}};
 const el={id:'pop',style:{},scrollTop:0,offsetWidth:300,offsetHeight:400,handlers:{},removed:false,search,results,setAttribute(){},remove(){this.removed=true},addEventListener(k,fn){this.handlers[k]=fn},querySelector(sel){if(sel==='[data-model-search]')return search;if(sel==='[data-model-results]')return results;if(sel==='[data-custom]:not([hidden])')return null;if(sel==='[data-pick="m"]')return results.buttons?.[0]||null;return null}};
 pop=el;return el;
}};
c.globalThis=c;c.window=Object.assign(c.window,c);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,modelMenu}=c.NaruUI;S.data={providers:[{id:'local',kind:'ollama',name:'Local'}],accounts:{}};S.accounts={};S.providerId='local';
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 modelMenu();const search=pop.search,results=pop.results;assert.equal(doc.activeElement,search);
 search.value='new';search.handlers.input();assert.match(results.innerHTML,/불러오는 중/);
 resolveModels({ok:true,json:async()=>({models:['new-model','other']})});await tick();await tick();
 assert.equal(pop.search,search,'async refresh preserves search DOM and cursor');assert.equal(search.value,'new');assert.equal(doc.activeElement,search);assert.match(results.innerHTML,/new-model/);assert.doesNotMatch(results.innerHTML,/data-m="other"/);
 let clicked=0,focusCount=0;const button={isModel:true,dataset:{pick:'m',p:'local',m:'new-model'},focus(){focusCount++;doc.activeElement=this},click(){clicked++}};results.buttons=[button];
 let prevented=0;const key=(k,composing=false)=>pop.handlers.keydown({key:k,target:search,isComposing:composing,preventDefault(){prevented++}});
 key('Enter',true);pop.handlers.keydown({key:'Enter',keyCode:229,target:search,preventDefault(){prevented++}});assert.equal(clicked,0,'IME composition must not select a model');key('Enter');assert.equal(clicked,1);key('ArrowDown');assert.equal(doc.activeElement,button);
 // A second refresh should restore focus to the matching model button.
 c.fetch=()=>Promise.resolve({ok:true,json:async()=>({models:['new-model','new-model-2']})});await c.NaruUI.loadProviderModels(S.data.providers[0],true);assert.equal(doc.activeElement,button);assert(focusCount>=3,'refresh restores the focused result');
 handlers.keydown({key:'Escape',metaKey:false,ctrlKey:false});assert(pop.removed);assert.equal(doc.activeElement,anchor,'Escape returns focus to model picker');
 console.log('Model search input, async refresh, keyboard and IME checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
