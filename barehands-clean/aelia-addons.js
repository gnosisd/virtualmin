(() => {
  'use strict';

  const STATE = { modal: null, lastUploadOpen: 0, scriptPromises: new Map() };
  const KNOCK_SPEED = 680;
  const MAX_WRIST_SPEED = 560;
  const KNOCK_COOLDOWN = 520;
  const BACK_DWELL = 420;
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function ensureStyles() {
    if (document.getElementById('aelia-local-style')) return;
    const st = document.createElement('style');
    st.id = 'aelia-local-style';
    st.textContent = `
      #aelia-upload-ui{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;background:rgba(0,0,0,.28);backdrop-filter:blur(5px);font-family:-apple-system,"SF Pro Display",sans-serif}
      #aelia-upload-box{width:min(620px,88vw);border-radius:20px;padding:22px;background:linear-gradient(160deg,rgba(35,85,79,.94),rgba(7,25,23,.94));border:1.5px solid rgba(140,240,225,.7);box-shadow:0 20px 90px rgba(0,0,0,.65),0 0 40px rgba(111,229,214,.16);color:#eafff9}
      #aelia-upload-box h2{margin:0 0 6px;font:700 18px "SF Mono",Menlo,monospace;letter-spacing:.11em;color:#8ff0e4;text-transform:uppercase}
      #aelia-upload-box p{margin:0 0 16px;color:#b8dcd6;font-size:13px;line-height:1.45}
      #aelia-drop{border:1.5px dashed rgba(140,240,225,.6);border-radius:15px;padding:30px 18px;text-align:center;background:rgba(111,229,214,.05)}
      #aelia-drop.drag{background:rgba(111,229,214,.14);border-color:#bffdf3}
      #aelia-upload-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
      #aelia-upload-ui button,.aelia-file-button{appearance:none;border:1px solid rgba(140,240,225,.62);background:rgba(111,229,214,.12);color:#eafffa;border-radius:10px;padding:10px 15px;font:700 12px "SF Mono",Menlo,monospace;letter-spacing:.06em;cursor:pointer}
      #aelia-upload-ui button:hover,.aelia-file-button:hover{background:rgba(111,229,214,.22)}
      #aelia-file-input{display:none}
      .aelia-local-doc iframe{width:100%;height:520px;border:0;border-radius:8px;background:#fff}
      .aelia-local-doc table{border-collapse:collapse;width:100%;font-size:12px;color:#eafffa}
      .aelia-local-doc td,.aelia-local-doc th{border:1px solid rgba(140,240,225,.24);padding:6px 8px;vertical-align:top}
      .aelia-local-doc th{background:rgba(111,229,214,.12);color:#bffbf2;position:sticky;top:0}
      .aelia-local-doc img{max-width:100%;height:auto}
      .aelia-local-doc a{color:#8ff0e4}
    `;
    document.head.appendChild(st);
  }

  function closeUpload() {
    if (STATE.modal) STATE.modal.remove();
    STATE.modal = null;
  }

  function openUpload() {
    ensureStyles();
    if (STATE.modal || Date.now() - STATE.lastUploadOpen < 800) return;
    STATE.lastUploadOpen = Date.now();
    const ui = document.createElement('div');
    ui.id = 'aelia-upload-ui';
    ui.innerHTML = `
      <div id="aelia-upload-box">
        <h2>Add files to Barehands</h2>
        <p>Select files from this computer. They are transformed locally into movable spatial cards. Supported now: photos, PDF, Word, Excel, Markdown and text.</p>
        <div id="aelia-drop">
          <div style="font:700 14px 'SF Mono',Menlo,monospace;color:#bffbf2;margin-bottom:8px">DROP FILES HERE</div>
          <div style="font-size:12px;color:#a8d8cf;margin-bottom:14px">or choose them from the computer</div>
          <label class="aelia-file-button" for="aelia-file-input">CHOOSE FILES</label>
          <input id="aelia-file-input" type="file" multiple accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        </div>
        <div id="aelia-upload-status" style="min-height:18px;margin-top:12px;color:#a8d8cf;font:12px 'SF Mono',Menlo,monospace"></div>
        <div id="aelia-upload-actions"><button id="aelia-upload-close">CLOSE</button></div>
      </div>`;
    document.body.appendChild(ui);
    STATE.modal = ui;
    const inp = ui.querySelector('#aelia-file-input');
    const drop = ui.querySelector('#aelia-drop');
    const status = ui.querySelector('#aelia-upload-status');
    ui.querySelector('#aelia-upload-close').onclick = closeUpload;
    ui.addEventListener('click', e => { if (e.target === ui) closeUpload(); });
    inp.addEventListener('change', () => handleFiles([...inp.files], status));
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files], status));
    try { toast('UPLOAD PANEL — choose files with mouse', 1800); } catch (e) {}
  }

  function loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    if (STATE.scriptPromises.has(src)) return STATE.scriptPromises.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = () => reject(new Error('Could not load document reader'));
      document.head.appendChild(s);
    });
    STATE.scriptPromises.set(src, p);
    return p;
  }

  function sanitizeHTML(html) {
    const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
    d.querySelectorAll('script,object,embed,link,meta').forEach(n => n.remove());
    d.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      if ((a.name === 'href' || a.name === 'src') && /^javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }));
    return d.body.innerHTML;
  }

  function spatialPanel(title, html, wide = false) {
    const el = document.createElement('div');
    el.className = 'panel aelia-local-doc';
    if (wide) el.style.width = '720px';
    el.innerHTML = `<div class="bar"><h3>${esc(title)}</h3></div><div class="body"><div class="scroll">${html}</div></div>`;
    BEHIND.appendChild(el);
    const p = { el, id: UID++, type: 'panel', def: { title, file: 'local://' + title },
      x: innerWidth * 0.5, y: innerHeight * 0.44, scale: 1, vx: 0, vy: 0,
      grabbedBy: [], ox: 0, oy: 0, flying: false, stretch: null, scrollY: 0,
      body: el.querySelector('.scroll') };
    p.anim = { k: 'in', t: 0 }; p.el.style.opacity = '0.05';
    items.push(p);
    return p;
  }

  function spatialImage(file) {
    const url = URL.createObjectURL(file);
    const it = makeImage(url, file.name);
    it.x = innerWidth * 0.5; it.y = innerHeight * 0.42;
    it.anim = { k: 'in', t: 0 }; it.el.style.opacity = '0.05';
    items.push(it);
  }

  async function spatialPDF(file) {
    const url = URL.createObjectURL(file);
    spatialPanel(file.name, `<iframe title="${esc(file.name)}" src="${url}#toolbar=1&navpanes=0&view=FitH"></iframe>`, true);
  }

  async function spatialWord(file) {
    await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
    const ab = await file.arrayBuffer();
    const out = await window.mammoth.convertToHtml({ arrayBuffer: ab });
    spatialPanel(file.name, sanitizeHTML(out.value || '<p>(empty document)</p>'), true);
  }

  async function spatialExcel(file) {
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
    const ab = await file.arrayBuffer();
    const wb = window.XLSX.read(ab, { type: 'array' });
    if (!wb.SheetNames.length) throw new Error('Workbook has no sheets');
    const tabs = wb.SheetNames.map((n,i) => `<span style="display:inline-block;margin:0 8px 10px 0;padding:5px 8px;border:1px solid rgba(140,240,225,.28);border-radius:7px;color:${i===0?'#bffbf2':'#a8d8cf'}">${esc(n)}</span>`).join('');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const html = window.XLSX.utils.sheet_to_html(sheet, { id: 'aelia-sheet' });
    spatialPanel(file.name, tabs + sanitizeHTML(html), true);
  }

  async function spatialText(file) {
    const text = await file.text();
    spatialPanel(file.name, renderNote(text), true);
  }

  async function processFile(file) {
    const name = file.name || 'file';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if ((file.type || '').startsWith('image/')) return spatialImage(file);
    if (ext === 'pdf' || file.type === 'application/pdf') return spatialPDF(file);
    if (ext === 'docx') return spatialWord(file);
    if (['xlsx','xls'].includes(ext)) return spatialExcel(file);
    if (['txt','md','csv'].includes(ext) || (file.type || '').startsWith('text/')) return spatialText(file);
    throw new Error('Unsupported file type');
  }

  async function handleFiles(files, status) {
    if (!files.length) return;
    let ok = 0;
    for (const f of files) {
      status.textContent = `opening ${f.name}…`;
      try { await processFile(f); ok++; }
      catch (e) { try { toast(`${f.name}: ${e.message || e}`, 3000); } catch (_) {} }
    }
    status.textContent = `${ok} of ${files.length} file${files.length===1?'':'s'} added to the spatial board`;
    if (ok) setTimeout(closeUpload, 650);
  }

  function fingerExtended(lms, tip, mcp, factor = 1.42) {
    const w = lms[0];
    const td = Math.hypot(lms[tip].x-w.x, lms[tip].y-w.y, (lms[tip].z||0)-(w.z||0));
    const md = Math.hypot(lms[mcp].x-w.x, lms[mcp].y-w.y, (lms[mcp].z||0)-(w.z||0));
    return md > 0 && td > factor * md;
  }

  function backOfHand(lms, handedLabel) {
    const w = lms[0], a = lms[5], b = lms[17];
    const cross = (a.x-w.x)*(b.y-w.y) - (a.y-w.y)*(b.x-w.x);
    if (handedLabel === 'Right') return cross > 0.018;
    if (handedLabel === 'Left') return cross < -0.018;
    return false;
  }

  function segmentHit(x0,y0,x1,y1) {
    let best = null, bestD = Infinity;
    for (const t of items) {
      if (!t || !t.el || !t.el.isConnected || t.grabbedBy?.length) continue;
      if (t.type === 'widget' || t.type === 'orb' || t.type === 'browser') continue;
      const r = t.el.getBoundingClientRect();
      const pad = 24;
      for (let s=0; s<=10; s++) {
        const q=s/10, x=x0+(x1-x0)*q, y=y0+(y1-y0)*q;
        if (x>=r.left-pad && x<=r.right+pad && y>=r.top-pad && y<=r.bottom+pad) {
          const d=Math.hypot(x0-t.x,y0-t.y);
          if (d<bestD) { best=t; bestD=d; }
          break;
        }
      }
    }
    return best;
  }

  function tryIndexKnock(ctx) {
    const { lms, cur, now, ratio } = ctx;
    const tip = toScreen(lms[8]), wrist = toScreen(lms[0]);
    const relX = tip.x - wrist.x, relY = tip.y - wrist.y;
    const prev = cur._aeliaKnock;
    cur._aeliaKnock = { t: now, tipX: tip.x, tipY: tip.y, wristX: wrist.x, wristY: wrist.y, relX, relY };
    if (!prev) return;
    const dt = (now - prev.t) / 1000;
    if (dt <= 0 || dt > 0.14) return;
    const rvx = (relX-prev.relX)/dt, rvy = (relY-prev.relY)/dt;
    const wvx = (wrist.x-prev.wristX)/dt, wvy = (wrist.y-prev.wristY)/dt;
    const relSpeed = Math.hypot(rvx,rvy), wristSpeed = Math.hypot(wvx,wvy);
    const index = fingerExtended(lms,8,5,1.35);
    const other = [fingerExtended(lms,12,9,1.34),fingerExtended(lms,16,13,1.34),fingerExtended(lms,20,17,1.34)].filter(Boolean).length;
    const pose = index && other <= 1 && ratio > 0.42;
    if (!pose || relSpeed < KNOCK_SPEED || wristSpeed > MAX_WRIST_SPEED) return;
    if (now - (cur._aeliaKnockT || 0) < KNOCK_COOLDOWN) return;
    const target = segmentHit(prev.tipX, prev.tipY, tip.x, tip.y);
    if (!target) return;
    cur._aeliaKnockT = now;
    target.anim = null; target.stretch = null; target.flying = true;
    target.grabbedBy = []; target.el.classList.remove('grabbed');
    const cap=(v,m)=>Math.max(-m,Math.min(m,v));
    target.vx = cap(rvx * 1.55, 4300);
    target.vy = cap(rvy * 1.55, 4300);
    if (target.type === 'model') target.rvy = cap((rvx-rvy)*0.0018,5);
    try { foley.throw_(); } catch (e) {}
    try { toast(`INDEX KNOCK — ${(target.def && target.def.title) || target.type}`, 900); } catch (e) {}
  }

  window.AELIA_GESTURE_FRAME = ctx => {
    const { res, lms, i, cur, now, ratio } = ctx;
    const handedLabel = res?.handednesses?.[i]?.[0]?.categoryName || res?.handedness?.[i]?.[0]?.categoryName || '';
    const allFour = [fingerExtended(lms,8,5),fingerExtended(lms,12,9),fingerExtended(lms,16,13),fingerExtended(lms,20,17)].every(Boolean);
    const uploadPose = allFour && ratio > 0.62 && backOfHand(lms, handedLabel);
    if (uploadPose) {
      if (!cur._aeliaBackT) cur._aeliaBackT = now;
      if (now - cur._aeliaBackT >= BACK_DWELL && now - (cur._aeliaUploadT || 0) > 1800) {
        cur._aeliaUploadT = now;
        openUpload();
      }
    } else cur._aeliaBackT = 0;
    if (!STATE.modal) tryIndexKnock(ctx);
  };

  addEventListener('keydown', e => {
    if (e.key === 'u' || e.key === 'U') openUpload();
    if (e.key === 'Escape') closeUpload();
  });
})();
