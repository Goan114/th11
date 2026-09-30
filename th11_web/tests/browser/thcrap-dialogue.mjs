// Test-only harness linked from production objects, with only Application.cpp
// rebuilt to enable dialogue probes. Never replaces the packaged release.
import {readFileSync,readdirSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../../eagler-touhou/package.json',import.meta.url));
const puppeteer=require('puppeteer-core');
const {unzipSync}=require('fflate');
const workspace=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const game=resolve(workspace,'th11'),root=resolve(game,'th11_web');
const out=resolve(root,'artifacts/thcrap-dialogue');mkdirSync(out,{recursive:true});
const sdk=resolve(workspace,'th08/tools/emsdk');
const emcc=['install/emscripten/emcc.py','upstream/emscripten/emcc.py'].map(p=>resolve(sdk,p)).find(existsSync);
const env={...process.env,EM_CONFIG:resolve(sdk,'.emscripten'),EMSDK:sdk};
const compile=args=>{const r=spawnSync('python',[emcc,...args],{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr);};
compile(['-std=c++17','-O2','-c',resolve(root,'tests/cpp/thcrap-layout.cpp'),'-o',resolve(out,'layout.o')]);
compile(['-sDEFAULT_TO_CXX=1',resolve(out,'layout.o'),'-o',resolve(out,'layout.cjs')]);
const unit=spawnSync(process.execPath,[resolve(out,'layout.cjs')],{encoding:'utf8'});
assert.equal(unit.status,0,unit.stdout+unit.stderr);console.log(unit.stdout.trim());
const flags=['-O2','-g0','-std=c++17','-ffp-contract=off','-fno-strict-aliasing','-fno-exceptions','-fno-rtti','-DTH_NATIVE_PLATFORM=1','-DTH_ENABLE_THCRAP=1','-DTH11_DEVELOPMENT_HARNESS=1','--use-port=sdl3','--use-port=sdl3_ttf'];
const application=resolve(out,'application.o');
compile([...flags,'-c',resolve(root,'cpp/sdl/Application.cpp'),'-o',application]);
const objectsRoot=resolve(root,'artifacts/sdl3/objects');
const objects=readdirSync(objectsRoot).filter(p=>p.endsWith('.o')&&!p.includes('Application_cpp')).map(p=>resolve(objectsRoot,p));
compile([...flags,'--no-entry','-sDEFAULT_TO_CXX=1','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=1048576','-sINITIAL_MEMORY=134217728','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=1','-lidbfs.js','-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8','-sINVOKE_RUN=0','-sEXIT_RUNTIME=0','-sMIN_WEBGL_VERSION=2','-sMAX_WEBGL_VERSION=2',...objects,application,'-o',resolve(out,'probe.mjs')]);
const fonts=resolve(root,'assets/sdl-native/fonts');
const files=new Map([['/probe.mjs',resolve(out,'probe.mjs')],['/probe.wasm',resolve(out,'probe.wasm')],['/th11.dat',resolve(workspace,'prepared/th11-content/th11.data')]]);
for(const name of ['font0.bin','font1.bin','font2.bin','font3.bin','cp932.bin','blend4444.bin'])files.set('/fonts/'+name,resolve(fonts,name));
const musicRoot=resolve(workspace,'prepared/th11-content/music');
const music=readdirSync(musicRoot).filter(p=>p.endsWith('.ogg')).map(p=>'/music/'+p);
for(const path of music)files.set(path,resolve(musicRoot,path.slice('/music/'.length)));
for(const language of ['lang_en','lang_zh-hans'])files.set('/'+language+'.zip',resolve(workspace,'prepared/th11-localization/language/'+language+'.zip'));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas id="canvas" width="640" height="480"></canvas>');return;}if(!files.has(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.mjs')?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(files.get(path)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const browserRoot=resolve(process.env.LOCALAPPDATA,'ms-playwright');
const executablePath=resolve(browserRoot,readdirSync(browserRoot).filter(p=>/^chromium-\d+$/.test(p)).sort().reverse()[0],'chrome-win64/chrome.exe');
let browser;const report=[];
try{
    browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
    for(const language of ['lang_en','lang_zh-hans']){
        const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);
        const pack=unzipSync(readFileSync(files.get('/'+language+'.zip')));
        const entries=Object.entries(pack).filter(([path])=>path.startsWith('thcrap/th11/')).map(([path,bytes])=>[path,Array.from(bytes)]);
        await page.evaluate(async ({entries,music})=>{
            const {default:create}=await import('/probe.mjs');const c=window.core=await create({canvas:document.querySelector('canvas')});
            for(const path of ['/th11.dat',...music,...['font0.bin','font1.bin','font2.bin','font3.bin','cp932.bin','blend4444.bin'].map(p=>'/fonts/'+p)]){
                const slash=path.lastIndexOf('/');if(slash>0)c.FS.mkdirTree(path.slice(0,slash));
                c.FS.writeFile(path,new Uint8Array(await fetch(path).then(r=>r.arrayBuffer())));
            }
            for(const [path,bytes] of entries){const target='/'+path;c.FS.mkdirTree(target.slice(0,target.lastIndexOf('/')));c.FS.writeFile(target,Uint8Array.from(bytes));}
            if(!c.FS.analyzePath('/thcrap/th11/localization/options.json').exists)throw Error('Language pack did not mount');
            window.error=()=>{const p=c._th11_error();return new TextDecoder().decode(c.HEAPU8.subarray(p,c.HEAPU8.indexOf(0,p)));};
            c._th11_music_enabled(0);
            if(!c._th11_initialize())throw Error(error());
        },{entries,music});
        for(let shot=0;shot<6;++shot){
            const result=await page.evaluate(shot=>{
                const c=core;if(!c._th11_probe_stage(1,Math.floor(shot/3),shot%3,0))throw Error(error());
                const before=c._th11_text_writes();if(!c._th11_probe_dialogue(0))throw Error('Missing dialogue');
                for(let i=0;i<45;++i)if(!c._th11_tick(0))throw Error(error());
                return {shot,writes:c._th11_text_writes()-before};
            },shot);
            assert.ok(result.writes>0);report.push({language,...result});
            await page.screenshot({path:resolve(out,language+'-shot'+shot+'.png')});
            // Advance dialogue through actual confirm input, including partner lines.
            for(let line=0;line<8;++line){
                await page.evaluate(()=>{for(let i=0;i<3;++i)if(!core._th11_tick(1))throw Error(error());for(let i=0;i<40;++i)if(!core._th11_tick(0))throw Error(error());});
                if(shot===1)await page.screenshot({path:resolve(out,language+'-suika-line'+line+'.png')});
            }
        }
        if(language==='lang_en'){
            const gaps=await page.evaluate(()=>{
                const c=core,state=()=>{const p=c._th11_probe_motion();return Array.from(new Float32Array(c.HEAPU8.buffer,p,5));};
                const tick=()=>{if(!c._th11_probe_platform_tick())throw Error(error());return state();};
                const start=(shot,x)=>{
                    c._th11_keys_clear();if(!c._th11_probe_stage(1,Math.floor(shot/3),shot%3,0))throw Error(error());
                    for(let i=0;i<150;++i)if(!c._th11_tick(0))throw Error(error());
                    c._th11_probe_player_position(x,400);c._th11_touch_controls(1,1,1,0,0);
                };
                const result=[];
                for(const x of [-184,184]){
                    start(0,x);
                    // Keep a drag alive across the transfer; its old target must rebase.
                    c._th11_touch(0,22,.5,.5);c._th11_probe_gap_hold(1);
                    const samples=[];for(let i=0;i<70;++i)samples.push(tick());
                    const wrapped=samples.some(s=>x<0?s[0]>0:s[0]<0);
                    c._th11_probe_gap_hold(0);const restored=tick();
                    result.push({x,samples:samples.slice(0,5),wrapped,heldEnd:samples.at(-1),restored});
                    c._th11_touch(2,22,.5,.5);
                }
                start(1,-184);c._th11_probe_gap_hold(1);const otherShot=[tick(),tick(),tick()];
                start(0,-184);c._th11_probe_gap_hold(1);tick();c._th11_touch_cancel();const cancelled=tick();
                start(0,-184);c._th11_probe_gap_hold(1);tick();c._th11_pause();tick();c._th11_resume();const resumed=tick();
                return {result,otherShot,cancelled,resumed};
            });
            for(const result of gaps.result){
                assert.ok(result.wrapped,`Gap wraps from ${result.x}: ${JSON.stringify(result)}`);
                assert.deepEqual(result.samples.slice(0,3).map(s=>s[2]),[result.x<0?1:3,result.x<0?2:4,result.x<0?99:100]);
                assert.ok(result.samples.every(s=>(s[4]&9)===0),'Fire/focus suspended during input sequence');
                assert.equal(result.restored[4]&9,9,'Fire/focus restored on release');
                assert.ok(result.x<0?result.restored[0]>100:result.restored[0]<-100,'Drag does not snap back to old edge');
            }
            assert.ok(gaps.otherShot.every(s=>s[2]===0&&(s[4]&9)===9),'Other shots retain fire/focus');
            assert.equal(gaps.cancelled[4]&1,1,'Touch cancellation releases gap override');
            assert.equal(gaps.resumed[4]&9,9,'Pause/resume does not re-arm held gap');
            report.push({gaps});console.log('TH11 gap: left/right wrap, drag rebasing, restored controls, other shots, cancel and pause passed');
        }
        assert.deepEqual(errors,[]);await page.close();console.log(language+': all six shot dialogues rendered');
    }
    writeFileSync(resolve(out,'report.json'),JSON.stringify({passed:true,report},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
