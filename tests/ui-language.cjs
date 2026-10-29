const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=new Map(),nodes=new Map();
const node=()=>({addEventListener(){},classList:{add(){},remove(){},toggle(){}},dataset:{},style:{},innerHTML:'',textContent:'',setAttribute(){},elements:[]});
const c={console,URL,JSON,Date,Intl,Number,String,Map,Set,Math,TextDecoder,Error,Promise,Array,Object,RegExp,Uint16Array,Blob:class{},__NARU_TEST__:true,innerWidth:1200,innerHeight:900,
 document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},addEventListener(){},documentElement:{dataset:{},classList:{add(){}}},querySelector(){return null},querySelectorAll(){return []}},
 window:{addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout,clearTimeout,setInterval(){},clearInterval(){},navigator:{language:'ko-KR'},getComputedStyle:()=>({})};
c.globalThis=c;c.window=Object.assign(c.window,c);
vm.runInNewContext(fs.readFileSync('public/i18n.js','utf8'),c);vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),c);
const ui=c.NaruUI,t=c.window.NaruI18n;
ui.S.data={settings:{workspace:'/tmp',report_directory:'/tmp',system_prompt:'네가 쓴 한국어 지침'},providers:[],sessions:[{id:'s',title:'내 대화 제목'}],active:{},skills:[],memories:[],workflows:[]};ui.S.view='settings';
ui.S.drafts.s='내 초안';ui.S.files.s=[{name:'한국어.md',text:'파일 내용'}];
ui.setLanguage('en');assert.equal(c.document.documentElement.lang,'en');assert.equal(storage.get('naru.language'),'en');
const html=nodes.get('main').innerHTML;
for(const label of ['Settings','Language','Appearance','Notifications','Workspace','Tool permissions','Save'])assert(html.includes(label),label);
assert(html.includes('네가 쓴 한국어 지침'),'user instructions stay intact');assert(nodes.get('side').innerHTML.includes('내 대화 제목'));
assert.equal(ui.S.drafts.s,'내 초안');assert.equal(ui.S.files.s[0].text,'파일 내용');
const message=ui.messageHTML({id:'m',role:'assistant',content:'설정 **저장**'},false);assert(message.includes('설정 <strong>저장</strong>'),'model content is not translated');assert(message.includes('Copy'));
assert.equal(t.t`설정 ${'설정'} 저장`,'Settings 설정 Save','only static template parts are translated');
assert.equal(ui.splitAttachments('hello\n\n다음은 사용자가 첨부한 참고 자료입니다.\n\n--- 첨부: 한국어.md ---\nx\n--- 첨부 끝 ---').files[0],'한국어.md');
ui.setLanguage('ko');assert(nodes.get('main').innerHTML.includes('설정'));assert.equal(storage.get('naru.language'),'ko');
assert(ui.renderTools()===undefined);ui.setLanguage('en');assert(ui.messageHTML({id:'u',role:'user',content:'저장'},false).includes('>저장<'));
console.log('Language switching, persistence, settings and user-content isolation passed.');
