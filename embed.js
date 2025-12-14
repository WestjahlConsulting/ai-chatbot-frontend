(() => {
  if (window.__botjahlEmbedLoaded) return;
  window.__botjahlEmbedLoaded = true;

  // ---------- helpers ----------
  const esc = (s) =>
    (s ?? "").replace(/[&<>"']/g, (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c])
    );

  function isSafeUrl(url) {
    if (!url || typeof url !== "string") return false;

    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function mdToHtml(src) {
    if (!src) return "";

    const fence = /```([^\n]*)\n([\s\S]*?)```/g;
    const blocks = [];
    src = src.replace(fence, (_, lang, code) => {
      const i = blocks.push({ lang: esc(lang || ""), code: esc(code) }) - 1;
      return `@@CODE${i}@@`;
    });

    src = esc(src);

    // Länkar
    src = src.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      const cleanUrl = url.trim();
      if (!isSafeUrl(cleanUrl)) return linkText;
      return `<a href="${esc(
        cleanUrl
      )}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    });

    // Bold / italic / inline-code
    src = src
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

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
        items.push(`<li>${m1?.[1] ?? m2?.[1]}</li>`);
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

  // Theme-state: kan komma från BotJahlConfig eller från API:t
  const themeState = {
    launcherIcon: globalCfg.launcherIcon || "💬", // kan bli "preset:bubble" etc
    primaryColor: globalCfg.primaryColor || "",
    userBubbleColor: globalCfg.userBubbleColor || "",
    botBubbleColor: globalCfg.botBubbleColor || "",
    fontFamily: globalCfg.fontFamily || ""
  };

  let launcherIconSpan = null;
  let themeStyleEl = null;

  const isDemo =
    globalCfg.demo === true || ds.demo === "1" || ds.demo === "true";

  const previewFlag =
    globalCfg.preview === true || ds.preview === "1" || ds.preview === "true";

  const previewFrame =
    globalCfg.previewFrame === true ||
    ds.previewFrame === "1" ||
    ds.previewFrame === "true";

  const feedbackSource = isDemo ? "demo" : previewFlag ? "preview" : "prod";

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

  // ---------- inject base CSS ----------
  const style = document.createElement("style");
  style.textContent = `
    /* ===== LAUNCHER (floating ikon) ===== */
    .bj-launcher{
      position:fixed;
      right:1.5rem;
      bottom:1.5rem;
      border:none;
      padding:0;
      cursor:pointer;
      background:transparent;
      z-index:999998;
    }

    .bj-launcher-icon{
      width:52px;
      height:52px;
      border-radius:999px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      background:#2563eb;        /* används när man kör emoji-läge */
      color:#f9fafb;
      font-size:22px;
      box-shadow:0 12px 30px rgba(15,23,42,.55);
      transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;
    }

    .bj-launcher:hover .bj-launcher-icon{
      transform:translateY(-2px);
      box-shadow:0 18px 40px rgba(15,23,42,.7);
      filter:brightness(1.05);
    }
    .bj-launcher:active .bj-launcher-icon{
      transform:translateY(0);
      box-shadow:0 10px 24px rgba(15,23,42,.7);
    }

    /* SVG-läge: ingen extra bubbla runt ikonen */
    .bj-launcher-svg .bj-launcher-icon{
      background:transparent !important;
      box-shadow:none;
      width:auto;
      height:auto;
    }

    /* vi använder inte label längre, men behåller klass ifall något gammalt CSS pekar på den */
    .bj-launcher-label{
      display:none !important;
    }

    .bj-launcher-icon-svg svg{
      width:40px;
      height:40px;
      display:block;
    }

    /* Desktop → gör bubblan till "pill button" */
    @media (min-width:768px){
      .bj-launcher{
        padding:0 .9rem 0 .6rem;
        width:auto;
      }
      .bj-launcher-label{ display:inline; }
      .bj-launcher.bj-no-label .bj-launcher-label{
        display:none !important;
      }
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
        height:min(500px,78vh);
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

    /* ===== FEEDBACK (betyg + kommentar) ===== */
    .bj-feedback{
      margin-top:.55rem;
      padding:.6rem .7rem;
      border-radius:.9rem;
      background:rgba(15,23,42,.95);
      border:1px solid rgba(148,163,184,.55);
      color:#e5e7eb;
      font-size:.8rem;
    }
    .bj-feedback-title{
      margin:0 0 .3rem;
      font-weight:600;
      font-size:.82rem;
    }
    .bj-feedback-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:.5rem;
      margin-bottom:.25rem;
    }
    .bj-feedback-close{
      border:none;
      background:transparent;
      color:#9ca3af;
      cursor:pointer;
      font-size:14px;
      line-height:1;
      padding:2px 4px;
    }
    .bj-feedback-close:hover{
      color:#e5e7eb;
    }

    .bj-stars{
      display:flex;
      gap:.15rem;
      margin-bottom:.35rem;
    }
    .bj-stars button{
      border:0;
      background:transparent;
      cursor:pointer;
      font-size:1.1rem;
      padding:0 .1rem;
      color:#64748b;
      transition:transform .08s ease,color .08s ease;
    }
    .bj-stars button.active{
      color:#facc15;
      transform:translateY(-1px);
    }
    #bj-feedback-comment{
      width:100%;
      min-height:40px;
      resize:vertical;
      border-radius:.6rem;
      border:1px solid #1f2937;
      background:#020617;
      color:#e5e7eb;
      padding:.4rem .5rem;
      font-size:.8rem;
      margin-bottom:.35rem;
      box-sizing:border-box;
    }
    .bj-feedback-send{
      border-radius:999px;
      border:0;
      padding:.4rem .8rem;
      font-size:.8rem;
      cursor:pointer;
      background:linear-gradient(135deg,#22c55e,#16a34a);
      color:#f9fafb;
      font-weight:600;
    }
    .bj-feedback-send:disabled{
      opacity:.6;
      cursor:default;
    }
    .bj-feedback-status{
      margin-top:.25rem;
      font-size:.75rem;
      color:#9ca3af;
    }
    .bj-hidden{display:none;}

    .bj-ai-intro {
      background: rgba(96,165,250,.12);
      border: 1px solid rgba(96,165,250,.25);
      color: #e5e7eb;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      margin-bottom: 10px;
    }
  `;
  document.head.appendChild(style);

  // ---------- build DOM ----------
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "bj-launcher";
  launcher.setAttribute("id", "bj-launcher");
  launcher.setAttribute("aria-label", "Öppna chatten");

  const iconSpan = document.createElement("span");
  iconSpan.className = "bj-launcher-icon";
  launcherIconSpan = iconSpan;

  // INGEN label-text längre – endast ikon
  launcher.appendChild(iconSpan);

  //launcher.appendChild(labelSpan);

  if (!isDemo) {
    // Dölj text på alla "riktiga" bots, visa bara ikon
    launcher.classList.add("bj-no-label");
  }

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

    <!-- Feedback-panel under chatten -->
    <div class="bj-feedback bj-hidden" id="bj-feedback">
      <div class="bj-feedback-header">
        <p class="bj-feedback-title">Hur upplevde du hjälpen?</p>
        <button
          type="button"
          id="bj-feedback-close"
          class="bj-feedback-close"
          aria-label="Stäng feedback">
          ×
        </button>
      </div>
      <div class="bj-stars">
        <button type="button" data-rating="1">★</button>
        <button type="button" data-rating="2">★</button>
        <button type="button" data-rating="3">★</button>
        <button type="button" data-rating="4">★</button>
        <button type="button" data-rating="5">★</button>
      </div>
      <textarea
        id="bj-feedback-comment"
        rows="2"
        maxlength="500"
        placeholder="Vill du skriva något mer? (valfritt, max 500 tecken)"></textarea>
      <button type="button" id="bj-feedback-send" class="bj-feedback-send">
        Skicka feedback
      </button>
      <div id="bj-feedback-status" class="bj-feedback-status"></div>
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

  // Feedback-element
  const fbPanel = panel.querySelector("#bj-feedback");
  const fbStars = fbPanel ? fbPanel.querySelectorAll("[data-rating]") : [];
  const fbComment = fbPanel
    ? fbPanel.querySelector("#bj-feedback-comment")
    : null;
  const fbSend = fbPanel ? fbPanel.querySelector("#bj-feedback-send") : null;
  const fbStatus = fbPanel
    ? fbPanel.querySelector("#bj-feedback-status")
    : null;
  const fbClose = fbPanel ? fbPanel.querySelector("#bj-feedback-close") : null;

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
    bub.innerHTML = '<span class="bj-dots"><i></i><i></i><i></i></span>';
    li.appendChild(bub);
    logEl.appendChild(li);
    logEl.scrollTop = logEl.scrollHeight;
    return () => li.remove();
  }

  let PREVIEW_LOCK = false;
  let answeredCount = 0;
  const FEEDBACK_AFTER = 3;

  // ----- FEEDBACK -----
  let feedbackRating = 0;
  let feedbackShown = false;
  let feedbackDismissed = false;

  function ensureFeedbackVisible() {
    if (!fbPanel) return;

    try {
      if (sessionStorage.getItem("bj_feedback_hidden") === "1") {
        feedbackDismissed = true;
      }
    } catch {
      // ignore
    }

    if (feedbackShown || feedbackDismissed) return;

    fbPanel.classList.remove("bj-hidden");
    feedbackShown = true;
  }

  if (fbPanel && fbStars && fbStars.length) {
    fbStars.forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = parseInt(btn.getAttribute("data-rating") || "0", 10);
        feedbackRating = r;
        fbStars.forEach((b) => {
          const br = parseInt(b.getAttribute("data-rating") || "0", 10);
          b.classList.toggle("active", br <= r);
        });
      });
    });
  }

  async function sendFeedback() {
    if (!fbPanel || !fbSend || !fbStatus) return;

    if (!feedbackRating) {
      fbStatus.textContent = "Välj ett betyg först.";
      return;
    }

    fbSend.disabled = true;
    fbStatus.textContent = "Skickar feedback…";

    const body = {
      customerId,
      source: feedbackSource,
      rating: feedbackRating,
      comment: (() => {
        if (!fbComment) return null;
        let txt = (fbComment.value || "").trim();
        if (!txt) return null;
        if (txt.length > 500) txt = txt.slice(0, 500);
        return txt;
      })(),
      sessionId
    };

    try {
      const res = await fetch(`${API_BASE}/api/public/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        fbStatus.textContent = "Tack för din feedback!";
      } else {
        fbStatus.textContent = "Kunde inte spara feedback just nu.";
        fbSend.disabled = false;
      }
    } catch (err) {
      console.error("[BotJahl] feedback error", err);
      fbStatus.textContent = "Nätverksfel vid feedback.";
      fbSend.disabled = false;
    }
  }

  if (fbSend) {
    fbSend.addEventListener("click", (e) => {
      e.preventDefault();
      sendFeedback();
    });
  }

  if (fbClose) {
    fbClose.addEventListener("click", (e) => {
      e.preventDefault();
      fbPanel.classList.add("bj-hidden");
      feedbackDismissed = true;
      try {
        sessionStorage.setItem("bj_feedback_hidden", "1");
      } catch {
        // ignore
      }
    });
  }

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

  <div class="bj-ai-badge" tabindex="0">
    AI-genererat svar
    <span class="bj-ai-tooltip">
      Detta svar är genererat av en AI och baseras på företagets dokument och innehåll.
    </span>
  </div>


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
          ? data?.error || "Demot är begränsat till 6 frågor per besökare."
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

  function showAiIntroIfNeeded(container) {
  const key = "bj_ai_intro_seen";
  if (sessionStorage.getItem(key)) return;

  const intro = document.createElement("div");
  intro.className = "bj-ai-intro";
  intro.innerHTML = `
    <strong>Hej!</strong><br/>
    Jag är en <strong>AI-assistent</strong> som svarar baserat på företagets dokument och webbplats.
    Informationen kan vara ofullständig – kontrollera alltid viktiga uppgifter.
  `;

  container.prepend(intro);
  sessionStorage.setItem(key, "1");
}


  function closePanel() {
    panel.classList.remove("bj-open");
  }

  launcher.addEventListener("click", () => {
    if (panel.classList.contains("bj-open")) closePanel();
    else openPanel(), showAiIntroIfNeeded();
  });
  closeBtn.addEventListener("click", () => closePanel());

  if (previewFrame) {
    openPanel(), showAiIntroIfNeeded();
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

        answeredCount++;
        if (answeredCount >= FEEDBACK_AFTER) {
          ensureFeedbackVisible();
        }
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

  // ---------- Launcher-icon rendering ----------
   function renderLauncherIcon() {
    if (!launcherIconSpan) return;

    const raw = (themeState.launcherIcon || "").trim() || "preset:bubble";
    let svg = "";

    switch (raw) {
      case "preset:chat":
        svg = `
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="#0b1120"/>
            <path d="M13 14h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3h-4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
                  fill="#f9fafb"/>
          </svg>`;
        break;

      case "preset:robot":
        svg = `
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="#111827"/>
            <rect x="11" y="14" width="18" height="12" rx="4" fill="#e5e7eb"/>
            <circle cx="17" cy="19" r="1.6" fill="#0f172a"/>
            <circle cx="23" cy="19" r="1.6" fill="#0f172a"/>
            <rect x="17" y="23" width="6" height="1.4" rx="0.7" fill="#0f172a"/>
          </svg>`;
        break;

      case "preset:bolt":
        svg = `
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="#111827"/>
            <path d="M22 10l-10 12h6l-2 8 10-13h-6z" fill="#facc15"/>
          </svg>`;
        break;

      case "preset:bubble":
      default:
        svg = `
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="#111827"/>
            <rect x="12" y="13" width="16" height="11" rx="3"
                  fill="#0b1120" stroke="#f9fafb" stroke-width="2"/>
          </svg>`;
        break;
    }

    if (svg) {
      // preset-läge: använd ren SVG, ingen extra “vit bubbla”
      launcher.classList.add("bj-launcher-svg");
      launcherIconSpan.classList.add("bj-launcher-icon-svg");
      launcherIconSpan.innerHTML = svg;
    } else {
      // fallback: emoji / text
      launcher.classList.remove("bj-launcher-svg");
      launcherIconSpan.classList.remove("bj-launcher-icon-svg");
      launcherIconSpan.textContent = raw || "💬";
    }
  }


  // ---------- THEME OVERRIDES ----------
    function applyTheme() {
      // Uppdatera ikon (emoji eller preset)
      renderLauncherIcon();

      // Rensa ev gammalt override-style
      if (themeStyleEl) {
        try { themeStyleEl.remove(); } catch {}
        themeStyleEl = null;
      }

      let css = "";

      function isSafeCss(v) {
        return typeof v === "string" && v.length <= 100 && !/[{}<>]/.test(v);
      }

      const pc = themeState.primaryColor && themeState.primaryColor.trim();
      const uc = themeState.userBubbleColor && themeState.userBubbleColor.trim();
      const bc = themeState.botBubbleColor && themeState.botBubbleColor.trim();
      const ff = themeState.fontFamily && themeState.fontFamily.trim();

      // Primärfärg → emoji-bubbla + knappar (inte SVG-presets)
      if (isSafeCss(pc)) {
        css += `
  .bj-launcher-icon{ background:${pc} !important; }
  .bj-btn{ background:${pc} !important; }
  .bj-feedback-send{ background:${pc} !important; }`;
      }

      if (isSafeCss(uc)) {
        css += `
  .bj-user .bj-bub{ background:${uc} !important; }`;
      }

      if (isSafeCss(bc)) {
        css += `
  .bj-bot .bj-bub{ background:${bc} !important; }`;
      }

      if (isSafeCss(ff)) {
        css += `
  .bj-wrap{ font-family:${ff} !important; }`;
      }

      if (css) {
        themeStyleEl = document.createElement("style");
        themeStyleEl.textContent = css;
        document.head.appendChild(themeStyleEl);
      }
    }


  async function loadThemeFromApi() {
    if (!API_BASE || !customerId) return;

    try {
      const url = `${API_BASE}/api/public/theme?customerId=${encodeURIComponent(
        customerId
      )}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!data) return;

      if (data.launcherIcon) themeState.launcherIcon = data.launcherIcon;
      if (data.primaryColor) themeState.primaryColor = data.primaryColor;
      if (data.userBubbleColor)
        themeState.userBubbleColor = data.userBubbleColor;
      if (data.botBubbleColor) themeState.botBubbleColor = data.botBubbleColor;
      if (data.fontFamily) themeState.fontFamily = data.fontFamily;

      applyTheme();
    } catch (err) {
      // tyst fail – chatten funkar ändå med default
      console.warn("[BotJahl] kunde inte hämta tema", err);
    }
  }

  // Initiera tema
  applyTheme();
  loadThemeFromApi();
})();
