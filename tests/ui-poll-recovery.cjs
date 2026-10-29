'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null},scrollHeight:0,scrollTop:0,clientHeight:0};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{visibilityState:'visible',getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({}),
 AbortSignal:{timeout(){const ctl=new AbortController();setTimeout(()=>ctl.abort(),15);return ctl.signal;}}};
c.globalThis=c;Object.assign(c.window,c);
let tries=0;
const completed={session:{id:'s',provider_id:'p',model:'',mode:'chat'},runs:[{id:'r',session_id:'s',status:'completed',mode:'chat'}],messages:[],events:[],approvals:[],artifacts:[],rev:2};
c.fetch=async(url,opts)=>{
 if(url.endsWith('/live')){tries++;if(tries===1)return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('aborted'))));return {ok:true,json:async()=>({run_id:null,status:null,rev:2})};}
 if(url==='/api/sessions/s')return {ok:true,json:async()=>completed};
 throw Error('unexpected request: '+url);
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,tick}=c.NaruUI;
S.sid='s';S.view='chat';S.providerId='p';S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[],sessions:[],active:{}};
S.detail={...completed,runs:[{id:'r',session_id:'s',status:'running',mode:'chat'}]};
(async()=>{await tick();assert.equal(tries,1);assert.equal(S.detail.runs[0].status,'running');await tick();assert.equal(tries,2);assert.equal(S.detail.runs[0].status,'completed');assert(nodes.get('tools').innerHTML.includes('data-act="model-menu"'));assert(nodes.get('tools').innerHTML.includes('aria-label="보내기"'));console.log('A stalled live poll times out and the next poll restores the completed state.');})().catch(e=>{console.error(e);process.exitCode=1});
