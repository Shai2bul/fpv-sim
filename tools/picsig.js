// picture signatures: what can change a poster's pixels, hashed, so that a cached or pre-rendered picture is only ever
// used for the picture code that made it.
//   node tools/picsig.js [web/index.html] [--list] [--check] [--write] [--static]
//
// PIC_SIG   the world, the shots, the textures, the renderer: the top-level declarations reachable from the poster renderer
//           (TypeScript symbol resolution, so local variables with the same name do not count). Declarations that only hold
//           app state, settings or cache plumbing are cut (CUT): they decide WHICH picture is asked for, never what it looks
//           like. The aircraft are cut too (MODEL): they are covered by PIC_MSIG.
// PIC_MSIG  one signature per aircraft ('plane.p51', 'quad.fs5', ...): a fingerprint of the hero object the page builds for
//           it (geometry, colours, materials, numbers the shots read), taken in headless Chromium. A change to one aircraft
//           therefore invalidates the pictures of that aircraft only; physics numbers do not touch it at all.
// Needs typescript (npm i typescript); the aircraft part needs playwright and THREE_JS=<three.min.js r128> (or the CDN).
const fs=require('fs'),crypto=require('crypto');
const {req,modelSigs}=require('./lib');
const ts=req('typescript');
const ROOTS='cnStillRender,cnWorld,cnTerrain,cnPlane,cnDrone,cnPost,CN_SHOTS,CN_POSE,CN_SHW,cnShotKit,STORIES,CN_TOD,cnClearLOS,SimTex'.split(',');
const CUT=new Set('S,load,seed,tplLessons,LESSON_TPL,CRIT,KEY,curTrainee,cfg,CFG,CFGK,cfgChain,cfgRes,cfgV,SIM,SIMOSD,cnSimLive,IMGC,CNS,cnStillKey,cnStillMk,cnStillFile,cnStillLoad,cnPh,cnStill,cnStillPut,cnStillHydrate,cnStillWatch,cnStillRelease,cnTexWait,TXC,CINE,PIC_SIG,PIC_MSIG,STILLS,cnLQ'.split(','));
// what the two hero builders (cnPlane, cnDrone) read about WHICH aircraft: its geometry and tables. Everything reachable only through
// these is part of an aircraft, hence of PIC_MSIG, not of PIC_SIG.
const MODEL=new Set('acBuild,PLANES,PLVS,planeKey,droneGeo,bladeGeo,propGeo,motorPos,QLED,QLOOK,QUADS,quadKey'.split(','));
function analyse(file){
 const src=fs.readFileSync(file,'utf8');const m=src.match(/<script type="text\/x-fpv" id="appSrc">/);const s0=m.index+m[0].length,s1=src.indexOf('</script>',s0);const app=src.slice(s0,s1);
 const baseLine=src.slice(0,s0).split('\n').length;const fn='app.js';
 const opts={allowJs:true,checkJs:false,noEmit:true,target:ts.ScriptTarget.ES2020,noLib:true,skipLibCheck:true,types:[]};
 const host=ts.createCompilerHost(opts);const orig=host.getSourceFile.bind(host);
 host.getSourceFile=(f,lv,...r)=>f===fn?ts.createSourceFile(fn,app,lv,true):orig(f,lv,...r);host.fileExists=f=>f===fn||ts.sys.fileExists(f);host.readFile=f=>f===fn?app:ts.sys.readFile(f);
 const prog=ts.createProgram([fn],opts,host);const sf=prog.getSourceFile(fn);const chk=prog.getTypeChecker();
 let n=sf.statements[0].expression;while(n&&!ts.isArrowFunction(n)&&!ts.isFunctionExpression(n))n=n.expression;const STS=n.body.statements;
 const decls=[];STS.forEach(st=>{if(ts.isFunctionDeclaration(st)&&st.name)decls.push({name:st.name.text,node:st,id:st.name});
  else if(ts.isVariableStatement(st))st.declarationList.declarations.forEach(d=>{if(ts.isIdentifier(d.name))decls.push({name:d.name.text,node:d,id:d.name,stmt:st})});
  else if(ts.isClassDeclaration(st)&&st.name)decls.push({name:st.name.text,node:st,id:st.name})});
 const symOf=new Map();decls.forEach(d=>{const s=chk.getSymbolAtLocation(d.id);if(s)symOf.set(s,d)});
 const refs=d=>{const out=new Set();(function w(x){if(ts.isIdentifier(x)){const s=chk.getSymbolAtLocation(x);const dd=s&&symOf.get(s);if(dd&&dd!==d)out.add(dd)}ts.forEachChild(x,w)})(d.node);return out};
 const byName=new Map();decls.forEach(d=>(byName.get(d.name)||byName.set(d.name,[]).get(d.name)).push(d));
 const seen=new Set(),stack=[];ROOTS.forEach(r=>(byName.get(r)||[]).forEach(d=>stack.push(d)));if(!stack.length)throw new Error('roots not found');
 const out=d=>(CUT.has(d.name)||MODEL.has(d.name))&&!ROOTS.includes(d.name);
 while(stack.length){const d=stack.pop();if(seen.has(d))continue;seen.add(d);if(out(d))continue;refs(d).forEach(x=>{if(!seen.has(x))stack.push(x)})}
 const list=[...seen].filter(d=>!out(d)).map(d=>{const nd=d.node;const a=nd.getStart(),b=nd.getEnd();return {name:d.name,a,b,text:app.slice(a,b),line:sf.getLineAndCharacterOfPosition(a).line+baseLine}}).sort((x,y)=>x.a-y.a);
 // a declaration list "const a=..,b=.." counts each declarator separately; hash by position-independent text in source order
 const h=crypto.createHash('sha1');list.forEach(x=>{h.update(x.name+'\u0001'+x.text+'\u0002')});
 return {sig:h.digest('hex').slice(0,12),list,total:decls.length,chars:list.reduce((a,x)=>a+x.text.length,0),app};
}
const readMsig=app=>{const m=app.match(/const PIC_MSIG=(\{[^}]*\});/);try{return m?JSON.parse(m[1]):null}catch(e){return null}};
// compares the constants of the page with the picture code; returns {ok,problems,sig,ms}
async function verify(file,o={}){
 const r=analyse(file),cur=(r.app.match(/const PIC_SIG='([0-9a-f]*)'/)||[])[1],problems=[];
 if(cur!==r.sig)problems.push('PIC_SIG is '+(cur||'empty')+' but the picture code hashes to '+r.sig);
 let ms=null;
 if(!o.static){ms=await modelSigs(file);const w=readMsig(r.app)||{};
  Object.keys(ms).forEach(k=>{if(w[k]!==ms[k])problems.push('PIC_MSIG '+k+' is '+(w[k]||'missing')+' but the aircraft builds to '+ms[k])});
  Object.keys(w).forEach(k=>{if(!(k in ms))problems.push('PIC_MSIG '+k+' is not an aircraft of the page any more')})}
 return {ok:!problems.length,problems,sig:r.sig,ms,r};
}
module.exports={analyse,verify,readMsig};
if(require.main===module)(async()=>{
 const args=process.argv.slice(2),flag=k=>args.includes('--'+k);
 const file=args.find(a=>!a.startsWith('--'))||'web/index.html';
 const v=await verify(file,{static:flag('static')}),r=v.r;
 console.log('PIC_SIG',v.sig,'| declarations',r.list.length,'of',r.total,'| chars',r.chars,'of',r.app.length);
 if(v.ms)console.log('PIC_MSIG',Object.entries(v.ms).map(([k,s])=>k+'='+s).join(' '));
 if(flag('list'))console.log(r.list.map(x=>x.line+':'+x.name).join(' '));
 if(flag('write')){
  let src=fs.readFileSync(file,'utf8');const a=src.replace(/const PIC_SIG='[0-9a-f]*';/,"const PIC_SIG='"+v.sig+"';");if(a===src&&!src.includes("const PIC_SIG='"+v.sig+"';"))throw new Error('PIC_SIG constant not found');
  let b=a;if(v.ms){const js=JSON.stringify(Object.fromEntries(Object.keys(v.ms).sort().map(k=>[k,v.ms[k]])));b=a.replace(/const PIC_MSIG=\{[^}]*\};/,()=>'const PIC_MSIG='+js+';');if(b===a&&!a.includes('const PIC_MSIG='+js+';'))throw new Error('PIC_MSIG constant not found')}
  fs.writeFileSync(file,b);console.log('written:',v.problems.length?v.problems.join('; '):'nothing to change');return}
 if(flag('check')){if(!v.ok){console.error('picture signatures are stale:\n  '+v.problems.join('\n  ')+'\n-> node tools/picsig.js '+file+' --write, then node tools/stills.js (it renders only what changed)');process.exit(2)}console.log('picture signatures ok')}
})().catch(e=>{console.error(e);process.exit(1)});
