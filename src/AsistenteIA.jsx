// ─── ASISTENTE IA ─────────────────────────────────────────────────────────────
// Chat financiero con Gemini. Detecta intenciones:
//   - Registrar gasto/ingreso → extrae datos y crea transacción
//   - Consultar finanzas → responde con datos reales del usuario
//   - Simular compra → análisis de impacto
//   - Consejo general → respuesta contextualizada

import { useState, useRef, useEffect } from "react";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

export function AsistenteIA({
  onClose, onRegistrarTx, onCrearPago, onAporteMeta,
  disponibleGastar, totalGasto, totalIngresoMes, salario,
  month, now, MONTHS, C, COP,
  tx, goals, getAportado, presupuestos, MAIN_CATS,
  modoSalario, deudas, user,
}) {
  const [msgs, setMsgs] = useState([
    {
      role: "assistant",
      text: `¡Hola ${user?.displayName?.split(" ")[0] || ""}! 👋 Soy tu asistente financiero. Puedo ayudarte a:\n\n• **Registrar** gastos e ingresos ("Gasté $50.000 en almuerzo")\n• **Consultar** tus finanzas ("¿Cuánto gasté en comida este mes?")\n• **Analizar** si puedes comprar algo ("¿Puedo comprarme unos tenis de $200.000?")\n• **Darte consejos** basados en tu situación real\n\n¿En qué te ayudo?`,
      ts: Date.now(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const pendingTxRef = useRef(null); // ref para acceso sincrónico en confirmación
  const [dragY, setDragY] = useState(0);
  const [dragStartY, setDragStartY] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // ── Swipe to dismiss ──────────────────────────────────────────────────────
  const cardRef = useRef(null);
  const startY = useRef(null);
  const curY = useRef(0);

  function swipeStart(clientY) { startY.current = clientY; curY.current = 0; }
  function swipeMove(clientY) {
    if (startY.current === null) return;
    const d = clientY - startY.current;
    if (d > 0) {
      curY.current = d;
      if (cardRef.current) cardRef.current.style.transform = `translateY(${d}px)`;
    }
  }
  function swipeEnd() {
    if (curY.current > 120) { onClose(); return; }
    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.25s ease";
      cardRef.current.style.transform = "translateY(0)";
      setTimeout(() => { if (cardRef.current) cardRef.current.style.transition = ""; }, 250);
    }
    startY.current = null; curY.current = 0;
  }

  // ── Contexto financiero para la IA ────────────────────────────────────────
  function buildContext() {
    const mesNombre = MONTHS[month];
    const gastosPorCat = {};
    tx.filter(t => {
      const d = t.date?.split("-");
      return d && parseInt(d[1]) - 1 === month && parseInt(d[0]) === now.getFullYear();
    }).forEach(t => {
      if (!t.goalId && t.cat !== "ingreso" && t.cat !== "ingreso_extra" && t.cat !== "prestamo_devuelto") {
        const main = MAIN_CATS.find(m => m.subs?.some(s => s.id === t.cat));
        const key = main ? main.label : t.cat;
        gastosPorCat[key] = (gastosPorCat[key] || 0) + t.amount;
      }
    });

    const topCats = Object.entries(gastosPorCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${COP(v)}`)
      .join(", ");

    const metasActivas = goals.filter(g => getAportado(g.id) < g.monto)
      .map(g => `${g.name} (${COP(getAportado(g.id))}/${COP(g.monto)})`)
      .join(", ");

    const deudasActivas = deudas?.filter(d => !d.liquidada)
      .map(d => `${d.nombre}: ${COP(d.saldoRestante)} restante`)
      .join(", ");

    return `Eres un asistente financiero personal para la app "Mis Finanzas Pro". 
Hablas en español colombiano, eres amigable, directo y empático. Usas emojis moderadamente.
Conoces las finanzas reales del usuario:

SITUACIÓN ACTUAL (${mesNombre} ${now.getFullYear()}):
- Ingreso del mes: ${COP(totalIngresoMes)}
- Salario base: ${COP(salario)} (${modoSalario})
- Gastos totales: ${COP(totalGasto)}
- Disponible ahora: ${COP(disponibleGastar)}
- Porcentaje gastado: ${totalIngresoMes > 0 ? Math.round(totalGasto / totalIngresoMes * 100) : 0}%

GASTOS POR CATEGORÍA este mes: ${topCats || "Sin gastos aún"}
METAS ACTIVAS: ${metasActivas || "Sin metas"}
DEUDAS: ${deudasActivas || "Sin deudas"}

CATEGORÍAS DISPONIBLES para registrar:
${MAIN_CATS.map(m => `${m.label}: ${m.subs.map(s => s.label).join(", ")}`).join("\n")}

ACCIONES QUE PUEDES EJECUTAR — usa el JSON correspondiente al final del mensaje:

1. REGISTRAR gasto o ingreso:
[REGISTRAR:{"desc":"descripción","amount":50000,"cat":"almuerzo","tipo":"gasto"}]
tipo puede ser: "gasto" | "ingreso" | "ingreso_extra"

2. CREAR pago programado (suscripción, servicio recurrente, cuota mensual):
[PAGO_PROGRAMADO:{"nombre":"Netflix","monto":16000,"cat":"streaming","dia":3,"frecuencia":"mensual"}]
frecuencia: "mensual" | "quincenal"

3. APORTAR a una meta existente:
[APORTE_META:{"goalId":"ID_DE_LA_META","amount":50000,"desc":"Aporte a meta"}]
Metas disponibles: ${goals.map(g => `${g.name} (id:${g.id})`).join(", ") || "ninguna"}

PARSEO DE MONTOS — interpreta siempre así:
- "1k"=1000, "10k"=10000, "500k"=500000
- "1m"=1000000, "1.5m"=1500000
- Siempre número exacto en el JSON

VALIDACIÓN OBLIGATORIA antes de registrar un GASTO:
- Si el monto supera el disponible actual (${COP(disponibleGastar)}), NO registres y advierte claramente
- Si el disponible es $0 o negativo, rechaza cualquier gasto
- Para INGRESOS no hay límite, registra siempre

Si el usuario CONFIRMA ("sí", "dale", "ok", "listo", "claro", "va"), repite el mismo JSON para ejecutar.
Para CONSULTAS usa los datos reales. Para SIMULACIONES analiza el impacto.
Usa siempre COP con formato $X.XXX.XXX. Sé conciso — máximo 3-4 líneas.`;
  }

  // ── Parsear monto con K y M ───────────────────────────────────────────────
  function parsearMonto(str) {
    if (!str) return 0;
    const s = String(str).toLowerCase().replace(/\./g, "").replace(/,/g, ".").trim();
    if (s.endsWith("m")) return Math.round(parseFloat(s) * 1_000_000);
    if (s.endsWith("k")) return Math.round(parseFloat(s) * 1_000);
    return parseInt(s.replace(/\D/g, "")) || 0;
  }

  // ── Parsear intención de la respuesta ─────────────────────────────────────
  function parsearRespuesta(text) {
    // Intentar los 3 tipos de acción
    const patterns = [
      { key: "REGISTRAR",        re: /\[REGISTRAR:(\{.*?\})\]/s },
      { key: "PAGO_PROGRAMADO",  re: /\[PAGO_PROGRAMADO:(\{.*?\})\]/s },
      { key: "APORTE_META",      re: /\[APORTE_META:(\{.*?\})\]/s },
    ];
    for (const { key, re } of patterns) {
      const match = text.match(re);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const cleanText = text.replace(re, "").trim();
          return { text: cleanText, txData: { ...data, _tipo: key } };
        } catch { /* continúa */ }
      }
    }
    return { text, txData: null };
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  async function enviar() {
    const txt = input.trim();
    if (!txt || loading) return;

    // Si hay transacción pendiente y el usuario confirma
    const currentPending = pendingTxRef.current;
    if (currentPending) {
      const confirmWords = ["sí", "si", "dale", "ok", "confirma", "confirmar", "correcto", "listo", "yes", "claro", "perfecto", "va"];
      const cancelWords = ["no", "cancel", "cancela", "mejor no", "espera", "para"];
      const txtLower = txt.toLowerCase().trim();

      if (confirmWords.some(w => txtLower === w || txtLower.startsWith(w + " ") || txtLower.endsWith(" " + w))) {
        setMsgs(m => [...m, { role: "user", text: txt, ts: Date.now() }]);
        setInput("");
        const montoFinal = parsearMonto(currentPending.amount);
        const esGasto = currentPending.tipo !== "ingreso";

        if (esGasto && montoFinal > disponibleGastar) {
          // Calcular total en metas
          const totalEnMetas = goals.reduce((s, g) => s + getAportado(g.id), 0);
          const deficit = montoFinal - disponibleGastar;

          pendingTxRef.current = null;
          setPendingTx(null);

          if (totalEnMetas >= deficit) {
            // Tiene metas de donde sacar
            const metaSugerida = goals
              .filter(g => getAportado(g.id) >= deficit)
              .sort((a, b) => getAportado(b.id) - getAportado(a.id))[0]
              || goals[0];
            setMsgs(m => [...m, {
              role: "assistant",
              text: `⚠️ No te alcanza el disponible`,
              ts: Date.now(),
              alerta: {
                tipo: "sin_fondos_metas",
                color: "#f59e0b",
                monto: montoFinal,
                deficit,
                disponible: disponibleGastar,
                meta: metaSugerida,
                metaAportado: getAportado(metaSugerida?.id),
              }
            }]);
          } else {
            // No hay de dónde
            setMsgs(m => [...m, {
              role: "assistant",
              text: `No hay fondos suficientes`,
              ts: Date.now(),
              alerta: {
                tipo: "sin_fondos",
                color: "#ef4444",
                monto: montoFinal,
                disponible: disponibleGastar,
              }
            }]);
          }
          return;
        }

        onRegistrarTx({...currentPending, amount: montoFinal});
        pendingTxRef.current = null;
        setPendingTx(null);
        // Mensaje según tipo de acción
        const tipoAccion = currentPending._tipo;
        if (tipoAccion === "PAGO_PROGRAMADO") {
          onCrearPago && onCrearPago(currentPending);
          setMsgs(m => [...m, { role:"assistant", text:"pago_programado", ts:Date.now(),
            alerta:{ tipo:"exito", color:"#10b981", desc:`Pago programado: ${currentPending.nombre}`, monto: parsearMonto(currentPending.monto) }
          }]);
        } else if (tipoAccion === "APORTE_META") {
          onAporteMeta && onAporteMeta(currentPending);
          setMsgs(m => [...m, { role:"assistant", text:"aporte", ts:Date.now(),
            alerta:{ tipo:"exito", color:"#6366f1", desc:`Aporte registrado`, monto: montoFinal }
          }]);
        } else {
          setMsgs(m => [...m, { role:"assistant", text:"registrado", ts:Date.now(),
            alerta:{ tipo:"exito", color:"#10b981", desc: currentPending.desc, monto: montoFinal }
          }]);
        }
        return;
      }
      if (cancelWords.some(w => txtLower === w || txtLower.startsWith(w + " ") || txtLower.endsWith(" " + w))) {
        setMsgs(m => [...m, { role: "user", text: txt, ts: Date.now() }]);
        setInput("");
        pendingTxRef.current = null;
        setPendingTx(null);
        setMsgs(m => [...m, {
          role: "assistant",
          text: "Entendido, no lo registré. ¿En qué más te ayudo?",
          ts: Date.now()
        }]);
        return;
      }
    }

    const userMsg = { role: "user", text: txt, ts: Date.now() };
    setMsgs(m => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Construir historial para la API (últimos 8 mensajes)
      const history = msgs.slice(-8).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: buildContext(),
          messages: [
            ...msgs.slice(-8).map(m => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.text,
            })),
            { role: "user", content: txt }
          ],
        })
      });

      const data = await res.json();
      const rawText = data.content?.[0]?.text || "No pude procesar tu consulta. Intenta de nuevo.";
      const { text: cleanText, txData } = parsearRespuesta(rawText);

      if (txData) {
        pendingTxRef.current = txData;
        setPendingTx(txData);
        setMsgs(m => [...m, {
          role: "assistant",
          text: cleanText,
          ts: Date.now(),
          pendingTx: txData
        }]);
      } else {
        setMsgs(m => [...m, { role: "assistant", text: cleanText, ts: Date.now() }]);
      }
    } catch (e) {
      setMsgs(m => [...m, {
        role: "assistant",
        text: "Tuve un problema conectándome. Verifica tu conexión e intenta de nuevo. 🔄",
        ts: Date.now()
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);

  function toggleVoz() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome."); return; }

    if (escuchando) {
      recognitionRef.current?.stop();
      setEscuchando(false);
      return;
    }

    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onstart = () => setEscuchando(true);
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript).join("");
      setInput(transcript);
    };
    rec.onend = () => {
      setEscuchando(false);
      // Auto-enviar si hay texto
      setTimeout(() => {
        if (inputRef.current?.value?.trim()) enviar();
      }, 300);
    };
    rec.onerror = () => setEscuchando(false);

    recognitionRef.current = rec;
    rec.start();
  }
  // ── Parsear montos con K y M ─────────────────────────────────────────────
  function parsearMonto(texto) {
    if (!texto) return 0;
    const str = String(texto).toLowerCase().trim()
      .replace(/\./g, "").replace(/,/g, ".");
    const match = str.match(/^([\d.]+)\s*([km]?)$/);
    if (!match) return Number(str) || 0;
    const num = parseFloat(match[1]);
    if (match[2] === "k") return Math.round(num * 1000);
    if (match[2] === "m") return Math.round(num * 1000000);
    return Math.round(num);
  }

  function formatText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }

  // ── Sugerencias rápidas ───────────────────────────────────────────────────
  const sugerencias = [
    "¿Cuánto llevo gastado este mes?",
    "¿Puedo gastar $100.000 hoy?",
    "Gasté $30.000 en almuerzo",
    "¿Cómo están mis metas?",
  ];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "flex-end", zIndex: 500,
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: "100%", maxWidth: 430, margin: "0 auto",
          background: C.card, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.border}`,
          height: "92vh", display: "flex", flexDirection: "column",
          animation: "slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Header con swipe */}
        <div
          onTouchStart={e => swipeStart(e.touches[0].clientY)}
          onTouchMove={e => swipeMove(e.touches[0].clientY)}
          onTouchEnd={swipeEnd}
          style={{
            padding: "12px 20px 10px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            cursor: "grab", touchAction: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", position: "absolute", top: 8, left: 0, right: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: C.border }} />
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0, marginTop: 8,
            background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>🤖</div>
          <div style={{ flex: 1, marginTop: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text.h }}>Asistente IA</div>
            <div style={{ fontSize: 11, color: C.emerald, fontWeight: 600 }}>● En línea · Gemini</div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 8, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, width: 32, height: 32, cursor: "pointer",
              color: C.text.b, fontSize: 18, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        {/* Mensajes */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 16px 8px",
          display: "flex", flexDirection: "column", gap: 12,
          WebkitOverflowScrolling: "touch",
        }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              gap: 8, alignItems: "flex-end",
            }}>
              {m.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>🤖</div>
              )}
              <div style={{
                maxWidth: "78%",
                background: m.role === "user"
                  ? `linear-gradient(135deg, ${C.indigo}, ${C.violet})`
                  : C.surface,
                color: m.role === "user" ? "#fff" : C.text.h,
                borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                padding: m.alerta && m.role === "assistant" ? "0" : "10px 14px",
                fontSize: 13, lineHeight: 1.55,
                border: m.role === "assistant" ? `1px solid ${C.border}` : "none",
                overflow: "hidden",
              }}>
                {/* Alerta visual */}
                {m.alerta && m.alerta.tipo === "exito" && (
                  <div style={{padding:"14px 16px", background:`#10b98115`, borderLeft:`4px solid #10b981`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:20}}>✅</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#10b981"}}>¡Registrado!</span>
                    </div>
                    <div style={{fontSize:13,color:C.text.h,fontWeight:600}}>{m.alerta.desc}</div>
                    <div style={{fontSize:18,fontWeight:900,color:"#10b981",marginTop:2}}>{COP(m.alerta.monto)}</div>
                    <div style={{fontSize:11,color:C.text.s,marginTop:4}}>Ya aparece en tus movimientos</div>
                  </div>
                )}
                {m.alerta && m.alerta.tipo === "sin_fondos" && (
                  <div style={{padding:"14px 16px", background:`#ef444415`, borderLeft:`4px solid #ef4444`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>🚫</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#ef4444"}}>Sin fondos disponibles</span>
                    </div>
                    <div style={{fontSize:12,color:C.text.h,lineHeight:1.6}}>
                      Quieres gastar <b>{COP(m.alerta.monto)}</b> pero solo tienes <b style={{color:"#ef4444"}}>{COP(m.alerta.disponible)}</b> disponible y no tienes metas de donde redirigir.
                    </div>
                    <div style={{marginTop:8,padding:"8px 10px",background:`#ef444422`,borderRadius:8,fontSize:11,color:"#ef4444",fontWeight:600}}>
                      💡 Registra un ingreso primero para poder continuar
                    </div>
                  </div>
                )}
                {m.alerta && m.alerta.tipo === "sin_fondos_metas" && (
                  <div style={{padding:"14px 16px", background:`#f59e0b15`, borderLeft:`4px solid #f59e0b`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>⚠️</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#f59e0b"}}>No te alcanza el disponible</span>
                    </div>
                    <div style={{fontSize:12,color:C.text.h,lineHeight:1.6,marginBottom:8}}>
                      Te faltan <b style={{color:"#ef4444"}}>{COP(m.alerta.deficit)}</b> para cubrir este gasto.<br/>
                      Disponible: <b>{COP(m.alerta.disponible)}</b>
                    </div>
                    {m.alerta.meta && <div style={{background:`#f59e0b18`,borderRadius:10,padding:"10px 12px",border:`1px solid #f59e0b33`}}>
                      <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:4}}>SUGERENCIA</div>
                      <div style={{fontSize:12,color:C.text.h}}>
                        Puedes retirar <b>{COP(m.alerta.deficit)}</b> de tu meta <b>"{m.alerta.meta.name}"</b><br/>
                        <span style={{color:C.text.s}}>Tiene {COP(m.alerta.metaAportado)} aportados</span>
                      </div>
                      <div style={{fontSize:11,color:C.text.s,marginTop:6}}>
                        Para hacerlo ve a Metas → edita el aporte
                      </div>
                    </div>}
                  </div>
                )}
                {/* Texto normal */}
                {!m.alerta && <span dangerouslySetInnerHTML={{ __html: formatText(m.text) }} />}
                {/* Card de confirmación para tx pendiente */}
                {m.pendingTx && (
                  <div style={{
                    marginTop: 10, padding: "10px 12px",
                    background: `${C.emerald}15`, borderRadius: 10,
                    border: `1px solid ${C.emerald}35`,
                  }}>
                    <div style={{ fontSize: 11, color: C.emerald, fontWeight: 700, marginBottom: 4 }}>
                      TRANSACCIÓN A REGISTRAR
                    </div>
                    <div style={{ fontSize: 12, color: C.text.h, fontWeight: 600 }}>
                      {m.pendingTx.desc}
                    </div>
                    <div style={{ fontSize: 13, color: C.emerald, fontWeight: 800, marginTop: 2 }}>
                      {COP(m.pendingTx.amount)}
                    </div>
                    <div style={{ fontSize: 10, color: C.text.s, marginTop: 2 }}>
                      Responde "sí" para confirmar o "no" para cancelar
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Indicador de escritura */}
          {loading && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}>🤖</div>
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: "18px 18px 18px 4px", padding: "12px 16px",
                display: "flex", gap: 4, alignItems: "center",
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: C.indigo,
                    animation: `bounce 1.2s ease infinite ${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Sugerencias — solo al inicio */}
          {msgs.length === 1 && !loading && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {sugerencias.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  style={{
                    padding: "6px 12px", borderRadius: 99,
                    border: `1px solid ${C.indigo}44`,
                    background: `${C.indigo}10`, color: C.text.h,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >{s}</button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "10px 12px 20px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
        }}>
          <div style={{
            flex: 1, background: C.surface, borderRadius: 16,
            border: `1.5px solid ${input ? C.indigo : C.border}`,
            padding: "10px 14px", transition: "border-color 0.2s",
            display: "flex", alignItems: "center",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
              }}
              placeholder="Escribe o pregunta algo..."
              rows={1}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: C.text.h, fontSize: 14, resize: "none",
                fontFamily: "inherit", lineHeight: 1.4, maxHeight: 80,
                overflowY: "auto",
              }}
            />
          </div>
          <button
            onClick={toggleVoz}
            style={{
              width: 44, height: 44, borderRadius: 13, border: "none",
              background: escuchando
                ? `linear-gradient(135deg, #ef4444, #dc2626)`
                : C.surface,
              color: escuchando ? "#fff" : C.text.s,
              border: `1px solid ${escuchando ? "#ef4444" : C.border}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, transition: "all 0.2s", flexShrink: 0,
              animation: escuchando ? "pulse 1s ease infinite" : "none",
            }}
          >{escuchando ? "⏹" : "🎙️"}</button>
          <button
            onClick={enviar}
            disabled={!input.trim() || loading}
            style={{
              width: 44, height: 44, borderRadius: 13, border: "none",
              background: input.trim() && !loading
                ? `linear-gradient(135deg, ${C.indigo}, ${C.violet})`
                : C.surface,
              color: input.trim() && !loading ? "#fff" : C.text.s,
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, transition: "all 0.2s", flexShrink: 0,
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}