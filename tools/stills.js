#!/usr/bin/env node
/* Pre-rendered mission pictures (tools/stills.js)
 *
 *   node tools/stills.js <index.html> [outDir=web/stills] [--models=quad:fs5,plane:tr1,plane:fg1d] [--only=<regex on file stem>] [--resume] [--limit=N] [--q=68]
 *   (the first model listed for a vehicle is its default: the one whose colours frame a picture of any other aircraft while that is drawn on the device)
 *
 * Renders every picture the stage wall can ask for (all default courses x stories x vehicles) with the page's OWN picture code
 * (cnStillRender, headless Chromium, software GL, the highest quality level), writes them as WebP files next to the site
 * (stills/<key>.webp) and writes the manifest (#stillsMan: PIC_SIG, file stems and three colours of each) into index.html.
 *
 * A manifest only counts when its sig equals the PIC_SIG constant of the same page, so after ANY change to the picture code
 * (picsig.js says so) the pictures must be regenerated or they are ignored (the poster is then drawn on the device, as before).
 *
 * needs: playwright (+ chromium), sharp, python3 (mkdemo2.py is NOT needed: the page is instrumented here); THREE_JS=<path to three.min.js r128>
 * (without it the page loads three.js from its CDN).
 */
const fs=require('fs'),path=require('path'),os=require('os');
const req=(m)=>{try{return require(m)}catch(e){return require('/opt/npm-tools/node_modules/'+m)}};
const {chromium}=req('playwright'),sharp=req('sharp');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):d};
const flag=k=>process.argv.includes('--'+k);
const pos=process.argv.slice(2).filter(x=>!x.startsWith('--'));
const html=path.resolve(pos[0]||'web/index.html'),outDir=path.resolve(pos[1]||path.join(path.dirname(html),'stills'));
const MODELS=(arg('models','quad:fs5,plane:tr1,plane:fg1d')).split(',').map(x=>x.split(':'));
const only=arg('only')?new RegExp(arg('only')):null,limit=+arg('limit',0);
const Q=+arg('q',68);
fs.mkdirSync(outDir,{recursive:true});
const bands=raw=>[0,1,2].map(i=>[0,1,2].map(c=>raw[i*3+c].toString(16).padStart(2,'0')).join('')).join('');
const src=fs.readFileSync(html,'utf8');
const sig=(src.match(/const PIC_SIG='([0-9a-f]+)'/)||[])[1];if(!sig){console.error('PIC_SIG is empty: run picsig.js --write first');process.exit(1)}
// an instrumented copy of the page: the same source plus an export object (never written back)
const m=src.match(/(<script type="text\/x-fpv" id="appSrc">)([\s\S]*?)(<\/script>)/);
const EXP='S,render,flowHTML,STORIES,cnStillRender,cnStillKey,cnStillMk,cnTexWait,courseVeh,CINE,CN,cnLQ,vehOf,setMode:v=>{MODE=v;try{localStorage.setItem("fpv-appmode",v)}catch(e){}}';
const mark="setupLang();\nsave(); render();";if(!m[2].includes(mark))throw new Error('page tail not found');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stills-'));
fs.writeFileSync(path.join(tmp,'index.html'),src.slice(0,m.index+m[1].length)+m[2].replace(mark,'window.__t={'+EXP+'};'+mark)+src.slice(m.index+m[1].length+m[2].length));
const cfgSrc=path.join(path.dirname(html),'config.js');fs.writeFileSync(path.join(tmp,'config.js'),"window.FPV_CONFIG={url:'',key:''};");
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 if(process.env.THREE_JS){const three=fs.readFileSync(process.env.THREE_JS,'utf8');await ctx.route(/three\.min\.js/,r=>r.fulfill({status:200,contentType:'application/javascript',body:three}))}
 const p=await ctx.newPage();p.on('pageerror',e=>console.error('PAGEERR',e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('fpv-tour-off-admin','1');localStorage.setItem('fpv-tour-off-trainee','1')}catch(e){}Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})});
 await p.goto('file://'+path.join(tmp,'index.html'));await p.waitForTimeout(1500);
 // 1. every picture the wall can ask for
 const want=await p.evaluate((MODELS)=>{const T=window.__t,St=T.S,out=new Map();
  for(const c of St.courses){const tr=St.users.find(u=>u.course===c.id&&u.role==='חניך');if(!tr)continue;St.role='trainee';St.trainee=tr.id;const sv=tr.story,vv=c.vehicle;
   for(const [veh,ac] of MODELS){c.vehicle=veh;
    for(const sid of ['none'].concat(T.STORIES.map(s=>s.id))){tr.story=sid;let h='';try{h=T.flowHTML()}catch(e){continue}
     for(const mm of h.matchAll(/data-(?:still|sl)="([^"]+)"/g)){const [id,ci,w,v,pz,ar]=mm[1].split(':');if(v!==veh)continue;const st=T.STORIES.find(s=>s.id===id);if(!st)continue;
      const o={w:+w,p:pz,ac};if(+ar>0)o.ar=+ar;const key=T.cnStillKey(st,+ci,veh,o);out.set(key,{id,ci:+ci,veh,o})}}}
   tr.story=sv;c.vehicle=vv}
  return [...out.entries()]},MODELS);
 let list=want.map(([key,v])=>({key,stem:key.replace(/\|/g,'-'),...v}));if(only)list=list.filter(x=>only.test(x.stem));if(limit)list=list.slice(0,limit);
 console.log('pictures wanted:',list.length,'sig',sig,'models',MODELS.map(x=>x.join(':')).join(','));
 await p.evaluate(()=>window.__t.cnTexWait());
 const man={};let done=0,bytes=0,t0=Date.now();fs.writeFileSync(path.join(outDir,'.sig'),sig);
 for(const x of list){
  const f=path.join(outDir,x.stem+'.webp');let buf;
  if(flag('resume')&&fs.existsSync(f)&&fs.existsSync(path.join(outDir,'.sig'))&&fs.readFileSync(path.join(outDir,'.sig'),'utf8')===sig){const raw=await sharp(f).resize(1,3,{fit:'fill',kernel:'cubic'}).removeAlpha().raw().toBuffer();man[x.stem]=bands(raw);bytes+=fs.statSync(f).size;done++;continue}
  const url=await p.evaluate(async x=>{const T=window.__t,st=T.STORIES.find(s=>s.id===x.id);return await T.cnStillRender(st,x.ci,x.veh,Object.assign({mime:'image/png'},x.o),null)},x);
  if(!url){console.error('no picture for',x.stem);continue}
  const png=Buffer.from(url.split(',')[1],'base64');
  buf=await sharp(png).webp({quality:Q,effort:5,smartSubsample:true}).toBuffer();
  fs.writeFileSync(f,buf);bytes+=buf.length;
  // three bands (top, middle, bottom) of the picture's own colours: the frame shown while the file loads
  const raw=await sharp(png).resize(1,3,{fit:'fill',kernel:'cubic'}).removeAlpha().raw().toBuffer();
  man[x.stem]=bands(raw);
  if(++done%20===0)console.log(done+'/'+list.length,Math.round((Date.now()-t0)/1000)+'s',Math.round(bytes/1024)+' KB');
 }
 console.log('rendered',done,'files',Math.round(bytes/1024)+' KB in',Math.round((Date.now()-t0)/1000)+'s');
 await b.close();
 // 2. the manifest (merged with what is already there when --only/--limit narrowed the set), and files that are no longer wanted are removed
 let old={};try{old=JSON.parse((src.match(/<script type="application\/json" id="stillsMan">([\s\S]*?)<\/script>/)||[])[1]||'{}')}catch(e){}
 const merged=(only||limit)&&old.sig===sig?Object.assign({},old.k,man):man;
 const keepStems=new Set(Object.keys(merged));
 if(!only&&!limit)fs.readdirSync(outDir).filter(n=>n.endsWith('.webp')&&!keepStems.has(n.slice(0,-5))).forEach(n=>fs.unlinkSync(path.join(outDir,n)));
 const dflt={};MODELS.forEach(([v,a])=>{if(!dflt[v])dflt[v]=a});
 const json=JSON.stringify({sig,d:dflt,k:Object.fromEntries(Object.keys(merged).sort().map(k=>[k,merged[k]]))});
 const out=src.replace(/<script type="application\/json" id="stillsMan">[\s\S]*?<\/script>/,()=>'<script type="application/json" id="stillsMan">'+json+'</script>');
 if(out===src&&!src.includes(json))throw new Error('manifest block not found');
 fs.writeFileSync(html,out);console.log('manifest:',Object.keys(merged).length,'entries,',json.length,'bytes ->',html);
 fs.rmSync(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
