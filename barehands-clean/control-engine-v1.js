// AELIA CONTROL ENGINE v1
// Control-only layer for the original Barehands board.
// Ideas combined from GestureSynth (landmark smoothing), Fingerpose (scored
// gesture descriptions + noisy-signal post-processing), HoloFlux (explicit
// gesture states / transition feedback), and WebGazer-style calibrated gaze.
// No board/content functions are replaced here.

const AELIA_CTRL = (() => {
  const HANDS = new Map();
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
  const unit=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,z=(b.z||0)-(a.z||0),d=Math.hypot(x,y,z)||1;return[x/d,y/d,z/d];};
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const invRange=(v,good,bad)=>clamp((bad-v)/(bad-good));
  const rangeScore=(v,lo,hi,soft=.12)=>Math.min(invRange(v,lo-soft,lo),invRange(-v,-hi-soft,-hi));

  function hs(i){
    if(!HANDS.has(i)) HANDS.set(i,{smooth:null,t:0,stable:'NONE',pending:'NONE',pendingT:0,lastOpenT:0,clickDown:false,clickTarget:null,backT:0,backCd:0,knock:[],lastScores:{}});
    return HANDS.get(i);
  }

  // Adaptive EMA: low alpha when nearly still, high alpha during deliberate
  // movement. This keeps selection stable without making fast throws feel late.
  function smooth(i,raw,now){
    const s=hs(i); const dt=s.t?Math.max(.008,(now-s.t)/1000):1/30; s.t=now;
    if(!s.smooth||s.smooth.length!==raw.length){s.smooth=raw.map(p=>({...p}));return s.smooth.map(p=>({...p}));}
    const out=raw.map((p,k)=>{
      const q=s.smooth[k]; const vel=dist3(p,q)/dt;
      const alpha=clamp(.22+vel*.16,.22,.72);
      return {x:lerp(q.x,p.x,alpha),y:lerp(q.y,p.y,alpha),z:lerp(q.z||0,p.z||0,alpha),visibility:p.visibility,presence:p.presence};
    });
    s.smooth=out; return out;
  }

  function curl(l,m,p,d,t){return dot(unit(l[m],l[p]),unit(l[d],l[t]));}
  function ratioD(l,a,b,span){return span?dist3(l[a],l[b])/span:9;}

  function features(lms,meta){
    const span=meta.span||dist3(lms[0],lms[9])||.001;
    const r=ratioD(lms,4,8,span), tm=ratioD(lms,4,12,span), im=ratioD(lms,8,12,span);
    const tr=ratioD(lms,4,16,span), tp=ratioD(lms,4,20,span);
    const c8=curl(lms,5,6,7,8),c12=curl(lms,9,10,11,12),c16=curl(lms,13,14,15,16),c20=curl(lms,17,18,19,20);
    const palmCross=(lms[5].x-lms[0].x)*(lms[17].y-lms[0].y)-(lms[5].y-lms[0].y)*(lms[17].x-lms[0].x);
    const label=meta.handedness||'';
    // IMPORTANT: this sign is intentionally the opposite of the previous
    // AELIA build; it matches the user's right-hand BACK-of-hand observation.
    const backFacing=label==='Right'?palmCross>0.010:label==='Left'?palmCross< -0.010:false;
    const ext=meta.extArr||[false,false,false,false], extN=meta.extFingers??ext.filter(Boolean).length;
    const thumbOpen=(meta.tRel??ratioD(lms,4,13,span))>.72;
    return {span,r,tm,im,tr,tp,c8,c12,c16,c20,palmCross,backFacing,ext,extN,thumbOpen};
  }

  function scores(f){
    // CLICK: user's natural thumb-index touch. Middle fingertip must remain
    // outside the 3-tip cluster so CLICK cannot silently turn into GRAB.
    const clickGap=invRange(f.r,.18,.46);
    const middleAway=clamp((f.tm-.38)/.22);
    const click=clickGap*(.60+.40*middleAway);

    // GRAB: thumb + index + middle form one compact cluster. Ring and pinky
    // are explicitly excluded, which prevents a fist from becoming a drag.
    const cluster=Math.max(f.r,f.tm,f.im);
    const clusterScore=invRange(cluster,.22,.50);
    const outerAway=clamp(((f.tr-.34)+(f.tp-.38))/.40);
    const grab=clusterScore*(.55+.45*outerAway);

    // BACK_MENU: all four long fingers extended, thumb open, and the back of
    // the hand faces the camera. Orientation is handedness-aware.
    const back=(f.backFacing&&f.extN>=4&&f.thumbOpen)?1:0;

    // CLAW: deliberately open mouth + index/middle/ring hooked. The open->claw
    // transition is enforced by the state machine, so the geometry can be more
    // tolerant than the upstream thresholds without becoming noisy.
    const mouth=clamp((f.r-.52)/.30)*invRange(f.r,1.45,1.85);
    const hooks=(invRange(f.c8,.45,.85)+invRange(f.c12,.25,.70)+invRange(f.c16,.40,.78))/3;
    const claw=mouth*hooks;

    const open=(f.extN>=4&&f.r>.62)?1:0;
    const point=(f.ext[0]&&!f.ext[1]&&!f.ext[2]&&!f.ext[3])?1:0;
    const fist=(f.r<.52&&f.c12<.15&&f.c16<.20&&f.c20<.25)?1:0;
    return {CLICK:click,GRAB:grab,BACK:back,CLAW:claw,OPEN:open,POINT:point,FIST:fist};
  }

  const PRI=['CLAW','BACK','GRAB','CLICK','OPEN','POINT','FIST'];
  const ENTER={CLAW:.63,BACK:.92,GRAB:.68,CLICK:.72,OPEN:.92,POINT:.90,FIST:.80};
  const HOLD ={CLAW:.48,BACK:.75,GRAB:.48,CLICK:.50,OPEN:.75,POINT:.70,FIST:.60};
  const DWELL={CLAW:120,BACK:170,GRAB:55,CLICK:45,OPEN:80,POINT:80,FIST:80,NONE:70};

  function choose(sc,s){
    if(s.stable!=='NONE'&&sc[s.stable]>=HOLD[s.stable]) return s.stable;
    for(const k of PRI) if(sc[k]>=ENTER[k]) return k;
    return 'NONE';
  }

  function classifyHand(i,lms,meta,now){
    const s=hs(i), f=features(lms,meta), sc=scores(f);
    if(sc.OPEN>.9) s.lastOpenT=now;
    if(now-s.lastOpenT>1150) sc.CLAW=0;

    let candidate=choose(sc,s);
    if(candidate!==s.pending){s.pending=candidate;s.pendingT=now;}
    const dwell=DWELL[candidate]??70;
    const prev=s.stable;
    if(candidate!==prev&&now-s.pendingT>=dwell) s.stable=candidate;

    if(s.stable!=='NONE'&&sc[s.stable]<(HOLD[s.stable]??.5)){
      if(s.pending!==candidate){s.pending=candidate;s.pendingT=now;}
      if(now-s.pendingT>70&&candidate==='NONE') s.stable='NONE';
    }
    const entered=s.stable!==prev?s.stable:null;
    const exited=s.stable!==prev?prev:null;
    s.lastScores=sc;
    return {state:s.stable,entered,exited,scores:sc,f,
      grab:s.stable==='GRAB',click:s.stable==='CLICK',backMenuPose:s.stable==='BACK',
      clawPose:s.stable==='CLAW',point:s.stable==='POINT',open:s.stable==='OPEN',fist:s.stable==='FIST'};
  }

  function clickTarget(cur){
    const eye=eyeTarget();
    if(eye) return eye;
    return hitTest(cur);
  }

  function handleClick(i,cur,g,now){
    const s=hs(i);
    const forcePull=!!cur.fp?.ph;
    if(g.click&&!s.clickDown&&!g.grab&&!forcePull){
      s.clickDown=true; s.clickT=now; s.clickX=cur.x; s.clickY=cur.y;
      s.clickTarget=clickTarget(cur);
      cur.el.classList.add('pinched');
      if(s.clickTarget?.el) s.clickTarget.el.classList.add('aelia-armed');
    }
    if(s.clickDown&&(!g.click||g.grab||forcePull)){
      const target=s.clickTarget,ms=now-(s.clickT||now),mv=Math.hypot(cur.x-(s.clickX||cur.x),cur.y-(s.clickY||cur.y));
      s.clickDown=false;s.clickTarget=null;
      if(target?.el) target.el.classList.remove('aelia-armed');
      cur.el.classList.toggle('pinched',!!g.grab);
      if(!g.grab&&!forcePull&&ms<950&&mv<90&&target&&target.el?.isConnected&&!target.grabbedBy.length){
        const ox=cur.x,oy=cur.y;
        const r=target.el.getBoundingClientRect();
        cur.x=(r.left+r.right)/2;cur.y=(r.top+r.bottom)/2;cur.probKill=false;
        beginGrab(target,i,cur);endGrab(target,i,cur);
        cur.x=ox;cur.y=oy;
      }
    }
  }

  function handleBackMenu(i,cur,g,now){
    const s=hs(i);
    if(g.backMenuPose&&!cur.fp?.ph&&!g.grab){
      if(!s.backT)s.backT=now;
      if(now-s.backT>360&&now>s.backCd&&window.__bhShowUpload&&!(window.__bhUploadState?.().open)){
        s.backCd=now+1800; window.__bhShowUpload();
        try{toast('BACK HAND — MY FILES',1000);}catch(e){}
      }
    }else s.backT=0;
  }

  function handleKnock(i,cur,g,lms,now){
    if(!g.point||g.grab||g.click||g.clawPose||cur.fp?.ph)return;
    const s=hs(i),tip=toScreen(lms[8]),w=toScreen(lms[0]);
    s.knock.push({x:tip.x-w.x,y:tip.y-w.y,tx:tip.x,ty:tip.y,t:now});
    while(s.knock.length&&now-s.knock[0].t>160)s.knock.shift();
    if(s.knock.length<2||now<(s.knockCd||0))return;
    const a=s.knock[0],b=s.knock[s.knock.length-1],dt=(b.t-a.t)/1000;
    const speed=dt>0?Math.hypot(b.x-a.x,b.y-a.y)/dt:0;
    if(speed<680)return;
    let hit=null,best=1e9;
    for(const t of items){
      if(!t.el?.isConnected||t.grabbedBy?.length||t.type==='widget'||t.type==='orb'||t.type==='browser')continue;
      const r=t.el.getBoundingClientRect(),pad=28;
      if(b.tx<r.left-pad||b.tx>r.right+pad||b.ty<r.top-pad||b.ty>r.bottom+pad)continue;
      const d=Math.hypot(b.tx-(r.left+r.right)/2,b.ty-(r.top+r.bottom)/2);if(d<best){best=d;hit=t;}
    }
    if(hit){
      const vx=(b.x-a.x)/Math.max(dt,.01),vy=(b.y-a.y)/Math.max(dt,.01);
      hit.flying=true;hit.vx=vx*1.35;hit.vy=vy*1.35;hit.grabbedBy=[];hit.el.classList.remove('grabbed');
      s.knockCd=now+520;try{toast('INDEX KNOCK — '+(hit.def?.title||'item'),850);foley.throw_();}catch(e){}
    }
  }

  let faceLandmarker=null;
  const EYE={last:0,videoTime:-1,cal:null,step:-1,stepT:0,samples:[],tmp:[],x:.5,y:.5,candidate:null,candidateT:0,focus:null,focusSince:0,overlay:null};
  const CAL_POINTS=[
    [.12,.14],[.50,.14],[.88,.14],
    [.12,.50],[.50,.50],[.88,.50],
    [.12,.86],[.50,.86],[.88,.86]
  ];

  async function initFace(vision){
    try{
      faceLandmarker=await FaceLandmarker.createFromOptions(vision,{
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'GPU'},
        runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:false,
        minFaceDetectionConfidence:.45,minFacePresenceConfidence:.45,minTrackingConfidence:.45
      });
      loadEyeCal();
      setTimeout(()=>{if(!EYE.cal)startEyeCalibration();},900);
    }catch(e){console.warn('AELIA eye control unavailable',e);}
  }

  function blend(res,name){const a=res?.faceBlendshapes?.[0]?.categories||[];const c=a.find(v=>v.categoryName===name||v.displayName===name);return c?.score||0;}
  function eyeFeatures(res){
    if(!res?.faceLandmarks?.[0]||!res?.faceBlendshapes?.[0])return null;
    const lm=res.faceLandmarks[0];
    const gx=((blend(res,'eyeLookOutLeft')+blend(res,'eyeLookInRight'))-(blend(res,'eyeLookInLeft')+blend(res,'eyeLookOutRight')))*.5;
    const gy=((blend(res,'eyeLookDownLeft')+blend(res,'eyeLookDownRight'))-(blend(res,'eyeLookUpLeft')+blend(res,'eyeLookUpRight')))*.5;
    const le=lm[33],re=lm[263],nose=lm[1]; if(!le||!re||!nose)return [gx,gy,0,0,1];
    const fw=Math.hypot(re.x-le.x,re.y-le.y)||.1, mx=(le.x+re.x)/2,my=(le.y+re.y)/2;
    const hx=(nose.x-mx)/fw,hy=(nose.y-my)/fw;
    return [gx,gy,hx,hy,1];
  }

  function solve(A,b){
    const n=A.length,M=A.map((r,i)=>r.slice().concat(b[i]));
    for(let c=0;c<n;c++){
      let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
      if(Math.abs(M[p][c])<1e-9)return null;[M[c],M[p]]=[M[p],M[c]];
      const d=M[c][c];for(let j=c;j<=n;j++)M[c][j]/=d;
      for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];for(let j=c;j<=n;j++)M[r][j]-=f*M[c][j];}
    }
    return M.map(r=>r[n]);
  }
  function fit(rows,axis){
    const n=5,ATA=Array.from({length:n},()=>Array(n).fill(0)),ATb=Array(n).fill(0);
    for(const row of rows){const x=row.f,y=row.p[axis];for(let i=0;i<n;i++){ATb[i]+=x[i]*y;for(let j=0;j<n;j++)ATA[i][j]+=x[i]*x[j];}}
    for(let i=0;i<n;i++)ATA[i][i]+=1e-5;
    return solve(ATA,ATb);
  }
  function predict(coef,f){return coef?coef.reduce((s,v,i)=>s+v*f[i],0):.5;}
  function robustMean(arr){
    if(!arr.length)return null; const d=arr[0].length,out=[];
    for(let k=0;k<d;k++){const v=arr.map(a=>a[k]).sort((a,b)=>a-b),cut=Math.floor(v.length*.15),q=v.slice(cut,v.length-cut||v.length);out[k]=q.reduce((s,x)=>s+x,0)/(q.length||1);}return out;
  }

  function ensureEyeOverlay(){
    if(EYE.overlay?.isConnected)return EYE.overlay;
    const o=document.createElement('div');o.id='aelia-eye-cal';o.style.cssText='display:none;position:fixed;inset:0;z-index:10060;pointer-events:none';
    o.innerHTML='<div id="aelia-eye-dot" style="position:absolute;width:24px;height:24px;margin:-12px;border:3px solid #8ff0e4;border-radius:50%;box-shadow:0 0 28px #8ff0e4;background:rgba(143,240,228,.18)"></div><div style="position:absolute;top:20px;left:50%;transform:translateX(-50%);padding:8px 14px;border:1px solid rgba(143,240,228,.35);border-radius:10px;background:rgba(0,0,0,.72);color:#cffff8;font:12px SFMono-Regular,Menlo,monospace;letter-spacing:.08em">AELIA EYES · LOOK AT EACH DOT · KEEP HEAD COMFORTABLE</div>';
    document.body.appendChild(o);EYE.overlay=o;return o;
  }
  function placeEyeDot(){const p=CAL_POINTS[EYE.step],d=ensureEyeOverlay().querySelector('#aelia-eye-dot');if(p){d.style.left=p[0]*100+'%';d.style.top=p[1]*100+'%';}}
  function startEyeCalibration(){if(!faceLandmarker)return;EYE.step=0;EYE.stepT=performance.now();EYE.samples=[];EYE.tmp=[];ensureEyeOverlay().style.display='block';placeEyeDot();try{toast('EYE CALIBRATION — follow 9 dots',1600);}catch(e){}}
  function finishEyeCalibration(){
    const rows=EYE.tmp.map((f,i)=>({f,p:CAL_POINTS[i]}));const cx=fit(rows,0),cy=fit(rows,1);
    if(cx&&cy){EYE.cal={cx,cy,ts:Date.now()};try{localStorage.setItem('aelia-eye-cal-v3',JSON.stringify(EYE.cal));}catch(e){}try{toast('EYES CALIBRATED — look, then pinch to confirm',1900);}catch(e){}}
    EYE.step=-1;EYE.samples=[];EYE.tmp=[];ensureEyeOverlay().style.display='none';
  }
  function loadEyeCal(){try{const c=JSON.parse(localStorage.getItem('aelia-eye-cal-v3')||'null');if(c?.cx?.length===5&&c?.cy?.length===5)EYE.cal=c;}catch(e){}}

  function calibrationFrame(f,now){
    if(EYE.step<0)return false;const age=now-EYE.stepT;
    if(age>240&&age<900)EYE.samples.push(f);
    if(age>=960){const m=robustMean(EYE.samples);if(m)EYE.tmp[EYE.step]=m;EYE.samples=[];EYE.step++;if(EYE.step>=CAL_POINTS.length)finishEyeCalibration();else{EYE.stepT=now;placeEyeDot();}}
    return true;
  }

  function eyeBest(gx,gy){
    let best=null,bestScore=1e9;
    for(const t of items){
      if(!t?.el?.isConnected||t.flying||t.grabbedBy?.length)continue;
      const r=t.el.getBoundingClientRect();if(r.width<8||r.height<8)continue;
      const ex=Math.max(46,Math.min(95,r.width*.25)),ey=Math.max(38,Math.min(75,r.height*.25));
      const dx=gx<r.left-ex?r.left-ex-gx:gx>r.right+ex?gx-(r.right+ex):0;
      const dy=gy<r.top-ey?r.top-ey-gy:gy>r.bottom+ey?gy-(r.bottom+ey):0;
      const edge=Math.hypot(dx,dy);if(edge>130)continue;
      const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
      const score=edge*4+Math.hypot(gx-cx,gy-cy)*.08;
      if(score<bestScore){bestScore=score;best=t;}
    }return best;
  }
  function setEyeFocus(t,now){if(EYE.focus===t)return;if(EYE.focus?.el)EYE.focus.el.classList.remove('eye-focus');EYE.focus=t;EYE.focusSince=now;if(t?.el)t.el.classList.add('eye-focus');}
  function eyeTarget(){return EYE.focus?.el?.isConnected&&performance.now()-EYE.focusSince>120?EYE.focus:null;}

  function updateEyes(now){
    if(!faceLandmarker||now-EYE.last<70||!cam||cam.readyState<2)return;
    if(cam.currentTime===EYE.videoTime)return;EYE.videoTime=cam.currentTime;EYE.last=now;
    let res;try{res=faceLandmarker.detectForVideo(cam,now);}catch(e){return;}const f=eyeFeatures(res);if(!f)return;
    if(calibrationFrame(f,now))return;if(!EYE.cal)return;
    let x=clamp(predict(EYE.cal.cx,f)),y=clamp(predict(EYE.cal.cy,f));
    const d=Math.hypot(x-EYE.x,y-EYE.y),a=d<.025?.08:d<.10?.16:.28;
    EYE.x=lerp(EYE.x,x,a);EYE.y=lerp(EYE.y,y,a);
    const t=eyeBest(EYE.x*innerWidth,EYE.y*innerHeight);
    if(t!==EYE.candidate){EYE.candidate=t;EYE.candidateT=now;}
    if(t&&now-EYE.candidateT>135)setEyeFocus(t,now);
    else if(!t&&EYE.focus&&now-EYE.focusSince>300)setEyeFocus(null,now);
  }

  function installUI(){
    const st=document.createElement('style');st.textContent='.eye-focus{outline:2px solid rgba(143,240,228,.90)!important;outline-offset:8px;filter:brightness(1.08)}.aelia-armed{outline:3px solid rgba(255,255,255,.95)!important;outline-offset:10px}';document.head.appendChild(st);
    addEventListener('keydown',e=>{if(e.key==='e'||e.key==='E')startEyeCalibration();});
  }

  installUI();
  return {smooth,classifyHand,handleClick,handleBackMenu,handleKnock,initFace,updateEyes,startEyeCalibration,eyeTarget};
})();
