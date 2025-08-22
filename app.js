// Hämta customerId från querystring (?customerId=1234)
const urlParams = new URLSearchParams(window.location.search);
const customerId = urlParams.get("customerId") || "1234";

// Backendbas (kan override:as i fönstret före denna fil laddas)
const API_BASE = window.BOTJAHL_API_BASE || "https://chatbot-api-jahl.azurewebsites.net";

const form = document.querySelector("#bot-form");
const input = document.querySelector("#bot-input");
const chat = document.querySelector("#bot-chat");
const sendBtn = document.querySelector("#bot-send");
const statusEl = document.querySelector("#bot-status");

function appendBubble(text, who) {
  const li = document.createElement("li");
  li.className = who;
  li.textContent = text;
  chat.appendChild(li);
  chat.scrollTop = chat.scrollHeight;
}

async function askBot(message) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, customerId })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.reply;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;

  appendBubble(msg, "user");
  input.value = "";
  sendBtn.disabled = true;

  const typing = document.createElement("li");
  typing.className = "bot";
  typing.textContent = "…";
  chat.appendChild(typing);
  chat.scrollTop = chat.scrollHeight;

  try {
    const reply = await askBot(msg);
    typing.textContent = reply;
  } catch (err) {
    typing.textContent = `Kunde inte hämta svar: ${err.message}`;
    console.error(err);
  } finally {
    sendBtn.disabled = false;
  }
});
