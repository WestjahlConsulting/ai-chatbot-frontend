// BotJahl widget – snygg markdown + typing-indicator + robust API-resolver
(function enforceHttps() {
  if (location.protocol === "http:" && location.hostname.endsWith("github.io")) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }
})();

// ---- Query-flaggor ----
const qs            = new URLSearchParams(location.search);
const DEBUG         = qs.get("debug") === "1";
const IS_DEMO_PAGE  = qs.get("demo") === "1" || location.hash === "#demo";
const customerId    = qs.get("customerId") || "";
const IS_PREVIEW    = qs.get("preview") === "1";

// ---- DOM-element ----
const form    = document.querySelector("#bot-form");
const input   = document.querySelector("#bot-input");
const sendBtn = document.querySelector("#send-btn");
const chat    = document.querySelector("#chat");

// ---- Session-id (per besökare) ----
function sid() {
  const k = "bj_sid";
  let v = localStorage.getItem(k);
  if (!v) {
    v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2));
    localStorage.setItem(k, v);
  }
  return v;
}
const sessionId = sid();

// ---- API-bas-url ----
function trimSlash(u) { return (u || "").replace(/\/+$/, ""); }

async function resolveApiBase() {
  const fromQuery  = qs.get("api");
  const scriptTag  = (document.currentScript || document.querySelector("script[data-api]"))?.dataset?.api;
  const fromWindow = window.BOTJAHL_API_BASE;
  if (fromQuery)  return trimSlash(fromQuery);
  if (scriptTag)  return trimSlash(scriptTag);
  if (fromWindow) return trimSlash(fromWindow);
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j?.apiBase) return trimSlash(j.apiBase);
    }
  } catch { /* ignore */ }
  throw new Error("API-bas kunde inte bestämmas. Skicka ?api=… eller config.json med apiBase.");
}

// ---- Markdown → HTML ----
function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Säker markdown till HTML – rubriker/listor/länkar/kod/radbrytningar */
function mdToHtml(src) {
  if (!src) return "";
  // 1) ``` code fences
  const fence = /```([^\n]*)\n([\s\S]*?)```/g;
  const codeBlocks = [];
  src = src.replace(fence, (_, lang, code) => {
    const i = codeBlocks.push({ lang: escapeHtml(lang || ""), code: escapeHtml(code) }) - 1;
    return `@@CODE${i}@@`;
  });

  // 2) escape
  src = escapeHtml(src);

  // 3) inline
  src = src
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);

  // 4) block: rad-för-rad → rubriker/listor/para
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const paraBuf = [];
  const flushPara = () => {
    if (!paraBuf.length) return;
    out.push(`<p>${paraBuf.join(" ")}</p>`);
    paraBuf.length = 0;
  };
  const collectList = (ordered) => {
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

    // headings
    const h3 = L.match(/^###\s+(.*)$/);
    if (h3) { flushPara(); out.push(`<h4>${h3[1]}</h4>`); i++; continue; }
    const h2 = L.match(/^##\s+(.*)$/);
    if (h2) { flushPara(); out.push(`<h3>${h2[1]}</h3>`); i++; continue; }
    const h1 = L.match(/^#\s+(.*)$/);
    if (h1) { flushPara(); out.push(`<h2>${h1[1]}</h2>`); i++; continue; }

    // lists
    if (/^\s*[-*]\s+/.test(L)) { flushPara(); collectList(false); continue; }
    if (/^\s*\d+\.\s+/.test(L)) { flushPara(); collectList(true); continue; }

    // blank → ny paragraf
    if (/^\s*$/.test(L)) { flushPara(); i++; continue; }

    // normal text
    paraBuf.push(L.trim()); i++;
  }
  flushPara();

  // 5) back code fences
  let html = out.join("\n");
  html = html.replace(/@@CODE(\d+)@@/g, (_, n) => {
    const b = codeBlocks[Number(n)];
    return `<pre><code class="lang-${b.lang}">${b.code}</code></pre>`;
  });
  return html;
}

/* Helpers för att lägga till meddelanden + typing */
function addMsg(role, content) {
  const li = document.createElement("li");
  li.className = role === "user" ? "msg user" : "msg bot";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") bubble.textContent = content;
  else bubble.innerHTML = mdToHtml(content);
  li.appendChild(bubble);
  chat.appendChild(li);
  chat.scrollTop = chat.scrollHeight;
  return li;
}

function showTyping() {
  const li = document.createElement("li");
  li.className = "msg bot typing";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<span class="dots"><i></i><i></i><i></i></span>`;
  li.appendChild(bubble);
  chat.appendChild(li);
  chat.scrollTop = chat.scrollHeight;
  // returnera en "stop"-funktion som tar bort indikatorn
  return () => li.remove();
}

function fetchWithTimeout(url, options = {}, ms = 20000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...options, signal: ctl.signal }).finally(() => clearTimeout(id));
}

// --- Preview/demo-spärr ---
let PREVIEW_LOCK = false;
function lockPreviewLimit(msg) {
  PREVIEW_LOCK = true;
  if (input) input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  const s = document.getElementById("bot-status");
  if (s) { s.hidden = false; s.textContent = msg || "Förhandsgränsen är nådd."; }
  addMsg("bot", msg || "Förhandsgränsen är nådd. För att fortsätta – bädda in på din webbplats.");
}

// --- API-anrop (demo vs. vanlig) ---
let API_BASE = "";

async function askBot(message) {
  const url = IS_DEMO_PAGE
    ? `${API_BASE}/api/public/demo/chat`
    : `${API_BASE}/api/chat`;

  const payload = IS_DEMO_PAGE
    ? { message, sessionId }
    : { message, customerId, sessionId, preview: IS_PREVIEW };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try { data = await res.json(); } catch { }

  if (!res.ok || data?.error) {
    if (res.status === 429) {
      lockPreviewLimit(data?.error || "Gränsen för demot är nådd.");
      throw new Error(data?.error || "Gränsen för demot är nådd.");
    }
    if (res.status === 402) {
      throw new Error(data?.error || "Betalning saknas. Slutför checkout eller lägg in kort i portalen.");
    }
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data.reply;
}

// --- Launcher (ikon nere till höger) ---
function initLauncher() {
  const launcher = document.getElementById("botjahl-launcher");
  const widget   = document.getElementById("botjahl-widget");
  if (!launcher || !widget) return;

  launcher.addEventListener("click", () => {
    const open = widget.classList.toggle("botjahl-open");
    widget.classList.toggle("botjahl-hidden", !open);
  });

  // header-knappen "Demo" kan anropa denna
  window.botjahlOpenDemo = () => {
    widget.classList.add("botjahl-open");
    widget.classList.remove("botjahl-hidden");
    widget.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

// --- Init ---
async function init() {
  try {
    API_BASE = await resolveApiBase();
    if (DEBUG) console.log("API_BASE", API_BASE, "customerId", customerId, "sessionId", sessionId, "IS_DEMO_PAGE", IS_DEMO_PAGE);
  } catch (err) {
    console.error(err);
    addMsg("bot", "Tekniskt fel: kunde inte bestämma API-bas.");
    return;
  }

  initLauncher();

  if (chat) {
      if (IS_DEMO_PAGE) {
    // Kort demo-hälsning – resten står i det blå fältet i marknadssidan
    addMsg("bot", "Hej, vad vill du veta om BotJahl?");
  } else {
    addMsg("bot", "Hej! Hur kan jag hjälpa dig?");
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (PREVIEW_LOCK) return;

    const message = (input.value || "").trim();
    if (!message) return;

    addMsg("user", message);
    input.value = "";
    input.focus();

    const stopTyping = showTyping();
    sendBtn.disabled = true;

    try {
      const reply = await askBot(message);
      stopTyping();
      addMsg("bot", reply);
    } catch (err) {
      stopTyping();
      let friendly = (err && err.message) ? String(err.message) : "okänt fel";
      if (/^http/i.test(friendly) || /Failed to fetch/.test(friendly)) friendly = "Nätverksfel mot API:t.";
      if (/AbortError/i.test(friendly)) friendly = "Tidsgräns mot API:t. Försök igen.";
      if (!PREVIEW_LOCK) addMsg("bot", `Kunde inte hämta svar: ${friendly}`);
      console.error(err);
    } finally {
      if (!PREVIEW_LOCK) sendBtn.disabled = false;
    }
  });
}

}
// starta
init();

