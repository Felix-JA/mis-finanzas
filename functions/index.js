const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();

const ANTHROPIC_KEY = defineSecret("ANTHROPIC_KEY");

// ─── Rate limiting: máximo mensajes por usuario por día ───────────────────────
const LIMITE_GRATIS = 20;  // usuarios sin plan
const LIMITE_PRO    = 200; // usuarios Pro (futura implementación)

exports.chatIA = onCall(
  { secrets: [ANTHROPIC_KEY], region: "us-central1" },
  async (request) => {
    // 1. Verificar autenticación
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }

    const uid  = request.auth.uid;
    const db   = getFirestore();
    const hoy  = new Date().toISOString().split("T")[0]; // "2026-04-30"
    const key  = `ia_uso/${uid}_${hoy}`;

    // 2. Rate limiting
    const usoRef = db.collection("ia_uso").doc(`${uid}_${hoy}`);
    const usoSnap = await usoRef.get();
    const usoActual = usoSnap.exists ? (usoSnap.data().count || 0) : 0;

    // TODO: verificar plan Pro del usuario en usuarios/{uid}.planPro
    const limite = LIMITE_GRATIS;

    if (usoActual >= limite) {
      throw new HttpsError(
        "resource-exhausted",
        `Límite diario de ${limite} mensajes alcanzado. Vuelve mañana o activa el plan Pro.`
      );
    }

    // 3. Llamar a Claude
    const { messages, system } = request.data;

    if (!messages || !system) {
      throw new HttpsError("invalid-argument", "Faltan mensajes o contexto.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      throw new HttpsError("internal", "Error al contactar la IA.");
    }

    const data = await response.json();

    // 4. Incrementar contador de uso
    await usoRef.set(
      { count: usoActual + 1, fecha: hoy, uid },
      { merge: true }
    );

    // 5. Retornar respuesta
    return {
      text: data.content?.[0]?.text || "",
      usoHoy: usoActual + 1,
      limite,
    };
  }
);