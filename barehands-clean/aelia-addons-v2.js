(()=>{
  'use strict';
  const DB_NAME='barehands-my-files-v1', STORE='files';
  let bhUploadOpen=false,bhUploadLast=0;
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function db(){return new Promise((ok,bad)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
  async function dbPut(rec){const d=await db();return new Promise((ok,bad)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(rec);t.oncomplete=()=>ok(rec);t.onerror=()=>bad(t.error);});}
  async function dbAll(){const d=await db();return new Promise((ok,bad)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>bad(r.error);});}
  async function dbGet(id){const d=await db();return new Promise((ok,bad)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).get(id);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>bad(r.error);});}
  function category(file){const n=(file.name||'').toLowerCase(),t=file.type||'';if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(n))return'Photos';if(/\.pdf$/i.test(n)||t==='application/pdf')return'PDF';if(/\.docx?$/i.test(n))return'Word';if(/\.xlsx?$|\.csv$/i.test(n))return'Excel';if(/\.(txt|md)$/i.test(n)||t.startsWith('text/'))return'Text';return'Other';}
  function id(){return (crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));}

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
    wrap.style.cssText='display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,8,10,.55);backdrop-filter:blur(8px);align-items:center;justify-content:center;font-family:system-ui;color:#d9fffb';
    wrap.innerHTML='<div style="width:min(600px,90vw);border:1px solid rgba(150,245,235,.55);border-radius:22px;background:rgba(7,18,20,.94);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:26px">'+
      '<div style="font-size:12px;letter-spacing:.24em;color:#8fe9df;margin-bottom:8px">BAREHANDS · MY FILES</div><div style="font-size:24px;font-weight:700;margin-bottom:8px">Add files to the board</div>'+
      '<div style="opacity:.72;line-height:1.45;margin-bottom:18px">Choose files once. They open on the board and are also saved under <b>Notes → MY FILES</b> in this browser.</div>'+
      '<label style="display:block;border:1px dashed rgba(160,245,235,.6);border-radius:16px;padding:26px;text-align:center;cursor:pointer;background:rgba(120,230,220,.06)"><b>Choose files from this computer</b><br><span style="opacity:.68;font-size:13px">Photos · PDF · Word · Excel · Text</span><input id="bh-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md" style="display:none"></label>'+
      '<div id="bh-upload-status" style="min-height:20px;margin-top:13px;color:#9deee4;font-size:12px"></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="bh-upload-close" style="background:transparent;color:#cffff8;border:1px solid rgba(160,245,235,.45);border-radius:12px;padding:9px 15px;cursor:pointer">Close</button></div></div>';
    document.body.appendChild(wrap);wrap.querySelector('#bh-upload-close').onclick=hideUpload;wrap.addEventListener('click',e=>{if(e.target===wrap)hideUpload();});
    wrap.querySelector('#bh-file-input').addEventListener('change',async e=>{const files=[...e.target.files],st=wrap.querySelector('#bh-upload-status');let n=0;for(const f of files){st.textContent='Adding '+f.name+'…';try{const rec={id:id(),name:f.name,type:f.type,size:f.size,category:category(f),created:Date.now(),blob:f};await dbPut(rec);await openStored(rec);n++;}catch(err){try{toast(f.name+': '+(err.message||err),2500);}catch(_){}}}await rebuildMyFilesTree();st.textContent=n+' file'+(n===1?'':'s')+' added to Notes → MY FILES';e.target.value='';if(n)setTimeout(hideUpload,750);});
  }
  function showUpload(){ensureUploadUI();if(performance.now()-bhUploadLast<900)return;bhUploadLast=performance.now();document.getElementById('bh-upload-ui').style.display='flex';bhUploadOpen=true;try{toast('ADD FILES — choose from this computer',1600);}catch(e){}}
  function hideUpload(){const w=document.getElementById('bh-upload-ui');if(w)w.style.display='none';bhUploadOpen=false;}
  window.__bhShowUpload=showUpload;window.__bhUploadState=()=>({open:bhUploadOpen,last:bhUploadLast});

  function loadScript(src,name){if(name&&window[name])return Promise.resolve(window[name]);return new Promise((ok,bad)=>{const s=document.createElement('script');s.src=src;s.onload=()=>ok(name?window[name]:true);s.onerror=()=>bad(new Error('document reader failed to load'));document.head.appendChild(s);});}
  function sanitize(html){const d=new DOMParser().parseFromString(String(html||''),'text/html');d.querySelectorAll('script,object,embed,link,meta').forEach(n=>n.remove());d.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(/^on/i.test(a.name))el.removeAttribute(a.name);if((a.name==='href'||a.name==='src')&&/^javascript:/i.test(a.value))el.removeAttribute(a.name);}));return d.body.innerHTML;}
  function makePanel(title,html,wide=true){const el=document.createElement('div');el.className='panel';if(wide)el.style.width='720px';el.innerHTML='<div class="bar"><h3>'+esc(title)+'</h3></div><div class="body"><div class="scroll">'+html+'</div></div>';BEHIND.appendChild(el);const p={el,id:UID++,type:'panel',def:{title,file:'local://view/'+title},x:innerWidth*.5,y:innerHeight*.44,scale:1,vx:0,vy:0,grabbedBy:[],ox:0,oy:0,flying:false,stretch:null,scrollY:0,body:el.querySelector('.scroll')};p.anim={k:'in',t:0};el.style.opacity='.05';items.push(p);return p;}
  async function openStored(rec){const file=rec.blob instanceof File?rec.blob:new File([rec.blob],rec.name,{type:rec.type||''});const url=URL.createObjectURL(file),c=rec.category;
    if(c==='Photos'){const it=makeImage(url,rec.name);it.x=innerWidth*.5;it.y=innerHeight*.42;it.anim={k:'in',t:0};it.el.style.opacity='.05';items.push(it);return it;}
    if(c==='PDF')return makePanel(rec.name,'<iframe src="'+url+'#toolbar=1&navpanes=0&view=FitH" style="width:100%;height:520px;border:0;background:#fff"></iframe>');
    if(c==='Word'&&/\.docx$/i.test(rec.name)){await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js','mammoth');const out=await window.mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});return makePanel(rec.name,sanitize(out.value||'<p>(empty document)</p>'));}
    if(c==='Excel'&&!/\.csv$/i.test(rec.name)){await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array'});const name=wb.SheetNames[0];const html=name?window.XLSX.utils.sheet_to_html(wb.Sheets[name]):'<p>(empty workbook)</p>';return makePanel(rec.name,sanitize(html));}
    if(c==='Excel'&&/\.csv$/i.test(rec.name)||c==='Text')return makePanel(rec.name,renderNote(await file.text()));
    return makePanel(rec.name,'<div style="padding:18px"><p>This file is stored in MY FILES.</p><a href="'+url+'" target="_blank" rel="noopener" style="color:#8ff0e4">OPEN ORIGINAL</a></div>');
  }

  rebuildMyFilesTree().catch(()=>{});
  addEventListener('keydown',e=>{if(e.key==='u'||e.key==='U')showUpload();if(e.key==='Escape')hideUpload();});

  // CLICK PROFILE v2 — fitted to Ioannis' 2026-08-17 sample.
  // Tight thumb/index contact is the primary signal. The other fingers are
  // intentionally NOT required because their geometry varied heavily in the
  // sample while the real contact stayed around r 0.15–0.18.
  if(typeof AELIA_CTRL!=='undefined'){
    const clickPose=new Map(), clickRun=new Map();
    const baseClassify=AELIA_CTRL.classifyHand;
    AELIA_CTRL.classifyHand=function(i,lms,meta,now){
      const g=baseClassify(i,lms,meta,now);
      const d=(a,b)=>Math.hypot(lms[a].x-lms[b].x,lms[a].y-lms[b].y,(lms[a].z||0)-(lms[b].z||0));
      const span=meta?.span||d(0,9)||.001;
      const r=Number.isFinite(meta?.ratio)?meta.ratio:d(4,8)/span;
      const f8=Number.isFinite(meta?.f8v)?meta.f8v:d(8,0)/(d(5,0)||.001);
      const t=Number.isFinite(meta?.tRel)?meta.tRel:d(4,13)/span;
      const s=clickPose.get(i)||{down:false};
      const enter=r<=.30&&f8>=.94&&f8<=1.82&&t>=.45&&t<=1.15;
      const keep=s.down&&r<.47&&f8>=.84&&f8<=2.00&&t>=.36&&t<=1.32;
      const blocked=!!g.grab||!!g.backMenuPose||!!g.clawPose||!!g.fist;
      if(!blocked&&(enter||keep)){
        s.down=true;
        g.click=true;g.grab=false;g.state='CLICK';
        g.scores=g.scores||{};g.scores.CLICK=1;
      }else if(s.down&&(blocked||r>=.47||f8<.84||f8>2.00||t<.36||t>1.32)){
        s.down=false;
      }
      clickPose.set(i,s);
      return g;
    };

    // Hand hit-test wins over gaze. Gaze is only used when the hand cursor is
    // not directly over an item. Release hysteresis and a generous motion
    // allowance make a human pinch behave much more like a real mouse click.
    AELIA_CTRL.handleClick=function(i,cur,g,now){
      const s=clickRun.get(i)||{down:false,target:null};
      const forcePull=!!cur.fp?.ph;
      if(g.click&&!s.down&&!g.grab&&!forcePull){
        s.down=true;s.t=now;s.x=cur.x;s.y=cur.y;
        s.target=hitTest(cur)||AELIA_CTRL.eyeTarget?.()||null;
        cur.el.classList.add('pinched');
        if(s.target?.el)s.target.el.classList.add('aelia-armed');
      }
      if(s.down&&(!g.click||g.grab||forcePull)){
        const target=s.target,ms=now-(s.t||now),mv=Math.hypot(cur.x-(s.x??cur.x),cur.y-(s.y??cur.y));
        s.down=false;s.target=null;
        if(target?.el)target.el.classList.remove('aelia-armed');
        cur.el.classList.toggle('pinched',!!g.grab);
        if(!g.grab&&!forcePull&&ms<1250&&mv<130&&target&&target.el?.isConnected&&!target.grabbedBy.length){
          const ox=cur.x,oy=cur.y,r=target.el.getBoundingClientRect();
          cur.x=(r.left+r.right)/2;cur.y=(r.top+r.bottom)/2;cur.probKill=false;
          beginGrab(target,i,cur);endGrab(target,i,cur);
          cur.x=ox;cur.y=oy;
        }
      }
      clickRun.set(i,s);
    };
  }
})();
