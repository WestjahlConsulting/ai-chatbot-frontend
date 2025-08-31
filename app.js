// === BotJahl widget bootstrap ===

// 1) Enforce HTTPS på GitHub Pages (annars kan CORS/”Failed to fetch” spöka)
(function enforceHttps() {
  if (location.protocol === "http:" && location.hostname.endsWith("github.io")) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }
})();

// 2) Grunder och DOM
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1"; // ?debug=1 för att visa status
const customerId = qs.get("customerId") || "1234";

const form = document.querySelector("#bot-form");
const input = document.querySelector("#bot-input");
const chat = document.querySelector("#bot-chat");
const sendBtn = document.querySelector("#bot-send");
const statusEl = document.querySelector("#bot-status");

// 3) Hitta API_BASE (prioritet: query -> data-attr -> window -> config.json -> default)
const DEFAULT_API = "https://chatbot-api-jahl-bdeqfbb5amfjfabe.westeurope-01.azurewebsites.net"; // byt vid behov
let API_BASE = undefined;

// Stabilt, klient-side sessionId (sparas i localStorage)
function sid() {
  const k = "bj_sid";
  let v = localStorage.getItem(k);
  if (!v) { v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)); localStorage.setItem(k, v); }
  return v;
}
const sessionId = sid();

function trimSlash(u) { return (u || "").replace(/\/+$/, ""); }

async function resolveApiBase() {
  // ?api=...
  const apiFromQuery = qs.get("api");

  // <script data-api="..."></script>
  const currentScript = document.currentScript || document.querySelector('script[data-api]');
  const apiFromScript = currentScript?.dataset?.api;

  // window override
  const apiFromWindow = window.BOTJAHL_API_BASE;

  // config.json (läs bara om inget annat hittats)
  let apiFromConfig = null;
  if (!apiFromQuery && !apiFromScript && !apiFromWindow) {
    try {
      const res = await fetch("./config.json", { cache: "no-store" });
      if (res.ok) {
        const cfg = await res.json();
        apiFromConfig = cfg?.apiBase;
      }
    } catch { /* ignorerar om fil saknas */ }
  }

  API_BASE = trimSlash(apiFromQuery || apiFromScript || apiFromWindow || apiFromConfig || DEFAULT_API);

  // Visa statusrad (bra vid felsökning). Sätt hidden=true om du vill dölja.
  if (statusEl) {
   statusEl.hidden = !DEBUG;
  if (DEBUG) statusEl.textContent = `Använder API: ${API_BASE}`;
  }
}

// 4) Litet hjälp-API
function appendBubble(text, who) {
  const li = document.createElement("li");
  li.className = who;
  li.textContent = text;
  chat.appendChild(li);
  chat.scrollTop = chat.scrollHeight;
  return li;
}

function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  const opts = { ...options, signal: controller.signal };
  return fetch(url, opts).finally(() => clearTimeout(id));
}

// 5) Anropa backend
async function askBot(message) {
  const res = await fetchWithTimeout(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, customerId })
  });

  let data = {};
  try { data = await res.json(); } catch { /* tom eller icke-JSON */ }

  if (!res.ok || data.error) {
    const serverMsg = data?.error || `HTTP ${res.status}`;
    throw new Error(serverMsg);
  }
  return data.reply;
}

// 6) Init + event handlers
async function init() {
  await resolveApiBase();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;

    appendBubble(msg, "user");
    input.value = "";
    sendBtn.disabled = true;

    const typing = appendBubble("…", "bot");

    try {
      const reply = await askBot(msg);
      typing.textContent = reply || "(tomt svar)";
    } catch (err) {
      // Vanliga fel: CORS (ingen Access-Control-Allow-Origin), fel host, timeout
      let friendly = String(err.message || err);
      if (/Failed to fetch|TypeError/i.test(friendly)) {
        friendly = "Kunde inte kontakta API:t. Kontrollera att API-URL är korrekt och att CORS tillåter https://westjahlconsulting.github.io.";
      }
      if (/AbortError/i.test(friendly)) {
        friendly = "Tidsgräns mot API:t. Försök igen eller kontrollera servern.";
      }
      typing.textContent = `Kunde inte hämta svar: ${friendly}`;
      console.error(err);
    } finally {
      sendBtn.disabled = false;
    }
  });
}

init();
