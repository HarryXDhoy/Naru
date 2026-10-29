'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,disabled:false,isConnected:true,classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false},focus(){}};}
let notify,resolveState,installs=0,rejectInstall,readyVersions=[],stateOk=true;const initial=new Promise(resolve=>{resolveState=resolve});
const bridge={updateState:()=>initial,onUpdateState:cb=>{notify=cb;return()=>{}},checkForUpdates:async()=>({status:'checking'}),installUpdate:()=>{installs++;return new Promise((_,reject)=>{rejectInstall=reject})},reportBootReady:async version=>{readyVersions.push(version)}};
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){},naruDesktop:bridge},addEventListener(){},matchMedia:()=>({matches:false,addListener(){},addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
let data={sessions:[],active:{},providers:[],skills:[],settings:{workspace:'/tmp',report_directory:'/tmp'},version:'0.3.5'};
c.fetch=async()=>stateOk?{ok:true,json:async()=>data}:{ok:false,json:async()=>({error:'offline'})};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,updateHTML,initUpdater,checkUpdate,installUpdate,boot,fileReads}=c.NaruUI;
S.data=data;S.view='chat';
(async()=>{
 assert.match(updateHTML(),/업데이트 확인/);initUpdater();notify({status:'ready',version:'0.3.6'});resolveState({status:'idle'});
 await new Promise(r=>setImmediate(r));assert.equal(S.update.status,'ready','late initial state must not replace a ready event');
 assert.match(nodes.get('side').innerHTML,/업데이트 준비됨/);assert.match(updateHTML(),/v0\.3\.6 업데이트 준비됨/);
 fileReads.new=1;await installUpdate();assert.equal(installs,0,'in-flight attachment reading prevents restart');delete fileReads.new;
 S.data.active={other:'running'};await installUpdate();assert.equal(installs,0,'other conversation run prevents restart');S.data.active={};
 S.drafts.new='미전송 초안';await installUpdate();assert.equal(installs,0,'restart requires confirmation');assert.match(nodes.get('dialog').innerHTML,/설정 변경/);assert.match(nodes.get('dialog').innerHTML,/입력, 첨부/);
 const pending=nodes.get('confirm-yes').handlers.click({currentTarget:nodes.get('confirm-yes')});assert.equal(installs,1);
 let prevented=false;nodes.get('dialog').handlers.cancel({preventDefault(){prevented=true}});assert(prevented,'cannot dismiss modal while installing');
 rejectInstall(Error('권한 없음'));await pending;assert.match(nodes.get('dlg-err').textContent,/권한 없음/);prevented=false;nodes.get('dialog').handlers.cancel({preventDefault(){prevented=true}});assert(!prevented,'dialog unlocks on install failure');
 S.drafts={};S.sending=true;await installUpdate();assert.equal(installs,1,'pending send cannot trigger restart');S.sending=false;
 notify({status:'downloading',progress:37.6});assert.match(updateHTML(),/38%/);notify({status:'error',message:'<offline>'});assert.match(updateHTML(),/&lt;offline&gt;/);assert(!updateHTML().includes('<offline>'));
 await checkUpdate();assert.equal(S.update.status,'checking');notify({status:'up_to_date'});assert.match(updateHTML(),/최신 버전/);
 S.view='settings';await boot();assert.deepEqual(readyVersions,['0.3.5'],'only a successful renderer boot reports its version');
 stateOk=false;await boot();assert.deepEqual(readyVersions,['0.3.5'],'failed boot must not report ready');
 console.log('Update UI: status, stale state, protected restart and boot readiness passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
