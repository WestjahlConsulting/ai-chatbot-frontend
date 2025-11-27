// BotJahl floating embed widget – körs på kundens sida
(() => {
  if (window.__botjahlEmbedLoaded) return;
  window.__botjahlEmbedLoaded = true;

  // ---------- helpers ----------
  const esc = (s) =>
    (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function mdToHtml(src) {
    if (!src) return "";
    const fence = /```([^\n]*)\n([\s\S]*?)```/g;
    const blocks = [];
    src = src.replace(fence, (_, lang, code) => {
      const i = blocks.push({ lang: esc(lang || ""), code: esc(code) }) - 1;
      return `@@CODE${i}@@`;
    });

    src = esc(src);

    src = src
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);

    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    const buf = [];
    const flush = () => {
      if (!buf.length) return;
      out.push(`<p>${buf.join(" ")}</p>`);
      buf.length = 0;
    };
    const list = (ordered) => {
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (i < lines.length) {
        const L = lines[i];
        const m1 = L.match(/^\s*[-*]\s+(.*)$/);
        const m2 = L.match(/^\s*\d+\.\s+(.*)$/);
        const ok = ordered ? !!m2 : !!m1;
        if (!ok) break;
        items.push(`<li>${(m1?.[1] ?? m2?.[1])}</li>`);
        i++;
      }
      if (items.length) out.push(`<${tag}>${items.join("")}</${tag}>`);
    };

    while (i < lines.length) {
      const L = lines[i];

      const h3 = L.match(/^###\s+(.*)$/);
      if (h3) {
        flush();
        out.push(`<h4>${h3[1]}</h4>`);
        i++;
        continue;
      }
      const h2 = L.match(/^##\s+(.*)$/);
      if (h2) {
        flush();
        out.push(`<h3>${h2[1]}</h3>`);
        i++;
        continue;
      }
      const h1 = L.match(/^#\s+(.*)$/);
      if (h1) {
        flush();
        out.push(`<h2>${h1[1]}</h2>`);
        i++;
        continue;
      }

      if (/^\s*[-*]\s+/.test(L)) {
        flush();
        list(false);
        continue;
      }
      if (/^\s*\d+\.\s+/.test(L)) {
        flush();
        list(true);
        continue;
      }

      if (/^\s*$/.test(L)) {
        flush();
        i++;
        continue;
      }

      buf.push(L.trim());
      i++;
    }
    flush();

    let html = out.join("\n");
    html = html.replace(/@@CODE(\d+)@@/g, (_, n) => {
      const b = blocks[+n];
      return `<pre class="bj-code"><code class="lang-${b.lang}">${b.code}</code></pre>`;
    });
    return html;
  }

  function makeSessionId(customerId) {
    const key = customerId ? `bj_sid_${customerId}` : "bj_sid";
    let v = "";
    try {
      v = localStorage.getItem(key) || "";
    } catch {
      v = "";
    }
    if (!v) {
      v =
        (self.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Date.now().toString(36) + Math.random().toString(36).slice(2);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
    }
    return v;
  }

  // ---------- read config / data-* ----------
  const scriptTag = document.currentScript;
  const ds = (scriptTag && scriptTag.dataset) || {};
  const globalCfg = window.BotJahlConfig || {};
  const isDemo =
  globalCfg.demo === true ||
  ds.demo === "1" ||
  ds.demo === "true";

const previewFlag =
  globalCfg.preview === true ||
  ds.preview === "1" ||
  ds.preview === "true";

const previewFrame =
  globalCfg.previewFrame === true ||
  ds.previewFrame === "1" ||
  ds.previewFrame === "true";


  function trim(u) {
    return (u || "").replace(/\/+$/, "");
  }

  const API_BASE = trim(globalCfg.apiBase || ds.api || "");
  const customerId = globalCfg.customerId || ds.customer || "";
  const themeCfg = (globalCfg.theme || ds.theme || "auto").toLowerCase();
  const placeholder =
    globalCfg.placeholder || ds.placeholder || "Skriv din fråga…";

  if (!API_BASE || !customerId) {
    console.error(
      "[BotJahl] apiBase och customerId måste anges (via window.BotJahlConfig eller data-api/data-customer)."
    );
    return;
  }

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme =
    themeCfg === "auto" ? (prefersDark ? "dark" : "light") : themeCfg;

  const sessionId = makeSessionId(customerId);

 // ---------- inject CSS ----------
const style = document.createElement("style");
style.textContent = `
    /* ===== LAUNCHER (floating chattbubbla) ===== */
    .bj-launcher{
      position:fixed;
      right:1.5rem;
      bottom:1.5rem;
      min-width:56px;                /* ← FIX: ersätter width:56px */
      height:56px;
      border-radius:999px;
      border:none;
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      box-shadow:0 12px 30px rgba(15,23,42,.55);
      z-index:999998;
      transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;
      padding:0;                     /* ← FIX: ingen padding på mobil → perfekt rund */
      overflow:hidden;               /* ← FIX: text kan aldrig sticka utanför */
    }

    .bj-launcher-icon{
      width:26px;
      height:26px;
      border-radius:999px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      background:rgba(15,23,42,.9);
      color:#f9fafb;
      font-size:18px;
      flex-shrink:0;
    }

    .bj-launcher-label{
      display:none;
      margin-left:.55rem;
      font-size:.95rem;
      font-weight:600;
      white-space:nowrap;
    }

    /* Desktop → gör bubblan till “pill button” */
    @media (min-width:768px){
      .bj-launcher{
        padding:0 .9rem 0 .6rem;
        width:auto;                 /* ← FIX: låt den växa naturligt av texten */
      }
      .bj-launcher-label{ display:inline; }
    }

    /* Colors */
    .bj-launcher.dark{
      background:linear-gradient(135deg,#22c55e,#16a34a);
      color:#f9fafb;
    }
    .bj-launcher.light{
      background:linear-gradient(135deg,#2563eb,#4f46e5);
      color:#f9fafb;
    }

    .bj-launcher:hover{
      transform:translateY(-2px);
      box-shadow:0 18px 40px rgba(15,23,42,.7);
      filter:brightness(1.05);
    }
    .bj-launcher:active{
      transform:translateY(0);
      box-shadow:0 10px 24px rgba(15,23,42,.7);
    }

    /* ===== PANEL ===== */
    .bj-panel{
      position:fixed;
      right:1.5rem;
      bottom:5.4rem;
      width:min(400px,92vw);
      height:min(520px,80vh);
      border-radius:1.3rem;
      overflow:hidden;
      box-shadow:0 20px 50px rgba(15,23,42,.8);
      background:#020617;
      z-index:999997;
      opacity:0;
      transform:translateY(16px);
      pointer-events:none;
      transition:opacity .18s ease, transform .18s ease;
    }
    .bj-panel.bj-open{
      opacity:1;
      transform:translateY(0);
      pointer-events:auto;
    }

    @media (max-width:640px){
      .bj-panel{
        right:.75rem;
        left:.75rem;
        bottom:4.8rem;
        width:auto;
        max-height:min(500px,78vh);
      }
    }

    /* ===== CLOSE BUTTON ===== */
    .bj-close{
      position:absolute;
      top:.55rem;
      right:.55rem;
      width:30px;
      height:30px;
      border-radius:999px;
      border:none;
      background:rgba(15,23,42,.9);
      color:#f9fafb;
      font-size:18px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      box-shadow:0 6px 18px rgba(15,23,42,.7);
      z-index:2;
    }
    .bj-close:hover{
      background:rgba(248,250,252,.18);
      transform:translateY(-1px);
    }

    /* ===== PANEL CONTENT ===== */
    .bj-wrap{
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;
      color:#0f172a;
      height:100%;
      display:flex;
      flex-direction:column;
      padding:0.9rem 0.9rem 0.8rem;
    }

    .bj-card{
      flex:1 1 auto;
      border-radius:1rem;
      border:1px solid #e5e7eb;
      background:#ffffff;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      height:100%;
    }

    /* ===== LOG ===== */
    .bj-log{
      list-style:none;
      padding:12px;
      margin:0;
      flex:1 1 auto;
      overflow-y:auto;
      background:#f9fafb;
    }

    .bj-msg{ margin:.35rem 0; display:flex; }
    .bj-bub{
      display:inline-block;
      max-width:82%;
      padding:.55rem .7rem;
      border-radius:.75rem;
      line-height:1.35;
      font-size:.92rem;
    }

    .bj-user{ justify-content:flex-end; }
    .bj-user .bj-bub{
      background:#eef2ff;
      color:#111827;
      border-radius:1rem 0.8rem 0.8rem 1rem;
    }

    .bj-bot{ justify-content:flex-start; }
    .bj-bot .bj-bub{
      background:#dcfce7;
      color:#022c22;
      border-radius:0.8rem 1rem 1rem 0.8rem;
    }

    /* ===== INPUT BAR ===== */
    .bj-bar{
      display:flex;
      gap:.55rem;
      padding:.55rem .6rem .6rem;
      border-top:1px solid #e5e7eb;
      background:#f3f4f6;
    }
    .bj-inp{
      flex:1;
      padding:.55rem .7rem;
      border-radius:.75rem;
      border:1px solid #e5e7eb;
      font-size:.95rem;
    }
    .bj-btn{
      padding:.55rem .9rem;
      border-radius:.75rem;
      border:none;
      background:#2563eb;
      color:#f9fafb;
      font-weight:600;
      font-size:.9rem;
      cursor:pointer;
      white-space:nowrap;
    }
    .bj-btn:disabled{
      opacity:.6;
      cursor:default;
    }

    /* ===== STATUS ===== */
    .bj-status{
      margin:.35rem .15rem 0;
      font-size:.75rem;
      color:#64748b;
    }

    /* ===== TYPING DOTS ===== */
    .bj-dots{
      display:inline-flex;
      gap:5px;
      align-items:center;
    }
    .bj-dots i{
      width:6px;
      height:6px;
      border-radius:999px;
      background:#64748b;
      opacity:.35;
      animation:bj-blink 1.1s infinite ease-in-out;
    }
    .bj-dots i:nth-child(2){ animation-delay:.18s; }
    .bj-dots i:nth-child(3){ animation-delay:.36s; }
    @keyframes bj-blink{
      0%,80%,100{ opacity:.25; transform:scale(.85); }
      40%{ opacity:1; transform:scale(1); }
    }

    /* ===== CODE BLOCK ===== */
    .bj-code{
      background:#020617;
      color:#e5e7eb;
      border-radius:.6rem;
      padding:.6rem .7rem;
      margin-top:.25rem;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
      font-size:.8rem;
      white-space:pre-wrap;
    }

    /* ===== DARK MODE OVERRIDES ===== */
    .bj-dark .bj-card{
      border-color:#1f2937;
      background:#020617;
    }
    .bj-dark .bj-log{
      background:#020617;
    }
    .bj-dark .bj-bot .bj-bub{
      background:#064e3b;
      color:#e5e7eb;
    }
    .bj-dark .bj-user .bj-bub{
      background:#1e293b;
      color:#e5e7eb;
    }
    .bj-dark .bj-bar{
      background:#020617;
      border-color:#1f2937;
    }
    .bj-dark .bj-inp{
      background:#020617;
      border-color:#1f2937;
      color:#e5e7eb;
    }
    .bj-dark .bj-status{
      color:#9ca3af;
    }
`;
document.head.appendChild(style);


  // ---------- build DOM ----------
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "bj-launcher " + (theme === "light" ? "light" : "dark");
  launcher.setAttribute("id", "bj-launcher");
  launcher.setAttribute("aria-label", "Öppna chatten");
  launcher.innerHTML =
    '<span class="bj-launcher-icon">💬</span><span class="bj-launcher-label">Chatt</span>';

  const panel = document.createElement("div");
  panel.className = "bj-panel";
  panel.setAttribute("id", "bj-panel");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bj-close";
  closeBtn.setAttribute("aria-label", "Stäng chatten");
  closeBtn.innerHTML = "&times;";

  const wrap = document.createElement("div");
  wrap.className = "bj-wrap" + (theme === "dark" ? " bj-dark" : "");

  wrap.innerHTML = `
    <div class="bj-card">
      <ul class="bj-log" id="bj-log"></ul>
      <form class="bj-bar" id="bj-form" autocomplete="off">
        <input class="bj-inp" id="bj-input" type="text" placeholder="${esc(
          placeholder
        )}" autocomplete="off" />
        <button class="bj-btn" id="bj-send" type="submit">Skicka</button>
      </form>
    </div>
    <p class="bj-status" id="bj-status"></p>
  `;

  panel.appendChild(closeBtn);
  panel.appendChild(wrap);
  document.body.appendChild(panel);
  document.body.appendChild(launcher);

  const logEl = panel.querySelector("#bj-log");
  const form = panel.querySelector("#bj-form");
  const input = panel.querySelector("#bj-input");
  const send = panel.querySelector("#bj-send");
  const statusEl = panel.querySelector("#bj-status");

  function addMsg(role, text) {
    const li = document.createElement("li");
    li.className = "bj-msg " + (role === "user" ? "bj-user" : "bj-bot");
    const bub = document.createElement("div");
    bub.className = "bj-bub";
    if (role === "user") bub.textContent = text;
    else bub.innerHTML = mdToHtml(text);
    li.appendChild(bub);
    logEl.appendChild(li);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showTyping() {
    const li = document.createElement("li");
    li.className = "bj-msg bj-bot";
    const bub = document.createElement("div");
    bub.className = "bj-bub";
    bub.innerHTML =
      '<span class="bj-dots"><i></i><i></i><i></i></span>';
    li.appendChild(bub);
    logEl.appendChild(li);
    logEl.scrollTop = logEl.scrollHeight;
    return () => li.remove();
  }

  let PREVIEW_LOCK = false;

  function lock(msg) {
    PREVIEW_LOCK = true;
    if (input) input.disabled = true;
    if (send) send.disabled = true;
    if (msg) {
      statusEl.textContent = msg;
      addMsg("bot", msg);
    }
  }

  const firstGreeting =
    window.BotJahlConfig && window.BotJahlConfig.greeting
      ? String(window.BotJahlConfig.greeting)
      : "Hej! Hur kan vi hjälpa dig idag?";
  addMsg("bot", firstGreeting);

  function fetchWithTimeout(url, options = {}, ms = 20000) {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { ...options, signal: ctl.signal }).finally(() =>
      clearTimeout(id)
    );
  }

  async function askApi(message) {
  const url = isDemo
    ? `${API_BASE}/api/public/demo/chat`
    : `${API_BASE}/api/chat`;

  const payload = isDemo
    ? { message, sessionId }
    : { message, customerId, sessionId, preview: !!previewFlag };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok || data?.error) {
    if (res.status === 429) {
      const msg = isDemo
        ? data?.error ||
          "Demot är begränsat till 6 frågor per besökare."
        : data?.error ||
          "Förhandsgränsen är nådd. För att fortsätta, uppgradera din plan eller bädda in på din egen domän.";
      lock(msg);
      throw new Error(msg);
    }
    if (res.status === 402) {
      throw new Error(
        data?.error ||
          "Betalning saknas. Kontrollera din prenumeration i kundportalen."
      );
    }
    if (res.status === 403) {
      throw new Error(
        data?.error ||
          "Domänen verkar inte vara whitelistrad för den här boten."
      );
    }
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data.reply;
}


  function openPanel() {
    panel.classList.add("bj-open");
    if (input && !input.disabled) {
      setTimeout(() => input.focus(), 50);
    }
  }
  function closePanel() {
    panel.classList.remove("bj-open");
  }

  launcher.addEventListener("click", () => {
    if (panel.classList.contains("bj-open")) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener("click", () => closePanel());
  // Om vi kör inne i en preview-iframe: öppna panelen direkt
if (previewFrame) {
  openPanel();
}

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (PREVIEW_LOCK) return;

      const msg = (input.value || "").trim();
      if (!msg) return;

      addMsg("user", msg);
      input.value = "";
      input.focus();

      const stopTyping = showTyping();
      send.disabled = true;
      statusEl.textContent = "";

      try {
        const reply = await askApi(msg);
        stopTyping();
        addMsg("bot", reply);
      } catch (err) {
        stopTyping();
        let friendly =
          (err && err.message) || "Tekniskt fel, försök igen lite senare.";
        if (/Failed to fetch/i.test(friendly)) {
          friendly = "Nätverksfel mot API:t. Kontrollera uppkopplingen.";
        }
        if (/AbortError/i.test(friendly)) {
          friendly = "Tidsgräns mot API:t. Försök igen.";
        }
        if (!PREVIEW_LOCK) {
          statusEl.textContent = friendly;
          addMsg("bot", friendly);
        }
        console.error("[BotJahl] ask error", err);
      } finally {
        if (!PREVIEW_LOCK) send.disabled = false;
      }
    });
  }
})();
