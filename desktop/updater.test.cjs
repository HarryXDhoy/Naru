'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {newer,versionParts,releaseAsset}=require('./updater.cjs');
function info(overrides={}) {const name='Naru-macOS-Apple-Silicon-v1.2.4.zip';return {tag_name:'v1.2.4',draft:false,prerelease:false,assets:[{name,size:100,digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://github.com/HarryXDhoy/Naru/releases/download/v1.2.4/'+name}],...overrides};}
test('strict numerical versions and updates',()=>{assert(newer('1.2.4','1.2.3'));assert(!newer('1.2.3','1.2.3'));assert(!newer('1.2.2','1.2.3'));assert.equal(versionParts('1.2.3-beta'),null);assert.equal(versionParts('9'.repeat(100)+'.1.1'),null);});
test('only expected repository asset with size and digest is accepted',()=>{const a=releaseAsset(info(),'1.2.3');assert.equal(a.version,'1.2.4');assert.equal(a.digest,'a'.repeat(64));for(const mutate of [a=>a.browser_download_url='https://evil.test/a',a=>a.browser_download_url='https://github.com/other/repo/a',a=>a.digest='sha256:nope',a=>a.size=501*1024*1024]){const d=info();mutate(d.assets[0]);assert.throws(()=>releaseAsset(d,'1.2.3'));}assert.equal(releaseAsset(info({prerelease:true}),'1.2.3'),null);});

test('download verifies exact bytes and digest; network errors fail closed',async()=>{
 const https=require('node:https'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {download}=require('./updater.cjs');const original=https.get,dir=fs.mkdtempSync(path.join(os.tmpdir(),'naru-update-test-'));
 const content=Buffer.from('release bytes');
 try{
  https.get=(_url,_options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=e=>req.emit('error',e);process.nextTick(()=>{const res=Readable.from([content]);res.statusCode=200;res.headers={};callback(res);});return req;};
  const asset={url:'https://github.com/HarryXDhoy/Naru/releases/download/v1.2.4/test.zip',size:content.length,digest:crypto.createHash('sha256').update(content).digest('hex')};
  await download(asset,path.join(dir,'ok'),()=>{});assert.deepEqual(fs.readFileSync(path.join(dir,'ok')),content);
  await assert.rejects(download({...asset,digest:'0'.repeat(64)},path.join(dir,'bad'),()=>{}),/검증/);
  https.get=()=>{throw new Error('offline')};await assert.rejects(download(asset,path.join(dir,'offline'),()=>{}),/offline/);
 }finally{https.get=original;fs.rmSync(dir,{recursive:true,force:true});}
});
