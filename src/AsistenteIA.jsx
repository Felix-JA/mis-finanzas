// ─── ASISTENTE IA ─────────────────────────────────────────────────────────────
// Chat financiero con Gemini. Detecta intenciones:
//   - Registrar gasto/ingreso → extrae datos y crea transacción
//   - Consultar finanzas → responde con datos reales del usuario
//   - Simular compra → análisis de impacto
//   - Consejo general → respuesta contextualizada

import { useSwipeDismiss } from "./useSwipeDismiss";
import { useState, useRef, useEffect } from "react";

import { functions, db } from "./firebase";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { alertInfo, alertWarning, alertLimit } from "./GlobalAlert";
const callChatIA = httpsCallable(functions, "chatIA");

export function AsistenteIA({
  onClose, onRegistrarTx, onCrearPago, onAporteMeta,
  disponibleGastar, totalGasto, totalIngresoMes, salario,
  month, now, MONTHS, C, COP,
  tx, goals, getAportado, presupuestos, MAIN_CATS,
  modoSalario, deudas, user, isPro,
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
  const callingRef = useRef(false);
  // Inicializar con límite ya conocido — count se carga desde Firestore async
  const [usoHoy, setUsoHoy] = useState({ count: 0, limite: isPro ? 70 : 10, cargando: true });
  const [pendingTx, setPendingTx] = useState(null);
  const pendingTxRef = useRef(null); // ref para acceso sincrónico en confirmación
  const sw = useSwipeDismiss(onClose);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // ── Cargar uso de IA al abrir — siempre desde Firestore para tener count real
  useEffect(() => {
    if (!user) return;
    const limite = isPro ? 200 : 10;
    const hoy = new Date().toISOString().split("T")[0];
    getDoc(doc(db, "ia_uso", `${user.uid}_${hoy}`)).then(snap => {
      const count = snap.exists() ? (snap.data().count || 0) : 0;
      setUsoHoy({ count, limite, cargando: false });
    }).catch(() => {
      setUsoHoy({ count: 0, limite, cargando: false });
    });
  }, [user, isPro]);

  // ── Swipe to dismiss ──────────────────────────────────────────────────────


  // ── Contexto financiero para la IA ────────────────────────────────────────
  function buildContext() {
    const mesNombre = MONTHS[month];
    const esPro = isPro;
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
      .map(d => `${d.nombre}: ${COP(d.saldoRestante)} restante, cuota ${COP(d.cuotaMensual)}/mes`)
      .join(", ");

    const prestamosActivos = tx.filter(t => t.cat === "prestamo_tercero")
      .slice(-5)
      .map(t => `Prestaste ${COP(t.amount)} a ${t.desc||"alguien"} (${t.date})`)
      .join(", ");

    return `Eres un asistente financiero para "Mis Finanzas Pro". Español colombiano, conciso, máximo 2-3 líneas.

CONTEXTO (${mesNombre} ${now.getFullYear()}):
Disponible: ${COP(disponibleGastar)} | Gastado: ${COP(totalGasto)} (${totalIngresoMes>0?Math.round(totalGasto/totalIngresoMes*100):0}%) | Ingreso: ${COP(totalIngresoMes)}
Categorías top: ${topCats||"Sin gastos"} | Metas: ${metasActivas||"ninguna"} | Deudas: ${deudasActivas||"ninguna"} | Préstamos dados: ${prestamosActivos||"ninguno"}
Plan: ${esPro?"PRO":"FREE (max 1 préstamo, 3 pagos, 3 metas)"}

SUBCATEGORÍAS VÁLIDAS (usa el id exacto en cat:):
comida: desayuno|almuerzo|comidas_rapidas|domicilios|mercado|snacks
hogar: arriendo|servicios|aseo|reparaciones|electro
transporte: bus|taxi|peaje|pasajes|mudanza
vehiculo: gasolina|soat|mecanica|parqueadero|repuestos
salud: medico|medicamentos|gym|psicologia|optica
ocio: salidas|eventos|viajes|hobbies|regalos
estilo: ropa|calzado|accesorios|peluqueria|cuidado
digital: streaming|apps|tecnologia|ia|juegos
deudas: tarjeta|cuotas|credito

REGLAS (obligatorias):
1. hamburguesa/pizza/comida rápida en local → comidas_rapidas
2. almorzar en restaurante al mediodía → almuerzo
3. cena/salida de noche/bar → salidas
4. rappi/domicilio/delivery → domicilios (canal gana siempre)
5. corte/uñas/spa/masaje → peluqueria
6. plan celular/internet → servicios; app digital → apps
7. Disponible: ${COP(disponibleGastar)} — NO registrar gastos/préstamos que superen esto
8. SIEMPRE incluir el JSON al final del mensaje

FORMATOS:
[REGISTRAR:{"desc":"X","amount":N,"cat":"id","tipo":"gasto"}]
[REGISTRAR:{"desc":"X","amount":N,"cat":"ingreso","tipo":"ingreso"}]
[REGISTRAR:{"desc":"Préstamo a X","amount":N,"cat":"prestamo_tercero","tipo":"prestamo_tercero"}]
[PAGO_PROGRAMADO:{"nombre":"X","monto":N,"cat":"id","dia":D,"frecuencia":"mensual"}]
[APORTE_META:{"goalId":"ID","amount":N,"desc":"Aporte"}]
Metas: ${goals.map(g=>`${g.name} id:${g.id}`).join(", ")||"ninguna"}

MONTOS: 1k=1000 10k=10000 1m=1000000
EJEMPLOS:
"hamburguesa 50k"→[REGISTRAR:{"desc":"Hamburguesa","amount":50000,"cat":"comidas_rapidas","tipo":"gasto"}]
"almorcé en restaurante 30k"→[REGISTRAR:{"desc":"Almuerzo","amount":30000,"cat":"almuerzo","tipo":"gasto"}]
"pizza rappi 35k"→[REGISTRAR:{"desc":"Pizza Rappi","amount":35000,"cat":"domicilios","tipo":"gasto"}]
"cena con amigos 80k"→[REGISTRAR:{"desc":"Cena","amount":80000,"cat":"salidas","tipo":"gasto"}]
"corte pelo 25k"→[REGISTRAR:{"desc":"Corte de pelo","amount":25000,"cat":"peluqueria","tipo":"gasto"}]
"Netflix 16k"→[REGISTRAR:{"desc":"Netflix","amount":16000,"cat":"streaming","tipo":"gasto"}]`;
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
  // ── Umbrales confirmación ────────────────────────────────────────────────
  const UMBRAL_GRANDE = 500000;
  const UMBRAL_MEDIO  = 100000;

  async function ejecutarAccion(txData, montoFinal) {
    const tipo = txData._tipo;
    if (tipo === "PAGO_PROGRAMADO") {
      onCrearPago && await onCrearPago(txData);
      return { desc:`Pago programado: ${txData.nombre}`, monto:parsearMonto(txData.monto), color:"#10b981" };
    } else if (tipo === "APORTE_META") {
      onAporteMeta && await onAporteMeta({...txData, amount:montoFinal});
      return { desc:"Aporte registrado", monto:montoFinal, color:"#6366f1" };
    } else {
      await onRegistrarTx({...txData, amount:montoFinal});
      return { desc:txData.desc, monto:montoFinal, color:"#10b981" };
    }
  }

  async function enviarTexto(txt) {
    if (!txt || loading || callingRef.current) return;
    callingRef.current = true;

    const currentPending = pendingTxRef.current;
    if (currentPending) {
      const confirmW = ["sí","si","dale","ok","confirma","confirmar","correcto","listo","yes","claro","perfecto","va"];
      const cancelW  = ["no","cancel","cancela","mejor no","espera","para"];
      const tl = txt.toLowerCase().trim();

      if (confirmW.some(w => tl===w || tl.startsWith(w+" ") || tl.endsWith(" "+w))) {
        setMsgs(m=>[...m,{role:"user",text:txt,ts:Date.now()}]);
        const montoFinal = parsearMonto(currentPending.amount||currentPending.monto);
        // Limpiar pending ANTES de ejecutar para evitar doble confirmacion
        const txParaEjecutar = currentPending;
        pendingTxRef.current=null; setPendingTx(null);
        setLoading(true);
        try {
          const resultado = await ejecutarAccion(txParaEjecutar, montoFinal);
          setMsgs(m=>[...m,{role:"assistant",text:"",ts:Date.now(),alerta:{tipo:"exito",...resultado}}]);
        } catch(err) {
          const errMsg = err?.message || "";
          if (errMsg.startsWith("PLAN_FREE:")) {
            const textoAlerta = errMsg.split("|")[1] || "Esta función requiere Plan Pro.";
            setMsgs(m=>[...m,{role:"assistant",text:"",ts:Date.now(),alerta:{tipo:"plan_free",texto:textoAlerta}}]);
          } else {
            setMsgs(m=>[...m,{role:"assistant",text:"No pude registrar el movimiento. Intenta de nuevo. 🔄",ts:Date.now()}]);
          }
        } finally {
          setLoading(false);
          callingRef.current = false;
          setTimeout(()=>inputRef.current?.focus(),100);
        }
        return;
      }
      if (cancelW.some(w => tl===w || tl.startsWith(w+" ") || tl.endsWith(" "+w))) {
        setMsgs(m=>[...m,{role:"user",text:txt,ts:Date.now()}]);
        pendingTxRef.current=null; setPendingTx(null);
        callingRef.current = false;
        setMsgs(m=>[...m,{role:"assistant",text:"Cancelado. ¿En qué más te ayudo?",ts:Date.now()}]);
        return;
      }
    }

    setMsgs(m=>[...m,{role:"user",text:txt,ts:Date.now()}]);
    setLoading(true);
    try {
      const result = await callChatIA({
        system: buildContext(),
        messages: [
          ...msgs.slice(-8).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text||" "})),
          {role:"user",content:txt}
        ],
      });
      const rawText = result.data?.text || "No pude procesar tu consulta. Intenta de nuevo.";
      if (result.data?.usoHoy != null) {
        const nuevoCount = result.data.usoHoy;
        const nuevoLimite = result.data.limite;
        setUsoHoy({ count: nuevoCount, limite: nuevoLimite, cargando: false });
        // ── Alertas de límite próximo ─────────────────────────────────────
        const restantes = nuevoLimite - nuevoCount;
        const umbralAlerta = isPro ? 10 : 2;
        if (restantes === umbralAlerta) {
          // Pequeño delay para que el usuario vea la respuesta primero
          setTimeout(() => {
            if (isPro) {
              alertWarning(
                `Te quedan ${restantes} mensajes hoy`,
                `Tu plan Pro incluye 70 mensajes diarios. Mañana se reinician automáticamente.`
              );
            } else {
              alertLimit(
                `Solo te quedan ${restantes} mensajes`,
                `Con el plan Free tienes 10 mensajes diarios. Activa el Plan Pro para tener 70 mensajes/día sin interrupciones.`,
                [
                  { label: "Ahora no", primary: false, onClick: () => {} },
                  { label: "⚡ Ver Plan Pro", primary: true, onClick: () => {} },
                ]
              );
            }
          }, 600);
        } else if (restantes === 0) {
          setTimeout(() => {
            if (isPro) {
              alertWarning(
                "Límite diario alcanzado",
                "Usaste tus 70 mensajes de hoy. El contador se reinicia mañana automáticamente."
              );
            } else {
              alertLimit(
                "Límite del plan Free",
                "Usaste tus 10 mensajes de hoy. Activa el Plan Pro para tener 70 mensajes/día o vuelve mañana.",
                [
                  { label: "Mañana vuelvo", primary: false, onClick: () => {} },
                  { label: "⚡ Activar Pro", primary: true, onClick: () => {} },
                ]
              );
            }
          }, 600);
        }
      }
      const {text:cleanText, txData} = parsearRespuesta(rawText);

      if (txData) {
        const montoFinal = parsearMonto(txData.amount||txData.monto);
        const esPagoProgr = txData._tipo==="PAGO_PROGRAMADO";
        const esGasto = !esPagoProgr && txData.tipo!=="ingreso" && txData.tipo!=="ingreso_extra";
        const sinFondos = esGasto && montoFinal > disponibleGastar;
        const esPrestamo = txData.cat === 'prestamo_tercero' || txData.tipo === 'prestamo_tercero';
        const necesitaConfirm = esPagoProgr || esPrestamo || sinFondos || montoFinal>=UMBRAL_GRANDE;
        const necesitaToast   = !necesitaConfirm && esGasto && montoFinal>=UMBRAL_MEDIO;

        if (necesitaConfirm) {
          // Validar plan Free antes de mostrar la card de confirmacion
          const esPrestamo2 = txData.cat === 'prestamo_tercero' || txData.tipo === 'prestamo_tercero';
          if (esPrestamo2 && !isPro) {
            const prestamosActuales = tx.filter(t => t.cat === 'prestamo_tercero').length;
            if (prestamosActuales >= 1) {
              setMsgs(m=>[...m,{role:"assistant",text:"",ts:Date.now(),
                alerta:{tipo:"plan_free",texto:"Ya usaste tu préstamo gratuito. Activa el Plan Pro para registrar más préstamos a terceros. ⚡"}}]);
              return;
            }
          }
          pendingTxRef.current=txData; setPendingTx(txData);
          setMsgs(m=>[...m,{role:"assistant",text:cleanText,ts:Date.now(),pendingTx:txData}]);
        } else if (necesitaToast) {
          const resultado = await ejecutarAccion(txData, montoFinal);
          setMsgs(m=>[...m,{role:"assistant",text:cleanText||"",ts:Date.now(),
            alerta:{tipo:"exito_aviso",...resultado,aviso:`${Math.round(montoFinal/Math.max(totalIngresoMes,1)*100)}% de tu ingreso mensual`}}]);
        } else {
          const resultado = await ejecutarAccion(txData, montoFinal);
          setMsgs(m=>[...m,{role:"assistant",text:cleanText||"",ts:Date.now(),alerta:{tipo:"exito",...resultado}}]);
        }
      } else {
        setMsgs(m=>[...m,{role:"assistant",text:cleanText,ts:Date.now()}]);
      }
    } catch(err) {
      callingRef.current = false;
      const msg = err?.message || err?.code || "";
      const esLimite = msg.includes("resource-exhausted") || msg.includes("Límite") || msg.includes("limite");
      if (msg.startsWith("PLAN_FREE:")) {
        const [, resto] = msg.split("PLAN_FREE:");
        const [, textoAlerta] = resto.split("|");
        setMsgs(m=>[...m,{role:"assistant",text:"",ts:Date.now(),alerta:{tipo:"plan_free",texto:textoAlerta||"Esta función requiere Plan Pro."}}]);
      } else if (esLimite) {
        // Alerta modal de límite alcanzado
        if (isPro) {
          alertWarning(
            "Límite diario alcanzado",
            "Usaste tus 70 mensajes de hoy. El contador se reinicia mañana automáticamente."
          );
        } else {
          alertLimit(
            "Límite del plan Free",
            "Usaste tus 10 mensajes de hoy. Activa el Plan Pro para tener 70 mensajes/día.",
            [
              { label: "Mañana vuelvo", primary: false, onClick: () => {} },
              { label: "⚡ Activar Pro", primary: true, onClick: () => {} },
            ]
          );
        }
        setMsgs(m=>[...m,{role:"assistant",
          text: isPro ? "Alcanzaste tus 70 mensajes de hoy 😅 Vuelve mañana." : "Alcanzaste tu límite diario 😅 Vuelve mañana o activa el plan Pro.",
          ts:Date.now()
        }]);
      } else {
        setMsgs(m=>[...m,{role:"assistant",
          text:"Tuve un problema. Intenta de nuevo. 🔄",
          ts:Date.now()
        }]);
      }
    } finally {
      setLoading(false);
      callingRef.current = false;
      setTimeout(()=>inputRef.current?.focus(),100);
    }
  }

  function enviar() {
    const txt = input.trim();
    if (!txt) return;
    setInput("");
    enviarTexto(txt);
  }

    const [escuchando, setEscuchando] = useState(false);
  const recognitionRef = useRef(null);

  function toggleVoz() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alertInfo("Voz no disponible", "Tu navegador no soporta reconocimiento de voz. Usa Chrome para activarlo."); return; }

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
      // Auto-enviar con el valor actual del ref
      setTimeout(() => {
        const val = inputRef.current?.value?.trim();
        if (val) {
          enviarTexto(val);
          setInput("");
        }
      }, 400);
    };
    rec.onerror = () => setEscuchando(false);

    recognitionRef.current = rec;
    rec.start();
  }
  // ── Parsear montos con K y M ─────────────────────────────────────────────

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
      ref={sw.overlayRef}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "flex-end", zIndex: 500,
        ...sw.overlayStyle,
      }}
    >
      <div
        ref={sw.cardRef}
        style={{
          width: "100%", maxWidth: 430, margin: "0 auto",
          background: C.card, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.border}`,
          height: "92vh", display: "flex", flexDirection: "column",
          position: "relative", overflow: "hidden",
          ...sw.cardStyle,
        }}
      >
        {/* Header con swipe */}
        <div
          {...sw.handleProps}
          style={{
            padding: "12px 20px 10px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            ...sw.handleProps.style,
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
            <div style={{ fontSize: 11, fontWeight: 600, display:"flex", alignItems:"center", gap:6, marginBottom: usoHoy!=null?4:0 }}>
              <span style={{color:C.emerald}}>● En línea · Claude</span>
            </div>
            {(()=>{
              if (usoHoy.cargando) {
                // Skeleton mientras carga — muestra el límite ya conocido pero count como "···"
                return (
                  <div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:10,fontWeight:700,color:C.indigo}}>Cargando mensajes···</span>
                      <span style={{fontSize:10,fontWeight:800,color:C.text.s}}>/{usoHoy.limite} hoy</span>
                    </div>
                    <div style={{height:4,borderRadius:99,background:`${C.indigo}22`,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:99,width:"0%",background:C.indigo}}/>
                    </div>
                  </div>
                );
              }
              const pct = usoHoy.count / usoHoy.limite;
              const agotado = usoHoy.count >= usoHoy.limite;
              const restantes = usoHoy.limite - usoHoy.count;
              const color = agotado ? "#ef4444" : pct>=0.7 ? "#f59e0b" : C.indigo;
              return (
                <div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:10,fontWeight:700,color:color}}>
                      {agotado ? "⚠️ Límite alcanzado" : `${usoHoy.count} de ${usoHoy.limite} mensajes hoy`}
                    </span>
                    <span style={{fontSize:10,fontWeight:800,color:color}}>
                      {agotado ? "Vuelve mañana" : `${restantes} restante${restantes!==1?"s":""}`}
                    </span>
                  </div>
                  <div style={{height:4,borderRadius:99,background:`${color}22`,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:99,width:`${Math.min(pct*100,100)}%`,background:color,transition:"width 0.4s ease"}}/>
                  </div>
                </div>
              );
            })()}
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
                {m.alerta && (m.alerta.tipo === "exito" || m.alerta.tipo === "exito_aviso") && (
                  <div style={{padding:"14px 16px", background:`${m.alerta.color}15`, borderLeft:`4px solid ${m.alerta.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:20}}>✅</span>
                      <span style={{fontSize:14,fontWeight:800,color:m.alerta.color}}>¡Registrado!</span>
                    </div>
                    <div style={{fontSize:13,color:C.text.h,fontWeight:600}}>{m.alerta.desc}</div>
                    <div style={{fontSize:18,fontWeight:900,color:m.alerta.color,marginTop:2}}>{COP(m.alerta.monto)}</div>
                    {m.alerta.aviso && <div style={{marginTop:6,padding:"6px 8px",background:`${m.alerta.color}22`,borderRadius:6,fontSize:11,color:m.alerta.color,fontWeight:700}}>⚡ {m.alerta.aviso}</div>}
                    <div style={{fontSize:11,color:C.text.s,marginTop:4}}>Ya aparece en tus movimientos</div>
                  </div>
                )}
                {m.alerta && m.alerta.tipo === "plan_free" && (
                  <div style={{padding:"14px 16px", background:"#6366f115", borderLeft:"4px solid #6366f1"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>⚡</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#6366f1"}}>Función Plan Pro</span>
                    </div>
                    <div style={{fontSize:12,color:C.text.h,lineHeight:1.6,marginBottom:10}}>
                      {m.alerta.texto}
                    </div>
                    <button
                      onClick={onClose}
                      style={{width:"100%",padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
                        background:"linear-gradient(135deg,#6366f1,#4338ca)",
                        color:"#fff",fontSize:13,fontWeight:800}}>
                      🚀 Ver Plan Pro
                    </button>
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
                {/* Card de confirmación para tx pendiente - solo resumen en el chat */}
                {m.pendingTx && (
                  <div style={{
                    marginTop: 12, borderRadius: 16, overflow: "hidden",
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                  }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg,${C.indigo},${C.violet})` }}/>
                    <div style={{ padding: "14px 16px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                        <div style={{ width:30, height:30, borderRadius:10,
                          background:`linear-gradient(135deg,${C.indigo}22,${C.violet}22)`,
                          border:`1px solid ${C.indigo}33`,
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📋</div>
                        <div style={{ fontSize:10, fontWeight:800, color:C.text.s, letterSpacing:1.4, textTransform:"uppercase" }}>Confirmar movimiento</div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.text.h, marginBottom:4, lineHeight:1.3 }}>
                        {m.pendingTx.desc || "Sin descripción"}
                      </div>
                      <div style={{ fontSize:26, fontWeight:900, letterSpacing:-1, marginBottom:2,
                        background:`linear-gradient(135deg,${C.indigo},${C.violet})`,
                        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                        {COP(parsearMonto(m.pendingTx.amount || m.pendingTx.monto))}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:10, padding:"0 14px 14px" }}>
                      <button onClick={() => enviarTexto("si")} style={{
                        flex:1, padding:"11px 0",
                        background:`linear-gradient(135deg,${C.indigo},${C.violet})`,
                        border:"none", borderRadius:12,
                        cursor:"pointer", fontSize:14, fontWeight:700, color:"#fff",
                        display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                        boxShadow:`0 4px 12px ${C.indigo}44`,
                      }}>
                        ✔️ Confirmar
                      </button>
                      <button onClick={() => enviarTexto("no")} style={{
                        flex:1, padding:"11px 0",
                        background:"transparent",
                        border:`1.5px solid ${C.border}`,
                        borderRadius:12,
                        cursor:"pointer", fontSize:14, fontWeight:700, color:C.text.s,
                        display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                      }}>
                        ✖ Cancelar
                      </button>
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