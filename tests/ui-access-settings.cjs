'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},clearInterval(){},navigator:{},FormData:class {constructor(form){return Object.entries(form.values)} }};
c.globalThis=c;Object.assign(c.window,c);
const requests=[];c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url==='/api/settings')return {ok:true,json:async()=>({})};if(url==='/api/state')return {ok:true,json:async()=>c.NaruUI.S.data};throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,renderSettings}=c.NaruUI;S.data={settings:{workspace:'/work',report_directory:'/reports'},providers:[],skills:[],csrf_token:'token'};
(async()=>{
 renderSettings();let html=nodes.get('main').innerHTML;
 assert.match(html,/<option value="manual" selected>/,'default is manual');
 assert.match(html,/선택한 폴더 밖의 파일도 읽거나 변경/,'shell access is disclosed');
 assert.match(html,/이전 대화와 Git 변경 내용이 연결된 모델 제공자에게 전달/,'full access disclosure is shown');
 await nodes.get('settings-form').submit({preventDefault(){},target:{values:{workspace:'/work',report_directory:'/reports',max_steps:'12',max_output_tokens:'4096',access_mode:'full_access'}}});
 assert.equal(requests[0].body.access_mode,'full_access');
 assert.equal(requests[0].body.max_steps,12);
 S.data.settings.access_mode='auto_approve';renderSettings();html=nodes.get('main').innerHTML;
 assert.match(html,/<option value="auto_approve" selected>/,'saved setting is selected');
 console.log('Access settings default, disclosure and save passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
