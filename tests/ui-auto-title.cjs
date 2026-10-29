'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,events:{},classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){this.events[name]=fn},setAttribute(){},querySelector(){return null},focus(){},select(){},replaceWith(){}};}
let now=10000;class Clock extends Date{static now(){return now;}}
const c={console,URL,JSON,Date:Clock,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{visibilityState:'visible',getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement(){return node()},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const response=x=>({ok:true,json:async()=>x});let releasePatch,releaseStaleState,delayState=false;const calls=[];
let state={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[],sessions:[{id:'a',title:'첫 메시지'},{id:'b',title:'다른 대화'}],active:{},title_pending:{a:true,b:true}};
c.fetch=async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body&&JSON.parse(opts.body)});if(url==='/api/state'){const snapshot=JSON.parse(JSON.stringify(state));if(delayState){delayState=false;return new Promise(resolve=>{releaseStaleState=()=>resolve(response(snapshot))})}return response(snapshot)}if(url==='/api/sessions/a'&&opts.method==='PATCH')return new Promise(resolve=>{releasePatch=()=>resolve(response({}))});throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,tick,startRename,renderTop,refreshState}=c.NaruUI;
S.data=JSON.parse(JSON.stringify(state));S.view='chat';S.sid='a';S.detail={session:{id:'a',title:'첫 메시지'},runs:[],artifacts:[]};
(async()=>{
 state.sessions[0].title='자동으로 요약한 제목';state.sessions[1].title='다른 요약 제목';state.title_pending={};
 await tick();assert.equal(S.detail.session.title,'자동으로 요약한 제목');assert.match(nodes.get('top').innerHTML,/자동으로 요약한 제목/);assert.match(nodes.get('side').innerHTML,/다른 요약 제목/);
 now+=3000;await tick();assert.equal(calls.filter(x=>x.url==='/api/state').length,1,'stops polling after titles finish');
 delayState=true;const stale=refreshState();
 startRename();const input=nodes.get('rename-input');input.value='내가 정한 제목';const oldTop=nodes.get('top').innerHTML;renderTop();assert.equal(nodes.get('top').innerHTML,oldTop,'polling must not replace rename input');
 input.events.keydown({key:'Enter',isComposing:false,preventDefault(){}});assert.equal(calls.at(-1).url,'/api/sessions/a');
 S.epoch++;S.sid='b';S.detail={session:{id:'b',title:'다른 요약 제목'},runs:[],artifacts:[]};renderTop();
 state.sessions[0].title='내가 정한 제목';releasePatch();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 releaseStaleState();await stale;
 assert.equal(S.detail.session.title,'다른 요약 제목','late rename must not alter the newly selected chat');assert.match(nodes.get('side').innerHTML,/내가 정한 제목/);
 assert.equal(S.data.sessions[0].title,'내가 정한 제목','late state cannot restore the previous title');
 console.log('Automatic title polling and session-bound rename passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
