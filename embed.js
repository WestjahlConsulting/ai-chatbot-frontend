// BotJahl embed.js – körs i kundens sida (kundens origin) utan iframe
(() => {
  // ---- helpers ----
  const h = {
    esc(s){ return (s ?? "").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); },
    byId(id){ return document.getElementById(id); },
    md(src){
      if (!src) return "";
      // ``` fenced code
      const fence=/```([^\n]*)\n([\s\S]*?)```/g; const blocks=[];
      src = src.replace(fence,(_,lang,code)=>{ const i=blocks.push({lang:h.esc(lang||""), code:h.esc(code)})-1; return `@@CODE${i}@@`; });
      // escape
      src = h.esc(src);
      // inline
      src = src
        .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g,"<em>$1</em>")
        .replace(/`([^`]+)`/g,"<code>$1</code>")
        .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);
      // block
      const lines=src.replace(/\r\n/g,"\n").split("\n"); const out=[]; let i=0; const para=[];
      const flush=()=>{ if(para.length) out.push(`<p>${para.join(" ")}</p>`), para.length=0; };
      const list=(ord)=>{ const tag=ord?"ol":"ul"; const items=[]; while(i<lines.length){ const L=lines[i];
        const m1=L.match(/^\s*[-*]\s+(.*)$/); const m2=L.match(/^\s*\d+\.\s+(.*)$/); const ok=ord?!!m2:!!m1;
        if(!ok) break; items.push(`<li>${(m1?.[1]??m2?.[1])}</li>`); i++; } if(items.length) out.push(`<${tag}>${items.join("")}</${tag}>`); };
      while(i<lines.length){
        const L=lines[i];
        const h3=L.match(/^###\s+(.*)$/); if(h3){ flush(); out.push(`<h4>${h3[1]}</h4>`); i++; continue; }
        const h2=L.match(/^##\s+(.*)$/);  if(h2){ flush(); out.push(`<h3>${h2[1]}</h3>`); i++; continue; }
        const h1=L.match(/^#\s+(.*)$/);   if(h1){ flush(); out.push(`<h2>${h1[1]}</h2>`); i++; continue; }
        if(/^\s*[-*]\s+/.test(L)){ flush(); list(false); continue; }
        if(/^\s*\d+\.\s+/.test(L)){ flush(); list(true);  continue; }
        if(/^\s*$/.test(L)){ flush(); i++; continue; }
        para.push(L.trim()); i++;
      }
      flush();
      let html = out.join("\n");
      html = html.replace(/@@CODE(\d+)@@/g,(_,n)=>{ const b=blocks[+n]; return `<pre class="bj-code"><code class="lang-${b.lang}">${b.code}</code></pre>`; });
      return html;
    }
  };

  // ---- read attributes ----
  const s = document.currentScript;
  const API_BASE   = (s?.dataset?.api || "").replace(/\/+$/,"");
  const customerId = s?.dataset?.customer || "";
  const mountId    = s?.dataset?.mount || "botjahl-chat"; // valfritt: <div id="botjahl-chat"></div>
  const theme      = (s?.dataset?.theme || "light").toLowerCase(); // light|dark
  const maxHeight  = s?.dataset?.height || "520"; // px (string tillåts)
  const placeholder= s?.dataset?.placeholder || "Skriv din fråga…";

  if (!API_BASE || !customerId){
    console.error("BotJahl embed: data-api och data-customer krävs.");
    return;
  }

  // ---- session id ----
  function sid(){
    const k = `bj_sid_${customerId}`;
    let v = localStorage.getItem(k);
    if (!v) { v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)); localStorage.setItem(k, v); }
    return v;
  }
  const sessionId = sid();

  // ---- mount host ----
  const host = h.byId(mountId) || s.parentElement || document.body;

  // ---- inject minimal CSS (scoped med bj- klasser) ----
  const style = document.createElement("style");
  style.textContent = `
  .bj-wrap{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;color:#0f172a}
  .bj-card{max-width:860px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(2,6,23,.08)}
  .bj-log{list-style:none;padding:12px;margin:0;height:${parseInt(maxHeight,10)||520}px;overflow:auto;background:#fff}
  .bj-msg{margin:10px 0}
  .bj-bub{display:inline-block;max-width:80%;padding:10px 12px;border-radius:10px;line-height:1.35}
  .bj-user .bj-bub{background:#eef2ff;margin-left:auto}
  .bj-bot  .bj-bub{background:#dcfce7;margin-right:auto}
  .bj-bar{display:flex;gap:8px;border-top:1px solid #e5e7eb;padding:8px;background:#f8fafc}
  .bj-inp{flex:1;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:16px}
  .bj-btn{padding:10px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}
  .bj-btn:disabled{opacity:.6;cursor:default}
  .bj-status{font-size:12px;color:#64748b;margin:.5rem 0 0;text-align:left;padding:0 4px}
  .bj-dots{display:inline-flex;gap:6px;align-items:center}
  .bj-dots i{width:7px;height:7px;border-radius:50%;background:#64748b;opacity:.35;animation:bj-blink 1.1s infinite ease-in-out}
  .bj-dots i:nth-child(2){animation-delay:.18s}.bj-dots i:nth-child(3){animation-delay:.36s}
  @keyframes bj-blink{0%,80%,100%{opacity:.25;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
  .bj-code{background:#0b1220;color:#e2e8f0;border-radius:8px;padding:12px;white-space:pre-wrap}
  /* dark theme tweak */
  .bj-dark .bj-card{border-color:#1f2937;background:#0b1220;color:#e5e7eb}
  .bj-dark .bj-log{background:#0b1220}
  .bj-dark .bj-bot .bj-bub{background:#064e3b;color:#e5e7eb}
  .bj-dark .bj-user .bj-bub{background:#1e293b;color:#e5e7eb}
  .bj-dark .bj-bar{background:#0b1220;border-color:#1f2937}
  .bj-dark .bj-inp{background:#111827;border-color:#1f2937;color:#e5e7eb}
  `;
  document.head.appendChild(style);

  // ---- render UI ----
  host.insertAdjacentHTML("beforeend", `
    <div class="bj-wrap ${theme==='dark'?'bj-dark':''}">
      <div class="bj-card">
        <ul class="bj-log" id="bj-log"></ul>
        <form class="bj-bar" id="bj-form" autocomplete="off">
          <input class="bj-inp" id="bj-input" type="text" placeholder="${h.esc(placeholder)}" autocomplete="off" />
          <button class="bj-btn" id="bj-send" type="submit">Skicka</button>
        </form>
      </div>
      <p class="bj-status" id="bj-status"></p>
    </div>
  `);

  const log  = h.byId("bj-log");
  const form = h.byId("bj-form");
  const inp  = h.byId("bj-input");
  const btn  = h.byId("bj-send");
  const stat = h.byId("bj-status");

  const add = (role, html) => {
    const li = document.createElement("li");
    li.className = `bj-msg ${role==='user'?'bj-user':'bj-bot'}`;
    li.innerHTML = `<div class="bj-bub">${role==='user'?h.esc(html):h.md(html)}</div>`;
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  };

  const typing = () => {
    const li = document.createElement("li");
    li.className = "bj-msg bj-bot";
    li.innerHTML = `<div class="bj-bub"><span class="bj-dots"><i></i><i></i><i></i></span></div>`;
    log.appendChild(li); log.scrollTop = log.scrollHeight;
    return () => li.remove();
  };

  add("bot", "Hej! Hur kan jag hjälpa dig?");

  let LOCKED = false;
  function lock(msg){
    LOCKED = true;
    if (inp) inp.disabled = true;
    if (btn) btn.disabled = true;
    if (msg) { stat.textContent = msg; add("bot", msg); }
  }

  async function ask(msg){
    const r = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Accept":"application/json" },
      body: JSON.stringify({ message: msg, customerId, sessionId, preview: false })
    });
    const t = await r.text(); let j={}; try{ j = JSON.parse(t); }catch{}
    if (!r.ok || j?.error){
      if (r.status === 402) throw new Error(j?.error || "Betalning saknas.");
      if (r.status === 403) throw new Error(j?.error || "Ogiltig domän (inte whitelistrad).");
      if (r.status === 429) { lock(j?.error || "Förhandsgränsen nådd."); throw new Error(j?.error || "Förhandsgränsen nådd."); }
      throw new Error(j?.error || `HTTP ${r.status}`);
    }
    return j.reply;
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if (LOCKED) return;
    const msg = (inp.value || "").trim(); if (!msg) return;
    add("user", msg); inp.value=""; inp.focus(); btn.disabled = true; stat.textContent="";
    const stop = typing();
    try{
      const reply = await ask(msg);
      stop(); add("bot", reply);
    }catch(err){
      stop();
      stat.textContent = String(err?.message || "Okänt fel.");
      if (!LOCKED) add("bot", stat.textContent);
    }finally{
      if (!LOCKED) btn.disabled = false;
    }
  });
})();
