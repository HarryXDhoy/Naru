/* Naru desktop client. The local server owns every durable record; this file renders and asks. */
(()=>{'use strict';
const tr=window.NaruI18n?.t||((s,...v)=>Array.isArray(s)?s.reduce((a,x,i)=>a+x+(i<v.length?v[i]:''),''):s);
const localeRefresh=[];
function localeLabels(factory){const value=factory();localeRefresh.push(()=>Object.assign(value,factory()));return value;}
const $=id=>document.getElementById(id);
const enc=encodeURIComponent;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const ACTIVE=['running','awaiting_approval','awaiting_user'];
const ACCOUNT_KINDS=['codex','claude_code','gemini_cli','copilot_cli'];
const ACCOUNT_NAMES={codex:'ChatGPT',claude_code:'Claude',gemini_cli:'Gemini',copilot_cli:'GitHub Copilot',openrouter:'OpenRouter'};
const KIND_LABEL=localeLabels(()=>({codex:tr('ChatGPT 계정'),claude_code:tr('Claude 계정'),gemini_cli:tr('Google 계정'),copilot_cli:tr('GitHub 계정'),responses:'OpenAI Responses',openai:tr('OpenAI 호환'),anthropic:'Anthropic API',gemini:'Gemini API',ollama:'Ollama'}));
const STATUS=localeLabels(()=>({running:tr('실행 중'),awaiting_approval:tr('승인 대기'),awaiting_user:tr('답변 대기'),completed:tr('완료'),failed:tr('실패'),cancelled:tr('중지됨'),interrupted:tr('중단됨')}));
const ATTACH_HEAD='\n\n다음은 사용자가 첨부한 참고 자료입니다.\n';
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const imageSource=image=>IMAGE_TYPES.has(image?.mime)&&typeof image.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)?`data:${image.mime};base64,${image.data}`:'';
const imageHTML=(images,cls='message-images')=>{const valid=(images||[]).filter(x=>imageSource(x));return valid.length?`<div class="${cls}">${valid.map(x=>`<img src="${imageSource(x)}" alt="${esc(x.name||tr('첨부 이미지'))}">`).join('')}</div>`:'';};
const TEXT_EXT=/\.(txt|md|markdown|csv|tsv|json|jsonl|py|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|ya?ml|xml|log|sh|zsh|sql|toml|ini|cfg|env\.example|swift|kt|go|rs|java|c|h|cc|cpp|hpp|rb|php|lua|r|tex)$/i;

const I={
 bolt:'<path d="M13.5 2.5 5 13h6l-.5 8.5L19 11h-6z"/>',
 compose:'<path d="M12 20h8"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 fork:'<circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="7" r="2"/><path d="M7 7v10M17 9v2a4 4 0 0 1-4 4H7"/>',
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
// Two separate settings: the theme (Naru's own, or a named design system) and light/dark (system, light, dark).
const STYLES=['defined','cursor','vercel','raycast'],MODES=['system','light','dark'],NATIVE_MODE={defined:'dark',cursor:'light',vercel:'light',raycast:'dark'};
function themePrefs(){let t=pref.get('theme','dark'),s=pref.get('style','naru');if(STYLES.includes(t)){s=t;t=NATIVE_MODE[t];pref.set('style',s);pref.set('theme',t);}if(!MODES.includes(t))t='system';if(!STYLES.includes(s))s='naru';return {mode:t,style:s};}
// Each named theme carries its own icon set (public/icon-sets.js); System/Light/Dark keep Naru's own icons.
const ICON_SET={defined:'phosphor-light',cursor:'phosphor-regular',vercel:'lucide',raycast:'phosphor-bold'};
const iconSet=()=>window.NaruIcons?.[ICON_SET[document.documentElement?.dataset?.style]];
const icon=(n,cls='')=>{const set=iconSet(),p=set?.icons?.[n];if(p)return `<svg class="${cls}" viewBox="${set.viewBox}" width="16" height="16" ${set.attrs} aria-hidden="true">${p}</svg>`;return `<svg class="${cls}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||I.bolt}</svg>`;};
const iconBtn=(n,label,act,id,extra='')=>`<button type="button" class="icon-btn" data-act="${act}"${id!==undefined?` data-id="${esc(id)}"`:''} title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(n)}</button>`;
const WORDMARK="<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"wordmark\" viewBox=\"0 0 101 20\" fill=\"currentColor\" role=\"img\" aria-label=\"naru\"><circle cx=\"2\" cy=\"2\" r=\"1.65\"/><circle cx=\"6\" cy=\"2\" r=\"1.65\"/><circle cx=\"10\" cy=\"2\" r=\"1.65\"/><circle cx=\"14\" cy=\"2\" r=\"1.65\"/><circle cx=\"2\" cy=\"6\" r=\"1.65\"/><circle cx=\"18\" cy=\"6\" r=\"1.65\"/><circle cx=\"2\" cy=\"10\" r=\"1.65\"/><circle cx=\"18\" cy=\"10\" r=\"1.65\"/><circle cx=\"2\" cy=\"14\" r=\"1.65\"/><circle cx=\"18\" cy=\"14\" r=\"1.65\"/><circle cx=\"2\" cy=\"18\" r=\"1.65\"/><circle cx=\"18\" cy=\"18\" r=\"1.65\"/><circle cx=\"33\" cy=\"2\" r=\"1.65\"/><circle cx=\"37\" cy=\"2\" r=\"1.65\"/><circle cx=\"41\" cy=\"2\" r=\"1.65\"/><circle cx=\"45\" cy=\"6\" r=\"1.65\"/><circle cx=\"33\" cy=\"10\" r=\"1.65\"/><circle cx=\"37\" cy=\"10\" r=\"1.65\"/><circle cx=\"41\" cy=\"10\" r=\"1.65\"/><circle cx=\"45\" cy=\"10\" r=\"1.65\"/><circle cx=\"29\" cy=\"14\" r=\"1.65\"/><circle cx=\"45\" cy=\"14\" r=\"1.65\"/><circle cx=\"33\" cy=\"18\" r=\"1.65\"/><circle cx=\"37\" cy=\"18\" r=\"1.65\"/><circle cx=\"41\" cy=\"18\" r=\"1.65\"/><circle cx=\"45\" cy=\"18\" r=\"1.65\"/><circle cx=\"56\" cy=\"2\" r=\"1.65\"/><circle cx=\"64\" cy=\"2\" r=\"1.65\"/><circle cx=\"68\" cy=\"2\" r=\"1.65\"/><circle cx=\"56\" cy=\"6\" r=\"1.65\"/><circle cx=\"60\" cy=\"6\" r=\"1.65\"/><circle cx=\"72\" cy=\"6\" r=\"1.65\"/><circle cx=\"56\" cy=\"10\" r=\"1.65\"/><circle cx=\"56\" cy=\"14\" r=\"1.65\"/><circle cx=\"56\" cy=\"18\" r=\"1.65\"/><circle cx=\"83\" cy=\"2\" r=\"1.65\"/><circle cx=\"99\" cy=\"2\" r=\"1.65\"/><circle cx=\"83\" cy=\"6\" r=\"1.65\"/><circle cx=\"99\" cy=\"6\" r=\"1.65\"/><circle cx=\"83\" cy=\"10\" r=\"1.65\"/><circle cx=\"99\" cy=\"10\" r=\"1.65\"/><circle cx=\"83\" cy=\"14\" r=\"1.65\"/><circle cx=\"95\" cy=\"14\" r=\"1.65\"/><circle cx=\"99\" cy=\"14\" r=\"1.65\"/><circle cx=\"87\" cy=\"18\" r=\"1.65\"/><circle cx=\"91\" cy=\"18\" r=\"1.65\"/><circle cx=\"99\" cy=\"18\" r=\"1.65\"/></svg>";
// HalftoneField shader from the user’s ego(lite) design-system bundle.
const HERO_VERT='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const HERO_FRAG= '#version 300 es\nprecision highp float;out vec4 o;uniform vec2 res;uniform float time;uniform vec2 mouse;uniform float lens,cell;' +
    'uniform vec3 c0,c1,c2,c3,c4,paperTone;uniform float lightTheme;' +
    'float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}' +
    'float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+1.),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}' +
    'vec3 pal(float t){t=fract(t);if(t<.2)return mix(c0,c1,t/.2);if(t<.4)return mix(c1,c2,(t-.2)/.2);if(t<.6)return mix(c2,c3,(t-.4)/.2);if(t<.8)return mix(c3,c4,(t-.6)/.2);return mix(c4,c0,(t-.8)/.2);}' +
    'vec3 fluid(vec2 p){float t=time*.05;vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)+t*.6),fbm(p+3.*q+vec2(8.3,2.8)));' +
    'float f=fbm(p+3.5*r);vec3 c=pal(f*1.6+r.x*.6);float dark=smoothstep(.2,.55,length(q-r)*1.4);return c*mix(.08,1.,dark)*(.6+.8*f);}' +
    'void main(){vec2 fc=gl_FragCoord.xy;vec2 uv=fc/res.y*2.2;vec2 m=mouse*vec2(res.x,res.y);' +

    'vec2 cid=floor(fc/cell);vec2 cc=(cid+.5)*cell;vec3 cs=fluid(cc/res.y*2.2);float lum=dot(cs,vec3(.3,.55,.15));' +
    'float r=cell*.5*clamp(sqrt(lum)*1.15,0.,1.);float d=length(fc-cc);float dotm=1.-smoothstep(r-1.,r,d);' +
    'vec3 ht=cs*1.15*dotm;' +
    'float ld=length(fc-m)/res.y;float L=lens*(1.-smoothstep(.14,.24,ld));' +
    'vec3 col=ht;if(L>.002)col=mix(ht,fluid(uv),L);vec3 paper=mix(paperTone,cs*.58,dotm);if(L>.002)paper=mix(paper,fluid(uv)*.58,L);o=vec4(mix(col,paper,lightTheme),1.);}';

const definedTheme=()=>document.documentElement?.dataset?.style==='defined';
let hero=null;
function heroColor(name,fallback){const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();const m=(v||fallback).match(/^#([0-9a-f]{6})/i);if(!m)return [1,1,1];const n=parseInt(m[1],16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function stopHero(){if(!hero)return;cancelAnimationFrame(hero.raf);hero.io?.disconnect();hero.ro?.disconnect();hero.mq?.removeEventListener?.('change',hero.recolor);hero.reduce?.removeEventListener?.('change',hero.motionChange);hero.box.removeEventListener('pointermove',hero.pointerMove);hero.box.removeEventListener('pointerleave',hero.pointerLeave);hero.canvas.removeEventListener('webglcontextlost',hero.contextLost);document.removeEventListener('visibilitychange',hero.visibilityChange);window.removeEventListener('resize',hero.resize);try{hero.gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}hero=null;}
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
 const uniforms={};for(const name of ['c0','c1','c2','c3','c4','paperTone','res','time','mouse','lens','cell','lightTheme'])uniforms[name]=gl.getUniformLocation(prog,name);
 const U=n=>uniforms[n];
 box.appendChild(canvas);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const h={box,canvas,gl,reduce,raf:0,visible:true,mouse:[.5,.5],target:[.5,.5],lens:0,targetLens:0,t0:performance.now()};hero=h;
 h.recolor=()=>{for(const [i,name,fallback] of [[0,'--fluid-ultramarine','#1f3dff'],[1,'--fluid-cyan','#29c8ff'],[2,'--fluid-lime','#b8f53a'],[3,'--fluid-amber','#ffa41f'],[4,'--fluid-magenta','#ff3fd2']])gl.uniform3fv(U('c'+i),heroColor(name,fallback));gl.uniform3fv(U('paperTone'),heroColor('--hero-paper','#f5f7fc'));gl.uniform1f(U('lightTheme'),getComputedStyle(document.documentElement).colorScheme==='light'?1:0);draw(performance.now());};
 const size=()=>{const dpr=Math.min(2,devicePixelRatio||1),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),ht=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==ht){canvas.width=w;canvas.height=ht;gl.viewport(0,0,w,ht);}gl.uniform2f(U('res'),w,ht);gl.uniform1f(U('cell'),9*dpr);};
 function draw(now){if(hero!==h)return;if(reduce.matches){h.mouse[0]=.5;h.mouse[1]=.5;h.lens=0;}else{h.mouse[0]+=(h.target[0]-h.mouse[0])*.12;h.mouse[1]+=(h.target[1]-h.mouse[1])*.12;h.lens+=(h.targetLens-h.lens)*.08;}gl.uniform1f(U('time'),reduce.matches?8:8+(now-h.t0)/1000);gl.uniform2f(U('mouse'),h.mouse[0],h.mouse[1]);gl.uniform1f(U('lens'),h.lens);gl.drawArrays(gl.TRIANGLES,0,3);}
 const loop=now=>{if(hero!==h)return;draw(now);if(h.visible&&!reduce.matches&&document.visibilityState!=='hidden')h.raf=requestAnimationFrame(loop);else h.raf=0;};
 h.kick=()=>{if(!h.raf&&hero===h&&h.visible&&document.visibilityState!=='hidden')h.raf=requestAnimationFrame(loop);};
 h.pointerMove=ev=>{if(reduce.matches)return;const r=box.getBoundingClientRect();if(!r.width||!r.height)return;h.target[0]=(ev.clientX-r.left)/r.width;h.target[1]=1-(ev.clientY-r.top)/r.height;h.targetLens=1;h.kick();};
 h.pointerLeave=()=>{h.targetLens=0;h.kick();};
 h.visibilityChange=()=>{if(document.visibilityState!=='hidden')h.kick();};
 h.motionChange=()=>{h.target[0]=.5;h.target[1]=.5;h.targetLens=0;draw(performance.now());h.kick();};
 h.resize=()=>{size();if(!h.raf)draw(performance.now());};
 h.contextLost=()=>{if(hero!==h)return;stopHero();canvas.remove();box.classList.remove('live');};
 box.addEventListener('pointermove',h.pointerMove);box.addEventListener('pointerleave',h.pointerLeave);canvas.addEventListener('webglcontextlost',h.contextLost);document.addEventListener('visibilitychange',h.visibilityChange);reduce.addEventListener?.('change',h.motionChange);
 if('IntersectionObserver' in window){h.io=new IntersectionObserver(es=>{h.visible=es[0].isIntersecting;h.kick();});h.io.observe(canvas);}
 if('ResizeObserver' in window){h.ro=new ResizeObserver(h.resize);h.ro.observe(canvas);}else window.addEventListener('resize',h.resize);
 h.mq=matchMedia('(prefers-color-scheme: dark)');h.mq.addEventListener?.('change',h.recolor);
 box.classList.add('live');size();h.recolor();h.kick();
}
const pref={get(k,d){try{const native=window.naruDesktop?.getPreference?.(k);if(native!=null)return native;const v=localStorage.getItem('naru.'+k);if(v!==null)window.naruDesktop?.setPreference?.(k,v);return v===null?d:v;}catch{return d;}},set(k,v){try{v=v==null?null:String(v);if(window.naruDesktop?.setPreference?.(k,v)===false)toast(tr('화면 설정을 저장하지 못했어요. 앱 데이터 폴더 권한을 확인하세요.'),true);v===null?localStorage.removeItem('naru.'+k):localStorage.setItem('naru.'+k,v);}catch{}}};
const S={data:null,accounts:null,view:'chat',sid:null,detail:null,live:'',providerId:'',model:'',mode:'chat',newAccess:'inherit',newAccessRevision:0,accessSaving:false,newReasoning:'default',newReasoningRevision:0,reasoningSaving:false,modelSaving:false,modeSaving:false,modeSaveSid:null,skillIds:[],drafts:{},files:{},imageModes:{},sending:false,drawer:pref.get('drawer','0')==='1',sideHidden:pref.get('side','1')==='0',open:new Set(),steps:new Set(),models:{},modelFetch:{},epoch:0,codes:[],msgs:new Map(),tests:{},watch:null,blobs:[]};

// ---------- utilities ----------
let toastTimer;
function toast(msg,bad=false,action=null){msg=tr(msg);const t=$('toast');if(!t)return;t.textContent=msg;if(action&&t.appendChild&&document.createElement){const b=document.createElement('button');b.type='button';b.className='act';b.textContent=tr(action.label);b.addEventListener('click',()=>{t.classList.remove('show');action.run();});t.appendChild(b);}t.classList.toggle('has-act',!!action);t.classList.toggle('bad',bad);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),action?7000:bad?6500:3200);}
async function api(path,{method='GET',body,timeout}={}){
 const headers={Accept:'application/json'};
 if(method!=='GET'){headers['Content-Type']='application/json';headers['X-Naru-Token']=S.data?.csrf_token||'';}
 const signal=timeout&&globalThis.AbortSignal?.timeout?AbortSignal.timeout(timeout):undefined;
 let res;try{res=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',signal});}catch{throw new Error(tr('Naru 로컬 서버에 연결할 수 없어요. 앱을 다시 열어 주세요.'));}
 let data;try{data=await res.json();}catch{throw new Error(tr`서버 응답을 읽지 못했어요 (${res.status}).`);}
 if(!res.ok)throw new Error(tr(data.error)||tr`요청이 실패했어요 (${res.status}).`);
 return data;
}
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':(n||0)+' B';
const base=p=>String(p||'').split(/[\\/]/).filter(Boolean).pop()||String(p||'');
const host=u=>{try{return new URL(u).host;}catch{return u||'';}};
function duration(run){if(!run?.finished_at||!run.started_at)return '';const s=Math.max(0,Math.round((new Date(run.finished_at)-new Date(run.started_at))/1000));return s<60?tr`${s}초`:tr`${Math.floor(s/60)}분 ${s%60}초`;}
async function copyText(text,msg=tr('복사했어요')){try{await navigator.clipboard.writeText(text);toast(msg);}catch{toast(tr('클립보드에 접근할 수 없어요.'),true);}}
async function openExternal(url){if(window.naruDesktop?.openExternal)await window.naruDesktop.openExternal(url);else window.open(url,'_blank','noopener');}
const providers=()=>S.data?.providers||[];
const providerById=id=>providers().find(p=>String(p.id)===String(id));
const provider=()=>providerById(S.providerId);
const isAccount=p=>!!p&&(ACCOUNT_KINDS.includes(p.kind)||p.account==='openrouter');
function accountOf(p){const a=S.accounts||S.data?.accounts;if(!a||!p)return null;return p.account==='openrouter'?a.openrouter:(a[p.kind]||null);}
function modelLabel(){const p=provider();if(!p)return tr('모델 선택');const m=S.model||p.model;if(!m)return p.name;return isAccount(p)&&p.account!=='openrouter'?`${p.name} ${m}`:m;}
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
  if(fence){flush();close();const body=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i])){body.push(lines[i]);i++;}i++;const code=body.join('\n');S.codes.push(code);html+=tr`<div class="code"><div class="code-head"><span>${esc(fence[1]||'')}</span><button type="button" class="icon-btn" data-act="copy-code" data-id="${S.codes.length-1}" title="복사" aria-label="코드 복사">${icon('copy')}</button></div><pre><code>${esc(code)}</code></pre></div>`;continue;}
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
function applyTheme(){const {mode,style}=themePrefs(),root=document.documentElement;if(mode==='system')delete root.dataset.theme;else root.dataset.theme=mode;root.dataset.mode=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;if(style==='naru')delete root.dataset.style;else root.dataset.style=style;try{window.naruDesktop?.setTheme?.(mode)?.catch?.(()=>{});}catch{}if(hero)hero.recolor();}
function setSide(hidden){S.sideHidden=hidden;pref.set('side',hidden?'0':'1');$('app').classList.toggle('no-side',hidden);renderTop();}
function closeSide(){$('app').classList.remove('side-open');}
function go(view){S.view=view;closePop();closeSide();renderAll();$('main').focus({preventScroll:true});}
function renderAll(){renderSide();renderTop();renderMain();}

function renderSide(){
 const d=S.data;if(!d)return;const active=d.active||{};
 const nav=[['models','plug',tr('모델')],['skills','skill',tr('스킬')],['workflows','bolt',tr('작업 흐름')],['memory','memory',tr('메모리')],['settings','settings',tr('설정')]];
 $('side').innerHTML=tr`<div class="side-top">${WORDMARK}<span class="grow"></span>${iconBtn('sidebar',tr('사이드바 숨기기 (⌘\\)'),'toggle-side')}</div>
 <button type="button" class="side-item strong" data-act="new" title="새 대화 (⌘N)">${icon('compose')}<span>새 대화</span></button>
 <button type="button" class="side-item" data-act="palette" title="검색 (⌘K)">${icon('search')}<span>검색</span></button>
 <nav class="sessions" aria-label="최근 대화">${d.sessions.map(s=>{const st=active[s.id],title=s.title||tr('새 대화');return tr`<div class="session-row"><button type="button" class="side-item" data-session="${esc(s.id)}" title="${esc(title)}"${S.view==='chat'&&S.sid===s.id?' aria-current="page"':''}><span>${esc(title)}</span>${st?`<i class="dot ${['awaiting_approval','awaiting_user'].includes(st)?'att':''}" role="img" aria-label="${['awaiting_approval','awaiting_user'].includes(st)?tr('확인 필요'):tr('실행 중')}"></i>`:''}</button><button type="button" class="icon-btn session-delete" data-act="delete-chat" data-id="${esc(s.id)}" title="대화 삭제" aria-label="${esc(title)} 대화 삭제">${icon('trash')}</button></div>`;}).join('')}</nav>
 <nav class="side-nav" aria-label="관리">${S.update?.status==='ready'?tr`<button type="button" class="side-item update-ready" data-view="settings">${icon('download')}<span>업데이트 준비됨</span></button>`:''}${nav.map(([v,ic,t])=>`<button type="button" class="side-item" data-view="${v}"${S.view===v?' aria-current="page"':''}>${icon(ic)}<span>${t}</span></button>`).join('')}</nav>`;
}
let renaming=null;
function renderTop(){
 const t=$('top');if(!t)return;
 if(renaming&&S.view==='chat'&&renaming.sid===S.sid&&renaming.epoch===S.epoch)return;
 let html=tr`<button type="button" class="icon-btn menu-btn" data-act="open-side" aria-label="메뉴 열기">${icon('menu')}</button>`;
 if(S.sideHidden)html+=iconBtn('sidebar',tr('사이드바 보기 (⌘\\)'),'toggle-side');
 const s=S.view==='chat'?S.detail?.session:null;
 html+=s?tr`<button type="button" class="top-title" id="top-title" data-act="rename" title="이름 바꾸기">${esc(s.title)}</button>`:'<span class="top-title"></span>';
 const lr=s?latestRun():null;
 if(lr&&ACTIVE.includes(lr.status))html+=['awaiting_approval','awaiting_user'].includes(lr.status)?tr('<span class="badge attention">확인 필요</span>'):tr('<span class="badge running"><i></i>실행 중</span>');
 html+='<span class="grow"></span>';
 if(S.update?.status==='ready')html+=iconBtn('download',tr('업데이트 준비됨'),'update-open');
 if(s){const n=S.detail.artifacts?.length||0;html+=tr`<button type="button" class="icon-btn ${S.drawer?'on':''}" data-act="drawer" title="파일과 실행 정보 (⌘J)" aria-label="파일과 실행 정보" aria-pressed="${S.drawer}">${icon('files')}${n?`<span class="count">${n}</span>`:''}</button>${iconBtn('more',tr('대화 메뉴'),'chat-menu')}`;}
 t.innerHTML=html;
}
function renderMain(){hideSelectionReply();if(S.view!=='chat')stopHero();if(S.view==='chat')renderChat();else if(S.view==='models')renderModels();else if(S.view==='skills')renderSkills();else if(S.view==='workflows')renderWorkflows();else if(S.view==='memory')renderMemory();else renderSettings();}

// ---------- chat ----------
function renderChat(){
 stopHero();
 $('main').innerHTML=tr`<div class="chat" id="chat"><div class="hero" id="hero" hidden><div class="hero-pattern" aria-hidden="true"><span></span></div><h1 class="hero-title">무엇을 할까요?</h1></div><div class="thread" id="thread"><div class="col" id="col"></div></div><div class="dock"><div id="message-queue" hidden></div><form class="composer" id="composer" autocomplete="off"><div class="files-row" id="file-chips" hidden></div><label class="sr" for="input">메시지</label><textarea id="input" rows="1" placeholder="메시지 입력" spellcheck="false"></textarea><div class="tools" id="tools"></div><input type="file" id="file-input" multiple hidden></form></div></div><aside class="drawer ${S.drawer&&S.detail?'open':''}" id="drawer" aria-label="파일과 실행 정보"><div class="drawer-in" id="drawer-in"></div></aside>`;
 const input=$('input');input.value=S.drafts[draftKey()]||'';autosize();
 wireComposer();renderTools();renderChips();renderQueue();renderThread(true);renderDrawer();
}
function autosize(){const el=$('input');if(!el)return;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,240)+'px';}
const queuePending=()=>S.detail?.queue||[];
const followupModes={},steeringAttempts={};
const steeringMode=()=>!!S.sid&&runActive()&&followupModes[S.sid]?.mode==='steer'&&followupModes[S.sid]?.runId===latestRun()?.id;
const canSteer=()=>!!latestRun()?.steer_supported&&latestRun()?.status==='running'&&!latestRun()?.create_image;
const hasSteerRetry=()=>!!S.sid&&!!steeringAttempts[S.sid]&&steeringAttempts[S.sid].rawText===($('input')?.value||'');
const enqueueMode=()=>runActive()||queuePending().length>0;
const REASONING_LABELS=localeLabels(()=>({default:tr('기본'),none:tr('꺼짐'),minimal:tr('최소'),low:tr('낮음'),medium:tr('보통'),high:tr('높음'),xhigh:tr('매우 높음'),max:'Max',ultra:'Ultra'}));
const reasoningValues={},reasoningVersions={},modelValues={},modelVersions={},modeValues={},modeVersions={};
const reasoningEligible=p=>!!p&&(p.kind==='codex'||(p.kind==='openai'&&String(p.base_url||'').replace(/\/+$/,'')==='https://openrouter.ai/api/v1'));
function sessionReasoning(){return S.sid?(S.detail?.session?.reasoning_effort||reasoningValues[S.sid]||S.data?.sessions?.find(s=>s.id===S.sid)?.reasoning_effort||'default'):(S.newReasoning||'default');}
const ACCESS_LABELS=localeLabels(()=>({manual:tr('매번 승인'),auto_approve:tr('자동 승인'),full_access:tr('전체 접근')}));
function sessionAccess(){return S.sid?(S.detail?.session?.access_mode||accessValues[S.sid]||S.data?.sessions?.find(s=>s.id===S.sid)?.access_mode||'inherit'):(S.newAccess||'inherit');}
function accessLabel(){const mode=sessionAccess(),effective=mode==='inherit'?(S.data?.settings?.access_mode||'manual'):mode;return `${mode==='inherit'?tr('기본 · '):''}${ACCESS_LABELS[effective]||ACCESS_LABELS.manual}`;}
const fileReads={};
const canSend=()=>!S.sending&&!S.accessSaving&&!S.reasoningSaving&&!S.modelSaving&&!S.modeSaving&&(!steeringMode()||canSteer()||(hasSteerRetry()&&steeringAttempts[S.sid].runId===latestRun()?.id))&&!fileReads[draftKey()]&&!!(($('input')?.value||'').trim()||attachments().length);
function syncSend(){const b=$('send');if(b)b.disabled=!canSend();}
function wireComposer(){
 const input=$('input'),form=$('composer');
 input.addEventListener('input',()=>{const changed=S.sid&&steeringAttempts[S.sid]&&steeringAttempts[S.sid].rawText!==input.value;if(changed)delete steeringAttempts[S.sid];S.drafts[draftKey()]=input.value;autosize();syncSend();if(changed)renderTools();updateFileMention(input);});
 input.addEventListener('click',()=>updateFileMention(input));
 input.addEventListener('keydown',ev=>{if(fileMentionKey(ev))return;if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing&&ev.keyCode!==229){ev.preventDefault();send();}});
 form.addEventListener('submit',ev=>{ev.preventDefault();send();});
 $('file-input').addEventListener('change',ev=>{addFiles([...ev.target.files]);ev.target.value='';});
 form.addEventListener('dragover',ev=>{if([...ev.dataTransfer.types].includes('Files')){ev.preventDefault();form.classList.add('drag');}});
 form.addEventListener('dragleave',()=>form.classList.remove('drag'));
 form.addEventListener('drop',ev=>{ev.preventDefault();form.classList.remove('drag');addFiles([...ev.dataTransfer.files]);});
 input.addEventListener('paste',ev=>{const files=[...(ev.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(files.length)addFiles(files);});
}
function renderTools(){
 const el=$('tools');if(!el)return;const active=runActive(),sk=selectedSkills();
 el.innerHTML=tr`${iconBtn('clip',tr('파일 첨부'),'attach')}
 <button type="button" class="chip ${S.imageModes[draftKey()]?'on':''}" data-act="image-mode" aria-pressed="${!!S.imageModes[draftKey()]}" title="이미지 만들기"${S.sending||S.mode==='plan'?' disabled':''}>${icon('image')}<span>${S.imageModes[draftKey()]?tr('이미지 · ')+esc(S.imageModes[draftKey()].model==='__default__'?'ChatGPT':S.imageModes[draftKey()].model):tr('이미지 만들기')}</span></button>
 <button type="button" class="chip" id="model-chip" data-act="model-menu" aria-haspopup="dialog" title="모델 바꾸기"${active||S.modelSaving||S.reasoningSaving?' disabled':''}><span>${esc(modelLabel())}</span>${icon('caret','caret')}</button>
 <button type="button" class="chip reasoning-chip ${sessionReasoning()!=='default'?'on':''}" id="reasoning-chip" data-act="reasoning-menu" aria-haspopup="dialog" aria-label="추론 강도: ${esc(REASONING_LABELS[sessionReasoning()]||tr('기본'))}" title="추론 강도"${(!reasoningEligible(provider())||S.imageModes[draftKey()]||S.sending||S.reasoningSaving||S.modelSaving||(S.sid&&!S.detail))?' disabled':''}>${icon('bolt')}<span>${esc(REASONING_LABELS[sessionReasoning()]||tr('기본'))}</span>${icon('caret','caret')}</button>
 ${hasSteerRetry()&&!S.sending?tr`<div class="seg" role="group" aria-label="추가 지시 전송 확인"><button type="button" aria-pressed="true" title="같은 요청을 다시 확인해요">전송 재확인</button><button type="button" data-act="followup-mode" data-mode="${active?'queue':'new'}">${active?tr('대기열'):tr('새 메시지')}</button></div>`:active?tr`<div class="seg" role="group" aria-label="진행 중 메시지 방식"><button type="button" data-act="followup-mode" data-mode="steer" aria-pressed="${steeringMode()}"${!canSteer()||S.sending?' disabled':''} title="${canSteer()?tr('다음 모델 호출에서 추가 지시를 반영해요'):tr('현재 작업은 대기열만 지원해요')}">추가 지시</button><button type="button" data-act="followup-mode" data-mode="queue" aria-pressed="${!steeringMode()}"${S.sending?' disabled':''} title="현재 작업이 끝나면 새 메시지로 실행해요">대기열</button></div>`:tr`<div class="seg" role="group" aria-label="작업 방식"><button type="button" data-act="mode" data-mode="chat" aria-pressed="${S.mode==='chat'}"${S.modeSaving||S.sending?' disabled':''} title="파일이나 명령을 건드리지 않아요">대화</button><button type="button" data-act="mode" data-mode="agent" aria-pressed="${S.mode==='agent'}"${S.modeSaving||S.sending?' disabled':''} title="파일을 읽고 바꿀 수 있어요. 도구 승인 방식은 설정에서 정해요">에이전트</button><button type="button" data-act="mode" data-mode="plan" aria-pressed="${S.mode==='plan'}"${S.modeSaving||S.sending?' disabled':''} title="읽고 조사한 뒤 계획을 세워요">계획</button></div>`}
 <button type="button" class="chip ${sk.length?'on':''}" id="skill-chip" data-act="skills-menu" aria-haspopup="menu" title="스킬" aria-label="스킬">${icon('skill')}${sk.length?`<span>${sk.length===1?esc(sk[0].name):sk.length+tr('개')}</span>`:''}</button>
 <button type="button" class="chip access-chip" data-act="session-access" aria-haspopup="dialog" aria-label="이 대화의 도구 승인: ${esc(accessLabel())}" title="이 대화의 도구 승인"${S.sending||S.accessSaving||(S.sid&&!S.detail)?' disabled':''}><span>${esc(accessLabel())}</span>${icon('caret','caret')}</button>
 ${hasSteerRetry()&&!S.sending?tr('<span class="followup-hint">전송 여부를 다시 확인해 주세요</span>'):steeringMode()?`<span class="followup-hint">${canSteer()?tr('다음 모델 호출 때 전달 · 실행 중인 도구는 계속'):tr('지금은 추가 지시를 받을 수 없어요')}</span>`:''}
 <span class="grow"></span>
 ${active?tr`<button type="button" class="send stop" data-act="stop" title="중지 (⌘.)" aria-label="중지">${icon('stop')}</button>`:''}<button type="submit" class="send" id="send" title="${hasSteerRetry()&&!S.sending?tr('추가 지시 전송 재확인'):steeringMode()?tr('추가 지시 보내기'):enqueueMode()?tr('대기열에 추가'):tr('보내기')}" aria-label="${hasSteerRetry()&&!S.sending?tr('추가 지시 전송 재확인'):steeringMode()?tr('추가 지시 보내기'):enqueueMode()?tr('대기열에 추가'):tr('보내기')}"${canSend()?'':' disabled'}>${icon('up')}</button>`; if(pop&&pop.anchor?.id==='reasoning-chip'){pop.anchor=$('reasoning-chip');placePop();}
}
function queueHTML(items,paused,active,error){
 if(!items.length)return '';
 return tr`<section class="message-queue" aria-label="대기 메시지"><div class="queue-head"><strong>대기 메시지 ${items.length}</strong>${paused?tr('<span>일시정지됨</span>'):''}${paused&&!active?tr('<button type="button" class="btn" data-act="queue-resume">계속</button>'):''}</div>${error?`<p class="queue-error" role="alert">${esc(error)}</p>`:''}<ol class="queue-list">${items.map((item,i)=>{const parts=splitAttachments(item.content);return `<li class="queue-item"><span class="queue-number">${i+1}</span><div class="queue-content">${item.create_image?tr('<div class="queue-files">이미지 만들기</div>'):''}<div class="queue-text">${esc(parts.text)}</div>${parts.files.length?tr`<div class="queue-files">첨부: ${parts.files.map(esc).join(', ')}</div>`:''}${imageHTML(item.images,'queue-images')}</div><div class="queue-actions">${iconBtn('edit',tr('대기 메시지 편집'),'queue-edit',item.id)}${iconBtn('x',tr('대기 메시지 삭제'),'queue-remove',item.id)}</div></li>`;}).join('')}</ol></section>`;
}
function renderQueue(){const el=$('message-queue');if(!el)return;const items=queuePending();el.hidden=!items.length;el.innerHTML=queueHTML(items,!!S.detail?.queue_paused,runActive(),S.detail?.queue_error);}
function renderChips(){
 const el=$('file-chips');if(!el)return;const files=attachments();el.hidden=!files.length;
 el.innerHTML=files.map((f,i)=>tr`<span class="file-chip" title="${esc(f.name)}">${f.mime?`<img src="${imageSource(f)}" alt="">`:icon('doc')}<span>${esc(f.name)}</span><button type="button" data-act="remove-file" data-id="${i}" aria-label="${esc(f.name)} 빼기">${icon('x')}</button></span>`).join('')+(files.some(f=>f.mime)?tr('<span class="image-note">이미지는 저장되며 이후 대화에서도 모델 제공자에게 전달될 수 있어요.</span>'):'');
 syncSend();
}
async function addFiles(list){
 const key=draftKey();if(!list.length)return;
 fileReads[key]=(fileReads[key]||0)+1;syncSend();
 try{
  const added=[];
  for(const file of list){
   if(file.type?.startsWith('image/')){
    if(!IMAGE_TYPES.has(file.type))throw new Error(tr`${file.name}: PNG, JPEG, WebP 또는 GIF 이미지를 사용해 주세요.`);
    if(!file.size||file.size>4*1024*1024)throw new Error(tr`${file.name}: 이미지는 비어 있지 않아야 하고 합쳐서 4 MB 이하여야 해요.`);
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader(),fail=()=>reject(new Error(tr`${file.name}: 이미지를 읽지 못했어요.`));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=fail;reader.onabort=fail;reader.readAsDataURL(file);});
    added.push({name:file.name||tr('이미지'),size:file.size,mime:file.type,data});continue;
   }
   if(!TEXT_EXT.test(file.name))throw new Error(tr`${file.name}: 텍스트 파일만 첨부할 수 있어요.`);
   if(file.size>600*1024)throw new Error(tr`${file.name}: 600 KB 이하 파일만 첨부할 수 있어요.`);
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error(tr`${file.name}: UTF-8 텍스트가 아니에요.`);}
   if(text.includes('\u0000'))throw new Error(tr`${file.name}: 텍스트 파일이 아니에요.`);
   added.push({name:file.name,size:file.size,text});
  }
  const current=[...(S.files[key]||[]),...added],images=current.filter(f=>f.mime);
  if(current.length>5)throw new Error(tr('파일은 한 번에 5개까지 첨부할 수 있어요.'));
  if(images.length>4||images.reduce((n,f)=>n+f.size,0)>4*1024*1024)throw new Error(tr('이미지는 4개까지, 합쳐서 4 MB 이하여야 해요.'));
  if(current.reduce((n,f)=>n+(f.text?.length||0),0)>90000)throw new Error(tr('첨부 내용은 합쳐서 90,000자 이하여야 해요.'));
  S.files[key]=current;if(draftKey()===key)renderChips();
 }catch(err){toast(err.message,true);}finally{fileReads[key]--;if(!fileReads[key])delete fileReads[key];if(draftKey()===key)syncSend();}
}

function renderThread(toBottom=false){
 const col=$('col'),chat=$('chat'),scroll=$('thread');if(!col)return;
 const d=S.detail,empty=!d||(!d.messages.length&&!d.runs.length);
 const blank=!S.sid&&empty;setEmpty(blank);
 if(!d||empty){col.innerHTML='';return;}
 const near=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<140;
 S.codes=[];S.msgs.clear();
 const shown=d.messages.filter(m=>!(m.kind==='clarification'&&m.run_id&&d.runs.some(r=>r.id===m.run_id)));
 const items=[...shown.map(m=>({t:m.created_at,k:0,v:m})),...d.runs.map(r=>({t:r.started_at,k:1,v:r}))].sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:a.k-b.k);
 const lastAssistant=[...shown].reverse().find(m=>m.role==='assistant');
 const lastMsg=shown[shown.length-1];const latest=latestRun();
 chat.classList.toggle('agent-running',['agent','plan'].includes(latest?.mode)&&latest?.status==='running');
 const focused=document.activeElement?.matches?.('[data-question-input]')?document.activeElement:null,focusId=focused?.dataset.questionInput,selection=focused?[focused.selectionStart,focused.selectionEnd]:null;
 col.innerHTML=items.map(it=>it.k===0?messageHTML(it.v,it.v===lastAssistant&&it.v===lastMsg&&!runActive()):runHTML(it.v,it.v===latest)).join('');
 if(focusId){const input=col.querySelector(`[data-question-input="${CSS.escape(focusId)}"]`);if(input){input.focus();if(selection)input.setSelectionRange(selection[0],selection[1]);}}
 if(toBottom||near)scroll.scrollTop=scroll.scrollHeight;
}
function setEmpty(on){
 const chat=$('chat'),h=$('hero');if(!chat||!h)return;
 chat.classList.toggle('empty',on);h.hidden=!on;
 if(on)startHero(h);else if(hero&&h.contains(hero.canvas)){stopHero();h.querySelector('canvas')?.remove();h.classList.remove('live');}
}
function messageHTML(m,isLast){
 S.msgs.set(String(m.id),m.content);
 if(m.role==='user'){const {text,files}=splitAttachments(m.content);const steer=m.kind==='steering'?(S.detail?.steering||[]).find(x=>String(x.id)===String(m.steering_id)):null,run=steer?(S.detail?.runs||[]).find(r=>r.id===steer.run_id):null,label=steer?(steer.status==='applied'?tr('모델에 전달됨'):run&&ACTIVE.includes(run.status)?tr('반영 대기'):tr('미반영')):'';return `<div class="u">${iconBtn('fork',tr('여기서 새 대화로 분기'),'fork-message',m.id)}<div class="bubble"><span class="selectable-message">${esc(text.trim())}</span>${imageHTML(m.images)}${files.length?`<span class="att">${files.map(esc).join(', ')}</span>`:''}${label?tr`<span class="steer-state">추가 지시 · ${label}</span>`:''}</div></div>`;}
 const images=(S.detail?.artifacts||[]).filter(a=>a.image_generated&&String(a.message_id||'')===String(m.id));
 return `<article class="a ${isLast?'last':''}"><div class="md selectable-message">${markdown(m.content)}</div>${generatedImageList(images)}<div class="acts">${iconBtn('copy',tr('복사'),'copy-msg',m.id)}${isLast&&!m.create_image?iconBtn('retry',tr('다시 답하기'),'regenerate',m.id):''}${iconBtn('fork',tr('여기서 새 대화로 분기'),'fork-message',m.id)}${iconBtn('memory',tr('메모리로 저장'),'save-memory',m.id)}${iconBtn('skill',tr('스킬로 저장'),'save-skill',m.id)}</div></article>`;
}
let selectionReply=null,selectionButton=null;
function hideSelectionReply(){selectionReply=null;if(selectionButton)selectionButton.hidden=true;}
function showSelectionReply(){
 const selection=window.getSelection?.(),col=$('col');
 if(S.view!=='chat'||!S.sid||!col||!selection||selection.isCollapsed||!selection.rangeCount){hideSelectionReply();return;}
 const container=node=>(node?.nodeType===1?node:node?.parentElement)?.closest?.('.selectable-message');
 const start=container(selection.anchorNode),end=container(selection.focusNode),text=String(selection).trim();
 if(!text||!start||start!==end||!col.contains(start)){hideSelectionReply();return;}
 const rect=selection.getRangeAt(0).getBoundingClientRect();
 if(!selectionButton){
  selectionButton=document.createElement('button');selectionButton.type='button';selectionButton.className='selection-reply';selectionButton.textContent=tr('답장');selectionButton.setAttribute('aria-label',tr('선택한 내용에 답장'));
  selectionButton.addEventListener('pointerdown',ev=>ev.preventDefault());selectionButton.addEventListener('click',replyToSelection);document.body.appendChild(selectionButton);
 }
 selectionReply={text,sid:S.sid,epoch:S.epoch};selectionButton.hidden=false;
 const width=selectionButton.offsetWidth||64,height=selectionButton.offsetHeight||32;
 selectionButton.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left+(rect.width-width)/2))+'px';
 selectionButton.style.top=Math.max(8,Math.min(innerHeight-height-8,rect.top>=height+8?rect.top-height-6:rect.bottom+6))+'px';
}
function replyToSelection(){
 const reply=selectionReply,input=$('input');hideSelectionReply();
 if(!reply||S.view!=='chat'||reply.sid!==S.sid||reply.epoch!==S.epoch||!input)return;
 const quote=reply.text.replace(/\r\n?/g,'\n').split('\n').map(line=>'> '+line).join('\n');
 input.value=quote+'\n\n'+input.value;S.drafts[draftKey()]=input.value;autosize();syncSend();input.focus();input.setSelectionRange?.(input.value.length,input.value.length);
 window.getSelection?.()?.removeAllRanges();
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
  case 'load_skill':return {icon:'skill',what:tr('스킬 불러오기'),target:(S.data?.skills||[]).find(s=>String(s.id)===String(a.skill_id))?.name||a.skill_id||''};
  case 'read_skill_file':return {icon:'eye',what:tr('스킬 파일 읽기'),target:base(a.path)};
  case 'git_status':return {icon:'terminal',what:tr('Git 상태'),target:''};
  case 'git_diff':return {icon:'terminal',what:tr('변경 내용'),target:a.staged?tr('스테이징됨'):tr('작업 중')};
  case 'todo':return {icon:'check',what:tr('작업 목록'),target:'',note:Array.isArray(r?.items)?tr`${r.items.filter(i=>i.status==='completed').length}/${r.items.length} 완료`:''};
  case 'search_sessions':return {icon:'search',what:tr('이전 대화 검색'),target:a.query||'',note:Array.isArray(r?.matches)?tr`${r.matches.length}개`:''};
  case 'list_files':return {icon:'folder',what:tr('폴더 보기'),target:a.path&&a.path!=='.'?a.path:tr('작업 폴더'),note:r?.files?tr`${r.files.length}개`:''};
  case 'read_file':return {icon:'eye',what:tr('읽기'),target:base(a.path)};
  case 'search_files':return {icon:'search',what:tr('검색'),target:a.query||'',note:Array.isArray(r?.matches)?tr`${r.matches.length}곳`:''};
  case 'write_file':return {icon:'doc',what:a.overwrite?tr('덮어쓰기'):tr('만들기'),target:base(a.path)};
  case 'edit_file':return {icon:'pen',what:tr('수정'),target:base(a.path)};
  case 'run_command':case 'command_execution':return {icon:'terminal',what:tr('명령'),target:a.command||'',mono:true};
  case 'fetch_url':return {icon:'globe',what:tr('웹 읽기'),target:host(a.url)};
  case 'browser_search':case 'web_search':case 'web_search_call':return {icon:'search',what:tr('웹 검색'),target:a.query||''};
  case 'browser_read':return {icon:'globe',what:tr('브라우저'),target:host(a.url)};
  case 'ask_user':return {icon:'chat',what:tr('질문'),target:a.question||''};
  case 'file_change':return {icon:'pen',what:tr('파일 변경'),target:Array.isArray(a.changes)?a.changes.map(c=>base(c.path)).join(', '):''};
  default:return {icon:'bolt',what:name,target:''};
 }
}
const stepFailed=r=>!!r&&(!!r.error||r.status==='failed'||(typeof r.exit_code==='number'&&r.exit_code!==0));
function stepHTML(st){
 if(st.type==='note')return `<div class="note md">${markdown(st.text)}</div>`;
 const L=stepLabel(st.name,st.args,st.result),bad=stepFailed(st.result),denied=bad&&/거절/.test(String(st.result.error||''));
 const g=!st.done?tr('<span class="spinner" role="img" aria-label="진행 중"></span>'):icon(bad?'x':L.icon);
 const open=S.steps.has(st.id);
 return `<button type="button" class="step ${denied?'denied':bad?'err':''}" data-icon="${esc(L.icon)}" data-act="toggle-step" data-id="${esc(st.id)}" aria-expanded="${open}"><span class="g">${g}</span><span class="what">${esc(L.what)}</span><span class="target${L.mono?' mono':''}">${esc(L.target)}</span>${denied?tr('<span class="side-note">거절함</span>'):L.note?`<span class="side-note">${esc(L.note)}</span>`:''}</button>${open?`<div class="detail">${detailHTML(st)}</div>`:''}${st.name==='ask_user'&&st.result?.answer?`<div class="u qa-answer"><div class="bubble">${esc(st.result.answer)}</div></div>`:''}`;
}
function detailHTML(st){
 const a=st.args||{},r=st.result,out=[];
 if(st.name==='edit_file')out.push(tr`<div class="lbl">변경</div>${diffHTML(a.old_text||'',a.new_text||'')}`);
 else if(st.name==='write_file')out.push(`<div class="lbl">${esc(a.path||'')}</div><pre>${esc(String(a.content||'').slice(0,12000))}</pre>`);
 else if(st.name==='run_command'||st.name==='command_execution')out.push(`<pre>$ ${esc(a.command||'')}</pre>`);
 else if(Object.keys(a).length&&!['search_files','list_files','read_file','fetch_url','browser_search','browser_read'].includes(st.name))out.push(`<pre>${esc(JSON.stringify(a,null,2).slice(0,6000))}</pre>`);
 else if(['read_file','fetch_url','browser_read'].includes(st.name))out.push(`<div class="lbl">${esc(a.path||a.url||'')}</div>`);
 if(r){
  let text;
  if(r.error)text=r.error;else if(st.name==='search_sessions'&&Array.isArray(r.matches))text=r.matches.map(m=>`${m.title||tr('제목 없음')} · ${m.role==='user'?tr('사용자'):m.role==='assistant'?'Naru':m.role||''}\n${m.excerpt||''}`).join('\n\n')||tr('일치하는 이전 대화가 없어요.');else if(st.name==='todo'&&Array.isArray(r.items))text=r.items.map(i=>`${i.status==='completed'?'☑':i.status==='in_progress'?'◐':'☐'} ${i.text}${i.status==='in_progress'?tr(' (진행 중)'):''}`).join('\n')||tr('작업 목록이 비어 있어요.');else if(r.output!==undefined)text=String(r.output??'');else if(typeof r.content==='string')text=r.content;
  else if(Array.isArray(r.matches))text=r.matches.map(m=>`${m.path}:${m.line}  ${m.text}`).join('\n')||tr('찾은 곳이 없어요.');
  else if(Array.isArray(r.files))text=r.files.map(f=>(f.directory?f.name+'/':f.name)).join('\n')||tr('비어 있어요.');
  else text=JSON.stringify(r,null,2);
  out.push(`<div class="lbl">${r.error?tr('오류'):tr('결과')}</div><pre>${esc(String(text).slice(0,16000))}</pre>`);
 }
 return out.join('');
}
function approvalHTML(a){
 const g=a.arguments||{};let title='',where='',body='',warn='';
 if(a.tool==='write_file'){title=`${base(g.path)} ${g.overwrite?tr('덮어쓰기'):tr('만들기')}`;where=g.path;body=`<div class="preview"><pre>${esc(String(g.content||'').slice(0,20000))}</pre></div>`;}
 else if(a.tool==='edit_file'){title=tr`${base(g.path)} 수정`;where=g.path;body=`<div class="preview">${diffHTML(g.old_text||'',g.new_text||'')}</div>`;}
 else if(a.tool==='load_skill'){title=tr('스킬 불러오기');warn=tr('스킬 폴더 경로와 지침, 참조 파일이 현재 모델 제공자에게 전달될 수 있어요.');const skill=(S.data?.skills||[]).find(s=>String(s.id)===String(g.skill_id));body=`<div class="preview"><pre>${esc(skill?.name||g.skill_id||'')}</pre></div>`;}
 else if(a.tool==='search_sessions'){title=tr('이전 대화 검색');warn=tr('검색 결과가 현재 모델 제공자에게 전달됩니다.');body=`<div class="preview"><pre>${esc(g.query||'')}</pre></div>`;}
 else if(a.tool==='git_diff'){title=tr('Git 변경 내용 읽기');warn=tr('변경 내용이 현재 모델 제공자에게 전달됩니다. 비밀 정보가 포함될 수 있어요.');body=`<div class="preview"><pre>${g.staged?tr('스테이징된 변경'):tr('작업 중인 변경')}</pre></div>`;}
 else if(a.tool==='run_command'){title=tr('명령 실행');warn=tr('이 Mac에서 내 사용자 권한으로 실행돼요.');body=`<div class="preview"><pre>${esc(g.command||'')}</pre></div>`;}
 else{title=a.tool;body=`<div class="preview"><pre>${esc(JSON.stringify(g,null,2))}</pre></div>`;}
 if(where&&where===base(where))where='';
 const glyph=a.tool==='run_command'?'terminal':a.tool==='edit_file'?'pen':a.tool==='load_skill'?'skill':'doc';
 return tr`<div class="approve" role="group" aria-label="실행 전 확인"><div class="head">${icon(glyph)}<h4>${esc(title)}</h4></div>${where?`<p class="where">${esc(where)}</p>`:''}${warn?`<p class="warn">${warn}</p>`:''}${body}<div class="row"><button type="button" class="btn ghost" data-approval="${esc(a.id)}" data-decision="deny">거절</button><span class="grow"></span>${['search_sessions','git_diff','load_skill'].includes(a.tool)?'':tr`<button type="button" class="btn" data-approval="${esc(a.id)}" data-decision="approve_all" title="이번 작업에서 같은 종류는 다시 묻지 않아요">모두 허용</button>`}<button type="button" class="btn primary" data-approval="${esc(a.id)}" data-decision="approve" title="허용 (⌘⏎)">허용</button></div></div>`;
}
const questionDrafts={},questionSending=new Set();
function questionHTML(a){
 const args=a.arguments||{},options=Array.isArray(args.options)?args.options.slice(0,4):[],disabled=questionSending.has(String(a.id));
 return tr`<div class="question-card" role="group" aria-label="Naru의 질문"><strong>${esc(args.question||tr('답변을 입력해 주세요.'))}</strong>${options.length?`<div class="question-options">${options.map((option,i)=>`<button type="button" class="btn" data-act="answer-option" data-id="${esc(a.id)}" data-index="${i}"${disabled?' disabled':''}>${esc(option)}</button>`).join('')}</div>`:''}<div class="question-answer"><textarea data-question-input="${esc(a.id)}" aria-label="답변" placeholder="직접 답변하기" maxlength="4000" rows="2"${disabled?' disabled':''}>${esc(questionDrafts[a.id]||'')}</textarea><button type="button" class="btn primary" data-act="answer-question" data-id="${esc(a.id)}"${disabled?' disabled':''}>답변 보내기</button></div></div>`;
}
async function answerQuestion(id,answer){
 const sid=S.sid,epoch=S.epoch,run=latestRun(),question=S.detail?.approvals?.find(a=>String(a.id)===String(id)&&a.run_id===run?.id&&a.status==='pending'&&a.kind==='question');
 if(!question||!ACTIVE.includes(run?.status)||questionSending.has(String(id)))return;
 answer=String(answer||'').trim();if(!answer||answer.length>4000)throw new Error(tr('답변을 1~4,000자로 입력해 주세요.'));
 questionSending.add(String(id));try{await api(`/api/questions/${enc(id)}`,{method:'POST',body:{answer}});delete questionDrafts[id];if(S.sid===sid&&S.epoch===epoch)await loadDetail();}
 finally{questionSending.delete(String(id));}
}
function runHTML(run,isLatest){
 const d=S.detail,events=d.events.filter(e=>e.run_id===run.id),steps=buildSteps(events),active=ACTIVE.includes(run.status);
 const pending=d.approvals.filter(a=>a.run_id===run.id&&a.status==='pending'&&active);
 const tools=steps.filter(s=>s.type==='tool').length,broken=['failed','cancelled','interrupted'].includes(run.status);
 const expanded=active||S.open.has(run.id)||(broken&&isLatest&&!S.open.has('x'+run.id));
 let html=`<section class="run" data-run="${esc(run.id)}">`;
 if(steps.length){
  if(!active){const t=duration(run);html+=`<button type="button" class="summary" data-act="toggle-run" data-id="${esc(run.id)}" aria-expanded="${expanded}">${icon('chevron')}<span>${tools?tr`작업 ${tools}단계`:tr('진행 기록')}</span>${t?`<span class="time">${t}</span>`:''}</button>`;}
  if(expanded)html+=`<div class="steps">${steps.filter(step=>step.name!=='ask_user'||step.done).map(stepHTML).join('')}</div>`;
 }
 if(active){
  const status=isLatest?agentStatusHTML(run,events):'';
  html+=status;
  html+=pending.map(a=>a.kind==='question'?questionHTML(a):approvalHTML(a)).join('');
  const text=S.detail.live?.run_id===run.id?S.live:'';
  html+=`<div class="md" id="live">${text?markdown(text):''}</div>`;
  if(!text&&!pending.length&&!status)html+=tr('<div class="waiting" id="waiting"><span class="thinking-dots" role="img" aria-label="작업 중"><i></i><i></i><i></i></span></div>');
 }else if(broken){
  const msg=run.status==='cancelled'?tr('중지했어요.'):run.status==='interrupted'?tr('앱이 닫혀 작업이 멈췄어요.'):(tr(run.error)||tr('작업을 마치지 못했어요.'));
  html+=`<div class="notice ${run.status==='failed'?'bad':''}"><p>${esc(msg)}</p>${run.create_image?tr('<p>이미지 요청이 전달됐다면 중지해도 사용량이나 요금이 발생할 수 있어요. 다시 요청하면 새 호출이 시작돼요.</p>'):''}${isLatest?`<button type="button" class="btn sm" data-act="resume" data-id="${esc(run.id)}">${run.create_image?tr('다시 요청'):run.status==='failed'?tr('다시 시도'):tr('이어서 실행')}</button>`:''}</div>`;
 }
 html+=generatedImagesHTML(run,d.artifacts||[]);
 return html+'</section>';
}
function agentStatusHTML(run,events){
 if(!run||!ACTIVE.includes(run.status)||!['agent','plan'].includes(run.mode)||run.create_image)return '';
 let text=tr('작업 중');
 if(run.status==='awaiting_approval')text=tr('승인 대기');
 else if(run.status==='awaiting_user')text=tr('답변 대기');
 else{
  const latest=[...events].reverse().find(e=>['status','tool_call','tool_result'].includes(e.type));
  if(latest?.type==='status'&&typeof latest.data?.text==='string'&&latest.data.text.trim())text=tr(latest.data.text.trim());
  else if(latest?.type==='tool_call')text=tr('도구 실행 중');
 }
 return `<div class="agent-status" role="status" aria-live="polite"><span class="agent-status-indicator${['awaiting_approval','awaiting_user'].includes(run.status)?' attention':''}" aria-hidden="true"></span><span>${esc(text.slice(0,160))}</span></div>`;
}
function generatedImageList(images){return images.map(a=>{const url=`/api/artifacts/${enc(a.id)}/download`,name=esc(a.name||tr('생성된 이미지'));return tr`<figure class="generated-image"><button type="button" data-artifact="${esc(a.id)}" aria-label="${name} 크게 보기"><img src="${url}?inline=1" alt="${name}" loading="lazy"></button><a href="${url}" download aria-label="${name} 내려받기">${icon('download')}<span>내려받기</span></a></figure>`;}).join('');}
function generatedImagesHTML(run,artifacts){return generatedImageList(artifacts.filter(a=>a.image_generated&&String(a.run_id)===String(run.id)));}
function paintLive(){
 const el=$('live');if(!el){renderThread();return;}
 const scroll=$('thread'),near=scroll&&scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<140;
 el.innerHTML=markdown(S.live);if(S.live)$('waiting')?.remove();
 if(near)scroll.scrollTop=scroll.scrollHeight;
}
function renderDrawer(){
 const el=$('drawer-in');if(!el)return;const d=S.detail;if(!d){el.innerHTML='';return;}
 const arts=d.artifacts||[],run=latestRun(),u=run?.usage||{},p=providerById(run?.provider_id),t=duration(run),requested=run?.create_image&&run.model==='__default__'?tr('ChatGPT 기본 모델'):run?.model||p?.name||tr('기본 모델');
 const ico=n=>/\.(png|jpe?g|gif|webp|svg)$/i.test(n)?'image':/\.(html?|js|ts|py|css|json|sh)$/i.test(n)?'code':'doc';
 el.innerHTML=tr`<h3>파일</h3>${arts.length?`<div class="spaces">${arts.map(a=>`<button type="button" class="space" data-artifact="${esc(a.id)}" title="${esc(a.path)}"><div class="space-thumb" data-thumb="${esc(a.id)}">${thumbHTML(a,ico)}</div><div class="space-meta"><span class="space-name">${esc(a.name)}</span><span class="space-tag">${esc(extOf(a.name)||size(a.size))}</span></div></button>`).join('')}</div>`:tr('<p class="empty-note">파일 없음</p>')}
 ${run?tr`<h3>마지막 실행</h3><dl class="facts"><dt>요청 모델</dt><dd title="${esc(requested)}">${esc(requested)}</dd>${run.actual_model?tr`<dt>제공자 응답 모델</dt><dd title="${esc(run.actual_model)}">${esc(run.actual_model)}</dd>`:''}<dt>상태</dt><dd>${esc(STATUS[run.status]||run.status)}</dd>${t?tr`<dt>걸린 시간</dt><dd>${t}</dd>`:''}${u.input_tokens?tr`<dt>입력 토큰</dt><dd>${Number(u.input_tokens).toLocaleString()}</dd>`:''}${u.output_tokens?tr`<dt>출력 토큰</dt><dd>${Number(u.output_tokens).toLocaleString()}</dd>`:''}</dl>`:''}
 <h3>작업 폴더</h3><p class="path">${esc(S.data.settings.workspace)}</p>${window.naruDesktop?.revealPath?tr`<button type="button" class="btn sm" style="margin:0 6px" data-act="reveal-workspace">Finder에서 보기${icon('folder')}</button>`:''}`;
 if(arts.length)loadThumbs(arts,ico);
}

// ---------- sessions & runs ----------
function ensureProvider(){
 if(providerById(S.providerId))return;
 const a=S.accounts||S.data?.accounts||{};
 const ready=providers().find(p=>p.kind==='codex'&&a.codex?.authenticated)||providers().find(p=>isAccount(p)&&accountOf(p)?.authenticated&&!accountOf(p)?.execution_blocked)||providers().find(p=>p.model&&!accountOf(p)?.execution_blocked)||providers().find(p=>!accountOf(p)?.execution_blocked);
 S.providerId=ready?.id||'';S.model=ready?.model||'';
}
const deletedSessionIds=new Set();
let stateRequest=0,stateApplied=0,titleRevision=0;const manualTitles={};
async function refreshState(timeout){
 const request=++stateRequest,revision=titleRevision;
 const d=await api('/api/state',{timeout});
 if(request<stateApplied)return S.data;
 stateApplied=request;
 if(d.sessions)d.sessions=d.sessions.filter(s=>!deletedSessionIds.has(String(s.id)));
 for(const s of d.sessions||[]){const edit=manualTitles[s.id];if(edit&&edit.revision>revision)s.title=edit.title;}
 S.data=d;if(d.accounts)S.accounts=d.accounts;
 const current=d.sessions?.find(s=>s.id===S.sid);if(S.view==='chat'&&current&&S.detail?.session&&S.detail.session.title!==current.title){S.detail.session.title=current.title;renderTop();}
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
const forksPending=new Set();
async function forkMessage(messageId){
 const sid=S.sid,epoch=S.epoch;
 if(!sid||S.view!=='chat'||!S.detail?.messages?.some(m=>String(m.id)===String(messageId))||forksPending.has(sid))return;
 forksPending.add(sid);
 try{
  const result=await api(`/api/sessions/${enc(sid)}/fork`,{method:'POST',body:{message_id:messageId}}),session=result.session;
  if(!session?.id)throw new Error(tr('새 대화를 만들지 못했어요.'));
  if(S.data?.sessions&&!S.data.sessions.some(s=>s.id===session.id))S.data.sessions.unshift(session);
  renderSide();
  if(S.sid===sid&&S.epoch===epoch&&S.view==='chat')await selectSession(session.id);
  else toast(tr('분기한 대화를 목록에 추가했어요.'));
  refreshState().then(()=>renderSide()).catch(()=>{});
 }finally{forksPending.delete(sid);}
}
function newChat(){S.epoch++;S.view='chat';S.sid=null;S.detail=null;S.live='';remember(null);closePop();closeSide();renderAll();$('input')?.focus();}
let lastFull=0;const accessVersions={},accessValues={};
async function loadDetail(timeout){
 const sid=S.sid,epoch=S.epoch;if(!sid)return;const accessVersion=accessVersions[sid]||0,reasoningVersion=reasoningVersions[sid]||0,modelVersion=modelVersions[sid]||0,modeVersion=modeVersions[sid]||0,revision=titleRevision;
 const d=await api(`/api/sessions/${enc(sid)}`,{timeout});
 if(sid!==S.sid||epoch!==S.epoch)return;
 if(d.session&&manualTitles[sid]?.revision>revision)d.session.title=manualTitles[sid].title;
 if((accessVersions[sid]||0)!==accessVersion&&d.session)d.session.access_mode=accessValues[sid];
 else if(d.session)accessValues[sid]=d.session.access_mode||'inherit';
 if(((reasoningVersions[sid]||0)!==reasoningVersion||S.modelSaving)&&d.session&&reasoningValues[sid])d.session.reasoning_effort=reasoningValues[sid];
 else if(d.session)reasoningValues[sid]=d.session.reasoning_effort||'default';
 if(d.session&&modelValues[sid]&&((modelVersions[sid]||0)!==modelVersion||S.modelSaving))Object.assign(d.session,modelValues[sid]);
 if(d.session&&modeValues[sid]&&((modeVersions[sid]||0)!==modeVersion||(S.modeSaving&&S.modeSaveSid===sid)))d.session.mode=modeValues[sid];
 const before=latestRun();lastFull=Date.now();
 S.detail=d;S.live=d.live?.text||'';
 if(providerById(d.session.provider_id)&&!S.sending&&!S.modelSaving){S.providerId=d.session.provider_id;S.model=d.session.model||'';S.mode=d.session.mode||S.mode;}
 if(S.view!=='chat')return;
 renderThread();renderTools();renderQueue();renderTop();renderDrawer();$('drawer')?.classList.toggle('open',S.drawer);
 const after=latestRun();
 if(before&&after&&before.id===after.id&&before.status!==after.status)onTransition(before.status,after.status);
}
function onTransition(before,after){
 const title=S.detail?.session?.title||'Naru';
 if(after==='awaiting_approval')notify(tr('확인이 필요해요'),title);
 if(after==='awaiting_user')notify(tr('답변이 필요해요'),title);
 if(ACTIVE.includes(before)&&!ACTIVE.includes(after)){
  if(after==='completed')notify(tr('작업을 마쳤어요'),title);else if(after==='failed')notify(tr('작업이 멈췄어요'),title);
  refreshState().then(()=>renderSide()).catch(()=>{});
 }
}
function notify(title,body){try{if(document.hasFocus()||!('Notification' in window)||Notification.permission!=='granted')return;new Notification(title,{body});}catch{}}
function notificationHTML(){
 if(!('Notification' in window))return tr('<span class="hint">이 환경에서는 알림을 사용할 수 없어요.</span>');
 if(Notification.permission==='granted')return tr('<span>켜짐</span>');
 if(Notification.permission==='denied')return tr('<span class="hint">알림이 차단되어 있어요. 브라우저 또는 macOS 알림 설정에서 허용해 주세요.</span>');
 return tr('<button type="button" class="btn" data-act="enable-notifications">알림 켜기</button>');
}
async function enableNotifications(){
 if(!('Notification' in window)||Notification.permission!=='default')return;
 await Notification.requestPermission();
 const section=$('notification-setting');if(section)section.innerHTML=notificationHTML();
}
async function sendSteering(input,rawText){
 const sid=S.sid,epoch=S.epoch,key=draftKey(),run=latestRun(),content=rawText.trim(),retry=hasSteerRetry()?steeringAttempts[sid]:null,runId=retry?.runId||run?.id;
 if(!sid||!runId||(!retry&&!canSteer())){toast(tr('지금은 추가 지시를 받을 수 없어요. 대기열을 선택해 주세요.'),true);return;}
 if(attachments().length||S.imageModes[key]){toast(tr('추가 지시는 텍스트만 보낼 수 있어요. 첨부를 빼거나 대기열을 선택해 주세요.'),true);return;}
 if(!content||content.length>10000){toast(tr('추가 지시는 1~10,000자로 입력해 주세요.'),true);return;}
 let attempt=steeringAttempts[sid];
 if(!attempt||attempt.runId!==runId||attempt.rawText!==rawText)attempt=steeringAttempts[sid]={runId,rawText,requestId:crypto.randomUUID()};
 S.sending=true;renderTools();
 try{
  await api(`/api/runs/${enc(runId)}/steer`,{method:'POST',body:{content,request_id:attempt.requestId}});
  if(steeringAttempts[sid]===attempt)delete steeringAttempts[sid];
  if(S.drafts[key]===rawText)delete S.drafts[key];
  if(S.sid===sid&&S.epoch===epoch&&$('input')===input){if(input.value===rawText)input.value='';autosize();await loadDetail();}
 }catch(err){if(S.sid===sid&&S.epoch===epoch)toast(err.message,true);}
 finally{S.sending=false;if(S.view==='chat')renderTools();}
}
async function send(){
 const input=$('input'),rawText=input?.value||'';const text=rawText.trim(),files=attachments();
 if((!text&&!files.length)||S.sending||S.accessSaving||S.reasoningSaving||S.modelSaving||S.modeSaving||fileReads[draftKey()])return;
 if(steeringMode()||hasSteerRetry()){await sendSteering(input,rawText);return;}
 if(S.imageModes[draftKey()]&&!text){toast(tr('만들 이미지의 설명을 입력해 주세요.'),true);return;}
 if(S.imageModes[draftKey()]&&files.some(f=>f.mime)){toast(tr('첨부한 이미지 편집은 아직 지원하지 않아요. 이미지를 빼고 생성해 주세요.'),true);return;}
 const creatingImage=!!S.imageModes[draftKey()],selected=provider(),p=selected||(creatingImage?providerById(S.imageModes[draftKey()].providerId):null);
 if(!p){go('models');toast(tr('먼저 모델을 연결하세요.'));return;}
 const acct=accountOf(p);
 if(!creatingImage&&isAccount(p)&&acct?.execution_blocked){go('models');toast(acct.message||tr('이 계정 연결은 사용할 수 없습니다. API 연결을 이용하세요.'),true);return;}
 if(!creatingImage&&isAccount(p)&&acct&&acct.available===false){go('models');toast(tr`${p.name} CLI를 먼저 설치하세요.`,true);return;}
 if(!creatingImage&&isAccount(p)&&acct&&!acct.authenticated){go('models');toast(tr`${p.name} 로그인이 필요해요.`,true);return;}
 if(!creatingImage&&!isAccount(p)&&!S.model&&!p.model){modelMenu();toast(tr('사용할 모델을 고르세요.'));return;}
 let content=text;const textFiles=files.filter(f=>!f.mime),images=files.filter(f=>f.mime).map(({name,mime,data})=>({name,mime,data}));
 if(textFiles.length)content=(text||tr('첨부한 파일을 검토해 줘.'))+ATTACH_HEAD+textFiles.map(f=>`\n--- 첨부: ${f.name} ---\n${f.text}\n--- 첨부 끝 ---`).join('\n');
 if(content.length>100000){toast(tr('메시지와 첨부를 합쳐 100,000자 이하로 줄여 주세요.'),true);return;}
 const epoch=S.epoch,key=draftKey(),model=selected?S.model:(p.model||''),mode=S.mode,accessMode=sessionAccess(),accessRevision=S.newAccessRevision,reasoningEffort=creatingImage?'default':sessionReasoning(),reasoningRevision=S.newReasoningRevision,skillIds=selectedSkills().map(s=>s.id),queued=!!S.sid&&enqueueMode(),imageConfig=S.imageModes[draftKey()]?{...S.imageModes[draftKey()]}:null;S.sending=true;renderTools();
 let sid=S.sid;
 try{
  if(!sid){const s=await api('/api/sessions',{method:'POST',body:{title:(text||files[0]?.name||tr('새 대화')).slice(0,40),auto_title:true,provider_id:p.id,model,mode,access_mode:accessMode,reasoning_effort:reasoningEffort}});sid=s.id;accessValues[sid]=s.access_mode||accessMode;accessVersions[sid]=(accessVersions[sid]||0)+1;reasoningValues[sid]=s.reasoning_effort||reasoningEffort;reasoningVersions[sid]=(reasoningVersions[sid]||0)+1;if(S.newReasoningRevision===reasoningRevision)S.newReasoning='default';if(S.data?.sessions&&!S.data.sessions.some(x=>x.id===sid))S.data.sessions.unshift({...s,access_mode:accessValues[sid]});if(S.newAccessRevision===accessRevision){S.newAccess='inherit';if(S.view==='chat'&&!S.sid)renderTools();}if(S.epoch===epoch){if(S.drafts[key]!==undefined){S.drafts[sid]=S.drafts[key];delete S.drafts[key];}if(S.files[key]!==undefined){S.files[sid]=S.files[key];delete S.files[key];}if(S.imageModes[key]){S.imageModes[sid]=S.imageModes[key];delete S.imageModes[key];}S.sid=sid;remember(sid);}}
  await api(`/api/sessions/${enc(sid)}/${queued?'queue':'messages'}`,{method:'POST',body:{content,...(images.length?{images}:{}),...(imageConfig?{create_image:true,image_provider_id:imageConfig.providerId,image_model:imageConfig.model}:{}),provider_id:p.id,model,mode,reasoning_effort:reasoningEffort,skill_ids:skillIds}});
  if(imageConfig&&S.epoch===epoch&&S.sid===sid&&$('input')?.value===rawText&&((!files.length&&!attachments().length)||attachments()===files))delete S.imageModes[sid];
  if(S.drafts[key]===rawText)delete S.drafts[key];
  if(S.files[key]===files)delete S.files[key];
  if(key!==sid&&S.drafts[sid]===rawText)delete S.drafts[sid];
  if(key!==sid&&S.files[sid]===files)delete S.files[sid];
  if(S.epoch===epoch&&S.sid===sid&&$('input')){if($('input').value===rawText)$('input').value='';autosize();renderChips();}
  if(!queued)S.data.active={...(S.data.active||{}),[sid]:'running'};
  if(S.epoch===epoch&&S.sid===sid)await loadDetail();
  refreshState().then(()=>renderSide()).catch(()=>{});
 }catch(err){if(sid&&S.sid===sid&&S.epoch===epoch&&!S.detail)try{await loadDetail();}catch{}if(S.data?.sessions)renderSide();toast(err.message,true);}
 finally{S.sending=false;if(S.view==='chat')renderTools();}
}

// ---------- workspace file mentions ----------
let fileMention=null,mentionSerial=0,mentionTimer=null;
function mentionAt(input){
 if(input.selectionStart!==input.selectionEnd)return null;
 const before=input.value.slice(0,input.selectionStart),m=before.match(/(?:^|\s)@([^\s@]*)$/);
 return m?{query:m[1],start:input.selectionStart-m[1].length-1,end:input.selectionStart}:null;
}
function updateFileMention(input){
 const token=mentionAt(input);
 if(S.view!=='chat'||$('input')!==input||!token){if(fileMention&&pop?.el===fileMention.el)closePop();fileMention=null;clearTimeout(mentionTimer);return;}
 const sid=S.sid,epoch=S.epoch,key=draftKey(),workspace=S.data?.settings?.workspace||'';
 if(!workspace)return;
 if(!fileMention||pop?.el!==fileMention.el||fileMention.input!==input){
  const el=openPop(input,tr('<div class="loading" role="status">파일 이름을 입력하세요</div>'),{width:320,onPick:(_kind,button)=>selectContextFile(fileMention?.files[Number(button.dataset.index)],fileMention)});
  el.setAttribute('role','listbox');el.setAttribute('aria-label',tr('작업 폴더 파일'));el.addEventListener('pointerdown',ev=>ev.preventDefault());
  fileMention={el,input,sid,epoch,key,workspace,files:[],selected:0};
 }
 const menu=fileMention;Object.assign(menu,token,{sid,epoch,key,workspace,files:[],selected:0});
 const request=++mentionSerial;clearTimeout(mentionTimer);
 if(!token.query){menu.el.innerHTML=tr('<div class="loading" role="status">파일 이름을 입력하세요</div>');placePop();return;}
 menu.el.innerHTML=tr('<div class="loading" role="status">파일 찾는 중…</div>');placePop();
 mentionTimer=setTimeout(async()=>{
  try{
   const result=await api(`/api/context/files?q=${enc(token.query)}`);
   if(request!==mentionSerial||fileMention!==menu||pop?.el!==menu.el||S.sid!==sid||S.epoch!==epoch||S.data?.settings?.workspace!==workspace)return;
   if(result.workspace!==workspace)throw new Error(tr('작업 폴더가 바뀌었어요. 다시 검색해 주세요.'));
   menu.files=Array.isArray(result.files)?result.files.filter(x=>typeof x==='string'):[];
   menu.el.innerHTML=menu.files.length?menu.files.map((path,i)=>`<button type="button" class="opt ${i===0?'hl':''}" role="option" aria-selected="${i===0}" data-pick="context-file" data-index="${i}">${icon('doc')}<span title="${esc(path)}">${esc(path)}</span></button>`).join('')+(result.truncated?tr('<div class="loading">검색어를 더 입력하세요</div>'):''):tr('<div class="loading" role="status">일치하는 파일이 없어요</div>');
   placePop();
  }catch(err){if(request===mentionSerial&&fileMention===menu&&pop?.el===menu.el){menu.el.innerHTML=`<div class="loading" role="alert">${esc(err.message)}</div>`;placePop();}}
 },160);
}
function fileMentionKey(ev){
 const menu=fileMention;if(!menu||pop?.el!==menu.el||ev.isComposing||ev.keyCode===229)return false;
 if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();closePop();fileMention=null;return true;}
 if(!menu.files.length){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();ev.stopPropagation();return true;}return false;}
 if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
  ev.preventDefault();ev.stopPropagation();menu.selected=(menu.selected+(ev.key==='ArrowDown'?1:-1)+menu.files.length)%menu.files.length;
  menu.el.querySelectorAll('[data-index]').forEach((el,i)=>{el.classList.toggle('hl',i===menu.selected);el.setAttribute('aria-selected',String(i===menu.selected));});return true;
 }
 if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();ev.stopPropagation();selectContextFile(menu.files[menu.selected],menu);return true;}
 return false;
}
async function selectContextFile(path,menu){
 if(!path||!menu||fileMention!==menu||pop?.el!==menu.el)return;
 const {sid,epoch,key,workspace,input,start,end,query}=menu,raw=input.value;
 if(S.sid!==sid||S.epoch!==epoch||raw.slice(start,end)!=='@'+query)return;
 closePop();fileMention=null;fileReads[key]=(fileReads[key]||0)+1;syncSend();
 try{
  const result=await api('/api/context/read',{method:'POST',body:{path,workspace}});
  if(S.sid!==sid||S.epoch!==epoch||S.data?.settings?.workspace!==workspace||$('input')!==input||input.value!==raw)return;
  if(typeof result.text!=='string'||typeof result.name!=='string'||result.path!==path||result.workspace!==workspace)throw new Error(tr('파일을 읽지 못했어요.'));
  const current=[...(S.files[key]||[]),{name:result.name,size:result.size,text:result.text}];
  if(current.length>5)throw new Error(tr('파일은 한 번에 5개까지 첨부할 수 있어요.'));
  if(current.reduce((n,f)=>n+(f.text?.length||0),0)>90000)throw new Error(tr('첨부 내용은 합쳐서 90,000자 이하여야 해요.'));
  S.files[key]=current;input.value=raw.slice(0,start)+raw.slice(end);S.drafts[key]=input.value;input.setSelectionRange(start,start);autosize();renderChips();input.focus();
 }catch(err){if(S.sid===sid&&S.epoch===epoch)toast(err.message,true);}
 finally{fileReads[key]--;if(!fileReads[key])delete fileReads[key];if(draftKey()===key)syncSend();}
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
async function saveReasoning(value,sid,epoch,pid,model){
 if(!Object.hasOwn(REASONING_LABELS,value))throw new Error(tr('올바른 추론 강도를 선택하세요.'));
 if(S.reasoningSaving||S.modelSaving||S.epoch!==epoch||S.sid!==sid||S.providerId!==pid||S.model!==model)throw new Error(tr('대화나 모델이 바뀌었어요. 다시 선택해 주세요.'));
 if(!sid){S.newReasoning=value;S.newReasoningRevision++;renderTools();return;}
 S.reasoningSaving=true;renderTools();
 try{
  const updated=await api(`/api/sessions/${enc(sid)}`,{method:'PATCH',body:{reasoning_effort:value}});
  const saved=updated.reasoning_effort||value;reasoningValues[sid]=saved;reasoningVersions[sid]=(reasoningVersions[sid]||0)+1;
  const item=S.data?.sessions?.find(s=>s.id===sid);if(item)item.reasoning_effort=saved;
  if(S.sid===sid&&S.epoch===epoch&&S.detail?.session)S.detail.session.reasoning_effort=saved;
 }finally{S.reasoningSaving=false;if(S.view==='chat')renderTools();}
}
async function openReasoningMenu(){
 const anchor=$('reasoning-chip'),p=provider(),sid=S.sid,epoch=S.epoch,pid=S.providerId,model=S.model;
 if(!anchor||!reasoningEligible(p))return;
 const el=openPop(anchor,tr('<div class="reasoning-pop"><div class="reasoning-status" role="status">불러오는 중…</div></div>'),{width:256});
 el.setAttribute('role','dialog');el.setAttribute('aria-label',tr('추론 강도'));
 try{
  const result=await api(`/api/providers/${enc(pid)}/reasoning?model=${enc(model||p.model||'')}`);
  if(!pop||pop.el!==el||S.epoch!==epoch||S.sid!==sid||S.providerId!==pid||S.model!==model)return;
  const levels=['default',...new Set((Array.isArray(result.levels)?result.levels:[]).filter(x=>x!=='default'&&Object.hasOwn(REASONING_LABELS,x)))];
  if(levels.length===1){el.innerHTML=tr('<div class="reasoning-pop"><div class="reasoning-status">이 모델은 추론 강도를 조절할 수 없어요.</div></div>');placePop();return;}
  const current=levels.indexOf(sessionReasoning()),index=current<0?0:current;
  el.innerHTML=tr`<div class="reasoning-pop"><div class="reasoning-head">${icon('bolt')}<div><strong data-reasoning-label>${esc(REASONING_LABELS[levels[index]])}</strong><span>${esc(modelLabel())}</span></div></div><label class="sr" for="reasoning-range">추론 강도</label><input id="reasoning-range" type="range" min="0" max="${levels.length-1}" step="1" value="${index}" aria-valuetext="${esc(REASONING_LABELS[levels[index]])}"><div class="reasoning-ends"><span>기본</span><span>${esc(REASONING_LABELS[levels.at(-1)])}</span></div></div>`;
  const range=el.querySelector('#reasoning-range');range.addEventListener('input',()=>{const label=REASONING_LABELS[levels[+range.value]];el.querySelector('[data-reasoning-label]').textContent=label;range.setAttribute('aria-valuetext',label);});
  range.addEventListener('change',async()=>{const value=levels[+range.value];closePop();try{await saveReasoning(value,sid,epoch,pid,model);}catch(err){toast(err.message,true);}});
  placePop();range.focus();
 }catch(err){if(pop?.el===el){el.innerHTML=`<div class="reasoning-pop"><div class="reasoning-status">${esc(err.message)}</div></div>`;placePop();}}
}
function modelOptions(p){
 const list=S.models[p.id]||[], options=p.kind==='codex'?['',...list]:[...list];
 for(const m of [p.model,String(p.id)===String(S.providerId)?S.model:''])if(m&&!options.includes(m))options.unshift(m);
 return options;
}
function modelMenuHTML(query=''){
 const parts=[],term=String(query).trim().toLocaleLowerCase();let matches=0;
 for(const p of providers()){
  const acct=isAccount(p)?accountOf(p):null,locked=acct&&(acct.execution_blocked||!acct.available||!acct.authenticated),state=S.modelFetch[p.id]||{};
  const providerMatch=!term||`${p.name} ${p.id}`.toLocaleLowerCase().includes(term);
  const models=modelOptions(p).filter(m=>providerMatch||(m||tr('기본 모델')).toLocaleLowerCase().includes(term));
  if(!providerMatch&&(!models.length||locked))continue;
  matches++;
  parts.push(`<div class="grp">${esc(p.name)}${locked?(acct.execution_blocked?tr('<span class="badge attention">사용 일시 중지</span>'):acct.available?tr('<span class="badge attention">로그인 필요</span>'):tr('<span class="badge neutral">설치 필요</span>')):''}</div>`);
  if(locked){parts.push(tr`<button type="button" class="opt dim" data-pick="go-models">${icon('key')}<span>연결하러 가기</span></button>`);continue;}
  for(const m of models){const on=String(p.id)===String(S.providerId)&&(S.model||'')===(m||'');parts.push(`<button type="button" class="opt" role="menuitemradio" aria-checked="${on}" data-pick="m" data-p="${esc(p.id)}" data-m="${esc(m)}"><span>${esc(m||tr('기본 모델'))}</span>${on?icon('check','tick'):''}</button>`);}
  if(state.loading)parts.push(tr('<div class="loading"><span class="spinner"></span>모델 불러오는 중</div>'));
  else if(state.error)parts.push(`<div class="loading">${esc(state.error)}</div>`);
  else if(S.models[p.id]&&!S.models[p.id].length&&p.kind!=='codex')parts.push(`<div class="loading">${['claude_code','gemini_cli','copilot_cli'].includes(p.kind)?tr('자동 모델 목록을 제공하지 않아요. 모델 ID를 직접 입력하세요.'):tr('사용 가능한 모델이 없어요')}</div>`);
  if(p.kind==='codex')parts.push(tr('<div class="loading">모델 목록은 카탈로그이며 계정 사용 가능 여부는 실행 시 확인됩니다.</div>'));
  if(['claude_code','gemini_cli','copilot_cli'].includes(p.kind))parts.push(tr('<div class="loading">CLI 기본 모델 목록입니다. 실제 사용 가능 여부는 실행 시 확인됩니다.</div>'));
  parts.push(tr`<button type="button" class="opt dim" data-pick="refresh-models" data-p="${esc(p.id)}">${icon('retry')}<span>모델 목록 새로고침</span></button>`);
  parts.push(tr`<div class="inline" hidden data-custom="${esc(p.id)}"><input type="text" placeholder="모델 ID" aria-label="${esc(p.name)} 모델 ID"><button type="button" class="btn sm primary" data-pick="custom" data-p="${esc(p.id)}">사용</button></div><button type="button" class="opt dim" data-pick="custom-open" data-p="${esc(p.id)}">${icon('plus')}<span>모델 ID 입력</span></button>`);
 }
 if(term&&!matches){const states=providers().map(p=>S.modelFetch[p.id]||{});const message=states.some(x=>x.loading)?tr('모델 불러오는 중'):states.some(x=>x.error)?tr('검색 결과가 없어요. 일부 목록을 불러오지 못했어요.'):tr('검색 결과가 없어요. 검색어를 지우면 모델 ID를 직접 입력할 수 있어요.');parts.push(`<div class="loading" role="status">${message}</div>`);}
 parts.push(tr`<div class="sep"></div><button type="button" class="opt" data-pick="go-models">${icon('plug')}<span>연결 관리</span></button>`);
 return parts.join('');
}
function redrawModelMenu(force=false){
 if(!pop||pop.anchor?.id!=='model-chip')return;
 const el=pop.el;if(!force&&el.querySelector('[data-custom]:not([hidden])'))return;
 const results=el.querySelector('[data-model-results]'),search=el.querySelector('[data-model-search]');if(!results||!search)return;
 const focused=results.contains(document.activeElement)?document.activeElement:null;
 const key=focused?.dataset?{pick:focused.dataset.pick,p:focused.dataset.p,m:focused.dataset.m}:null;
 const scroll=el.scrollTop;results.innerHTML=modelMenuHTML(search.value);
 if(key?.pick){const next=[...results.querySelectorAll('[data-pick]')].find(t=>t.dataset.pick===key.pick&&t.dataset.p===key.p&&t.dataset.m===key.m);next?.focus();}
 el.scrollTop=scroll;placePop();
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
  S.modelFetch[id]={loading:false,at:Date.now(),error:err.message||tr('모델 목록을 불러오지 못했어요.')};
 }finally{redrawModelMenu();}
}
function discoverModels(force=false){
 for(const p of providers()){
  const a=isAccount(p)?accountOf(p):null;
  if(isAccount(p)&&(!a||a.execution_blocked||!a.available||!a.authenticated))continue;
  loadProviderModels(p,force);
 }
}
function modelMenu(){
 const anchor=$('model-chip');if(!anchor)return;
 const el=openPop(anchor,tr`<div class="model-search"><input type="search" data-model-search aria-label="모델 검색" placeholder="모델 검색" autocomplete="off"></div><div data-model-results role="menu" aria-label="모델 목록">${modelMenuHTML()}</div>`,{width:300,onPick:async(kind,t)=>{
  if(kind==='go-models'){closePop();go('models');return;}
  if(kind==='refresh-models'){const p=providerById(t.dataset.p);if(p)await loadProviderModels(p,true);return;}
  if(kind==='custom-open'){const box=el.querySelector(`[data-custom="${CSS.escape(t.dataset.p)}"]`);box.hidden=false;t.hidden=true;box.querySelector('input').focus();return;}
  let pid=t.dataset.p,model=kind==='custom'?el.querySelector(`[data-custom="${CSS.escape(pid)}"] input`).value.trim():t.dataset.m;
  if(kind==='custom'&&!model)return;
  closePop();await setModel(pid,model);
 }});
 el.setAttribute('role','dialog');el.setAttribute('aria-label',tr('모델 선택'));
 const search=el.querySelector('[data-model-search]');search.addEventListener('input',()=>{el.scrollTop=0;redrawModelMenu(true);});
 el.addEventListener('keydown',ev=>{
  if(ev.isComposing||ev.keyCode===229)return;
  if(ev.target===search&&ev.key==='ArrowDown'){const first=el.querySelector('[data-pick="m"]');if(first){ev.preventDefault();first.focus();}}
  else if(ev.target===search&&ev.key==='Enter'){const first=el.querySelector('[data-pick="m"]');if(first){ev.preventDefault();first.click();}}
  else if(ev.key==='Enter'&&ev.target.matches('[data-custom] input')){ev.preventDefault();ev.target.parentElement.querySelector('[data-pick="custom"]').click();}
 });
 search.focus();discoverModels();
}
async function setModel(pid,model){
 if(S.modelSaving||S.reasoningSaving)return;
 const sid=S.sid,epoch=S.epoch,changed=S.providerId!==pid||S.model!==model;
 if(!changed)return;
 const previous={provider_id:S.providerId,model:S.model,reasoning_effort:sessionReasoning()};
 S.providerId=pid;S.model=model;
 const apply=(state)=>{if(sid){reasoningValues[sid]=state.reasoning_effort;reasoningVersions[sid]=(reasoningVersions[sid]||0)+1;modelValues[sid]={provider_id:state.provider_id,model:state.model};modelVersions[sid]=(modelVersions[sid]||0)+1;const item=S.data?.sessions?.find(s=>s.id===sid);if(item)Object.assign(item,state);if(S.sid===sid&&S.epoch===epoch&&S.detail?.session)Object.assign(S.detail.session,state);}else{S.newReasoning=state.reasoning_effort;S.newReasoningRevision++;}};
 apply({provider_id:pid,model,reasoning_effort:'default'});
 if(sid)S.modelSaving=true;
 renderTools();
 if(sid)try{await api(`/api/sessions/${enc(sid)}`,{method:'PATCH',body:{provider_id:pid,model,reasoning_effort:'default'}});}
 catch(err){apply(previous);if(S.sid===sid&&S.epoch===epoch){S.providerId=previous.provider_id;S.model=previous.model;}toast(err.message,true);}
 finally{if(modelValues[sid]){modelVersions[sid]=(modelVersions[sid]||0)+1;reasoningVersions[sid]=(reasoningVersions[sid]||0)+1;}S.modelSaving=false;if(S.view==='chat')renderTools();}
}
function skillsMenu(){
 const anchor=$('skill-chip');const list=enabledSkills();
 const html=()=>(list.length?list.map(s=>{const on=S.skillIds.includes(String(s.id));return `<button type="button" class="opt" role="menuitemcheckbox" aria-checked="${on}" data-pick="s" data-id="${esc(s.id)}"><span>${esc(s.name)}</span>${on?icon('check','tick'):''}</button>`;}).join(''):tr('<div class="loading">켜 둔 스킬이 없어요</div>'))+tr`<div class="sep"></div><button type="button" class="opt" data-pick="go">${icon('skill')}<span>스킬 관리</span></button>`;
 const el=openPop(anchor,html(),{width:260,onPick:(kind,t)=>{
  if(kind==='go'){closePop();go('skills');return;}
  const id=String(t.dataset.id);S.skillIds=S.skillIds.includes(id)?S.skillIds.filter(x=>x!==id):[...S.skillIds,id];el.innerHTML=html();renderTools();
 }});
}
function chatMenu(anchor){
 openPop(anchor,tr`<button type="button" class="opt" data-pick="rename">${icon('edit')}<span>이름 바꾸기</span></button><button type="button" class="opt" data-pick="export">${icon('download')}<span>마크다운으로 내보내기</span></button><div class="sep"></div><button type="button" class="opt" data-pick="delete" style="color:var(--danger)">${icon('trash')}<span>대화 삭제</span></button>`,{width:220,onPick:k=>{closePop();if(k==='rename')startRename();else if(k==='export')exportChat();else deleteChat();}});
}
function exportChat(){const a=document.createElement('a');a.href=`/api/sessions/${enc(S.sid)}/export`;a.download='';document.body.appendChild(a);a.click();a.remove();}
function deleteChat(id=S.sid){
 const session=S.data?.sessions?.find(s=>String(s.id)===String(id))||(S.sid===id?S.detail?.session:null);if(!id||!session)return;
 if(S.data?.active?.[id]||(S.sid===id&&runActive())){toast(tr('실행을 멈춘 뒤 삭제할 수 있어요.'),true);return;}
 const title=session.title||tr('새 대화');
 confirmDialog(tr`“${title}” 대화를 삭제할까요?`,tr('대화, 실행 기록과 대기 메시지가 삭제돼요. 만든 파일은 그대로 남아요.'),tr('삭제'),async()=>{
  await api(`/api/sessions/${enc(id)}`,{method:'DELETE'});
  deletedSessionIds.add(String(id));
  delete S.drafts[id];delete S.files[id];delete S.imageModes[id];delete accessValues[id];delete accessVersions[id];delete reasoningValues[id];delete reasoningVersions[id];delete modelValues[id];delete modelVersions[id];delete modeValues[id];delete modeVersions[id];delete followupModes[id];delete steeringAttempts[id];delete manualTitles[id];
  if(S.data?.sessions)S.data.sessions=S.data.sessions.filter(s=>String(s.id)!==String(id));
  if(S.data?.active)delete S.data.active[id];
  if(S.sid===id){if(S.view==='chat')newChat();else{S.epoch++;S.sid=null;S.detail=null;S.live='';remember(null);renderSide();renderTop();}}
  else renderSide();
  try{await refreshState();renderSide();}catch{}
  toast(tr('삭제했어요'));
 });
}
function startRename(){
 const btn=$('top-title');if(!btn||!S.detail||(renaming&&renaming.sid===S.sid&&renaming.epoch===S.epoch))return;const sid=S.sid,epoch=S.epoch,old=S.detail.session.title;const edit={sid,epoch};renaming=edit;
 const wrap=document.createElement('div');wrap.className='top-title';wrap.innerHTML=tr`<input id="rename-input" value="${esc(old)}" maxlength="120" aria-label="대화 이름">`;btn.replaceWith(wrap);
 const input=$('rename-input');input.focus();input.select();let done=false;
 const finish=async save=>{if(done)return;done=true;const title=input.value.trim();if(save&&title&&title!==old){try{await api(`/api/sessions/${enc(sid)}`,{method:'PATCH',body:{title}});manualTitles[sid]={title,revision:++titleRevision};const item=S.data?.sessions?.find(s=>s.id===sid);if(item)item.title=title;if(S.sid===sid&&S.epoch===epoch&&S.detail)S.detail.session.title=title;renderSide();await refreshState();renderSide();}catch(err){toast(err.message,true);}}if(renaming===edit)renaming=null;if(S.sid===sid&&S.epoch===epoch)renderTop();};
 input.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.isComposing){ev.preventDefault();finish(true);}if(ev.key==='Escape'){ev.preventDefault();finish(false);}});
 input.addEventListener('blur',()=>finish(true));
}

// ---------- palette ----------
let palette=null;
function openPalette(){
 closePop();if(palette){palette.input.focus();return;}
 const el=document.createElement('div');el.className='palette';el.innerHTML=tr('<div class="palette-box" role="dialog" aria-label="검색"><input type="text" placeholder="대화, 모델, 설정 검색" aria-label="검색"><div class="palette-list" role="listbox"></div></div>');
 document.body.appendChild(el);const input=el.querySelector('input'),list=el.querySelector('.palette-list');
 palette={el,input,items:[],hl:0,remote:[],q:''};
 const actions=[
  {icon:'compose',label:tr('새 대화'),run:newChat},
  {icon:'plug',label:tr('모델 연결'),run:()=>go('models')},
  {icon:'skill',label:tr('스킬'),run:()=>go('skills')},
  {icon:'memory',label:tr('메모리'),run:()=>go('memory')},
  {icon:'settings',label:tr('설정'),run:()=>go('settings')},
  {icon:'sidebar',label:S.sideHidden?tr('사이드바 보기'):tr('사이드바 숨기기'),run:()=>setSide(!S.sideHidden)},
  {icon:document.documentElement.dataset.mode==='dark'?'sun':'moon',label:tr('밝기 전환'),run:()=>{const dark=getComputedStyle(document.documentElement).colorScheme==='dark';pref.set('theme',dark?'light':'dark');applyTheme();}},
 ];
 const draw=()=>{
  const q=palette.q.toLowerCase();
  const acts=actions.filter(a=>!q||a.label.toLowerCase().includes(q));
  const sess=S.data.sessions.filter(s=>!q||s.title.toLowerCase().includes(q)).slice(0,q?20:8).map(s=>({icon:'compose',label:s.title,sid:s.id}));
  const seen=new Set(sess.map(s=>s.sid));
  const remote=palette.remote.filter(r=>!seen.has(r.session_id)).map(r=>({icon:'search',label:r.title,sub:r.snippet,sid:r.session_id}));
  const groups=[q?[...sess,...remote]:sess,acts].filter(g=>g.length);
  palette.items=groups.flat();palette.hl=Math.min(palette.hl,Math.max(0,palette.items.length-1));
  let n=0;list.innerHTML=groups.map(g=>g.map(it=>{const i=n++;return `<button type="button" class="pal ${i===palette.hl?'hl':''}" role="option" aria-selected="${i===palette.hl}" data-index="${i}">${icon(it.icon)}<div><b>${esc(it.label)}</b>${it.sub?`<small>${esc(it.sub)}</small>`:''}</div></button>`;}).join('')).join('<div class="sep"></div>')||tr('<div class="none">찾는 결과가 없어요</div>');
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
 dlg.innerHTML=`<div class="dlg"><div class="dlg-head"><div style="flex:1"><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div>${iconBtn('x',tr('닫기'),'close-dialog')}</div>${body}<div class="err" id="dlg-err" hidden></div></div>`;
 if(wide)dlg.style.width='min(680px, calc(100vw - 32px))';else dlg.style.width='';
 if(!dlg.open)dlg.showModal();
 setTimeout(()=>dlg.querySelector('input:not([type=checkbox]):not([type=hidden]),textarea,select')?.focus(),0);
 return dlg;
}
function closeDialog(){if(applyingUpdate)return;const d=$('dialog');if(d.open)d.close();}
function dialogError(msg){const e=$('dlg-err');if(e){e.hidden=false;e.textContent=msg;}else toast(msg,true);}
function confirmDialog(title,desc,label,action){
 openDialog(title,tr`<div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="button" class="btn danger" id="confirm-yes">${esc(label)}</button></div>`,{desc});
 $('confirm-yes').addEventListener('click',async ev=>{ev.currentTarget.disabled=true;try{await action();closeDialog();}catch(err){ev.currentTarget.disabled=false;dialogError(err.message);}});
 setTimeout(()=>$('confirm-yes')?.focus(),0);
}
async function submitForm(form,fn){
 const btn=form.querySelector('[type=submit]');btn&&(btn.disabled=true);
 try{await fn();}catch(err){dialogError(err.message);}finally{if(btn&&btn.isConnected)btn.disabled=false;}
}
async function saveSessionAccess(mode,sid,epoch){
 if(!['inherit','manual','auto_approve','full_access'].includes(mode))throw new Error(tr('올바른 도구 승인 방식을 선택하세요.'));
 if(S.accessSaving)throw new Error(tr('설정을 저장하고 있어요.'));
 if(!sid){if(S.sid||S.epoch!==epoch)throw new Error(tr('대화가 바뀌었어요. 다시 설정해 주세요.'));S.newAccess=mode;S.newAccessRevision++;if(S.view==='chat')renderTools();return;}
 S.accessSaving=true;if(S.view==='chat')renderTools();
 try{
  const updated=await api(`/api/sessions/${enc(sid)}`,{method:'PATCH',body:{access_mode:mode}});
  const saved=updated.access_mode||mode;accessValues[sid]=saved;accessVersions[sid]=(accessVersions[sid]||0)+1;
  const item=S.data?.sessions?.find(s=>s.id===sid);if(item)item.access_mode=saved;
  if(S.sid===sid&&S.epoch===epoch&&S.detail?.session)S.detail.session.access_mode=saved;
 }finally{S.accessSaving=false;if(S.view==='chat')renderTools();}
}
function openSessionAccess(){
 const sid=S.sid,epoch=S.epoch,mode=sessionAccess(),base=ACCESS_LABELS[S.data?.settings?.access_mode]||ACCESS_LABELS.manual;
 const options=[['inherit',tr`기본 설정 따르기 (${base})`],['manual',tr('매번 승인')],['auto_approve',tr('자동 승인 (Approve for me)')],['full_access',tr('전체 접근 (Full access)')]];
 const dlg=openDialog(tr('이 대화의 도구 승인'),tr`<form class="form" id="session-access-form"><div class="field"><label for="session-access-select">접근 권한</label><select id="session-access-select" name="access_mode" aria-describedby="session-access-help">${options.map(([value,label])=>`<option value="${value}"${value===mode?' selected':''}>${esc(label)}</option>`).join('')}</select><div class="hint" id="session-access-help"><p><strong>매번 승인:</strong> 파일 변경, 명령, 스킬 불러오기와 대화·Git 검색 전에 승인해요.</p><p><strong>자동 승인:</strong> 파일 변경과 터미널 명령을 자동 승인해요. 스킬 불러오기, 대화·Git 검색은 따로 승인해요.</p><p><strong>전체 접근:</strong> 모든 도구를 자동 승인하고 파일 도구의 폴더 제한을 해제해요.</p><p>자동 승인과 전체 접근의 터미널 명령은 샌드박스 없이 사용자 권한으로 실행되어 선택한 폴더 밖의 파일도 읽거나 변경할 수 있어요.</p><p>새 작업부터 적용돼요. 진행 중이거나 재개하는 작업은 기존 권한을 유지하며, 대기 메시지는 등록할 때와 실행할 때 중 더 제한적인 권한을 사용해요.</p></div></div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`);
 $('session-access-form').addEventListener('submit',ev=>{ev.preventDefault();const value=$('session-access-select').value;submitForm(ev.currentTarget,async()=>{await saveSessionAccess(value,sid,epoch);if(dlg.open)closeDialog();});});
}
function imageProviders(){return providers().filter(p=>(p.kind==='codex'&&(!accountOf(p)||accountOf(p).authenticated))||(p.kind==='openai'&&p.has_key&&String(p.base_url||'').replace(/\/+$/,'')==='https://openrouter.ai/api/v1'));}
function openImagePicker(){
 const key=draftKey(),epoch=S.epoch,choices=imageProviders(),active=!!S.imageModes[key];
 const dlg=openDialog(tr('이미지 만들기'),tr`<form class="form" id="image-model-form"><div class="field"><label for="image-provider">이미지 생성 연결</label><select id="image-provider" required><option value="">연결 선택</option>${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label for="image-model">이미지 생성 모델</label><select id="image-model" required disabled><option value="">연결을 먼저 선택하세요</option></select><span class="hint" id="image-model-status" role="status"></span></div><p class="lead">ChatGPT는 구독 사용량이 적용되고, OpenRouter는 별도 요금이 발생할 수 있어요. 중지하거나 다시 요청해도 사용량이나 요금이 발생할 수 있어요.</p>${choices.length?'':tr('<button type="button" class="btn" data-act="image-connect">모델 연결하기</button>')}<div class="actions">${active?tr('<button type="button" class="btn ghost" id="image-mode-clear">이미지 만들기 끄기</button>'):''}<button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">선택</button></div></form>`);
 const select=$('image-provider'),models=$('image-model'),status=$('image-model-status');let request=0;
 select.addEventListener('change',async()=>{
  const id=select.value,current=++request;models.disabled=true;models.innerHTML=tr('<option value="">모델 불러오는 중…</option>');status.textContent='';
  if(!id){models.innerHTML=tr('<option value="">연결을 먼저 선택하세요</option>');return;}
  try{
   const result=await api(`/api/providers/${enc(id)}/image-models`);if(!dlg.open||current!==request)return;
   const list=Array.isArray(result.models)?result.models.filter(x=>typeof x==='string'&&x):[];
   const isCodex=choices.find(p=>String(p.id)===id)?.kind==='codex';
   models.innerHTML=tr('<option value="">모델 선택</option>')+list.map(x=>`<option value="${esc(x)}">${esc(isCodex&&x==='__default__'?tr('ChatGPT 기본 모델'):x)}</option>`).join('');models.disabled=!list.length;
   if(isCodex&&list.includes('__default__'))models.value='__default__';
   if(!list.length)status.textContent=tr('사용할 수 있는 이미지 모델이 없어요.');
  }catch(err){if(!dlg.open||current!==request)return;models.innerHTML=tr('<option value="">모델을 불러오지 못했어요</option>');status.textContent=err.message;}
 });
 $('image-model-form').addEventListener('submit',ev=>{ev.preventDefault();submitForm(ev.currentTarget,async()=>{if(S.epoch!==epoch||draftKey()!==key)throw new Error(tr('대화가 바뀌었어요. 다시 선택해 주세요.'));const providerId=select.value,model=models.value;if(!choices.some(p=>String(p.id)===providerId)||!model||models.disabled)throw new Error(tr('연결과 이미지 모델을 선택해 주세요.'));S.imageModes[key]={providerId,model};closeDialog();renderTools();});});
 if(active)$('image-mode-clear').addEventListener('click',()=>{delete S.imageModes[key];closeDialog();if(draftKey()===key)renderTools();});
}
function editQueue(id){
 const sid=S.sid,item=queuePending().find(q=>String(q.id)===String(id));if(!sid||!item)return;
 const parts=splitAttachments(item.content),at=String(item.content).indexOf(ATTACH_HEAD),suffix=at<0?'':String(item.content).slice(at),files=[...parts.files,...(item.images||[]).map(x=>x.name||tr('이미지'))];
 openDialog(tr('대기 메시지 편집'),tr`<form class="form" id="queue-edit-form"><div class="field"><label for="queue-edit-text">메시지</label><textarea id="queue-edit-text" rows="6" maxlength="100000">${esc(parts.text)}</textarea>${files.length?tr`<span class="hint">첨부는 그대로 유지돼요: ${files.map(esc).join(', ')}</span>`:''}</div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`);
 $('queue-edit-form').addEventListener('submit',ev=>{ev.preventDefault();submitForm(ev.currentTarget,async()=>{const text=$('queue-edit-text').value.trim();if(!text&&!suffix&&!item.images?.length)throw new Error(tr('메시지를 입력해 주세요.'));const content=text+suffix;if(content.length>100000)throw new Error(tr('메시지와 첨부를 합쳐 100,000자 이하로 줄여 주세요.'));await api(`/api/sessions/${enc(sid)}/queue/${enc(id)}`,{method:'PATCH',body:{content}});closeDialog();if(S.sid===sid)await loadDetail();});});
}
const PRESETS={openai:{name:'OpenAI',kind:'responses',base_url:'https://api.openai.com/v1'},anthropic:{name:'Claude API',kind:'anthropic',base_url:'https://api.anthropic.com/v1'},gemini:{name:'Gemini API',kind:'gemini',base_url:'https://generativelanguage.googleapis.com/v1beta'},ollama:{name:'Ollama',kind:'ollama',base_url:'http://127.0.0.1:11434'},lmstudio:{name:'LM Studio',kind:'openai',base_url:'http://127.0.0.1:1234/v1'},openrouter:{name:'OpenRouter',kind:'openai',base_url:'https://openrouter.ai/api/v1'},deepseek:{name:'DeepSeek',kind:'openai',base_url:'https://api.deepseek.com/v1'},xai:{name:'xAI Grok',kind:'openai',base_url:'https://api.x.ai/v1'},mistral:{name:'Mistral',kind:'openai',base_url:'https://api.mistral.ai/v1'},groq:{name:'Groq',kind:'openai',base_url:'https://api.groq.com/openai/v1'},together:{name:'Together AI',kind:'openai',base_url:'https://api.together.xyz/v1'},fireworks:{name:'Fireworks AI',kind:'openai',base_url:'https://api.fireworks.ai/inference/v1'},cerebras:{name:'Cerebras',kind:'openai',base_url:'https://api.cerebras.ai/v1'},perplexity:{name:'Perplexity',kind:'openai',base_url:'https://api.perplexity.ai'},moonshot:{name:'Kimi (Moonshot)',kind:'openai',base_url:'https://api.moonshot.ai/v1'},zai:{name:'Z.ai GLM',kind:'openai',base_url:'https://api.z.ai/api/paas/v4'},minimax:{name:'MiniMax',kind:'openai',base_url:'https://api.minimax.io/v1'},qwen:{name:'Qwen (DashScope)',kind:'openai',base_url:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'},huggingface:{name:'Hugging Face',kind:'openai',base_url:'https://router.huggingface.co/v1'},nous:{name:'Nous Portal (Hermes)',kind:'openai',base_url:'https://inference-api.nousresearch.com/v1'},vllm:{name:'vLLM (로컬)',kind:'openai',base_url:'http://127.0.0.1:8000/v1'},llamacpp:{name:'llama.cpp (로컬)',kind:'openai',base_url:'http://127.0.0.1:8080/v1'},jan:{name:'Jan (로컬)',kind:'openai',base_url:'http://127.0.0.1:1337/v1'},custom:{name:'',kind:'openai',base_url:''}};
// More OpenAI-compatible services, offered in a list beside the common ones.
const MORE_PRESETS=['deepseek','xai','mistral','groq','together','fireworks','cerebras','perplexity','moonshot','zai','minimax','qwen','huggingface','nous','vllm','llamacpp','jan'];
const PRESET_NAMES=[['openai','OpenAI'],['anthropic','Claude API'],['gemini','Gemini API'],['ollama','Ollama'],['lmstudio','LM Studio'],['openrouter',tr('OpenRouter 키')],['custom',tr('직접 입력')]];
function editProvider(id){
 const old=providerById(id);const v=old?{...old}:{...PRESETS.openai,model:'',tools_enabled:true};
 const dlg=openDialog(old?tr('연결 편집'):tr('새 연결'),tr`${old?'':tr`<div class="presets" role="group" aria-label="빠른 설정">${PRESET_NAMES.map(([k,n],i)=>`<button type="button" class="${i===0?'on':''}" data-preset="${k}">${n}</button>`).join('')}</div><div class="field more-presets"><label for="pf-more">${tr('다른 제공자')}</label><select id="pf-more"><option value="">${tr('목록에서 고르기')}</option>${MORE_PRESETS.map(k=>`<option value="${k}">${esc(PRESETS[k].name)}</option>`).join('')}</select></div>`}
 <form class="form" id="provider-form"><div class="grid2"><div class="field"><label for="pf-name">이름</label><input id="pf-name" name="name" required maxlength="80" value="${esc(v.name)}"></div><div class="field"><label for="pf-kind">API 형식</label><select id="pf-kind" name="kind">${['responses','openai','anthropic','gemini','ollama'].map(k=>`<option value="${k}"${k===v.kind?' selected':''}>${KIND_LABEL[k]}</option>`).join('')}</select></div></div>
 <div class="field"><label for="pf-url">서버 주소</label><input id="pf-url" name="base_url" type="url" required value="${esc(v.base_url)}" placeholder="http://127.0.0.1:1234/v1"></div>
 <div class="field"><label for="pf-model">기본 모델</label><input id="pf-model" name="model" value="${esc(v.model||'')}" placeholder="비워 두면 대화에서 골라요" autocomplete="off"></div>
 <div class="field"><label for="pf-key">API 키</label><input id="pf-key" name="api_key" type="password" autocomplete="new-password" placeholder="${old?.has_key?tr('저장된 키를 그대로 써요'):tr('로컬 서버는 비워 두세요')}">${old?.has_key?tr('<label class="check"><input type="checkbox" name="clear_key"><span>저장된 키 지우기</span></label>'):''}</div>
 <label class="check"><input type="checkbox" name="tools_enabled"${v.tools_enabled!==false?' checked':''}><span>에이전트 도구 쓰기<small>도구 호출을 지원하지 않는 모델이면 끄세요.</small></span></label>
 <div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{wide:true});
 const usePreset=(key,b)=>{const p=PRESETS[key];if(!p)return;$('pf-name').value=p.name;$('pf-kind').value=p.kind;$('pf-url').value=p.base_url;dlg.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('on',x===b));if(b&&$('pf-more'))$('pf-more').value='';(p.base_url?$('pf-model'):$('pf-url')).focus();};
 dlg.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>usePreset(b.dataset.preset,b)));
 $('pf-more')?.addEventListener('change',ev=>usePreset(ev.target.value,null));
 $('provider-form').addEventListener('submit',ev=>{ev.preventDefault();const f=new FormData(ev.target),body=Object.fromEntries(f);body.tools_enabled=f.has('tools_enabled');body.clear_key=f.has('clear_key');if(old)body.id=old.id;
  submitForm(ev.target,async()=>{const saved=await api('/api/providers',{method:'POST',body});delete S.models[saved.id];delete S.modelFetch[saved.id];delete S.tests[saved.id];await refreshState();closeDialog();renderAll();toast(tr('저장했어요'));});});
}
function editSkill(id,instructions='',draft=null){
 const sk=(S.data.skills||[]).find(s=>String(s.id)===String(id))||draft||{name:'',description:'',instructions,enabled:true};
 openDialog(id?tr('스킬 편집'):draft?tr('가져온 스킬 확인'):tr('새 스킬'),tr`<form class="form" id="skill-form"><div class="field"><label for="sf-name">이름</label><input id="sf-name" name="name" required maxlength="100" value="${esc(sk.name)}" placeholder="예: 출처 있는 리서치"></div><div class="field"><label for="sf-desc">언제 쓰나요</label><input id="sf-desc" name="description" maxlength="300" value="${esc(sk.description)}" placeholder="예: 자료를 모아 보고서로 정리할 때"></div><div class="field"><label for="sf-ins">지침</label><textarea id="sf-ins" name="instructions" rows="9" required maxlength="20000" placeholder="목표, 순서, 끝났다고 볼 기준을 적어 주세요.">${esc(sk.instructions)}</textarea></div><label class="check"><input type="checkbox" name="enabled"${sk.enabled?' checked':''}><span>대화에서 고를 수 있게 켜 두기</span></label><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{wide:true,desc:draft?tr('선택한 파일의 지침만 복사해 모델에 전달해요. 도구와 참조 파일은 자동으로 추가되지 않아요. 파일 도구는 전체 접근 설정이 아니면 작업 폴더 밖을 읽지 못하며, 터미널 명령은 승인 설정을 따라요.'):''});
 $('skill-form').addEventListener('submit',ev=>{ev.preventDefault();const f=new FormData(ev.target),body=Object.fromEntries(f);body.enabled=f.has('enabled');if(id)body.id=id;submitForm(ev.target,async()=>{await api('/api/skills',{method:'POST',body});await refreshState();closeDialog();if(S.view==='skills')renderSkills();toast(tr('스킬을 저장했어요'));});});
}
function parseSkillFile(text,filename){
 if(!text.trim()||text.length>20000)throw Error(tr('스킬 지침은 1~20,000자여야 해요.'));
 const front=text.replace(/^\uFEFF/,'').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]||'';
 const field=key=>{const match=front.match(new RegExp('^'+key+':[ \\t]*(.*)$','m'));let v=match?.[1]?.trim()||'';if(/^[>|][+-]?$/.test(v)){const lines=front.slice(match.index+match[0].length).split(/\r?\n/).slice(1),content=[];for(const line of lines){if(line&&!/^[ \t]/.test(line))break;content.push(line.trim());}return content.join(v[0]==='>'?' ':'\n').trim();}if(v.startsWith('"')&&v.endsWith('"')){try{return JSON.parse(v)}catch{return v.slice(1,-1)}}if(v.startsWith("'")&&v.endsWith("'"))return v.slice(1,-1).replace(/''/g,"'");return v;};
 return {name:(field('name')||filename.replace(/\.md$/i,'')||tr('가져온 스킬')).slice(0,100),description:field('description').slice(0,300),instructions:text,enabled:true};
}
function importSkill(){
 const picker=document.createElement('input');picker.type='file';picker.accept='.md,text/markdown';
 picker.addEventListener('change',async()=>{const file=picker.files?.[0];if(!file)return;try{if(file.size>80000)throw Error(tr('스킬 지침은 20,000자 이하여야 해요.'));editSkill(null,'',parseSkillFile(await file.text(),file.name));}catch(err){toast(err.message||tr('파일을 읽지 못했어요.'),true);}});
 picker.click();
}
function skillDiscoveryHTML(list){
 if(!list.length)return tr('<p class="hint">설치된 스킬을 찾지 못했어요. 폴더를 직접 연결할 수 있어요.</p>');
 return list.map(s=>`<div class="item"><div class="txt"><div class="name">${esc(s.name)}</div>${s.description?`<span class="sub">${esc(s.description)}</span>`:''}<span class="sub" title="${esc(s.path)}">${esc(s.path)}</span></div><div class="acts2">${s.registered?tr('<span class="badge done">연결됨</span>'):tr`<button type="button" class="btn sm" data-act="import-discovered-skill" data-path="${esc(s.path)}">연결하고 선택</button>`}</div></div>`).join('');
}
async function connectSkillFolder(path){
 const skill=await api('/api/skills/import',{method:'POST',body:{path}});
 await refreshState();if(skill.enabled&&!S.skillIds.includes(String(skill.id)))S.skillIds.push(String(skill.id));
 closeDialog();if(S.view==='skills')renderSkills();toast(skill.enabled?tr('스킬을 연결하고 선택했어요'):tr('기존 스킬이 꺼져 있어요. 스킬 화면에서 켜 주세요.'));
}
async function discoverSkills(){
 const dlg=openDialog(tr('설치된 스킬 찾기'),tr('<div class="panel" id="skill-discover-results"><p class="hint">찾는 중…</p></div>'),{wide:true,desc:tr('추가할 스킬을 직접 선택하세요. 스킬의 지침, 폴더 경로와 참조 파일은 모델 제공자에게 전달될 수 있어요. 원본 변경 후에는 다시 연결하세요. 외부 도구는 별도로 설치해야 해요.')});
 const results=$('skill-discover-results');
 try{const data=await api('/api/skills/discover');if(dlg.open&&$('skill-discover-results')===results)results.innerHTML=skillDiscoveryHTML(Array.isArray(data.skills)?data.skills:[]);}
 catch(err){if(dlg.open&&$('skill-discover-results')===results)results.innerHTML=`<p class="hint bad">${esc(err.message||tr('스킬을 찾지 못했어요.'))}</p>`;}
}
async function importDiscoveredSkill(el){
 el.disabled=true;try{await connectSkillFolder(el.dataset.path);}catch(err){el.disabled=false;dialogError(err.message);}
}
function importSkillFolder(){
 const picker=window.naruDesktop?.chooseDirectory?tr`<button type="button" class="btn" data-act="pick-folder" data-id="skill-folder-path">고르기${icon('folder')}</button>`:'';
 openDialog(tr('스킬 폴더 연결'),tr`<form class="form" id="skill-folder-form"><div class="field"><label for="skill-folder-path">SKILL.md가 들어 있는 폴더</label><div class="inrow"><input id="skill-folder-path" name="path" required placeholder="예: /Users/name/.agents/skills/ego-browser">${picker}</div><span class="hint">스킬의 지침, 폴더 경로와 참조 파일은 모델 제공자에게 전달될 수 있어요. 원본 변경 후에는 다시 연결하세요. 외부 도구는 별도로 설치해야 해요.</span></div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">연결하고 선택</button></div></form>`,{wide:true,desc:tr('연결 후 입력창의 스킬 메뉴에서 선택하세요. 파일 변경과 명령 실행은 도구 승인 설정을 따라요.')});
 $('skill-folder-form').addEventListener('submit',ev=>{ev.preventDefault();const path=$('skill-folder-path').value.trim();if(!path){dialogError(tr('스킬 폴더를 선택하세요.'));return;}return submitForm(ev.target,()=>connectSkillFolder(path));});
}
function saveMemoryDialog(content){
 openDialog(tr('메모리로 저장'),tr`<form class="form" id="mem-form"><div class="field"><label for="mf-text">기억할 내용</label><textarea id="mf-text" rows="7" maxlength="4000" required>${esc(String(content).slice(0,4000))}</textarea></div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{desc:tr('다음 대화부터 함께 전달돼요. 필요한 부분만 남기세요.'),wide:true});
 $('mem-form').addEventListener('submit',ev=>{ev.preventDefault();submitForm(ev.target,async()=>{await api('/api/memories',{method:'POST',body:{content:$('mf-text').value.trim()}});await refreshState();closeDialog();toast(tr('메모리에 저장했어요'));});});
}
async function openArtifact(id){
 const dlg=$('preview');S.blobs.forEach(u=>URL.revokeObjectURL(u));S.blobs=[];
 dlg.classList.add('window');dlg.classList.remove('max');
 dlg.innerHTML=`${winBar(tr('불러오는 중'))}<div class="pv-body"></div>`;
 if(!dlg.open)dlg.showModal();
 try{
  const info=await api(`/api/artifacts/${enc(id)}/content`),dl=`/api/artifacts/${enc(id)}/download`,name=info.name,ext=(name.split('.').pop()||'').toLowerCase();
  const tools=tr`${window.naruDesktop?.revealPath?iconBtn('folder',tr('Finder에서 보기'),'reveal','',`data-path="${esc(info.path)}"`):''}${window.naruDesktop?.openPath?iconBtn('external',tr('기본 앱으로 열기'),'open-path','',`data-path="${esc(info.path)}"`):''}<a class="icon-btn" href="${dl}" download title="내려받기" aria-label="내려받기">${icon('download')}</a>`;
  let body;
  if(/^image\/(png|jpeg|gif|webp)$/.test(info.mime))body=`<img src="${dl}?inline=1" alt="${esc(name)}">`;
  else if(info.text!=null&&(ext==='html'||ext==='htm')){const u=URL.createObjectURL(new Blob([info.text],{type:'text/html'}));S.blobs.push(u);body=tr`<iframe sandbox="" src="${u}" title="${esc(name)} 미리보기"></iframe>`;}
  else if(info.text!=null&&ext==='svg'){const u=URL.createObjectURL(new Blob([info.text],{type:'image/svg+xml'}));S.blobs.push(u);body=`<img src="${u}" alt="${esc(name)}">`;}
  else if(info.text!=null&&(ext==='md'||ext==='markdown'))body=`<div class="md">${markdown(info.text)}</div>`;
  else if(info.text!=null)body=`<pre>${esc(info.text)}</pre>`;
  else body=tr('<div class="blank"><p>여기서는 미리 볼 수 없는 형식이에요.</p></div>');
  dlg.innerHTML=`${winBar(name,tools)}<div class="pv-body">${body}</div>`;
 }catch(err){dlg.querySelector('.pv-body').innerHTML=`<div class="blank"><p>${esc(err.message)}</p></div>`;}
}

// ---------- pages ----------
function page(title,body,action=''){return `<div class="page" id="page"><div class="page-in"><div class="page-head"><h1>${esc(title)}</h1>${action}</div>${body}</div></div>`;}
function renderModels(){
 const a=S.accounts||S.data.accounts;
 const rows=[['codex','ChatGPT'],['claude_code','Claude'],['gemini_cli','Gemini'],['copilot_cli','GitHub Copilot'],['openrouter','OpenRouter']];
 const acct=([key,name])=>{
  const st=a?.[key];let badge='',sub='',act='';
  if(!st)badge=tr('<span class="spinner" role="img" aria-label="확인하는 중"></span>');
  else if(st.execution_blocked){badge=tr('<span class="badge attention">사용 일시 중지</span>');sub=key==='gemini_cli'?tr('도구 격리 검증 중 · Gemini API를 사용하세요.'):tr('도구 격리 검증 중 · 다른 모델의 API를 사용하세요.');act=tr('<button type="button" class="btn sm" data-act="add-provider">API 연결 추가</button>');}
  else if(key!=='openrouter'&&!st.available){badge=tr('<span class="badge neutral">설치 필요</span>');sub=st.install?`<code>${esc(st.install)}</code>`:'';act=tr`<button type="button" class="btn sm" data-act="copy-install" data-id="${key}">설치 명령 복사${icon('copy')}</button>`;}
  else if(!st.authenticated){badge=tr('<span class="badge attention">로그인 필요</span>');act=tr`<button type="button" class="btn sm" data-act="account-login" data-id="${key}">로그인</button>`;}
  else{badge=tr('<span class="badge done">연결됨</span>');if(/API 키|@/.test(st.message||''))sub=esc(st.message);act=tr`<button type="button" class="btn sm" data-act="account-use" data-id="${key}">대화 시작</button>${key==='openrouter'?iconBtn('retry',tr('다시 로그인'),'account-login',key):''}`;}
  return `<div class="item model-row"><span class="model-icon" aria-hidden="true">${icon('skill')}</span><div class="txt"><div class="name">${esc(name)}${badge}</div>${sub?`<span class="sub ${st?.execution_blocked?'block-detail':''}"${st?.execution_blocked&&st.message?` title="${esc(st.message)}"`:''}>${sub}</span>`:''}</div><div class="acts2">${act}</div></div>`;
 };
 const apis=providers().filter(p=>!ACCOUNT_KINDS.includes(p.kind)&&p.account!=='openrouter');
 const apiRow=p=>{const t=S.tests[p.id];const badge=!t?'':t.pending?tr('<span class="spinner" role="img" aria-label="확인하는 중"></span>'):t.ok?tr('<span class="badge done">응답함</span>'):tr('<span class="badge error">연결 안 됨</span>');
  const isLocal=p.kind==='ollama'||/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(host(p.base_url));
  return tr`<div class="item model-row"><span class="model-icon" aria-hidden="true">${icon(isLocal?'terminal':'globe')}</span><div class="txt"><div class="name">${esc(p.name)}${badge}</div><span class="sub">${esc(p.model||host(p.base_url))}${p.model?`<i class="host">${esc(host(p.base_url))}</i>`:''}</span>${t&&!t.pending&&!t.ok&&t.message?`<span class="sub bad">${esc(t.message)}</span>`:''}</div><div class="acts2"><button type="button" class="btn sm ghost" data-act="test-provider" data-id="${esc(p.id)}"${t?.pending?' disabled':''}>확인</button><button type="button" class="btn sm" data-act="use-provider" data-id="${esc(p.id)}">대화 시작</button>${iconBtn('edit',tr('편집'),'edit-provider',p.id)}${iconBtn('trash',tr('삭제'),'delete-provider',p.id)}</div></div>`;};
 $('main').innerHTML=page(tr('모델'),tr`<div class="models-page"><h2>계정으로 연결<span class="grow"></span>${iconBtn('retry',tr('상태 다시 확인'),'accounts-refresh')}</h2><div class="panel model-list">${rows.map(acct).join('')}</div>
 <h2>API와 로컬 서버<span class="grow"></span>${apis.length?tr`<button type="button" class="btn sm" data-act="add-provider">연결 추가${icon('plus')}</button>`:''}</h2>
 <div class="panel model-list">${apis.length?apis.map(apiRow).join(''):tr('<div class="blank"><p>Ollama, LM Studio 같은 로컬 서버나 API 키로 모델을 더할 수 있어요.</p><button type="button" class="btn primary" data-act="add-provider">연결 추가</button></div>')}</div></div>`);
}
function renderSkills(){
 const list=S.data.skills||[];
 $('main').innerHTML=page(tr('스킬'),tr`<p class="lead">스킬 지침은 모델에 전달되며, 도구는 에이전트 모드의 승인 설정을 따라요.</p><div class="panel design-grid">${list.length?list.map(s=>tr`<div class="item"><span class="glyph" aria-hidden="true">${icon('skill')}</span><div class="txt"><div class="name">${esc(s.name)}</div>${s.description?`<span class="sub">${esc(s.description)}</span>`:''}${s.source_dir?tr`<span class="sub" title="${esc(s.source_dir)}">폴더 연결됨</span>`:''}</div><div class="acts2"><button type="button" class="switch" role="switch" aria-checked="${!!s.enabled}" aria-label="${esc(s.name)} 켜기" data-act="skill-toggle" data-id="${esc(s.id)}"></button>${iconBtn('edit',tr('편집'),'edit-skill',s.id)}${iconBtn('trash',tr('삭제'),'delete-skill',s.id)}</div></div>`).join(''):tr('<div class="blank"><p>아직 스킬이 없어요.</p></div>')}</div>`,tr`<div class="skill-actions"><button type="button" class="btn" data-act="discover-skills">설치된 스킬 찾기</button><button type="button" class="btn" data-act="import-skill-folder">스킬 폴더 연결</button><button type="button" class="btn" data-act="import-skill">파일만 가져오기</button><button type="button" class="btn primary" data-act="add-skill">스킬 만들기${icon('plus')}</button></div>`);
}
function renderWorkflows(){
 const list=S.data.workflows||[];
 $('main').innerHTML=page(tr('작업 흐름'),tr`<p class="lead">선택한 모델로 새 대화를 시작해요. 모델 사용량과 도구 승인 설정이 적용돼요.</p><div class="panel design-grid">${list.length?list.map(w=>tr`<div class="item"><span class="glyph" aria-hidden="true">${icon('bolt')}</span><div class="txt"><div class="name">${esc(w.name)} <span class="badge neutral">${w.mode==='agent'?tr('에이전트'):w.mode==='plan'?tr('계획'):tr('대화')}</span></div></div><div class="acts2"><button type="button" class="btn primary sm" data-act="run-workflow" data-id="${esc(w.id)}">실행</button>${iconBtn('edit',tr('편집'),'edit-workflow',w.id)}${iconBtn('trash',tr('삭제'),'delete-workflow',w.id)}</div></div>`).join(''):tr('<div class="blank"><p>저장된 작업 흐름이 없어요.</p></div>')}</div>`,tr`<button type="button" class="btn primary" data-act="add-workflow">작업 흐름 만들기${icon('plus')}</button>`);
}
function editWorkflow(id){
 const item=id?(S.data.workflows||[]).find(w=>String(w.id)===String(id)):null;if(id&&!item)return;
 const w=item||{name:'',prompt:'',mode:'agent'};
 openDialog(id?tr('작업 흐름 편집'):tr('작업 흐름 만들기'),tr`<form class="form" id="workflow-form"><div class="field"><label for="wf-name">이름</label><input id="wf-name" name="name" maxlength="100" required value="${esc(w.name)}"></div><div class="field"><label for="wf-prompt">지침</label><textarea id="wf-prompt" name="prompt" rows="7" maxlength="20000" required>${esc(w.prompt)}</textarea></div><div class="field"><label for="wf-mode">작업 방식</label><select id="wf-mode" name="mode"><option value="agent"${w.mode==='agent'?' selected':''}>에이전트</option><option value="chat"${w.mode==='chat'?' selected':''}>대화</option><option value="plan"${w.mode==='plan'?' selected':''}>계획</option></select></div><div class="actions"><button type="button" class="btn ghost" data-act="close-dialog">취소</button><button type="submit" class="btn primary">저장</button></div></form>`,{wide:true});
 $('workflow-form').addEventListener('submit',ev=>{ev.preventDefault();const body=Object.fromEntries(new FormData(ev.target));submitForm(ev.target,async()=>{await api(id?`/api/workflows/${enc(id)}`:'/api/workflows',{method:id?'PATCH':'POST',body});await refreshState();closeDialog();if(S.view==='workflows')renderWorkflows();toast(tr('저장했어요'));});});
}
async function runWorkflow(id){
 if(S.workflowStarting)return;
 const w=(S.data.workflows||[]).find(x=>String(x.id)===String(id));if(!w)return;
 const p=provider(),acct=accountOf(p);
 if(!p){go('models');toast(tr('먼저 모델을 연결하세요.'));return;}
 if(isAccount(p)&&acct?.execution_blocked){go('models');toast(acct.message||tr('이 계정 연결은 사용할 수 없습니다.'),true);return;}
 if(isAccount(p)&&acct&&(!acct.available||!acct.authenticated)){go('models');toast(tr`${p.name} 연결 상태를 확인하세요.`,true);return;}
 if(!isAccount(p)&&!S.model&&!p.model){toast(tr('대화에서 사용할 모델을 먼저 선택하세요.'),true);return;}
 const pageEl=$('page'),epoch=S.epoch,model=S.model,mode=w.mode,skillIds=selectedSkills().map(s=>s.id),content=w.prompt;S.workflowStarting=true;
 try{
  const session=await api('/api/sessions',{method:'POST',body:{title:w.name,provider_id:p.id,model,mode}});
  if(!S.data.sessions.some(s=>s.id===session.id))S.data.sessions.unshift(session);
  try{await api(`/api/sessions/${enc(session.id)}/messages`,{method:'POST',body:{content,provider_id:p.id,model,mode,skill_ids:skillIds}});}
  catch(err){
   S.drafts[session.id]=content;
   if(S.view==='workflows'&&S.epoch===epoch&&$('page')===pageEl)await selectSession(session.id);
   refreshState().then(()=>renderSide()).catch(()=>{});
   throw new Error(tr('작업을 시작하지 못해 지침을 새 대화의 초안에 보관했어요. ')+err.message);
  }
  S.data.active={...(S.data.active||{}),[session.id]:'running'};
  if(S.view==='workflows'&&S.epoch===epoch&&$('page')===pageEl)await selectSession(session.id);
  refreshState().then(()=>renderSide()).catch(()=>{});
 }finally{S.workflowStarting=false;}
}
function renderMemory(){
 const list=S.data.memories||[];
 $('main').innerHTML=page(tr('메모리'),tr`<p class="lead">여기 적은 내용은 모든 대화에 함께 전달돼요. 직접 적은 것만 기억해요.</p><form class="panel" id="memory-form" style="padding:12px;gap:8px"><label class="sr" for="memory-input">새 메모리</label><textarea id="memory-input" rows="3" maxlength="4000" placeholder="예: 보고서는 짧은 문단으로, 결론부터 써 줘." style="box-shadow:none;padding:4px 6px;min-height:64px"></textarea><div class="actions" style="margin:0"><button type="submit" class="btn primary">저장</button></div></form>${list.length?tr`<h2>저장한 내용</h2><div class="panel">${list.map(m=>`<div class="item"><div class="txt body-text">${esc(m.content)}</div><div class="acts2">${iconBtn('trash',tr('삭제'),'delete-memory',m.id)}</div></div>`).join('')}</div>`:''}`);
 $('memory-form').addEventListener('submit',async ev=>{ev.preventDefault();const t=$('memory-input'),content=t.value.trim();if(!content)return;try{await api('/api/memories',{method:'POST',body:{content}});await refreshState();renderMemory();toast(tr('저장했어요'));}catch(err){toast(err.message,true);}});
}
function setLanguage(language){
 if(!['ko','en'].includes(language)||!window.NaruI18n)return;
 const form=$('settings-form'),draft=form?Array.from(form.elements).filter(el=>el.name).map(el=>[el.name,el.value]):[];
 pref.set('language',language);window.NaruI18n.set(language);selectionButton?.remove();selectionButton=null;selectionReply=null;localeRefresh.forEach(update=>update());
 renderAll();
 for(const [name,value] of draft){const field=$('settings-form')?.elements.namedItem(name);if(field)field.value=value;}
 const skip=document.querySelector('.skip');if(skip)skip.textContent=language==='en'?'Skip to content':'본문으로 건너뛰기';
 $('side')?.setAttribute('aria-label',language==='en'?'Chat list':'대화 목록');
}
const THEME_CARDS=[['naru','Naru','#f7f7f7','#000000','#1a1a1a','#ffffff','#0880f7'],['defined','Defined','#ffffff','#000000','#000000','#ffffff',''],['cursor','Cursor','#f7f7f4','#26251e','#1c1b17','#f7f7f4','#f54e00'],['vercel','Vercel','#fafafa','#171717','#0a0a0a','#ededed','#0070f3'],['raycast','Raycast','#f4f4f6','#121212','#07080a','#f4f4f6','#ff6363']];
function themePickerHTML(){
 const {mode,style}=themePrefs();
 return `<h3 class="set-sub">${esc(tr('테마'))}</h3><div class="theme-picker" role="group" aria-label="${esc(tr('테마'))}">${THEME_CARDS.map(([k,n,lb,li,db,di,ac])=>`<button type="button" class="theme-opt" data-act="theme" data-id="${k}" aria-pressed="${style===k}"><span class="theme-swatch" aria-hidden="true"><span style="background:${lb};color:${li}">Aa</span><span style="background:${db};color:${di}">Aa</span>${ac?`<i style="background:${ac}"></i>`:''}</span><span>${n}</span></button>`).join('')}</div>
 <h3 class="set-sub">${esc(tr('밝기'))}</h3><div class="seg wide" role="group" aria-label="${esc(tr('밝기'))}">${MODES.map(k=>`<button type="button" data-act="brightness" data-id="${k}" aria-pressed="${mode===k}">${k==='system'?tr('시스템'):k==='light'?tr('밝게'):tr('어둡게')}</button>`).join('')}</div>`;
}
function renderSettings(){
 const x=S.data.settings,theme=pref.get('theme','dark'),desk=!!window.naruDesktop?.chooseDirectory;
 const picker=id=>desk?tr`<button type="button" class="btn" data-act="pick-folder" data-id="${id}" title="폴더 고르기">고르기${icon('folder')}</button>`:'';
 $('main').innerHTML=page(tr('설정'),tr`<form class="form" id="settings-form">
 <h2>언어</h2><div class="seg wide" role="group" aria-label="Language">${[['ko','한국어'],['en','English']].map(([code,label])=>`<button type="button" data-act="language" data-id="${code}" aria-pressed="${(window.NaruI18n?.language||'ko')===code}">${label}</button>`).join('')}</div>
 <h2>화면</h2>${themePickerHTML()}
 <h2>알림</h2><div class="field" id="notification-setting">${notificationHTML()}</div>
 <h2>업데이트</h2><div id="update-setting" class="update-setting" role="status" aria-live="polite">${updateHTML()}</div>
 <h2>폴더</h2><div class="field"><label for="st-ws">작업 폴더</label><div class="inrow"><input id="st-ws" name="workspace" required value="${esc(x.workspace)}">${picker('st-ws')}</div><span class="hint">프로젝트 지침은 모델 제공자에게 전달돼요.</span></div>
 <div class="field"><label for="st-rp">보고서 폴더</label><div class="inrow"><input id="st-rp" name="report_directory" required value="${esc(x.report_directory)}">${picker('st-rp')}</div></div>
 <h2>도구 승인</h2><div class="field"><label for="st-access">접근 권한</label><select id="st-access" name="access_mode" aria-describedby="st-access-help">${[['manual',tr('매번 승인')],['auto_approve',tr('자동 승인 (Approve for me)')],['full_access',tr('전체 접근 (Full access)')]].map(([k,n])=>`<option value="${k}"${(x.access_mode||'manual')===k?' selected':''}>${n}</option>`).join('')}</select><div id="st-access-help" class="hint">
 <p><strong>매번 승인:</strong> 파일 쓰기·수정, 터미널 명령, 스킬 불러오기, 이전 대화 검색, Git 변경 조회 전에 승인해요.</p>
 <p><strong>자동 승인:</strong> 작업·보고서 폴더의 파일 쓰기·수정과 터미널 명령을 자동 승인해요. 스킬 불러오기, 이전 대화 검색, Git 변경 조회는 각각 승인해요.</p>
 <p><strong>전체 접근:</strong> Naru의 파일 도구가 현재 macOS 사용자에게 허용된 모든 경로에 접근하며 모든 도구를 자동 승인해요. 이전 대화와 Git 변경 내용이 연결된 모델 제공자에게 전달될 수 있어요.</p>
 <p>자동 승인과 전체 접근의 터미널 명령은 샌드박스 없이 현재 사용자 권한으로 실행되며, 선택한 폴더 밖의 파일도 읽거나 변경할 수 있어요. 설정은 새 작업부터 적용되고 진행 중이거나 재개하는 작업은 기존 권한을 유지해요.</p></div></div>
 <h2>실행</h2><div class="grid2"><div class="field"><label for="st-steps">한 번에 쓰는 도구 단계</label><input id="st-steps" name="max_steps" type="number" min="1" max="50" required value="${esc(x.max_steps||12)}"></div><div class="field"><label for="st-tok">최대 출력 토큰</label><input id="st-tok" name="max_output_tokens" type="number" min="256" max="32768" step="256" required value="${esc(x.max_output_tokens||4096)}"></div></div>
 <h2>모든 대화에 줄 지침</h2><div class="field"><label class="sr" for="st-sys">지침</label><textarea id="st-sys" name="system_prompt" rows="6">${esc(x.system_prompt||'')}</textarea></div>
 <div class="actions"><button type="submit" class="btn primary">저장</button></div></form>`);
 $('settings-form').addEventListener('submit',async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));b.max_steps=Number(b.max_steps);b.max_output_tokens=Number(b.max_output_tokens);try{await api('/api/settings',{method:'POST',body:b});await refreshState();toast(tr('설정을 저장했어요'));}catch(err){toast(err.message,true);}});
}


// ---------- app updates ----------
let updateSubscribed=false,updateRevision=0,applyingUpdate=false;
function updateHTML(){
 const bridge=window.naruDesktop,state=S.update||{status:bridge?.updateState?'idle':'disabled'},status=state.status;
 const version=S.data?.version?`<span class="update-version">v${esc(S.data.version)}</span>`:'';
 const check=tr('<button type="button" class="btn" data-act="update-check">업데이트 확인</button>');
 let text='',action='';
 if(status==='disabled')text=tr(state.message)||tr('이 환경에서는 자동 업데이트를 사용할 수 없어요.');
 else if(status==='checking')text=tr('업데이트 확인 중…');
 else if(status==='downloading'){const n=Number(state.progress);text=Number.isFinite(n)?tr`업데이트 다운로드 중 · ${Math.max(0,Math.min(100,Math.round(n)))}%`:tr('업데이트 다운로드 중…');}
 else if(status==='ready'){text=state.version?tr`v${state.version} 업데이트 준비됨`:tr('업데이트 준비됨');action=tr('<button type="button" class="btn primary" data-act="update-install">다시 시작해 업데이트</button>');}
 else if(status==='error'){text=tr(state.message)||tr('업데이트를 확인하지 못했어요.');action=check;}
 else if(status==='up_to_date'){text=tr('최신 버전이에요.');action=check;}
 else{text=tr('자동으로 업데이트를 확인해요.');action=check;}
 return `<div class="update-status${status==='error'?' bad':''}">${version}<span>${esc(text)}</span></div>${action}`;
}
function applyUpdateState(state){
 if(!state||!['disabled','idle','checking','downloading','ready','up_to_date','error'].includes(state.status))return;
 const wasReady=S.update?.status==='ready';S.update=state;updateRevision++;
 const section=$('update-setting');if(section)section.innerHTML=updateHTML();
 if(S.data&&wasReady!==(state.status==='ready')){renderSide();renderTop();}
}
function initUpdater(){
 if(updateSubscribed)return;updateSubscribed=true;const bridge=window.naruDesktop;
 if(!bridge?.updateState){applyUpdateState({status:'disabled'});return;}
 try{bridge.onUpdateState?.(state=>applyUpdateState(state));}catch{}
 const revision=updateRevision;
 Promise.resolve().then(()=>bridge.updateState()).then(state=>{if(revision===updateRevision)applyUpdateState(state);}).catch(()=>{if(revision===updateRevision)applyUpdateState({status:'error',message:tr('업데이트 상태를 확인하지 못했어요.')});});
}
async function checkUpdate(){
 const bridge=window.naruDesktop;if(!bridge?.checkForUpdates)return;
 const revision=updateRevision;
 try{const state=await bridge.checkForUpdates();if(revision===updateRevision&&state)applyUpdateState(state);}
 catch(err){applyUpdateState({status:'error',message:err.message||tr('업데이트를 확인하지 못했어요.')});}
}
async function installUpdate(){
 const bridge=window.naruDesktop;if(!bridge?.installUpdate||S.update?.status!=='ready')return;
 if(S.sending||S.workflowStarting||S.accessSaving||Object.keys(fileReads).length||Object.keys(S.data?.active||{}).length){toast(tr('진행 중인 작업이나 파일 읽기를 마친 뒤 업데이트해 주세요.'),true);return;}
 confirmDialog(tr('Naru를 다시 시작할까요?'),tr('저장하지 않은 입력, 첨부와 설정 변경이 사라질 수 있어요.'),tr('다시 시작'),async()=>{
  const dlg=$('dialog'),confirm=$('confirm-yes');applyingUpdate=true;const buttons=[...dlg.querySelectorAll('button')];buttons.forEach(b=>{b.disabled=true;});confirm.textContent=tr('업데이트 적용 중…');dlg.setAttribute('aria-busy','true');
  try{await bridge.installUpdate();}
  catch(err){applyingUpdate=false;buttons.forEach(b=>{b.disabled=false;});confirm.textContent=tr('다시 시작');dlg.removeAttribute?.('aria-busy');throw err;}
 });
}

// ---------- accounts ----------
async function accountLogin(key){
 const r=await api(`/api/accounts/${enc(key)}/login`,{method:'POST',body:{}});
 if(r.url){await openExternal(r.url);toast(tr('브라우저에서 OpenRouter 로그인을 마치세요.'));}
 else toast(r.terminal?tr('터미널에서 로그인을 마치면 자동으로 확인해요.'):tr('브라우저에서 로그인을 마치면 자동으로 확인해요.'));
 clearInterval(S.watch);let n=0;
 S.watch=setInterval(async()=>{n++;try{S.accounts=await api('/api/accounts?refresh=1');if(S.accounts[key]?.authenticated){clearInterval(S.watch);await refreshState();toast(tr`${ACCOUNT_NAMES[key]} 연결됨`,false,{label:'대화 시작',run:()=>accountUse(key).catch(err=>toast(err.message,true))});}if(S.view==='models')renderModels();}catch{}if(n>75)clearInterval(S.watch);},4000);
}
async function accountUse(key){
 if((S.accounts||S.data?.accounts)?.[key]?.execution_blocked){toast(tr('이 계정 연결은 일시 중지되었어요. API 연결을 사용하세요.'),true);return;}
 const p=await api(`/api/accounts/${enc(key)}/connect`,{method:'POST',body:{}});
 await refreshState();S.providerId=p.id;S.model=p.model||'';newChat();
}

// ---------- events ----------
document.addEventListener('pointerdown',ev=>{if(selectionButton&&!selectionButton.contains(ev.target))hideSelectionReply();});
document.addEventListener('pointerup',ev=>{if(!selectionButton?.contains(ev.target))showSelectionReply();});
document.addEventListener('keyup',ev=>{if(ev.shiftKey||ev.key==='Shift')showSelectionReply();});
document.addEventListener('scroll',hideSelectionReply,true);
document.addEventListener('input',ev=>{const input=ev.target.closest?.('[data-question-input]');if(input)questionDrafts[input.dataset.questionInput]=input.value;});
const ACT={
 'new':()=>newChat(),
 'palette':()=>openPalette(),
 'toggle-side':()=>{if(innerWidth<=760){closeSide();return;}setSide(!S.sideHidden);},
 'open-side':()=>$('app').classList.add('side-open'),
 'close-side':()=>closeSide(),
 'drawer':()=>{S.drawer=!S.drawer;pref.set('drawer',S.drawer?'1':'0');$('drawer')?.classList.toggle('open',S.drawer);renderTop();},
 'chat-menu':el=>chatMenu(el),
 'delete-chat':el=>deleteChat(el.dataset.id),
 'rename':()=>startRename(),
 'attach':()=>$('file-input')?.click(),
 'image-mode':()=>openImagePicker(),
 'image-connect':()=>{closeDialog();go('models');},
 'remove-file':el=>{const key=draftKey();S.files[key]=attachments().filter((_,i)=>i!==+el.dataset.id);renderChips();},
 'model-menu':()=>pop&&pop.anchor===$('model-chip')?closePop():modelMenu(),
 'reasoning-menu':()=>pop&&pop.anchor===$('reasoning-chip')?closePop():openReasoningMenu(),
 'skills-menu':()=>pop&&pop.anchor===$('skill-chip')?closePop():skillsMenu(),
 'session-access':()=>openSessionAccess(),
 'mode':async el=>{if(S.modeSaving||S.sending)return;const sid=S.sid,epoch=S.epoch,key=draftKey(),previous=S.mode,oldImage=S.imageModes[key],mode=el.dataset.mode;S.mode=mode;if(mode==='plan')delete S.imageModes[key];if(sid){modeValues[sid]=mode;modeVersions[sid]=(modeVersions[sid]||0)+1;S.modeSaving=true;S.modeSaveSid=sid;if(S.detail?.session)S.detail.session.mode=mode;}renderTools();if(sid)try{await api(`/api/sessions/${enc(sid)}`,{method:'PATCH',body:{mode}});}catch(err){modeValues[sid]=previous;if(oldImage)S.imageModes[key]=oldImage;if(S.sid===sid&&S.epoch===epoch){S.mode=previous;if(S.detail?.session)S.detail.session.mode=previous;}toast(err.message,true);}finally{modeVersions[sid]=(modeVersions[sid]||0)+1;S.modeSaving=false;S.modeSaveSid=null;if(S.view==='chat')renderTools();}},
 'answer-option':async el=>{const q=S.detail?.approvals?.find(a=>String(a.id)===el.dataset.id);const answer=q?.arguments?.options?.[Number(el.dataset.index)];if(typeof answer==='string'){el.disabled=true;try{await answerQuestion(el.dataset.id,answer);}finally{if(el.isConnected)el.disabled=false;}}},
 'answer-question':async el=>{const input=el.closest('.question-card')?.querySelector('[data-question-input]');el.disabled=true;try{await answerQuestion(el.dataset.id,input?.value);}finally{if(el.isConnected)el.disabled=false;}} ,
 'followup-mode':el=>{if(!S.sid||S.sending)return;if(el.dataset.mode==='steer'&&!canSteer())return;if(el.dataset.mode!=='steer')delete steeringAttempts[S.sid];followupModes[S.sid]={mode:el.dataset.mode==='steer'?'steer':'queue',runId:latestRun()?.id};renderTools();},
 'queue-edit':el=>editQueue(el.dataset.id),
 'queue-remove':async el=>{const sid=S.sid;el.disabled=true;await api(`/api/sessions/${enc(sid)}/queue/${enc(el.dataset.id)}`,{method:'DELETE'});if(S.sid===sid)await loadDetail();},
 'queue-resume':async el=>{const sid=S.sid;el.disabled=true;await api(`/api/sessions/${enc(sid)}/queue/resume`,{method:'POST',body:{}});if(S.sid===sid)await loadDetail();refreshState().then(()=>renderSide()).catch(()=>{});},
 'stop':async el=>{const r=latestRun();if(!r)return;el.disabled=true;await api(`/api/runs/${enc(r.id)}/cancel`,{method:'POST',body:{}});await loadDetail();},
 'resume':async el=>{el.disabled=true;await api(`/api/runs/${enc(el.dataset.id)}/resume`,{method:'POST',body:{}});S.data.active={...(S.data.active||{}),[S.sid]:'running'};await loadDetail();renderSide();},
 'regenerate':async el=>{el.disabled=true;await api(`/api/sessions/${enc(S.sid)}/regenerate`,{method:'POST',body:{provider_id:S.providerId,model:S.model,mode:S.mode,reasoning_effort:sessionReasoning(),skill_ids:selectedSkills().map(s=>s.id)}});S.data.active={...(S.data.active||{}),[S.sid]:'running'};await loadDetail();renderSide();},
 'toggle-run':el=>{const id=el.dataset.id,run=S.detail.runs.find(r=>r.id===id),broken=run&&['failed','cancelled','interrupted'].includes(run.status)&&run===latestRun();if(broken){S.open.has('x'+id)?S.open.delete('x'+id):S.open.add('x'+id);}else{S.open.has(id)?S.open.delete(id):S.open.add(id);}renderThread();},
 'toggle-step':el=>{const id=el.dataset.id;S.steps.has(id)?S.steps.delete(id):S.steps.add(id);renderThread();},
 'copy-code':el=>copyText(S.codes[+el.dataset.id]||''),
 'copy-msg':el=>copyText(S.msgs.get(el.dataset.id)||''),
 'fork-message':async el=>{el.disabled=true;try{await forkMessage(el.dataset.id);}finally{if(el.isConnected)el.disabled=false;}},
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
 'copy-install':el=>copyText((S.accounts||{})[el.dataset.id]?.install||'',tr('설치 명령을 복사했어요. 터미널에 붙여 넣으세요.')),
 'add-provider':()=>editProvider(),
 'edit-provider':el=>editProvider(el.dataset.id),
 'delete-provider':el=>{const p=providerById(el.dataset.id);confirmDialog(tr`${p?.name||tr('연결')}을 삭제할까요?`,tr('저장된 키도 함께 지워져요. 지난 대화는 남아요.'),tr('삭제'),async()=>{await api(`/api/providers/${enc(el.dataset.id)}`,{method:'DELETE'});delete S.models[el.dataset.id];delete S.modelFetch[el.dataset.id];await refreshState();renderModels();toast(tr('삭제했어요'));});},
 'test-provider':async el=>{const id=el.dataset.id;S.tests[id]={pending:true};renderModels();try{const r=await api(`/api/providers/${enc(id)}/test`,{method:'POST',body:{}});S.tests[id]=r;if(r.models?.length)S.models[id]=r.models;}catch(err){S.tests[id]={ok:false,message:err.message};}if(S.view==='models')renderModels();},
 'use-provider':el=>{const p=providerById(el.dataset.id);if(!p)return;S.providerId=p.id;S.model=p.model||'';newChat();},
 'add-skill':()=>editSkill(),
 'import-skill':()=>importSkill(),
 'import-skill-folder':()=>importSkillFolder(),
 'discover-skills':()=>discoverSkills(),
 'import-discovered-skill':el=>importDiscoveredSkill(el),
 'edit-skill':el=>editSkill(el.dataset.id),
 'delete-skill':el=>confirmDialog(tr('스킬을 삭제할까요?'),tr('이 스킬의 지침이 지워져요.'),tr('삭제'),async()=>{await api(`/api/skills/${enc(el.dataset.id)}`,{method:'DELETE'});await refreshState();renderSkills();toast(tr('삭제했어요'));}),
 'skill-toggle':async el=>{const s=S.data.skills.find(x=>String(x.id)===el.dataset.id);if(!s)return;el.setAttribute('aria-checked',String(!s.enabled));try{await api('/api/skills',{method:'POST',body:{...s,enabled:!s.enabled}});await refreshState();renderSkills();}catch(err){toast(err.message,true);renderSkills();}},
 'add-workflow':()=>editWorkflow(),
 'edit-workflow':el=>editWorkflow(el.dataset.id),
 'delete-workflow':el=>confirmDialog(tr('작업 흐름을 삭제할까요?'),tr('이 설정만 삭제되고 이전 대화는 남아요.'),tr('삭제'),async()=>{await api(`/api/workflows/${enc(el.dataset.id)}`,{method:'DELETE'});await refreshState();if(S.view==='workflows')renderWorkflows();toast(tr('삭제했어요'));}),
 'run-workflow':async el=>{el.disabled=true;try{await runWorkflow(el.dataset.id);}finally{if(el.isConnected)el.disabled=false;}},
 'delete-memory':el=>confirmDialog(tr('이 메모리를 지울까요?'),tr('앞으로의 대화에 더는 전달되지 않아요.'),tr('지우기'),async()=>{await api(`/api/memories/${enc(el.dataset.id)}`,{method:'DELETE'});await refreshState();renderMemory();}),
 'language':el=>setLanguage(el.dataset.id),
 'theme':el=>{const before=iconSet(),style=el.dataset.id;pref.set('style',style);applyTheme();document.querySelectorAll('[data-act="theme"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===style)));if(iconSet()!==before){renderSide();renderTop();}},
 'brightness':el=>{const mode=el.dataset.id;pref.set('theme',mode);applyTheme();document.querySelectorAll('[data-act="brightness"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===mode)));},
 'enable-notifications':()=>enableNotifications(),
 'update-open':()=>go('settings'),
 'update-check':()=>checkUpdate(),
 'update-install':()=>installUpdate(),
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
 }catch(err){if(el.isConnected)el.disabled=false;toast(err.message||tr('작업을 마치지 못했어요.'),true);if(el.dataset.approval)loadDetail().catch(()=>{});}
});
document.addEventListener('keydown',ev=>{
 if(applyingUpdate){ev.preventDefault();return;}
 const mod=ev.metaKey||ev.ctrlKey,k=ev.key.toLowerCase();
 if(ev.key==='Escape'){if(selectionReply){hideSelectionReply();return;}if(palette){closePalette();return;}if(pop){const anchor=pop.anchor;closePop();anchor?.focus();return;}closeSide();}
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
$('dialog').addEventListener('cancel',ev=>{if(applyingUpdate)ev.preventDefault();});
$('dialog').addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();});
$('preview').addEventListener('close',()=>{S.blobs.forEach(u=>URL.revokeObjectURL(u));S.blobs=[];});
for(const id of ['dialog','preview'])$(id).addEventListener('mousedown',ev=>{if(ev.target===$(id)){const r=$(id).getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)$(id).close();}});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>applyTheme());
function syncVisibility(){document.documentElement.classList.toggle?.('page-hidden',document.visibilityState==='hidden');}
document.addEventListener('visibilitychange',syncVisibility);syncVisibility();

// ---------- live updates ----------
let ticking=false,lastState=0;
async function tick(){
 if(ticking||!S.data||document.visibilityState==='hidden'&&!runActive())return;ticking=true;
 try{
  const sid=S.sid,epoch=S.epoch;
  if(S.view==='chat'&&sid&&S.detail&&runActive()){
   const live=await api(`/api/sessions/${enc(sid)}/live`,{timeout:10000});
   if(sid!==S.sid||epoch!==S.epoch)return;
   const run=latestRun();
   if(!live.run_id||live.status!==run.status||(live.rev!==S.detail.rev&&Date.now()-lastFull>450))await loadDetail(10000);
   else if(live.run_id===run.id&&live.text!==S.live){S.live=live.text;paintLive();}
  }
  if((Object.keys(S.data.active||{}).length||Object.keys(S.data.title_pending||{}).length)&&Date.now()-lastState>2200){lastState=Date.now();const before=JSON.stringify([S.data.active,S.data.sessions]),prevActive={...(S.data.active||{})};await refreshState(10000);if(JSON.stringify([S.data.active,S.data.sessions])!==before){renderSide();backgroundNews(prevActive,S.data.active||{});}}
  egoCall('sweep');
 }catch{}finally{ticking=false;}
}

// ---------- boot ----------
async function boot(){
 initUpdater();
 applyTheme();
 const lang=window.NaruI18n?.language||'ko';document.documentElement.lang=lang;const skip=document.querySelector('.skip');if(skip)skip.textContent=lang==='en'?'Skip to content':'본문으로 건너뛰기';$('side')?.setAttribute('aria-label',lang==='en'?'Chat list':'대화 목록');
 if(window.naruDesktop)document.documentElement.classList.add('desktop');
 $('app').classList.toggle('no-side',S.sideHidden);
 try{
  await refreshState();
  const last=pref.get('session','')||S.data.settings.last_session_id||'';
  if(last&&S.data.sessions.some(s=>s.id===last))await selectSession(last);else renderAll();
  try{window.naruDesktop?.reportBootReady?.(S.data.version)?.catch?.(()=>{});}catch{}
  if(!S.data.accounts)setTimeout(()=>loadAccounts(),400);setTimeout(()=>discoverModels(),500);
 }catch(err){
  $('main').innerHTML=tr`<div class="boot"><div><h2>Naru를 열지 못했어요</h2><p>${esc(err.message)}</p><button type="button" class="btn primary" data-act="retry-boot">다시 연결</button></div></div>`;
 }
}

// ---------- ego(lite) components ----------
// Existing controls drawn as their ego(lite) Style counterparts: Window (file preview), SpaceCard (files),
// Toast with an action pill, and the black Tooltip (ego.js). Nothing here adds new decoration.
function egoCall(fn,...a){try{return window.Ego?window.Ego[fn](...a):null;}catch{return null;}}
const extOf=n=>(String(n).match(/\.([a-z0-9]{1,6})$/i)||['',''])[1].toLowerCase();
const thumbCache={},thumbUrls={};
function thumbHTML(a,ico){
 const id=String(a.id),ext=extOf(a.name);
 if(/^(png|jpe?g|gif|webp)$/.test(ext))return `<img src="/api/artifacts/${enc(id)}/download?inline=1" alt="" loading="lazy">`;
 const t=thumbCache[id];
 if(t&&t.text!=null){
  if((ext==='html'||ext==='htm'||ext==='svg')&&typeof Blob!=='undefined'&&window.URL?.createObjectURL){if(!thumbUrls[id])thumbUrls[id]=URL.createObjectURL(new Blob([t.text],{type:ext==='svg'?'image/svg+xml':'text/html'}));return ext==='svg'?`<img src="${thumbUrls[id]}" alt="">`:`<iframe sandbox="" src="${thumbUrls[id]}" tabindex="-1" aria-hidden="true" loading="lazy"></iframe>`;}
  return `<pre aria-hidden="true">${esc(String(t.text).slice(0,700))}</pre>`;
 }
 return `<span class="ph">${icon(ico?ico(a.name):'doc')}</span>`;
}
function loadThumbs(arts,ico){
 arts.filter(a=>!/^(png|jpe?g|gif|webp)$/.test(extOf(a.name))&&!thumbCache[a.id]).slice(0,8).forEach(a=>{
  thumbCache[a.id]={pending:true};
  api(`/api/artifacts/${enc(a.id)}/content`).then(r=>{thumbCache[a.id]={text:r.text};}).catch(()=>{thumbCache[a.id]={text:null};}).finally(()=>{const box=document.querySelector(`[data-thumb="${CSS.escape(String(a.id))}"]`);if(box)box.innerHTML=thumbHTML(a,ico);});
 });
}
function winBar(title,acts=''){
 return `<div class="win-bar"><div class="win-dots"><button type="button" class="win-dot r" data-act="close-preview" aria-label="${esc(tr('닫기'))}"><svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 2l4 4M6 2 2 6"/></svg></button><span class="win-dot y" aria-hidden="true"></span><button type="button" class="win-dot g" data-act="max-preview" aria-label="${esc(tr('크게 보기'))}"><svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 1.5v5M1.5 4h5"/></svg></button></div><div class="win-title" title="${esc(title)}">${esc(title)}</div><div class="win-acts">${acts}</div></div>`;
}
ACT['max-preview']=()=>$('preview').classList.toggle('max');
function backgroundNews(prev,now){
 for(const [sid,st] of Object.entries(prev)){
  if(sid===S.sid&&S.view==='chat')continue;
  const s=(S.data.sessions||[]).find(x=>x.id===sid);if(!s)continue;
  const title=(s.title||tr('대화')).slice(0,24),open={label:'열기',run:()=>selectSession(sid)};
  if(!now[sid]){toast(tr`‘${title}’ 작업을 마쳤어요`,false,open);return;}
  if(now[sid]==='awaiting_approval'&&st!=='awaiting_approval'){toast(tr`‘${title}’에서 확인이 필요해요`,false,open);return;}
 }
}
{const base=selectSession;selectSession=function(id){if(id!==S.sid){Object.values(thumbUrls).forEach(u=>{try{URL.revokeObjectURL(u);}catch{}});for(const k of Object.keys(thumbUrls))delete thumbUrls[k];for(const k of Object.keys(thumbCache))delete thumbCache[k];}return base.apply(this,arguments);};}
egoCall('tooltips');
if(globalThis.__NARU_TEST__){globalThis.NaruUI={markdown,inline,esc,lineDiff,stepLabel,splitAttachments,buildSteps,approvalHTML,detailHTML,modelMenu,modelMenuHTML,modelOptions,loadProviderModels,discoverModels,send,loadDetail,refreshState,addFiles,wireComposer,renderChips,messageHTML,runHTML,imageSource,generatedImagesHTML,imageProviders,openImagePicker,pref,tick,renderSettings,renderDrawer,enableNotifications,notificationHTML,updateHTML,applyUpdateState,initUpdater,checkUpdate,installUpdate,boot,fileReads,queueHTML,renderQueue,renderTools,enqueueMode,sessionAccess,accessLabel,openSessionAccess,saveSessionAccess,parseSkillFile,importSkill,importSkillFolder,discoverSkills,skillDiscoveryHTML,importDiscoveredSkill,renderSkills,renderWorkflows,editWorkflow,runWorkflow,ACT,renderSide,renderTop,startRename,deleteChat,forkMessage,setLanguage,showSelectionReply,replyToSelection,mentionAt,updateFileMention,fileMentionKey,selectContextFile,getFileMention:()=>fileMention,questionHTML,answerQuestion,sessionReasoning,saveReasoning,openReasoningMenu,setModel,steeringMode,sendSteering,S};return;}
setInterval(tick,280);
boot();
})();
