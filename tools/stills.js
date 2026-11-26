#!/usr/bin/env node
/* Pre-rendered mission pictures (tools/stills.js)
 *
 *   node tools/stills.js [index.html=web/index.html] [outDir=<index dir>/stills] [--models=plane:p51,quad:fs5] [--only=<regex on file stem>] [--force] [--q=68]
 *
 * Renders every picture the stage wall can ask for (all default courses x stories x vehicles) for every aircraft of the page with the
 * page's OWN picture code (cnStillRender, headless Chromium, software GL, the highest quality level), writes them as WebP files next
 * to the site (stills/<key>.webp) and writes the manifest (#stillsMan: PIC_SIG, the signature of each aircraft, the file stems and
 * three colours of each) into index.html.
 *
 * It renders only what is missing or stale: a picture is kept when the page's PIC_SIG and the signature of ITS aircraft (PIC_MSIG)
 * are the ones it was made with and the file is there. So after changing one aircraft only that aircraft's pictures (about 2 minutes)
 * are made again; after a change to the world, the shots or the renderer (PIC_SIG) all of them (about 30 minutes). --force renders all.
 *
 * The page's signatures must be current (node tools/picsig.js --write); a manifest only counts for a page whose signatures match it,
 * so a stale one is ignored and the poster is drawn on the device, as before.
 *
 * needs: playwright (+ chromium), sharp, typescript; THREE_JS=<path to three.min.js r128> (without it three.js comes from its CDN).
 * The manifest is written after every aircraft, so an interrupted run loses at most one aircraft.
 */
const fs=require('fs'),path=require('path');
const {req,instrument,openPage}=require('./lib');
const sharp=req('sharp');
const {verify}=require('./picsig');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):d};
const flag=k=>process.argv.includes('--'+k);
const pos=process.argv.slice(2).filter(x=>!x.startsWith('--'));
const html=path.resolve(pos[0]||'web/index.html'),outDir=path.resolve(pos[1]||path.join(path.dirname(html),'stills'));
const only=arg('only')?new RegExp(arg('only')):null,Q=+arg('q',68),pick=arg('models')?arg('models').split(',').map(x=>x.replace(':','.')):null;
const bands=raw=>[0,1,2].map(i=>[0,1,2].map(c=>raw[i*3+c].toString(16).padStart(2,'0')).join('')).join('');
const MANRE=/<script type="application\/json" id="stillsMan">([\s\S]*?)<\/script>/;
(async()=>{
 const v=await verify(html);
 if(!v.ok){console.error('the signatures of the page are stale: node tools/picsig.js '+html+' --write\n  '+v.problems.join('\n  '));process.exit(1)}
 const sig=v.sig,MS=v.ms;fs.mkdirSync(outDir,{recursive:true});
 let src=fs.readFileSync(html,'utf8'),old={};try{old=JSON.parse((src.match(MANRE)||[])[1]||'{}')}catch(e){}
 const oldOk=!flag('force')&&old.sig===sig&&old.k&&old.ms;
 const models=Object.keys(MS).filter(id=>!pick||pick.includes(id));
 const dflt={};Object.keys(MS).forEach(id=>{const [vh,ac]=id.split('.');if(!dflt[vh])dflt[vh]=ac});
 const same=id=>!!(oldOk&&old.ms[id]===MS[id]);
 // the manifest as it stands: what is valid for the current signatures
 const k={},ms={};
 Object.keys(MS).forEach(id=>{if(same(id)){ms[id]=MS[id];Object.keys(old.k).forEach(s=>{if(s.includes('-'+id+'-'))k[s]=old.k[s]})}});
 const writeMan=()=>{const json=JSON.stringify({sig,ms,d:dflt,k:Object.fromEntries(Object.keys(k).sort().map(s=>[s,k[s]]))});
  const cur=fs.readFileSync(html,'utf8');const out=cur.replace(MANRE,()=>'<script type="application/json" id="stillsMan">'+json+'</script>');
  if(out===cur&&!cur.includes(json))throw new Error('manifest block not found');fs.writeFileSync(html,out);return json.length};
 const ins=instrument(html,'S,render,flowHTML,STORIES,cnStillRender,cnStillKey,cnStillMk,cnTexWait,courseVeh,CINE,CN,cnLQ,vehOf,setMode:v=>{MODE=v;try{localStorage.setItem("fpv-appmode",v)}catch(e){}}');
 const {b,p}=await openPage(ins.index);
 let done=0,kept=0,bytes=0,t0=Date.now();
 try{
  await p.evaluate(()=>window.__t.cnTexWait());
  for(const id of models){
   const [veh,ac]=id.split('.');
   // 1. every picture the stage wall can ask for with this aircraft
   const want=await p.evaluate(([veh,ac])=>{const T=window.__t,St=T.S,out=new Map();
    for(const c of St.courses){const tr=St.users.find(u=>u.course===c.id&&u.role==='חניך');if(!tr)continue;St.role='trainee';St.trainee=tr.id;const sv=tr.story,vv=c.vehicle;c.vehicle=veh;
     for(const sid of ['none'].concat(T.STORIES.map(s=>s.id))){tr.story=sid;let h='';try{h=T.flowHTML()}catch(e){continue}
      for(const mm of h.matchAll(/data-(?:still|sl)="([^"]+)"/g)){const [sId,ci,w,v,pz,ar]=mm[1].split(':');if(v!==veh)continue;const st=T.STORIES.find(s=>s.id===sId);if(!st)continue;
       const o={w:+w,p:pz,ac};if(+ar>0)o.ar=+ar;out.set(T.cnStillKey(st,+ci,veh,o),{id:sId,ci:+ci,veh,o})}}
     tr.story=sv;c.vehicle=vv}
    return [...out.entries()]},[veh,ac]);
   let list=want.map(([key,x])=>({key,stem:key.replace(/\|/g,'-'),...x}));if(only)list=list.filter(x=>only.test(x.stem));
   const todo=list.filter(x=>!(same(id)&&k[x.stem]&&fs.existsSync(path.join(outDir,x.stem+'.webp'))));
   kept+=list.length-todo.length;
   console.log(id.padEnd(10),'pictures',list.length,'to render',todo.length);
   for(const x of todo){
    const f=path.join(outDir,x.stem+'.webp');
    const url=await p.evaluate(async x=>{const T=window.__t,st=T.STORIES.find(s=>s.id===x.id);return await T.cnStillRender(st,x.ci,x.veh,Object.assign({mime:'image/png'},x.o),null)},x);
    if(!url){console.error('no picture for',x.stem);continue}
    const png=Buffer.from(url.split(',')[1],'base64');
    const buf=await sharp(png).webp({quality:Q,effort:5,smartSubsample:true}).toBuffer();
    fs.writeFileSync(f,buf);bytes+=buf.length;
    // three bands (top, middle, bottom) of the picture's own colours: the frame shown while the file loads
    const raw=await sharp(png).resize(1,3,{fit:'fill',kernel:'cubic'}).removeAlpha().raw().toBuffer();
    k[x.stem]=bands(raw);done++;
    if(done%25===0)console.log('  rendered',done,Math.round((Date.now()-t0)/1000)+'s',Math.round(bytes/1024)+' KB')}
   // the aircraft's pictures now match its signature; drop entries that this aircraft no longer asks for
   const want_=new Set(list.map(x=>x.stem));if(!only)Object.keys(k).forEach(s=>{if(s.includes('-'+id+'-')&&!want_.has(s))delete k[s]});
   ms[id]=MS[id];writeMan();
  }
 }finally{await b.close();ins.clean()}
 // files that are no longer in the manifest are removed (only after a complete run)
 if(!only&&!pick){const keep=new Set(Object.keys(k));fs.readdirSync(outDir).filter(n=>n.endsWith('.webp')&&!keep.has(n.slice(0,-5))).forEach(n=>fs.unlinkSync(path.join(outDir,n)));
  fs.readdirSync(outDir).filter(n=>n==='.sig').forEach(n=>fs.unlinkSync(path.join(outDir,n)))}
 const n=writeMan();
 console.log('rendered',done,'kept',kept,'|',Math.round(bytes/1024)+' KB new in',Math.round((Date.now()-t0)/1000)+'s | manifest:',Object.keys(k).length,'entries,',n,'bytes ->',html);
})().catch(e=>{console.error(e);process.exit(1)});
