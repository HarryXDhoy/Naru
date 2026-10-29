'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(){return {addEventListener(){},classList:{add(){},remove(){},toggle(){}}}},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,runHTML}=c.NaruUI;
const run={id:'r',status:'running',mode:'agent'};
S.detail={events:[{run_id:'r',type:'status',data:{text:'상태 <script>안전</script>'}}],approvals:[],artifacts:[],live:{run_id:'r'}};
S.live='';
let html=runHTML(run,true);
assert.match(html,/class="agent-status" role="status"/);assert.match(html,/상태 &lt;script&gt;안전&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/id="waiting"/);
assert.doesNotMatch(runHTML(run,false),/class="agent-status"/);
assert.doesNotMatch(runHTML({...run,mode:'chat'},true),/class="agent-status"/);
assert.doesNotMatch(runHTML({...run,create_image:true},true),/class="agent-status"/);
assert.doesNotMatch(runHTML({...run,status:'completed'},true),/class="agent-status"/);
S.detail.events.push({run_id:'r',type:'tool_call',id:'c',data:{name:'read_file',arguments:{path:'file'}}});
html=runHTML(run,true);assert.match(html,/도구 실행 중/);assert.doesNotMatch(html,/상태 &lt;script&gt;/);
S.detail.events.push({run_id:'other',type:'status',data:{text:'다른 대화'}});
html=runHTML({...run,status:'awaiting_approval'},true);assert.match(html,/승인 대기/);assert.doesNotMatch(html,/다른 대화/);
S.detail.events.push({run_id:'r',type:'tool_result',data:{call_id:'c',result:{content:'done'}}});html=runHTML(run,true);assert.match(html,/작업 중/);assert.doesNotMatch(html,/도구 실행 중/);
console.log('Agent status uses real run events, isolates sessions and escapes text.');
