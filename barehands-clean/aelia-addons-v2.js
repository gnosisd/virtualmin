(()=>{
  'use strict';

  // AELIA NATURAL CONTROL v1
  // Eyes/head = attention, nod/voice = intent, hands = physics only.

  // -------------------- MY FILES --------------------
  const DB_NAME='barehands-my-files-v1', STORE='files';
  let uploadOpen=false, uploadLast=0, pickerArmed=false;
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);

  function db(){return new Promise((ok,bad)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
  async function dbPut(rec){const d=await db();return new Promise((ok,bad)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(rec);t.oncomplete=()=>ok(rec);t.onerror=()=>bad(t.error);});}
  async function dbAll(){const d=await db();return new Promise((ok,bad)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>bad(r.error);});}
  async function dbGet(id){const d=await db();return new Promise((ok,bad)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).get(id);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>bad(r.error);});}
  function category(file){const n=(file.name||'').toLowerCase(),t=file.type||'';if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(n))return'Photos';if(/\.pdf$/i.test(n)||t==='application/pdf')return'PDF';if(/\.docx?$/i.test(n))return'Word';if(/\.xlsx?$|\.csv$/i.test(n))return'Excel';if(/\.(txt|md)$/i.test(n)||t.startsWith('text/'))return'Text';return'Other';}

  async function rebuildMyFilesTree(){
    if(typeof TREES==='undefined'||!TREES[0])return;
    const recs=(await dbAll()).sort((a,b)=>(b.created||0)-(a.created||0));
    TREES[0].dirs=(TREES[0].dirs||[]).filter(d=>d.name!=='MY FILES');
    const cats=['Photos','PDF','Word','Excel','Text','Other'];
    const dirs=cats.map(c=>({name:c,notes:recs.filter(r=>r.category===c).map(r=>({title:r.name,file:'local://'+r.id})),dirs:[]})).filter(d=>d.notes.length);
    TREES[0].dirs.unshift({name:'MY FILES',notes:[{title:'＋ ADD FILES',file:'local://__add__'}],dirs});
  }

  const originalLoadTree=loadTree;
  loadTree=async function(){const r=await originalLoadTree();await rebuildMyFilesTree();return r;};
  const originalOpenPanel=openPanel;
  openPanel=async function(card){
    const f=card?.def?.file||'';
    if(f==='local://__add__'){showUpload();return;}
    if(f.startsWith('local://')){const rec=await dbGet(f.slice(8));if(rec)return openStored(rec);try{toast('Local file is no longer available',1800);}catch(e){}return;}
    return originalOpenPanel(card);
  };

  function ensureUploadUI(){
    if(document.getElementById('bh-upload-ui'))return;
    const wrap=document.createElement('div');wrap.id='bh-upload-ui';
    wrap.style.cssText='display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,8,10,.58);backdrop-filter:blur(9px);align-items:center;justify-content:center;font-family:system-ui;color:#d9fffb';
    wrap.innerHTML='<div style="width:min(620px,90vw);border:1px solid rgba(150,245,235,.55);border-radius:22px;background:rgba(7,18,20,.95);box-shadow:0 20px 80px rgba(0,0,0,.6);padding:26px">'+
      '<div style="font-size:12px;letter-spacing:.24em;color:#8fe9df;margin-bottom:8px">AELIA · MY FILES</div><div style="font-size:24px;font-weight:700;margin-bottom:8px">Add files to the board</div>'+
      '<div style="opacity:.72;line-height:1.45;margin-bottom:18px">Look at the choice below and nod to arm it. Chrome requires one real <b>Enter/Space</b> or mouse click to open the Windows file picker.</div>'+
      '<label id="bh-pick-label" tabindex="0" style="display:block;border:1px dashed rgba(160,245,235,.6);border-radius:16px;padding:26px;text-align:center;cursor:pointer;background:rgba(120,230,220,.06);outline:none"><b>Choose files from this computer</b><br><span style="opacity:.68;font-size:13px">Photos · PDF · Word · Excel · Text</span><input id="bh-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md" style="display:none"></label>'+
      '<div id="bh-upload-status" style="min-height:20px;margin-top:13px;color:#9deee4;font-size:12px"></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="bh-upload-close" style="background:transparent;color:#cffff8;border:1px solid rgba(160,245,235,.45);border-radius:12px;padding:10px 16px;cursor:pointer">Close</button></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#bh-upload-close').onclick=hideUpload;
    wrap.addEventListener('click',e=>{if(e.target===wrap)hideUpload();});
    wrap.querySelector('#bh-pick-label').onclick=()=>{pickerArmed=true;wrap.querySelector('#bh-pick-label').focus();};
    wrap.querySelector('#bh-file-input').addEventListener('change',async e=>{
      const files=[...e.target.files],st=wrap.querySelector('#bh-upload-status');let n=0;
      for(const f of files){st.textContent='Adding '+f.name+'…';try{const rec={id:uid(),name:f.name,type:f.type,size:f.size,category:category(f),created:Date.now(),blob:f};await dbPut(rec);await openStored(rec);n++;}catch(err){try{toast(f.name+': '+(err.message||err),2500);}catch(_){}}}
      await rebuildMyFilesTree();st.textContent=n+' file'+(n===1?'':'s')+' added to Notes → MY FILES';e.target.value='';pickerArmed=false;if(n)setTimeout(hideUpload,700);
    });
  }
  function showUpload(){ensureUploadUI();if(performance.now()-uploadLast<650)return;uploadLast=performance.now();document.getElementById('bh-upload-ui').style.display='flex';uploadOpen=true;pickerArmed=false;try{toast('MY FILES',1000);}catch(e){}}
  function hideUpload(){const w=document.getElementById('bh-upload-ui');if(w)w.style.display='none';uploadOpen=false;pickerArmed=false;}
  window.__bhShowUpload=showUpload;window.__bhUploadState=()=>({open:uploadOpen,last:uploadLast});

  function loadScript(src,name){if(name&&window[name])return Promise.resolve(window[name]);return new Promise((ok,bad)=>{const s=document.createElement('script');s.src=src;s.onload=()=>ok(name?window[name]:true);s.onerror=()=>bad(new Error('document reader failed to load'));document.head.appendChild(s);});}
  function sanitize(html){const d=new DOMParser().parseFromString(String(html||''),'text/html');d.querySelectorAll('script,object,embed,link,meta').forEach(n=>n.remove());d.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(/^on/i.test(a.name))el.removeAttribute(a.name);if((a.name==='href'||a.name==='src')&&/^javascript:/i.test(a.value))el.removeAttribute(a.name);}));return d.body.innerHTML;}
  function makePanel(title,html,wide=true){const el=document.createElement('div');el.className='panel';if(wide)el.style.width='720px';el.innerHTML='<div class="bar"><h3>'+esc(title)+'</h3></div><div class="body"><div class="scroll">'+html+'</div></div>';BEHIND.appendChild(el);const p={el,id:UID++,type:'panel',def:{title,file:'local://view/'+title},x:innerWidth*.5,y:innerHeight*.44,scale:1,vx:0,vy:0,grabbedBy:[],ox:0,oy:0,flying:false,stretch:null,scrollY:0,body:el.querySelector('.scroll')};p.anim={k:'in',t:0};el.style.opacity='.05';items.push(p);return p;}
  async function openStored(rec){const file=rec.blob instanceof File?rec.blob:new File([rec.blob],rec.name,{type:rec.type||''});const url=URL.createObjectURL(file),c=rec.category;
    if(c==='Photos'){const it=makeImage(url,rec.name);it.x=innerWidth*.5;it.y=innerHeight*.42;it.anim={k:'in',t:0};it.el.style.opacity='.05';items.push(it);return it;}
    if(c==='PDF')return makePanel(rec.name,'<iframe src="'+url+'#toolbar=1&navpanes=0&view=FitH" style="width:100%;height:520px;border:0;background:#fff"></iframe>');
    if(c==='Word'&&/\.docx$/i.test(rec.name)){await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js','mammoth');const out=await window.mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});return makePanel(rec.name,sanitize(out.value||'<p>(empty document)</p>'));}
    if(c==='Excel'&&!/\.csv$/i.test(rec.name)){await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array'});const name=wb.SheetNames[0];const html=name?window.XLSX.utils.sheet_to_html(wb.Sheets[name]):'<p>(empty workbook)</p>';return makePanel(rec.name,sanitize(html));}
    if((c==='Excel'&&/\.csv$/i.test(rec.name))||c==='Text')return makePanel(rec.name,renderNote(await file.text()));
    return makePanel(rec.name,'<div style="padding:18px"><p>This file is stored in MY FILES.</p><a href="'+url+'" target="_blank" rel="noopener" style="color:#8ff0e4">OPEN ORIGINAL</a></div>');
  }

  // -------------------- NATURAL CONTROL --------------------
  if(typeof AELIA_CTRL!=='undefined'){
    const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
    const GRABS=new Map();
    const N={face:null,last:0,videoTime:-1,cal:null,step:-1,stepT:0,samples:[],rows:[],x:.5,y:.5,feature:null,focus:null,candidate:null,candidateT:0,focusT:0,selected:null,manipLock:null,debugDot:false,ui:null,headPrev:null,headMoveUntil:0,nodBase:null,nod:null,nodCooldown:0,voice:null,voiceOn:false};
    const CAL=[
      [.08,.10],[.36,.10],[.64,.10],[.92,.10],
      [.92,.36],[.64,.36],[.36,.36],[.08,.36],
      [.08,.64],[.36,.64],[.64,.64],[.92,.64],
      [.92,.90],[.64,.90],[.36,.90],[.08,.90]
    ];
    const CAL_KEY='aelia-natural-eye-v1';

    AELIA_CTRL.classifyHand=function(i,lms,meta,now){
      const d=(a,b)=>Math.hypot(lms[a].x-lms[b].x,lms[a].y-lms[b].y,(lms[a].z||0)-(lms[b].z||0));
      const span=meta?.span||d(0,9)||.001;
      const cluster=Math.max(d(4,8),d(4,12),d(8,12))/span;
      const il=d(5,8)/span,ml=d(9,12)/span;
      const s=GRABS.get(i)||{down:false};
      const enter=cluster<.54&&il>.44&&ml>.42;
      const keep=s.down&&cluster<.72&&il>.34&&ml>.32;
      s.down=enter||keep;GRABS.set(i,s);
      return {state:s.down?'GRAB':'NONE',entered:null,exited:null,scores:{GRAB:s.down?1:0},f:{},grab:s.down,click:false,backMenuPose:false,clawPose:false,point:false,open:false,fist:false};
    };
    AELIA_CTRL.handleClick=()=>{};
    AELIA_CTRL.handleBackMenu=()=>{};
    AELIA_CTRL.handleKnock=()=>{};

    const nativeHitTest=hitTest;
    hitTest=function(cur){
      if(cur?.pinched){
        const t=N.manipLock||N.selected||(N.focus?.kind==='item'?N.focus.item:null);
        if(t?.el?.isConnected&&!t.flying&&t.grabbedBy?.length<2){N.manipLock=t;return t;}
      }
      return nativeHitTest(cur);
    };

    const nativeBeginGrab=beginGrab,nativeEndGrab=endGrab;
    beginGrab=function(c,i,cur){nativeBeginGrab(c,i,cur);if(cur?.pinched)cur.aeliaManip=true;};
    endGrab=function(c,i,cur){const aelia=!!cur?.aeliaManip;if(aelia)cur.grabT=Math.min(cur.grabT||0,performance.now()-1000);nativeEndGrab(c,i,cur);if(aelia){cur.aeliaManip=false;if(!c.grabbedBy.length&&N.manipLock===c)N.manipLock=null;}};

    function blend(res,name){const a=res?.faceBlendshapes?.[0]?.categories||[];const c=a.find(v=>v.categoryName===name||v.displayName===name);return c?.score||0;}
    function feat(res){
      const lm=res?.faceLandmarks?.[0];if(!lm||!res?.faceBlendshapes?.[0])return null;
      const gx=((blend(res,'eyeLookOutLeft')+blend(res,'eyeLookInRight'))-(blend(res,'eyeLookInLeft')+blend(res,'eyeLookOutRight')))*.5;
      const gy=((blend(res,'eyeLookDownLeft')+blend(res,'eyeLookDownRight'))-(blend(res,'eyeLookUpLeft')+blend(res,'eyeLookUpRight')))*.5;
      const le=lm[33],re=lm[263],nose=lm[1];if(!le||!re||!nose)return null;
      const fw=Math.hypot(re.x-le.x,re.y-le.y)||.1,mx=(le.x+re.x)/2,my=(le.y+re.y)/2;
      return [gx,gy,(nose.x-mx)/fw,(nose.y-my)/fw,1];
    }
    function robustMean(arr){if(!arr.length)return null;const out=[];for(let k=0;k<arr[0].length;k++){const v=arr.map(a=>a[k]).sort((a,b)=>a-b),cut=Math.floor(v.length*.18),q=v.slice(cut,Math.max(cut+1,v.length-cut));out[k]=q.reduce((s,x)=>s+x,0)/q.length;}return out;}
    function solve(A,b){const n=A.length,M=A.map((r,i)=>r.slice().concat(b[i]));for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-9)return null;[M[c],M[p]]=[M[p],M[c]];const z=M[c][c];for(let j=c;j<=n;j++)M[c][j]/=z;for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];for(let j=c;j<=n;j++)M[r][j]-=f*M[c][j];}}return M.map(r=>r[n]);}
    function fit(rows,axis){const n=5,A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);for(const row of rows){for(let i=0;i<n;i++){b[i]+=row.f[i]*row.p[axis];for(let j=0;j<n;j++)A[i][j]+=row.f[i]*row.f[j];}}for(let i=0;i<n;i++)A[i][i]+=1e-4;return solve(A,b);}
    function stats(rows){const mean=Array(4).fill(0),sd=Array(4).fill(0);for(const r of rows)for(let k=0;k<4;k++)mean[k]+=r.f[k]/rows.length;for(const r of rows)for(let k=0;k<4;k++)sd[k]+=(r.f[k]-mean[k])**2/rows.length;for(let k=0;k<4;k++)sd[k]=Math.sqrt(sd[k])||.05;return{mean,sd};}
    function globalPred(c,f){return c.reduce((s,v,i)=>s+v*f[i],0);}
    function localPred(cal,f,axis){const ds=cal.rows.map(r=>{let d=0;for(let k=0;k<4;k++){const z=(f[k]-r.f[k])/(cal.sd[k]||.05);d+=z*z;}return{d:Math.sqrt(d),v:r.p[axis]};}).sort((a,b)=>a.d-b.d).slice(0,4);let sw=0,sv=0;for(const q of ds){const w=1/(.025+q.d*q.d);sw+=w;sv+=w*q.v;}return sw?sv/sw:.5;}
    function predict(cal,f,axis){const g=globalPred(axis?cal.cy:cal.cx,f),l=localPred(cal,f,axis);return clamp(g*.42+l*.58);}

    function refit(){if(!N.cal?.rows?.length)return;const cx=fit(N.cal.rows,0),cy=fit(N.cal.rows,1),st=stats(N.cal.rows);if(cx&&cy){N.cal.cx=cx;N.cal.cy=cy;N.cal.mean=st.mean;N.cal.sd=st.sd;try{localStorage.setItem(CAL_KEY,JSON.stringify(N.cal));}catch(e){}}}
    function learn(t){if(!N.cal||!N.feature||!t)return;const cx=clamp(t.cx/innerWidth),cy=clamp(t.cy/innerHeight);const base=N.cal.rows.filter(r=>!r.learned),learned=N.cal.rows.filter(r=>r.learned).slice(-23);learned.push({f:N.feature.slice(),p:[cx,cy],learned:1});N.cal.rows=base.concat(learned);refit();}

    function ensureUI(){
      if(N.ui?.isConnected)return N.ui;
      const root=document.createElement('div');root.id='aelia-natural-ui';root.style.cssText='position:fixed;inset:0;z-index:10040;pointer-events:none;font-family:system-ui';
      root.innerHTML='<div id="aelia-natural-status">EYES = FOCUS · NOD = OPEN/CONFIRM · 3-FINGER GRAB = MOVE · TWO HANDS = SCALE</div><div id="aelia-gaze-debug"></div><div id="aelia-cal"><div id="aelia-cal-dot"></div><div class="txt">LOOK AT EACH DOT · KEEP YOUR HEAD COMFORTABLE · SMALL NATURAL MOVEMENT IS OK</div></div>';
      document.body.appendChild(root);
      const st=document.createElement('style');st.textContent=`#aelia-natural-status{position:fixed;top:13px;left:50%;transform:translateX(-50%);padding:7px 11px;border:1px solid rgba(143,240,228,.22);border-radius:10px;background:rgba(0,8,10,.58);color:#9deee4;font:10px SFMono-Regular,Menlo,monospace;letter-spacing:.06em;opacity:.86}#aelia-gaze-debug{display:none;position:fixed;width:8px;height:8px;margin:-4px;border-radius:50%;background:#eafffb;box-shadow:0 0 12px #8ff0e4}#aelia-cal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.18)}#aelia-cal-dot{position:absolute;width:26px;height:26px;margin:-13px;border:3px solid #8ff0e4;border-radius:50%;box-shadow:0 0 34px #8ff0e4;background:rgba(143,240,228,.18)}#aelia-cal .txt{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);padding:9px 14px;border-radius:10px;background:rgba(0,0,0,.76);color:#cffff8;font:12px SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.eye-focus{outline:3px solid rgba(143,240,228,.95)!important;outline-offset:9px;filter:brightness(1.10)}.aelia-selected{outline:3px solid rgba(255,255,255,.95)!important;outline-offset:12px;box-shadow:0 0 34px rgba(143,240,228,.40)!important}.aelia-nod-pulse{animation:aeliaNod .34s ease-out}@keyframes aeliaNod{from{filter:brightness(1.45)}to{filter:brightness(1)}}`;
      document.head.appendChild(st);N.ui=root;return root;
    }
    function status(s){const el=ensureUI().querySelector('#aelia-natural-status');if(el)el.textContent=s;}
    function calDot(){const p=CAL[N.step],d=ensureUI().querySelector('#aelia-cal-dot');if(p){d.style.left=p[0]*100+'%';d.style.top=p[1]*100+'%';}}
    function startCal(){if(!N.face)return;N.step=0;N.stepT=performance.now();N.samples=[];N.rows=[];N.focus=N.candidate=null;ensureUI().querySelector('#aelia-cal').style.display='block';calDot();status('CALIBRATING EYES · FOLLOW THE DOT');try{toast('EYE + HEAD CALIBRATION — 16 points',1500);}catch(e){}}
    function finishCal(){if(N.rows.length<12){N.step=-1;ensureUI().querySelector('#aelia-cal').style.display='none';status('CALIBRATION INCOMPLETE · PRESS E');return;}const cx=fit(N.rows,0),cy=fit(N.rows,1),st=stats(N.rows);if(cx&&cy){N.cal={cx,cy,rows:N.rows,mean:st.mean,sd:st.sd,ts:Date.now()};try{localStorage.setItem(CAL_KEY,JSON.stringify(N.cal));}catch(e){}}N.step=-1;N.samples=[];N.nodBase=null;ensureUI().querySelector('#aelia-cal').style.display='none';status('EYES = FOCUS · NOD = OPEN/CONFIRM · 3-FINGER GRAB = MOVE');try{toast('AELIA READY — look naturally, nod to confirm',1800);}catch(e){}}
    function loadCal(){try{const c=JSON.parse(localStorage.getItem(CAL_KEY)||'null');if(c?.cx?.length===5&&c?.cy?.length===5&&c?.rows?.length>=12)N.cal=c;}catch(e){}}
    function calibrationFrame(f,now){if(N.step<0)return false;const age=now-N.stepT;if(age>250&&age<900)N.samples.push(f);if(age>=980){const m=robustMean(N.samples);if(m)N.rows.push({f:m,p:CAL[N.step]});N.samples=[];N.step++;if(N.step>=CAL.length)finishCal();else{N.stepT=now;calDot();}}return true;}

    function visible(el){if(!el?.isConnected)return false;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>6&&r.height>6&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity!==0;}
    function rectScore(r,x,y,boost=1){const ex=Math.max(44,Math.min(130,r.width*.34)),ey=Math.max(38,Math.min(95,r.height*.40));const dx=x<r.left-ex?r.left-ex-x:x>r.right+ex?x-(r.right+ex):0,dy=y<r.top-ey?r.top-ey-y:y>r.bottom+ey?y-(r.bottom+ey):0,edge=Math.hypot(dx,dy);if(edge>190)return Infinity;const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;return(edge*4+Math.hypot(x-cx,y-cy)*.055)/boost;}
    function bestTarget(x,y){let best=null,score=Infinity;for(const it of items){if(!it?.el?.isConnected||it.flying||it.grabbedBy?.length)continue;const r=it.el.getBoundingClientRect();if(r.width<8||r.height<8)continue;const s=rectScore(r,x,y,N.focus?.item===it?1.30:1);if(s<score){score=s;best={key:it,kind:'item',item:it,el:it.el,cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};}}const els=[...document.querySelectorAll('.panel.browser .brow,.panel .close,#bh-pick-label,#bh-upload-close,button,[role="button"]')];const seen=new Set();for(const el of els){if(seen.has(el)||!visible(el)||el.closest('#aelia-cal'))continue;seen.add(el);const r=el.getBoundingClientRect(),s=rectScore(r,x,y,N.focus?.el===el?1.35:1);if(s>=score)continue;let kind='dom';if(el.classList.contains('brow'))kind='browserRow';else if(el.id==='bh-pick-label')kind='picker';best={key:el,kind,el,cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};score=s;}return best;}
    function setFocus(t,now){if(N.focus?.key===t?.key)return;if(N.focus?.el)N.focus.el.classList.remove('eye-focus');N.focus=t;N.focusT=now;if(t?.el)t.el.classList.add('eye-focus');}
    function setSelected(it){if(N.selected?.el)N.selected.el.classList.remove('aelia-selected');N.selected=it?.el?.isConnected?it:null;if(N.selected?.el)N.selected.el.classList.add('aelia-selected');}
    function ensureRingBloom(){const it=N.focus?.kind==='item'?N.focus.item:null;if(!it||it.type!=='widget'||it.def?.w!=='ring')return;if(performance.now()-N.focusT<280)return;if(items.some(x=>x.type==='orb'&&x.el?.isConnected))return;try{ringToggle(it);toast('ASSISTANT — options ready',850);}catch(e){}}

    function activate(t,source='nod'){
      if(!t)return;if(t.el){t.el.classList.remove('aelia-nod-pulse');void t.el.offsetWidth;t.el.classList.add('aelia-nod-pulse');setTimeout(()=>t.el?.classList.remove('aelia-nod-pulse'),380);}
      if(t.kind==='browserRow'){const pel=t.el.closest('.panel.browser'),b=items.find(v=>v.el===pel);if(b){try{browserTap(b,{x:t.cx,y:t.cy,probKill:false});learn(t);}catch(e){console.warn('AELIA row activate',e);}}return;}
      if(t.kind==='picker'){pickerArmed=true;t.el.focus();const st=document.getElementById('bh-upload-status');if(st)st.textContent='Ready — press ENTER or SPACE to open the Windows file picker';try{toast('PRESS ENTER / SPACE',1400);}catch(e){}return;}
      if(t.kind==='dom'){try{t.el.click();learn(t);}catch(e){}return;}
      if(t.kind!=='item'||!t.item)return;const it=t.item;
      if(it.type==='widget'&&it.def?.w==='ring'){ensureRingBloom();return;}
      if(it.type==='orb'){try{openBrowser(it.def.orb,it.x,it.y);learn(t);}catch(e){}return;}
      if(it.type==='card'&&it.def?.file){try{openPanel(it);learn(t);}catch(e){}return;}
      setSelected(it);learn(t);try{toast('SELECTED — three-finger grab to move',1100);}catch(e){}
    }

    function nodFrame(f,now){const hx=f[2],pitch=f[3];if(N.nodBase==null)N.nodBase=pitch;const prev=N.headPrev;if(prev){const dh=Math.hypot(hx-prev[0],pitch-prev[1]);if(dh>.020)N.headMoveUntil=now+170;}N.headPrev=[hx,pitch];if(N.manipLock||now<N.nodCooldown)return;if(!N.nod){N.nodBase=lerp(N.nodBase,pitch,.018);const dv=pitch-N.nodBase;if(Math.abs(dv)>.030){N.nod={sign:Math.sign(dv)||1,t:now,peak:Math.abs(dv),base:N.nodBase};}return;}const dv=pitch-N.nod.base;N.nod.peak=Math.max(N.nod.peak,Math.abs(dv));const age=now-N.nod.t;if(age>760){N.nod=null;N.nodBase=lerp(N.nodBase,pitch,.12);return;}if(age>90&&Math.abs(dv)<.014&&N.nod.peak>.030){N.nod=null;N.nodCooldown=now+850;N.nodBase=lerp(N.nodBase,pitch,.18);if(N.focus&&now-N.focusT>170){activate(N.focus,'nod');try{toast('NOD ✓',550);}catch(e){}}}}

    function update(now){
      if(!N.face||now-N.last<50||!cam||cam.readyState<2)return;if(cam.currentTime===N.videoTime)return;N.videoTime=cam.currentTime;N.last=now;
      let res;try{res=N.face.detectForVideo(cam,now);}catch(e){return;}const f=feat(res);if(!f)return;N.feature=f;if(calibrationFrame(f,now))return;if(!N.cal)return;
      let x=predict(N.cal,f,0),y=predict(N.cal,f,1);const d=Math.hypot(x-N.x,y-N.y),a=d<.020?.09:d<.070?.18:.32;N.x=lerp(N.x,x,a);N.y=lerp(N.y,y,a);
      const ui=ensureUI(),dot=ui.querySelector('#aelia-gaze-debug');dot.style.display=N.debugDot?'block':'none';dot.style.left=(N.x*innerWidth)+'px';dot.style.top=(N.y*innerHeight)+'px';
      nodFrame(f,now);
      if(N.manipLock){setFocus({key:N.manipLock,kind:'item',item:N.manipLock,el:N.manipLock.el,cx:N.manipLock.x,cy:N.manipLock.y},now);return;}
      if(now<N.headMoveUntil)return;
      const t=bestTarget(N.x*innerWidth,N.y*innerHeight);if(t?.key!==N.candidate?.key){N.candidate=t;N.candidateT=now;}if(t&&now-N.candidateT>120)setFocus(t,now);else if(!t&&N.focus&&now-N.focusT>360)setFocus(null,now);ensureRingBloom();
    }

    function voiceCommand(txt){const s=String(txt||'').toLowerCase();if(/\b(files?|upload)\b/.test(s)){showUpload();return;}if(/\b(recalibrate|calibrate)\b/.test(s)){startCal();return;}if(/\b(release|unselect|clear selection)\b/.test(s)){setSelected(null);return;}if(/\b(back|close)\b/.test(s)){const t=items.filter(x=>(x.type==='browser'||x.type==='panel')&&x.el?.isConnected).pop();if(t)killItem(t);return;}if(/\b(open|select|choose|yes)\b/.test(s)&&N.focus){activate(N.focus,'voice');}}
    function toggleVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Voice recognition is not available in this browser',1600);return;}if(N.voiceOn){try{N.voice?.stop();}catch(e){}N.voiceOn=false;status('VOICE OFF · EYES = FOCUS · NOD = CONFIRM');return;}const r=new SR();r.continuous=true;r.interimResults=false;r.lang='en-US';r.onresult=e=>{const q=e.results[e.results.length-1]?.[0]?.transcript||'';voiceCommand(q);};r.onend=()=>{if(N.voiceOn)try{r.start();}catch(e){}};r.onerror=()=>{};N.voice=r;N.voiceOn=true;try{r.start();status('VOICE ON · say OPEN / SELECT / BACK / FILES');}catch(e){N.voiceOn=false;}}

    AELIA_CTRL.initFace=async function(vision){try{N.face=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:false,minFaceDetectionConfidence:.48,minFacePresenceConfidence:.48,minTrackingConfidence:.48});loadCal();ensureUI();setTimeout(()=>{if(!N.cal)startCal();},900);}catch(e){console.warn('AELIA face control unavailable',e);status('EYE CONTROL UNAVAILABLE');}};
    AELIA_CTRL.updateEyes=update;
    AELIA_CTRL.eyeTarget=()=>N.focus?.kind==='item'?N.focus.item:null;

    addEventListener('keydown',e=>{if(e.key==='e'||e.key==='E'){e.preventDefault();startCal();}if(e.key==='g'||e.key==='G'){N.debugDot=!N.debugDot;toast(N.debugDot?'GAZE DEBUG ON':'GAZE DEBUG OFF',800);}if(e.key==='v'||e.key==='V'){toggleVoice();}if(e.key==='Escape'){setSelected(null);hideUpload();}if(pickerArmed&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const inp=document.getElementById('bh-file-input');if(inp){pickerArmed=false;inp.click();}}},true);

    rebuildMyFilesTree().catch(()=>{});ensureUI();
  }
})();