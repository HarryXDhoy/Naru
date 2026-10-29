'use strict';
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const API = 'https://api.github.com/repos/HarryXDhoy/Naru/releases/latest';
const HOSTS = new Set(['api.github.com','github.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
const MAX_DOWNLOAD = 500 * 1024 * 1024;
function versionParts(value) { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value)); if(!m)return null;const v=m.slice(1).map(Number);return v.every(Number.isSafeInteger)?v:null; }
function newer(a,b) { const x=versionParts(a),y=versionParts(b); if(!x||!y)return false; for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false; }
function releaseAsset(info,current){
  const version=String(info?.tag_name||'').replace(/^v/,'');
  if(!versionParts(version)||info.draft||info.prerelease||!newer(version,current))return null;
  const name=`Naru-macOS-Apple-Silicon-v${version}.zip`;
  const a=Array.isArray(info.assets)?info.assets.find(x=>x.name===name):null;
  if(!a||!/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')||!Number.isSafeInteger(a.size)||a.size<=0||a.size>MAX_DOWNLOAD)throw new Error('업데이트 파일의 검증 정보를 확인할 수 없습니다.');
  const u=new URL(a.browser_download_url);
  if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash||u.pathname!==`/HarryXDhoy/Naru/releases/download/v${version}/${name}`)throw new Error('업데이트 파일 주소가 올바르지 않습니다.');
  return {version,url:u.href,size:a.size,digest:a.digest.slice(7).toLowerCase()};
}
function get(url, redirects=0){
  return new Promise((resolve,reject)=>{
    let parsed;try {parsed=new URL(url);}catch{return reject(new Error('업데이트 주소가 올바르지 않습니다.'));}
    if(parsed.protocol!=='https:'||!HOSTS.has(parsed.hostname)||parsed.username||parsed.password||parsed.port||parsed.hash||redirects>5)return reject(new Error('허용되지 않은 업데이트 주소입니다.'));
    const req=https.get(parsed,{headers:{'User-Agent':'Naru-Updater','Accept':'application/vnd.github+json'}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){
        const location=res.headers.location;res.resume();if(!location)return reject(new Error('업데이트 주소가 없습니다.'));
        try{get(new URL(location,parsed).href,redirects+1).then(resolve,reject);}catch(err){reject(err);}return;
      }
      if(res.statusCode!==200){res.resume();reject(new Error(`업데이트 서버 오류 (${res.statusCode})`));return;}
      resolve(res);
    });req.setTimeout(30000,()=>req.destroy(new Error('업데이트 서버 응답 시간이 초과됐습니다.')));req.on('error',reject);
  });
}
async function releaseInfo(){ const res=await get(API);let chunks=[],length=0;for await(const chunk of res){length+=chunk.length;if(length>1024*1024){res.destroy();throw new Error('업데이트 정보가 너무 큽니다.');}chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
async function download(asset,file,onProgress){
  const res=await get(asset.url),hash=crypto.createHash('sha256');let count=0;
  const meter=new Transform({transform(chunk,_enc,cb){count+=chunk.length;if(count>asset.size||count>MAX_DOWNLOAD)return cb(new Error('업데이트 크기가 올바르지 않습니다.'));hash.update(chunk);onProgress(Math.floor(count*100/asset.size));cb(null,chunk);}});
  await pipeline(res,meter,fs.createWriteStream(file,{flags:'wx',mode:0o600}));
  if(count!==asset.size||hash.digest('hex')!==asset.digest)throw new Error('업데이트 파일 검증에 실패했습니다.');
}
function run(command,args){return new Promise((resolve,reject)=>{let err='';const p=spawn(command,args,{stdio:['ignore','ignore','pipe']});p.stderr.on('data',b=>{err=(err+b).slice(-1000)});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(err.trim()||'업데이트 파일을 준비하지 못했습니다.')));});}
function localJSON(origin,method,route,token){return new Promise((resolve,reject)=>{
 const u=new URL(route,origin);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')return reject(new Error('로컬 서버 주소가 올바르지 않습니다.'));
 const req=http.request(u,{method,headers:{...(token?{'X-Naru-Token':token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})}},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>{body+=c;if(body.length>4*1024*1024)req.destroy(new Error('로컬 응답이 너무 큽니다.'));});res.on('end',()=>{try{const d=JSON.parse(body);if(res.statusCode!==200)reject(new Error(d.error||'업데이트를 준비하지 못했습니다.'));else resolve(d);}catch(e){reject(e);}});});req.setTimeout(5000,()=>req.destroy(new Error('Naru 서버 연결 시간이 초과됐습니다.')));req.on('error',reject);req.end(method==='POST'?'{}':undefined);
});}
function createUpdater({app,python,backendOrigin,dataDir,onState}){
 let state={status:'idle'}, checking=null,stage='',asset=null,installing=false;
 const errorFile=path.join(dataDir,'update-last-error.json');
 const executable=app.getPath('exe'), target=path.dirname(path.dirname(path.dirname(executable)));
 const userDataDir=app.commandLine?.getSwitchValue('user-data-dir')||'';
 const enabled=process.platform==='darwin'&&process.arch==='arm64'&&app.isPackaged&&path.basename(target)==='Naru.app';
 if(!enabled)state={status:'disabled',message:'설치된 macOS Apple Silicon 앱에서 업데이트할 수 있어요.'};
 else try{
  const fd=fs.openSync(errorFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const st=fs.fstatSync(fd);if(st.isFile()&&st.size<4096){const data=JSON.parse(fs.readFileSync(fd,'utf8'));if(typeof data.message==='string')state={status:'error',message:data.message.slice(0,300)};}}finally{fs.closeSync(fd);}
  fs.unlinkSync(errorFile);
 }catch{}
 const send=next=>{state=next;onState?.({...state});};
 async function check(){
  if(!enabled)return {...state}; if(checking)return checking; if(state.status==='ready')return {...state};
  checking=(async()=>{try{
   send({status:'checking'});const release=releaseAsset(await releaseInfo(),app.getVersion());
   if(!release){send({status:'up_to_date'});return {...state};}
   if(stage)await fs.promises.rm(stage,{recursive:true,force:true});stage=await fs.promises.mkdtemp(path.join(os.tmpdir(),'naru-update-'));await fs.promises.chmod(stage,0o700);
   const archive=path.join(stage,'release.zip');send({status:'downloading',version:release.version,progress:0});let previous=-1;
   await download(release,archive,progress=>{if(progress!==previous){previous=progress;send({status:'downloading',version:release.version,progress});}});
   const extracted=path.join(stage,'extracted');await fs.promises.mkdir(extracted,{mode:0o700});
   await run(python,[path.join(__dirname,'update_helper.py'),'extract',archive,extracted,release.version]);
   asset=release;send({status:'ready',version:release.version});return {...state};
  }catch(err){if(stage)await fs.promises.rm(stage,{recursive:true,force:true}).catch(()=>{});stage='';asset=null;send({status:'error',message:String(err?.message||'업데이트를 확인하지 못했습니다.').slice(0,300)});return {...state};}finally{checking=null;}})();return checking;
 }
 async function install(){
  if(!enabled||state.status!=='ready'||!asset||!stage||installing)throw new Error('설치할 업데이트가 준비되지 않았습니다.');
  installing=true;let locked=false,updateDir='';
  try{
   await fs.promises.access(path.dirname(target),fs.constants.W_OK);
   updateDir=await fs.promises.mkdtemp(path.join(path.dirname(target),'.naru-update-'));
   await run(python,[path.join(__dirname,'update_helper.py'),'stage',path.join(stage,'extracted','Naru.app'),updateDir]);
   const info=await localJSON(backendOrigin,'GET','/api/state');
   await localJSON(backendOrigin,'POST','/api/update/prepare',info.csrf_token);locked=true;
   const marker=path.join(stage,'startup-ready');
   const child=spawn(python,[path.join(__dirname,'update_helper.py'),'install',target,updateDir,String(process.pid),marker,errorFile,userDataDir],{detached:true,stdio:'ignore'});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
   app.quit();return true;
  }catch(err){if(locked){try{const info=await localJSON(backendOrigin,'GET','/api/state');await localJSON(backendOrigin,'POST','/api/update/cancel',info.csrf_token);}catch{}}
   if(updateDir)await fs.promises.rm(updateDir,{recursive:true,force:true}).catch(()=>{});
   throw new Error(err.code==='EACCES'?'앱 폴더에 쓸 권한이 없습니다. GitHub에서 새 버전을 내려받아 설치해 주세요.':String(err.message||err));
  }finally{installing=false;}
 }
 return {state:()=>({...state}),check,install,enabled,recovered:state.status==='error',health:()=>localJSON(backendOrigin,'GET','/api/health')};
}
module.exports={createUpdater,versionParts,newer,releaseAsset,get,download};
