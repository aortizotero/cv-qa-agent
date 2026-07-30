import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Config ----
const PORT = process.env.PORT || 3001;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://ortizotero.com";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY en el entorno.");
  process.exit(1);
}

if (!process.env.TURNSTILE_SECRET_KEY) {
  console.error("Falta TURNSTILE_SECRET_KEY en el entorno.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function verifyTurnstile(token, remoteIp) {
  if (!token || typeof token !== "string") return false;
  try {
    const params = new URLSearchParams();
    params.append("secret", process.env.TURNSTILE_SECRET_KEY);
    params.append("response", token);
    if (remoteIp) params.append("remoteip", remoteIp);

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: params }
    );
    const data = await verifyRes.json();
    return data.success === true;
  } catch (err) {
    console.error("Error verificando Turnstile:", err);
    return false;
  }
}

// ---- Cargar contenido estático una sola vez al arrancar ----
const systemPrompt = fs.readFileSync(
  path.join(__dirname, "content", "system-prompt.md"),
  "utf-8"
);
const knowledgeBase = fs.readFileSync(
  path.join(__dirname, "content", "alex-cv-knowledge-base.md"),
  "utf-8"
);

const FULL_SYSTEM_PROMPT = `${systemPrompt}

---

# BASE DE CONOCIMIENTO (usa solo esto para responder sobre la experiencia de Alex)

${knowledgeBase}`;

// ---- App ----
const app = express();
app.set("trust proxy", 1); // Detrás de Traefik/Coolify
app.use(express.json({ limit: "20kb" }));
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["POST"],
  })
);

// Rate limit: 20 mensajes por hora por IP
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Límite de mensajes alcanzado. Intenta de nuevo más tarde." },
});

// Límite de historial que aceptamos del cliente (evita abuso de payload)
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

function validateHistory(history) {
  if (!Array.isArray(history)) return false;
  if (history.length > MAX_HISTORY_MESSAGES) return false;
  return history.every(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length <= MAX_MESSAGE_LENGTH
  );
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const { message, history = [], turnstileToken } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Falta 'message' o está vacío." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: "Mensaje demasiado largo." });
    }
    if (!validateHistory(history)) {
      return res.status(400).json({ error: "Historial inválido." });
    }

    const isHuman = await verifyTurnstile(turnstileToken, req.ip);
    if (!isHuman) {
      return res.status(403).json({ error: "Verificación anti-bot fallida. Intenta de nuevo." });
    }

    const messages = [
      ...history,
      { role: "user", content: message },
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: FULL_SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock ? textBlock.text : "";

    return res.json({ reply });
  } catch (err) {
    console.error("Error en /api/chat:", err);
    return res.status(500).json({ error: "Error interno. Intenta de nuevo." });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Servidor del agente Q&A escuchando en puerto ${PORT}`);
});
