const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();

const ANTHROPIC_KEY = defineSecret("ANTHROPIC_KEY");

// ─── Rate limiting: máximo mensajes por usuario por día ───────────────────────
const LIMITE_GRATIS = 10;
const LIMITE_PRO    = 70;  // 7x más que free — balance uso/costo

exports.chatIA = onCall(
  { secrets: [ANTHROPIC_KEY], region: "us-central1" },
  async (request) => {
    // 1. Verificar autenticación
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }

    const uid = request.auth.uid;
    const db  = getFirestore();
    const hoy = new Date().toISOString().split("T")[0];

    // 2. Verificar plan Pro del usuario
    const userSnap = await db.collection("usuarios").doc(uid).get();
    const esPro = userSnap.exists && userSnap.data()?.plan === "pro";
    const limite = esPro ? LIMITE_PRO : LIMITE_GRATIS;

    // 3. Rate limiting
    const usoRef  = db.collection("ia_uso").doc(`${uid}_${hoy}`);
    const usoSnap = await usoRef.get();
    const usoActual = usoSnap.exists ? (usoSnap.data().count || 0) : 0;

    if (usoActual >= limite) {
      throw new HttpsError(
        "resource-exhausted",
        `Límite diario de ${limite} mensajes alcanzado. Vuelve mañana${esPro ? "." : " o activa el plan Pro."}`
      );
    }

    // 4. Llamar a Claude
    const { messages, system } = request.data;

    if (!messages || !system) {
      throw new HttpsError("invalid-argument", "Faltan mensajes o contexto.");
    }

    // Prompt caching: cachea el system prompt por 5 min en Anthropic
    // Ahorra ~90% del costo de input tokens en llamadas consecutivas
    const systemBlocks = typeof system === "string"
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY.value(),
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        system: systemBlocks,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      throw new HttpsError("internal", "Error al contactar la IA.");
    }

    const data = await response.json();

    // 5. Incrementar contador de uso
    await usoRef.set(
      { count: usoActual + 1, fecha: hoy, uid },
      { merge: true }
    );

    // 6. Retornar respuesta
    return {
      text: data.content?.[0]?.text || "",
      usoHoy: usoActual + 1,
      limite,
      esPro,
    };
  }
);