const UP='https://raw.githubusercontent.com/jaredrhod/barehands/0a097be1d95069f6121326e05985fc1418e9189f/stage.html';
function patch(h,addon){
  const old=`cur.pinched = handGarbage ? false
                    : wasPinched ? !relOk
                                 : ratio < (aspect < 2.0 ? 0.38 : 0.32) &&
                                   (okNow || cur.okEma > 0.55 || holdingI);`;
  const neu=`const compactBack = (fR(12,9)+fR(16,13)+fR(20,17))/3;
        const compactContrast = f8v - compactBack;

        // GESTURE SET — 2026-08-16
        // 1) thumb + index touch = MOUSE CLICK (handled below, never drags)
        // 2) thumb + index + middle fingertips together = MOVE / GRAB
        // 3) thumbs-up = open MY FILES upload menu
        const tmRel = span > 0 ? Math.hypot(lms[4].x-lms[12].x,lms[4].y-lms[12].y) / span : 9;
        const imRel = span > 0 ? Math.hypot(lms[8].x-lms[12].x,lms[8].y-lms[12].y) / span : 9;
        const trRel = span > 0 ? Math.hypot(lms[4].x-lms[16].x,lms[4].y-lms[16].y) / span : 9;
        const tpRel = span > 0 ? Math.hypot(lms[4].x-lms[20].x,lms[4].y-lms[20].y) / span : 9;

        // The three-finger "cross prayer" grip: thumb/index/middle form
        // one cluster; ring+pinky must NOT join the cluster (fist guard).
        const threeMove = ratio < 0.42 && tmRel < 0.46 && imRel < 0.38 &&
                          f8v > 0.98 && tRel > 0.42 &&
                          trRel > 0.38 && tpRel > 0.42;
        const threeRelease = ratio > 0.54 || tmRel > 0.60 || imRel > 0.52;

        // Keep Jared's original OK-sign lane fully intact. Our three-tip
        // grip is simply a second way to enter the same grab/move engine.
        const originalPinch = ratio < (aspect < 2.0 ? 0.38 : 0.32) &&
                              (okNow || cur.okEma > 0.55 || holdingI);
        const originalHeld = wasPinched && !cur.threeMove && !relOk;
        const threeHeld = wasPinched && cur.threeMove && !threeRelease;
        cur.pinched = handGarbage ? false
                    : (originalHeld || threeHeld || (!wasPinched && (originalPinch || threeMove)));
        cur.threeMove = cur.pinched && (threeMove || threeHeld);

        // User-calibrated CLICK shape: thumb+index touch, other fingers
        // folded naturally. This does NOT set cur.pinched, so it cannot
        // drag an item. Release while still over the same target = click.
        const mouseTouch = !threeMove && ratio < 0.41 &&
                           f8v > 1.07 && f8v < 1.52 &&
                           compactBack > 0.52 && compactBack < 0.90 &&
                           compactContrast > 0.28 &&
                           tRel > 0.48 && tRel < 0.68;
        const mouseRelease = ratio > 0.50 || compactBack > 1.02 ||
                             compactContrast < 0.16 || tRel > 0.76;
        if(mouseTouch && !cur.mouseDown && !cur.pinched){
          cur.mouseDown=true; cur.mouseT=now; cur.mouseX=cur.x; cur.mouseY=cur.y;
          cur.mouseTarget=hitTest(cur);
          cur.el.classList.add('pinched');
        } else if(cur.mouseDown && (mouseRelease || threeMove)) {
          const ms=now-(cur.mouseT||now);
          const mv=Math.hypot(cur.x-(cur.mouseX||cur.x),cur.y-(cur.mouseY||cur.y));
          const target=cur.mouseTarget;
          cur.mouseDown=false; cur.mouseTarget=null;
          cur.el.classList.toggle('pinched',cur.pinched);
          if(!threeMove && ms<900 && mv<34 && target && target.el?.isConnected && !target.grabbedBy.length){
            // Feed a zero-travel press/release into Barehands' native tap
            // path. Ring/orbs/notes/browser rows/images all keep their
            // original click meanings without enabling drag.
            const ox=cur.x, oy=cur.y;
            cur.x=cur.mouseX; cur.y=cur.mouseY; cur.probKill=false;
            beginGrab(target,i,cur); endGrab(target,i,cur);
            cur.x=ox; cur.y=oy;
          }
        }`;
  if(!h.includes(old)) throw new Error('pinch anchor not found');
  h=h.replace(old,neu);
  h=h.replace(`cur.badRun = okBack ? 0 : (cur.badRun || 0) + 1;`,`cur.badRun = (okBack || cur.threeMove) ? 0 : (cur.badRun || 0) + 1;`);

  const palm=`const palmOpen = extFingers >= 4 && ratio > 0.8;`;
  const palmNew=`const palmOpen = extFingers >= 4 && ratio > 0.8;
        // THUMBS-UP = MY FILES. Thumb must point mostly upward while
        // index/middle/ring/pinky are folded. ~0.4s dwell avoids noise.
        const _td=Math.hypot(lms[4].x-lms[0].x,lms[4].y-lms[0].y,(lms[4].z||0)-(lms[0].z||0));
        const _tmd=Math.hypot(lms[2].x-lms[0].x,lms[2].y-lms[0].y,(lms[2].z||0)-(lms[0].z||0));
        const thumbExtended=_tmd>0 && _td/_tmd>1.45;
        const thumbDy=lms[0].y-lms[4].y, thumbDx=Math.abs(lms[4].x-lms[0].x);
        const thumbVertical=thumbDy>0.10 && thumbDy>thumbDx*0.72;
        const thumbsUp=thumbExtended && thumbVertical && !extArr[0] && !extArr[1] && !extArr[2] && !extArr[3] && !cur.pinched && !cur.mouseDown;
        if(thumbsUp){
          cur.fileHold=(cur.fileHold||0)+1;
          if(cur.fileHold===12 && window.__bhShowUpload && !(window.__bhUploadState?.().open)) window.__bhShowUpload();
        } else cur.fileHold=0;`;
  if(!h.includes(palm)) throw new Error('palm anchor not found');
  h=h.replace(palm,palmNew);

  const anchor=`cur.el.style.left = cur.x + "px"; cur.el.style.top = cur.y + "px";`;
  const knock=anchor+`

        // INDEX KNOCK — index-tip strike relative to the wrist.
        {
          const ix=tip.x-_w.x, iy=tip.y-_w.y;
          const kh=cur.knockHist||(cur.knockHist=[]); kh.push({x:ix,y:iy,tx:tip.x,ty:tip.y,t:now});
          while(kh.length && now-kh[0].t>150) kh.shift();
          if(kh.length>1 && !cur.pinched && extArr[0] && !extArr[1] && !extArr[2] && !extArr[3] && now>(cur.knockCd||0)){
            const a=kh[0], b=kh[kh.length-1], kdt=(b.t-a.t)/1000;
            const ks=kdt>0?Math.hypot(b.x-a.x,b.y-a.y)/kdt:0;
            if(ks>720){
              let hit=null,best=1e9;
              items.forEach(t=>{
                if(!t.el?.isConnected||t.grabbedBy?.length||t.type==='widget'||t.type==='orb'||t.type==='browser')return;
                const r=t.el.getBoundingClientRect(),pad=22;
                if(!(b.tx>=r.left-pad&&b.tx<=r.right+pad&&b.ty>=r.top-pad&&b.ty<=r.bottom+pad))return;
                const d=Math.hypot(b.tx-(r.left+r.right)/2,b.ty-(r.top+r.bottom)/2);if(d<best){best=d;hit=t;}
              });
              if(hit){const vx=(b.x-a.x)/Math.max(kdt,.01),vy=(b.y-a.y)/Math.max(kdt,.01);hit.flying=true;hit.vx=vx*1.35;hit.vy=vy*1.35;hit.grabbedBy=[];hit.el.classList.remove('grabbed');cur.knockCd=now+500;try{toast('INDEX KNOCK — '+(hit.def?.title||'item'),900);foley.throw_();}catch(e){}}
            }
          }
        }`;
  if(!h.includes(anchor)) throw new Error('knock anchor not found');
  h=h.replace(anchor,knock);
  h=h.replace('tap the RING = orbs · tap an orb = its tree · TAP a card = open · pinch-drag = move','tap the RING = orbs · tap an orb = its tree · thumb+index = CLICK · thumb+index+middle = MOVE · THUMBS UP = files');
  const hook='\nif (ROLE === "render") {';
  if(!h.includes(hook)) throw new Error('module hook not found');
  return h.replace(hook,'\n'+addon+'\n'+hook);
}
module.exports=async function(req,res){
  try{
    const r=await fetch(UP,{headers:{'User-Agent':'barehands-clean-vercel'}});
    if(!r.ok) throw new Error('upstream '+r.status);
    const ar=await fetch('https://raw.githubusercontent.com/gnosisd/virtualmin/aelia-v4/barehands-clean/aelia-addons-v2.js',{headers:{'User-Agent':'barehands-clean-vercel'}});
    if(!ar.ok) throw new Error('addon '+ar.status);
    const h=patch(await r.text(),await ar.text());
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.status(200).send(h);
  }catch(e){res.status(500).send('<pre>Barehands stage failed: '+String(e.message||e)+'</pre>');}
}
