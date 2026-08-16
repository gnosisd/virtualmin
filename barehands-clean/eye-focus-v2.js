// AELIA eye-focus v2: 5-point calibration, smoothing and target magnetism.
// This code is injected INSIDE the original Barehands module.
let faceLandmarker = null;
const EYE = {
  last: 0, x: 0.5, y: 0.5, raw: null, candidate: null, candidateT: 0,
  focus: null, focusT: 0, cal: null, calStep: 0, calT: 0, samples: [], overlay: null
};

function eyeBlend(result, name) {
  const cats = result?.faceBlendshapes?.[0]?.categories || [];
  const c = cats.find(x => x.categoryName === name || x.displayName === name);
  return c ? c.score : 0;
}

function eyeRaw(result) {
  if (!result?.faceBlendshapes?.length) return null;
  const inL = eyeBlend(result,'eyeLookInLeft'), inR = eyeBlend(result,'eyeLookInRight');
  const outL = eyeBlend(result,'eyeLookOutLeft'), outR = eyeBlend(result,'eyeLookOutRight');
  const upL = eyeBlend(result,'eyeLookUpLeft'), upR = eyeBlend(result,'eyeLookUpRight');
  const downL = eyeBlend(result,'eyeLookDownLeft'), downR = eyeBlend(result,'eyeLookDownRight');
  return {
    x: ((outL + inR) - (inL + outR)) * 0.5,
    y: ((downL + downR) - (upL + upR)) * 0.5
  };
}

function eyeLoadCal() {
  try {
    const c = JSON.parse(localStorage.getItem('barehands-eye-cal-v2') || 'null');
    if (c?.center && c?.left && c?.right && c?.up && c?.down) { EYE.cal = c; return true; }
  } catch(e) {}
  return false;
}

function eyeSaveCal(c) {
  EYE.cal = c;
  try { localStorage.setItem('barehands-eye-cal-v2', JSON.stringify(c)); } catch(e) {}
}

function eyeMean(a) {
  if (!a.length) return {x:0,y:0};
  return {x:a.reduce((s,v)=>s+v.x,0)/a.length, y:a.reduce((s,v)=>s+v.y,0)/a.length};
}

function eyeEnsureOverlay() {
  if (EYE.overlay?.isConnected) return EYE.overlay;
  const o=document.createElement('div');
  o.id='bh-eye-cal';
  o.style.cssText='position:fixed;inset:0;z-index:10040;pointer-events:none;display:none';
  o.innerHTML='<div id="bh-eye-cal-dot" style="position:absolute;width:26px;height:26px;margin:-13px;border-radius:50%;border:3px solid #8ff0e4;box-shadow:0 0 24px #8ff0e4;background:rgba(143,240,228,.16)"></div><div style="position:absolute;left:50%;top:24px;transform:translateX(-50%);padding:8px 14px;border-radius:10px;background:rgba(0,0,0,.72);color:#cffff7;font:12px SFMono-Regular,Menlo,monospace;letter-spacing:.08em">EYE CALIBRATION · LOOK AT THE DOT</div>';
  document.body.appendChild(o); EYE.overlay=o; return o;
}

function eyeCalPoint() {
  return [
    {k:'center',x:.50,y:.50},
    {k:'left',x:.14,y:.50},
    {k:'right',x:.86,y:.50},
    {k:'up',x:.50,y:.15},
    {k:'down',x:.50,y:.85}
  ][EYE.calStep-1];
}

function eyePlaceDot() {
  const p=eyeCalPoint(); if(!p) return;
  const d=eyeEnsureOverlay().querySelector('#bh-eye-cal-dot');
  d.style.left=(p.x*100)+'%'; d.style.top=(p.y*100)+'%';
}

function startEyeCalibration() {
  if (!faceLandmarker || EYE.calStep) return;
  EYE.cal = null; EYE.calStep=1; EYE.calT=performance.now(); EYE.samples=[];
  const o=eyeEnsureOverlay(); o.style.display='block'; eyePlaceDot();
  try { toast('EYES — follow the 5 dots; keep your head comfortable',2200); } catch(e) {}
}

function finishEyeCalibration() {
  const o=eyeEnsureOverlay(); o.style.display='none';
  EYE.calStep=0; EYE.samples=[];
  EYE.x=.5; EYE.y=.5;
  try { toast('EYES CALIBRATED — look, then thumb+index to confirm',2200); } catch(e) {}
}

function eyeCalibrationFrame(raw, now) {
  if (!EYE.calStep) return false;
  const p=eyeCalPoint(); if(!p) return false;
  const age=now-EYE.calT;
  if (age>420 && age<1250) EYE.samples.push(raw);
  if (age>=1300) {
    const val=eyeMean(EYE.samples);
    EYE._calTmp=EYE._calTmp||{}; EYE._calTmp[p.k]=val;
    EYE.samples=[]; EYE.calStep++;
    if (EYE.calStep>5) {
      eyeSaveCal(EYE._calTmp); EYE._calTmp=null; finishEyeCalibration();
    } else { EYE.calT=now; eyePlaceDot(); }
  }
  return true;
}

function eyeMap(raw) {
  const c=EYE.cal; if(!c) return null;
  const dxR=(c.right.x-c.center.x)||0.001, dxL=(c.left.x-c.center.x)||-0.001;
  const dyD=(c.down.y-c.center.y)||0.001, dyU=(c.up.y-c.center.y)||-0.001;
  const dirX=Math.sign(c.right.x-c.left.x)||1;
  const dirY=Math.sign(c.down.y-c.up.y)||1;
  let x,y;
  if ((raw.x-c.center.x)*dirX>=0) x=.5+.36*((raw.x-c.center.x)/dxR);
  else x=.5-.36*((raw.x-c.center.x)/dxL);
  if ((raw.y-c.center.y)*dirY>=0) y=.5+.35*((raw.y-c.center.y)/dyD);
  else y=.5-.35*((raw.y-c.center.y)/dyU);
  return {x:Math.max(0,Math.min(1,x)), y:Math.max(0,Math.min(1,y))};
}

function eyeBestTarget(gx,gy) {
  let best=null,bestScore=1e9;
  for (const t of items) {
    if(!t?.el?.isConnected || t.flying || t.grabbedBy?.length) continue;
    if(t.type==='orb' && !t.el.offsetParent) continue;
    const r=t.el.getBoundingClientRect();
    if(r.width<8||r.height<8) continue;
    const ex=72, ey=58;
    const dx=gx<r.left-ex?r.left-ex-gx:gx>r.right+ex?gx-(r.right+ex):0;
    const dy=gy<r.top-ey?r.top-ey-gy:gy>r.bottom+ey?gy-(r.bottom+ey):0;
    const edge=Math.hypot(dx,dy);
    if(edge>145) continue;
    const cx=(r.left+r.right)/2, cy=(r.top+r.bottom)/2;
    const center=Math.hypot(gx-cx,gy-cy);
    const score=edge*3+center*.10;
    if(score<bestScore){bestScore=score;best=t;}
  }
  return best;
}

function eyeSetFocus(t,now) {
  if(EYE.focus===t){EYE.focusT=now;return;}
  if(EYE.focus?.el) EYE.focus.el.classList.remove('eye-focus');
  EYE.focus=t; EYE.focusT=now;
  if(t?.el) t.el.classList.add('eye-focus');
}

function updateEyeFocus(now) {
  if(!faceLandmarker || now-EYE.last<66) return;
  EYE.last=now;
  let result;
  try { result=faceLandmarker.detectForVideo(cam,now); } catch(e) { return; }
  const raw=eyeRaw(result); if(!raw) return;
  EYE.raw=raw;
  if(eyeCalibrationFrame(raw,now)) return;
  if(!EYE.cal) return;
  const p=eyeMap(raw); if(!p) return;
  const dist=Math.hypot(p.x-EYE.x,p.y-EYE.y);
  const alpha=dist<.025?.07:dist<.10?.15:.24;
  EYE.x+=(p.x-EYE.x)*alpha; EYE.y+=(p.y-EYE.y)*alpha;
  const t=eyeBestTarget(EYE.x*innerWidth,EYE.y*innerHeight);
  if(t!==EYE.candidate){EYE.candidate=t;EYE.candidateT=now;}
  if(t && now-EYE.candidateT>=150) eyeSetFocus(t,now);
  else if(!t && EYE.focus && now-EYE.focusT>320) eyeSetFocus(null,now);
}

function eyeTargetForClick() {
  return EYE.focus?.el?.isConnected && performance.now()-EYE.focusT<500 ? EYE.focus : null;
}
window.__bhEyeTarget=eyeTargetForClick;
window.__bhEyeCalibrate=startEyeCalibration;

eyeLoadCal();
addEventListener('keydown',e=>{if(e.key==='e'||e.key==='E')startEyeCalibration();});

const eyeStyle=document.createElement('style');
eyeStyle.textContent='.eye-focus{outline:2px solid rgba(143,240,228,.92)!important;outline-offset:8px;filter:brightness(1.08)}';
document.head.appendChild(eyeStyle);
