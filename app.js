// BotJahl widget – modern markdown render + theming
(function enforceHttps() {
  if (location.protocol === "http:" && location.hostname.endsWith("github.io")) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }
})();

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1";
const customerId = qs.get("customerId") || "";

const form    = document.querySelector("#bot-form");
const input   = document.querySelector("#bot-input");
const sendBtn = document.querySelector("#send-btn");
const chat    = document.querySelector("#chat");

function sid(){
  const k = "bj_sid";
  let v = localStorage.getItem(k);
  if (!v) { v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)); localStorage.setItem(k, v); }
  return v;
}
const sessionId = sid();

function trimSlash(u){ return (u || "").replace(/\/+$/, ""); }

async function resolveApiBase(){
  const fromQuery  = qs.get("api");
  const scriptTag  = (document.currentScript || document.querySelector('script[data-api]'))?.dataset?.api;
  const fromWindow = window.BOTJAHL_API_BASE;
  if (fromQuery)  return trimSlash(fromQuery);
  if (scriptTag)  return trimSlash(scriptTag);
  if (fromWindow) return trimSlash(fromWindow);
  try{
    const r = await fetch("./config.json",{cache:"no-store"});
    if (r.ok){ const j = await r.json(); if (j?.apiBase) return trimSlash(j.apiBase); }
  }catch{/* ignore */}
  throw new Error("API-bas kunde inte bestämmas. Skicka ?api=… eller config.json med apiBase.");
}

function escapeHtml(s){
  return (s??"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Minimal säker markdown till HTML (rubriker/listor/länkar/radbrytningar)
function mdToHtml(src){
  if (!src) return "";
  // 1) skydda kodblock ```...```
  const fence = /```([^\n]*)\n([\s\S]*?)```/g;
  const codeBlocks = [];
  src = src.replace(fence, (_,lang,code) => {
    const i = codeBlocks.push({lang:escapeHtml(lang||""), code:escapeHtml(code)}) - 1;
    return `@@CODE${i}@@`;
  });

  // 2) escapa
  src = escapeHtml(src);

  // 3) inline-format
  src = src
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);

  // 4) block: dela till rader
  const lines = src.replace(/\r\n/g,"\n").split("\n");
  const out = [];
  let i=0;
  function flushPara(buf){
    if (!buf.length) return;
    out.push(`<p>${buf.join(" ")}</p>`);
    buf.length=0;
  }
  function collectList(isOrdered){
    const tag = isOrdered ? "ol" : "ul";
    const items=[];
    while(i<lines.length){
      const L = lines[i];
      const m1 = L.match(/^\s*-\s+(.*)$/);
      const m2 = L.match(/^\s*\*\s+(.*)$/);
      const m3 = L.match(/^\s*\d+\.\s+(.*)$/);
      const item = (m1?.[1] ?? m2?.[1] ?? m3?.[1]);
      const ok = isOrdered ? !!m3 : !!(m1||m2);
      if (!ok) break;
      items.push(`<li>${item}</li>`); i++;
    }
    if (items.length) out.push(`<${tag}>${items.join("")}</${tag}>`);
  }

  const paraBuf=[];
  while(i<lines.length){
    const L = lines[i];

    // rubriker
    const h3 = L.match(/^###\s+(.*)$/); if (h3){ flushPara(paraBuf); out.push(`<h4>${h3[1]}</h4>`); i++; continue; }
    const h2 = L.match(/^##\s+(.*)$/);  if (h2){ flushPara(paraBuf); out.push(`<h3>${h2[1]}</h3>`); i++; continue; }
    const h1 = L.match(/^#\s+(.*)$/);   if (h1){ flushPara(paraBuf); out.push(`<h2>${h1[1]}</h2>`); i++; continue; }

    // listor
    if (/^\s*-\s+/.test(L) || /^\s*\*\s+/.test(L)){ flushPara(paraBuf); collectList(false); continue; }
    if (/^\s*\d+\.\s+/.test(L)){ flushPara(paraBuf); collectList(true);  continue; }

    // tom rad => nytt stycke
    if (/^\s*$/.test(L)){ flushPara(paraBuf); i++; continue; }

    // vanlig text
    paraBuf.push(L.trim()); i++;
  }
  flushPara(paraBuf);

  // 5) återställ kodblock
  let html = out.join("\n");
  html = html.replace(/@@CODE(\d+)@@/g, (_,n)=>{
    const b = codeBlocks[Number(n)];
    return `<pre><code class="lang-${b.lang}">${b.code}</code></pre>`;
  });

  return html;
}

function addMsg(role, content){
  const li = document.createElement("li");
  li.className = role === "user" ? "msg user" : "msg bot";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = mdToHtml(content);
  }
  li.appendChild(bubble);
  chat.appendChild(li);
  chat.scrollTop = chat.scrollHeight;
  return li;
}

function fetchWithTimeout(url, options={}, ms=20000){
  const ctl = new AbortController();
  const id  = setTimeout(()=>ctl.abort(), ms);
  return fetch(url, { ...options, signal: ctl.signal }).finally(()=>clearTimeout(id));
}

async function askBot(message){
  const res = await fetchWithTimeout(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      "Accept":"application/json"
    },
    body: JSON.stringify({ message, customerId, sessionId })
  });
  let data={};
  try{ data = await res.json(); }catch{}
  if (!res.ok || data.error){
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data.reply;
}

let API_BASE = "";
async function init(){
  API_BASE = await resolveApiBase();
  if (DEBUG) console.log("API_BASE", API_BASE, "customerId", customerId, "sessionId", sessionId);

  addMsg("bot", "Hej! Hur kan jag hjälpa dig idag?");
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const message = (input.value || "").trim();
    if (!message) return;

    addMsg("user", message);
    input.value=""; input.focus();

    const typingLi = addMsg("bot", "_Skriver…_");
    const bubble = typingLi.querySelector(".bubble");

    sendBtn.disabled = true;
    try{
      const reply = await askBot(message);
      bubble.innerHTML = mdToHtml(reply);
    }catch(err){
      let friendly = (err && err.message) ? String(err.message) : "okänt fel";
      if (/^http/i.test(friendly) || /Failed to fetch/.test(friendly)) friendly = "Nätverksfel mot API:t.";
      if (/AbortError/i.test(friendly)) friendly = "Tidsgräns mot API:t. Försök igen.";
      bubble.textContent = `Kunde inte hämta svar: ${friendly}`;
      console.error(err);
    }finally{
      sendBtn.disabled = false;
    }
  });
}
//ny
init();
