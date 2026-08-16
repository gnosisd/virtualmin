const UP='https://raw.githubusercontent.com/jaredrhod/barehands/0a097be1d95069f6121326e05985fc1418e9189f/stage.html';
function patch(h){
  const old=`cur.pinched = handGarbage ? false
                    : wasPinched ? !relOk
                                 : ratio < (aspect < 2.0 ? 0.38 : 0.32) &&
                                   (okNow || cur.okEma > 0.55 || holdingI);`;
  const neu=`const compactBack = (fR(12,9)+fR(16,13)+fR(20,17))/3;
        // User-calibrated CLICK pinch (2026-08-16): thumb+index touch is
        // the mouse button. Sample: r .09-.13-.39, f8 1.13-1.17-1.40,
        // back fingers .64-.80, t .53-.55-.58. Keep Jared's original
        // OK-sign lane above; this is a second compact-click lane.
        const compactContrast = f8v - compactBack;
        const compactPinch = ratio < 0.41 &&
                             f8v > 1.07 && f8v < 1.52 &&
                             compactBack > 0.52 && compactBack < 0.90 &&
                             compactContrast > 0.28 &&
                             tRel > 0.48 && tRel < 0.68;
        // Hysteresis: once pressed, stay down through minor tracking noise;
        // opening the thumb/index or losing the compact shape releases.
        const compactRelease = ratio > 0.50 || compactBack > 1.05 ||
                               compactContrast < 0.15 || tRel > 0.78;
        cur.pinched = handGarbage ? false
                    : wasPinched ? !(relOk || (cur.compactPinch && compactRelease))
                                 : ((ratio < (aspect < 2.0 ? 0.38 : 0.32) &&
                                     (okNow || cur.okEma > 0.55 || holdingI)) || compactPinch);
        cur.compactPinch = cur.pinched && compactPinch;`;
  if(!h.includes(old)) throw new Error('pinch anchor not found');
  h=h.replace(old,neu);
  h=h.replace(`cur.badRun = okBack ? 0 : (cur.badRun || 0) + 1;`,`cur.badRun = (okBack || cur.compactPinch) ? 0 : (cur.badRun || 0) + 1;`);

  const palm=`const palmOpen = extFingers >= 4 && ratio > 0.8;`;
  const palmNew=`const palmOpen = extFingers >= 4 && ratio > 0.8;
        const palmCross=(lms[5].x-lms[0].x)*(lms[17].y-lms[0].y)-(lms[5].y-lms[0].y)*(lms[17].x-lms[0].x);
        const handLabel=((res.handednesses||[])[i]||[])[0]?.categoryName||'';
        const backFacing = handLabel==='Right' ? palmCross < 0 : handLabel==='Left' ? palmCross > 0 : false;
        if(backFacing && extFingers>=4 && ratio>0.72 && !cur.pinched){
          cur.backHold=(cur.backHold||0)+1;
          if(cur.backHold===12 && window.__bhShowUpload && !(window.__bhUploadState?.().open)) window.__bhShowUpload();
        } else cur.backHold=0;`;
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
  return h.replace('</body>','<script src="/addon.js"></script>\n</body>');
}
module.exports=async function(req,res){
  try{
    const r=await fetch(UP,{headers:{'User-Agent':'barehands-clean-vercel'}});
    if(!r.ok) throw new Error('upstream '+r.status);
    const h=patch(await r.text());
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.status(200).send(h);
  }catch(e){res.status(500).send('<pre>Barehands stage failed: '+String(e.message||e)+'</pre>');}
}
