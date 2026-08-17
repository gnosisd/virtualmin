const UP='https://raw.githubusercontent.com/jaredrhod/barehands/0a097be1d95069f6121326e05985fc1418e9189f/stage.html';
const CTRL='https://raw.githubusercontent.com/gnosisd/virtualmin/aelia-control-engine-v1/barehands-clean/control-engine-v1.js';
const ADDON='https://raw.githubusercontent.com/gnosisd/virtualmin/aelia-natural-control-v1/barehands-clean/aelia-natural-controls.js';

function must(h,needle,name){if(!h.includes(needle))throw new Error('patch anchor missing: '+name);return h;}
function patch(h,ctrl,addon){
  must(h,'import { HandLandmarker, FilesetResolver } from','vision import');
  h=h.replace('import { HandLandmarker, FilesetResolver } from','import { HandLandmarker, FaceLandmarker, FilesetResolver } from');
  const hook='\nif (ROLE === "render") {';
  must(h,hook,'module hook');
  h=h.replace(hook,'\n'+ctrl+'\n'+addon+'\n'+hook);
  const faceAnchor='minHandPresenceConfidence: 0.5 });';
  must(h,faceAnchor,'hand model end');
  h=h.replace(faceAnchor,faceAnchor+'\n  await AELIA_CTRL.initFace(vision);');
  const frameAnchor='const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;';
  must(h,frameAnchor,'frame');
  h=h.replace(frameAnchor,frameAnchor+'\n    AELIA_CTRL.updateEyes(now);');
  const loop='(res.landmarks || []).forEach((lms, i) => {';
  must(h,loop,'hand loop');
  h=h.replace(loop,loop+'\n        lms = AELIA_CTRL.smooth(i, lms, now);');
  const tRel=`const tRel = span > 0 ? Math.hypot(\n          lms[4].x - lms[13].x, lms[4].y - lms[13].y) / span : 0;`;
  must(h,tRel,'gesture feature anchor');
  h=h.replace(tRel,tRel+`\n        const aelia = AELIA_CTRL.classifyHand(i,lms,{\n          ratio,span,aspect,tRel,f8v,backMean,extArr,extFingers,\n          handedness:((res.handednesses||[])[i]||[])[0]?.categoryName||''\n        },now);`);
  const pinchRe=/cur\.pinched = handGarbage \? false[\s\S]*?\(okNow \|\| cur\.okEma > 0\.55 \|\| holdingI\);/;
  if(!pinchRe.test(h))throw new Error('patch anchor missing: pinch block');
  h=h.replace(pinchRe,`cur.pinched = !handGarbage && aelia.grab;\n        cur.threeMove = cur.pinched;`);
  must(h,'cur.badRun = okBack ? 0 : (cur.badRun || 0) + 1;','probation');
  h=h.replace('cur.badRun = okBack ? 0 : (cur.badRun || 0) + 1;','cur.badRun = aelia.grab ? 0 : (cur.badRun || 0) + 1;');
  const pinchClass='cur.el.classList.toggle("pinched", cur.pinched);';
  must(h,pinchClass,'pinched class');
  h=h.replace(pinchClass,pinchClass+'\n        AELIA_CTRL.handleClick(i,cur,aelia,now);');
  const palm='const palmOpen = extFingers >= 4 && ratio > 0.8;';
  must(h,palm,'palm open');
  h=h.replace(palm,'const palmOpen = false;');
  must(h,'cur.softOpen = extFingers >= 3 && ratio > 0.7;','soft open');
  h=h.replace('cur.softOpen = extFingers >= 3 && ratio > 0.7;','cur.softOpen = false;');
  const clawRe=/const claw = ratio > \(inClaw \? 0\.68 : 0\.80\)[\s\S]*?h16 < \(inClaw \? 1\.6 : 1\.5\);/;
  if(!clawRe.test(h))throw new Error('patch anchor missing: claw');
  h=h.replace(clawRe,'const claw = false;');
  const oldHint='tap the RING = orbs · tap an orb = its tree · TAP a card = open · pinch-drag = move';
  if(h.includes(oldHint))h=h.replace(oldHint,'LOOK = focus · look at RING = options · NOD = open/confirm · 3-FINGER GRAB = move · TWO HANDS = scale');
  return h;
}
module.exports=async function(req,res){
  try{
    const headers={'User-Agent':'aelia-natural-control'};
    const [r,c,a]=await Promise.all([fetch(UP,{headers}),fetch(CTRL,{headers}),fetch(ADDON,{headers})]);
    if(!r.ok)throw new Error('upstream '+r.status);if(!c.ok)throw new Error('control '+c.status);if(!a.ok)throw new Error('addon '+a.status);
    const html=patch(await r.text(),await c.text(),await a.text());
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Permissions-Policy','camera=(self), microphone=(self)');res.status(200).send(html);
  }catch(e){res.status(500).send('<pre>AELIA natural stage failed: '+String(e.stack||e.message||e)+'</pre>');}
};
