'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},disabled:false,open:false,handlers:{},isConnected:true,classList:{add(){},remove(){},toggle(){}},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},showModal(){this.open=true},close(){this.open=false},focus(){}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const calls=[],response=x=>({ok:true,json:async()=>x});
c.fetch=async(url,opts)=>{calls.push({url,body:opts.body?JSON.parse(opts.body):null});if(url==='/api/sessions')return response({id:'new-session',access_mode:'inherit'});if(url==='/api/sessions/new-session')return response({session:{provider_id:'or'},runs:[],messages:[]});if(url.endsWith('/image-models'))return response({models:url.includes('/p/')?['__default__']:['example/image-model']});if(url.endsWith('/messages')||url.endsWith('/queue'))return response({run_id:'r'});if(url==='/api/state')return response(c.NaruUI.S.data);throw Error('unexpected '+url)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const {S,send,queueHTML,generatedImagesHTML,renderTools,openImagePicker,imageProviders,messageHTML,runHTML,renderDrawer}=c.NaruUI;
S.data={providers:[{id:'p',kind:'codex',name:'ChatGPT'},{id:'or',kind:'openai',name:'OpenRouter',base_url:'https://openrouter.ai/api/v1',has_key:true},{id:'bad',kind:'openai',name:'Other',base_url:'https://example.com/v1',has_key:true}],skills:[],sessions:[],active:{},csrf_token:'test'};S.accounts={codex:{available:true,authenticated:true}};S.sid='s1';S.providerId='p';S.model='m';S.mode='chat';S.view='models';S.detail={session:{provider_id:'p',model:'m',mode:'chat'},runs:[],messages:[],queue:[]};
const input=c.document.getElementById('input');
(async()=>{
 S.imageModes.s1={providerId:'or',model:'example/image-model'};S.files.s1=[{name:'reference.png',mime:'image/png',data:'AAAA',size:4}];input.value='';await send();assert.equal(calls.length,0);assert.match(nodes.get('toast').textContent,/설명/);
 input.value='수정해줘';await send();assert.equal(calls.length,0);assert.match(nodes.get('toast').textContent,/편집/);delete S.files.s1;
 S.imageModes.s1={providerId:'or',model:'example/image-model'};input.value='파도 그림';S.drafts.s1=input.value;renderTools();
 assert.match(nodes.get('tools').innerHTML,/이미지 만들기/);assert.match(nodes.get('tools').innerHTML,/aria-pressed="true"/);
 await send();assert.equal(calls[0].url,'/api/sessions/s1/messages');assert.equal(calls[0].body.create_image,true);assert.equal(calls[0].body.image_provider_id,'or');assert.equal(calls[0].body.image_model,'example/image-model');assert.equal(calls[0].body.provider_id,'p');assert.equal(S.imageModes.s1,undefined,'completed request resets image mode for the next prompt');
 calls.length=0;S.imageModes.s1={providerId:'or',model:'example/image-model'};S.detail.runs=[{id:'r',status:'running'}];input.value='다른 그림';S.drafts.s1=input.value;await send();
 assert.equal(calls[0].url,'/api/sessions/s1/queue');assert.equal(calls[0].body.create_image,true);assert.equal(calls[0].body.image_provider_id,'or');assert.equal(calls[0].body.image_model,'example/image-model');assert.match(queueHTML([{id:'q',content:'x',create_image:true}],false,true,''),/이미지 만들기/);
 assert.deepEqual([...imageProviders()].map(p=>p.id),['p','or']);
 openImagePicker();assert.match(nodes.get('dialog').innerHTML,/요금이 발생할 수/);assert.match(nodes.get('dialog').innerHTML,/이미지 생성 연결/);nodes.get('image-provider').value='or';await nodes.get('image-provider').handlers.change();assert.match(nodes.get('image-model').innerHTML,/example\/image-model/);nodes.get('image-model').value='example/image-model';await nodes.get('image-model-form').handlers.submit({preventDefault(){},currentTarget:node()});assert.equal(S.imageModes.s1.model,'example/image-model');assert.equal(S.imageModes.s1.providerId,'or');
 openImagePicker();nodes.get('image-provider').value='p';await nodes.get('image-provider').handlers.change();assert.match(nodes.get('image-model').innerHTML,/ChatGPT 기본 모델/);assert.equal(nodes.get('image-model').value,'__default__');await nodes.get('image-model-form').handlers.submit({preventDefault(){},currentTarget:node()});assert.equal(S.imageModes.s1.providerId,'p');assert.equal(S.imageModes.s1.model,'__default__');renderTools();assert.match(nodes.get('tools').innerHTML,/이미지 · ChatGPT/);
 assert.doesNotMatch(messageHTML({id:'m',role:'assistant',content:'이미지 완성',create_image:true},true),/다시 답하기/);
 S.detail={session:{provider_id:'p'},runs:[],messages:[],events:[],approvals:[],artifacts:[]};
 const stopped=runHTML({id:'r',status:'cancelled',create_image:true},true);assert.match(stopped,/요금이 발생할 수/);assert.match(stopped,/다시 요청/);assert.match(stopped,/새 호출/);
 S.detail.runs=[{id:'r',status:'cancelled',create_image:true,model:'__default__'}];S.data.settings={workspace:'/tmp'};renderDrawer();assert.match(nodes.get('drawer-in').innerHTML,/ChatGPT 기본 모델/);assert.doesNotMatch(nodes.get('drawer-in').innerHTML,/__default__/);
 // A disconnected ordinary chat model must not block the separately selected image provider.
 calls.length=0;S.accounts.codex.authenticated=false;S.providerId='p';S.model='';S.detail.runs=[];S.imageModes.s1={providerId:'or',model:'example/image-model'};input.value='새 이미지';S.drafts.s1=input.value;await send();assert.equal(calls[0].url,'/api/sessions/s1/messages');assert.equal(calls[0].body.image_provider_id,'or');
 // An ordinary API provider without a selected text model must not block image creation either.
 calls.length=0;S.providerId='bad';S.model='';S.imageModes.s1={providerId:'or',model:'example/image-model'};input.value='두번째 이미지';S.drafts.s1=input.value;await send();assert.equal(calls[0].body.provider_id,'bad');assert.equal(calls[0].body.image_provider_id,'or');
 // With no ordinary provider selected, a new conversation uses the chosen image provider.
 calls.length=0;S.sid=null;S.providerId='';S.model='';S.imageModes.new={providerId:'or',model:'example/image-model'};input.value='새 대화 이미지';S.drafts.new=input.value;await send();assert.equal(calls[0].url,'/api/sessions');assert.equal(calls[0].body.provider_id,'or');assert.equal(calls[1].body.image_provider_id,'or');
 const html=generatedImagesHTML({id:'r'},[{id:'img"/x',name:'<wave>.png',run_id:'r',image_generated:true},{id:'other',name:'x',run_id:'other',image_generated:true},{id:'normal',run_id:'r'}]);
 assert.match(html,/data-artifact="img&quot;\/x"/);assert.match(html,/&lt;wave&gt;.png/);assert.match(html,/download\?inline=1/);assert.match(html,/내려받기/);assert.doesNotMatch(html,/<wave>/);assert.doesNotMatch(html,/other|normal/);
 console.log('Image creation mode, queued requests, generated preview and download passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
