'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){},naruDesktop:{chooseDirectory:async()=>'/tmp/example'}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
const imported={id:'example',name:'Example',description:'',instructions:'Skill content',enabled:true,source_dir:'/tmp/example'};
let requests=[];c.fetch=async (url,opts={})=>{requests.push({url,opts});if(url==='/api/skills/discover')return {ok:true,json:async()=>({skills:[{name:'ego <browser>',description:'Browser & web',path:'/tmp/example',registered:false},{name:'existing',path:'/tmp/existing',registered:true}]})};if(url==='/api/skills/import')return {ok:true,json:async()=>imported};if(url==='/api/state')return {ok:true,json:async()=>({csrf_token:'csrf',providers:[],skills:[imported],settings:{workspace:'/tmp'}})};throw Error('Unexpected request');};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
const ui=c.NaruUI;ui.S.data={csrf_token:'csrf',providers:[],skills:[],settings:{workspace:'/tmp'}};
(async()=>{
 ui.importSkillFolder();const dialog=nodes.get('dialog');
 assert(dialog.open);assert.match(dialog.innerHTML,/SKILL.md가 들어 있는 폴더/);assert.match(dialog.innerHTML,/외부 도구는 별도로 설치/);assert.match(dialog.innerHTML,/도구 승인 설정/);
 c.document.getElementById('skill-folder-path').value='/tmp/example';await nodes.get('skill-folder-form').handlers.submit({preventDefault(){},target:node()});
 assert.equal(requests[0].url,'/api/skills/import');assert.equal(JSON.parse(requests[0].opts.body).path,'/tmp/example');assert.deepEqual([...ui.S.skillIds],['example']);assert.equal(dialog.open,false);
 ui.renderSkills();const html=nodes.get('main').innerHTML;assert.match(html,/스킬 폴더 연결/);assert.match(html,/폴더 연결됨/);assert.match(html,/에이전트 모드/);
 await ui.discoverSkills();let discovered=nodes.get('skill-discover-results').innerHTML;assert.match(discovered,/ego &lt;browser&gt;/);assert.match(discovered,/Browser &amp; web/);assert.match(discovered,/연결됨/);assert.match(discovered,/data-act="import-discovered-skill"/);
 const trigger={dataset:{path:'/tmp/example'},disabled:false};await ui.importDiscoveredSkill(trigger);assert.equal(requests.filter(r=>r.url==='/api/skills/import').length,2);assert.deepEqual([...ui.S.skillIds],['example']);
 console.log('Skill-folder consent, source path, selection and dependency disclosure passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
