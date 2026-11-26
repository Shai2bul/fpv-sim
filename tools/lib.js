// shared by picsig.js and stills.js: an instrumented copy of the page in headless Chromium.
// The copy is the very same source plus an export object (window.__t); it is never written back.
const fs=require('fs'),path=require('path'),os=require('os');
const req=m=>{try{return require(m)}catch(e){return require('/opt/npm-tools/node_modules/'+m)}};

function instrument(html,EXP){
 const src=fs.readFileSync(html,'utf8');
 const m=src.match(/(<script type="text\/x-fpv" id="appSrc">)([\s\S]*?)(<\/script>)/);
 const mark="setupLang();\nsave(); render();";if(!m||!m[2].includes(mark))throw new Error('page tail not found');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fpvtool-'));
 fs.writeFileSync(path.join(dir,'index.html'),src.slice(0,m.index+m[1].length)+m[2].replace(mark,'window.__t={'+EXP+'};'+mark)+src.slice(m.index+m[1].length+m[2].length));
 fs.writeFileSync(path.join(dir,'config.js'),"window.FPV_CONFIG={url:'',key:''};");
 return {dir,index:path.join(dir,'index.html'),src,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

// THREE_JS=<path to three.min.js r128> serves three.js from disk instead of the CDN
async function openPage(index){
 const {chromium}=req('playwright');
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 if(process.env.THREE_JS){const three=fs.readFileSync(process.env.THREE_JS,'utf8');await ctx.route(/three\.min\.js/,r=>r.fulfill({status:200,contentType:'application/javascript',body:three}))}
 const p=await ctx.newPage();p.on('pageerror',e=>console.error('PAGEERR',e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('fpv-tour-off-admin','1');localStorage.setItem('fpv-tour-off-trainee','1')}catch(e){}Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})});
 await p.goto('file://'+index);await p.waitForTimeout(1500);
 return {b,p};
}

// a fingerprint of everything an aircraft contributes to a picture: the hero object the page builds for it
// (geometry, colours, materials, transforms, the numbers the shots read from it), rounded to 1e-4 so that
// float noise cannot change it. Runs inside the page.
function fingerprintFn(){
 return root=>{
  let a=0x811c9dc5|0,c=0x9e3779b9|0;
  const mix=v=>{v|=0;a=Math.imul(a^v,16777619);c=Math.imul(c^(v+0x7f4a7c15|0),2246822519);c^=c>>>13};
  const num=x=>mix(Math.round(x*1e4)),str=s=>{s=String(s);for(let i=0;i<s.length;i++)mix(s.charCodeAt(i));mix(31)};
  const arr=A=>{mix(A.length);for(let i=0;i<A.length;i++)num(A[i])};
  root.traverse(n=>{
   str(n.type);mix(n.visible?1:0);num(n.position.x);num(n.position.y);num(n.position.z);num(n.rotation.x);num(n.rotation.y);num(n.rotation.z);num(n.scale.x);num(n.scale.y);num(n.scale.z);
   const g=n.geometry;if(g){str(g.type);Object.keys(g.attributes||{}).sort().forEach(k=>{str(k);arr(g.attributes[k].array)});if(g.index)arr(g.index.array);if(g.parameters)str(JSON.stringify(g.parameters))}
   [].concat(n.material||[]).forEach(m=>{str(m.type);str(m.color?m.color.getHex():'');str(m.emissive?m.emissive.getHex():'');
    ['roughness','metalness','opacity','side','transparent','depthWrite','depthTest','vertexColors','flatShading','blending'].forEach(k=>str(m[k]));str(m.map&&m.map.image?m.map.image.width+'x'+m.map.image.height:'')});
   const u=n.userData||{};Object.keys(u).sort().forEach(k=>{const v=u[k];
    if(typeof v==='number'||typeof v==='boolean'||typeof v==='string'){str(k);str(v)}
    else if(Array.isArray(v)&&v.length&&v[0]&&v[0].isVector3){str(k);v.forEach(q=>{num(q.x);num(q.y);num(q.z)})}})});
  return ((a>>>0).toString(16).padStart(8,'0')+(c>>>0).toString(16).padStart(8,'0')).slice(0,12);
 };
}

// {'plane.p51':sig,'quad.fs5':sig,...} for every aircraft the page knows
async function modelSigs(html){
 const ins=instrument(html,'PLANES,QUADS,cnPlane,cnDrone,CINE');
 let pg;try{
  pg=await openPage(ins.index);
  return await pg.p.evaluate(async fpSrc=>{
   const T=window.__t,fp=eval('('+fpSrc+')')();await T.CINE.prep();
   if(!window.THREE)throw new Error('three.js did not load (set THREE_JS=<three.min.js r128>)');
   const out={};
   Object.keys(T.PLANES).forEach(k=>{out['plane.'+k]=fp(T.cnPlane('#ffb02e',k))});
   Object.keys(T.QUADS).forEach(k=>{out['quad.'+k]=fp(T.cnDrone('#ffb02e',0,k))});
   return out},String(fingerprintFn));
 }finally{if(pg)await pg.b.close();ins.clean()}
}

module.exports={req,instrument,openPage,modelSigs,fingerprintFn};
