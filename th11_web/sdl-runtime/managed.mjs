import createModule from './th11.mjs';
import {scanCodes} from './keyboard.mjs';
const runtimeBuild=/*TH11_BUILD_INFO*/{version:'development-incomplete',completeGame:false};
const game='th11',protocol='eagler-touhou/1',query=new URLSearchParams(location.search),canvas=document.querySelector('canvas'),$=s=>document.querySelector(s);
let core,launched=false,first=false,stopping=false,options={},music=true,chain=Promise.resolve(),queue=Promise.resolve();
const emit=(event,fields={})=>parent.postMessage({protocol,game,event,...fields},location.origin);
const err=()=>{const p=core._th11_error(),end=core.HEAPU8.indexOf(0,p);return new TextDecoder().decode(core.HEAPU8.subarray(p,end<0?p+256:end));};
const fatal=e=>{const message=e?.message||String(e);$('#error').textContent=message;core?._th11_loop_pause(1);emit('error',{error:message});};
const sync=(populate=false)=>{const current=chain.then(()=>new Promise((r,j)=>core.FS.syncfs(populate,e=>e?j(e):r())));chain=current.catch(()=>{});return current;};
const save=()=>{if(launched&&!core._th11_save_scores())throw Error(err());return sync();};
function closeAudio(){
 // The launcher owns the shared context. SDL owns and must disconnect its
 // stream, but closing that stream must not close the launcher's context.
 const s=core.SDL3,context=s?.audioContext,borrowed=parent!==window&&context===parent.__touhouAudioContext;
 if(borrowed)s.audioContext=undefined;
 try{core._th11_audio_close();}finally{if(borrowed)s.audioContext=context;}
}
async function stop(){if(stopping)return;stopping=true;try{core._th11_loop_stop();await save();closeAudio();launched=false;emit('exit',{code:0,status:'success'});}finally{stopping=false;}}
function path(value){const name=String(value).replaceAll('\\','/').toLowerCase().replace(/^\/savesth11\//,'').replace(/^\//,'');if(!/^(?:scoreth11\.dat|th11\.cfg|replay\/th11_(?:\d{2}|ud[a-z0-9]{4})\.rpyx?)$/.test(name))throw Error('存档路径无效');return name;}
function apply(){core._th11_touch_options(+!!options.touchEnabled,Math.max(0,['touch','touch-unlimited','joystick','joystick-free'].indexOf(options.touchMovementMode)),Number(options.touchSensitivity||100)/100,+(options.touchFocusMode==='two-finger'),+!!options.doubleTapBombEnabled);core._th11_music_enabled(+music);}
async function resource(r){if(!/^\/music\/[a-z0-9_]+\.ogg$/.test(r.path))throw Error('资源路径无效');const u=new URL(r.url,location.href);if(u.origin!==location.origin)throw Error('资源来源无效');const response=await fetch(u);if(!response.ok)throw Error('资源读取失败');core.FS.mkdirTree('/music');core.FS.writeFile(r.path,new Uint8Array(await response.arrayBuffer()));}
async function command(m){switch(m.command){
case 'configure':options=m.options||{};music=m.music!=='none';for(const r of [...(m.runtimeResources||[]),...(m.resources||[])])await resource(r);apply();return {};
case 'resources':for(const r of m.resources||[])await resource(r);return {};
case 'keyboard':if(scanCodes[m.code])core._th11_key(scanCodes[m.code],+!!m.down);return {};
case 'keyboard-clear':core._th11_keys_clear();return {};
case 'touch-cancel':core._th11_touch_cancel();return {};
case 'direct-touch':{const b=canvas.getBoundingClientRect();if(b.width&&b.height)core._th11_touch(({down:0,move:1,up:2,cancel:2})[m.type]??2,Number(m.id)||0,(Number(m.x)*innerWidth-b.left)/b.width,(Number(m.y)*innerHeight-b.top)/b.height);return {};}
case 'touch-controls':{const t=m.controls||m;core._th11_touch_controls(+!!options.touchEnabled,+!!t.fireEnabled,+!!t.focusEnabled,t.bombSerial>>>0,t.escapeSerial>>>0);core._th11_touch_stick(Number(t.joystickX)||0,Number(t.joystickY)||0);return {};}
case 'launch':if(!launched){if(!core._th11_initialize())throw Error(err());if(core._th11_phase()===4&&!core._th11_return_title())throw Error(err());launched=true;apply();first=false;$('#loading').textContent='';core._th11_loop_start();emit('runtime-info',{renderer:'SDL3 / WebGL2 / C++',architecture:protocol,...runtimeBuild});}return {};
case 'sync':await save();return {};
case 'list':{const files=[];for(const dir of ['','/replay'])for(const name of core.FS.readdir('/savesth11'+dir)){const n=(dir+'/'+name).replace(/^\//,'');try{path(n);}catch{continue;}const s=core.FS.stat('/savesth11/'+n);if(core.FS.isFile(s.mode))files.push({path:n,size:s.size});}return {files};}
case 'read':return {bytes:Array.from(core.FS.readFile('/savesth11/'+path(m.path)))};
case 'write':{
 if(launched)throw Error('请先退出游戏');const target=path(m.path),bytes=new Uint8Array(m.bytes||[]);
 if(!bytes.length||bytes.length>64*1024*1024)throw Error('文件大小无效');
 const p=core._malloc(bytes.length);if(!p)throw Error('文件导入内存不足');let valid=false;try{core.HEAPU8.set(bytes,p);valid=!!core._th11_validate_file(target==='scoreth11.dat'?0:target==='th11.cfg'?2:1,p,bytes.length);}finally{core._free(p);}
 if(!valid)throw Error('文件不是有效的地灵殿存档或录像');core.FS.writeFile('/savesth11/'+target,bytes);await sync();return {};
}
case 'remove':if(launched)throw Error('请先退出游戏');core.FS.unlink('/savesth11/'+path(m.path));await sync();return {};
default:throw Error('不支持的操作');}}
window.addEventListener('message',e=>{const m=e.data;if(e.source!==parent||e.origin!==location.origin||m?.protocol!==protocol||m.game!==game||typeof m.command!=='string')return;queue=queue.then(async()=>{await initialized;try{const result=await command(m);if(typeof m.request==='string')parent.postMessage({protocol,game,request:m.request,ok:true,...result},location.origin);}catch(e){if(typeof m.request==='string')parent.postMessage({protocol,game,request:m.request,ok:false,error:String(e),errno:e?.errno},location.origin);else fatal(e);}}).catch(fatal);});
document.addEventListener('visibilitychange',()=>{if(launched){core._th11_keys_clear();core._th11_touch_cancel();core._th11_loop_pause(+document.hidden);if(document.hidden)try{void save().catch(fatal);}catch(e){fatal(e);}}});
window.addEventListener('blur',()=>{core?._th11_keys_clear();core?._th11_touch_cancel();});
// Keyboard events in the child realm do not bubble to the launcher. SDL's
// canvas listener alone misses keys when the child BODY owns focus.
for(const event of ['keydown','keyup'])window.addEventListener(event,e=>{if(!launched||e.altKey||e.metaKey)return;const scan=scanCodes[e.code];if(scan){core._th11_key(scan,+(event==='keydown'));e.preventDefault();}},{capture:true});
for(const event of ['pointerdown','keydown'])window.addEventListener(event,()=>core?.SDL3?.audioContext?.resume().catch(()=>{}),{capture:true});
for(const [name,type] of [['pointerdown',0],['pointermove',1],['pointerup',2],['pointercancel',2]])document.body.addEventListener(name,e=>{
 if(!launched||!options.touchEnabled||e.pointerType==='mouse')return;e.preventDefault();if(type===0)document.body.setPointerCapture(e.pointerId);const b=canvas.getBoundingClientRect();if(b.width&&b.height)core._th11_touch(type,e.pointerId,(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height);
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal(Error('图形环境失效，请退出后重新开始。'));});
window.addEventListener('pagehide',()=>{if(launched){core._th11_loop_stop();try{void save().catch(fatal);}catch(e){fatal(e);}closeAudio();}});
// A mobile browser may terminate a hidden page before pagehide's IDB callback.
// Persist during play as well, with writes serialized by the sync chain.
setInterval(()=>{if(launched&&!document.hidden)try{void save().catch(fatal);}catch(e){fatal(e);}},30000);
const initialized=(async()=>{
 let last=performance.now(),ticks=0;
 core=await createModule({canvas,printErr:console.error,onGameFrame(ok,ms,count){if(!ok){fatal(Error(err()));return;}ticks+=count;if(!first){first=true;last=performance.now();ticks=0;emit('first-frame');}const now=performance.now();if(now-last>=1000){emit('frame-health',{fps:ticks*1000/(now-last),maxGapMs:ms});last=now;ticks=0;}if(core._th11_phase()===4)void stop().catch(fatal);}});
 core.SDL3=core.SDL3||{};if(parent!==window&&parent.__touhouAudioContext)core.SDL3.audioContext=parent.__touhouAudioContext;
 window.Module=core;window.FS=core.FS;
 core.FS.mkdirTree('/savesth11');core.FS.mount(core.IDBFS,{},'/savesth11');await sync(true);core.FS.mkdirTree('/savesth11/replay');core.FS.symlink('/savesth11','/save');
 const response=await fetch('./th11.data.json');if(!response.ok)throw Error('资源清单加载失败');const index=await response.json();let buffer;
 if(query.get('managedData')==='1'){if(parent===window||typeof parent.__eaglerPrepareManagedRuntimeDataV1!=='function')throw Error('游戏资源尚未准备');buffer=(await parent.__eaglerPrepareManagedRuntimeDataV1({game,generation:query.get('gameGeneration')})).buffer;}
 else {const r=await fetch('../../packages/th11/th11.data');if(!r.ok)throw Error('资源包加载失败');buffer=await r.arrayBuffer();}
 if(buffer.byteLength!==index.remote_package_size)throw Error('游戏资源大小错误');
 for(const f of index.files){if(!/^\/(?:th11\.dat|fonts\/[a-z0-9_.-]+)$/.test(f.filename)||!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.start<0||f.end<=f.start||f.end>buffer.byteLength)throw Error('游戏资源清单错误');core.FS.mkdirTree(f.filename.slice(0,f.filename.lastIndexOf('/'))||'/');core.FS.writeFile(f.filename,new Uint8Array(buffer,f.start,f.end-f.start));}
 if(query.get('managedData')!=='1')for(const name of index.music){if(!/^[a-z0-9_]+\.ogg$/.test(name))throw Error('音乐资源名无效');await resource({path:'/music/'+name,url:'../../packages/th11/music/'+name});}
 emit('ready');if(query.get('standalone')==='1')await command({command:'launch'});
})().catch(e=>{fatal(e);throw e;});
