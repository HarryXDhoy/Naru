'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const nodes=new Map();let picker;
function node(){return {value:'',innerHTML:'',textContent:'',style:{},open:false,classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},querySelector(){return null},showModal(){this.open=true},close(){this.open=false}};}
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement(tag){assert.equal(tag,'input');picker=node();picker.click=()=>{picker.clicked=true};return picker},addEventListener(){},documentElement:{dataset:{},classList:{add(){},toggle(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{},getComputedStyle:()=>({})};
c.globalThis=c;Object.assign(c.window,c);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),c);
c.NaruUI.S.data={skills:[]};
const text='---\nname: ego-browser\ndescription: "Use the browser"\n---\n\n# ego-browser\nUse its tools.';
const parsed=c.NaruUI.parseSkillFile(text,'SKILL.md');
assert.equal(parsed.name,'ego-browser');assert.equal(parsed.description,'Use the browser');assert.equal(parsed.instructions,text);
assert.equal(c.NaruUI.parseSkillFile('# No frontmatter','SKILL.md').name,'SKILL');
assert.equal(c.NaruUI.parseSkillFile('---\nname: motion\ndescription: >\n  Animation guidance\n  for web apps.\n---\n# Motion','SKILL.md').description,'Animation guidance for web apps.');
assert.throws(()=>c.NaruUI.parseSkillFile(' '.repeat(3),'SKILL.md'));
assert.throws(()=>c.NaruUI.parseSkillFile('x'.repeat(20001),'SKILL.md'));
(async()=>{c.NaruUI.importSkill();assert.equal(picker.clicked,true);picker.files=[{name:'SKILL.md',size:text.length,text:async()=>text}];await picker.handlers.change();const dialog=nodes.get('dialog').innerHTML;assert.match(dialog,/ego-browser/);assert.match(dialog,/도구와 참조 파일은 자동으로 추가되지 않아요/);assert.match(dialog,/Use its tools/);assert.equal(nodes.get('dialog').open,true);console.log('SKILL.md selection, parsing, preview, size limits and scope disclosure passed.');})().catch(e=>{console.error(e);process.exitCode=1});
