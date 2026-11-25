// picture signature: which top-level declarations of the app source can change a poster's pixels, and a hash of exactly those.
//   node tools/picsig.js [web/index.html] [--list] [--check] [--write]
// The closure starts at the poster renderer and follows every reference to another top-level declaration (TypeScript symbol
// resolution, so local variables with the same name do not count). Declarations that only hold app state, settings or cache
// plumbing are cut (CUT): they decide WHICH picture is asked for, never what it looks like.
const fs=require('fs'),crypto=require('crypto');
let ts;try{ts=require('typescript')}catch(e){ts=require('/opt/npm-tools/node_modules/typescript')} // npm i typescript
const ROOTS='cnStillRender,cnWorld,cnTerrain,cnPlane,cnDrone,cnPost,CN_SHOTS,CN_POSE,CN_SHW,cnShotKit,STORIES,CN_TOD,cnClearLOS,SimTex'.split(',');
const CUT=new Set('S,load,seed,tplLessons,LESSON_TPL,CRIT,KEY,curTrainee,cfg,CFG,CFGK,cfgChain,cfgRes,cfgV,SIM,SIMOSD,cnSimLive,IMGC,CNS,cnStillKey,cnStillMk,cnStillFile,cnStillLoad,cnPh,cnStill,cnStillPut,cnStillHydrate,cnStillWatch,cnStillRelease,cnTexWait,TXC,CINE,PIC_SIG,STILLS,cnLQ'.split(','));
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
 while(stack.length){const d=stack.pop();if(seen.has(d))continue;seen.add(d);if(CUT.has(d.name)&&!ROOTS.includes(d.name))continue;refs(d).forEach(x=>{if(!seen.has(x))stack.push(x)})}
 const list=[...seen].filter(d=>!CUT.has(d.name)||ROOTS.includes(d.name)).map(d=>{const nd=d.node;const a=nd.getStart(),b=nd.getEnd();return {name:d.name,a,b,text:app.slice(a,b),line:sf.getLineAndCharacterOfPosition(a).line+baseLine}}).sort((x,y)=>x.a-y.a);
 // a declaration list "const a=..,b=.." counts each declarator separately; hash by position-independent text in source order
 const h=crypto.createHash('sha1');list.forEach(x=>{h.update(x.name+'\u0001'+x.text+'\u0002')});
 return {sig:h.digest('hex').slice(0,12),list,total:decls.length,chars:list.reduce((a,x)=>a+x.text.length,0),app};
}
module.exports={analyse};
if(require.main===module){
 const file=process.argv.slice(2).find(a=>!a.startsWith('--'))||'web/index.html';const r=analyse(file);
 console.log('PIC_SIG',r.sig,'| declarations',r.list.length,'of',r.total,'| chars',r.chars,'of',r.app.length);
 if(process.argv.includes('--list'))console.log(r.list.map(x=>x.line+':'+x.name).join(' '));
 const cur=(r.app.match(/const PIC_SIG='([0-9a-f]*)'/)||[])[1];
 if(process.argv.includes('--write')){const src=fs.readFileSync(file,'utf8');const out=src.replace(/const PIC_SIG='[0-9a-f]*';/,"const PIC_SIG='"+r.sig+"';");if(out===src&&cur!==r.sig)throw new Error('PIC_SIG constant not found');fs.writeFileSync(file,out);console.log('PIC_SIG written',cur||'(empty)','->',r.sig)}
 if(process.argv.includes('--check')){if(cur!==r.sig){console.error('PIC_SIG is stale: source says',cur,'but the picture code hashes to',r.sig,'-> node picsig.js <file> --write, then regenerate the pre-rendered pictures');process.exit(2)}console.log('PIC_SIG ok')}
}
