(()=>{
  'use strict';

  // ---------- MY FILES (same function layer, cleaner eye-friendly UI) ----------
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
    TREES[0].dirs.unshift({name:'MY FILES',notes:[],dirs});
  }

  const originalLoadTree=loadTree;
  loadTree=async function(){const r=await originalLoadTree();await rebuildMyFilesTree();return r;};
  const originalOpenPanel=openPanel;
  openPanel=async function(card){
    const f=card?.def?.file||'';
    if(f.startsWith('local://')){const rec=await dbGet(f.slice(8));if(rec)return openStored(rec);try{toast('Local file is no longer available',1800);}catch(e){}return;}
    return originalOpenPanel(card);
  };

  function ensureUploadUI(){
    if(document.getElementById('bh-upload-ui'))return;
    const wrap=document.createElement('div');wrap.id='bh-upload-ui';
    wrap.style.cssText='display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,8,10,.58);backdrop-filter:blur(9px);align-items:center;justify-content:center;font-family:system-ui;color:#d9fffb';
    wrap.innerHTML='<div style="width:min(620px,90vw);border:1px solid rgba(150,245,235,.55);border-radius:22px;background:rgba(7,18,20,.95);box-shadow:0 20px 80px rgba(0,0,0,.6);padding:26px">'+
      '<div style="font-size:12px;letter-spacing:.24em;color:#8fe9df;margin-bottom:8px">AELIA · MY FILES</div><div style="font-size:24px;font-weight:700;margin-bottom:8px">Add files to the board</div>'+
      '<div style="opacity:.72;line-height:1.45;margin-bottom:18px">Imported files open on the board and remain under <b>Notes → MY FILES</b>. Gaze can control this panel, but Chrome requires one real Enter/Space or mouse click to open the Windows file picker.</div>'+
      '<label id="bh-pick-label" tabindex="0" style="display:block;border:1px dashed rgba(160,245,235,.6);border-radius:16px;padding:26px;text-align:center;cursor:pointer;background:rgba(120,230,220,.06);outline:none"><b>Choose files from this computer</b><br><span style="opacity:.68;font-size:13px">Look here until armed, then press ENTER · Photos · PDF · Word · Excel · Text</span><input id="bh-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md" style="display:none"></label>'+
      '<div id="bh-upload-status" style="min-height:20px;margin-top:13px;color:#9deee4;font-size:12px"></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="bh-upload-close" style="background:transparent;color:#cffff8;border:1px solid rgba(160,245,235,.45);border-radius:12px;padding:10px 16px;cursor:pointer">Close</button></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#bh-upload-close').onclick=hideUpload;
    wrap.addEventListener('click',e=>{if(e.target===wrap)hideUpload();});
    wrap.querySelector('#bh-file-input').addEventListener('change',async e=>{
      const files=[...e.target.files],st=wrap.querySelector('#bh-upload-status');let n=0;
      for(const f of files){st.textContent='Adding '+f.name+'…';try{const rec={id:uid(),name:f.name,type:f.type,size:f.size,category:category(f),created:Date.now(),blob:f};await dbPut(rec);await openStored(rec);n++;}catch(err){try{toast(f.name+': '+(err.message||err),2500);}catch(_){}}}
      await rebuildMyFilesTree();st.textContent=n+' file'+(n===1?'':'s')+' added to Notes → MY FILES';e.target.value='';pickerArmed=false;if(n)setTimeout(hideUpload,700);
    });
  }
  function showUpload(){ensureUploadUI();if(performance.now()-uploadLast<650)return;uploadLast=performance.now();document.getElementById('bh-upload-ui').style.display='flex';uploadOpen=true;pickerArmed=false;try{toast('MY FILES — gaze to navigate',1200);}catch(e){}}
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

  // ---------- EYE-ONLY SELECTION / CLICK ENGINE ----------
  if(typeof AELIA_CTRL!=='undefined'){
    const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
    const GRABS=new Map();
    const E={face:null,last:0,videoTime:-1,cal:null,step:-1,stepT:0,samples:[],rows:[],x:.5,y:.5,rawX:.5,rawY:.5,feature:null,candidate:null,candidateT:0,focus:null,focusT:0,lockKey:null,leaveT:0,ui:null,dwellMs:720,focusDelay:150};
    const CAL=[
      [.08,.10],[.36,.10],[.64,.10],[.92,.10],
      [.92,.36],[.64,.36],[.36,.36],[.08,.36],
      [.08,.64],[.36,.64],[.64,.64],[.92,.64],
      [.92,.90],[.64,.90],[.36,.90],[.08,.90]
    ];
    const CAL_KEY='aelia-eye-precision-v4';

    // Hands are manipulation only. No click, no file pose, no knock, no claw.
    AELIA_CTRL.classifyHand=function(i,lms,meta,now){
      const d=(a,b)=>Math.hypot(lms[a].x-lms[b].x,lms[a].y-lms[b].y,(lms[a].z||0)-(lms[b].z||0));
      const span=meta?.span||d(0,9)||.001;
      const cluster=Math.max(d(4,8),d(4,12),d(8,12))/span;
      const il=d(5,8)/span, ml=d(9,12)/span;
      const s=GRABS.get(i)||{down:false};
      const enter=cluster<.54&&il>.46&&ml>.44;
      const keep=s.down&&cluster<.70&&il>.36&&ml>.34;
      s.down=enter||keep;GRABS.set(i,s);
      return {state:s.down?'GRAB':'NONE',entered:null,exited:null,scores:{GRAB:s.down?1:0},f:{},grab:s.down,click:false,backMenuPose:false,clawPose:false,point:false,open:false,fist:false};
    };
    AELIA_CTRL.handleClick=()=>{};
    AELIA_CTRL.handleBackMenu=()=>{};
    AELIA_CTRL.handleKnock=()=>{};

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
    function predict(cal,f,axis){const g=globalPred(axis?cal.cy:cal.cx,f),l=localPred(cal,f,axis);return clamp(g*.46+l*.54);}

    function ensureEyeUI(){
      if(E.ui?.isConnected)return E.ui;
      const root=document.createElement('div');root.id='aelia-eye-ui';root.style.cssText='position:fixed;inset:0;z-index:10040;pointer-events:none;font-family:system-ui';
      root.innerHTML='<div id="aelia-gaze-dot"></div><div id="aelia-dwell-ring"></div><div id="aelia-eye-toolbar"><button id="aelia-eye-files">FILES</button><button id="aelia-eye-recal">CALIBRATE EYES</button><span>GAZE · DWELL TO CLICK</span></div><div id="aelia-eye-cal"><div id="aelia-eye-cal-dot"></div><div class="txt">PRECISION EYE CALIBRATION · LOOK AT EACH DOT · KEEP YOUR HEAD COMFORTABLE</div></div>';
      document.body.appendChild(root);
      const st=document.createElement('style');st.textContent=`
        #aelia-gaze-dot{position:fixed;width:8px;height:8px;margin:-4px;border-radius:50%;background:rgba(210,255,248,.72);box-shadow:0 0 12px rgba(143,240,228,.75);display:none}
        #aelia-dwell-ring{position:fixed;width:34px;height:34px;margin:-17px;border-radius:50%;--p:0;background:conic-gradient(#8ff0e4 calc(var(--p)*1turn),rgba(143,240,228,.12) 0);display:none;box-shadow:0 0 20px rgba(143,240,228,.45)}
        #aelia-dwell-ring:after{content:"";position:absolute;inset:4px;border-radius:50%;background:rgba(0,8,10,.86)}
        #aelia-eye-toolbar{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(143,240,228,.28);border-radius:14px;background:rgba(2,12,12,.72);backdrop-filter:blur(8px);pointer-events:auto;color:#8fe9df;font:11px SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
        #aelia-eye-toolbar button{background:rgba(143,240,228,.08);border:1px solid rgba(143,240,228,.38);border-radius:9px;color:#dffff9;padding:8px 12px;cursor:pointer}
        #aelia-eye-cal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.22)}
        #aelia-eye-cal-dot{position:absolute;width:26px;height:26px;margin:-13px;border:3px solid #8ff0e4;border-radius:50%;box-shadow:0 0 34px #8ff0e4;background:rgba(143,240,228,.18)}
        #aelia-eye-cal .txt{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);padding:9px 14px;border-radius:10px;background:rgba(0,0,0,.76);color:#cffff8;font:12px SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
        .eye-focus{outline:3px solid rgba(143,240,228,.94)!important;outline-offset:8px;filter:brightness(1.10)}
        .eye-focus-soft{box-shadow:0 0 30px rgba(143,240,228,.42)!important}
        #bh-pick-label.eye-focus{background:rgba(143,240,228,.15)!important}
      `;document.head.appendChild(st);
      root.querySelector('#aelia-eye-files').onclick=showUpload;
      root.querySelector('#aelia-eye-recal').onclick=startCal;
      E.ui=root;return root;
    }
    function calDot(){const p=CAL[E.step],d=ensureEyeUI().querySelector('#aelia-eye-cal-dot');if(p){d.style.left=p[0]*100+'%';d.style.top=p[1]*100+'%';}}
    function startCal(){if(!E.face)return;const c=ensureEyeUI().querySelector('#aelia-eye-cal');c.style.display='block';ensureEyeUI().querySelector('#aelia-gaze-dot').style.display='none';E.step=0;E.stepT=performance.now();E.samples=[];E.rows=[];E.candidate=E.focus=null;E.lockKey=null;calDot();try{toast('PRECISION EYE CALIBRATION — 16 points',1600);}catch(e){}}
    function finishCal(){
      if(E.rows.length<12){E.step=-1;ensureEyeUI().querySelector('#aelia-eye-cal').style.display='none';try{toast('Calibration incomplete — press E and try again',1800);}catch(e){}return;}
      const cx=fit(E.rows,0),cy=fit(E.rows,1),st=stats(E.rows);if(cx&&cy){E.cal={cx,cy,rows:E.rows,mean:st.mean,sd:st.sd,ts:Date.now()};try{localStorage.setItem(CAL_KEY,JSON.stringify(E.cal));}catch(e){}try{toast('EYES READY — look + dwell to click',1800);}catch(e){}}
      E.step=-1;E.samples=[];ensureEyeUI().querySelector('#aelia-eye-cal').style.display='none';ensureEyeUI().querySelector('#aelia-gaze-dot').style.display='block';
    }
    function loadCal(){try{const c=JSON.parse(localStorage.getItem(CAL_KEY)||'null');if(c?.cx?.length===5&&c?.cy?.length===5&&c?.rows?.length>=12)E.cal=c;}catch(e){}}
    function calibrationFrame(f,now){if(E.step<0)return false;const age=now-E.stepT;if(age>260&&age<900)E.samples.push(f);if(age>=980){const m=robustMean(E.samples);if(m)E.rows.push({f:m,p:CAL[E.step]});E.samples=[];E.step++;if(E.step>=CAL.length)finishCal();else{E.stepT=now;calDot();}}return true;}

    function visible(el){if(!el?.isConnected)return false;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>6&&r.height>6&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity!==0;}
    function rectScore(r,x,y,boost=1){const ex=Math.max(32,Math.min(105,r.width*.30)),ey=Math.max(28,Math.min(82,r.height*.35));const dx=x<r.left-ex?r.left-ex-x:x>r.right+ex?x-(r.right+ex):0,dy=y<r.top-ey?r.top-ey-y:y>r.bottom+ey?y-(r.bottom+ey):0,edge=Math.hypot(dx,dy);if(edge>145)return Infinity;const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;return(edge*4+Math.hypot(x-cx,y-cy)*.07)/boost;}
    function bestTarget(x,y){
      let best=null,score=Infinity;
      for(const it of items){if(!it?.el?.isConnected||it.flying||it.grabbedBy?.length||it.type==='panel'||it.type==='browser')continue;const r=it.el.getBoundingClientRect(),s=rectScore(r,x,y,it===E.focus?.item?1.30:1);if(s<score){score=s;best={key:it,kind:'item',item:it,el:it.el,clickable:it.type==='card'||it.type==='widget'||it.type==='orb',cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};}}
      const els=[...document.querySelectorAll('.panel.browser .brow,.panel .close,#aelia-eye-files,#aelia-eye-recal,#bh-upload-close,#bh-pick-label,button,a,[role="button"]')];
      const seen=new Set();for(const el of els){if(seen.has(el)||!visible(el)||el.closest('#aelia-eye-cal'))continue;seen.add(el);const r=el.getBoundingClientRect(),s=rectScore(r,x,y,E.focus?.el===el?1.35:1);if(s>=score)continue;let kind='dom';if(el.classList.contains('brow'))kind='browserRow';else if(el.id==='bh-pick-label')kind='picker';else if(el.id==='aelia-eye-files')kind='files';else if(el.id==='aelia-eye-recal')kind='recal';best={key:el,kind,el,clickable:true,cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};score=s;}
      return best;
    }
    function setFocus(t,now){if(E.focus?.key===t?.key)return;if(E.focus?.el){E.focus.el.classList.remove('eye-focus','eye-focus-soft');}E.focus=t;E.focusT=now;if(t?.el){t.el.classList.add('eye-focus');if(t.kind==='item')t.el.classList.add('eye-focus-soft');}}
    function tapItem(it,x,y){if(!it?.el?.isConnected)return;const fake={x,y,tapX:x,tapY:y,history:[{x,y,t:performance.now()-30},{x,y,t:performance.now()}],probKill:false,grabT:0,grabX:x,grabY:y};try{beginGrab(it,99,fake);endGrab(it,99,fake);}catch(e){console.warn('eye tap item',e);}}
    function activate(t,x,y){if(!t)return;
      if(t.kind==='files'){showUpload();return;}
      if(t.kind==='recal'){startCal();return;}
      if(t.kind==='picker'){pickerArmed=true;t.el.focus();const st=document.getElementById('bh-upload-status');if(st)st.textContent='File picker armed — press ENTER or SPACE now';try{toast('PRESS ENTER TO CHOOSE FILES',1600);}catch(e){}return;}
      if(t.kind==='browserRow'){const pel=t.el.closest('.panel.browser'),b=items.find(v=>v.el===pel);if(b){try{browserTap(b,{x:t.cx,y:t.cy,probKill:false});}catch(e){console.warn('eye browser tap',e);}}return;}
      if(t.kind==='item'){if(t.clickable)tapItem(t.item,t.cx,t.cy);return;}
      if(t.kind==='dom'){try{t.el.click();}catch(e){}return;}
    }
    function update(now){
      if(!E.face||now-E.last<48||!cam||cam.readyState<2)return;if(cam.currentTime===E.videoTime)return;E.videoTime=cam.currentTime;E.last=now;
      let res;try{res=E.face.detectForVideo(cam,now);}catch(e){return;}const f=feat(res);if(!f)return;E.feature=f;if(calibrationFrame(f,now))return;if(!E.cal)return;
      E.rawX=predict(E.cal,f,0);E.rawY=predict(E.cal,f,1);const d=Math.hypot(E.rawX-E.x,E.rawY-E.y),a=d<.018?.10:d<.065?.20:.34;E.x=lerp(E.x,E.rawX,a);E.y=lerp(E.y,E.rawY,a);
      const px=E.x*innerWidth,py=E.y*innerHeight,ui=ensureEyeUI(),dot=ui.querySelector('#aelia-gaze-dot'),ring=ui.querySelector('#aelia-dwell-ring');dot.style.display='block';dot.style.left=px+'px';dot.style.top=py+'px';
      const t=bestTarget(px,py);if(t?.key!==E.candidate?.key){E.candidate=t;E.candidateT=now;ring.style.setProperty('--p',0);}
      if(!t){if(E.focus&&now-E.focusT>260)setFocus(null,now);ring.style.display='none';if(E.lockKey){if(!E.leaveT)E.leaveT=now;if(now-E.leaveT>260){E.lockKey=null;E.leaveT=0;}}return;}
      E.leaveT=0;if(now-E.candidateT>E.focusDelay)setFocus(t,now);
      const age=now-E.candidateT-E.focusDelay,prog=clamp(age/E.dwellMs);ring.style.display=t.clickable?'block':'none';ring.style.left=px+'px';ring.style.top=py+'px';ring.style.setProperty('--p',prog.toFixed(3));
      if(t.clickable&&prog>=1&&E.lockKey!==t.key){E.lockKey=t.key;activate(t,px,py);ring.style.setProperty('--p',0);}
      if(E.lockKey&&E.lockKey!==t.key){if(!E.leaveT)E.leaveT=now;if(now-E.leaveT>240){E.lockKey=null;E.leaveT=0;}}
    }

    AELIA_CTRL.initFace=async function(vision){try{E.face=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:false,minFaceDetectionConfidence:.50,minFacePresenceConfidence:.50,minTrackingConfidence:.50});ensureEyeUI();loadCal();if(E.cal)ensureEyeUI().querySelector('#aelia-gaze-dot').style.display='block';setTimeout(()=>{if(!E.cal)startCal();},900);}catch(e){console.warn('AELIA precision eyes unavailable',e);}};
    AELIA_CTRL.updateEyes=update;
    AELIA_CTRL.startEyeCalibration=startCal;
    AELIA_CTRL.eyeTarget=()=>E.focus?.kind==='item'?E.focus.item:null;

    // Eyes choose the object; the 3-finger grab manipulates that chosen object.
    const originalHitTest=hitTest;
    hitTest=function(cur){const f=E.focus;if(f?.kind==='item'&&f.item?.el?.isConnected&&!f.item.flying)return f.item;return originalHitTest(cur);};

    ensureEyeUI();
    addEventListener('keydown',e=>{
      if((e.key==='e'||e.key==='E')&&!uploadOpen){startCal();return;}
      if(e.key==='Escape'){hideUpload();return;}
      if(uploadOpen&&pickerArmed&&(e.key==='Enter'||e.key===' ')){const inp=document.getElementById('bh-file-input');if(inp){e.preventDefault();inp.click();}}
    });
  }

  rebuildMyFilesTree().catch(()=>{});
})();