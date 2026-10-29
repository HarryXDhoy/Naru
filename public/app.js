/* Naru desktop client. The local server owns every durable record; this file renders and asks. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const enc=encodeURIComponent;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const ACTIVE=['running','awaiting_approval'];
const ACCOUNT_KINDS=['codex','claude_code','gemini_cli','copilot_cli'];
const ACCOUNT_NAMES={codex:'ChatGPT',claude_code:'Claude',gemini_cli:'Gemini',copilot_cli:'GitHub Copilot',openrouter:'OpenRouter'};
const KIND_LABEL={codex:'ChatGPT 계정',claude_code:'Claude 계정',gemini_cli:'Google 계정',copilot_cli:'GitHub 계정',responses:'OpenAI Responses',openai:'OpenAI 호환',anthropic:'Anthropic API',gemini:'Gemini API',ollama:'Ollama'};
const STATUS={running:'실행 중',awaiting_approval:'승인 대기',completed:'완료',failed:'실패',cancelled:'중지됨',interrupted:'중단됨'};
const ATTACH_HEAD='\n\n다음은 사용자가 첨부한 참고 자료입니다.\n';
const TEXT_EXT=/\.(txt|md|markdown|csv|tsv|json|jsonl|py|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|ya?ml|xml|log|sh|zsh|sql|toml|ini|cfg|env\.example|swift|kt|go|rs|java|c|h|cc|cpp|hpp|rb|php|lua|r|tex)$/i;

const I={
 compose:'<path d="M12 20h8"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 sidebar:'<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><path d="M9.5 4.5v15"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 files:'<path d="M7.5 3.5H14l5 5v10.5a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2v-13.5a2 2 0 0 1 2-2Z"/><path d="M14 3.5v5h5"/>',
 more:'<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
 plug:'<path d="M9 3.5v4.5M15 3.5v4.5M6.5 8h11v3.2a5.5 5.5 0 0 1-11 0Z"/><path d="M12 16.8v3.7"/>',
 skill:'<path d="M12 3.5 13.9 9l5.6 2-5.6 2L12 18.5 10.1 13 4.5 11l5.6-2Z"/>',
 memory:'<path d="M7 3.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V4.5a1 1 0 0 1 1-1Z"/>',
 settings:'<circle cx="12" cy="12" r="2.8"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
 clip:'<path d="m20.5 11.5-8.3 8.3a5 5 0 0 1-7.1-7.1l8.7-8.7a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
 up:'<path d="M12 19V5.5M6 11.5l6-6 6 6"/>',
 stop:'<rect x="7" y="7" width="10" height="10" rx="2.6" fill="currentColor" stroke="none"/>',
 caret:'<path d="m7.5 10 4.5 4.5 4.5-4.5"/>',
 chevron:'<path d="m9.5 6 6 6-6 6"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
 retry:'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
 trash:'<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M9.5 7V4.5h5V7"/>',
 edit:'<path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7Z"/><path d="m13.5 6.7 3.8 3.8"/>',
 download:'<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
 external:'<path d="M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
 folder:'<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
 terminal:'<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="m7.5 10 3 2.5-3 2.5M13 15h3.5"/>',
 globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 3 2.8 14 0 17M12 3.5c-2.8 3-2.8 14 0 17"/>',
 doc:'<path d="M7.5 3.5H14l5 5v10.5a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2v-13.5a2 2 0 0 1 2-2Z"/><path d="M14 3.5v5h5M9 13h6M9 16.5h4"/>',
 pen:'<path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7Z"/>',
 eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/>',
 bolt:'<path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12Z"/>',
 image:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.8"/>',
 code:'<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5"/>',
 sun:'<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"/>',
 moon:'<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
 key:'<circle cx="8.5" cy="15.5" r="4"/><path d="m11.5 12.5 8-8M16.5 7.5l2.5 2.5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
};
const icon=(n,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||I.bolt}</svg>`;
const iconBtn=(n,label,act,id,extra='')=>`<button type="button" class="icon-btn" data-act="${act}"${id!==undefined?` data-id="${esc(id)}"`:''} title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(n)}</button>`;
const WORDMARK='<svg class="wordmark" viewBox="0 10.4 75.6 20.4" fill="none" stroke="currentColor" stroke-width="5.2" role="img" aria-label="naru"><path d="M2.6 30V12.2M2.6 21.4a7.2 7.2 0 0 1 14.4 0V30"/><circle cx="30.4" cy="21.1" r="6.3"/><path d="M36.7 12.2V30"/><path d="M45.2 30V12.2M45.2 21.4a7 7 0 0 1 7-7"/><path d="M58.4 12.2v8.4a7.2 7.2 0 0 0 14.4 0V12.2M72.8 12.2V30"/></svg>';
// HeroHorizon — the design system's one live piece: a planet rim with a travelling glint.
const HERO_VERT='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const HERO_FRAG='#version 300 es\nprecision highp float;out vec4 o;uniform vec2 res;uniform float time;uniform vec2 mouse;uniform float lift;uniform vec3 cNavy,cDeep,cAccent,cBright,cGround,cHalo;float h21(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}uniform float zoom;void main(){vec2 p=(gl_FragCoord.xy-.5*res)/res.y*zoom;vec2 c=vec2(mouse.x*.05,-2.12+lift+mouse.y*.03);float R=2.45;float d=length(p-c)-R;float ang=atan(p.x-c.x,p.y-c.y);float s=clamp(d/.95,0.,1.);vec3 sky=mix(cAccent,cDeep,smoothstep(0.,.55,s));sky=mix(sky,cNavy,smoothstep(.45,1.,s));sky+=cHalo*.35*exp(-max(d,0.)*5.)*(1.-abs(p.x)*.6);float q=clamp(-d,0.,2.);vec3 ground=mix(cAccent,cBright,smoothstep(.06,.5,q));ground=mix(ground,cGround,smoothstep(.38,.95,q));ground+=cHalo*.25*exp(-q*14.);vec3 col=d>0.?sky:ground;float rim=exp(-abs(d)*260.)*1.1+exp(-abs(d)*38.)*.45;col+=vec3(.86,.93,1.)*rim*(.55+.45*cos(ang*1.2));float a0=.55+.18*sin(time*.23)+mouse.x*.12;float g=exp(-pow((ang-a0)*7.,2.))*exp(-abs(d)*90.);col+=vec3(1.)*g*1.6;col+=vec3(1.)*exp(-pow((ang-a0)*2.2,2.))*exp(-abs(d)*14.)*.18;vec2 sp=floor(p*90.);float st=step(.995,h21(sp))*smoothstep(.4,1.,s)*(.5+.5*sin(time*1.5+h21(sp+3.)*6.28));col+=st*.5;col+=(h21(gl_FragCoord.xy+time)-.5)/255.;o=vec4(col,1.);}';

let hero=null;
function heroColor(name){const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();const m=v.match(/^#([0-9a-f]{6})/i);if(!m)return [1,1,1];const n=parseInt(m[1],16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function stopHero(){if(!hero)return;cancelAnimationFrame(hero.raf);hero.io?.disconnect();hero.ro?.disconnect();hero.mq?.removeEventListener?.('change',hero.recolor);try{hero.gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}hero=null;}
function startHero(box){
 if(hero&&hero.canvas.isConnected&&box.contains(hero.canvas))return;
 stopHero();
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
 let gl=null;try{gl=canvas.getContext('webgl2',{antialias:false,premultipliedAlpha:false,powerPreference:'low-power'});}catch{}
 if(!gl)return;
 const sh=(type,src)=>{const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);return gl.getShaderParameter(o,gl.COMPILE_STATUS)?o:null;};
 const vs=sh(gl.VERTEX_SHADER,HERO_VERT),fs=sh(gl.FRAGMENT_SHADER,HERO_FRAG);if(!vs||!fs)return;
 const prog=gl.createProgram();gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return;
 gl.useProgram(prog);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const U=n=>gl.getUniformLocation(prog,n);
 box.appendChild(canvas);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const h={canvas,gl,raf:0,visible:true,mouse:[0,0],target:[0,0],t0:performance.now()};hero=h;
 h.recolor=()=>{gl.uniform3fv(U('cNavy'),heroColor('--blue-10'));gl.uniform3fv(U('cDeep'),heroColor('--blue-8'));gl.uniform3fv(U('cAccent'),heroColor('--blue-5'));gl.uniform3fv(U('cBright'),heroColor('--blue-2'));gl.uniform3fv(U('cGround'),heroColor('--bg-1'));gl.uniform3fv(U('cHalo'),heroColor('--brand-3'));draw(performance.now());};
 const size=()=>{const dpr=Math.min(2,devicePixelRatio||1),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),ht=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==ht){canvas.width=w;canvas.height=ht;gl.viewport(0,0,w,ht);}gl.uniform2f(U('res'),w,ht);gl.uniform1f(U('lift'),-.2);gl.uniform1f(U('zoom'),1.5);};
 function draw(now){if(hero!==h)return;size();h.mouse[0]+=(h.target[0]-h.mouse[0])*.06;h.mouse[1]+=(h.target[1]-h.mouse[1])*.06;gl.uniform1f(U('time'),reduce.matches?8:(now-h.t0)/1000);gl.uniform2f(U('mouse'),h.mouse[0],h.mouse[1]);gl.drawArrays(gl.TRIANGLES,0,3);}
 const loop=now=>{if(hero!==h)return;draw(now);if(h.visible&&!reduce.matches&&document.visibilityState!=='hidden')h.raf=requestAnimationFrame(loop);else h.raf=0;};
 h.kick=()=>{if(!h.raf&&hero===h)h.raf=requestAnimationFrame(loop);};
 box.addEventListener('pointermove',ev=>{const r=box.getBoundingClientRect();h.target=[(ev.clientX-r.left)/r.width*2-1,-((ev.clientY-r.top)/r.height*2-1)];h.kick();});
 if('IntersectionObserver' in window){h.io=new IntersectionObserver(es=>{h.visible=es[0].isIntersecting;h.kick();});h.io.observe(canvas);}
 if('ResizeObserver' in window){h.ro=new ResizeObserver(()=>{if(!h.raf)draw(performance.now());});h.ro.observe(canvas);}
 h.mq=matchMedia('(prefers-color-scheme: dark)');h.mq.addEventListener?.('change',h.recolor);
 box.classList.add('live');h.recolor();h.kick();
}
const pref={get(k,d){try{const v=localStorage.getItem('naru.'+k);return v===null?d:v;}catch{return d;}},set(k,v){try{v==null?localStorage.removeItem('naru.'+k):localStorage.setItem('naru.'+k,String(v));}catch{}}};
const S={data:null,accounts:null,view:'chat',sid:null,detail:null,live:'',providerId:'',model:'',mode:'chat',skillIds:[],drafts:{},files:{},sending:false,drawer:pref.get('drawer','0')==='1',sideHidden:pref.get('side','1')==='0',open:new Set(),steps:new Set(),models:{},modelFetch:{},epoch:0,codes:[],msgs:new Map(),tests:{},watch:null,blobs:[]};

// ---------- utilities ----------
let toastTimer;
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.toggle('bad',bad);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),bad?6500:3200);}
async function api(path,{method='GET',body}={}){
 const headers={Accept:'application/json'};
 if(method!=='GET'){headers['Content-Type']='application/json';headers['X-Naru-Token']=S.data?.csrf_token||'';}
 let res;try{res=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});}catch{throw new Error('Naru 로컬 서버에 연결할 수 없어요. 앱을 다시 열어 주세요.');}
 let data;try{data=await res.json();}catch{throw new Error(`서버 응답을 읽지 못했어요 (${res.status}).`);}
 if(!res.ok)throw new Error(data.error||`요청이 실패했어요 (${res.status}).`);
 return data;
}
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':(n||0)+' B';
const base=p=>String(p||'').split(/[\\/]/).filter(Boolean).pop()||String(p||'');
const host=u=>{try{return new URL(u).host;}catch{return u||'';}};
function duration(run){if(!run?.finished_at||!run.started_at)return '';const s=Math.max(0,Math.round((new Date(run.finished_at)-new Date(run.started_at))/1000));return s<60?`${s}초`:`${Math.floor(s/60)}분 ${s%60}초`;}
async function copyText(text,msg='복사했어요'){try{await navigator.clipboard.writeText(text);toast(msg);}catch{toast('클립보드에 접근할 수 없어요.',true);}}
async function openExternal(url){if(window.naruDesktop?.openExternal)await window.naruDesktop.openExternal(url);else window.open(url,'_blank','noopener');}
const providers=()=>S.data?.providers||[];
const providerById=id=>providers().find(p=>String(p.id)===String(id));
const provider=()=>providerById(S.providerId);
const isAccount=p=>!!p&&(ACCOUNT_KINDS.includes(p.kind)||p.account==='openrouter');
function accountOf(p){const a=S.accounts||S.data?.accounts;if(!a||!p)return null;return p.account==='openrouter'?a.openrouter:(a[p.kind]||null);}
function modelLabel(){const p=provider();if(!p)return '모델 선택';const m=S.model||p.model;if(!m)return p.name;return isAccount(p)&&p.account!=='openrouter'?`${p.name} ${m}`:m;}
const latestRun=()=>{const r=S.detail?.runs;return r&&r.length?r[r.length-1]:null;};
const runActive=()=>ACTIVE.includes(latestRun()?.status);
const draftKey=()=>S.sid||'new';
const attachments=()=>S.files[draftKey()]||[];
const enabledSkills=()=>(S.data?.skills||[]).filter(s=>s.enabled);
const selectedSkills=()=>enabledSkills().filter(s=>S.skillIds.includes(String(s.id)));
function remember(id){pref.set('session',id||null);}
function splitAttachments(content){const at=String(content).indexOf(ATTACH_HEAD);if(at<0)return {text:String(content),files:[]};const files=[...String(content).slice(at).matchAll(/--- 첨부: (.+?) ---/g)].map(m=>m[1]);return {text:String(content).slice(0,at),files};}

// ---------- markdown ----------
function inline(text){
 let s=esc(text);const codes=[];
 s=s.replace(/`([^`\n]+)`/g,(_,c)=>{codes.push(c);return `\u0000${codes.length-1}\u0000`;});
 s=s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,label,u)=>{const url=safeUrl(u.replace(/&amp;/g,'&'));return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label;});
 s=s.replace(/(^|[\s(])(https?:\/\/[^\s<)"]+[^\s<)".,;:!?])/g,(m,pre,u)=>{const url=safeUrl(u.replace(/&amp;/g,'&'));return url?`${pre}<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${u}</a>`:m;});
 s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g,'$1<em>$2</em>').replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
 return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>`<code>${codes[+i]}</code>`);
}
function markdown(src){
 const lines=String(src||'').replace(/\r\n?/g,'\n').split('\n');
 let html='',para=[],list=null,i=0;
 const flush=()=>{if(para.length){html+='<p>'+para.map(inline).join('<br>')+'</p>';para=[];}};
 const close=()=>{if(list){html+=`</${list}>`;list=null;}};
 const row=l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
 while(i<lines.length){
  const line=lines[i];
  const fence=line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
  if(fence){flush();close();const body=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i])){body.push(lines[i]);i++;}i++;const code=body.join('\n');S.codes.push(code);html+=`<div class="code"><div class="code-head"><span>${esc(fence[1]||'')}</span><button type="button" class="icon-btn" data-act="copy-code" data-id="${S.codes.length-1}" title="복사" aria-label="코드 복사">${icon('copy')}</button></div><pre><code>${esc(code)}</code></pre></div>`;continue;}
  if(/^\s*\|.*\|\s*$/.test(line)&&i+1<lines.length&&/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i+1])){
   flush();close();const head=row(line);i+=2;const rows=[];
   while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){rows.push(row(lines[i]));i++;}
   html+=`<div class="table"><table><thead><tr>${head.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;continue;
  }
  const h=line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if(h){flush();close();const lv=Math.min(3,h[1].length);html+=`<h${lv}>${inline(h[2])}</h${lv}>`;i++;continue;}
  const ul=line.match(/^\s*[-*+]\s+(.*)$/),ol=line.match(/^\s*(\d+)[.)]\s+(.*)$/);
  if(ul||ol){
   flush();const type=ul?'ul':'ol';
   if(list!==type){close();html+=type==='ol'&&ol[1]!=='1'?`<ol start="${+ol[1]}">`:`<${type}>`;list=type;}
   const item=ul?ul[1]:ol[2];const task=item.match(/^\[([ xX])\]\s+(.*)$/);
   html+=`<li>${task?(task[1]===' '?'☐ ':'☑ ')+inline(task[2]):inline(item)}</li>`;i++;continue;
  }
  if(/^\s*>\s?/.test(line)){flush();close();const q=[];while(i<lines.length&&/^\s*>\s?/.test(lines[i])){q.push(lines[i].replace(/^\s*>\s?/,''));i++;}html+=`<blockquote>${q.map(inline).join('<br>')}</blockquote>`;continue;}
  if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){flush();close();html+='<hr>';i++;continue;}
  if(!line.trim()){flush();close();i++;continue;}
  if(list&&/^\s{2,}\S/.test(line)){html=html.replace(/<\/li>$/,'<br>'+inline(line.trim())+'</li>');i++;continue;}
  close();para.push(line);i++;
 }
 flush();close();return html;
}
function lineDiff(a,b){
 const A=String(a).split('\n'),B=String(b).split('\n'),n=A.length,m=B.length;
 if(n*m>90000)return [...A.map(t=>({k:'del',t})),...B.map(t=>({k:'add',t}))];
 const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const out=[];let i=0,j=0;
 while(i<n&&j<m){if(A[i]===B[j]){out.push({k:'same',t:A[i]});i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])out.push({k:'del',t:A[i++]});else out.push({k:'add',t:B[j++]});}
 while(i<n)out.push({k:'del',t:A[i++]});while(j<m)out.push({k:'add',t:B[j++]});
 return out;
}
const diffHTML=(a,b)=>`<div class="diff">${lineDiff(a,b).map(l=>`<div class="${l.k}">${esc(l.t)||' '}</div>`).join('')}</div>`;

// ---------- theme & shell ----------
function applyTheme(){const t=pref.get('theme','system');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme;try{window.naruDesktop?.setTheme?.(t)?.catch?.(()=>{});}catch{}if(hero)hero.recolor();}
function setSide(hidden){S.sideHidden=hidden;pref.set('side',hidden?'0':'1');$('app').classList.toggle('no-side',hidden);renderTop();}
function closeSide(){$('app').classList.remove('side-open');}
function go(view){S.view=view;closePop();closeSide();renderAll();$('main').focus({preventScroll:true});}
function renderAll(){renderSide();renderTop();renderMain();}

function renderSide(){
 const d=S.data;if(!d)return;const active=d.active||{};
 const nav=[['models','plug','모델'],['skills','skill','스킬'],['memory','memory','메모리'],['settings','settings','설정']];
 $('side').innerHTML=`<div class="side-top">${WORDMARK}<span class="grow"></span>${iconBtn('sidebar','사이드바 숨기기 (⌘\\)','toggle-side')}</div>
 <button type="button" class="side-item strong" data-act="new" title="새 대화 (⌘N)">${icon('compose')}<span>새 대화</span></button>
 <button type="button" class="side-item" data-act="palette" title="검색 (⌘K)">${icon('search')}<span>검색</span></button>
 <nav class="sessions" aria-label="최근 대화">${d.sessions.map(s=>{const st=active[s.id];return `<button type="button" class="side-item" data-session="${esc(s.id)}" title="${esc(s.title)}"${S.view==='chat'&&S.sid===s.id?' aria-current="page"':''}><span>${esc(s.title||'새 대화')}</span>${st?`<i class="dot ${st==='awaiting_approval'?'att':''}" role="img" aria-label="${st==='awaiting_approval'?'확인 필요':'실행 중'}"></i>`:''}</button>`;}).join('')}</nav>
 <nav class="side-nav" aria-label="관리">${nav.map(([v,ic,t])=>`<button type="button" class="side-item" data-view="${v}"${S.view===v?' aria-current="page"':''}>${icon(ic)}<span>${t}</span></button>`).join('')}</nav>`;
}
function renderTop(){
 const t=$('top');if(!t)return;
 let html=`<button type="button" class="icon-btn menu-btn" data-act="open-side" aria-label="메뉴 열기">${icon('menu')}</button>`;
 if(S.sideHidden)html+=iconBtn('sidebar','사이드바 보기 (⌘\\)','toggle-side');
 const s=S.view==='chat'?S.detail?.session:null;
 html+=s?`<button type="button" class="top-title" id="top-title" data-act="rename" title="이름 바꾸기">${esc(s.title)}</button>`:'<span class="top-title"></span>';
 const lr=s?latestRun():null;
 if(lr&&ACTIVE.includes(lr.status))html+=lr.status==='awaiting_approval'?'<span class="badge attention">확인 필요</span>':'<span class="badge running"><i></i>실행 중</span>';
 html+='<span class="grow"></span>';
 if(s){const n=S.detail.artifacts?.length||0;html+=`<button type="button" class="icon-btn ${S.drawer?'on':''}" data-act="drawer" title="파일과 실행 정보 (⌘J)" aria-label="파일과 실행 정보" aria-pressed="${S.drawer}">${icon('files')}${n?`<span class="count">${n}</span>`:''}</button>${iconBtn('more','대화 메뉴','chat-menu')}`;}
 t.innerHTML=html;
}
function renderMain(){if(S.view!=='chat')stopHero();if(S.view==='chat')renderChat();else if(S.view==='models')renderModels();else if(S.view==='skills')renderSkills();else if(S.view==='memory')renderMemory();else renderSettings();}

// ---------- chat ----------
function renderChat(){
 stopHero();
 $('main').innerHTML=`<div class="chat" id="chat"><div class="hero" id="hero" hidden><h1 class="hero-title">무엇을 할까요?</h1></div><div class="thread" id="thread"><div class="col" id="col"></div></div><div class="dock"><form class="composer" id="composer" autocomplete="off"><div class="files-row" id="file-chips" hidden></div><label class="sr" for="input">메시지</label><textarea id="input" rows="1" placeholder="메시지 입력" spellcheck="false"></textarea><div class="tools" id="tools"></div><input type="file" id="file-input" multiple hidden></form></div></div><aside class="drawer ${S.drawer&&S.detail?'open':''}" id="drawer" aria-label="파일과 실행 정보"><div class="drawer-in" id="drawer-in"></div></aside>`;
 const input=$('input');input.value=S.drafts[draftKey()]||'';autosize();
 wireComposer();renderTools();renderChips();renderThread(true);renderDrawer();
}
function autosize(){const el=$('input');if(!el)return;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,240)+'px';}
const canSend=()=>!S.sending&&!!(($('input')?.value||'').trim()||attachments().length);
function syncSend(){const b=$('send');if(b)b.disabled=!canSend();}
function wireComposer(){
 const input=$('input'),form=$('composer');
 input.addEventListener('input',()=>{S.drafts[draftKey()]=input.value;autosize();syncSend();});
 input.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing&&ev.keyCode!==229){ev.preventDefault();if(!runActive())send();}});
 form.addEventListener('submit',ev=>{ev.preventDefault();send();});
 $('file-input').addEventListener('change',ev=>{addFiles([...ev.target.files]);ev.target.value='';});
 form.addEventListener('dragover',ev=>{if([...ev.dataTransfer.types].includes('Files')){ev.preventDefault();form.classList.add('drag');}});
 form.addEventListener('dragleave',()=>form.classList.remove('drag'));
 form.addEventListener('drop',ev=>{ev.preventDefault();form.classList.remove('drag');addFiles([...ev.dataTransfer.files]);});
}
function renderTools(){
 const el=$('tools');if(!el)return;const active=runActive(),sk=selectedSkills();
 el.innerHTML=`${iconBtn('clip','파일 첨부','attach')}
 <button type="button" class="chip" id="model-chip" data-act="model-menu" aria-haspopup="menu" title="모델 바꾸기"${active?' disabled':''}><span>${esc(modelLabel())}</span>${icon('caret','caret')}</button>
 <div class="seg" role="group" aria-label="작업 방식"><button type="button" data-act="mode" data-mode="chat" aria-pressed="${S.mode==='chat'}"${active?' disabled':''} title="파일이나 명령을 건드리지 않아요">대화</button><button type="button" data-act="mode" data-mode="agent" aria-pressed="${S.mode==='agent'}"${active?' disabled':''} title="파일을 읽고 바꿀 수 있어요. 바꾸기 전에 먼저 물어봐요">에이전트</button></div>
 <button type="button" class="chip ${sk.length?'on':''}" id="skill-chip" data-act="skills-menu" aria-haspopup="menu" title="스킬" aria-label="스킬">${icon('skill')}${sk.length?`<span>${sk.length===1?esc(sk[0].name):sk.length+'개'}</span>`:''}</button>
 <span class="grow"></span>
 ${active?`<button type="button" class="send stop" data-act="stop" title="중지 (⌘.)" aria-label="중지">${icon('stop')}</button>`:`<button type="submit" class="send" id="send" aria-label="보내기"${canSend()?'':' disabled'}>${icon('up')}</button>`}`;
}
function renderChips(){
 const el=$('file-chips');if(!el)return;const files=attachments();el.hidden=!files.length;
 el.innerHTML=files.map((f,i)=>`<span class="file-chip" title="${esc(f.name)}">${icon('doc')}<span>${esc(f.name)}</span><button type="button" data-act="remove-file" data-id="${i}" aria-label="${esc(f.name)} 빼기">${icon('x')}</button></span>`).join('');
 syncSend();
}
async function addFiles(list){
 const key=draftKey(),current=[...(S.files[key]||[])];
 try{
  if(current.length+list.length>5)throw new Error('파일은 한 번에 5개까지 첨부할 수 있어요.');
  for(const file of list){
   if(!TEXT_EXT.test(file.name))throw new Error(`${file.name}: 텍스트 파일만 첨부할 수 있어요.`);
   if(file.size>600*1024)throw new Error(`${file.name}: 600 KB 이하 파일만 첨부할 수 있어요.`);
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error(`${file.name}: UTF-8 텍스트가 아니에요.`);}
   if(text.includes('\u0000'))throw new Error(`${file.name}: 텍스트 파일이 아니에요.`);
   current.push({name:file.name,size:file.size,text});
  }
  if(current.reduce((n,f)=>n+f.text.length,0)>90000)throw new Error('첨부 내용은 합쳐서 90,000자 이하여야 해요.');
  S.files[key]=current;renderChips();
 }catch(err){toast(err.message,true);}
}

function renderThread(toBottom=false){
 const col=$('col'),chat=$('chat'),scroll=$('thread');if(!col)return;
 const d=S.detail,empty=!d||(!d.messages.length&&!d.runs.length);
 const blank=!S.sid&&empty;setEmpty(blank);
 if(!d||empty){col.innerHTML='';return;}
 const near=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<140;
 S.codes=[];S.msgs.clear();
 const items=[...d.messages.map(m=>({t:m.created_at,k:0,v:m})),...d.runs.map(r=>({t:r.started_at,k:1,v:r}))].sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:a.k-b.k);
 const lastAssistant=[...d.messages].reverse().find(m=>m.role==='assistant');
 const lastMsg=d.messages[d.messages.length-1];const latest=latestRun();
 col.innerHTML=items.map(it=>it.k===0?messageHTML(it.v,it.v===lastAssistant&&it.v===lastMsg&&!runActive()):runHTML(it.v,it.v===latest)).join('');
 if(toBottom||near)scroll.scrollTop=scroll.scrollHeight;
}
function setEmpty(on){
 const chat=$('chat'),h=$('hero');if(!chat||!h)return;
 chat.classList.toggle('empty',on);h.hidden=!on;
 if(on)startHero(h);else if(hero&&h.contains(hero.canvas)){stopHero();h.querySelector('canvas')?.remove();h.classList.remove('live');}
}
function messageHTML(m,isLast){
 S.msgs.set(String(m.id),m.content);
 if(m.role==='user'){const {text,files}=splitAttachments(m.content);return `<div class="u"><div class="bubble">${esc(text.trim())}${files.length?`<span class="att">${files.map(esc).join(', ')}</span>`:''}</div></div>`;}
 return `<article class="a ${isLast?'last':''}"><div class="md">${markdown(m.content)}</div><div class="acts">${iconBtn('copy','복사','copy-msg',m.id)}${isLast?iconBtn('retry','다시 답하기','regenerate',m.id):''}${iconBtn('memory','메모리로 저장','save-memory',m.id)}${iconBtn('skill','스킬로 저장','save-skill',m.id)}</div></article>`;
}
function buildSteps(events){
 const out=[],calls=new Map();
 for(const ev of events){
  const d=ev.data||{};
  if(ev.type==='note'&&d.text)out.push({type:'note',text:d.text});
  else if(ev.type==='tool_call'){const id=String(d.call_id||d.id||ev.id);const st={type:'tool',id,name:d.name||d.tool||'tool',args:d.arguments||{},result:null,done:false};calls.set(id,st);out.push(st);}
  else if(ev.type==='tool_result'){const id=String(d.call_id||d.id||'');const result=d.result!==undefined?d.result:{output:d.output,status:d.status,exit_code:d.exit_code};const st=calls.get(id);if(st){st.result=result;st.done=true;}else out.push({type:'tool',id:id||ev.id,name:d.name||d.tool||'tool',args:d.arguments||{},result,done:true});}
 }
 return out;
}
function stepLabel(name,a,r){
 a=a||{};
 switch(name){
  case 'todo':return {icon:'check',what:'작업 목록',target:'',note:Array.isArray(r?.items)?`${r.items.filter(i=>i.status==='completed').length}/${r.items.length} 완료`:''};
  case 'search_sessions':return {icon:'search',what:'이전 대화 검색',target:a.query||'',note:Array.isArray(r?.matches)?`${r.matches.length}개`:''};
  case 'list_files':return {icon:'folder',what:'폴더 보기',target:a.path&&a.path!=='.'?a.path:'작업 폴더',note:r?.files?`${r.files.length}개`:''};
  case 'read_file':return {icon:'eye',what:'읽기',target:base(a.path)};
  case 'search_files':return {icon:'search',what:'검색',target:a.query||'',note:Array.isArray(r?.matches)?`${r.matches.length}곳`:''};
  case 'write_file':return {icon:'doc',what:a.overwrite?'덮어쓰기':'만들기',target:base(a.path)};
  case 'edit_file':return {icon:'pen',what:'수정',target:base(a.path)};
  case 'run_command':case 'command_execution':return {icon:'terminal',what:'명령',target:a.command||'',mono:true};
  case 'fetch_url':return {icon:'globe',what:'웹 읽기',target:host(a.url)};
  case 'browser_search':case 'web_search':case 'web_search_call':return {icon:'search',what:'웹 검색',target:a.query||''};
  case 'browser_read':return {icon:'globe',what:'브라우저',target:host(a.url)};
  case 'file_change':return {icon:'pen',what:'파일 변경',target:Array.isArray(a.changes)?a.changes.map(c=>base(c.path)).join(', '):''};
  default:return {icon:'bolt',what:name,target:''};
 }
}
const stepFailed=r=>!!r&&(!!r.error||r.status==='failed'||(typeof r.exit_code==='number'&&r.exit_code!==0));
function stepHTML(st){
 if(st.type==='note')return `<div class="note md">${markdown(st.text)}</div>`;
 const L=stepLabel(st.name,st.args,st.result),bad=stepFailed(st.result),denied=bad&&/거절/.test(String(st.result.error||''));
 const g=!st.done?'<span class="spinner" role="img" aria-label="진행 중"></span>':icon(bad?'x':L.icon);
 const open=S.steps.has(st.id);
 return `<button type="button" class="step ${denied?'denied':bad?'err':''}" data-act="toggle-step" data-id="${esc(st.id)}" aria-expanded="${open}"><span class="g">${g}</span><span class="what">${esc(L.what)}</span><span class="target${L.mono?' mono':''}">${esc(L.target)}</span>${denied?'<span class="side-note">거절함</span>':L.note?`<span class="side-note">${esc(L.note)}</span>`:''}</button>${open?`<div class="detail">${detailHTML(st)}</div>`:''}`;
}
function detailHTML(st){
 const a=st.args||{},r=st.result,out=[];
 if(st.name==='edit_file')out.push(`<div class="lbl">변경</div>${diffHTML(a.old_text||'',a.new_text||'')}`);
 else if(st.name==='write_file')out.push(`<div class="lbl">${esc(a.path||'')}</div><pre>${esc(String(a.content||'').slice(0,12000))}</pre>`);
 else if(st.name==='run_command'||st.name==='command_execution')out.push(`<pre>$ ${esc(a.command||'')}</pre>`);
 else if(Object.keys(a).length&&!['search_files','list_files','read_file','fetch_url','browser_search','browser_read'].includes(st.name))out.push(`<pre>${esc(JSON.stringify(a,null,2).slice(0,6000))}</pre>`);
 else if(['read_file','fetch_url','browser_read'].includes(st.name))out.push(`<div class="lbl">${esc(a.path||a.url||'')}</div>`);
 if(r){
  let text;
  if(r.error)text=r.error;else if(st.name==='search_sessions'&&Array.isArray(r.matches))text=r.matches.map(m=>`${m.title||'제목 없음'} · ${m.role==='user'?'사용자':m.role==='assistant'?'Naru':m.role||''}\n${m.excerpt||''}`).join('\n\n')||'일치하는 이전 대화가 없어요.';else if(st.name==='todo'&&Array.isArray(r.items))text=r.items.map(i=>`${i.status==='completed'?'☑':i.status==='in_progress'?'◐':'☐'} ${i.text}${i.status==='in_progress'?' (진행 중)':''}`).join('\n')||'작업 목록이 비어 있어요.';else if(r.output!==undefined)text=String(r.output??'');else if(typeof r.content==='string')text=r.content;
  else if(Array.isArray(r.matches))text=r.matches.map(m=>`${m.path}:${m.line}  ${m.text}`).join('\n')||'찾은 곳이 없어요.';
  else if(Array.isArray(r.files))text=r.files.map(f=>(f.directory?f.name+'/':f.name)).join('\n')||'비어 있어요.';
  else text=JSON.stringify(r,null,2);
  out.push(`<div class="lbl">${r.error?'오류':'결과'}</div><pre>${esc(String(text).slice(0,16000))}</pre>`);
 }
 return out.join('');
}
function approvalHTML(a){
 const g=a.arguments||{};let title='',where='',body='',warn='';
 if(a.tool==='write_file'){title=`${base(g.path)} ${g.overwrite?'덮어쓰기':'만들기'}`;where=g.path;body=`<div class="preview"><pre>${esc(String(g.content||'').slice(0,20000))}</pre></div>`;}
 else if(a.tool==='edit_file'){title=`${base(g.path)} 수정`;where=g.path;body=`<div class="preview">${diffHTML(g.old_text||'',g.new_text||'')}</div>`;}
 else if(a.tool==='search_sessions'){title='이전 대화 검색';warn='검색 결과가 현재 모델 제공자에게 전달됩니다.';body=`<div class="preview"><pre>${esc(g.query||'')}</pre></div>`;}
 else if(a.tool==='run_command'){title='명령 실행';warn='이 Mac에서 내 사용자 권한으로 실행돼요.';body=`<div class="preview"><pre>${esc(g.command||'')}</pre></div>`;}
 else{title=a.tool;body=`<div class="preview"><pre>${esc(JSON.stringify(g,null,2))}</pre></div>`;}
 if(where&&where===base(where))where='';
 const glyph=a.tool==='run_command'?'terminal':a.tool==='edit_file'?'pen':'doc';
 return `<div class="approve" role="group" aria-label="실행 전 확인"><div class="head">${icon(glyph)}<h4>${esc(title)}</h4></div>${where?`<p class="where">${esc(where)}</p>`:''}${warn?`<p class="warn">${warn}</p>`:''}${body}<div class="row"><button type="button" class="btn ghost" data-approval="${esc(a.id)}" data-decision="deny">거절</button><span class="grow"></span>${a.tool==='search_sessions'?'':`<button type="button" class="btn" data-approval="${esc(a.id)}" data-decision="approve_all" title="이번 작업에서 같은 종류는 다시 묻지 않아요">모두 허용</button>`}<button type="button" class="btn primary" data-approval="${esc(a.id)}" data-decision="approve" title="허용 (⌘⏎)">허용</button></div></div>`;
}
function runHTML(run,isLatest){
 const d=S.detail,steps=buildSteps(d.events.filter(e=>e.run_id===run.id)),active=ACTIVE.includes(run.status);
 const pending=d.approvals.filter(a=>a.run_id===run.id&&a.status==='pending'&&active);
 const tools=steps.filter(s=>s.type==='tool').length,broken=['failed','cancelled','interrupted'].includes(run.status);
 const expanded=active||S.open.has(run.id)||(broken&&isLatest&&!S.open.has('x'+run.id));
 let html=`<section class="run" data-run="${esc(run.id)}">`;
 if(steps.length){
  if(!active){const t=duration(run);html+=`<button type="button" class="summary" data-act="toggle-run" data-id="${esc(run.id)}" aria-expanded="${expanded}">${icon('chevron')}<span>${tools?`작업 ${tools}단계`:'진행 기록'}</span>${t?`<span class="time">${t}</span>`:''}</button>`;}
  if(expanded)html+=`<div class="steps">${steps.map(stepHTML).join('')}</div>`;
 }
 if(active){
  html+=pending.map(approvalHTML).join('');
  const text=S.detail.live?.run_id===run.id?S.live:'';
  html+=`<div class="md" id="live">${text?markdown(text):''}</div>`;
  if(!text&&!pending.length)html+='<div class="waiting" id="waiting"><span class="live-dot" role="img" aria-label="작업 중"></span></div>';
 }else if(broken){
  const msg=run.status==='cancelled'?'중지했어요.':run.status==='interrupted'?'앱이 닫혀 작업이 멈췄어요.':(run.error||'작업을 마치지 못했어요.');
  html+=`<div class="notice ${run.status==='failed'?'bad':''}"><p>${esc(msg)}</p>${isLatest?`<button type="button" class="btn sm" data-act="resume" data-id="${esc(run.id)}">${run.status==='failed'?'다시 시도':'이어서 실행'}</button>`:''}</div>`;
 }
 return html+'</section>';
}
function paintLive(){
 const el=$('live');if(!el){renderThread();return;}
 const scroll=$('thread'),near=scroll&&scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<140;
 el.innerHTML=markdown(S.live);if(S.live)$('waiting')?.remove();
 if(near)scroll.scrollTop=scroll.scrollHeight;
}
function renderDrawer(){
 const el=$('drawer-in');if(!el)return;const d=S.detail;if(!d){el.innerHTML='';return;}
 const arts=d.artifacts||[],run=latestRun(),u=run?.usage||{},p=providerById(run?.provider_id),t=duration(run);
 const ico=n=>/\.(png|jpe?g|gif|webp|svg)$/i.test(n)?'image':/\.(html?|js|ts|py|css|json|sh)$/i.test(n)?'code':'doc';
 el.innerHTML=`<h3>파일</h3>${arts.length?arts.map(a=>`<button type="button" class="art" data-artifact="${esc(a.id)}" title="${esc(a.path)}"><span class="ico">${icon(ico(a.name))}</span><div><b>${esc(a.name)}</b><small>${size(a.size)}</small></div></button>`).join(''):'<p class="empty-note">이 대화에서 만든 파일이 여기 모여요.</p>'}
 ${run?`<h3>마지막 실행</h3><dl class="facts"><dt>모델</dt><dd title="${esc(run.model||'')}">${esc(run.model||p?.name||'기본 모델')}</dd><dt>상태</dt><dd>${esc(STATUS[run.status]||run.status)}</dd>${t?`<dt>걸린 시간</dt><dd>${t}</dd>`:''}${u.input_tokens?`<dt>입력 토큰</dt><dd>${Number(u.input_tokens).toLocaleString()}</dd>`:''}${u.output_tokens?`<dt>출력 토큰</dt><dd>${Number(u.output_tokens).toLocaleString()}</dd>`:''}</dl>`:''}
 <h3>작업 폴더</h3><p class="path">${esc(S.data.settings.workspace)}</p>${window.naruDesktop?.revealPath?`<button type="button" class="btn sm" style="margin:0 6px" data-act="reveal-workspace">${icon('folder')}Finder에서 보기</button>`:''}`;
}

// ---------- sessions & runs ----------
function ensureProvider(){
 if(providerById(S.providerId))return;
 const a=S.accounts||S.data?.accounts||{};
 const ready=providers().find(p=>p.kind==='codex'&&a.codex?.authenticated)||providers().find(p=>isAccount(p)&&accountOf(p)?.authenticated)||providers().find(p=>p.model)||providers()[0];
 S.providerId=ready?.id||'';S.model=ready?.model||'';
}
async function refreshState(){
 const d=await api('/api/state');
 S.data=d;if(d.accounts)S.accounts=d.accounts;
 ensureProvider();
 S.skillIds=S.skillIds.filter(id=>enabledSkills().some(s=>String(s.id)===id));
 return d;
}
async function loadAccounts(force=false){try{S.accounts=await api('/api/accounts'+(force?'?refresh=1':''));ensureProvider();discoverModels(force);if(S.view==='models')renderModels();if(S.view==='chat')renderTools();}catch{}}
async function selectSession(id){
 S.epoch++;const epoch=S.epoch;S.view='chat';S.sid=id;S.detail=null;S.live='';closePop();closeSide();remember(id);
 const s=S.data.sessions.find(x=>x.id===id);
 if(s){if(providerById(s.provider_id))S.providerId=s.provider_id;S.model=s.model||'';S.mode=s.mode||'chat';}
 renderAll();
 try{await loadDetail();if(epoch===S.epoch)$('input')?.focus({preventScroll:true});}
 catch(err){if(epoch===S.epoch){toast(err.message,true);newChat();}}
}
function newChat(){S.epoch++;S.view='chat';S.sid=null;S.detail=null;S.live='';remember(null);closePop();closeSide();renderAll();$('input')?.focus();}
let lastFull=0;
async function loadDetail(){
 const sid=S.sid,epoch=S.epoch;if(!sid)return;
 const d=await api(`/api/sessions/${enc(sid)}`);
 if(sid!==S.sid||epoch!==S.epoch)return;
 const before=latestRun();lastFull=Date.now();
 S.detail=d;S.live=d.live?.text||'';
 if(providerById(d.session.provider_id)&&!S.sending){S.providerId=d.session.provider_id;S.model=d.session.model||'';S.mode=d.session.mode||S.mode;}
 if(S.view!=='chat')return;
 renderThread();renderTools();renderTop();renderDrawer();$('drawer')?.classList.toggle('open',S.drawer);
 const after=latestRun();
 if(before&&after&&before.id===after.id&&before.status!==after.status)onTransition(before.status,after.status);
}
function onTransition(before,after){
 const title=S.detail?.session?.title||'Naru';
 if(after==='awaiting_approval')notify('확인이 필요해요',title);
 if(ACTIVE.includes(before)&&!ACTIVE.includes(after)){
  if(after==='completed')notify('작업을 마쳤어요',title);else if(after==='failed')notify('작업이 멈췄어요',title);
  refreshState().then(()=>renderSide()).catch(()=>{});
 }
}
function notify(title,body){try{if(document.hasFocus()||!('Notification' in window)||Notification.permission!=='granted')return;new Notification(title,{body});}catch{}}
function askNotify(){try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});}catch{}}
async function send(){
 const input=$('input');const text=(input?.value||'').trim(),files=attachments();
 if((!text&&!files.length)||S.sending||runActive())return;
 const p=provider();
 if(!p){go('models');toast('먼저 모델을 연결하세요.');return;}
 const acct=accountOf(p);
 if(isAccount(p)&&acct&&acct.available===false){go('models');toast(`${p.name} CLI를 먼저 설치하세요.`,true);return;}
 if(isAccount(p)&&acct&&!acct.authenticated){go('models');toast(`${p.name} 로그인이 필요해요.`,true);return;}
 if(!isAccount(p)&&!S.model&&!p.model){modelMenu();toast('사용할 모델을 고르세요.');return;}
 let content=text;
 if(files.length)content=(text||'첨부한 파일을 검토해 줘.')+ATTACH_HEAD+files.map(f=>`\n--- 첨부: ${f.name} ---\n${f.text}\n--- 첨부 끝 ---`).join('\n');
 if(content.length>100000){toast('메시지와 첨부를 합쳐 100,000자 이하로 줄여 주세요.',true);return;}
 const epoch=S.epoch,key=draftKey();S.sending=true;renderTools();
 try{
  let sid=S.sid;
  if(!sid){const s=await api('/api/sessions',{method:'POST',body:{title:(text||files[0]?.name||'새 대화').slice(0,40),provider_id:p.id,model:S.model,mode:S.mode}});sid=s.id;if(S.epoch===epoch){S.sid=sid;remember(sid);}}
  await api(`/api/sessions/${enc(sid)}/messages`,{method:'POST',body:{content,provider_id:p.id,model:S.model,mode:S.mode,skill_ids:selectedSkills().map(s=>s.id)}});
  delete S.drafts[key];delete S.files[key];delete S.drafts[sid];delete S.files[sid];
  if(S.epoch===epoch&&S.sid===sid&&$('input')){$('input').value='';autosize();renderChips();}
  S.data.active={...(S.data.active||{}),[sid]:'running'};
  if(S.epoch===epoch&&S.sid===sid)await loadDetail();
  refreshState().then(()=>renderSide()).catch(()=>{});
  askNotify();
 }catch(err){toast(err.message,true);}
 finally{S.sending=false;if(S.view==='chat')renderTools();}
}

// ---------- popovers ----------
let pop=null;
function closePop(){if(pop){pop.el.remove();pop.anchor?.setAttribute('aria-expanded','false');pop=null;}}
function openPop(anchor,html,{onPick,width}={}){
 closePop();const el=document.createElement('div');el.className='pop';el.setAttribute('role','menu');el.innerHTML=html;if(width)el.style.width=width+'px';
 document.body.appendChild(el);pop={el,anchor,onPick};anchor?.setAttribute('aria-expanded','true');placePop();
 el.addEventListener('click',ev=>{const t=ev.target.closest('[data-pick]');if(t&&pop?.onPick)pop.onPick(t.dataset.pick,t,ev);});
 return el;
}
function placePop(){
 if(!pop)return;const {el,anchor}=pop;const r=anchor.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
 let left=Math.min(Math.max(12,r.left),innerWidth-w-12);let top=r.top-h-8;if(top<12)top=Math.min(r.bottom+8,innerHeight-h-12);
 el.style.left=left+'px';el.style.top=top+'px';
}
function modelOptions(p){
 const list=S.models[p.id]||[], options=p.kind==='codex'?['',...list]:[...list];
 for(const m of [p.model,String(p.id)===String(S.providerId)?S.model:''])if(m&&!options.includes(m))options.unshift(m);
 return options;
}
function modelMenuHTML(){
 const parts=[];
 for(const p of providers()){
  const acct=isAccount(p)?accountOf(p):null,locked=acct&&(!acct.available||!acct.authenticated),state=S.modelFetch[p.id]||{};
  parts.push(`<div class="grp">${esc(p.name)}${locked?(acct.available?'<span class="badge attention">로그인 필요</span>':'<span class="badge neutral">설치 필요</span>'):''}</div>`);
  if(locked){parts.push(`<button type="button" class="opt dim" data-pick="go-models">${icon('key')}<span>연결하러 가기</span></button>`);continue;}
  for(const m of modelOptions(p)){const on=String(p.id)===String(S.providerId)&&(S.model||'')===(m||'');parts.push(`<button type="button" class="opt" role="menuitemradio" aria-checked="${on}" data-pick="m" data-p="${esc(p.id)}" data-m="${esc(m)}"><span>${esc(m||'기본 모델')}</span>${on?icon('check','tick'):''}</button>`);}
  if(state.loading)parts.push('<div class="loading"><span class="spinner"></span>모델 불러오는 중</div>');
  else if(state.error)parts.push(`<div class="loading">${esc(state.error)}</div>`);
  else if(S.models[p.id]&&!S.models[p.id].length&&p.kind!=='codex')parts.push(`<div class="loading">${['claude_code','gemini_cli','copilot_cli'].includes(p.kind)?'자동 모델 목록을 제공하지 않아요. 모델 ID를 직접 입력하세요.':'사용 가능한 모델이 없어요'}</div>`);
  if(p.kind==='codex')parts.push('<div class="loading">모델 목록은 카탈로그이며 계정 사용 가능 여부는 실행 시 확인됩니다.</div>');
  if(['claude_code','gemini_cli','copilot_cli'].includes(p.kind))parts.push('<div class="loading">CLI 기본 모델 목록입니다. 실제 사용 가능 여부는 실행 시 확인됩니다.</div>');
  parts.push(`<button type="button" class="opt dim" data-pick="refresh-models" data-p="${esc(p.id)}">${icon('retry')}<span>모델 목록 새로고침</span></button>`);
  parts.push(`<div class="inline" hidden data-custom="${esc(p.id)}"><input type="text" placeholder="모델 ID" aria-label="${esc(p.name)} 모델 ID"><button type="button" class="btn sm primary" data-pick="custom" data-p="${esc(p.id)}">사용</button></div><button type="button" class="opt dim" data-pick="custom-open" data-p="${esc(p.id)}">${icon('plus')}<span>모델 ID 입력</span></button>`);
 }
 parts.push(`<div class="sep"></div><button type="button" class="opt" data-pick="go-models">${icon('plug')}<span>연결 관리</span></button>`);
 return parts.join('');
}
function redrawModelMenu(){
 if(!pop||pop.anchor?.id!=='model-chip')return;
 const el=pop.el;if(el.querySelector('[data-custom]:not([hidden])'))return;
 const scroll=el.scrollTop;el.innerHTML=modelMenuHTML();el.scrollTop=scroll;placePop();
}
async function loadProviderModels(p,force=false){
 const id=p.id,old=S.modelFetch[id];
 if(old?.loading||(!force&&old?.at&&Date.now()-old.at<60000))return;
 const requestState=S.modelFetch[id]={...(old||{}),loading:true,error:''};redrawModelMenu();
 try{
  const r=await api(`/api/providers/${enc(id)}/models`);
  if(!providerById(id)||S.modelFetch[id]!==requestState)return;
  S.models[id]=[...new Set((Array.isArray(r.models)?r.models:[]).map(m=>typeof m==='string'?m:m?.id||m?.name).filter(Boolean))];
  S.modelFetch[id]={loading:false,at:Date.now(),error:''};
 }catch(err){
  if(!providerById(id)||S.modelFetch[id]!==requestState)return;
  S.modelFetch[id]={loading:false,at:Date.now(),error:p.kind==='codex'?'ChatGPT 모델 목록을 불러오지 못했어요.':'서버에 연결되지 않아요'};
 }finally{redrawModelMenu();}
}
function discoverModels(force=false){
 for(const p of providers()){
  const a=isAccount(p)?accountOf(p):null;
  if(isAccount(p)&&(!a||!a.available||!a.authenticated))continue;
  loadProviderModels(p,force);
 }
}
function modelMenu(){
 const anchor=$('model-chip');if(!anchor)return;
 const el=openPop(anchor,modelMenuHTML(),{width:300,onPick:async(kind,t)=>{
  if(kind==='go-models'){closePop();go('models');return;}
  if(kind==='refresh-models'){const p=providerById(t.dataset.p);if(p)await loadProviderModels(p,true);return;}
  if(kind==='custom-open'){const box=el.querySelector(`[data-custom="${CSS.escape(t.dataset.p)}"]`);box.hidden=false;t.hidden=true;box.querySelector('input').focus();return;}
  let pid=t.dataset.p,model=kind==='custom'?el.querySelector(`[data-custom="${CSS.escape(pid)}"] input`).value.trim():t.dataset.m;
  if(kind==='custom'&&!model)return;
  closePop();await setModel(pid,model);
 }});
 el.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.matches('[data-custom] input')){ev.preventDefault();ev.target.parentElement.querySelector('[data-pick="custom"]').click();}});
 discoverModels();
}
async function setModel(pid,model){
 S.providerId=pid;S.model=model;renderTools();
 if(S.sid){try{await api(`/api/sessions/${enc(S.sid)}`,{method:'PATCH',body:{provider_id:pid,model}});}catch(err){toast(err.message,true);}}
}
function skillsMenu(){
 const anchor=$('skill-chip');const list=enabledSkills();
 const html=()=>(list.length?list.map(s=>{const on=S.skillIds.includes(String(s.id));return `<button type="button" class="opt" role="menuitemcheckbox" aria-checked="${on}" data-pick="s" data-id="${esc(s.id)}"><span>${esc(s.name)}</span>${on?icon('check','tick'):''}</button>`;}).join(''):'<div class="loading">켜 둔 스킬이 없어요</div>')+`<div class="sep"></div><button type="button" class="opt" data-pick="go">${icon('skill')}<span>스킬 관리</span></button>`;
 const el=openPop(anchor,html(),{width:260,onPick:(kind,t)=>{
  if(kind==='go'){closePop();go('skills');return;}
  const id=String(t.dataset.id);S.skillIds=S.skillIds.includes(id)?S.skillIds.filter(x=>x!==id):[...S.skillIds,id];el.innerHTML=html();renderTools();
 }});
}
function chatMenu(anchor){
 openPop(anchor,`<button type="button" class="opt" data-pick="rename">${icon('edit')}<span>이름 바꾸기</span></button><button type="button" class="opt" data-pick="export">${icon('download')}<span>마크다운으로 내보내기</span></button><div class="sep"></div><button type="button" class="opt" data-pick="delete" style="color:var(--danger)">${icon('trash')}<span>대화 삭제</span></button>`,{width:220,onPick:k=>{closePop();if(k==='rename')startRename();else if(k==='export')exportChat();else deleteChat();}});
}
function exportChat(){const a=document.createElement('a');a.href=`/api/sessions/${enc(S.sid)}/export`;a.download='';document.body.appendChild(a);a.click();a.remove();}
function deleteChat(){
 if(runActive()){toast('실행을 멈춘 뒤 삭제할 수 있어요.',true);return;}
 confirmDialog('이 대화를 삭제할까요?','대화와 실행 기록이 사라져요. 만든 파일은 작업 폴더에 남아요.','삭제',async()=>{await api(`/api/sessions/${enc(S.sid)}`,{method:'DELETE'});await refreshState();newChat();toast('삭제했어요');});
}
function startRename(){
 const btn=$('top-title');if(!btn||!S.detail)return;const old=S.detail.session.title;
 const wrap=document.createElement('div');wrap.className='top-title';wrap.innerHTML=`<input id="rename-input" value="${esc(old)}" maxlength="120" aria-label="대화 이름">`;btn.replaceWith(wrap);
 const input=$('rename-input');input.focus();input.select();let done=false;
 const finish=async save=>{if(done)return;done=true;const title=input.value.trim();if(save&&title&&title!==old){try{await api(`/api/sessions/${enc(S.sid)}`,{method:'PATCH',body:{title}});S.detail.session.title=title;await refreshState();renderSide();}catch(err){toast(err.message,true);}}renderTop();};
 input.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.isComposing){ev.preventDefault();finish(true);}if(ev.key==='Escape'){ev.preventDefault();finish(false);}});
 input.addEventListener('blur',()=>finish(true));
}

// ---------- palette ----------
let palette=null;
function openPalette(){
 closePop();if(palette){palette.input.focus();return;}
 const el=document.createElement('div');el.className='palette';el.innerHTML='<div class="palette-box" role="dialog" aria-label="검색"><input type="text" placeholder="대화, 모델, 설정 검색" aria-label="검색"><div class="palette-list" role="listbox"></div></div>';
 document.body.appendChild(el);const input=el.querySelector('input'),list=el.querySelector('.palette-list');
 palette={el,input,items:[],hl:0,remote:[],q:''};
 const actions=[
  {icon:'compose',label:'새 대화',run:newChat},
  {icon:'plug',label:'모델 연결',run:()=>go('models')},
  {icon:'skill',label:'스킬',run:()=>go('skills')},
  {icon:'memory',label:'메모리',run:()=>go('memory')},
  {icon:'settings',label:'설정',run:()=>go('settings')},
  {icon:'sidebar',label:S.sideHidden?'사이드바 보기':'사이드바 숨기기',run:()=>setSide(!S.sideHidden)},
  {icon:document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches)?'sun':'moon',label:'밝기 전환',run:()=>{const dark=getComputedStyle(document.documentElement).colorScheme==='dark';pref.set('theme',dark?'light':'dark');applyTheme();}},
 ];
 const draw=()=>{
  const q=palette.q.toLowerCase();
  const acts=actions.filter(a=>!q||a.label.toLowerCase().includes(q));
  const sess=S.data.sessions.filter(s=>!q||s.title.toLowerCase().includes(q)).slice(0,q?20:8).map(s=>({icon:'compose',label:s.title,sid:s.id}));
  const seen=new Set(sess.map(s=>s.sid));
  const remote=palette.remote.filter(r=>!seen.has(r.session_id)).map(r=>({icon:'search',label:r.title,sub:r.snippet,sid:r.session_id}));
  const groups=[q?[...sess,...remote]:sess,acts].filter(g=>g.length);
  palette.items=groups.flat();palette.hl=Math.min(palette.hl,Math.max(0,palette.items.length-1));
  let n=0;list.innerHTML=groups.map(g=>g.map(it=>{const i=n++;return `<button type="button" class="pal ${i===palette.hl?'hl':''}" role="option" aria-selected="${i===palette.hl}" data-index="${i}">${icon(it.icon)}<div><b>${esc(it.label)}</b>${it.sub?`<small>${esc(it.sub)}</small>`:''}</div></button>`;}).join('')).join('<div class="sep"></div>')||'<div class="none">찾는 결과가 없어요</div>';
  list.querySelector('.hl')?.scrollIntoView({block:'nearest'});
 };
 const pick=i=>{const it=palette.items[i];if(!it)return;closePalette();if(it.sid)selectSession(it.sid);else it.run();};
 let timer;
 input.addEventListener('input',()=>{palette.q=input.value.trim();palette.hl=0;palette.remote=[];draw();clearTimeout(timer);if(palette.q.length>=2)timer=setTimeout(async()=>{const q=palette?.q;try{const r=await api('/api/search?q='+enc(q));if(palette&&palette.q===q){palette.remote=r.results||[];draw();}}catch{}},180);});
 input.addEventListener('keydown',ev=>{if(ev.key==='ArrowDown'){ev.preventDefault();palette.hl=Math.min(palette.items.length-1,palette.hl+1);draw();}else if(ev.key==='ArrowUp'){ev.preventDefault();palette.hl=Math.max(0,palette.hl-1);draw();}else if(ev.key==='Enter'&&!ev.isComposing){ev.preventDefault();pick(palette.hl);}else if(ev.key==='Escape'){ev.preventDefault();closePalette();}});
 el.addEventListener('mousedown',ev=>{if(ev.target===el)closePalette();});
 list.addEventListener('click',ev=>{const b=ev.target.closest('[data-index]');if(b)pick(+b.dataset.index);});
 draw();input.focus();
}
function closePalette(){if(!palette)return;palette.el.remove();palette=null;}

// ---------- dialogs ----------
let lastFocus=null;
function openDialog(title,body,{desc='',wide=false}={}){
 const dlg=$('dialog');lastFocus=document.activeElement;
 dlg.innerHTML=`<div class="dlg"><div class="dlg-head"><div style="flex:1"><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div>${iconBtn('x','닫기','close-dialog')}</div>${body}<div class="err" id="dlg-err" hidden></div></div>`;
 if(wide)dlg.style.width='min(680px, calc(100vw - 32px))';else dlg.style.width='';
 if(!dlg.open)dlg.showModal();
 setTimeout(()=>dlg.querySelector('input:not([type=checkbox]):not([type=hidden]),textarea,select')?.focus(),0);
 return dlg;
}
function closeDialog(){const d=$('dialog');if(d.open)d.close();}
function dialogError(msg){const e=$('dlg-err');if(e){e.hidden=false;e.textContent=msg;}else toast(msg,true);}
function confirmDialog(title,desc,label,action){
 openDialog(title,`<div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="button" class="btn danger" id="confirm-yes">${esc(label)}</button></div>`,{desc});
 $('confirm-yes').addEventListener('click',async ev=>{ev.currentTarget.disabled=true;try{await action();closeDialog();}catch(err){ev.currentTarget.disabled=false;dialogError(err.message);}});
 setTimeout(()=>$('confirm-yes')?.focus(),0);
}
async function submitForm(form,fn){
 const btn=form.querySelector('[type=submit]');btn&&(btn.disabled=true);
 try{await fn();}catch(err){dialogError(err.message);}finally{if(btn&&btn.isConnected)btn.disabled=false;}
}
const PRESETS={openai:{name:'OpenAI',kind:'responses',base_url:'https://api.openai.com/v1'},anthropic:{name:'Claude API',kind:'anthropic',base_url:'https://api.anthropic.com/v1'},gemini:{name:'Gemini API',kind:'gemini',base_url:'https://generativelanguage.googleapis.com/v1beta'},ollama:{name:'Ollama',kind:'ollama',base_url:'http://127.0.0.1:11434'},lmstudio:{name:'LM Studio',kind:'openai',base_url:'http://127.0.0.1:1234/v1'},openrouter:{name:'OpenRouter',kind:'openai',base_url:'https://openrouter.ai/api/v1'},custom:{name:'',kind:'openai',base_url:''}};
const PRESET_NAMES=[['openai','OpenAI'],['anthropic','Claude API'],['gemini','Gemini API'],['ollama','Ollama'],['lmstudio','LM Studio'],['openrouter','OpenRouter 키'],['custom','직접 입력']];
function editProvider(id){
 const old=providerById(id);const v=old?{...old}:{...PRESETS.openai,model:'',tools_enabled:true};
 const dlg=openDialog(old?'연결 편집':'새 연결',`${old?'':`<div class="presets" role="group" aria-label="빠른 설정">${PRESET_NAMES.map(([k,n],i)=>`<button type="button" class="${i===0?'on':''}" data-preset="${k}">${n}</button>`).join('')}</div>`}
 <form class="form" id="provider-form"><div class="grid2"><div class="field"><label for="pf-name">이름</label><input id="pf-name" name="name" required maxlength="80" value="${esc(v.name)}"></div><div class="field"><label for="pf-kind">API 형식</label><select id="pf-kind" name="kind">${['responses','openai','anthropic','gemini','ollama'].map(k=>`<option value="${k}"${k===v.kind?' selected':''}>${KIND_LABEL[k]}</option>`).join('')}</select></div></div>
 <div class="field"><label for="pf-url">서버 주소</label><input id="pf-url" name="base_url" type="url" required value="${esc(v.base_url)}" placeholder="http://127.0.0.1:1234/v1"></div>
 <div class="field"><label for="pf-model">기본 모델</label><input id="pf-model" name="model" value="${esc(v.model||'')}" placeholder="비워 두면 대화에서 골라요" autocomplete="off"></div>
 <div class="field"><label for="pf-key">API 키</label><input id="pf-key" name="api_key" type="password" autocomplete="new-password" placeholder="${old?.has_key?'저장된 키를 그대로 써요':'로컬 서버는 비워 두세요'}">${old?.has_key?'<label class="check"><input type="checkbox" name="clear_key"><span>저장된 키 지우기</span></label>':''}</div>
 <label class="check"><input type="checkbox" name="tools_enabled"${v.tools_enabled!==false?' checked':''}><span>에이전트 도구 쓰기<small>도구 호출을 지원하지 않는 모델이면 끄세요.</small></span></label>
 <div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{wide:true});
 dlg.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p=PRESETS[b.dataset.preset];$('pf-name').value=p.name;$('pf-kind').value=p.kind;$('pf-url').value=p.base_url;dlg.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('on',x===b));(p.base_url?$('pf-model'):$('pf-url')).focus();}));
 $('provider-form').addEventListener('submit',ev=>{ev.preventDefault();const f=new FormData(ev.target),body=Object.fromEntries(f);body.tools_enabled=f.has('tools_enabled');body.clear_key=f.has('clear_key');if(old)body.id=old.id;
  submitForm(ev.target,async()=>{const saved=await api('/api/providers',{method:'POST',body});delete S.models[saved.id];delete S.modelFetch[saved.id];delete S.tests[saved.id];await refreshState();closeDialog();renderAll();toast('저장했어요');});});
}
function editSkill(id,instructions=''){
 const sk=(S.data.skills||[]).find(s=>String(s.id)===String(id))||{name:'',description:'',instructions,enabled:true};
 openDialog(id?'스킬 편집':'새 스킬',`<form class="form" id="skill-form"><div class="field"><label for="sf-name">이름</label><input id="sf-name" name="name" required maxlength="100" value="${esc(sk.name)}" placeholder="예: 출처 있는 리서치"></div><div class="field"><label for="sf-desc">언제 쓰나요</label><input id="sf-desc" name="description" maxlength="300" value="${esc(sk.description)}" placeholder="예: 자료를 모아 보고서로 정리할 때"></div><div class="field"><label for="sf-ins">지침</label><textarea id="sf-ins" name="instructions" rows="9" required maxlength="20000" placeholder="목표, 순서, 끝났다고 볼 기준을 적어 주세요.">${esc(sk.instructions)}</textarea></div><label class="check"><input type="checkbox" name="enabled"${sk.enabled?' checked':''}><span>대화에서 고를 수 있게 켜 두기</span></label><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{wide:true});
 $('skill-form').addEventListener('submit',ev=>{ev.preventDefault();const f=new FormData(ev.target),body=Object.fromEntries(f);body.enabled=f.has('enabled');if(id)body.id=id;submitForm(ev.target,async()=>{await api('/api/skills',{method:'POST',body});await refreshState();closeDialog();if(S.view==='skills')renderSkills();toast('스킬을 저장했어요');});});
}
function saveMemoryDialog(content){
 openDialog('메모리로 저장',`<form class="form" id="mem-form"><div class="field"><label for="mf-text">기억할 내용</label><textarea id="mf-text" rows="7" maxlength="4000" required>${esc(String(content).slice(0,4000))}</textarea></div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{desc:'다음 대화부터 함께 전달돼요. 필요한 부분만 남기세요.',wide:true});
 $('mem-form').addEventListener('submit',ev=>{ev.preventDefault();submitForm(ev.target,async()=>{await api('/api/memories',{method:'POST',body:{content:$('mf-text').value.trim()}});await refreshState();closeDialog();toast('메모리에 저장했어요');});});
}
async function openArtifact(id){
 const dlg=$('preview');S.blobs.forEach(u=>URL.revokeObjectURL(u));S.blobs=[];
 dlg.innerHTML=`<div class="pv-head"><b>불러오는 중</b>${iconBtn('x','닫기','close-preview')}</div><div class="pv-body"></div>`;
 if(!dlg.open)dlg.showModal();
 try{
  const info=await api(`/api/artifacts/${enc(id)}/content`),dl=`/api/artifacts/${enc(id)}/download`,name=info.name,ext=(name.split('.').pop()||'').toLowerCase();
  const tools=`${window.naruDesktop?.revealPath?iconBtn('folder','Finder에서 보기','reveal','',`data-path="${esc(info.path)}"`):''}${window.naruDesktop?.openPath?iconBtn('external','기본 앱으로 열기','open-path','',`data-path="${esc(info.path)}"`):''}<a class="icon-btn" href="${dl}" download title="내려받기" aria-label="내려받기">${icon('download')}</a>${iconBtn('x','닫기','close-preview')}`;
  let body;
  if(/^image\/(png|jpeg|gif|webp)$/.test(info.mime))body=`<img src="${dl}?inline=1" alt="${esc(name)}">`;
  else if(info.text!=null&&(ext==='html'||ext==='htm')){const u=URL.createObjectURL(new Blob([info.text],{type:'text/html'}));S.blobs.push(u);body=`<iframe sandbox="" src="${u}" title="${esc(name)} 미리보기"></iframe>`;}
  else if(info.text!=null&&ext==='svg'){const u=URL.createObjectURL(new Blob([info.text],{type:'image/svg+xml'}));S.blobs.push(u);body=`<img src="${u}" alt="${esc(name)}">`;}
  else if(info.text!=null&&(ext==='md'||ext==='markdown'))body=`<div class="md">${markdown(info.text)}</div>`;
  else if(info.text!=null)body=`<pre>${esc(info.text)}</pre>`;
  else body='<div class="blank"><p>여기서는 미리 볼 수 없는 형식이에요.</p></div>';
  dlg.innerHTML=`<div class="pv-head"><b title="${esc(info.path)}">${esc(name)}</b>${tools}</div><div class="pv-body">${body}</div>`;
 }catch(err){dlg.querySelector('.pv-body').innerHTML=`<div class="blank"><p>${esc(err.message)}</p></div>`;}
}

// ---------- pages ----------
function page(title,body,action=''){return `<div class="page" id="page"><div class="page-in"><div class="page-head"><h1>${esc(title)}</h1>${action}</div>${body}</div></div>`;}
function renderModels(){
 const a=S.accounts||S.data.accounts;
 const rows=[['codex','ChatGPT'],['claude_code','Claude'],['gemini_cli','Gemini'],['copilot_cli','GitHub Copilot'],['openrouter','OpenRouter']];
 const acct=([key,name])=>{
  const st=a?.[key];let badge='',sub='',act='';
  if(!st)badge='<span class="spinner" role="img" aria-label="확인하는 중"></span>';
  else if(key!=='openrouter'&&!st.available){badge='<span class="badge neutral">설치 필요</span>';sub=st.install?`<code>${esc(st.install)}</code>`:'';act=`<button type="button" class="btn sm" data-act="copy-install" data-id="${key}">${icon('copy')}설치 명령 복사</button>`;}
  else if(!st.authenticated){badge='<span class="badge attention">로그인 필요</span>';act=`<button type="button" class="btn sm tint" data-act="account-login" data-id="${key}">로그인</button>`;}
  else{badge='<span class="badge done">연결됨</span>';if(/API 키|@/.test(st.message||''))sub=esc(st.message);act=`<button type="button" class="btn sm" data-act="account-use" data-id="${key}">대화 시작</button>${key==='openrouter'?iconBtn('retry','다시 로그인','account-login',key):''}`;}
  return `<div class="item"><span class="glyph ${st?.authenticated?'live':''}" aria-hidden="true">${esc(name[0])}</span><div class="txt"><div class="name">${esc(name)}${badge}</div>${sub?`<span class="sub">${sub}</span>`:''}</div><div class="acts2">${act}</div></div>`;
 };
 const apis=providers().filter(p=>!ACCOUNT_KINDS.includes(p.kind)&&p.account!=='openrouter');
 const apiRow=p=>{const t=S.tests[p.id];const badge=!t?'':t.pending?'<span class="spinner" role="img" aria-label="확인하는 중"></span>':t.ok?'<span class="badge done">응답함</span>':'<span class="badge error">연결 안 됨</span>';
  return `<div class="item"><span class="glyph" aria-hidden="true">${esc((p.name||'?')[0])}</span><div class="txt"><div class="name">${esc(p.name)}${badge}</div><span class="sub">${esc(p.model||host(p.base_url))}${p.model?`<i class="host">${esc(host(p.base_url))}</i>`:''}</span>${t&&!t.pending&&!t.ok&&t.message?`<span class="sub bad">${esc(t.message)}</span>`:''}</div><div class="acts2"><button type="button" class="btn sm ghost" data-act="test-provider" data-id="${esc(p.id)}"${t?.pending?' disabled':''}>확인</button><button type="button" class="btn sm" data-act="use-provider" data-id="${esc(p.id)}">대화 시작</button>${iconBtn('edit','편집','edit-provider',p.id)}${iconBtn('trash','삭제','delete-provider',p.id)}</div></div>`;};
 $('main').innerHTML=page('모델',`<h2>계정으로 연결<span class="grow"></span>${iconBtn('retry','상태 다시 확인','accounts-refresh')}</h2><div class="panel">${rows.map(acct).join('')}</div>
 <h2>API와 로컬 서버<span class="grow"></span>${apis.length?`<button type="button" class="btn sm" data-act="add-provider">${icon('plus')}연결 추가</button>`:''}</h2>
 <div class="panel">${apis.length?apis.map(apiRow).join(''):'<div class="blank"><p>Ollama, LM Studio 같은 로컬 서버나 API 키로 모델을 더할 수 있어요.</p><button type="button" class="btn primary" data-act="add-provider">연결 추가</button></div>'}</div>`);
}
function renderSkills(){
 const list=S.data.skills||[];
 $('main').innerHTML=page('스킬',`<p class="lead">자주 하는 일의 방식을 적어 두면 대화에서 골라 쓸 수 있어요.</p><div class="panel">${list.length?list.map(s=>`<div class="item"><span class="glyph" aria-hidden="true">${icon('skill')}</span><div class="txt"><div class="name">${esc(s.name)}</div>${s.description?`<span class="sub">${esc(s.description)}</span>`:''}</div><div class="acts2"><button type="button" class="switch" role="switch" aria-checked="${!!s.enabled}" aria-label="${esc(s.name)} 켜기" data-act="skill-toggle" data-id="${esc(s.id)}"></button>${iconBtn('edit','편집','edit-skill',s.id)}${iconBtn('trash','삭제','delete-skill',s.id)}</div></div>`).join(''):'<div class="blank"><p>아직 스킬이 없어요.</p></div>'}</div>`,`<button type="button" class="btn primary" data-act="add-skill">${icon('plus')}스킬 만들기</button>`);
}
function renderMemory(){
 const list=S.data.memories||[];
 $('main').innerHTML=page('메모리',`<p class="lead">여기 적은 내용은 모든 대화에 함께 전달돼요. 직접 적은 것만 기억해요.</p><form class="panel" id="memory-form" style="padding:12px;gap:8px"><label class="sr" for="memory-input">새 메모리</label><textarea id="memory-input" rows="3" maxlength="4000" placeholder="예: 보고서는 짧은 문단으로, 결론부터 써 줘." style="box-shadow:none;padding:4px 6px;min-height:64px"></textarea><div class="actions" style="margin:0"><button type="submit" class="btn primary">저장</button></div></form>${list.length?`<h2>저장한 내용</h2><div class="panel">${list.map(m=>`<div class="item"><div class="txt body-text">${esc(m.content)}</div><div class="acts2">${iconBtn('trash','삭제','delete-memory',m.id)}</div></div>`).join('')}</div>`:''}`);
 $('memory-form').addEventListener('submit',async ev=>{ev.preventDefault();const t=$('memory-input'),content=t.value.trim();if(!content)return;try{await api('/api/memories',{method:'POST',body:{content}});await refreshState();renderMemory();toast('저장했어요');}catch(err){toast(err.message,true);}});
}
function renderSettings(){
 const x=S.data.settings,theme=pref.get('theme','system'),desk=!!window.naruDesktop?.chooseDirectory;
 const picker=id=>desk?`<button type="button" class="btn" data-act="pick-folder" data-id="${id}" title="폴더 고르기">${icon('folder')}고르기</button>`:'';
 $('main').innerHTML=page('설정',`<form class="form" id="settings-form">
 <h2>화면</h2><div class="seg wide" role="group" aria-label="밝기">${[['system','시스템'],['light','밝게'],['dark','어둡게']].map(([k,n])=>`<button type="button" data-act="theme" data-id="${k}" aria-pressed="${theme===k}">${n}</button>`).join('')}</div>
 <h2>폴더</h2><div class="field"><label for="st-ws">작업 폴더</label><div class="inrow"><input id="st-ws" name="workspace" required value="${esc(x.workspace)}">${picker('st-ws')}</div><span class="hint">에이전트는 이 폴더 안에서만 파일을 읽고 바꿔요.</span></div>
 <div class="field"><label for="st-rp">보고서 폴더</label><div class="inrow"><input id="st-rp" name="report_directory" required value="${esc(x.report_directory)}">${picker('st-rp')}</div></div>
 <h2>실행</h2><div class="grid2"><div class="field"><label for="st-steps">한 번에 쓰는 도구 단계</label><input id="st-steps" name="max_steps" type="number" min="1" max="50" required value="${esc(x.max_steps||12)}"></div><div class="field"><label for="st-tok">최대 출력 토큰</label><input id="st-tok" name="max_output_tokens" type="number" min="256" max="32768" step="256" required value="${esc(x.max_output_tokens||4096)}"></div></div>
 <h2>모든 대화에 줄 지침</h2><div class="field"><label class="sr" for="st-sys">지침</label><textarea id="st-sys" name="system_prompt" rows="6">${esc(x.system_prompt||'')}</textarea></div>
 <div class="actions"><button type="submit" class="btn primary">저장</button></div></form>`);
 $('settings-form').addEventListener('submit',async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));b.max_steps=Number(b.max_steps);b.max_output_tokens=Number(b.max_output_tokens);try{await api('/api/settings',{method:'POST',body:b});await refreshState();toast('설정을 저장했어요');}catch(err){toast(err.message,true);}});
}

// ---------- accounts ----------
async function accountLogin(key){
 const r=await api(`/api/accounts/${enc(key)}/login`,{method:'POST',body:{}});
 if(r.url){await openExternal(r.url);toast('브라우저에서 OpenRouter 로그인을 마치세요.');}
 else toast(r.terminal?'터미널에서 로그인을 마치면 자동으로 확인해요.':'브라우저에서 로그인을 마치면 자동으로 확인해요.');
 clearInterval(S.watch);let n=0;
 S.watch=setInterval(async()=>{n++;try{S.accounts=await api('/api/accounts?refresh=1');if(S.accounts[key]?.authenticated){clearInterval(S.watch);await refreshState();toast(`${ACCOUNT_NAMES[key]} 연결됨`);}if(S.view==='models')renderModels();}catch{}if(n>75)clearInterval(S.watch);},4000);
}
async function accountUse(key){
 const p=await api(`/api/accounts/${enc(key)}/connect`,{method:'POST',body:{}});
 await refreshState();S.providerId=p.id;S.model=p.model||'';newChat();
}

// ---------- events ----------
const ACT={
 'new':()=>newChat(),
 'palette':()=>openPalette(),
 'toggle-side':()=>{if(innerWidth<=760){closeSide();return;}setSide(!S.sideHidden);},
 'open-side':()=>$('app').classList.add('side-open'),
 'close-side':()=>closeSide(),
 'drawer':()=>{S.drawer=!S.drawer;pref.set('drawer',S.drawer?'1':'0');$('drawer')?.classList.toggle('open',S.drawer);renderTop();},
 'chat-menu':el=>chatMenu(el),
 'rename':()=>startRename(),
 'attach':()=>$('file-input')?.click(),
 'remove-file':el=>{const key=draftKey();S.files[key]=attachments().filter((_,i)=>i!==+el.dataset.id);renderChips();},
 'model-menu':()=>pop&&pop.anchor===$('model-chip')?closePop():modelMenu(),
 'skills-menu':()=>pop&&pop.anchor===$('skill-chip')?closePop():skillsMenu(),
 'mode':async el=>{S.mode=el.dataset.mode;renderTools();if(S.sid)try{await api(`/api/sessions/${enc(S.sid)}`,{method:'PATCH',body:{mode:S.mode}});}catch(err){toast(err.message,true);}},
 'stop':async el=>{const r=latestRun();if(!r)return;el.disabled=true;await api(`/api/runs/${enc(r.id)}/cancel`,{method:'POST',body:{}});await loadDetail();},
 'resume':async el=>{el.disabled=true;await api(`/api/runs/${enc(el.dataset.id)}/resume`,{method:'POST',body:{}});S.data.active={...(S.data.active||{}),[S.sid]:'running'};await loadDetail();renderSide();},
 'regenerate':async el=>{el.disabled=true;await api(`/api/sessions/${enc(S.sid)}/regenerate`,{method:'POST',body:{provider_id:S.providerId,model:S.model,mode:S.mode,skill_ids:selectedSkills().map(s=>s.id)}});S.data.active={...(S.data.active||{}),[S.sid]:'running'};await loadDetail();renderSide();},
 'toggle-run':el=>{const id=el.dataset.id,run=S.detail.runs.find(r=>r.id===id),broken=run&&['failed','cancelled','interrupted'].includes(run.status)&&run===latestRun();if(broken){S.open.has('x'+id)?S.open.delete('x'+id):S.open.add('x'+id);}else{S.open.has(id)?S.open.delete(id):S.open.add(id);}renderThread();},
 'toggle-step':el=>{const id=el.dataset.id;S.steps.has(id)?S.steps.delete(id):S.steps.add(id);renderThread();},
 'copy-code':el=>copyText(S.codes[+el.dataset.id]||''),
 'copy-msg':el=>copyText(S.msgs.get(el.dataset.id)||''),
 'save-memory':el=>saveMemoryDialog(S.msgs.get(el.dataset.id)||''),
 'save-skill':el=>editSkill(null,S.msgs.get(el.dataset.id)||''),
 'close-dialog':()=>closeDialog(),
 'close-preview':()=>{$('preview').close();},
 'reveal':el=>window.naruDesktop?.revealPath(el.dataset.path),
 'open-path':el=>window.naruDesktop?.openPath(el.dataset.path),
 'reveal-workspace':()=>window.naruDesktop?.revealPath(S.data.settings.workspace),
 'accounts-refresh':async el=>{el.disabled=true;S.accounts=null;renderModels();await loadAccounts(true);},
 'account-login':el=>accountLogin(el.dataset.id),
 'account-use':el=>accountUse(el.dataset.id),
 'copy-install':el=>copyText((S.accounts||{})[el.dataset.id]?.install||'','설치 명령을 복사했어요. 터미널에 붙여 넣으세요.'),
 'add-provider':()=>editProvider(),
 'edit-provider':el=>editProvider(el.dataset.id),
 'delete-provider':el=>{const p=providerById(el.dataset.id);confirmDialog(`${p?.name||'연결'}을 삭제할까요?`,'저장된 키도 함께 지워져요. 지난 대화는 남아요.','삭제',async()=>{await api(`/api/providers/${enc(el.dataset.id)}`,{method:'DELETE'});delete S.models[el.dataset.id];delete S.modelFetch[el.dataset.id];await refreshState();renderModels();toast('삭제했어요');});},
 'test-provider':async el=>{const id=el.dataset.id;S.tests[id]={pending:true};renderModels();try{const r=await api(`/api/providers/${enc(id)}/test`,{method:'POST',body:{}});S.tests[id]=r;if(r.models?.length)S.models[id]=r.models;}catch(err){S.tests[id]={ok:false,message:err.message};}if(S.view==='models')renderModels();},
 'use-provider':el=>{const p=providerById(el.dataset.id);if(!p)return;S.providerId=p.id;S.model=p.model||'';newChat();},
 'add-skill':()=>editSkill(),
 'edit-skill':el=>editSkill(el.dataset.id),
 'delete-skill':el=>confirmDialog('스킬을 삭제할까요?','이 스킬의 지침이 지워져요.','삭제',async()=>{await api(`/api/skills/${enc(el.dataset.id)}`,{method:'DELETE'});await refreshState();renderSkills();toast('삭제했어요');}),
 'skill-toggle':async el=>{const s=S.data.skills.find(x=>String(x.id)===el.dataset.id);if(!s)return;el.setAttribute('aria-checked',String(!s.enabled));try{await api('/api/skills',{method:'POST',body:{...s,enabled:!s.enabled}});await refreshState();renderSkills();}catch(err){toast(err.message,true);renderSkills();}},
 'delete-memory':el=>confirmDialog('이 메모리를 지울까요?','앞으로의 대화에 더는 전달되지 않아요.','지우기',async()=>{await api(`/api/memories/${enc(el.dataset.id)}`,{method:'DELETE'});await refreshState();renderMemory();}),
 'theme':el=>{pref.set('theme',el.dataset.id);applyTheme();document.querySelectorAll('[data-act="theme"]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));},
 'pick-folder':async el=>{const path=await window.naruDesktop?.chooseDirectory?.();if(path)$(el.dataset.id).value=path;},
 'retry-boot':()=>boot(),
};
document.addEventListener('click',async ev=>{
 const el=ev.target.closest('[data-act],[data-session],[data-view],[data-approval],[data-artifact]');
 if(pop&&!ev.target.closest('.pop')&&(!el||el!==pop.anchor))closePop();
 const link=ev.target.closest('a[href^="http"]');
 if(link&&!el&&window.naruDesktop?.openExternal){ev.preventDefault();openExternal(link.href).catch(()=>{});return;}
 if(!el||el.closest('.pop'))return;
 try{
  if(el.dataset.act){if(ACT[el.dataset.act]){ev.preventDefault();await ACT[el.dataset.act](el,ev);}return;}
  if(el.dataset.session){await selectSession(el.dataset.session);return;}
  if(el.dataset.view){go(el.dataset.view);return;}
  if(el.dataset.artifact){await openArtifact(el.dataset.artifact);return;}
  if(el.dataset.approval){el.closest('.approve')?.querySelectorAll('button').forEach(b=>b.disabled=true);await api(`/api/approvals/${enc(el.dataset.approval)}`,{method:'POST',body:{decision:el.dataset.decision}});await loadDetail();return;}
 }catch(err){if(el.isConnected)el.disabled=false;toast(err.message||'작업을 마치지 못했어요.',true);if(el.dataset.approval)loadDetail().catch(()=>{});}
});
document.addEventListener('keydown',ev=>{
 const mod=ev.metaKey||ev.ctrlKey,k=ev.key.toLowerCase();
 if(ev.key==='Escape'){if(palette){closePalette();return;}if(pop){closePop();return;}closeSide();}
 if(!mod)return;
 if(k==='k'){ev.preventDefault();palette?closePalette():openPalette();}
 else if(k==='n'&&!$('dialog').open){ev.preventDefault();newChat();}
 else if(k==='\\'){ev.preventDefault();setSide(!S.sideHidden);}
 else if(k==='j'&&S.view==='chat'&&S.detail){ev.preventDefault();ACT.drawer();}
 else if(k===','){ev.preventDefault();go('settings');}
 else if(k==='.'&&runActive()){ev.preventDefault();document.querySelector('[data-act="stop"]')?.click();}
 else if(k==='enter'){const b=document.querySelector('.approve [data-decision="approve"]');if(b&&!b.disabled){ev.preventDefault();b.click();}}
});
window.addEventListener('resize',()=>{placePop();});
$('dialog').addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();});
$('preview').addEventListener('close',()=>{S.blobs.forEach(u=>URL.revokeObjectURL(u));S.blobs=[];});
for(const id of ['dialog','preview'])$(id).addEventListener('mousedown',ev=>{if(ev.target===$(id)){const r=$(id).getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)$(id).close();}});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>applyTheme());

// ---------- live updates ----------
let ticking=false,lastState=0;
async function tick(){
 if(ticking||!S.data||document.visibilityState==='hidden'&&!runActive())return;ticking=true;
 try{
  const sid=S.sid,epoch=S.epoch;
  if(S.view==='chat'&&sid&&S.detail&&runActive()){
   const live=await api(`/api/sessions/${enc(sid)}/live`);
   if(sid!==S.sid||epoch!==S.epoch)return;
   const run=latestRun();
   if(!live.run_id||live.status!==run.status||(live.rev!==S.detail.rev&&Date.now()-lastFull>450))await loadDetail();
   else if(live.run_id===run.id&&live.text!==S.live){S.live=live.text;paintLive();}
  }
  if(Object.keys(S.data.active||{}).length&&Date.now()-lastState>2200){lastState=Date.now();const before=JSON.stringify(S.data.active);await refreshState();if(JSON.stringify(S.data.active)!==before)renderSide();}
 }catch{}finally{ticking=false;}
}

// ---------- boot ----------
async function boot(){
 applyTheme();
 if(window.naruDesktop)document.documentElement.classList.add('desktop');
 $('app').classList.toggle('no-side',S.sideHidden);
 try{
  await refreshState();
  const last=pref.get('session','')||S.data.settings.last_session_id||'';
  if(last&&S.data.sessions.some(s=>s.id===last))await selectSession(last);else renderAll();
  if(!S.data.accounts)setTimeout(()=>loadAccounts(),400);setTimeout(()=>discoverModels(),500);
 }catch(err){
  $('main').innerHTML=`<div class="boot"><div><h2>Naru를 열지 못했어요</h2><p>${esc(err.message)}</p><button type="button" class="btn primary" data-act="retry-boot">다시 연결</button></div></div>`;
 }
}
if(globalThis.__NARU_TEST__){globalThis.NaruUI={markdown,inline,esc,lineDiff,stepLabel,splitAttachments,buildSteps,approvalHTML,detailHTML,modelMenuHTML,modelOptions,loadProviderModels,discoverModels,S};return;}
setInterval(tick,280);
boot();
})();
