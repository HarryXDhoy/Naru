'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},hidden:false,handlers:{},disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null}};}
class FileReader{readAsDataURL(file){Promise.resolve().then(()=>{this.result=`data:${file.type};base64,${file.data}`;this.onload();});}}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},FileReader,__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const requests=[];const response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{requests.push({url,body:opts.body?JSON.parse(opts.body):null});if(url.endsWith('/queue'))return response({queued:{id:'q'}});if(url==='/api/sessions/s1')return response({session:{provider_id:'p',model:'model',mode:'agent'},runs:[{id:'r1',status:'running'}],messages:[],queue:[]});if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,send,addFiles,wireComposer,messageHTML,imageSource,queueHTML}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'}],skills:[],sessions:[],active:{s1:'running'},csrf_token:'test'};
S.accounts={codex:{available:true,authenticated:true}};S.sid='s1';S.providerId='p';S.model='model';S.mode='agent';S.view='models';
S.detail={session:{provider_id:'p',model:'model',mode:'agent'},runs:[{id:'r1',status:'running'}],messages:[],queue:[]};
const img={name:'screenshot.png',type:'image/png',size:3,data:'YWJj'};
(async()=>{
 wireComposer();assert.equal(typeof nodes.get('input').handlers.paste,'function');
 await addFiles([img]);assert.equal(S.files.s1[0].data,'YWJj');assert.match(nodes.get('file-chips').innerHTML,/data:image\/png;base64,YWJj/);
 nodes.get('input').value='';S.drafts.s1='';await send();assert.deepEqual(requests[0].body.images,[{name:'screenshot.png',mime:'image/png',data:'YWJj'}]);assert.equal(requests[0].body.content,'');assert.equal(requests[0].url,'/api/sessions/s1/queue');
 const h=messageHTML({id:'m',role:'user',content:'질문',images:[{name:'<bad>',mime:'image/png',data:'YWJj'}]},false);assert.match(h,/data:image\/png;base64,YWJj/);assert.match(h,/&lt;bad&gt;/);
 assert.equal(imageSource({mime:'image/svg+xml',data:'YWJj'}),'');assert.equal(imageSource({mime:'image/png',data:'YWJj" onerror="x'}),'');
 assert.match(queueHTML([{id:'q',content:'',images:[{name:'image',mime:'image/png',data:'YWJj'}]}],false,true,''),/data:image\/png;base64,YWJj/);
 const reading=addFiles([{...img,name:'one.png'},{...img,name:'two.png'}]);S.sid='s2';S.files.s2=[{name:'keep.txt',text:'keep'}];await reading;assert.equal(S.files.s1.length,2);assert.equal(S.files.s2[0].name,'keep.txt');
 S.sid='s2';nodes.get('input').handlers.paste({clipboardData:{files:[img]}});await new Promise(r=>setImmediate(r));assert.equal(S.files.s2[1].mime,'image/png');
 const before=S.files.s2;await addFiles([{...img,size:5*1024*1024}]);assert.equal(S.files.s2,before);assert.match(nodes.get('toast').textContent,/4 MB/);
 console.log('Image attach, paste, queue, safe preview and session draft preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
