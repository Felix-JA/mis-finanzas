import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { InsightsEngine } from "./InsightsEngine";
import { FinancialScore } from "./FinancialScore";
import { MonthlyProjection } from "./MonthlyProjection";
import { getSuggestedBudgets, BudgetSetupBanner, BudgetHealth } from "./BudgetEngine";
import { BudgetSetupModal } from "./BudgetSetupModal";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  getDoc, setDoc, getDocs
} from "firebase/firestore";

// ─── TEMAS OSCUROS ────────────────────────────────────────────────────────────
const TEMAS = {
  // Azul marino — tema original
  navy: {
    bg:"#080e1e", card:"#0d1117",
    surface:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.08)", borderStrong:"rgba(255,255,255,0.18)",
    indigo:"#6366f1", indigoLight:"#818cf8",
    emerald:"#10b981", emeraldLight:"#34d399",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#f1f5f9", b:"#a8b8cc", s:"#6b7f96", m:"#6b7f96" },
    label:"🌊 Azul marino", desc:"El clásico",
  },
  // Negro puro — AMOLED
  black: {
    bg:"#000000", card:"#0a0a0a",
    surface:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.09)", borderStrong:"rgba(255,255,255,0.2)",
    indigo:"#7c3aed", indigoLight:"#a78bfa",
    emerald:"#10b981", emeraldLight:"#34d399",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#ffffff", b:"#b0c0d0", s:"#606f80", m:"#606f80" },
    label:"🖤 Midnight", desc:"Ahorra batería AMOLED",
  },
  // Verde oscuro — bosque
  forest: {
    bg:"#061210", card:"#0a1f1c",
    surface:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.08)", borderStrong:"rgba(255,255,255,0.18)",
    indigo:"#059669", indigoLight:"#34d399",
    emerald:"#10b981", emeraldLight:"#6ee7b7",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#ecfdf5", b:"#a7c4bc", s:"#5f8a82", m:"#5f8a82" },
    label:"🌿 Bosque", desc:"Verde oscuro relajante",
  },
  // ─── TEMAS CLAROS ────────────────────────────────────────────────────────
  // Perla — blanco puro con acentos índigo (tipo Apple Wallet / Linear)
  pearl: {
    isLight: true,
    bg:"#f7f8fa", card:"#ffffff",
    surface:"rgba(15,23,42,0.03)", border:"rgba(15,23,42,0.06)", borderStrong:"rgba(15,23,42,0.14)",
    indigo:"#4f46e5", indigoLight:"#6366f1",
    emerald:"#059669", emeraldLight:"#10b981",
    amber:"#d97706", red:"#dc2626", violet:"#7c3aed", sky:"#0284c7",
    text:{ h:"#0f172a", b:"#475569", s:"#94a3b8", m:"#94a3b8" },
    label:"🤍 Perla", desc:"Blanco limpio y minimalista",
  },
  // Arena — beige cálido (estilo Notion claro)
  sand: {
    isLight: true,
    bg:"#faf7f2", card:"#ffffff",
    surface:"rgba(87,45,10,0.03)", border:"rgba(87,45,10,0.08)", borderStrong:"rgba(87,45,10,0.18)",
    indigo:"#b45309", indigoLight:"#d97706",
    emerald:"#059669", emeraldLight:"#10b981",
    amber:"#c2410c", red:"#b91c1c", violet:"#7c3aed", sky:"#0369a1",
    text:{ h:"#422006", b:"#78350f", s:"#a16207", m:"#a16207" },
    label:"🌸 Arena", desc:"Cálido y acogedor",
  },
  // Bruma — gris azulado suave (estilo Revolut Light)
  mist: {
    isLight: true,
    bg:"#eef2f6", card:"#ffffff",
    surface:"rgba(30,58,95,0.03)", border:"rgba(30,58,95,0.08)", borderStrong:"rgba(30,58,95,0.18)",
    indigo:"#3730a3", indigoLight:"#4f46e5",
    emerald:"#047857", emeraldLight:"#059669",
    amber:"#b45309", red:"#b91c1c", violet:"#6d28d9", sky:"#0369a1",
    text:{ h:"#0f172a", b:"#334155", s:"#64748b", m:"#64748b" },
    label:"🌫️ Bruma", desc:"Gris azulado elegante",
  },
};
const DARK = TEMAS.navy; // alias para compatibilidad
// C es mutable — se actualiza al cambiar tema
const C = {...DARK};

// ─── HELPER DE TINTA ADAPTATIVA ───────────────────────────────────────────────
// Devuelve rgba(blanco) en oscuro o rgba(slate) en claro. Usa C.isLight (lectura
// dinámica) para responder a cambios de tema sin re-ejecutar nada.
// Reemplaza `rgba(255,255,255,op)` hardcodeado por `ink(op)` donde sea crítico.
function ink(opacity=1){
  return C.isLight
    ? `rgba(15,23,42,${opacity})`
    : `rgba(255,255,255,${opacity})`;
}

// ─── DESIGN SYSTEM (Fase 2D) ──────────────────────────────────────────────────
// Sistema centralizado de elevación, superficies y tipografía.
// Todas las funciones leen C.isLight dinámicamente — responden al cambio de tema.
// ─────────────────────────────────────────────────────────────────────────────

// Niveles de elevación (sombras) — 3 niveles controlados
// flat  → sin sombra (listas, insights, items planos)
// card  → flotación sutil (cards normales)
// raised → hero, saldo, alertas críticas (único lugar con 3D notable)
function elev(level="card"){
  if(C.isLight){
    if(level==="flat")   return "none";
    if(level==="card")   return "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)";
    if(level==="raised") return "0 10px 40px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)";
  } else {
    if(level==="flat")   return "none";
    if(level==="card")   return "0 2px 8px rgba(0,0,0,0.25)";
    if(level==="raised") return "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)";
  }
  return "none";
}

// Superficies de fondo — glass adaptativo
// glass     → card base, fondo semi-transparente
// glassHi   → card con un poco más de presencia
// glassLow  → fondo más sutil, para contenedores anidados
function surface(tone="glass"){
  if(C.isLight){
    if(tone==="glass")    return "rgba(255,255,255,0.75)";
    if(tone==="glassHi")  return "rgba(255,255,255,0.9)";
    if(tone==="glassLow") return "rgba(15,23,42,0.02)";
  } else {
    if(tone==="glass")    return "rgba(255,255,255,0.03)";
    if(tone==="glassHi")  return "rgba(255,255,255,0.05)";
    if(tone==="glassLow") return "rgba(255,255,255,0.02)";
  }
  return "transparent";
}

// Borde adaptativo — consistente en claro/oscuro
// subtle → bordes casi invisibles (cards glass)
// normal → bordes visibles (inputs, botones)
function stroke(weight="subtle"){
  if(C.isLight){
    if(weight==="subtle") return "rgba(15,23,42,0.06)";
    if(weight==="normal") return "rgba(15,23,42,0.10)";
    if(weight==="strong") return "rgba(15,23,42,0.18)";
  } else {
    if(weight==="subtle") return "rgba(255,255,255,0.06)";
    if(weight==="normal") return "rgba(255,255,255,0.10)";
    if(weight==="strong") return "rgba(255,255,255,0.18)";
  }
}

// Escala tipográfica — 6 niveles consistentes
// Nota: devuelven objetos de estilo para hacer `style={{...T.title, color: ...}}`
const T = {
  display:  {fontSize:46, fontWeight:900, letterSpacing:-2.5, lineHeight:1},
  title:    {fontSize:22, fontWeight:800, letterSpacing:-0.5, lineHeight:1.2},
  heading:  {fontSize:16, fontWeight:700, letterSpacing:-0.2, lineHeight:1.3},
  body:     {fontSize:14, fontWeight:500, letterSpacing:0, lineHeight:1.5},
  caption:  {fontSize:12, fontWeight:500, letterSpacing:0.1, lineHeight:1.4},
  micro:    {fontSize:10, fontWeight:700, letterSpacing:1.2, lineHeight:1.2, textTransform:"uppercase"},
};

// Helper para cards glass estándar — simplifica la creación de cards consistentes
// Uso: style={{...glassCard(), padding: 20}} o style={{...glassCard({raised:true})}}
function glassCard({raised=false, tone="glass", borderWeight="subtle"}={}){
  return {
    background: surface(tone),
    border: `1px solid ${stroke(borderWeight)}`,
    borderRadius: 20,
    boxShadow: elev(raised ? "raised" : "card"),
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };
}


// ─── ESTILO DE CARD GLOBAL ───────────────────────────────────────────────────
// "solid"    → C.card sólido + sombra (default premium)
// "glass"    → glass sutil + blur
// "gradient" → gradient suave con tinte de color
// "classic"  → gradient saturado + orbs 3D (estilo original)
const CS = { style: "solid" };

function cardSurface(accentColor){
  const acc = accentColor || C.indigo;
  if(CS.style==="glass") return { background:surface("glassHi"), backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)" };
  if(CS.style==="gradient") return { background:`linear-gradient(145deg,${acc}14 0%,${C.card} 70%)` };
  if(CS.style==="classic") return { background:`linear-gradient(135deg,${acc}20 0%,${acc}08 55%,${C.bg} 100%)` };
  return { background:C.card };
}
function cardShadow(accentColor){
  const acc = accentColor || C.indigo;
  if(CS.style==="glass") return elev("card");
  if(CS.style==="gradient") return `0 8px 24px ${acc}20`;
  if(CS.style==="classic") return `0 20px 60px rgba(0,0,0,0.4), 0 4px 16px ${acc}44, inset 0 1px 0 rgba(255,255,255,0.08)`;
  return elev("card");
}
function cardBorder(accentColor){
  const acc = accentColor || C.indigo;
  if(CS.style==="classic") return `1px solid ${acc}44`;
  if(CS.style==="gradient") return `1px solid ${acc}28`;
  return "1px solid transparent";
}
function GradientOrbs({color}){
  if(CS.style!=="classic") return null;
  const acc = color || C.indigo;
  return <>
    <div style={{position:"absolute",top:-60,right:-40,width:180,height:180,borderRadius:"50%",background:`${acc}14`,pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:-30,left:-20,width:120,height:120,borderRadius:"50%",background:`${acc}10`,pointerEvents:"none"}}/>
  </>;
}

const MAIN_CATS = [
  { id:"comida",     label:"Comida",    labelFull:"Comida",                  icon:"🍽️", color:"#facc15",
    subs:[{id:"desayuno",label:"Desayuno",icon:"🍳"},{id:"almuerzo",label:"Almuerzo",icon:"🍱"},{id:"domicilios",label:"Domicilios",icon:"🛵"},{id:"mercado",label:"Mercado",icon:"🛒"},{id:"snacks",label:"Snacks",icon:"🧃"}]},
  { id:"hogar",      label:"Hogar",     labelFull:"Hogar",                   icon:"🏠", color:"#60a5fa",
    subs:[{id:"arriendo",label:"Arriendo",icon:"🏠"},{id:"servicios",label:"Servicios",icon:"💡"},{id:"aseo",label:"Aseo",icon:"🧹"},{id:"reparaciones",label:"Reparaciones",icon:"🔧"},{id:"electro",label:"Electro",icon:"📺"}]},
  { id:"transporte", label:"Transp.",   labelFull:"Transporte",              icon:"🚗", color:"#34d399",
    subs:[{id:"bus",label:"Bus/Metro",icon:"🚌"},{id:"taxi",label:"Taxi/Uber",icon:"🚕"},{id:"peaje",label:"Peaje",icon:"🛣️"},{id:"pasajes",label:"Pasajes",icon:"🎫"},{id:"mudanza",label:"Mudanza",icon:"📦"}]},
  { id:"vehiculo",   label:"Vehículo",  labelFull:"Vehículo",                icon:"🏍️", color:"#fb923c",
    subs:[{id:"gasolina",label:"Gasolina",icon:"⛽"},{id:"soat",label:"SOAT/Seguro",icon:"📋"},{id:"mecanica",label:"Mecánica",icon:"🛠️"},{id:"parqueadero",label:"Parqueadero",icon:"🅿️"},{id:"repuestos",label:"Repuestos",icon:"🔩"}]},
  { id:"salud",      label:"Salud",     labelFull:"Salud y Bienestar",       icon:"🩺", color:"#f87171",
    subs:[{id:"medico",label:"Médico",icon:"🏥"},{id:"medicamentos",label:"Medicinas",icon:"💊"},{id:"gym",label:"Fitness",icon:"🏃"},{id:"psicologia",label:"Psicología",icon:"🧠"},{id:"optica",label:"Óptica",icon:"👓"}]},
  { id:"ocio",       label:"Ocio",      labelFull:"Entretenimiento",         icon:"🎭", color:"#e879f9",
    subs:[{id:"salidas",label:"Salidas",icon:"🥂"},{id:"eventos",label:"Eventos",icon:"🎟️"},{id:"viajes",label:"Viajes",icon:"✈️"},{id:"hobbies",label:"Hobbies",icon:"🎨"},{id:"regalos",label:"Regalos",icon:"🎁"}]},
  { id:"estilo",     label:"Estilo",    labelFull:"Ropa y Estilo",           icon:"👔", color:"#a78bfa",
    subs:[{id:"ropa",label:"Ropa",icon:"👔"},{id:"calzado",label:"Calzado",icon:"👟"},{id:"accesorios",label:"Accesorios",icon:"⌚"},{id:"peluqueria",label:"Peluquería",icon:"✂️"},{id:"cuidado",label:"Cuidado",icon:"🧴"}]},
  { id:"digital",    label:"Digital",   labelFull:"Digital y Suscripciones", icon:"📱", color:"#38bdf8",
    subs:[{id:"streaming",label:"Streaming",icon:"📺"},{id:"apps",label:"Suscripciones",icon:"📲"},{id:"tecnologia",label:"Tecnología",icon:"💻"},{id:"ia",label:"IA",icon:"🤖"},{id:"juegos",label:"Juegos",icon:"🎮"}]},
  { id:"deudas",     label:"Deudas",    labelFull:"Deudas",                  icon:"💳", color:"#f43f5e",
    subs:[{id:"tarjeta",label:"Tarjeta",icon:"💳"},{id:"cuotas",label:"Cuotas",icon:"📅"},{id:"credito",label:"Crédito",icon:"🏦"}]},
  { id:"educacion",  label:"Educación", labelFull:"Educación",               icon:"📚", color:"#818cf8",
    subs:[{id:"universidad",label:"Universidad",icon:"🎓"},{id:"cursos",label:"Cursos",icon:"💡"},{id:"utiles",label:"Útiles",icon:"✏️"},{id:"colegio",label:"Colegio",icon:"🏫"},{id:"certificados",label:"Certificados",icon:"📜"}]},
  { id:"mascotas",   label:"Mascotas",  labelFull:"Mascotas",                icon:"🐾", color:"#4ade80",
    subs:[{id:"comida_mascota",label:"Comida",icon:"🦴"},{id:"veterinario",label:"Veterinario",icon:"🏥"},{id:"peluqueria_mascota",label:"Peluquería",icon:"✂️"},{id:"medicamentos_mascota",label:"Medicamentos",icon:"💊"}]},
];
// Solo "ingreso" es categoría especial — suma al saldo
// Las metas son el único concepto de ahorro (unificado)
const INCOME_CAT = {id:"ingreso",label:"Ingreso",icon:"💵",color:"#10b981"};
const DEVOLUCION_CAT = {id:"prestamo_devuelto",label:"Devolución préstamo",icon:"🤝",color:"#10b981"};
const EXTRA_CAT = {id:"ingreso_extra",label:"Ingreso extra",icon:"💫",color:"#f59e0b"};
function isIngreso(cat){ return cat==="ingreso"; }
function isDevolucion(cat){ return cat==="prestamo_devuelto"; }
function isIngresoExtra(cat){ return cat==="ingreso_extra"; } // suma al disponible, NO al salario
function isPrestamoTercero(cat){ return cat==="prestamo_tercero"; } // préstamo a tercero — NO es gasto, es dinero que volverá
function isAporteMeta(t){ return !!t.goalId; }
function isGasto(cat){ return !isIngreso(cat) && !isDevolucion(cat) && !isIngresoExtra(cat) && !isPrestamoTercero(cat) && cat!=="meta_aporte"; }
// Compatibilidad legacy: emergencias era categoría, ahora es meta especial
function isSavingsLegacy(cat){ return cat==="emergencias"||cat==="meta_aporte"; }
const ALL_SUBS = MAIN_CATS.flatMap(m=>m.subs.map(s=>({...s,mainId:m.id,color:m.color})));

// Lookup mutable para subcategorías personalizadas — se sincroniza desde App() vía useEffect
// Estructura: { [mainId]: [{id, label, icon, mainId, color}] }
const _customSubsLookup = {};

function getCatInfo(id) {
  if(id==="ingreso") return INCOME_CAT;
  if(id==="prestamo_devuelto") return DEVOLUCION_CAT;
  if(id==="ingreso_extra") return EXTRA_CAT;
  if(id==="prestamo_tercero") return {id:"prestamo_tercero",label:"Préstamo a tercero",icon:"🤝",color:"#f59e0b"};
  if(id==="emergencias") return {id:"emergencias",label:"Fondo Emergencias",icon:"🛡️",color:C.sky};
  if(id==="meta_aporte") return {id:"meta_aporte",label:"Aporte a Meta",icon:"⭐",color:C.indigo};
  // Buscar en subcategorías personalizadas (✦)
  for(const mainId of Object.keys(_customSubsLookup)){
    const found=_customSubsLookup[mainId]?.find(s=>s.id===id);
    if(found) return found;
  }
  // Buscar en subcategorías con labelFull del padre para mostrar en movimientos
  const sub=ALL_SUBS.find(s=>s.id===id);
  if(sub) return sub;
  // Legacy / fallback
  const legacy={
    gym:{label:"Fitness",icon:"🏃",color:"#f97316"},
    suplementos:{label:"Suplementos",icon:"💪",color:"#fb923c"},
    servicios:{label:"Servicios",icon:"💡",color:"#38bdf8"},
    comida:{label:"Comida",icon:"🍽️",color:"#facc15"},
    salidas:{label:"Salidas",icon:"🥂",color:"#e879f9"},
    ropa:{label:"Ropa",icon:"👔",color:"#a78bfa"},
    belleza:{label:"Belleza/Estética",icon:"✂️",color:"#a78bfa"},
    transporte:{label:"Transporte",icon:"🚌",color:"#34d399"},
    nu:{label:"Cajita Nu",icon:"💚",color:"#10b981"},
    juegos:{label:"Juegos",icon:"🎮",color:"#e879f9"},
    streaming:{label:"Streaming",icon:"📺",color:"#38bdf8"},
    tecnologia:{label:"Tecnología",icon:"💻",color:"#38bdf8"},
    educacion:{label:"Educación",icon:"📚",color:"#94a3b8"},
    mascotas:{label:"Mascotas",icon:"🐾",color:"#94a3b8"},
    otros:{label:"Otros",icon:"📦",color:"#94a3b8"},
    prestamo:{label:"Préstamo",icon:"🏦",color:"#f43f5e"},
    credito:{label:"Crédito",icon:"📝",color:"#f43f5e"},
    accesorios:{label:"Accesorios",icon:"⌚",color:"#a78bfa"},
    calzado:{label:"Calzado",icon:"👟",color:"#a78bfa"},
  };
  return legacy[id] || (id?.startsWith("custom_") ? {label:"Personalizada",icon:"✦",color:"#94a3b8"} : {label:id,icon:"📦",color:"#94a3b8"});
}
// ─── EMOJIS PARA METAS ────────────────────────────────────────────────────────
const GOAL_EMOJIS = [
  "🏍️","🚗","📱","💻","🏠","✈️","🎮","📷","⌚","🎸",
  "👟","👗","🏋️","🌴","💍","🎓","🏦","🛒","🎁","🐕",
  "🏖️","🎺","⚽","🏄","💰","🌟","🔑","🎪","🎯","🚀",
];

const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const now = new Date();
const COP = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n);
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const isMonth = (s,m,y) => { const[sy,sm]=s.split('-').map(Number); return (sm-1)===m&&sy===y; };
// parseDateSafe: evita bug de zona horaria — new Date("2026-04-01") da Mar 31 en UTC-5
function parseDateSafe(str){
  if(!str||typeof str!=='string')return new Date();
  const[y,m,d]=str.split('-').map(Number);
  return new Date(y,(m||1)-1,d||1);
}

// ─── FRASES MOTIVADORAS CON NOMBRE ───────────────────────────────────────────
// Aleatorias pero coherentes con el % de progreso — menciona el nombre de la meta
const FRASES = {
  inicio: [
    n=>`💫 El primer paso hacia ${n}`,
    n=>`💫 ¡Empieza tu camino a ${n}!`,
    n=>`✨ ${n} te está esperando`,
    n=>`🎯 Cada peso te acerca a ${n}`,
  ],
  cuarto: [
    n=>`🚀 ¡Ya arrancaste con ${n}!`,
    n=>`🚀 ${n} cada vez más cerca`,
    n=>`💪 Tomando impulso hacia ${n}`,
    n=>`⚡ ¡Vas bien con ${n}!`,
  ],
  mitad: [
    n=>`💪 Mitad del camino a ${n}`,
    n=>`🔥 Más de la mitad — ¡a por ${n}!`,
    n=>`💪 ¡Imparable hacia ${n}!`,
    n=>`⚡ ${n} ya está a la vista`,
  ],
  final: [
    n=>`🔥 ¡Ya casi tienes tu ${n}!`,
    n=>`🔥 La recta final — ¡${n} es tuyo!`,
    n=>`🏁 ¡Falta poco para ${n}!`,
    n=>`⚡ ¡${n} está a un paso!`,
  ],
  lograda: [
    n=>`🏆 ¡Lograste tu ${n}!`,
    n=>`🎉 ¡${n} es tuyo — lo lograste!`,
    n=>`🏆 ¡Meta ${n} completada!`,
    n=>`🎊 ¡Conseguiste tu ${n}!`,
  ],
};

// Semilla por nombre para que la frase sea consistente por meta (no cambia en cada render)
function getFrase(pct, nombre) {
  const seed = nombre.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  let arr;
  if (pct >= 1)    arr = FRASES.lograda;
  else if (pct >= 0.75) arr = FRASES.final;
  else if (pct >= 0.5)  arr = FRASES.mitad;
  else if (pct >= 0.25) arr = FRASES.cuarto;
  else              arr = FRASES.inicio;
  const fn = arr[seed % arr.length];
  return fn(nombre);
}

// Color y gradiente del header según progreso
function goalColor(pct) {
  if (pct >= 1)    return C.emerald;
  if (pct >= 0.75) return C.violet;
  if (pct >= 0.5)  return C.indigo;
  if (pct >= 0.25) return "#f97316";
  return C.sky;
}
function goalGradient(pct) {
  if (pct >= 1)    return "linear-gradient(135deg,#052e16 0%,#064e3b 100%)";
  if (pct >= 0.75) return "linear-gradient(135deg,#1e1b4b 0%,#2e1065 100%)";
  if (pct >= 0.5)  return "linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)";
  if (pct >= 0.25) return "linear-gradient(135deg,#431407 0%,#7c2d12 100%)";
  return "linear-gradient(135deg,#0c1445 0%,#1e3a5f 100%)";
}

function useCountUp(target,ms=900){
  const [v,setV]=useState(target),prev=useRef(target),raf=useRef(null);
  useEffect(()=>{
    cancelAnimationFrame(raf.current);
    const from=prev.current; prev.current=target;
    if(from===target) return;
    const t0=Date.now();
    // Easing: easeOutExpo — arranca rápido, termina suave
    const ease=p=>p===1?1:1-Math.pow(2,-10*p);
    const tick=()=>{
      const p=Math.min((Date.now()-t0)/ms,1);
      setV(Math.round(from+(target-from)*ease(p)));
      if(p<1) raf.current=requestAnimationFrame(tick);
      else setV(target);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[target]);
  return v;
}

// ─── RIPPLE EFFECT ────────────────────────────────────────────────────────────
function useRipple(){
  const [ripples,setRipples]=useState([]);
  const trigger=(e)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    const x=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
    const y=(e.touches?e.touches[0].clientY:e.clientY)-rect.top;
    const id=Date.now();
    setRipples(r=>[...r,{id,x,y}]);
    setTimeout(()=>setRipples(r=>r.filter(r=>r.id!==id)),600);
  };
  return {trigger,ripples};
}
function Ripple({ripples,color}){
  return <>{ripples.map(r=>(
    <div key={r.id} style={{
      position:"absolute",left:r.x,top:r.y,
      width:8,height:8,borderRadius:"50%",
      background:color||ink(0.15),
      transform:"translate(-50%,-50%) scale(0)",
      animation:"ripple 0.6s ease-out forwards",
      pointerEvents:"none",zIndex:0,
    }}/>
  ))}</>;
}


function Ring({pct,size=56,stroke=5,color=C.emerald,label}){
  const r=(size-stroke)/2,c2=2*Math.PI*r;
  return <svg width={size} height={size} style={{flexShrink:0}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.surface} strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeDasharray={c2} strokeDashoffset={c2*(1-Math.min(pct,1))} strokeLinecap="round"
      transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.8s ease"}}/>
    {label!==undefined&&<text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
      fill={color} fontSize={size*0.18} fontWeight="bold" fontFamily="DM Sans,sans-serif">{label}</text>}
  </svg>;
}

function Bar({pct,color,h=5}){
  return <div style={{background:C.border,borderRadius:99,height:h,overflow:"hidden"}}>
    <div style={{height:h,borderRadius:99,background:color,width:`${Math.min(pct*100,100)}%`,transition:"width 0.7s ease"}}/>
  </div>;
}

function Card({children,style={},glow}){
  return <div style={{
    background:C.surface,
    borderRadius:18,
    padding:16,
    border:`1px solid ${C.border}`,
    boxShadow:glow?`0 0 0 1px ${glow}40, 0 8px 32px rgba(0,0,0,0.4)`:"0 2px 12px rgba(0,0,0,0.3)",
    ...style
  }}>{children}</div>;
}
// ─── SHIMMER LOADING ─────────────────────────────────────────────────────────
function Shimmer({w="100%",h=16,r=8,mb=0}){
  return <div style={{
    width:w, height:h, borderRadius:r, marginBottom:mb,
    background:C.isLight
      ? "linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%)"
      : "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
    backgroundSize:"200% 100%",
    animation:"shimmer 1.4s ease infinite",
  }}/>;
}
function ShimmerHome(){
  return <div style={{padding:"16px 20px"}}>
    <div style={{background:C.card,borderRadius:24,padding:"32px 24px 26px",marginBottom:24,boxShadow:elev("card")}}>
      <Shimmer h={10} w="45%" r={6} mb={16}/>
      <Shimmer h={52} w="75%" r={10} mb={24}/>
      <Shimmer h={3} r={99} mb={12}/>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Shimmer h={10} w="35%" r={6}/><Shimmer h={10} w="20%" r={6}/>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
      {[0,1].map(i=><div key={i} style={{background:C.card,borderRadius:20,padding:"20px 18px",boxShadow:elev("card")}}>
        <Shimmer h={10} w="50%" r={6} mb={12}/><Shimmer h={24} w="80%" r={8} mb={6}/><Shimmer h={9} w="60%" r={6}/>
      </div>)}
    </div>
    <Shimmer h={10} w="35%" r={6} mb={12}/>
    {[0,1,2].map(i=><div key={i} style={{background:C.card,borderRadius:18,padding:"14px 16px",marginBottom:10,display:"flex",gap:12,alignItems:"center",boxShadow:elev("card")}}>
      <Shimmer w={44} h={44} r={14}/><div style={{flex:1}}><Shimmer h={11} w="80%" r={6} mb={8}/><Shimmer h={9} w="60%" r={6}/></div>
    </div>)}
  </div>;
}

function Lbl({children,style={}}){
  return <div style={{
    fontSize:11,color:C.text.b,letterSpacing:1.2,fontWeight:700,
    textTransform:"uppercase",marginBottom:8,...style
  }}>{children}</div>;
}

// ─── Helpers para modales tipo bottom-sheet (× + swipe down) ─────────────────
// Uso: const sheet = useSheetDismiss(onClose);
// En el card: style={{ ...sheet.cardStyle }} + {...sheet.dragProps}
// En el handle: {...sheet.handleProps}
function useSheetDismiss(onClose){
  const cardRef=useRef(null);
  const startY=useRef(null);
  const startT=useRef(null);
  const curY=useRef(0);
  const isDragging=useRef(false);

  function setTransform(y){
    if(cardRef.current){
      cardRef.current.style.transform=`translateY(${y}px)`;
      cardRef.current.style.transition=y===0?"transform 0.25s cubic-bezier(0.32,0.72,0,1)":"none";
    }
  }

  function onStart(clientY){
    startY.current=clientY;
    startT.current=Date.now();
    curY.current=0;
    isDragging.current=true;
  }
  function onMove(clientY){
    if(!isDragging.current||startY.current===null) return;
    const d=clientY-startY.current;
    if(d>0){curY.current=d;setTransform(d);}
  }
  function onEnd(){
    if(!isDragging.current) return;
    isDragging.current=false;
    const elapsed=Date.now()-startT.current;
    const dist=curY.current;
    const velocity=dist/Math.max(elapsed,1)*1000;
    if(dist>100||velocity>400){
      // Animar salida y cerrar
      setTransform(window.innerHeight);
      setTimeout(onClose,220);
    } else {
      setTransform(0);
    }
    startY.current=null;
    curY.current=0;
  }

  const handleProps={
    onTouchStart:e=>onStart(e.touches[0].clientY),
    onTouchMove:e=>onMove(e.touches[0].clientY),
    onTouchEnd:onEnd,
    style:{cursor:"grab",touchAction:"none"},
  };

  const dragProps={
    onTouchStart:e=>{
      const el=e.currentTarget;
      if(el.scrollTop===0) onStart(e.touches[0].clientY);
    },
    onTouchMove:e=>{
      if(startY.current===null) return;
      const d=e.touches[0].clientY-startY.current;
      if(d>8) onMove(e.touches[0].clientY);
    },
    onTouchEnd:onEnd,
  };

  // cardStyle solo para la animación de entrada — el drag lo maneja el ref directamente
  const cardStyle={animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)"};
  return {handleProps,dragProps,cardStyle,cardRef,dragY:0};
}

function SheetCloseBtn({onClose,top=14,right=14}){
  return <button onClick={onClose} aria-label="Cerrar"
    style={{position:"absolute",top,right,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,width:32,height:32,cursor:"pointer",color:C.text.b,fontSize:18,fontWeight:700,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,transition:"all 0.15s"}}
    onMouseEnter={e=>{e.currentTarget.style.background=`${C.red}22`;e.currentTarget.style.color=C.red;}}
    onMouseLeave={e=>{e.currentTarget.style.background=C.surface;e.currentTarget.style.color=C.text.b;}}>×</button>;
}

// ─── MODAL CATEGORÍAS PERSONALIZADAS ─────────────────────────────────────────
// Función global — tiene sus propios useState internos (regla de hooks OK)
const CAT_CUSTOM_ICONS = [
  // Comida y bebidas
  "🍕","🍔","🌮","🍜","🍣","🥗","🍱","🧃","☕","🍺",
  // Transporte y movilidad
  "🚗","🏍️","🚌","✈️","⛽","🅿️","🚕","🛵","🚲","🛺",
  // Hogar y servicios
  "💧","💡","📺","🛒","🧹","🔧","🏠","📦","🛏️","🧺",
  // Salud y bienestar
  "💊","🏥","🧴","💆","🏋️","🧘","🦷","👓","💉","🩺",
  // Ropa y estilo
  "👔","👟","👗","👜","⌚","💄","🧣","🎒","💍","🕶️",
  // Ocio y entretenimiento
  "🎮","🎬","🎵","🏖️","⚽","🎭","🎨","🎸","🎯","🎲",
  // Digital y suscripciones
  "📱","💻","📡","🖥️","🎧","📷","🖨️","⌨️","📲","🔋",
  // Finanzas y pagos
  "💳","🏦","💰","📊","💵","🏧","📈","🧾","💹","🏷️",
  // Mascotas y familia
  "🐕","🐈","👶","🎁","🎂","🌸","🧸","🪴","🐾","❤️",
  // Otros útiles
  "📚","✏️","🔑","🧰","⚙️","🪑","🏡","🌿","☀️","🛡️",
];
function CatPersonalModal({main, catsCustom, handleCatCustomSave, onClose}){
  const existing = catsCustom[main.id] || [];
  const [extras, setExtras] = useState(existing.slice(0,3));
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const sheet = useSheetDismiss(onClose);

  function addSub(){
    const label = newLabel.trim();
    if(!label || extras.length >= 3) return;
    const id = `custom_${main.id}_${Date.now()}`;
    setExtras(prev => [...prev, {id, label, icon: newIcon}]);
    setNewLabel(""); setNewIcon("⭐"); setShowIconPicker(false);
  }
  function removeSub(id){ setExtras(prev => prev.filter(s => s.id !== id)); }
  function save(){ handleCatCustomSave(main.id, extras); onClose(); }

  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:500,animation:"fadeIn 0.18s ease"}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"85vh",overflowY:"auto",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",marginBottom:14,padding:"4px 0 8px"}}>
        <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingRight:40}}>
        <div>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>
            {main.icon} Personalizar {main.label}
          </div>
          <div style={{fontSize:12,color:C.text.s,marginTop:3}}>Hasta 3 subcategorías propias ✦</div>
        </div>
      </div>

      {/* Subs existentes */}
      {extras.length > 0 && <div style={{marginBottom:14}}>
        {extras.map(s => <div key={s.id}
          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,
            background:`${main.color}15`,border:`1px solid ${main.color}33`,marginBottom:8}}>
          <span style={{fontSize:20}}>{s.icon}</span>
          <span style={{flex:1,fontSize:14,fontWeight:700,color:C.text.h}}>{s.label}</span>
          <span style={{fontSize:10,color:main.color,fontWeight:800,marginRight:4}}>✦</span>
          <button onClick={()=>removeSub(s.id)}
            style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 2px"}}>✕</button>
        </div>)}
      </div>}

      {/* Agregar nueva */}
      {extras.length < 3 && <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:C.text.s,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>
          Nueva subcategoría ({extras.length}/3)
        </div>
        {/* Selector de ícono */}
        <button onClick={()=>setShowIconPicker(p=>!p)}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 14px",borderRadius:12,
            background:C.surface,border:`1px solid ${C.border}`,cursor:"pointer",marginBottom:8}}>
          <span style={{fontSize:22}}>{newIcon}</span>
          <span style={{fontSize:13,color:C.text.b,fontWeight:600}}>Ícono</span>
          <span style={{marginLeft:"auto",color:C.text.s,fontSize:14}}>{showIconPicker?"▲":"▼"}</span>
        </button>
        {showIconPicker && <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,marginBottom:8,
          background:C.surface,borderRadius:12,padding:"8px",border:`1px solid ${C.border}`,
          maxHeight:200,overflowY:"auto"}}>
          {CAT_CUSTOM_ICONS.map(ic=><button key={ic} onClick={()=>{setNewIcon(ic);setShowIconPicker(false);}}
            style={{fontSize:22,padding:"7px 0",borderRadius:8,border:"none",cursor:"pointer",
              background:newIcon===ic?`${main.color}30`:"transparent",
              outline:newIcon===ic?`2px solid ${main.color}`:"2px solid transparent"}}>
            {ic}
          </button>)}
        </div>}
        <div style={{display:"flex",gap:8}}>
          <input placeholder="Nombre de la subcategoría" value={newLabel} onChange={e=>setNewLabel(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addSub()}
            style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,
              padding:"12px 14px",color:C.text.h,fontSize:14,outline:"none"}}/>
          <button onClick={addSub} disabled={!newLabel.trim()}
            style={{padding:"12px 18px",borderRadius:12,border:"none",cursor:newLabel.trim()?"pointer":"not-allowed",
              background:newLabel.trim()?`linear-gradient(135deg,${main.color},${main.color}bb)`:`${C.surface}`,
              color:newLabel.trim()?"#fff":C.text.s,fontSize:16,fontWeight:800}}>+</button>
        </div>
      </div>}

      {extras.length === 0 && <div style={{textAlign:"center",padding:"16px 0 8px",color:C.text.s,fontSize:13}}>
        Agrega tu primera subcategoría personalizada
      </div>}

      {(() => {
        const hayСambios = JSON.stringify(extras) !== JSON.stringify(existing);
        return <button onClick={hayСambios?save:undefined}
          style={{width:"100%",padding:16,borderRadius:14,border:"none",
            cursor:hayСambios?"pointer":"not-allowed",fontSize:15,fontWeight:800,marginTop:4,
            background:hayСambios?`linear-gradient(135deg,${main.color},${main.color}bb)`:C.surface,
            color:hayСambios?"#fff":C.text.s,
            opacity:hayСambios?1:0.5,transition:"all 0.2s"}}>
          {hayСambios?"✓ Guardar cambios":"Sin cambios"}
        </button>;
      })()}
    </div>
  </div>;
}

// ─── SELECTOR CATEGORÍAS ──────────────────────────────────────────────────────
function CatSelector({value, onChange, subsCustom={}, onEditCustom}){
  const findMain=(v,custom)=>MAIN_CATS.find(m=>m.subs.some(s=>s.id===v)||(custom[m.id]||[]).some(s=>s.id===v));
  const curMain=findMain(value,subsCustom);
  const [sel,setSel]=useState(()=>findMain(value,subsCustom)?.id||null);
  const [closing,setClosing]=useState(false); // true mientras anima el cierre
  const closeTimer=useRef(null);

  // Sincronizar sel cuando cambia el value externamente
  const prevValue=useRef(value);
  useEffect(()=>{
    if(prevValue.current===value) return;
    prevValue.current=value;
    const main=findMain(value,subsCustom);
    if(main) setSel(main.id);
  });

  function closeSel(){
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current=setTimeout(()=>{setSel(null);setClosing(false);},220);
  }
  function toggleSel(id){
    if(sel===id){ closeSel(); return; }
    if(sel){ setClosing(false); clearTimeout(closeTimer.current); }
    setSel(id);
  }

  function MBtn({m}){
    const active=curMain?.id===m.id&&!sel,open=sel===m.id;
    return <button onMouseDown={e=>e.preventDefault()} onClick={()=>toggleSel(m.id)}
      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 4px",borderRadius:14,border:"none",cursor:"pointer",
        background:open?`${m.color}35`:active?`${m.color}22`:C.surface,
        outline:(active||open)?`2px solid ${m.color}`:"2px solid transparent",transition:"all 0.15s"}}>
      <span style={{fontSize:20}}>{m.icon}</span>
      <span style={{fontSize:10,fontWeight:800,color:(active||open)?m.color:C.text.b,textAlign:"center",lineHeight:1.2}}>{m.label}</span>
    </button>;
  }
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:6}}>
      {MAIN_CATS.map(m=><MBtn key={m.id} m={m}/>)}
    </div>
    {sel&&(()=>{
      const main=MAIN_CATS.find(m=>m.id===sel);
      const customSubs = subsCustom[sel] || [];
      return <div style={{
        background:`${main.color}12`,border:`1px solid ${main.color}44`,borderRadius:14,
        padding:"12px 10px",marginBottom:8,
        animation:closing?"fadeSlideDown 0.2s ease forwards":"fadeSlideUp 0.22s ease",
        overflow:"hidden",
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,paddingLeft:4}}>
          <div style={{fontSize:11,color:main.color,fontWeight:700,letterSpacing:1}}>{main.icon} {main.label.toUpperCase()}</div>
          {onEditCustom&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>onEditCustom(main)}
            style={{fontSize:10,fontWeight:800,color:main.color,background:`${main.color}20`,border:`1px solid ${main.color}44`,
              borderRadius:8,padding:"3px 8px",cursor:"pointer",letterSpacing:0.3}}>
            ✦ Personalizar
          </button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {main.subs.map((s,i)=>{const a=value===s.id;return <button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(s.id);closeSel();}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"8px 4px",borderRadius:12,border:"none",cursor:"pointer",
              minHeight:68,overflow:"hidden",
              background:a?`${main.color}35`:C.surface,
              outline:a?`2px solid ${main.color}`:"2px solid transparent",
              animation:closing?"none":`fadeSlideUp 0.2s ease both`,
              animationDelay:closing?"0ms":`${i*35}ms`,
              transition:"background 0.12s, outline 0.12s"}}>
            <span style={{fontSize:20,flexShrink:0}}>{s.icon}</span>
            <span style={{fontSize:10,fontWeight:800,color:a?main.color:C.text.b,textAlign:"center",lineHeight:1.2,width:"100%",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",wordBreak:"break-word"}}>{s.label}</span>
          </button>;})}
          {customSubs.map((s,i)=>{const a=value===s.id;return <button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(s.id);closeSel();}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"8px 4px",borderRadius:12,border:"none",cursor:"pointer",
              minHeight:68,overflow:"hidden",position:"relative",
              background:a?`${main.color}35`:C.surface,
              outline:a?`2px solid ${main.color}`:"2px solid transparent",
              animation:closing?"none":`fadeSlideUp 0.2s ease both`,
              animationDelay:closing?"0ms":`${(main.subs.length+i)*35}ms`,
              transition:"background 0.12s, outline 0.12s"}}>
            <span style={{fontSize:20,flexShrink:0}}>{s.icon}</span>
            <span style={{fontSize:10,fontWeight:800,color:a?main.color:C.text.b,textAlign:"center",lineHeight:1.2,width:"100%",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",wordBreak:"break-word"}}>{s.label}</span>
            <span style={{position:"absolute",top:4,right:4,fontSize:8,color:main.color,fontWeight:900}}>✦</span>
          </button>;})}
        </div>
      </div>;
    })()}
    {/* Emergencias y Meta se seleccionan desde el toggle principal del modal */}
  </div>;
}

// ─── MODAL META ───────────────────────────────────────────────────────────────
function GoalModal({initial,onClose,onSave,onDelete}){
  const isEdit=!!initial;
  const [name,setName]=useState(initial?.name||"");
  const [monto,setMonto]=useState(initial?Number(initial.monto).toLocaleString("es-CO"):"");
  const [emoji,setEmoji]=useState(initial?.emoji||"⭐");
  const [showPicker,setShowPicker]=useState(false);
  const [confirmDelMeta,setConfirmDelMeta]=useState(false);
  const [imagen,setImagen]=useState(initial?.imagen||null);
  const [saldoIni,setSaldoIni]=useState(initial?.saldoInicial?Number(initial.saldoInicial).toLocaleString("es-CO"):"");
  const [loadingImg,setLoadingImg]=useState(false);
  const imgInputRef=useRef(null);
  const ref=useRef(null);
  const sheet=useSheetDismiss(onClose);
  useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
  const val=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
  const pct=initial&&initial.monto>0?Math.min(((initial._aportado||0)+(initial.saldoInicial||0))/initial.monto,1):0;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  function handleM(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
  function handleSI(e){const r=e.target.value.replace(/\D/g,"");setSaldoIni(r?Number(r).toLocaleString("es-CO"):"");}
  const valSI=parseFloat(saldoIni.replace(/\./g,"").replace(",","."))||0;

  function save(){
    if(!name.trim()||!val)return;
    onSave({id:initial?.id||null,name:name.trim(),monto:val,emoji,...(imagen?{imagen}:{}),...(valSI>0?{saldoInicial:valSI}:{saldoInicial:0})});
    onClose();
  }
  function comprimirImagen(file){
    return new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=e=>{
        const img=new Image();
        img.onload=()=>{
          const canvas=document.createElement("canvas");
          const MAX=800; // px máximo
          let w=img.width, h=img.height;
          if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}
          else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
          canvas.width=w; canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          // Comprimir hasta ~100KB
          let q=0.8, result=canvas.toDataURL("image/jpeg",q);
          while(result.length>130000&&q>0.3){q-=0.1;result=canvas.toDataURL("image/jpeg",q);}
          resolve(result);
        };
        img.src=e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleImgChange(e){
    const file=e.target.files?.[0];
    if(!file)return;
    setLoadingImg(true);
    const b64=await comprimirImagen(file);
    setImagen(b64);
    setLoadingImg(false);
  }

  function save(){
    if(!name.trim()||!val)return;
    onSave({id:initial?.id||null,name:name.trim(),monto:val,emoji,...(imagen?{imagen}:{}),...(valSI>0?{saldoInicial:valSI}:{saldoInicial:0})});
    onClose();
  }
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div style={{padding:"0 20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingRight:40}}>
          <div style={{fontSize:18,fontWeight:800,color:C.text.h}}>{isEdit?"Editar meta":"Nueva meta"}</div>
        </div>
        {/* Preview con imagen */}
        <div style={{borderRadius:16,marginBottom:18,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden",minHeight:140}}>
          {/* Fondo: imagen o gradiente */}
          {imagen
            ?<img src={imagen} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
            :<div style={{position:"absolute",inset:0,background:grad}}/>}
          {/* Overlay oscuro si hay imagen */}
          {imagen&&<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.65) 100%)"}}/>}
          {/* Contenido */}
          <div style={{position:"relative",padding:"20px 18px"}}>
            <div style={{fontSize:52,marginBottom:10,filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.5))"}}>{emoji}</div>
            <div style={{fontSize:18,fontWeight:900,color:"#fff",marginBottom:isEdit?6:4,textShadow:"0 2px 12px rgba(0,0,0,0.7)"}}>{name||"Nombre de tu meta"}</div>
            {isEdit&&<>
              <div style={{fontSize:13,color:"#fff",fontWeight:700,marginBottom:8,textShadow:"0 1px 4px rgba(0,0,0,0.5)"}}>{getFrase(pct,name||"tu meta")}</div>
              <Bar pct={pct} color={col} h={6}/>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.9)",marginTop:6,display:"flex",justifyContent:"space-between",fontWeight:600}}>
                <span>{Math.round(pct*100)}% · {COP((initial._aportado||0)+(initial.saldoInicial||0))} acumulados</span>
                <span>Faltan {COP(Math.max((initial.monto||0)-(initial._aportado||0)-(initial.saldoInicial||0),0))}</span>
              </div>
            </>}
            {!isEdit&&<div style={{fontSize:13,color:"#fff",fontWeight:700,textShadow:"0 1px 4px rgba(0,0,0,0.5)"}}>{getFrase(0,name||"tu meta")}</div>}
          </div>
          {/* Botón cambiar foto — esquina superior derecha */}
          <button onClick={()=>imgInputRef.current?.click()}
            style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.3)",
              borderRadius:8,padding:"5px 10px",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,
              backdropFilter:"blur(4px)",display:"flex",alignItems:"center",gap:5}}>
            {loadingImg?"⏳ Procesando...":imagen?"📷 Cambiar foto":"📷 Agregar foto"}
          </button>
          {imagen&&<button onClick={()=>setImagen(null)}
            style={{position:"absolute",top:10,right:imagen?"130px":"100px",background:"rgba(239,68,68,0.6)",border:"none",
              borderRadius:8,padding:"5px 8px",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>
            ✕ Quitar
          </button>}
        </div>
        {/* Input oculto para foto */}
        <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImgChange} style={{display:"none"}}/>
        {/* Emoji picker */}
        <Lbl>Ícono</Lbl>
        <button onClick={()=>setShowPicker(!showPicker)} style={{width:"100%",padding:"12px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <span style={{fontSize:28}}>{emoji}</span>
          <span style={{fontSize:14,color:C.text.b,fontWeight:600}}>Cambiar ícono</span>
          <span style={{marginLeft:"auto",color:C.text.s,fontSize:16}}>{showPicker?"▲":"▼"}</span>
        </button>
        {showPicker&&<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:12,
          background:C.surface,borderRadius:14,padding:"10px 8px",border:`1px solid ${C.border}`,
          overflow:"hidden",width:"100%",boxSizing:"border-box"}}>
          {GOAL_EMOJIS.map(e=><button key={e} onClick={()=>{setEmoji(e);setShowPicker(false);}}
            style={{fontSize:22,padding:"7px 0",borderRadius:10,border:"none",cursor:"pointer",
              width:"100%",boxSizing:"border-box",
              background:emoji===e?`${C.indigo}30`:"transparent",
              outline:emoji===e?`2px solid ${C.indigo}`:"2px solid transparent",transition:"all 0.1s"}}>
            {e}
          </button>)}
        </div>}
        <Lbl>Nombre de la meta</Lbl>
        <input ref={ref} placeholder="ej: Gixxer 250, iPhone 16 Pro, Viaje a Cartagena…"
          value={name} onChange={e=>setName(e.target.value)}
          style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
        <Lbl>Monto objetivo (COP)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${val>0?C.indigo:C.border}`,transition:"border-color 0.2s",marginBottom:14}}>
          <span style={{padding:"0 16px",color:C.text.b,fontSize:18,lineHeight:"56px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={monto} onChange={handleM}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 8px",height:56,letterSpacing:-0.5}}/>
        </div>
        <Lbl>¿Ya tienes algo ahorrado para esta meta? (opcional)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${valSI>0?C.emerald:C.border}`,transition:"border-color 0.2s",marginBottom:8}}>
          <span style={{padding:"0 16px",color:C.text.b,fontSize:18,lineHeight:"48px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={saldoIni} onChange={handleSI}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:20,fontWeight:800,color:C.text.h,padding:"0 8px",height:48,letterSpacing:-0.5}}/>
        </div>
        {valSI>0&&<div style={{fontSize:12,color:C.emerald,marginBottom:16,lineHeight:1.5,padding:"8px 12px",background:`${C.emerald}10`,borderRadius:10,border:`1px solid ${C.emerald}25`}}>
          ✓ Tu meta empezará con {COP(valSI)} ya acumulados — no afecta tu saldo del mes
        </div>}
        {!valSI&&<div style={{fontSize:11,color:C.text.s,marginBottom:16,lineHeight:1.5}}>
          Si ya tienes dinero guardado en cuentas de ahorro para esta meta, agrégalo aquí.
        </div>}
        <div style={{display:"flex",gap:8}}>
          {isEdit&&!confirmDelMeta&&<button onClick={()=>setConfirmDelMeta(true)}
            style={{padding:"16px 18px",borderRadius:14,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:22,flexShrink:0}}>🗑</button>}
          {isEdit&&confirmDelMeta&&(
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:C.red,marginBottom:6,lineHeight:1.5}}>
                ⚠️ Se eliminarán también los <b>{initial._aporteCount||0}</b> movimiento(s) de aporte vinculados a esta meta y el saldo se recuperará.
              </div>
              <button onClick={()=>{onDelete(initial.id);onClose();}}
                style={{width:"100%",padding:"12px 0",borderRadius:12,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800,animation:"shake 0.3s ease"}}>
                Sí, eliminar meta y aportes
              </button>
            </div>
          )}
          <button onClick={save} style={{flex:1,padding:16,borderRadius:14,border:"none",cursor:"pointer",fontSize:16,fontWeight:800,
            background:(!name.trim()||!val)?C.surface:`linear-gradient(135deg,${C.indigo},#4338ca)`,
            color:(!name.trim()||!val)?C.text.s:"#fff",transition:"all 0.2s"}}>
            {(!name.trim()||!val)?"Completa los campos":isEdit?"✓ Guardar cambios":`Crear meta: ${COP(val)} →`}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

// ─── PROYECCIÓN DE META ──────────────────────────────────────────────────────
// Calcula en cuántos meses se llega a la meta y la fecha estimada
function getProyeccion(goal, aportado, txAll) {
  if(aportado>=goal.monto) return null; // ya lograda
  const faltan=goal.monto-aportado;
  if(faltan<=0) return null;

  // Obtener todos los aportes de esta meta agrupados por mes
  const aportes=txAll.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===goal.id);
  if(aportes.length===0) return {meses:null,fecha:null,promedio:0,msg:"Sin aportes aún"};

  // Agrupar por mes para calcular promedio real
  const porMes={};
  aportes.forEach(t=>{
    const[ty,tm]=t.date.split("-").map(Number);
    const key=`${ty}-${tm}`;
    porMes[key]=(porMes[key]||0)+t.amount;
  });
  const mesesConAporte=Object.values(porMes);
  const promedio=mesesConAporte.reduce((s,v)=>s+v,0)/mesesConAporte.length;

  if(promedio<=0) return {meses:null,fecha:null,promedio:0,msg:"Sin aportes aún"};

  const mesesRestantes=Math.ceil(faltan/promedio);

  // Fecha estimada
  const hoy=new Date();
  const fechaEstimada=new Date(hoy.getFullYear(),hoy.getMonth()+mesesRestantes,1);
  const MONTHS_ES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaStr=`${MONTHS_ES[fechaEstimada.getMonth()]} ${fechaEstimada.getFullYear()}`;

  let msg, tip;
  if(mesesRestantes===1){
    msg="🏁 ¡Un mes más y es tuyo!";
    tip="Aporta un poco más este mes y lo adelantas";
  } else if(mesesRestantes<=3){
    msg=`🔥 ¡Ya casi lo tienes! Lo logras en ${fechaStr}`;
    tip="Aporta un poco más y llegas antes";
  } else if(mesesRestantes<=6){
    msg=`💪 ¡Vas muy bien! Lo consigues en ${fechaStr}`;
    tip="Cada peso extra que aportes te acerca más rápido";
  } else if(mesesRestantes<=12){
    msg=`🚀 ¡Sigue firme! En ${fechaStr} lo logras`;
    tip="Un aporte extra al mes hace la diferencia";
  } else {
    msg=`⭐ Vale cada peso que ahorras · En ${fechaStr}`;
    tip="Aumenta tu aporte mensual y acorta el camino";
  }

  return {meses:mesesRestantes, fecha:fechaStr, promedio, msg, tip};
}

// ─── CARD META (pestaña Metas) ────────────────────────────────────────────────
function GoalCard({goal,aportado,aportadoEsteMes,txAll,onEdit}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const done=pct>=1;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  const frase=getFrase(pct,goal.name);
  const proy=!done?getProyeccion(goal,aportado,txAll):null;
  return <div onClick={onEdit}
    onMouseDown={e=>e.currentTarget.style.transform="scale(0.985)"}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    style={{borderRadius:20,overflow:"hidden",border:"none",boxShadow:elev("card"),marginBottom:14,cursor:"pointer",transition:"transform 0.15s",background:C.card}}>
    <div style={{position:"relative",minHeight:130,overflow:"hidden"}}>
      {goal.imagen
        ?<img src={goal.imagen} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
        :<div style={{position:"absolute",inset:0,background:grad}}/>}
      {goal.imagen&&<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.65) 100%)"}}/>}
      <div style={{position:"relative",padding:"22px 18px 16px",minHeight:goal.imagen?120:0}}>
        {done&&<div style={{position:"absolute",top:12,right:12,background:C.emerald,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:700,color:"#000"}}>✓ Lograda</div>}
        {!goal.imagen&&<div style={{fontSize:48,marginBottom:10}}>{goal.emoji||"⭐"}</div>}
        <div style={{
          position:goal.imagen?"absolute":"relative",
          bottom:goal.imagen?0:undefined,left:goal.imagen?0:undefined,right:goal.imagen?0:undefined,
          padding:goal.imagen?"16px 18px":"0",
        }}>
          <div style={{fontSize:18,fontWeight:700,color:"#fff",marginBottom:4,textShadow:"0 2px 8px rgba(0,0,0,0.5)"}}>{goal.name}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:500}}>{frase}</div>
        </div>
      </div>
    </div>
    <div style={{padding:"16px 18px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:col,letterSpacing:-0.5}}>{Math.round(pct*100)}%</div>
          <div style={{fontSize:11,color:C.text.s,fontWeight:400}}>completado</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:15,fontWeight:600,color:C.text.h}}>{COP(aportado)}</div>
          <div style={{fontSize:11,color:C.text.s,fontWeight:400}}>de {COP(goal.monto)}</div>
        </div>
      </div>
      <div style={{background:ink(0.05),borderRadius:99,height:3,overflow:"hidden",marginBottom:10}}>
        <div style={{height:3,borderRadius:99,background:col,width:`${Math.min(pct*100,100)}%`,transition:"width 0.7s",opacity:0.8}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:proy?.msg?10:0}}>
        <div style={{fontSize:11,color:C.text.s}}>
          {aportadoEsteMes>0
            ?<span style={{color:col,fontWeight:500}}>+{COP(aportadoEsteMes)} este mes</span>
            :<span>Sin aportes este mes</span>}
        </div>
        <div style={{fontSize:11,color:C.text.s}}>Faltan {COP(Math.max(goal.monto-aportado,0))}</div>
      </div>
      {proy&&proy.promedio>0&&<div style={{
        background:ink(0.04),borderRadius:12,padding:"12px 14px",marginTop:4,
      }}>
        <div style={{fontSize:13,fontWeight:600,color:col,marginBottom:3}}>{proy.msg}</div>
        <div style={{fontSize:11,color:C.text.s,marginBottom:10}}>{proy.tip}</div>
        <div style={{display:"flex",gap:20}}>
          <div>
            <div style={{fontSize:10,color:C.text.s,fontWeight:500,letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>Promedio/mes</div>
            <div style={{fontSize:13,fontWeight:600,color:C.text.h}}>{COP(Math.round(proy.promedio))}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:C.text.s,fontWeight:500,letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>Tiempo restante</div>
            <div style={{fontSize:13,fontWeight:600,color:col}}>{proy.meses} {proy.meses===1?"mes":"meses"}</div>
          </div>
        </div>
      </div>}
      {proy&&proy.promedio===0&&<div style={{padding:"8px 0 2px",fontSize:12,color:C.text.s,marginTop:4}}>
        Haz tu primer aporte y te digo cuándo lo tienes
      </div>}
    </div>
  </div>;
}

// ─── META CHIP (Home — compacto) ──────────────────────────────────────────────
function GoalChip({goal,aportado,aportadoEsteMes,txAll,onClick}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  const frase=getFrase(pct,goal.name);
  const proy=pct<1&&txAll?getProyeccion(goal,aportado,txAll):null;
  const rip=useRipple();
  return <div onClick={onClick}
    onMouseDown={e=>{rip.trigger(e);e.currentTarget.style.transform="scale(0.98)";}}
    onTouchStart={e=>{rip.trigger(e);}}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    style={{
      ...cardSurface(),
      borderRadius:20, overflow:"hidden",
      border:"none", position:"relative",
      boxShadow:cardShadow(),
      cursor:"pointer", display:"flex", alignItems:"stretch", marginBottom:10, transition:"all 0.15s"}}>
    <Ripple ripples={rip.ripples}/>
    <div style={{width:72,flexShrink:0,position:"relative",overflow:"hidden",alignSelf:"stretch"}}>
      {goal.imagen
        ?<img src={goal.imagen} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
        :<div style={{position:"absolute",inset:0,background:grad}}/>}
      {goal.imagen&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}}/>}
      <div style={{
        position:"absolute",bottom:8,left:0,right:0,textAlign:"center",
        fontSize:26,
        filter:goal.imagen
          ?"drop-shadow(0 0 6px rgba(0,0,0,1)) drop-shadow(0 0 12px rgba(0,0,0,1)) drop-shadow(0 0 18px rgba(0,0,0,0.9))"
          :"none",
      }}>
        {goal.emoji||"⭐"}
      </div>
    </div>
    <div style={{flex:1,padding:"14px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
        <div style={{flex:1,paddingRight:8}}>
          <div style={{fontSize:14,fontWeight:800,color:C.text.h,lineHeight:1.2,marginBottom:3}}>{goal.name}</div>
          <div style={{fontSize:11,color:col,fontWeight:600,lineHeight:1.3}}>{frase}</div>
        </div>
        <div style={{fontSize:20,fontWeight:900,color:col,flexShrink:0}}>{Math.round(pct*100)}%</div>
      </div>
      <Bar pct={pct} color={col} h={4}/>
      <div style={{fontSize:11,color:C.text.b,fontWeight:600,marginTop:5,display:"flex",justifyContent:"space-between"}}>
        <span>Faltan {COP(Math.max(goal.monto-aportado,0))}</span>
        {proy?.fecha
          ?<span style={{color:col,fontWeight:600}}>📈 {proy.fecha}</span>
          :aportadoEsteMes>0&&<span style={{color:goalColor(aportado/Math.max(goal.monto,1))}}> +{COP(aportadoEsteMes)} hoy</span>}
      </div>
    </div>
  </div>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,loading}){
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{marginBottom:32,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:14}}>💰</div>
      <div style={{fontSize:30,fontWeight:900,color:C.text.h,letterSpacing:-1}}>Mis Finanzas</div>
      <div style={{fontSize:15,color:C.text.b,marginTop:10,lineHeight:1.7}}>Controla tus gastos.<br/>Cumple tus metas.</div>
    </div>
    <div style={{background:C.surface,borderRadius:20,padding:28,border:`1px solid ${C.border}`,width:"100%",maxWidth:340,textAlign:"center"}}>
      <div style={{fontSize:14,color:C.text.b,marginBottom:22,lineHeight:1.7}}>Inicia sesión con Google para acceder a tu cuenta. Tus datos son privados.</div>
      <button onClick={onLogin} disabled={loading} style={{width:"100%",padding:"15px 20px",borderRadius:12,border:"none",background:loading?C.surface:"#fff",color:"#1a1a1a",fontWeight:700,fontSize:16,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
          <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/>
          <path fill="#FBBC05" d="M24 46c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.7 37 27 38 24 38c-5.7 0-10.6-3.1-11.7-8.4l-7 5.4C8.6 41.7 15.7 46 24 46z"/>
          <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1 3-3.3 5.4-6.3 7L36.2 41c4.4-4.1 7.8-10.3 7.8-18 0-1.3-.2-2.7-.5-4z"/>
        </svg>
        {loading?"Iniciando...":"Continuar con Google"}
      </button>
    </div>
  </div>;
}

function OnboardingScreen({user,onSave}){
  const [salary,setSalary]=useState(""), [error,setError]=useState(false);
  const val=parseFloat(salary.replace(/\./g,"").replace(",","."))||0;
  function hi(e){const r=e.target.value.replace(/\D/g,"");setSalary(r?Number(r).toLocaleString("es-CO"):"");setError(false);}
  function sub(){if(!val||val<10000){setError(true);return;}onSave(val);}
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:52,marginBottom:14}}>⭐</div>
        <div style={{fontSize:26,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>Bienvenido, {user.displayName?.split(" ")[0]}!</div>
        <div style={{fontSize:15,color:C.text.b,marginTop:10,lineHeight:1.7}}>Para empezar, cuéntame cuánto<br/>recibes al mes.</div>
      </div>
      <div style={{background:C.surface,borderRadius:20,padding:24,border:`1px solid ${C.border}`}}>
        <Lbl>Sueldo o ingreso mensual (COP)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.06)",borderRadius:14,overflow:"hidden",border:`2px solid ${error?C.red:val>0?C.indigo:C.border}`,transition:"border-color 0.2s",marginBottom:12}}>
          <span style={{padding:"0 16px",color:C.text.b,fontSize:22,lineHeight:"62px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={salary} onChange={hi} autoFocus
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:30,fontWeight:800,color:C.text.h,padding:"0 8px",height:62,letterSpacing:-0.5}}/>
        </div>
        {error&&<div style={{fontSize:13,color:C.red,marginBottom:10}}>Ingresa un monto válido (mínimo $10.000)</div>}
        {val>0&&<div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:C.text.b,lineHeight:2}}>
          Sugerido con <b style={{color:C.text.h}}>{COP(val)}</b>:<br/>
          <span style={{color:C.sky}}>🛡️ {COP(Math.round(val*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:C.indigo}}>⭐ {COP(Math.round(val*0.10))} Metas (10%)</span><br/>
          <span style={{color:C.text.b}}>🛒 {COP(Math.round(val*0.85))} Gastos libres</span>
        </div>}
        <button onClick={sub} style={{width:"100%",padding:17,borderRadius:14,border:"none",cursor:val>0?"pointer":"not-allowed",fontSize:16,fontWeight:800,background:val>0?`linear-gradient(135deg,${C.indigo},#4338ca)`:C.surface,color:val>0?"#fff":C.text.s,transition:"all 0.2s"}}>
          {val>0?`Empezar con ${COP(val)} →`:"Ingresa tu sueldo"}
        </button>
      </div>
    </div>
  </div>;
}


// ─── ALERTAS INTELIGENTES AVANZADAS ──────────────────────────────────────────
// Extiende BudgetAlert sin romperlo — detecta 3 situaciones nuevas:
// 1. Gasto acelerado vs ritmo ideal del mes
// 2. Categoría fuera de control (supera presupuesto definido)
// 3. Mejora vs mes anterior (motivadora)
function AlertasAvanzadas({
  gastosTx, totalGasto, totalIngresoMes, presupuestos,
  MAIN_CATS, tx, month, isGasto, isAporteMeta, isMonth,
  C, COP, MONTHS_S
}){
  const now         = new Date();
  const today       = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), month + 1, 0).getDate();
  const daysLeft    = daysInMonth - today;
  const safeDays    = Math.max(today, 5);

  const alertas = [];

  // ── 2. Categoría fuera de control ────────────────────────────────────────
  // Solo si tiene presupuesto definido y lo supera
  const catsFueraControl = MAIN_CATS
    .map(m => {
      const limite = presupuestos[m.id] || 0;
      if(!limite) return null;
      const gastoCat = gastosTx
        .filter(t => m.subs.some(s => s.id === t.cat))
        .reduce((s, t) => s + t.amount, 0);
      const pct = gastoCat / limite;
      return pct >= 1.0 ? { ...m, gastoCat, limite, pct } : null; // alerta desde el 100% del presupuesto
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  if(catsFueraControl.length > 0){
    const c = catsFueraControl[0];
    const exacto = c.pct >= 1.0 && c.pct < 1.05; // llegó al límite pero no lo superó significativamente
    alertas.push({
      id:    "cat_control",
      icon:  c.icon,
      color: exacto ? C.amber : C.red,
      title: exacto
        ? `${c.label} llegó al límite del presupuesto`
        : `${c.label} pasó del límite que definiste`,
      body: exacto
        ? `Llevas ${COP(c.gastoCat)} de ${COP(c.limite)} — puedes ajustar el ritmo los días que quedan`
        : `Llevas ${COP(c.gastoCat)} de ${COP(c.limite)} — ${Math.round((c.pct-1)*100)}% más de lo que planeaste`,
      type:  "warning",
    });
  }

  // ── 3. Mejora vs mes anterior (motivadora) ────────────────────────────────
  const prevMonth    = month === 0 ? 11 : month - 1;
  const prevYear     = month === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevGastos   = tx.filter(t => isMonth(t.date, prevMonth, prevYear) && isGasto(t.cat) && !isAporteMeta(t));
  const prevTotal    = prevGastos.reduce((s, t) => s + t.amount, 0);

  if(prevTotal > 0 && totalGasto > 0 && today >= 10){
    // Normalizar mes anterior al mismo período
    const daysInPrev  = new Date(prevYear, prevMonth + 1, 0).getDate();
    const prevNorm    = prevTotal * (safeDays / daysInPrev);
    const mejora      = prevNorm - totalGasto;
    const pctMejora   = mejora / prevNorm;

    if(pctMejora >= 0.15){ // mejora del 15%+ vs mes anterior
      alertas.push({
        id:    "mejora",
        icon:  "🎉",
        color: C.emerald,
        title: `¡Vas ${Math.round(pctMejora*100)}% mejor que el mes pasado!`,
        body:  `Llevas ${COP(Math.round(mejora))} menos gastados en el mismo período — sigue así`,
        type:  "success",
      });
    }
  }

  if(alertas.length === 0) return null;

  // Solo mostrar la más importante (máximo 1 a la vez para no saturar)
  const ORDER  = { warning: 0, success: 1 };
  const alerta = [...alertas].sort((a, b) => (ORDER[a.type]||0) - (ORDER[b.type]||0))[0];

  const bgMap    = { warning: `${alerta.color}12`, success: `${C.emerald}12` };
  const borderMap= { warning: `${alerta.color}35`, success: `${C.emerald}35` };

  return (
    <div style={{
      borderRadius: 14, padding: "13px 15px", marginBottom: 14,
      background: bgMap[alerta.type] || `${alerta.color}12`,
      border: `1px solid ${borderMap[alerta.type] || alerta.color+"35"}`,
      display: "flex", alignItems: "flex-start", gap: 12,
      animation: "fadeIn 0.3s ease",
    }}>
      <span style={{fontSize: 22, flexShrink: 0, lineHeight: 1.2}}>{alerta.icon}</span>
      <div style={{flex: 1}}>
        <div style={{fontSize: 13, fontWeight: 800, color: alerta.color, marginBottom: 3, lineHeight: 1.3}}>
          {alerta.title}
        </div>
        <div style={{fontSize: 12, color: C.text.b, lineHeight: 1.5}}>
          {alerta.body}
        </div>
      </div>
    </div>
  );
}

function BudgetAlert({pct,salario,gastado}){
  if(pct<0.8)return null;
  const over=pct>=1, c=over?C.red:C.amber;
  return <div style={{background:`${c}18`,border:`1px solid ${c}44`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,animation:"pulse 2s infinite"}}>
    <span style={{fontSize:26,flexShrink:0}}>{over?"🚨":"⚠️"}</span>
    <div>
      <div style={{fontSize:14,fontWeight:800,color:c,marginBottom:3}}>{over?"Cuida los próximos gastos":"Cerca del límite mensual"}</div>
      <div style={{fontSize:13,color:C.text.h,lineHeight:1.5}}>{over?`Llevas ${COP(gastado-salario)} por encima de tu sueldo — un mes tranquilo te ayuda a equilibrar.`:`Llevas el ${Math.round(pct*100)}% de tu sueldo usado este mes.`}</div>
    </div>
  </div>;
}

// Placeholders específicos por subcategoría
const GASTO_PLACEHOLDERS_MAP = {
  restaurantes:"ej: Almuerzo en el trabajo",
  mercado:"ej: Mercado de la semana",
  domicilios:"ej: Domicilio de pizza",
  cafeteria:"ej: Café de la mañana",
  arriendo:"ej: Arriendo del mes",
  servicios:"ej: Recibo de luz",
  aseo:"ej: Productos de limpieza",
  reparaciones:"ej: Arreglo de la llave",
  bus:"ej: Recarga de la T",
  taxi:"ej: Uber al aeropuerto",
  gasolina:"ej: Gasolina moto",
  parqueadero:"ej: Parqueadero centro",
  repuestos:"ej: Llanta trasera",
  mantenimiento:"ej: Aceite y filtro",
  soat:"ej: SOAT 2025",
  revision:"ej: Revisión técnico-mecánica",
  medico:"ej: Consulta médica",
  medicamentos:"ej: Medicamentos mes",
  gym:"ej: Mensualidad gym",
  barberia:"ej: Corte de cabello",
  salidas:"ej: Salida con amigos",
  eventos:"ej: Entrada al concierto",
  viajes:"ej: Hotel Cartagena",
  hobbies:"ej: Materiales de pintura",
  ropa:"ej: Camisas nuevas",
  calzado:"ej: Tenis Nike",
  accesorios:"ej: Correa del reloj",
  cuidado:"ej: Crema hidratante",
  streaming:"ej: Netflix mensual",
  apps:"ej: Spotify premium",
  compras_online:"ej: Compra Amazon",
  tecnologia:"ej: Teclado mecánico",
  tarjeta:"ej: Cuota tarjeta Visa",
  cuotas:"ej: Cuota celular",
  credito:"ej: Crédito bancario",
  prestamo_tercero:"ej: Préstamo a Juan",
  educacion:"ej: Curso de inglés",
  mascotas:"ej: Veterinario de Max",
  regalos:"ej: Regalo cumpleaños",
  otros:"ej: Gasto del día",
};
const GASTO_PLACEHOLDERS = [
  "ej: Almuerzo en el trabajo",
  "ej: Recarga de transporte",
  "ej: Netflix mensual",
  "ej: Mercado de la semana",
  "ej: Gasolina moto",
  "ej: Consulta médica",
  "ej: Domicilio Pizza",
  "ej: Recibo de luz",
  "ej: Gym mensual",
  "ej: Ropa del niño",
];
const INGRESO_PLACEHOLDERS = [
  "ej: Salario del mes",
  "ej: Comisión por ventas",
  "ej: Trabajo extra / freelance",
  "ej: Bono de rendimiento",
  "ej: Venta de artículo",
  "ej: Transferencia recibida",
  "ej: Ingreso adicional",
];
const EMERGENCIA_PLACEHOLDERS = [
  "ej: Fondo de emergencias",
  "ej: Reserva mes de marzo",
  "ej: Por si acaso",
  "ej: Ahorro de seguridad",
];
const META_PLACEHOLDERS = [
  "ej: Aporte mensual",
  "ej: Extra de este mes",
  "ej: Guardado para la meta",
  "ej: Aporte especial",
];

function TxModal({initial,initialCat,onClose,onSave,onDelete,goals,saldoDisponible,catsCustom={},onEditCustom,onOpenPrestamo,txHistorial=[]}){
  const isEdit=!!initial;
  const [amount,setAmount]=useState(initial?Number(initial.amount).toLocaleString("es-CO"):"");
  const [desc,setDesc]=useState(initial?.desc||"");
  const [cat,setCat]=useState(initial?.cat||(initialCat||"almuerzo"));
  const [date,setDate]=useState(initial?.date||todayStr());
  const [goalId,setGoalId]=useState(initial?.goalId||"");
  const [conf,setConf]=useState(false);
  const ref=useRef(null);
  const scrollRef=useRef(null); // ref para preservar scroll del modal
  const [showSug,setShowSug]=useState(false);
  const sheet=useSheetDismiss(onClose);

  // ── Sugerencias inteligentes basadas en historial ─────────────────────────
  const sugerencias=useMemo(()=>{
    if(!desc.trim()||desc.length<2||isEdit) return [];
    const q=desc.toLowerCase().trim();
    // Buscar en historial — coincidencia por descripción
    const vistos=new Map();
    txHistorial
      .filter(t=>t.desc&&t.cat&&t.desc.toLowerCase().includes(q)&&t.desc!==desc)
      .forEach(t=>{
        const key=`${t.desc}|${t.cat}`;
        if(!vistos.has(key)) vistos.set(key,{desc:t.desc,cat:t.cat,count:1});
        else vistos.get(key).count++;
      });
    // Ordenar por frecuencia y devolver top 3
    return [...vistos.values()]
      .sort((a,b)=>b.count-a.count)
      .slice(0,3);
  },[desc,txHistorial,isEdit]);
  // No hacer autofocus al monto — el teclado solo abre cuando el usuario toca el campo
  // Preservar posición de scroll al cambiar categoría
  function setCatSinScroll(v){
    // Si elige A terceros → ir directo al módulo de préstamos sin pasar por aquí
    if(v==="prestamo_tercero"&&onOpenPrestamo){
      onClose();
      onOpenPrestamo();
      return;
    }
    const pos=scrollRef.current?.scrollTop||0;
    setCat(v);
    requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=pos;});
  }
  const raw=parseFloat(amount.replace(/\./g,"").replace(",","."))||0;
  const ci=getCatInfo(cat);
  const isMeta=cat==="meta_aporte";
  const esIngreso=isIngreso(cat);
  const esIngresoExtra=isIngresoExtra(cat);
  const changed=isEdit&&(raw!==initial.amount||desc.trim()!==initial.desc||cat!==initial.cat||date!==initial.date||goalId!==(initial.goalId||""));
  const acc=esIngreso?C.emerald:esIngresoExtra?C.amber:isMeta?C.indigo:ci.color||C.emerald;
  function ha(e){const r=e.target.value.replace(/\D/g,"");setAmount(r?Number(r).toLocaleString("es-CO"):"");}
  function handleDesc(e){setDesc(e.target.value);setShowSug(true);}
  function aplicarSugerencia(sug){
    setDesc(sug.desc);
    setCatSinScroll(sug.cat);
    setShowSug(false);
  }
  const esEdicion=!!initial?.id;
  const montoDiff=esEdicion?(raw-initial.amount):raw;
  const sinSaldo=!esIngreso&&!esIngresoExtra&&!esEdicion&&saldoDisponible<raw&&saldoDisponible>=0;

  // ── Validaciones de campos requeridos ──────────────────────────────────────
  // 1. Monto obligatorio siempre
  const faltaMonto = !raw;
  // 2. Para gastos: debe tener subcategoría (no puede quedar en categoría principal)
  //    Las subcategorías válidas son las de ALL_SUBS. Emergencias y meta_aporte son válidas.
  const subCats = ALL_SUBS.map(s=>s.id);
  const isCustomSub = cat?.startsWith("custom_");
  const catValida = esIngreso || esIngresoExtra || cat==="emergencias" || cat==="meta_aporte" || cat==="prestamo_devuelto" || subCats.includes(cat) || isCustomSub;
  const faltaSubcat = !catValida;
  // 3. Para aporte a meta: debe haber seleccionado una meta
  const faltaMeta = isMeta && !goalId && goals.length > 0;
  // 4. Para aporte a meta sin metas creadas: advertencia especial
  const sinMetas = isMeta && goals.length === 0;

  // Errores activos
  const hayError = faltaMonto || faltaSubcat || faltaMeta;

  // Mensaje de error descriptivo
  function getMensajeError() {
    if (faltaMonto) return "Ingresa el monto primero";
    if (faltaSubcat) return "Elige una subcategoría de la categoría";
    if (faltaMeta) return "Selecciona a qué meta va este aporte";
    if (sinMetas) return "Crea una meta primero en la pestaña ⭐ Metas";
    return null;
  }

  function save(){
    if(hayError || sinMetas) return;
    // Resolver label real para custom cats
    const catLabel=(()=>{
      if(cat?.startsWith("custom_")){
        for(const[,subs] of Object.entries(catsCustom||{})){
          const found=subs?.find(s=>s.id===cat);
          if(found) return found.label;
        }
      }
      return ci.label;
    })();
    onSave({
      id:initial?.id||null,
      desc:desc.trim()||(isMeta&&goalId?goals.find(g=>g.id===goalId)?.name||"Aporte meta":esIngreso?"Ingreso del mes":esIngresoExtra?"Ingreso extra":catLabel),
      amount:raw,cat,date,...(isMeta&&goalId?{goalId}:{})
    });
    onClose();
  }
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:300,animation:"fadeIn 0.18s ease"}}>
    <div ref={el=>{scrollRef.current=el;sheet.cardRef.current=el;}} style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto",position:"relative",...sheet.cardStyle}} {...sheet.dragProps}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div style={{padding:"0 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,paddingRight:40}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>
            {isEdit?(esIngreso?"Editar ingreso":"Editar movimiento"):(esIngreso?"Nuevo ingreso":"Nuevo movimiento")}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>{esIngreso?"Monto recibido (COP)":"Monto (COP)"}</Lbl>
          <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${raw>0?acc:C.border}`,transition:"border-color 0.2s"}}>
            <span style={{padding:"0 14px",fontSize:22,lineHeight:"58px"}}>{(()=>{
              if(cat?.startsWith("custom_")){
                for(const[,subs] of Object.entries(catsCustom||{})){
                  const found=subs?.find(s=>s.id===cat);
                  if(found) return found.icon;
                }
              }
              return ci.icon;
            })()}</span>
            <span style={{color:C.text.s,fontSize:16,lineHeight:"58px"}}>$</span>
            <input ref={ref} inputMode="numeric" placeholder="0" value={amount} onChange={ha} enterKeyHint="next"
              style={{flex:1,background:"none",border:"none",outline:"none",fontSize:28,fontWeight:800,color:C.text.h,padding:"0 10px",height:58,letterSpacing:-0.5}}/>
            {raw>0&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>setAmount("")} style={{background:"none",border:"none",cursor:"pointer",color:C.text.s,fontSize:22,padding:"0 14px",lineHeight:"58px"}}>×</button>}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>{
            esIngreso?"¿De dónde viene?":
            esIngresoExtra?"¿De dónde viene?":
            cat==="emergencias"?"Descripción (opcional)":
            cat==="meta_aporte"?"Descripción (opcional)":
            "¿En qué lo gastaste?"
          }</Lbl>
          <div style={{position:"relative"}}>
            <input
              placeholder={
                esIngreso
                  ?INGRESO_PLACEHOLDERS[cat.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%INGRESO_PLACEHOLDERS.length]
                  :esIngresoExtra
                    ?"ej: Ganancia Betplay, Venta celular, Regalo..."
                  :cat==="emergencias"
                    ?EMERGENCIA_PLACEHOLDERS[0]
                  :cat==="meta_aporte"
                    ?META_PLACEHOLDERS[0]
                  :GASTO_PLACEHOLDERS_MAP[cat]||(GASTO_PLACEHOLDERS[cat.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%GASTO_PLACEHOLDERS.length])
              }
              value={desc} onChange={handleDesc} onFocus={()=>setShowSug(true)} onBlur={()=>setTimeout(()=>setShowSug(false),150)} enterKeyHint="done"
              style={{width:"100%",background:C.surface,border:`1px solid ${showSug&&sugerencias.length>0?C.indigo+"55":C.border}`,borderRadius:12,padding:"14px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
            {showSug&&sugerencias.length>0&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:C.card,border:`1px solid ${C.indigo}44`,borderRadius:12,overflow:"hidden",zIndex:10,boxShadow:elev("raised")}}>
                {sugerencias.map((sug,i)=>{
                  const catInfo=getCatInfo(sug.cat);
                  return <button key={i} onMouseDown={e=>e.preventDefault()} onClick={()=>aplicarSugerencia(sug)}
                    style={{width:"100%",padding:"11px 14px",background:"none",border:"none",borderBottom:i<sugerencias.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18,flexShrink:0}}>{catInfo.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sug.desc}</div>
                      <div style={{fontSize:11,color:C.text.s,marginTop:1}}>{catInfo.label}</div>
                    </div>
                    <span style={{fontSize:10,color:C.indigo,fontWeight:700,flexShrink:0}}>↵ usar</span>
                  </button>;
                })}
              </div>
            )}
          </div>
        </div>
        {/* Toggle Gasto / Meta / Ingreso / Extra */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
          {[
            {id:"gasto",  label:"🛍️ Gasto",   color:C.red,    active:!esIngreso&&!esIngresoExtra&&cat!=="meta_aporte", onClick:()=>setCatSinScroll("almuerzo")},
            {id:"meta",   label:"⭐ Meta",     color:C.indigo, active:cat==="meta_aporte",                              onClick:()=>setCatSinScroll("meta_aporte")},
            {id:"ingreso",label:"💵 Salario",  color:C.emerald,active:esIngreso,                                        onClick:()=>setCatSinScroll("ingreso")},
            {id:"extra",  label:"💫 Extra",    color:C.amber,  active:esIngresoExtra,                                   onClick:()=>setCatSinScroll("ingreso_extra")},
          ].map(t=>(
            <button key={t.id} onMouseDown={e=>e.preventDefault()} onClick={t.onClick}
              style={{padding:"9px 0",borderRadius:12,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,
                background:t.active?`${t.color}22`:C.surface,
                outline:t.active?`2px solid ${t.color}`:"2px solid transparent",
                color:t.active?t.color:C.text.b,transition:"all 0.15s"}}>
              {t.label}
            </button>
          ))}
        </div>
        {!esIngreso&&!esIngresoExtra&&cat!=="meta_aporte"&&<div style={{marginBottom:14,animation:"fadeIn 0.18s ease"}}>
          <Lbl>Categoría del gasto</Lbl>
          <CatSelector value={cat} onChange={v=>{setCatSinScroll(v);setGoalId("");}} subsCustom={catsCustom} onEditCustom={onEditCustom}/>
          {faltaSubcat&&raw>0&&<div style={{marginTop:8,fontSize:12,color:C.amber,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <span>⚠️</span><span>Elige el tipo específico dentro de la categoría</span>
          </div>}
        </div>}
        {esIngreso&&<div style={{marginBottom:14,padding:"12px 16px",background:`${C.emerald}10`,border:`1px solid ${C.emerald}30`,borderRadius:12,animation:"fadeIn 0.18s ease"}}>
          <div style={{fontSize:13,color:C.emerald,fontWeight:700,marginBottom:4}}>💵 Ingreso de trabajo</div>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.7}}>Salario, comisión, freelance, bono. Se suma al ingreso del mes y afecta el "de $X" de tu disponible.</div>
        </div>}
        {esIngresoExtra&&<div style={{marginBottom:14,padding:"12px 16px",background:`${C.amber}10`,border:`1px solid ${C.amber}30`,borderRadius:12,animation:"fadeIn 0.18s ease"}}>
          <div style={{fontSize:13,color:C.amber,fontWeight:700,marginBottom:4}}>💫 Ingreso extra</div>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.7}}>Apuestas, ventas, regalos, cashback u otro dinero que no es de trabajo. <b style={{color:C.amber}}>Suma al disponible sin cambiar tu salario del mes.</b></div>
        </div>}
        {isMeta&&goals.length>0&&<div style={{marginBottom:14,animation:"fadeIn 0.18s ease"}}>
          <Lbl>¿Para qué meta?</Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {goals.map(g=><button key={g.id} onMouseDown={e=>e.preventDefault()} onClick={()=>setGoalId(g.id)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:12,border:"none",cursor:"pointer",background:goalId===g.id?`${C.indigo}18`:C.surface,outline:goalId===g.id?`2px solid ${C.indigo}`:"2px solid transparent",transition:"all 0.12s",textAlign:"left"}}>
              <span style={{fontSize:22}}>{g.emoji||"⭐"}</span>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:goalId===g.id?C.indigo:C.text.h}}>{g.name}</div><div style={{fontSize:11,color:C.text.b}}>{COP(g.monto)}</div></div>
              {goalId===g.id&&<span style={{color:C.indigo,fontSize:18}}>✓</span>}
            </button>)}
          </div>
        </div>}
        {isMeta&&goals.length===0&&<div style={{marginBottom:14,padding:"14px 16px",background:`${C.amber}12`,border:`1px solid ${C.amber}35`,borderRadius:12,animation:"fadeIn 0.18s ease"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.amber,marginBottom:4}}>⭐ Sin metas creadas aún</div>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>Primero ve a la pestaña <b style={{color:C.indigo}}>Metas</b> y crea tu primera meta de ahorro. Luego vuelve aquí para registrar tu aporte.</div>
        </div>}
        <div style={{marginBottom:16}}>
          <Lbl>Fecha</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Alerta saldo insuficiente */}
        {sinSaldo&&raw>0&&!esIngreso&&(
          <div style={{marginBottom:12,padding:"12px 14px",background:`${C.amber}15`,border:`1px solid ${C.amber}40`,borderRadius:12,display:"flex",gap:10,alignItems:"flex-start",animation:"fadeIn 0.18s ease"}}>
            <span style={{fontSize:20,flexShrink:0}}>💭</span>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:C.amber,marginBottom:3}}>
                {saldoDisponible<=0?"Este mes quedaste sin margen":"Excede tu disponible este mes"}
              </div>
              <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>
                {saldoDisponible<=0
                  ?`Tu disponible es ${COP(saldoDisponible)}. Puedes registrarlo igual si es real, solo ten en cuenta el impacto.`
                  :`Disponible: ${COP(saldoDisponible)} · Este gasto: ${COP(raw)}`}
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:8,marginBottom:28}}>
          {isEdit&&!conf&&<button onClick={()=>setConf(true)} style={{padding:"16px 18px",borderRadius:14,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:22,flexShrink:0}}>🗑</button>}
          {isEdit&&conf&&<button onClick={()=>{onDelete(initial.id);onClose();}} style={{padding:"16px 18px",borderRadius:14,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800,flexShrink:0,animation:"shake 0.3s ease"}}>¿Borrar?</button>}
          <button onClick={(hayError||sinSaldo||sinMetas)?undefined:save}
            style={{flex:1,padding:16,borderRadius:14,border:"none",
              cursor:(hayError||sinSaldo||sinMetas)?"not-allowed":"pointer",
              fontSize:raw>=1000000?13:raw>=100000?14:16,fontWeight:800,transition:"all 0.2s",
              background:(hayError||sinMetas)?C.surface:sinSaldo?`${C.red}20`:isEdit&&!changed?`${C.sky}18`:`linear-gradient(135deg,${acc},${acc}cc)`,
              color:(hayError||sinMetas)?C.text.s:sinSaldo?C.red:isEdit&&!changed?C.sky:"#fff",
              opacity:(hayError||sinSaldo||sinMetas)?0.65:1}}>
            {getMensajeError() ?? (sinSaldo?"Excede tu disponible":isEdit&&!changed?"Sin cambios":isEdit?"✓ Guardar":esIngreso?`Registrar salario ${COP(raw)} →`:esIngresoExtra?`Registrar extra ${COP(raw)} →`:`Registrar ${COP(raw)} →`)}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

function TxRow({t,onEdit,catsCustom={}}){
  const cat=(()=>{
    // Buscar primero en catsCustom si es una cat personalizada
    if(t.cat?.startsWith("custom_")){
      for(const[mainId,subs] of Object.entries(catsCustom)){
        const found=subs?.find(s=>s.id===t.cat);
        if(found){
          const main=MAIN_CATS.find(m=>m.id===mainId);
          return {...found, color:main?.color||"#94a3b8"};
        }
      }
    }
    return getCatInfo(t.cat);
  })();
  const esMeta=isAporteMeta(t)||isSavingsLegacy(t.cat);
  const esPos=esMeta||isIngreso(t.cat)||isDevolucion(t.cat)||isIngresoExtra(t.cat);
  const esPrestamo=t.cat==="prestamo_tercero"||t.cat==="prestamo_devuelto";
  const bloqueado=esMesPasado(t.date)||esPrestamo;
  const [p,setP]=useState(false);
  const rip=useRipple();
  return <div
    onClick={bloqueado?undefined:onEdit}
    onMouseDown={bloqueado?undefined:(e)=>{setP(true);rip.trigger(e);}}
    onTouchStart={bloqueado?undefined:(e)=>rip.trigger(e)}
    onMouseUp={bloqueado?undefined:()=>setP(false)}
    onMouseLeave={()=>setP(false)}
    style={{
      display:"flex",alignItems:"center",gap:14,
      padding:"16px 0",
      borderBottom:`1px solid ${ink(0.05)}`,
      cursor:bloqueado?"default":"pointer",
      transition:"opacity 0.15s",
      opacity:bloqueado?0.45:p?0.7:1,
      userSelect:"none", position:"relative", overflow:"hidden",
    }}>
    <Ripple ripples={rip.ripples} color={`${cat.color}25`}/>
    <div style={{
      width:44,height:44,borderRadius:14,flexShrink:0,
      background:`${cat.color}18`,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
    }}>{cat.icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:600,color:bloqueado?C.text.s:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{t.desc}</div>
      <div style={{fontSize:12,color:C.text.s,fontWeight:400}}>
        {t.date?.slice(5).replace("-","/")} · {isIngreso(t.cat)?"Salario":isDevolucion(t.cat)?"Devolución":isIngresoExtra(t.cat)?"Extra":esMeta?"Meta":(()=>{
          // Buscar categoría principal — primero en subs normales, luego en custom
          const main=MAIN_CATS.find(m=>
            m.subs?.some(s=>s.id===t.cat) ||
            (catsCustom[m.id]||[]).some(s=>s.id===t.cat) ||
            (_customSubsLookup[m.id]||[]).some(s=>s.id===t.cat)
          );
          return main?`${main.label} · ${cat.label}`:cat.label;
        })()}
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:15,fontWeight:600,color:esPos?C.emeraldLight:C.text.h,letterSpacing:-0.3}}>
        {esPos?"+":"-"}{COP(t.amount)}
      </div>
      {!bloqueado&&<div style={{fontSize:10,color:C.text.s,marginTop:2,opacity:0.6}}>editar</div>}
    </div>
  </div>;
}

// ─── MODAL PRÉSTAMOS A TERCEROS ───────────────────────────────────────────────
function ExportModalSheet({onClose,exportarCSV,exportarPDF,tx,now,isMonth,MONTHS}){
  const sheet=useSheetDismiss(onClose);
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
    <div onClick={e=>e.stopPropagation()} {...sheet.dragProps}
      style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,padding:"20px 20px 36px",position:"relative",...sheet.cardStyle}}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",marginBottom:16,padding:"4px 0 8px"}}>
        <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
      </div>
      <div style={{fontSize:18,fontWeight:800,color:C.text.h,marginBottom:4}}>📤 Exportar movimientos</div>
      <div style={{fontSize:13,color:C.text.b,marginBottom:20,lineHeight:1.6}}>Elige el formato y el período que quieres exportar.</div>
      <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:8,textTransform:"uppercase"}}>📊 CSV · Excel / Sheets</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        <button onClick={()=>exportarCSV(true)} style={{padding:"14px 16px",borderRadius:12,border:`1px solid ${C.emerald}44`,cursor:"pointer",background:`${C.emerald}12`,color:C.text.h,fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>📅</span>
          <div><div style={{color:C.emeraldLight}}>Solo {MONTHS[now.getMonth()]} {now.getFullYear()}</div>
          <div style={{fontSize:11,color:C.text.s,marginTop:2}}>{tx.filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear())).length} movimientos</div></div>
        </button>
        <button onClick={()=>exportarCSV(false)} style={{padding:"14px 16px",borderRadius:12,border:`1px solid ${C.border}`,cursor:"pointer",background:C.surface,color:C.text.h,fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>📊</span>
          <div><div>Historial completo</div><div style={{fontSize:11,color:C.text.s,marginTop:2}}>{tx.length} movimientos en total</div></div>
        </button>
      </div>
      <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:8,textTransform:"uppercase"}}>📄 PDF · Imprimir / Compartir</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        <button onClick={()=>exportarPDF(true)} style={{padding:"14px 16px",borderRadius:12,border:`1px solid ${C.indigo}44`,cursor:"pointer",background:`${C.indigo}12`,color:C.text.h,fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>📄</span>
          <div><div style={{color:C.indigoLight}}>PDF · Solo {MONTHS[now.getMonth()]} {now.getFullYear()}</div>
          <div style={{fontSize:11,color:C.text.s,marginTop:2}}>Se abre ventana para imprimir o guardar</div></div>
        </button>
        <button onClick={()=>exportarPDF(false)} style={{padding:"14px 16px",borderRadius:12,border:`1px solid ${C.border}`,cursor:"pointer",background:C.surface,color:C.text.h,fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>📋</span>
          <div><div>PDF · Historial completo</div><div style={{fontSize:11,color:C.text.s,marginTop:2}}>{tx.length} movimientos · todas las páginas</div></div>
        </button>
      </div>
      <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:13,padding:"8px",fontWeight:600}}>Cancelar</button>
    </div>
  </div>;
}

function PrestamosModal({prestamos,onClose,onSave,onDelete,onToggle,prestamoForm,setPrestamoForm}){
  const pendientes=prestamos.filter(p=>!p.devuelto);
  const devueltos=prestamos.filter(p=>p.devuelto);
  const totalPendiente=pendientes.reduce((s,p)=>s+p.monto,0);
  const [cobroModal,setCobroModal]=useState(null); // prestamo a cobrar
  const sheet=useSheetDismiss(onClose);

  // Mini-modal para registrar cobro
  function CobroModal({prestamo,onClose3}){
    const [monto,setMonto]=useState(Number(prestamo.monto).toLocaleString("es-CO"));
    const raw=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
    const sheet3=useSheetDismiss(onClose3);
    function hm(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
    function confirmar(){
      if(!raw)return;
      onToggle(prestamo.id,true,raw,prestamo.nombre);
      onClose3();
    }
    return <div onClick={e=>{if(e.target===e.currentTarget)onClose3();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"flex-end",zIndex:700,animation:"fadeIn 0.15s ease"}}>
      <div onClick={e=>e.stopPropagation()} ref={sheet3.cardRef}
        style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
          border:"1px solid rgba(16,185,129,0.3)",padding:"24px 20px 40px",animation:"slideUp 0.2s cubic-bezier(0.34,1.56,0.64,1)",position:"relative",...sheet3.cardStyle}}>
        <SheetCloseBtn onClose={onClose3}/>
        <div {...sheet3.handleProps} style={{...sheet3.handleProps.style,display:"flex",justifyContent:"center",marginBottom:14,padding:"4px 0 8px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:6}}>🤝</div>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>{prestamo.nombre} te pagó</div>
          <div style={{fontSize:12,color:C.text.s,marginTop:4}}>Prestaste {COP(prestamo.monto)} · ¿Cuánto te devolvió?</div>
        </div>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:12,overflow:"hidden",
          border:`2px solid ${raw>0?"#10b981":C.border}`,transition:"border-color 0.2s",marginBottom:10}}>
          <span style={{padding:"0 14px",color:C.text.s,fontSize:18,lineHeight:"54px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={monto} onChange={hm}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 8px",height:54}}/>
        </div>
        {raw!==prestamo.monto&&raw>0&&<div style={{fontSize:11,color:raw>prestamo.monto?"#10b981":"#f59e0b",marginBottom:12,textAlign:"center",fontWeight:600}}>
          {raw>prestamo.monto?`✓ Te devolvió ${COP(raw-prestamo.monto)} extra (intereses)`:`⚠️ Te devolvió ${COP(prestamo.monto-raw)} menos de lo prestado`}
        </div>}
        <div style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.25)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:11,color:C.text.b,lineHeight:1.6}}>
          💡 Se sumará a tu disponible como <b style={{color:"#10b981"}}>devolución de préstamo</b>, sin afectar tus ingresos del mes.
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose3}
            style={{flex:1,padding:14,borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:700}}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!raw}
            style={{flex:2,padding:14,borderRadius:12,border:"none",fontSize:14,fontWeight:800,
              background:raw?"linear-gradient(135deg,#10b981,#059669)":surface("glass"),
              color:raw?"#000":C.text.s,cursor:raw?"pointer":"not-allowed"}}>
            {raw?`✓ Confirmar ${COP(raw)}`:"Ingresa el monto"}
          </button>
        </div>
      </div>
    </div>;
  }

  // Sub-modal para crear/editar
  function FormModal({initial,onClose2}){
    const isEdit=!!initial?.id;
    const [nombre,setNombre]=useState(initial?.nombre||"");
    const [monto,setMonto]=useState(initial?Number(initial.monto).toLocaleString("es-CO"):"");
    const [fecha,setFecha]=useState(initial?.fechaPrestamo||todayStr());
    const [desc,setDesc]=useState(initial?.descripcion||"");
    const [conf,setConf]=useState(false);
    const sheet2=useSheetDismiss(onClose2);
    const raw=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
    function hm(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
    function save(){
      if(!nombre.trim()||!raw)return;
      onSave({id:initial?.id||null,nombre:nombre.trim(),monto:raw,fechaPrestamo:fecha,descripcion:desc.trim(),devuelto:initial?.devuelto||false});
      onClose2();
    }
    return <div onClick={e=>{if(e.target===e.currentTarget)onClose2();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:600,animation:"fadeIn 0.18s ease"}}>
      <div onClick={e=>e.stopPropagation()} ref={sheet2.cardRef}
        style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
          border:`1px solid rgba(244,63,94,0.3)`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"90vh",overflowY:"auto",position:"relative",...sheet2.cardStyle}}>
        <SheetCloseBtn onClose={onClose2}/>
        <div {...sheet2.handleProps} style={{...sheet2.handleProps.style,display:"flex",justifyContent:"center",marginBottom:14,padding:"4px 0 8px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingRight:40}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>{isEdit?"Editar préstamo":"🤝 Nuevo préstamo"}</div>
        </div>
        <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:6,textTransform:"uppercase"}}>¿A quién le prestaste?</div>
        <input placeholder="ej: Juan, María, Pedro…" value={nombre} onChange={e=>setNombre(e.target.value)}
          style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,
            padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
        <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:6,textTransform:"uppercase"}}>Monto prestado (COP)</div>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:12,overflow:"hidden",
          border:`2px solid ${raw>0?"#f43f5e":C.border}`,transition:"border-color 0.2s",marginBottom:14}}>
          <span style={{padding:"0 14px",color:C.text.s,fontSize:18,lineHeight:"54px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={monto} onChange={hm}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 8px",height:54}}/>
        </div>
        <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:6,textTransform:"uppercase"}}>Fecha del préstamo</div>
        <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
          style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,
            padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
        <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:6,textTransform:"uppercase"}}>Motivo / Nota (opcional)</div>
        <input placeholder="ej: Para el arriendo, emergencia médica…" value={desc} onChange={e=>setDesc(e.target.value)}
          style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,
            padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:20}}/>
        <div style={{background:"rgba(244,63,94,0.08)",border:"1px solid rgba(244,63,94,0.25)",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
          <div style={{fontSize:12,color:"#f87171",fontWeight:700,marginBottom:3}}>
            {isEdit?"ℹ️ Edición de datos":"💸 Se descontará de tu disponible"}
          </div>
          <div style={{fontSize:11,color:C.text.b,lineHeight:1.6}}>
            {isEdit
              ?"Editar no modifica el movimiento original en tu historial. Si cambió el monto, elimina y crea uno nuevo."
              :"Al guardar se registra un gasto automático en 'Deudas · A terceros'. Cuando te paguen, registra el ingreso tú mismo con el monto que recibas."}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {isEdit&&!conf&&<button onClick={()=>setConf(true)}
            style={{padding:"16px 18px",borderRadius:14,border:"1px solid rgba(239,68,68,0.4)",background:"transparent",color:"#ef4444",cursor:"pointer",fontSize:22,flexShrink:0}}>🗑</button>}
          {isEdit&&conf&&<button onClick={()=>{onDelete(initial.id,initial.txId);onClose2();}}
            style={{padding:"16px 18px",borderRadius:14,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800,flexShrink:0,animation:"shake 0.3s ease"}}>¿Borrar?</button>}
          <button onClick={save} disabled={!nombre.trim()||!raw}
            style={{flex:1,padding:16,borderRadius:14,border:"none",fontSize:15,fontWeight:800,
              cursor:(!nombre.trim()||!raw)?"not-allowed":"pointer",
              background:(!nombre.trim()||!raw)?surface("glass"):"linear-gradient(135deg,#f43f5e,#be123c)",
              color:(!nombre.trim()||!raw)?C.text.s:"#fff"}}>
            {(!nombre.trim()||!raw)?"Completa los campos":isEdit?"✓ Guardar":"+ Registrar préstamo"}
          </button>
        </div>
      </div>
    </div>;
  }

  const RED="#f43f5e", AMBER="#f59e0b", EMERALD="#10b981";

  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:500,animation:"fadeIn 0.18s ease"}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        maxHeight:"90vh",overflowY:"auto",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div style={{padding:"0 20px 36px"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingRight:40}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text.h}}>🤝 Préstamos a terceros</div>
            <div style={{fontSize:12,color:C.text.s,marginTop:2}}>Registra lo que te deben</div>
          </div>
        </div>

        {/* Resumen */}
        {pendientes.length>0&&<div style={{
          background:"linear-gradient(135deg,rgba(244,63,94,0.15),rgba(244,63,94,0.05))",
          border:"1px solid rgba(244,63,94,0.3)",borderRadius:16,padding:"16px 18px",marginBottom:16,
        }}>
          <div style={{fontSize:11,color:"rgba(244,63,94,0.8)",fontWeight:700,letterSpacing:1,marginBottom:4}}>PENDIENTE DE COBRO</div>
          <div style={{fontSize:28,fontWeight:900,color:RED,letterSpacing:-1}}>{COP(totalPendiente)}</div>
          <div style={{fontSize:12,color:C.text.b,marginTop:4}}>{pendientes.length} préstamo{pendientes.length!==1?"s":""} activo{pendientes.length!==1?"s":""}</div>
        </div>}

        {/* Lista pendientes */}
        {pendientes.length>0&&<>
          <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:10,textTransform:"uppercase"}}>Pendientes</div>
          {pendientes.map(p=>{
            const dias=Math.floor((Date.now()-new Date(p.fechaPrestamo).getTime())/(1000*60*60*24));
            const urgente=dias>30;
            return <div key={p.id}
              style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,
                background:urgente?"rgba(244,63,94,0.08)":ink(0.04),
                borderRadius:16,padding:"14px 16px",
                border:`1px solid ${urgente?"rgba(244,63,94,0.3)":C.border}`}}>
              <div style={{width:44,height:44,borderRadius:13,background:"rgba(244,63,94,0.2)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                🤝
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:800,color:C.text.h}}>{p.nombre}</div>
                {p.descripcion&&<div style={{fontSize:11,color:C.text.s,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.descripcion}</div>}
                <div style={{fontSize:11,color:urgente?RED:AMBER,marginTop:2,fontWeight:600}}>
                  {dias===0?"Hoy":dias===1?"Hace 1 día":`Hace ${dias} días`}{urgente?" · ⚠️ Más de un mes":""}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:15,fontWeight:800,color:RED}}>{COP(p.monto)}</div>
                <div style={{display:"flex",gap:6,marginTop:6,justifyContent:"flex-end"}}>
                  <button onClick={()=>setPrestamoForm(p)}
                    style={{background:C.border,border:"none",borderRadius:8,padding:"5px 10px",color:C.text.b,cursor:"pointer",fontSize:11,fontWeight:700}}>
                    Editar
                  </button>
                  <button onClick={()=>setCobroModal(p)}
                    style={{background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.4)",borderRadius:8,padding:"5px 10px",color:EMERALD,cursor:"pointer",fontSize:11,fontWeight:700}}>
                    ✓ Me pagó
                  </button>
                </div>
              </div>
            </div>;
          })}
        </>}

        {/* Botón agregar */}
        <button onClick={()=>setPrestamoForm("new")}
          style={{width:"100%",padding:14,borderRadius:14,border:"1px dashed rgba(244,63,94,0.4)",background:"transparent",
            color:RED,cursor:"pointer",fontSize:14,fontWeight:700,marginTop:8,marginBottom:16}}>
          + Nuevo préstamo
        </button>

        {/* Devueltos */}
        {devueltos.length>0&&<>
          <div style={{fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,marginBottom:10,textTransform:"uppercase"}}>Devueltos ✓</div>
          {devueltos.map(p=><div key={p.id}
            style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,
              background:"rgba(16,185,129,0.05)",borderRadius:14,padding:"12px 16px",
              border:"1px solid rgba(16,185,129,0.15)",opacity:0.7}}>
            <div style={{width:38,height:38,borderRadius:10,background:"rgba(16,185,129,0.15)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>✓</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{p.nombre}</div>
              {p.fechaDevolucion&&<div style={{fontSize:11,color:C.text.s}}>Devuelto el {p.fechaDevolucion?.slice(8,10)}/{p.fechaDevolucion?.slice(5,7)}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:700,color:EMERALD}}>{COP(p.monto)}</div>
              <button onClick={()=>onToggle(p.id,false)}
                style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:10,fontWeight:600,marginTop:2}}>
                Deshacer
              </button>
            </div>
          </div>)}
        </>}

        {prestamos.length===0&&<div style={{textAlign:"center",padding:"28px 0 8px",color:C.text.s,fontSize:14,lineHeight:2.2}}>
          <div style={{fontSize:40,marginBottom:8}}>🤝</div>
          Sin préstamos registrados.<br/>
          <span style={{fontSize:12}}>Desde ahora, cuando prestas dinero<br/>úsalo aquí para hacer seguimiento.</span>
          <div style={{marginTop:14,padding:"12px 14px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:12,textAlign:"left"}}>
            <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:4}}>⚠️ Préstamos anteriores</div>
            <div style={{fontSize:11,color:C.text.b,lineHeight:1.6}}>Los gastos en "A terceros" que registraste antes no aparecen aquí porque no tienen seguimiento. Puedes agregarlos manualmente con + Nuevo préstamo.</div>
          </div>
        </div>}
      </div>
    </div>
    {prestamoForm&&<FormModal initial={prestamoForm==="new"?null:prestamoForm} onClose2={()=>setPrestamoForm(null)}/>}
    {cobroModal&&<CobroModal prestamo={cobroModal} onClose3={()=>setCobroModal(null)}/>}
  </div>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Verificar si un tx pertenece a un mes anterior al actual
function esMesPasado(dateStr){
  const d=parseDateSafe(dateStr), hoy=new Date();
  return d.getFullYear()<hoy.getFullYear()||(d.getFullYear()===hoy.getFullYear()&&d.getMonth()<hoy.getMonth());
}
// Últimos N días del mes actual
function diasRestantesMes(){
  const hoy=new Date();
  const ultimoDia=new Date(hoy.getFullYear(),hoy.getMonth()+1,0).getDate();
  return ultimoDia-hoy.getDate();
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null),[authLoading,setAL]=useState(true),[loginLoading,setLL]=useState(false);
  const [salario,setSalario]=useState(null),[showOnb,setShowOnb]=useState(false);
  const [salarioHistory,setSalarioHistory]=useState({}); // {"YYYY-M": monto}
  const [tx,setTx]=useState([]),[goals,setGoals]=useState([]);
  const [month,setMonth]=useState(now.getMonth()),[tab,setTab]=useState("home");
  const [filtroMainCat,setFiltroMainCat]=useState(null); // id de MAIN_CAT para filtrar en MovTab desde Análisis
  const [filtroMainCatOrigen,setFiltroMainCatOrigen]=useState(null); // de dónde vino: "analisis" | null
  const monthScrollRef=useRef(null);
  const [modal,setModal]=useState(null),[goalModal,setGoalModal]=useState(null);
  const [txLoading,setTxL]=useState(false);
  const [alertaGasto,setAlertaGasto]=useState(null);
  const [pagos,setPagos]=useState([]);
  const [presupuestos,setPresupuestos]=useState({}); // {catId: limite}
  const [menuOpen,setMenuOpen]=useState(false);
  const [pagoModal,setPagoModal]=useState(null); // null | "new" | pago
  const [pagoModalDia,setPagoModalDia]=useState(null); // día preseleccionado
  const [presupuestoModal,setPresupuestoModal]=useState(null); // cat obj
  const [budgetSetupOpen,setBudgetSetupOpen]=useState(false); // modal plan inteligente
  const [bannerDismissTick,setBannerDismissTick]=useState(0); // re-render al dismiss
  const [exportModal,setExportModal]=useState(false);
  const [catsCustom,setCatsCustom]=useState({}); // {mainId:[{id,label,icon}]}
  const [catPersonalModal,setCatPersonalModal]=useState(null); // main obj | null
  const [prestamos,setPrestamos]=useState([]);
  const [prestamosModal,setPrestamosModal]=useState(false);
  const [prestamoForm,setPrestamoForm]=useState(null);
  const [tema,setTema]=useState(()=>{
    const saved=localStorage.getItem("mf_tema");
    return (saved && TEMAS[saved]) ? saved : "navy";
  });
  const [cardStyle,setCardStyle]=useState(()=>localStorage.getItem("mf_card_style")||"solid");
  const [compacto,setCompacto]=useState(()=>localStorage.getItem("mf_compacto")==="1");
  function toggleCompacto(){setCompacto(v=>{const n=!v;localStorage.setItem("mf_compacto",n?"1":"0");return n;});}

  // Mutar C con el tema activo antes de cada render
  const paleta=TEMAS[tema]||TEMAS.navy;
  Object.assign(C,paleta);
  Object.assign(C.text,paleta.text);
  if(!paleta.isLight) C.isLight=false;
  // Mutar CS con el estilo activo
  CS.style=cardStyle;

  function cambiarTema(nuevoTema){
    setTema(nuevoTema);
    localStorage.setItem("mf_tema",nuevoTema);
  }
  function cambiarCardStyle(s){
    setCardStyle(s);
    localStorage.setItem("mf_card_style",s);
  }

  function changeTab(newTab){
    setTab(newTab); // El mes seleccionado se mantiene al cambiar de pestaña
    // Limpiar filtro por categoría si salimos de Movim (evita quedarse con filtro "invisible")
    if(newTab!=="mov"){
      setFiltroMainCat(null);
      // Solo limpiar el origen si no vamos a Análisis (para que × pueda regresar correctamente)
      if(newTab!=="anal") setFiltroMainCatOrigen(null);
    }
  }

  // ── Botón atrás del teléfono ─────────────────────────────────────────────
  const [exitConfirm,setExitConfirm]=useState(false);
  const exitTimer=useRef(null);
  // Refs para leer estado actual dentro del handler sin recrear el efecto
  const backRef=useRef({});
  backRef.current={
    modal,goalModal,pagoModal,prestamosModal,menuOpen,
    exportModal,catPersonalModal,budgetSetupOpen,presupuestoModal,
    tab,exitConfirm,filtroMainCat,
    setModal,setGoalModal,setPagoModal,setPrestamosModal,setMenuOpen,
    setExportModal,setCatPersonalModal,setBudgetSetupOpen,setPresupuestoModal,
    setTab,setExitConfirm,setFiltroMainCat,setFiltroMainCatOrigen,
  };

  useEffect(()=>{
    // Reemplazar el estado actual (no acumula) y luego empujar el nuestro encima.
    // replaceState limpia el estado actual; el pushState añade UNO encima.
    // El handler siempre repone ese uno con otro pushState, así nunca se agota.
    history.replaceState({mfApp:"base"},"");
    history.pushState({mfApp:"top"},"");
    const handler=()=>{
      const s=backRef.current;
      // Reponer INMEDIATAMENTE antes de cualquier lógica
      history.pushState({mfApp:"top"},"");
      // Si hay modal abierto, no hacer nada más — se cierra con X, drag o click afuera
      const anyModal=!!(s.modal||s.goalModal||s.pagoModal||s.prestamosModal||
        s.menuOpen||s.exportModal||s.catPersonalModal||s.budgetSetupOpen||s.presupuestoModal||s.filtroMainCat);
      if(anyModal) return;
      // Sin modal — ir a home si estás en otra pestaña
      if(s.tab!=="home"){s.setTab("home");return;}
      // En home → confirmación de salida
      clearTimeout(exitTimer.current);
      s.setExitConfirm(true);
      exitTimer.current=setTimeout(()=>s.setExitConfirm(false),3500);
    };
    window.addEventListener("popstate",handler);
    return()=>{window.removeEventListener("popstate",handler);clearTimeout(exitTimer.current);};
  },[]);

  // Bloquear scroll del fondo cuando hay modal abierto
  useEffect(()=>{
    const anyModal=!!(modal||goalModal||pagoModal||prestamosModal||exportModal||catPersonalModal||budgetSetupOpen||presupuestoModal);
    document.body.style.overflow=anyModal?"hidden":"";
    return()=>{document.body.style.overflow="";};
  },[modal,goalModal,pagoModal,prestamosModal,exportModal,catPersonalModal,budgetSetupOpen,presupuestoModal]);

  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setAL(false);}),[]);
  useEffect(()=>{if(!user){setSalario(null);setSalarioHistory({});setCatsCustom({});return;}
    getDoc(doc(db,"usuarios",user.uid)).then(snap=>{
      if(snap.exists()&&snap.data().salario){
        setSalario(snap.data().salario);
        setSalarioHistory(snap.data().salarioHistory||{});
        setCatsCustom(snap.data().catsCustom||{});
        setShowOnb(false);
      }else{setSalario(0);setShowOnb(true);}
    });},[user]);
  // Sincronizar _customSubsLookup global cuando catsCustom cambia
  useEffect(()=>{
    Object.keys(_customSubsLookup).forEach(k=>delete _customSubsLookup[k]);
    Object.entries(catsCustom).forEach(([mainId,subs])=>{
      const main=MAIN_CATS.find(m=>m.id===mainId);
      if(!main||!subs?.length)return;
      _customSubsLookup[mainId]=subs.map(s=>({...s,mainId,color:main.color}));
    });
  },[catsCustom]);
  // Guardar salario global (solo el valor actual — el historial se guarda en handleSalarioChange)
  useEffect(()=>{if(!user||salario===null||showOnb)return;setDoc(doc(db,"usuarios",user.uid),{salario},{merge:true});},[salario,user,showOnb]);
  useEffect(()=>{if(!user){setTx([]);return;}setTxL(true);return onSnapshot(query(collection(db,"usuarios",user.uid,"transacciones"),orderBy("createdAt","desc")),snap=>{setTx(snap.docs.map(d=>({id:d.id,...d.data()})));setTxL(false);});},[user]);
  useEffect(()=>{if(!user){setGoals([]);return;}return onSnapshot(query(collection(db,"usuarios",user.uid,"metas"),orderBy("createdAt","desc")),snap=>{setGoals(snap.docs.map(d=>({id:d.id,...d.data()})));});},[user]);
  useEffect(()=>{if(!user){setPagos([]);return;}return onSnapshot(query(collection(db,"usuarios",user.uid,"pagos_programados"),orderBy("createdAt","desc")),snap=>{setPagos(snap.docs.map(d=>({id:d.id,...d.data()})));});},[user]);
  useEffect(()=>{if(!user){setPresupuestos({});return;}
    return onSnapshot(collection(db,"usuarios",user.uid,"presupuestos"),snap=>{
      const p={};snap.docs.forEach(d=>{p[d.id]=d.data().limite;});
      setPresupuestos(p);
    });},[user]);
  useEffect(()=>{if(!user){setPrestamos([]);return;}
    return onSnapshot(query(collection(db,"usuarios",user.uid,"prestamos"),orderBy("createdAt","desc")),snap=>{
      setPrestamos(snap.docs.map(d=>({id:d.id,...d.data()})));
    });},[user]);

  // Listener del dismiss del banner de presupuesto (desde BudgetEngine)
  useEffect(()=>{
    const h=()=>setBannerDismissTick(t=>t+1);
    window.addEventListener('budget-banner-dismissed',h);
    return()=>window.removeEventListener('budget-banner-dismissed',h);
  },[]);

  // Cambiar salario: aplica desde el mes SIGUIENTE, guarda historial por mes
  async function handleSalarioChange(nuevoValor){
    if(!user||!nuevoValor)return;
    const y=now.getFullYear(), m=now.getMonth();
    // El nuevo salario aplica desde el mes siguiente
    const keyProximo=`${y}-${m+1<=11?m+1:0}`; // clave del mes siguiente
    const newHistory={...salarioHistory,[keyProximo]:nuevoValor};
    setSalario(nuevoValor);
    setSalarioHistory(newHistory);
    await setDoc(doc(db,"usuarios",user.uid),{salario:nuevoValor,salarioHistory:newHistory},{merge:true});
  }
  // Obtener el salario que correspondía a un mes/año específico
  function getSalarioDelMes(y,m){
    // Buscar la entrada de historial más reciente que sea <= al mes pedido
    let best=salario||0;
    Object.entries(salarioHistory).forEach(([key,val])=>{
      const [ky,km]=key.split("-").map(Number);
      // Si esta entrada es anterior o igual al mes pedido, y más reciente que la anterior best
      if(ky<y||(ky===y&&km<=m)){
        // Comparar con el best actual
        const bestKey=Object.keys(salarioHistory).filter(k=>{
          const [by,bm]=k.split("-").map(Number);
          return by<y||(by===y&&bm<=m);
        }).sort((a,b)=>{
          const [ay,am]=a.split("-").map(Number),[by,bm]=b.split("-").map(Number);
          return (ay*12+am)-(by*12+bm);
        }).pop();
        if(!bestKey||(ky*12+km)>=(bestKey.split("-").map(Number).reduce((a,b,i)=>i===0?a*12:a+b,0)))
          best=val;
      }
    });
    return best;
  }

  async function handleLogin(){setLL(true);try{await signInWithPopup(auth,provider);}catch(e){console.error(e);}setLL(false);}
  async function handleLogout(){await signOut(auth);setTx([]);setGoals([]);setTab("home");setSalario(null);setShowOnb(false);}
  function handleOnbSave(v){
    setSalario(v);
    setShowOnb(false);
    setDoc(doc(db,"usuarios",user.uid),{salario:v},{merge:true});
    // Crear Fondo Emergencias por defecto (se ejecuta después de que goals cargue)
    setTimeout(()=>crearMetaEmergencias(),800);
  }
  const handleSave=useCallback(async t=>{
    if(!user)return;
    const p={desc:t.desc,amount:t.amount,cat:t.cat,date:t.date,...(t.goalId?{goalId:t.goalId}:{})};
    if(t.id){
      await updateDoc(doc(db,"usuarios",user.uid,"transacciones",t.id),p);
    } else {
      await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{...p,createdAt:serverTimestamp()});
      // Disparar alerta si el gasto es significativo (solo gastos nuevos, no ingresos/ahorros)
      if(isGasto(t.cat) && !isAporteMeta(t) && (salario||0)>0){
        const pctDelIngreso=t.amount/(salario||1);
        if(pctDelIngreso>=0.3){
          setAlertaGasto({monto:t.amount, pct:pctDelIngreso, desc:t.desc||"este gasto"});
          setTimeout(()=>setAlertaGasto(null), 6000);
        }
      }
    }
  },[user,salario]);
  const handleDelete=useCallback(async id=>{if(!user)return;await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",id));},[user]);
  const handleGoalSave=useCallback(async g=>{
    if(!user)return;
    const pl={
      name:g.name,monto:g.monto||0,emoji:g.emoji||"⭐",
      esEmergencias:g.esEmergencias||false,
      saldoInicial:g.saldoInicial||0,
      ...(g.imagen?{imagen:g.imagen}:{imagen:null}),
    };
    if(g.id) await updateDoc(doc(db,"usuarios",user.uid,"metas",g.id),pl);
    else await addDoc(collection(db,"usuarios",user.uid,"metas"),{...pl,createdAt:serverTimestamp()});
  },[user]);

  // Crear meta de Emergencias por defecto al hacer onboarding
  const crearMetaEmergencias=useCallback(async()=>{
    if(!user)return;
    const existe=goals.some(g=>g.esEmergencias);
    if(existe)return;
    await addDoc(collection(db,"usuarios",user.uid,"metas"),{
      name:"Fondo Emergencias",emoji:"🛡️",monto:0,esEmergencias:true,
      createdAt:serverTimestamp(),
    });
  },[user,goals]);
  const handleGoalDelete=useCallback(async id=>{
    if(!user)return;
    // 1. Eliminar la meta
    await deleteDoc(doc(db,"usuarios",user.uid,"metas",id));
    // 2. Eliminar TODOS los movimientos de aporte vinculados a esa meta
    //    Así el saldo se recupera automáticamente
    const aportesDeEstaMeta=tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===id);
    await Promise.all(
      aportesDeEstaMeta.map(t=>deleteDoc(doc(db,"usuarios",user.uid,"transacciones",t.id)))
    );
  },[user,tx]);

  // ── Exportar movimientos a CSV ───────────────────────────────────────────
  function exportarCSV(soloMesActual=false){
    const txExport=soloMesActual
      ?tx.filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear()))
      :[...tx].sort((a,b)=>a.date.localeCompare(b.date));

    if(txExport.length===0){alert("No hay movimientos para exportar.");return;}

    const header=["Fecha","Descripción","Categoría","Subcategoría","Monto","Tipo"];
    const rows=txExport.map(t=>{
      const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
      const sub=getCatInfo(t.cat);
      const tipo=isIngreso(t.cat)?"Ingreso":isAporteMeta(t)||isSavingsLegacy(t.cat)?"Meta/Ahorro":"Gasto";
      const monto=(isIngreso(t.cat)||isAporteMeta(t)||isSavingsLegacy(t.cat)?1:-1)*t.amount;
      return [
        t.date,
        `"${(t.desc||"").replace(/"/g,'""')}"`,
        `"${main?.labelFull||main?.label||sub.label}"`,
        `"${sub.label}"`,
        monto,
        tipo,
      ].join(",");
    });

    const csv=[header.join(","),...rows].join("\n");
    const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const nombre=soloMesActual
      ?`finanzas_${MONTHS[now.getMonth()].toLowerCase()}_${now.getFullYear()}.csv`
      :`finanzas_completo_${now.getFullYear()}.csv`;
    a.href=url; a.download=nombre; a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
    setMenuOpen(false);
  }

  // ── Exportar movimientos a PDF ────────────────────────────────────────────
  function exportarPDF(soloMesActual=false){
    const txExport=soloMesActual
      ?[...tx].filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear()))
              .sort((a,b)=>a.date.localeCompare(b.date))
      :[...tx].sort((a,b)=>a.date.localeCompare(b.date));

    if(txExport.length===0){alert("No hay movimientos para exportar.");return;}

    // ── Canvas PDF manual ──────────────────────────────────────────────────
    // Dimensiones A4 a 96dpi: 794 x 1123px
    const PW=794, MARGIN=48, COL=PW-MARGIN*2;
    const ROW_H=28, HEADER_H=160, TABLE_HEAD_H=36;
    const rowsPerPage=Math.floor((1123-HEADER_H-TABLE_HEAD_H-60)/ROW_H);

    // Calcular páginas necesarias
    const totalPages=Math.ceil(txExport.length/rowsPerPage)||1;
    const pages=[];
    for(let p=0;p<totalPages;p++){
      pages.push(txExport.slice(p*rowsPerPage,(p+1)*rowsPerPage));
    }

    // Resumen financiero del export
    const totalIng=txExport.filter(t=>isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0);
    const totalGas=txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
    const totalApo=txExport.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);

    // Paleta PDF (sobre fondo blanco)
    const PDF={
      bg:"#ffffff", surface:"#f8fafc", border:"#e2e8f0",
      h:"#0f172a", b:"#334155", s:"#64748b",
      indigo:"#6366f1", emerald:"#10b981", red:"#ef4444", amber:"#f59e0b",
    };

    // Columnas tabla
    const COLS=[
      {label:"Fecha",     w:0.12, align:"left"},
      {label:"Descripción",w:0.30, align:"left"},
      {label:"Categoría", w:0.22, align:"left"},
      {label:"Tipo",      w:0.12, align:"center"},
      {label:"Monto",     w:0.24, align:"right"},
    ];

    function getColX(i){
      let x=MARGIN;
      for(let j=0;j<i;j++) x+=COLS[j].w*COL;
      return x;
    }

    function drawPage(canvas, pageRows, pageNum){
      const ctx=canvas.getContext("2d");
      ctx.fillStyle=PDF.bg;
      ctx.fillRect(0,0,PW,canvas.height);

      let y=MARGIN;

      // ── Header (solo página 1) ─────────────────────────────────────────
      if(pageNum===0){
        // Barra superior indigo
        ctx.fillStyle=PDF.indigo;
        ctx.fillRect(0,0,PW,6);

        // Título app
        ctx.fillStyle=PDF.indigo;
        ctx.font="bold 22px sans-serif";
        ctx.fillText("MIS FINANZAS PRO",MARGIN,y+28);

        // Nombre usuario + fecha
        ctx.fillStyle=PDF.b;
        ctx.font="13px sans-serif";
        ctx.fillText(user.displayName||"",MARGIN,y+48);
        const fechaDoc=new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"long",year:"numeric"});
        ctx.fillStyle=PDF.s;
        ctx.font="11px sans-serif";
        const titulo=soloMesActual
          ?`Movimientos de ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
          :"Historial completo de movimientos";
        ctx.fillText(titulo,MARGIN,y+66);
        ctx.fillText(`Generado el ${fechaDoc}`,MARGIN,y+82);

        y+=102;

        // ── Cards resumen ──────────────────────────────────────────────
        const cardW=(COL-16)/3, cardH=56;
        const cards=[
          {label:"Ingresos",val:COP(totalIng),color:PDF.emerald},
          {label:"Gastos",  val:COP(totalGas),color:PDF.red},
          {label:"En metas",val:COP(totalApo),color:PDF.indigo},
        ];
        cards.forEach((c,i)=>{
          const cx=MARGIN+i*(cardW+8);
          ctx.fillStyle=PDF.surface;
          ctx.beginPath();
          ctx.roundRect(cx,y,cardW,cardH,8);
          ctx.fill();
          ctx.strokeStyle=PDF.border;
          ctx.lineWidth=1;
          ctx.beginPath();
          ctx.roundRect(cx,y,cardW,cardH,8);
          ctx.stroke();
          ctx.fillStyle=c.color;
          ctx.font="bold 15px sans-serif";
          ctx.fillText(c.val,cx+12,y+22);
          ctx.fillStyle=PDF.s;
          ctx.font="10px sans-serif";
          ctx.fillText(c.label.toUpperCase(),cx+12,y+40);
        });
        y+=cardH+20;
      } else {
        // Páginas siguientes: barra + título compacto
        ctx.fillStyle=PDF.indigo;
        ctx.fillRect(0,0,PW,4);
        ctx.fillStyle=PDF.b;
        ctx.font="bold 13px sans-serif";
        ctx.fillText("MIS FINANZAS PRO · "+user.displayName,MARGIN,y+20);
        y+=36;
      }

      // ── Cabecera tabla ────────────────────────────────────────────────
      ctx.fillStyle=PDF.indigo;
      ctx.fillRect(MARGIN,y,COL,TABLE_HEAD_H);
      ctx.fillStyle="#fff";
      ctx.font="bold 11px sans-serif";
      COLS.forEach((col,i)=>{
        const cx=getColX(i);
        const cw=col.w*COL;
        if(col.align==="right") ctx.textAlign="right";
        else if(col.align==="center") ctx.textAlign="center";
        else ctx.textAlign="left";
        const tx2=col.align==="right"?cx+cw-6:col.align==="center"?cx+cw/2:cx+6;
        ctx.fillText(col.label.toUpperCase(),tx2,y+TABLE_HEAD_H/2+4);
      });
      ctx.textAlign="left";
      y+=TABLE_HEAD_H;

      // ── Filas ─────────────────────────────────────────────────────────
      pageRows.forEach((t,idx)=>{
        const isEven=idx%2===0;
        ctx.fillStyle=isEven?PDF.bg:PDF.surface;
        ctx.fillRect(MARGIN,y,COL,ROW_H);

        // Línea separadora
        ctx.strokeStyle=PDF.border;
        ctx.lineWidth=0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN,y+ROW_H);
        ctx.lineTo(MARGIN+COL,y+ROW_H);
        ctx.stroke();

        const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
        const sub=getCatInfo(t.cat);
        const esIng=isIngreso(t.cat);
        const esMeta=isAporteMeta(t)||isSavingsLegacy(t.cat);
        const tipo=esIng?"Ingreso":esMeta?"Meta":"Gasto";
        const tipoColor=esIng?PDF.emerald:esMeta?PDF.indigo:PDF.red;
        const monto=(esIng||esMeta?1:-1)*t.amount;
        const catLabel=main?`${main.label} · ${sub.label}`:sub.label;

        const cells=[
          t.date?.slice(5).replace("-","/")+"/"+(t.date?.slice(0,4)),
          t.desc||"-",
          catLabel,
          tipo,
          COP(monto),
        ];

        ctx.font="11px sans-serif";
        COLS.forEach((col,i)=>{
          const cx=getColX(i);
          const cw=col.w*COL;
          // Color especial para tipo y monto
          if(i===3) ctx.fillStyle=tipoColor;
          else if(i===4) ctx.fillStyle=monto>=0?PDF.emerald:PDF.red;
          else ctx.fillStyle=PDF.h;

          const text=cells[i]||"";
          // Truncar si es muy largo
          const maxChars=Math.floor(cw/6.5);
          const display=text.length>maxChars?text.slice(0,maxChars-1)+"…":text;

          if(col.align==="right"){ ctx.textAlign="right"; ctx.fillText(display,cx+cw-6,y+ROW_H/2+4); }
          else if(col.align==="center"){ ctx.textAlign="center"; ctx.fillText(display,cx+cw/2,y+ROW_H/2+4); }
          else { ctx.textAlign="left"; ctx.fillText(display,cx+6,y+ROW_H/2+4); }
        });
        ctx.textAlign="left";
        y+=ROW_H;
      });

      // ── Pie de página ─────────────────────────────────────────────────
      const pyFoot=canvas.height-24;
      ctx.fillStyle=PDF.indigo;
      ctx.fillRect(0,canvas.height-3,PW,3);
      ctx.fillStyle=PDF.s;
      ctx.font="10px sans-serif";
      ctx.textAlign="left";
      ctx.fillText("mis-finanzas-weld.vercel.app",MARGIN,pyFoot);
      ctx.textAlign="right";
      ctx.fillText(`Página ${pageNum+1} de ${totalPages}`,PW-MARGIN,pyFoot);
      ctx.textAlign="left";
    }

    // ── Generar páginas y combinar en PDF ─────────────────────────────────
    // PDF manual: cada página es un canvas → dataURL → PDF con encabezado mínimo
    const pageHeight=Math.max(
      HEADER_H+TABLE_HEAD_H+(rowsPerPage*ROW_H)+60,
      1123
    );

    // Construir PDF binario básico (solo imágenes JPEG por página)
    const jpegs=[];
    pages.forEach((pageRows,i)=>{
      const canvas=document.createElement("canvas");
      canvas.width=PW;
      canvas.height=pageHeight;
      drawPage(canvas,pageRows,i);
      jpegs.push(canvas.toDataURL("image/jpeg",0.92));
    });

    // Generar PDF con objetos mínimos
    function b64toBytes(b64){ const bin=atob(b64.split(",")[1]); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; }

    let pdf="%PDF-1.4\n";
    const offsets=[];
    let obj=1;

    function addObj(content){ offsets.push(pdf.length); pdf+=`${obj} 0 obj\n${content}\nendobj\n`; return obj++; }

    // Catalog + Pages placeholder
    const catalogId=obj; addObj("<</Type /Catalog /Pages 2 0 R>>");
    const pagesId=obj;   addObj(`<</Type /Pages /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(" ")}] /Count ${pages.length}>>`);

    pages.forEach((_, pi)=>{
      const imgBytes=b64toBytes(jpegs[pi]);
      const imgId=obj;
      offsets.push(pdf.length);
      pdf+=`${obj} 0 obj\n<</Type /XObject /Subtype /Image /Width ${PW} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length}>>\nstream\n`;
      const pdfBytes=new TextEncoder().encode(pdf);
      const combined=new Uint8Array(pdfBytes.length+imgBytes.length);
      combined.set(pdfBytes); combined.set(imgBytes,pdfBytes.length);
      // Restart building as string after binary — use blob approach instead
      obj++;

      const pageId=obj;
      addObj(`<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${pageHeight}] /Contents ${pageId+1} 0 R /Resources <</XObject <</Im${pi} ${imgId} 0 R>>>>>>`);
      addObj(`<</Length ${`q ${PW} 0 0 ${pageHeight} 0 0 cm /Im${pi} Do Q`.length}>>\nstream\nq ${PW} 0 0 ${pageHeight} 0 0 cm /Im${pi} Do Q\nendstream`);
    });

    // Usar enfoque alternativo más simple: generar HTML que el navegador imprime como PDF
    const win=window.open("","_blank");
    if(!win){alert("Permite ventanas emergentes para exportar el PDF.");return;}

    const estilos=`
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'DM Sans',system-ui,sans-serif;background:#f1f5f9;padding:24px;}
      .page{background:#fff;width:210mm;min-height:297mm;margin:0 auto 24px;padding:20mm 16mm;
            box-shadow:0 4px 24px rgba(0,0,0,0.12);border-radius:4px;position:relative;}
      .bar{height:6px;background:#6366f1;margin:-20mm -16mm 16mm;border-radius:4px 4px 0 0;}
      .logo{font-size:20px;font-weight:900;color:#6366f1;letter-spacing:-0.5px;}
      .user{font-size:13px;color:#334155;margin-top:4px;}
      .titulo{font-size:11px;color:#64748b;margin-top:2px;}
      .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;}
      .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}
      .card-val{font-size:15px;font-weight:800;margin-bottom:4px;}
      .card-lbl{font-size:10px;color:#64748b;font-weight:700;letter-spacing:1px;}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px;}
      thead tr{background:#6366f1;}
      thead th{color:#fff;padding:9px 8px;text-align:left;font-size:10px;letter-spacing:0.5px;}
      thead th:last-child{text-align:right;}
      thead th:nth-child(4){text-align:center;}
      tbody tr:nth-child(even){background:#f8fafc;}
      tbody tr:hover{background:#f1f5f9;}
      td{padding:7px 8px;color:#0f172a;border-bottom:1px solid #e2e8f0;}
      td.monto{text-align:right;font-weight:700;}
      td.tipo{text-align:center;}
      td.pos{color:#10b981;}
      td.neg{color:#ef4444;}
      td.meta{color:#6366f1;}
      .footer{position:absolute;bottom:10mm;left:16mm;right:16mm;
              display:flex;justify-content:space-between;
              font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:6px;}
      @media print{
        body{background:#fff;padding:0;}
        .page{box-shadow:none;margin:0;border-radius:0;page-break-after:always;}
        .page:last-child{page-break-after:avoid;}
        .no-print{display:none;}
      }
    `;

    const fechaDoc=new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"long",year:"numeric"});
    const titulo=soloMesActual
      ?`Movimientos de ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
      :"Historial completo de movimientos";

    const pagesHTML=pages.map((pageRows,pi)=>{
      const rows=pageRows.map(t=>{
        const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
        const sub=getCatInfo(t.cat);
        const esIng=isIngreso(t.cat);
        const esMeta2=isAporteMeta(t)||isSavingsLegacy(t.cat);
        const tipo=esIng?"Ingreso":esMeta2?"Meta":"Gasto";
        const tipoClass=esIng?"pos":esMeta2?"meta":"neg";
        const monto=(esIng||esMeta2?1:-1)*t.amount;
        const catLabel=main?`${main.label} · ${sub.label}`:sub.label;
        const fecha=t.date?`${t.date.slice(8,10)}/${t.date.slice(5,7)}/${t.date.slice(0,4)}`:"";
        return `<tr>
          <td>${fecha}</td>
          <td>${t.desc||"-"}</td>
          <td>${catLabel}</td>
          <td class="tipo ${tipoClass}">${tipo}</td>
          <td class="monto ${monto>=0?"pos":"neg"}">${COP(monto)}</td>
        </tr>`;
      }).join("");

      const esP1=pi===0;
      return `<div class="page">
        <div class="bar"></div>
        ${esP1?`
          <div class="logo">💰 MIS FINANZAS PRO</div>
          <div class="user">${user.displayName||""} · ${user.email||""}</div>
          <div class="titulo">${titulo} · Generado el ${fechaDoc}</div>
          <div class="cards">
            <div class="card"><div class="card-val" style="color:#10b981">${COP(totalIng)}</div><div class="card-lbl">INGRESOS</div></div>
            <div class="card"><div class="card-val" style="color:#ef4444">${COP(totalGas)}</div><div class="card-lbl">GASTOS</div></div>
            <div class="card"><div class="card-val" style="color:#6366f1">${COP(totalApo)}</div><div class="card-lbl">EN METAS</div></div>
          </div>
        `:`<div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:12px;">MIS FINANZAS PRO · ${user.displayName||""} · ${titulo}</div>`}
        <table>
          <thead><tr>
            <th style="width:11%">FECHA</th>
            <th style="width:30%">DESCRIPCIÓN</th>
            <th style="width:25%">CATEGORÍA</th>
            <th style="width:10%">TIPO</th>
            <th style="width:24%">MONTO</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          <span>mis-finanzas-weld.vercel.app</span>
          <span>Página ${pi+1} de ${pages.length}</span>
        </div>
      </div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Mis Finanzas · ${titulo}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800;900&display=swap" rel="stylesheet">
      <style>${estilos}</style>
    </head><body>
      <div class="no-print" style="text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
          🖨️ Imprimir / Guardar PDF
        </button>
        <span style="margin-left:16px;font-size:13px;color:#64748b;">En el diálogo de impresión selecciona "Guardar como PDF"</span>
      </div>
      ${pagesHTML}
    </body></html>`);
    win.document.close();
    setExportModal(false);
    setMenuOpen(false);
  }
  const handlePresupuestoSave=useCallback(async(catId,limite)=>{
    if(!user)return;
    if(!limite||limite<=0){
      // Eliminar presupuesto si se borra el límite
      await deleteDoc(doc(db,"usuarios",user.uid,"presupuestos",catId));
    } else {
      await setDoc(doc(db,"usuarios",user.uid,"presupuestos",catId),{limite});
    }
  },[user]);
 
  // Guardar varios presupuestos de golpe (plan inteligente)
  const handleBudgetBulkSave=useCallback(async(presupuestosObj)=>{
    if(!user)return;
    const tareas=Object.entries(presupuestosObj).map(([catId,limite])=>
      setDoc(doc(db,"usuarios",user.uid,"presupuestos",catId),{limite})
    );
    await Promise.all(tareas);
  },[user]);

  // Guardar subcategorías personalizadas — campo catsCustom en usuarios/{uid}
  const handleCatCustomSave=useCallback(async(mainId,subs)=>{
    if(!user)return;
    const updated={...catsCustom,[mainId]:subs};
    setCatsCustom(updated);
    await setDoc(doc(db,"usuarios",user.uid),{catsCustom:updated},{merge:true});
  },[user,catsCustom]);

  // CRUD préstamos a terceros
  const handlePrestamoSave=useCallback(async p=>{
    if(!user)return;
    const pl={nombre:p.nombre,monto:p.monto,fechaPrestamo:p.fechaPrestamo,descripcion:p.descripcion||"",devuelto:p.devuelto||false};
    if(p.id){
      // Edición — solo actualiza datos del préstamo, no toca la tx original
      await updateDoc(doc(db,"usuarios",user.uid,"prestamos",p.id),pl);
    } else {
      // Nuevo préstamo — crear tx de gasto automáticamente en "A terceros"
      // Asegurar formato YYYY-MM-DD
      const fechaFmt = p.fechaPrestamo && /^\d{4}-\d{2}-\d{2}$/.test(p.fechaPrestamo)
        ? p.fechaPrestamo : todayStr();
      const txRef=await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
        desc:`Préstamo a ${p.nombre}${p.descripcion?` · ${p.descripcion}`:""}`,
        amount:p.monto,
        cat:"prestamo_tercero",
        date:fechaFmt,
        createdAt:serverTimestamp(),
      });
      // Guardar con referencia a la tx para poder eliminarla si se borra el préstamo
      await addDoc(collection(db,"usuarios",user.uid,"prestamos"),{...pl,txId:txRef.id,createdAt:serverTimestamp()});
    }
  },[user]);
  const handlePrestamoDelete=useCallback(async(id,txId)=>{
    if(!user)return;
    // Obtener datos del préstamo para saber si hay tx de devolución
    const snap=await getDoc(doc(db,"usuarios",user.uid,"prestamos",id));
    const txDevId=snap.data()?.txDevolucionId;
    // Eliminar el préstamo
    await deleteDoc(doc(db,"usuarios",user.uid,"prestamos",id));
    // Eliminar tx de gasto original
    if(txId){
      try{ await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",txId)); }catch(e){}
    }
    // Eliminar tx de devolución si existe
    if(txDevId){
      try{ await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",txDevId)); }catch(e){}
    }
  },[user]);
  const handlePrestamoToggle=useCallback(async(id,devuelto,montoDevuelto,nombre)=>{
    if(!user)return;
    if(devuelto&&montoDevuelto>0){
      // Crear tx de devolución y guardar su id en el préstamo
      const txDev=await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
        desc:`Devolución de ${nombre}`,
        amount:montoDevuelto,
        cat:"prestamo_devuelto",
        date:todayStr(),
        createdAt:serverTimestamp(),
      });
      await updateDoc(doc(db,"usuarios",user.uid,"prestamos",id),{
        devuelto:true,
        fechaDevolucion:todayStr(),
        txDevolucionId:txDev.id,
        montoDevuelto,
      });
    } else {
      // Deshacer devolución — buscar y eliminar la tx de devolución si existe
      const snap=await getDoc(doc(db,"usuarios",user.uid,"prestamos",id));
      const txDevId=snap.data()?.txDevolucionId;
      if(txDevId){
        try{ await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",txDevId)); }catch(e){}
      }
      await updateDoc(doc(db,"usuarios",user.uid,"prestamos",id),{
        devuelto:false,
        fechaDevolucion:null,
        txDevolucionId:null,
        montoDevuelto:null,
      });
    }
  },[user]);

  // CRUD pagos programados
  const handlePagoSave=useCallback(async p=>{
    if(!user)return;
    const pl={
      nombre:p.nombre,monto:p.monto,cat:p.cat,dia:p.dia,
      frecuencia:p.frecuencia||"mensual",activo:true,
      // Para pagos únicos guardamos el mes y año en que aplica
      ...(p.frecuencia==="unico"
        ?{mesUnico:p.mesUnico??now.getMonth(), anioUnico:p.anioUnico??now.getFullYear()}
        :{}),
    };
    if(p.id) await updateDoc(doc(db,"usuarios",user.uid,"pagos_programados",p.id),pl);
    else await addDoc(collection(db,"usuarios",user.uid,"pagos_programados"),{...pl,createdAt:serverTimestamp()});
  },[user]);
  const handlePagoDelete=useCallback(async id=>{
    if(!user)return;
    await deleteDoc(doc(db,"usuarios",user.uid,"pagos_programados",id));
  },[user]);
  const handlePagoConfirmar=useCallback(async p=>{
    if(!user)return;
    const fecha=todayStr();
    await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
      desc:p.nombre,amount:p.monto,cat:p.cat,date:fecha,
      createdAt:serverTimestamp(),pagoId:p.id,
    });
  },[user]);
  const handlePagoNoPague=useCallback(async p=>{
    // No pagué — eliminar el pago programado
    if(!user)return;
    await deleteDoc(doc(db,"usuarios",user.uid,"pagos_programados",p.id));
  },[user]);
  const handlePagoPostponer=useCallback(async p=>{
    // Recordar mañana — mover el día al día siguiente
    if(!user)return;
    const maniana=new Date(); maniana.setDate(maniana.getDate()+1);
    const nuevoDia=maniana.getDate();
    await updateDoc(doc(db,"usuarios",user.uid,"pagos_programados",p.id),{dia:nuevoDia});
  },[user]);

  // Pagos pendientes HOY (día del mes coincide con dia programado)
  const hoyDia=now.getDate();
  const pagosPendientesHoy=pagos.filter(p=>{
    if(!p.activo)return false;
    if(p.dia!==hoyDia)return false;
    // Verificar que no haya sido confirmado hoy ya
    const yaConfirmado=tx.some(t=>t.pagoId===p.id&&isMonth(t.date,now.getMonth(),now.getFullYear()));
    return !yaConfirmado;
  });

  const monthTx=tx.filter(t=>isMonth(t.date,month,now.getFullYear()));
  const gastosTx=monthTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t));
  const ingresosTx=monthTx.filter(t=>isIngreso(t.cat));
  const devolucionesTx=monthTx.filter(t=>isDevolucion(t.cat));
  const extrasTx=monthTx.filter(t=>isIngresoExtra(t.cat)); // apuestas, ventas, regalos — no cuentan como salario
  const prestamosTx=monthTx.filter(t=>isPrestamoTercero(t.cat)); // préstamos a terceros — salen del saldo, no son gasto
  const aporteMesAll=monthTx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat));
  const totalGasto=gastosTx.reduce((s,t)=>s+t.amount,0);
  const totalDevoluciones=devolucionesTx.reduce((s,t)=>s+t.amount,0);
  const totalExtras=extrasTx.reduce((s,t)=>s+t.amount,0);
  const totalPrestamos=prestamosTx.reduce((s,t)=>s+t.amount,0);
  const totalAportes=aporteMesAll.reduce((s,t)=>s+t.amount,0);
  const sal=salario||0;
  const salDelMes=getSalarioDelMes(now.getFullYear(),month);
  const ingresosExtra=ingresosTx.reduce((s,t)=>s+t.amount,0);
  const totalIngresoMes=salDelMes+ingresosExtra; // solo salario + ingresos reales de trabajo

  // Saldo acumulativo por mes — salario base + ingresos extra registrados
  function getSaldoAcumulado() {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // mes REAL de hoy

    // Solo acumular hasta el mes actual real como máximo.
    // Si el mes seleccionado es el inmediatamente siguiente al actual, mostramos
    // el sobrante del mes actual como proyección. Más allá de eso: $0.
    const esMesFuturoInmediato = month === currentMonth + 1 && now.getFullYear() === currentYear;
    const esMesFuturoLejano = month > currentMonth + 1;
    if (esMesFuturoLejano) return 0;

    // El límite hasta donde acumulamos:
    // - mes actual o pasado → acumula hasta ese mes (excluyéndolo)
    // - mes siguiente inmediato → acumula hasta currentMonth (inclusive, o sea hasta fin de mes actual)
    const limiteMes = esMesFuturoInmediato ? currentMonth + 1 : month;
    const limiteYear = currentYear;

    // 1. Solo tx de meses anteriores al límite
    const txPasadas = tx.filter(t => {
      const d = parseDateSafe(t.date);
      if (d.getFullYear() < limiteYear) return true;
      if (d.getFullYear() === limiteYear && d.getMonth() < limiteMes) return true;
      return false;
    });

    if (txPasadas.length === 0) return 0;

    // 2. Encontrar el mes más antiguo con transacciones
    let minYear = currentYear, minMes = limiteMes;
    txPasadas.forEach(t => {
      const d = parseDateSafe(t.date);
      if (d.getFullYear() < minYear || (d.getFullYear() === minYear && d.getMonth() < minMes)) {
        minYear = d.getFullYear();
        minMes = d.getMonth();
      }
    });

    // 3. Agrupar transacciones por año-mes
    const porMes = {};
    txPasadas.forEach(t => {
      const d = parseDateSafe(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!porMes[key]) porMes[key] = { ingresos: 0, gastos: 0, ahorros: 0, devoluciones: 0, extras: 0, prestamos: 0 };
      if (isIngreso(t.cat)) porMes[key].ingresos += t.amount;
      else if (isDevolucion(t.cat)) porMes[key].devoluciones += t.amount;
      else if (isIngresoExtra(t.cat)) porMes[key].extras += t.amount;
      else if (isPrestamoTercero(t.cat)) porMes[key].prestamos += t.amount;
      else if (isAporteMeta(t)||isSavingsLegacy(t.cat)) porMes[key].ahorros += t.amount;
      else porMes[key].gastos += t.amount;
    });

    // 4. Recorrer mes a mes en cadena — salario del mes correcto + extras + sobrante
    let saldoAcumulado = 0;
    let y = minYear, m = minMes;
    while (y < limiteYear || (y === limiteYear && m < limiteMes)) {
      const key = `${y}-${m}`;
      const datos = porMes[key] || { ingresos: 0, gastos: 0, ahorros: 0, devoluciones: 0, extras: 0, prestamos: 0 };
      const salMes = getSalarioDelMes(y, m);
      const ingMes = salMes + datos.ingresos;
      const disponibleMes = ingMes + saldoAcumulado - datos.gastos - datos.ahorros - (datos.prestamos||0) + datos.devoluciones + datos.extras;
      saldoAcumulado = Math.max(disponibleMes, 0);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return saldoAcumulado;
  }

  const saldoAnterior=getSaldoAcumulado();
  const saldo=totalIngresoMes+saldoAnterior-totalGasto-totalAportes-totalPrestamos+totalDevoluciones+totalExtras;
  const tasaAhorr=totalIngresoMes>0?totalAportes/totalIngresoMes:0;
  const totalDisponibleBase=totalIngresoMes+saldoAnterior;
  const pctUsado=totalDisponibleBase>0?totalGasto/totalDisponibleBase:0;
  const totalEnMetas=tx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
  const saldoColor=saldo>sal*0.4?C.emerald:saldo>sal*0.15?C.amber:C.red;
  const animSaldo=useCountUp(Math.max(saldo,0));
  const animGasto=useCountUp(totalGasto,800);
  const animAportes=useCountUp(totalAportes,850);
  // Compartidos entre HomeTab y AnalisisTab — subidos al scope de App()
  const byMain=MAIN_CATS.map(m=>({...m,total:gastosTx.filter(t=>m.subs.some(s=>s.id===t.cat)||(catsCustom[m.id]||[]).some(s=>s.id===t.cat)).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0||(presupuestos[c.id]||0)>0).sort((a,b)=>(b.total-a.total)||((presupuestos[b.id]||0)-(presupuestos[a.id]||0)));
  const totalMesesConDatos=new Set(tx.map(t=>{const d=parseDateSafe(t.date);return `${d.getFullYear()}-${d.getMonth()}`;})).size;
  function getAportado(gid){
    // Acumulado histórico = saldo inicial (ahorros previos) + aportes registrados en la app
    const meta=goals.find(g=>g.id===gid);
    const saldoInicial=meta?.saldoInicial||0;
    const aportesApp=tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===gid)
             .reduce((s,t)=>s+t.amount,0);
    return saldoInicial+aportesApp;
  }
  function getAportadoMes(gid,m,y){
    return tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===gid&&isMonth(t.date,m,y))
             .reduce((s,t)=>s+t.amount,0);
  }

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap');
    html,body{background:${C.bg}!important;margin:0;padding:0;}
    *{box-sizing:border-box;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.75}}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:0.4}100%{transform:translate(-50%,-50%) scale(20);opacity:0}}
    @keyframes fadeSlideUp{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
    @keyframes fadeSlideDown{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(6px)}}
    input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6);}
    input::placeholder{color:${paleta.text.s}44;}
    ::-webkit-scrollbar{display:none;}
  `;

  if(authLoading)return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text.b,fontFamily:"'DM Sans',sans-serif",fontSize:15}}>Cargando...</div>;
  if(!user)return <LoginScreen onLogin={handleLogin} loading={loginLoading}/>;
  if(salario===null)return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text.b,fontFamily:"'DM Sans',sans-serif",fontSize:15}}>Cargando perfil...</div>;
  if(showOnb)return <OnboardingScreen user={user} onSave={handleOnbSave}/>;

  // ── Selector de mes inteligente — solo meses relevantes ─────────────────
  const MonthSelector=()=>{
    const currentM=now.getMonth(), currentY=now.getFullYear();

    // Construir lista de meses visibles:
    // - Todos los meses/años con al menos 1 transacción
    // - El mes actual siempre
    // - El mes siguiente (proyección)
    const conTx=new Set(tx.map(t=>{const d=parseDateSafe(t.date);return `${d.getFullYear()}-${d.getMonth()}`;}));
    conTx.add(`${currentY}-${currentM}`);           // mes actual siempre
    conTx.add(`${currentY}-${currentM+1<=11?currentM+1:0}`); // siguiente

    // Convertir a lista ordenada de {year, month}
    const lista=[...conTx].map(k=>{const[y,m]=k.split("-").map(Number);return{y,m};})
      .sort((a,b)=>a.y!==b.y?a.y-b.y:a.m-b.m);

    // Agrupar por año
    const porAnio={};
    lista.forEach(({y,m})=>{if(!porAnio[y])porAnio[y]=[];porAnio[y].push(m);});
    const years=Object.keys(porAnio).map(Number).sort((a,b)=>a-b);

    useEffect(()=>{
      if(!monthScrollRef.current)return;
      const active=monthScrollRef.current.querySelector("[data-active='true']");
      if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
    },[]);

    return <div ref={monthScrollRef} style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:14,paddingTop:2,scrollbarWidth:"none",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
      {years.map(y=><div key={y} style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
        {years.length>1&&<span style={{fontSize:10,color:C.text.s,fontWeight:500,letterSpacing:0.8,padding:"0 4px",flexShrink:0,opacity:0.6}}>{y}</span>}
        {porAnio[y].map(i=>{
          const isNext=y===currentY&&i===currentM+1;
          const isActive=month===i&&now.getFullYear()===y;
          return <button key={i} data-active={isActive?"true":"false"}
            onClick={()=>{setMonth(i);}}
            style={{
              flexShrink:0, padding:"8px 18px", borderRadius:99, border:"none", cursor:"pointer",
              fontSize:12, fontWeight:isActive?700:500,
              background:isActive?C.emerald:isNext?`${C.indigo}18`:C.card,
              color:isActive?"#000":isNext?C.indigoLight:C.text.s,
              boxShadow:isActive?"none":elev("card"),
              transition:"all 0.2s",
            }}>{MONTHS_S[i]}</button>;
        })}
      </div>)}
    </div>;
  };

  // ── Resumen Semanal — aparece solo los lunes ─────────────────────────────
  const ResumenSemanal=()=>{
    const esLunes = now.getDay()===1;
    if(!esLunes) return null;

    const DISMISS_KEY=`resumen_semanal_${now.getFullYear()}-${now.getMonth()}-${Math.floor(now.getDate()/7)}`;
    const [visible,setVisible]=useState(()=>{
      try{ return localStorage.getItem(DISMISS_KEY)!=="1"; }catch{ return true; }
    });
    if(!visible) return null;

    // Semana pasada: lunes a domingo anteriores
    const hoy=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const lunesPasado=new Date(hoy); lunesPasado.setDate(hoy.getDate()-7);
    const domingoPasado=new Date(hoy); domingoPasado.setDate(hoy.getDate()-1);

    const txSemana=tx.filter(t=>{
      const d=parseDateSafe(t.date);
      return d>=lunesPasado && d<=domingoPasado;
    });

    const gastoSemana=txSemana.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
    if(gastoSemana===0) return null;

    // Semana anterior (hace 2 semanas)
    const lunesAnterior=new Date(lunesPasado); lunesAnterior.setDate(lunesPasado.getDate()-7);
    const domingoAnterior=new Date(lunesPasado); domingoAnterior.setDate(lunesPasado.getDate()-1);
    const txSemanaAnterior=tx.filter(t=>{
      const d=parseDateSafe(t.date);
      return d>=lunesAnterior && d<=domingoAnterior;
    });
    const gastoAnterior=txSemanaAnterior.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);

    const diff=gastoAnterior>0?Math.round((gastoSemana-gastoAnterior)/gastoAnterior*100):null;
    const subio=diff!==null&&diff>0;
    const igual=diff===null;
    const color=subio?C.amber:C.emerald;
    const emoji=subio?"📈":"📉";

    // Top categoría de la semana
    const porCat={};
    txSemana.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).forEach(t=>{
      const main=MAIN_CATS.find(m=>m.subs.some(s=>s.id===t.cat));
      if(!main) return;
      porCat[main.id]=(porCat[main.id]||{cat:main,total:0});
      porCat[main.id].total+=t.amount;
    });
    const topCat=Object.values(porCat).sort((a,b)=>b.total-a.total)[0];

    const dismiss=()=>{
      try{localStorage.setItem(DISMISS_KEY,"1");}catch{}
      setVisible(false);
    };

    return <div style={{
      background:C.card, borderRadius:20, padding:"18px 18px 16px",
      marginBottom:16, boxShadow:elev("card"), position:"relative",
      animation:"fadeIn 0.3s ease",
    }}>
      <button onClick={dismiss} style={{position:"absolute",top:10,right:12,background:"none",border:"none",color:C.text.s,fontSize:16,cursor:"pointer",opacity:0.5,padding:4,lineHeight:1}}>×</button>
      <div style={{fontSize:11,color:C.text.s,fontWeight:600,letterSpacing:1.4,textTransform:"uppercase",marginBottom:10}}>Semana pasada</div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:8}}>
        <div>
          <div style={{fontSize:11,color:C.text.s,marginBottom:4}}>Total gastado</div>
          <div style={{fontSize:28,fontWeight:700,color:C.text.h,letterSpacing:-0.5}}>{COP(gastoSemana)}</div>
        </div>
        {!igual&&<div style={{
          background:`${color}15`, borderRadius:10, padding:"6px 12px",
          fontSize:12, fontWeight:700, color, marginBottom:4,
        }}>{emoji} {subio?"+":""}{diff}% vs semana anterior</div>}
      </div>
      <div style={{fontSize:12,color:C.text.b,marginBottom:12,lineHeight:1.5}}>
        {igual?"Primera semana con datos — sigue registrando 👍"
          :diff<=-20?"Excelente semana 🎉 — gastaste mucho menos que la anterior"
          :diff<=-5?"Buena semana — vas controlando bien los gastos"
          :diff<=5?"Semana estable — similar a la anterior"
          :diff<=20?"Semana un poco más activa — normal si hubo algo especial"
          :"Semana de más gasto — revisa qué categoría subió"}
      </div>
      {topCat&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:ink(0.04),borderRadius:12}}>
        <div style={{width:36,height:36,borderRadius:11,background:`${topCat.cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{topCat.cat.icon}</div>
        <div>
          <div style={{fontSize:12,color:C.text.b,fontWeight:500}}>Mayor gasto</div>
          <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{topCat.cat.label} · {COP(topCat.total)}</div>
        </div>
      </div>}
    </div>;
  };

  // ── Widget de Racha ──────────────────────────────────────────────────────
  const RachaWidget=()=>{
    // Calcular meses consecutivos con gasto < ingreso (sin contar mes actual)
    const currentM=now.getMonth(), currentY=now.getFullYear();

    // Obtener lista de meses con datos (pasados, sin el actual)
    const mesesSet=new Set(
      tx.filter(t=>{
        const[ty,tm]=t.date.split("-").map(Number);
        return ty<currentY||(ty===currentY&&(tm-1)<currentM);
      }).map(t=>{const[ty,tm]=t.date.split("-").map(Number);return `${ty}-${tm-1}`;})
    );
    if(mesesSet.size<1) return null;

    const meses=[...mesesSet]
      .map(k=>{const[y,m]=k.split("-").map(Number);return{y,m};})
      .sort((a,b)=>a.y!==b.y?b.y-a.y:b.m-a.m); // más reciente primero

    // Contar racha — meses consecutivos con gasto<ingreso
    let racha=0;
    for(const{y,m} of meses){
      const mTx=tx.filter(t=>{const[ty,tm]=t.date.split("-").map(Number);return ty===y&&(tm-1)===m;});
      const gasto=mTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
      const ingreso=mTx.filter(t=>isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0)+(getSalarioDelMes(y,m)||sal);
      if(gasto<ingreso) racha++;
      else break;
    }

    if(racha<1) return null;

    const emoji=racha>=6?"🔥":racha>=3?"⚡":"✨";
    const msg=racha>=6?`${racha} meses ahorrando — ¡eso es disciplina!`
      :racha>=3?`${racha} meses seguidos bajo control`
      :`${racha} mes bajo control — ¡sigue así!`;

    return <div style={{
      display:"flex",alignItems:"center",gap:12,
      padding:"14px 16px", marginBottom:16,
      background:C.card, borderRadius:18, boxShadow:elev("card"),
    }}>
      <div style={{
        width:44,height:44,borderRadius:14,flexShrink:0,
        background:`${C.emerald}18`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:22,
      }}>{emoji}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{msg}</div>
        <div style={{fontSize:11,color:C.text.s,marginTop:2,fontWeight:500}}>
          Gastos menores al ingreso cada mes
        </div>
      </div>
      <div style={{
        fontSize:24,fontWeight:800,color:C.emerald,
        letterSpacing:-1,flexShrink:0,
      }}>{racha}</div>
    </div>;
  };

  const HomeTab=()=>{
    const sinDatos = monthTx.length===0 && month!==now.getMonth();
    if(txLoading) return <ShimmerHome/>;

    // ── Vista compacta ──────────────────────────────────────────────────────
    if(compacto) return <div style={{padding:"16px 20px 80px"}}>
      <MonthSelector/>
      {/* Card única tipo Apple Wallet */}
      <div style={{
        ...cardSurface(pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo),
        borderRadius:24, padding:"24px 22px",
        boxShadow:cardShadow(pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo),
        marginBottom:16, animation:"fadeIn 0.25s ease",
        border:`1px solid ${pctUsado>=1?C.red+"44":pctUsado>=0.8?C.amber+"33":"transparent"}`,
        position:"relative", overflow:"hidden",
      }}>
        <GradientOrbs color={pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>Disponible · {MONTHS_S[month]}</div>
          <div style={{fontSize:48,fontWeight:700,letterSpacing:-1,color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.emerald,fontVariantNumeric:"tabular-nums",marginBottom:20,lineHeight:1}}>
            {COP(animSaldo)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:ink(0.08),borderRadius:14,overflow:"hidden"}}>
            {[
              {label:"Gastos",value:COP(animGasto),color:C.red},
              {label:"En metas",value:COP(animAportes),color:C.indigoLight},
              {label:"Libre",value:`${Math.round(totalDisponibleBase>0?saldo/totalDisponibleBase*100:0)}%`,color:pctUsado>=1?C.red:C.emerald},
            ].map(item=><div key={item.label} style={{background:C.isLight?"rgba(255,255,255,0.7)":C.card,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:10,color:C.text.s,fontWeight:500,marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:13,fontWeight:700,color:item.color,letterSpacing:-0.3}}>{item.value}</div>
            </div>)}
          </div>
        </div>
      </div>

      {/* Últimos movimientos — compacto */}
      {monthTx.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Últimos movimientos</div>
          <button onClick={()=>changeTab("mov")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer"}}>Ver todos →</button>
        </div>
        <div style={{background:C.card,borderRadius:20,padding:"0 16px",boxShadow:elev("card"),marginBottom:16}}>
          {[...monthTx].sort((a,b)=>parseDateSafe(b.date)-parseDateSafe(a.date)).slice(0,5).map((t,i,arr)=>{
            const cat=getCatInfo(t.cat);
            const esPos=isAporteMeta(t)||isIngreso(t.cat)||isDevolucion(t.cat)||isIngresoExtra(t.cat);
            return <div key={t.id} style={{
              display:"flex",alignItems:"center",gap:12,
              padding:"13px 0",
              borderBottom:i<arr.length-1?`1px solid ${ink(0.05)}`:"none",
            }}>
              <div style={{width:38,height:38,borderRadius:12,flexShrink:0,background:`${cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{cat.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</div>
                <div style={{fontSize:11,color:C.text.s,marginTop:1}}>{t.date?.slice(5).replace("-","/")} · {cat.label}</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:esPos?C.emeraldLight:C.text.h,flexShrink:0}}>
                {esPos?"+":"-"}{COP(t.amount)}
              </div>
            </div>;
          })}
        </div>
      </>}

      {/* Metas chips en compacto */}
      {goals.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Mis metas</div>
          <button onClick={()=>changeTab("metas")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer"}}>Ver todas →</button>
        </div>
        {goals.slice(0,2).map(g=><GoalChip key={g.id} goal={g} aportado={getAportado(g.id)} aportadoEsteMes={getAportadoMes(g.id,month,now.getFullYear())} txAll={tx} onClick={()=>changeTab("metas")}/>)}
      </>}
    </div>;

    return <div style={{padding:"16px 20px 80px"}}>
      <MonthSelector/>
      <ResumenSemanal/>
      <AlertasAvanzadas
        gastosTx={gastosTx}
        totalGasto={totalGasto}
        totalIngresoMes={totalIngresoMes}
        presupuestos={presupuestos}
        MAIN_CATS={MAIN_CATS}
        tx={tx}
        month={month}
        isGasto={isGasto}
        isAporteMeta={isAporteMeta}
        isMonth={isMonth}
        C={C}
        COP={COP}
        MONTHS_S={MONTHS_S}
      />
      {/* ── 1. Disponible ── */}
      <div style={{
        borderRadius:24, padding:"32px 24px 26px", marginBottom:24,
        background: CS.style==="glass"
          ? surface("glassHi")
          : CS.style==="gradient"
            ? `linear-gradient(145deg,${pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo}28 0%,${C.card} 55%)`
            : CS.style==="classic"
              ? `linear-gradient(135deg,${pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo}32 0%,${pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo}12 50%,${C.bg} 100%)`
              : C.card,
        ...(CS.style==="glass"?{backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}:{}),
        border:CS.style==="solid"?`1px solid ${pctUsado>=1?C.red+"44":pctUsado>=0.8?C.amber+"33":"transparent"}`:cardBorder(pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo),
        boxShadow: cardShadow(pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo),
        transition:"box-shadow 0.5s ease,border-color 0.5s ease",
        position:"relative", overflow:"hidden",
      }}>
        <GradientOrbs color={pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.indigo}/>
        <div style={{position:"relative"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.8,fontWeight:600,textTransform:"uppercase"}}>Disponible · {MONTHS_S[month]}</div>
          {saldoAnterior>0&&<div style={{background:ink(0.06),borderRadius:99,padding:"3px 10px",fontSize:11,color:C.emeraldLight,fontWeight:600}}>+{COP(saldoAnterior)}</div>}
        </div>
        <div style={{fontSize:56,fontWeight:700,letterSpacing:-1,lineHeight:1,color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.emerald,fontVariantNumeric:"tabular-nums",marginBottom:28,transition:"color 0.4s"}}>
          {COP(animSaldo)}
        </div>
        <div style={{background:ink(0.06),borderRadius:99,height:3,overflow:"hidden",marginBottom:12}}>
          <div style={{height:3,borderRadius:99,background:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.emerald,width:`${Math.min(pctUsado*100,100)}%`,transition:"width 0.8s ease",opacity:0.7}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:12,color:C.text.b,fontWeight:500}}>{totalDisponibleBase>0?`de ${COP(totalDisponibleBase)}`:"Sin ingresos"}</span>
          <span style={{fontSize:12,fontWeight:600,color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.text.s}}>{Math.round(pctUsado*100)}% gastado</span>
        </div>
        {!sinDatos&&<MonthlyProjection gastosTx={gastosTx} saldo={saldo} month={month} C={C} COP={COP} MONTHS_S={MONTHS_S}/>}
        </div>
      </div>
      {/* ── Mes futuro sin datos ── */}
      {sinDatos?(
        <div style={{textAlign:"center",padding:"32px 0 20px",animation:"fadeIn 0.3s ease"}}>
          <div style={{fontSize:36,marginBottom:12}}>📅</div>
          <div style={{fontSize:16,fontWeight:800,color:C.text.h,marginBottom:6}}>Sin movimientos en {MONTHS[month]}</div>
          <div style={{fontSize:13,color:C.text.b,lineHeight:1.7,marginBottom:20}}>
            {saldoAnterior>0?`Llevas ${COP(saldoAnterior)} acumulados del mes anterior.`:"Registra tu primer movimiento cuando llegue el mes."}
          </div>
        </div>
      ):(
        <>
          {/* ── 2. Stats ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
            <div style={{...cardSurface(C.red),borderRadius:20,padding:"20px 18px",boxShadow:cardShadow(C.red)}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                <div style={{width:6,height:6,borderRadius:99,background:C.red,opacity:0.7}}/>
                <div style={{fontSize:12,color:C.text.b,fontWeight:500}}>Gastos</div>
              </div>
              <div style={{fontSize:22,fontWeight:700,color:C.red,marginBottom:4,letterSpacing:-0.3}}>{COP(animGasto)}</div>
              <div style={{fontSize:11,color:C.text.s,fontWeight:500}}>{Math.round(pctUsado*100)}% del ingreso</div>
            </div>
            <div style={{...cardSurface(C.indigo),borderRadius:20,padding:"20px 18px",boxShadow:cardShadow(C.indigo)}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                <div style={{width:6,height:6,borderRadius:99,background:C.indigo,opacity:0.7}}/>
                <div style={{fontSize:12,color:C.text.b,fontWeight:500}}>En metas</div>
              </div>
              <div style={{fontSize:22,fontWeight:700,color:C.indigoLight,marginBottom:4,letterSpacing:-0.3}}>{COP(animAportes)}</div>
              <div style={{fontSize:11,color:C.text.s,fontWeight:500}}>{totalAportes>0?`${Math.round(tasaAhorr*100)}% guardado`:"Empieza cuando quieras"}</div>
            </div>
          </div>
          {/* ── 2.5 Banner plan inteligente (si no hay presupuestos) ── */}
          <BudgetSetupBanner
            key={bannerDismissTick}
            salario={salario||0}
            presupuestos={presupuestos}
            mesesDatos={totalMesesConDatos||0}
            C={C} COP={COP}
            onActivate={()=>setBudgetSetupOpen(true)}/>
          {/* ── 2.6 Racha ── */}
          <RachaWidget/>
          {/* ── 3. Insights ── */}
          <InsightsEngine txAll={tx} monthTx={monthTx} gastosTx={gastosTx} totalGasto={totalGasto} totalIng={totalIngresoMes} totalAhorr={totalAportes} month={month} C={C} COP={COP} MAIN_CATS={MAIN_CATS} isGasto={isGasto} isAporteMeta={isAporteMeta} isSavingsLegacy={isSavingsLegacy} isMonth={isMonth} presupuestos={presupuestos} goals={goals} pagos={pagos} saldo={saldo}/>
          {/* ── 3.5 Salud del plan (si hay desbalance) ── */}
          <BudgetHealth
            salario={salario||0}
            presupuestos={presupuestos}
            gastosTx={gastosTx}
            goals={goals}
            aporteMesTx={aporteMesAll}
            MAIN_CATS={MAIN_CATS}
            C={C} COP={COP}
            onFixBudget={()=>setBudgetSetupOpen(true)}/>
        </>
      )}
      {/* ── 5. Metas chips ── */}
      {goals.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,marginTop:8}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Mis metas</div>
          <button onClick={()=>changeTab("metas")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer"}}>Ver todas →</button>
        </div>
        {goals.slice(0,3).map(g=><GoalChip key={g.id} goal={g} aportado={getAportado(g.id)} aportadoEsteMes={getAportadoMes(g.id,month,now.getFullYear())} txAll={tx} onClick={()=>changeTab("metas")}/>)}
      </>}
      {!txLoading&&monthTx.length===0&&month===now.getMonth()&&<div style={{textAlign:"center",padding:"40px 0",color:C.text.b,fontSize:14,lineHeight:2.2}}>
        Todo listo para empezar.<br/><span style={{fontSize:32}}>👆</span><br/>Toca <b style={{color:C.emerald}}>+</b> para registrar tu primer movimiento.
      </div>}
    </div>;
  };
  const MetasTab=()=>{
    const tot=goals.reduce((s,g)=>s+g.monto,0), ap=goals.reduce((s,g)=>s+getAportado(g.id),0);
    return <div style={{padding:"16px 20px 80px"}}>
      {goals.length>0&&<div style={{background:C.card,borderRadius:20,padding:"20px",marginBottom:16,boxShadow:elev("card")}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Ring pct={tot>0?ap/tot:0} size={52} stroke={4} color={C.indigo} label={`${Math.round(Math.min(tot>0?ap/tot:0,1)*100)}%`}/>
          <div>
            <div style={{fontSize:11,color:C.text.s,fontWeight:600,letterSpacing:1.4,textTransform:"uppercase",marginBottom:6}}>Progreso total</div>
            <div style={{fontSize:24,fontWeight:700,color:C.text.h,letterSpacing:-0.5}}>{COP(ap)}</div>
            <div style={{fontSize:12,color:C.text.s,fontWeight:400,marginTop:2}}>de {COP(tot)} en {goals.length} meta{goals.length!==1?"s":""}</div>
          </div>
        </div>
      </div>}
      {goals.map(g=><GoalCard key={g.id} goal={g}
          aportado={getAportado(g.id)}
          aportadoEsteMes={getAportadoMes(g.id,month,now.getFullYear())}
          txAll={tx}
          onEdit={()=>setGoalModal({
            ...g,
            _aportado:getAportado(g.id)-(g.saldoInicial||0),
            _aporteCount:tx.filter(t=>t.cat==="meta_aporte"&&t.goalId===g.id).length
          })}/>)}
      {goals.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:C.text.s,fontSize:14,lineHeight:2.4}}>
        <div style={{fontSize:44,marginBottom:10}}>⭐</div>
        Aún no tienes metas.<br/>¡Crea una y empieza a ahorrar<br/>para lo que siempre quisiste!<br/>
        <button onClick={()=>setGoalModal("new")} style={{marginTop:18,padding:"12px 28px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.indigo},#4338ca)`,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>+ Crear mi primera meta</button>
      </div>}
      {goals.length>0&&<button onClick={()=>setGoalModal("new")} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:C.card,boxShadow:elev("card"),color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:500,marginBottom:8}}>+ Nueva meta</button>}
    </div>;
  };

  // ── Modal Presupuesto por Categoría ─────────────────────────────────────
  function PresupuestoModal({cat,gastoActual,limiteActual,onClose,onSave}){
    const [tmp,setTmp]=useState(limiteActual?Number(limiteActual).toLocaleString("es-CO"):"");
    // Swipe down to dismiss en el handle
    const [dragY,setDragY]=useState(0);
    const [dragStartY,setDragStartY]=useState(null);
    const val=parseFloat(tmp.replace(/\./g,"").replace(",","."))||0;
    const pct=val>0?Math.min(gastoActual/val,1):0;
    const col=pct>=1?C.red:pct>=0.8?C.amber:C.emerald;
    function hm(e){const r=e.target.value.replace(/\D/g,"");setTmp(r?Number(r).toLocaleString("es-CO"):"");}
    // Handlers para swipe down (solo en el handle superior)
    function onTouchStart(e){setDragStartY(e.touches[0].clientY);}
    function onTouchMove(e){
      if(dragStartY===null)return;
      const delta=e.touches[0].clientY-dragStartY;
      if(delta>0)setDragY(delta); // solo hacia abajo
    }
    function onTouchEnd(){
      if(dragY>80)onClose(); // umbral para cerrar
      setDragY(0);
      setDragStartY(null);
    }
    return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
      <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:dragY===0?"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)":"none",padding:"20px 20px 36px",transform:`translateY(${dragY}px)`,transition:dragStartY===null?"transform 0.2s ease":"none",position:"relative"}}>
        {/* Botón × esquina superior derecha */}
        <button onClick={onClose} aria-label="Cerrar"
          style={{position:"absolute",top:14,right:14,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,width:32,height:32,cursor:"pointer",color:C.text.b,fontSize:18,fontWeight:700,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background=`${C.red}22`;e.currentTarget.style.color=C.red;}}
          onMouseLeave={e=>{e.currentTarget.style.background=C.surface;e.currentTarget.style.color=C.text.b;}}>×</button>
        {/* Handle con swipe down */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{display:"flex",justifyContent:"center",marginBottom:16,padding:"4px 0 8px",cursor:"grab",touchAction:"none"}}>
          <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingRight:36}}>
          <div style={{width:48,height:48,borderRadius:14,background:`${cat.color}22`,border:`1px solid ${cat.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{cat.icon}</div>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.text.h}}>Presupuesto · {cat.label}</div>
            <div style={{fontSize:12,color:C.text.s}}>Gastado este mes: <span style={{color:C.red,fontWeight:700}}>{COP(gastoActual)}</span></div>
          </div>
        </div>
        {/* Preview progreso */}
        {val>0&&<div style={{marginBottom:16,padding:"12px 14px",background:"rgba(255,255,255,0.03)",borderRadius:12,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,color:C.text.b}}>Progreso del mes</span>
            <span style={{fontSize:12,fontWeight:800,color:col}}>{Math.round(pct*100)}%</span>
          </div>
          <Bar pct={pct} color={col} h={8}/>
          <div style={{fontSize:11,color:C.text.s,marginTop:6}}>
            {pct>=1?`⚠️ Superaste el límite en ${COP(gastoActual-val)}`
            :pct>=0.8?`⚠️ Cerca del límite — quedan ${COP(val-gastoActual)}`
            :`Quedan ${COP(val-gastoActual)} del presupuesto`}
          </div>
        </div>}
        <Lbl>Límite mensual (COP)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${val>0?cat.color:C.border}`,marginBottom:16}}>
          <span style={{padding:"0 14px",color:C.text.s,fontSize:16,lineHeight:"56px"}}>$</span>
          <input inputMode="numeric" placeholder="Sin límite" value={tmp} onChange={hm}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:22,fontWeight:800,color:C.text.h,padding:"0 8px",height:56}}/>
          {tmp&&<button onClick={()=>setTmp("")} style={{background:"none",border:"none",color:C.text.s,fontSize:20,padding:"0 14px",cursor:"pointer"}}>×</button>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {!!limiteActual&&<button onClick={()=>{onSave(cat.id,0);onClose();}}
            style={{padding:"16px 18px",borderRadius:14,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
            Quitar
          </button>}
          <button onClick={()=>{onSave(cat.id,val);onClose();}}
            style={{flex:1,padding:16,borderRadius:14,border:"none",cursor:"pointer",fontSize:15,fontWeight:800,
              background:val>0?`linear-gradient(135deg,${cat.color},${cat.color}cc)`:C.surface,
              color:val>0?"#000":C.text.s}}>
            {val>0?`Guardar límite ${COP(val)}`:"Sin límite — toca para definir"}
          </button>
        </div>
      </div>
    </div>;
  }

  // ── Gráfica de gastos/ingresos últimos meses ─────────────────────────────
  const GraficaMeses=()=>{
    const currentM=now.getMonth(), currentY=now.getFullYear();
    const esMesFuturo=month>currentM; // mes seleccionado es futuro

    // Si el mes seleccionado es futuro → no mostrar gráfica
    if(esMesFuturo) return null;

    // Construir lista de hasta 6 meses con datos (pasados + actual)
    // Siempre incluir el mes seleccionado y el actual
    const mesesConDatos=new Set(
      tx.filter(t=>{
        const[ty,tm]=t.date.split("-").map(Number);
        return ty<currentY||(ty===currentY&&(tm-1)<=currentM);
      }).map(t=>{const[ty,tm]=t.date.split("-").map(Number);return `${ty}-${tm-1}`;})
    );
    mesesConDatos.add(`${currentY}-${currentM}`); // mes actual siempre
    mesesConDatos.add(`${currentY}-${month}`);    // mes seleccionado siempre

    const lista=[...mesesConDatos]
      .map(k=>{const[y,m]=k.split("-").map(Number);return{y,m};})
      .filter(({y,m})=>y<currentY||(y===currentY&&m<=currentM)) // nunca futuros
      .sort((a,b)=>a.y!==b.y?a.y-b.y:a.m-b.m)
      .slice(-6);

    // Calcular totales por mes
    const datos=lista.map(({y,m})=>{
      const mTx=tx.filter(t=>{const[ty,tm]=t.date.split("-").map(Number);return ty===y&&(tm-1)===m;});
      const gastos=mTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
      const ingresos=mTx.filter(t=>isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0)+(getSalarioDelMes(y,m)||sal);
      const ahorros=mTx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
      const esActual=y===currentY&&m===currentM;
      const esSel=y===currentY&&m===month;
      return{y,m,gastos,ingresos,ahorros,esActual,esSel};
    });

    // ── Con 1 solo mes: gráfica de gastos por día del mes seleccionado ───────
    if(lista.length===1){
      const {y:ly,m:lm,gastos:totalG}=datos[0];
      const ultimoDia=new Date(ly,lm+1,0).getDate();
      const hoy=ly===currentY&&lm===currentM?now.getDate():ultimoDia;

      // Semana inicial: si es el mes actual → semana de hoy, si es pasado → última semana
      const semanaInicial=ly===currentY&&lm===currentM
        ?Math.floor((hoy-1)/7)
        :Math.ceil(ultimoDia/7)-1;
      const [semanaIdx,setSemanaIdx]=useState(semanaInicial);
      const totalSemanas=Math.ceil(ultimoDia/7);
      const diaInicio=semanaIdx*7+1;
      const diaFin=Math.min(diaInicio+6,ultimoDia);

      const diasData=Array.from({length:diaFin-diaInicio+1},(_,i)=>{
        const dia=diaInicio+i;
        const gasto=tx.filter(t=>{
          const [ty,tm,td]=t.date.split("-").map(Number);
          return ty===ly&&(tm-1)===lm&&td===dia&&isGasto(t.cat)&&!isAporteMeta(t);
        }).reduce((s,t)=>s+t.amount,0);
        return{dia,gasto};
      });

      const maxD=Math.max(...diasData.map(d=>d.gasto),1);
      const W=320, H=150;
      const nDias=diasData.length;
      const bW=Math.floor((W-16)/nDias)-8;
      const gapUnit=(W-bW*nDias)/(nDias+1);
      const abrevD=v=>v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}k`:`$${v}`;
      const DIAS_S=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

      return <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,color:C.text.s,fontWeight:600,letterSpacing:1.4,textTransform:"uppercase"}}>Gastos por día · {MONTHS[lm]}{ly!==currentY?` ${ly}`:""}</div>
          <span style={{fontSize:13,fontWeight:700,color:totalG>0?C.red:C.text.s}}>{totalG>0?COP(totalG):"Sin gastos"}</span>
        </div>
        <div style={{background:C.card,borderRadius:20,padding:"18px 14px 14px",boxShadow:elev("card")}}>
          {/* Navegación semanas */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <button onClick={()=>setSemanaIdx(s=>Math.max(s-1,0))}
              style={{background:semanaIdx>0?ink(0.06):"transparent",border:"none",borderRadius:10,
                width:32,height:32,color:semanaIdx>0?C.text.h:C.text.s,cursor:semanaIdx>0?"pointer":"default",
                fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
              ←
            </button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>
                {diaInicio===diaFin?`Día ${diaInicio}`:`Días ${diaInicio} – ${diaFin}`}
              </div>
              <div style={{fontSize:10,color:C.text.s,marginTop:1,fontWeight:500}}>
                Semana {semanaIdx+1} de {totalSemanas}
              </div>
            </div>
            <button onClick={()=>setSemanaIdx(s=>Math.min(s+1,totalSemanas-1))}
              style={{background:semanaIdx<totalSemanas-1?ink(0.06):"transparent",border:"none",borderRadius:10,
                width:32,height:32,color:semanaIdx<totalSemanas-1?C.text.h:C.text.s,
                cursor:semanaIdx<totalSemanas-1?"pointer":"default",
                fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
              →
            </button>
          </div>

          {/* Gráfica SVG */}
          <svg width="100%" viewBox={`0 0 ${W} ${H+36}`} style={{overflow:"visible"}}>
            {/* Línea base */}
            <line x1={0} y1={H} x2={W} y2={H} stroke={ink(0.06)} strokeWidth={1}/>
            {diasData.map(({dia,gasto},i)=>{
              const x=gapUnit+(bW+gapUnit)*i;
              const h=Math.max(gasto/maxD*H,gasto>0?8:0);
              const esHoy=dia===hoy;
              const fechaDia=new Date(ly,lm,dia);
              const nombreDia=DIAS_S[fechaDia.getDay()];
              const barColor=esHoy?(gasto>0?C.red:C.emerald):gasto>0?C.red:ink(0.06);
              const barOpacity=esHoy?1:gasto>0?0.75:1;

              return <g key={dia}>
                {/* Highlight hoy sutil */}
                {esHoy&&<rect x={x-3} y={4} width={bW+6} height={H-4} rx={6} fill={C.emerald} fillOpacity={0.05}/>}
                {/* Barra redondeada */}
                <rect x={x} y={H-Math.max(h,2)} width={bW} height={Math.max(h,2)}
                  rx={Math.min(6,bW/2)} fill={barColor} fillOpacity={barOpacity}/>
                {/* Valor encima — horizontal, legible */}
                {gasto>0&&<text
                  x={x+bW/2} y={H-h-7}
                  textAnchor="middle" fontSize={9} fontWeight="700"
                  fill={esHoy?C.emerald:C.red} fillOpacity={0.9}
                  fontFamily="DM Sans,sans-serif"
                >{abrevD(gasto)}</text>}
                {/* Nombre día */}
                <text x={x+bW/2} y={H+14} textAnchor="middle" fontSize={9}
                  fill={esHoy?C.emerald:ink(0.45)}
                  fontWeight={esHoy?"700":"500"} fontFamily="DM Sans,sans-serif">{nombreDia}</text>
                {/* Número día */}
                <text x={x+bW/2} y={H+25} textAnchor="middle" fontSize={8}
                  fill={esHoy?C.emerald:ink(0.3)}
                  fontWeight={esHoy?"700":"400"} fontFamily="DM Sans,sans-serif">{dia}</text>
                {/* Punto hoy */}
                {esHoy&&<circle cx={x+bW/2} cy={H+33} r={2.5} fill={C.emerald}/>}
              </g>;
            })}
          </svg>
          {/* Leyenda mínima */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6,fontSize:10,color:C.text.s}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:C.emerald,flexShrink:0}}/>
          <span style={{color:C.emerald,fontWeight:600}}>Hoy · {DIAS_S[new Date(ly,lm,hoy).getDay()]} {hoy}</span>
        </div>
        </div>
      </div>;
    }

    // ── Con 2+ meses: gráfica de barras por mes ───────────────────────────────
    const maxVal=Math.max(...datos.map(d=>Math.max(d.gastos,d.ingresos)),1);
    const W=340,H=110;
    const barW=Math.max(Math.floor((W-8)/lista.length)-6,20);
    const gap=Math.floor((W-barW*lista.length)/(lista.length+1));
    const abrev=v=>v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}k`:`${v}`;

    return <div style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,color:C.text.s,fontWeight:600,letterSpacing:1.4,textTransform:"uppercase"}}>Resumen por mes</div>
        <div style={{display:"flex",gap:14,fontSize:10,color:C.text.s}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:C.red,opacity:0.7}}/> Gastos</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:C.emerald,opacity:0.7}}/> Ingresos</span>
        </div>
      </div>
      <div style={{background:C.card,borderRadius:20,padding:"18px 12px 12px",boxShadow:elev("card")}}>
        <svg width="100%" viewBox={`0 0 ${W} ${H+36}`} style={{overflow:"visible"}}>
          {datos.map(({y,m,gastos,ingresos,esSel,esActual},i)=>{
            const x=gap+(barW+gap)*i;
            const hG=Math.max(gastos/maxVal*H,gastos>0?4:0);
            const hI=Math.max(ingresos/maxVal*H,ingresos>0?4:0);
            const bW=Math.floor(barW*0.44);
            const label=MONTHS_S[m];
            return <g key={`${y}-${m}`} onClick={()=>setMonth(m)} style={{cursor:"pointer"}}>
              {esSel&&<rect x={x-4} y={2} width={barW+8} height={H-2} rx={8} fill={ink(0.04)}/>}
              <rect x={x} y={H-Math.max(hI,2)} width={bW} height={Math.max(hI,2)} rx={Math.min(5,bW/2)} fill={C.emerald} fillOpacity={esSel?0.8:0.35}/>
              <rect x={x+bW+2} y={H-Math.max(hG,2)} width={bW} height={Math.max(hG,2)} rx={Math.min(5,bW/2)} fill={C.red} fillOpacity={esSel?1:0.5}/>
              <text x={x+barW/2} y={H+14} textAnchor="middle" fontSize={9} fontWeight={esSel?"700":"500"}
                fill={esSel?C.text.h:esActual?ink(0.5):ink(0.3)} fontFamily="DM Sans,sans-serif">{label}</text>
              {(i===0||(i>0&&datos[i-1].y!==y))&&<text x={x+barW/2} y={H+26} textAnchor="middle" fontSize={7}
                fill={ink(0.2)} fontFamily="DM Sans,sans-serif">{y}</text>}
              {esSel&&gastos>0&&<text x={x+bW+2+bW/2} y={H-hG-6} textAnchor="middle" fontSize={8} fontWeight="700"
                fill={C.red} fillOpacity={0.9} fontFamily="DM Sans,sans-serif">{abrev(gastos)}</text>}
              {esActual&&<circle cx={x+barW/2} cy={H+32} r={2.5} fill={C.emerald} fillOpacity={0.8}/>}
            </g>;
          })}
          <line x1={0} y1={H} x2={W} y2={H} stroke={ink(0.05)} strokeWidth={1}/>
        </svg>
        <div style={{fontSize:11,color:C.text.s,textAlign:"center",marginTop:4,opacity:0.6}}>
          Toca para ver ese mes
        </div>
      </div>
    </div>;
  };

  // ── Modal Pago Programado ────────────────────────────────────────────────
  function PagoModal({initial,onClose,onSave,onDelete,diaInicial,mesInicial,anioInicial}){
    const isEdit=!!initial;
    const [nombre,setNombre]=useState(initial?.nombre||"");
    const [monto,setMonto]=useState(initial?Number(initial.monto).toLocaleString("es-CO"):"");
    const [cat,setCat]=useState(initial?.cat||"arriendo");
    const [dia,setDia]=useState(initial?.dia||diaInicial||1);
    const [frecuencia,setFrecuencia]=useState(initial?.frecuencia||"mensual");
    const [conf,setConf]=useState(false);
    const ref=useRef(null);
    const sheet=useSheetDismiss(onClose);
    useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
    const raw=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
    function hm(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
    function save(){
      if(!nombre.trim()||!raw)return;
      onSave({
        id:initial?.id||null,nombre:nombre.trim(),monto:raw,cat,dia,frecuencia,
        mesUnico:initial?.mesUnico??(mesInicial??now.getMonth()),
        anioUnico:initial?.anioUnico??(anioInicial??now.getFullYear()),
      });
      onClose();
    }
    const ci=getCatInfo(cat);
    return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:300,animation:"fadeIn 0.18s ease"}}>
      <div {...sheet.dragProps} ref={sheet.cardRef} style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto",scrollBehavior:"auto",position:"relative",...sheet.cardStyle}}>
        <SheetCloseBtn onClose={onClose}/>
        <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
        <div style={{padding:"0 20px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,paddingRight:40}}>
            <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>{isEdit?"Editar pago":"Nuevo pago programado"}</div>
          </div>
          <Lbl>Nombre del pago</Lbl>
          <input ref={ref} placeholder="ej: Arriendo, Gym, Netflix, Seguro..." value={nombre} onChange={e=>setNombre(e.target.value)}
            style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
          <Lbl>Monto (COP)</Lbl>
          <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${raw>0?C.sky:C.border}`,marginBottom:14}}>
            <span style={{padding:"0 14px",fontSize:20,lineHeight:"56px"}}>{ci.icon}</span>
            <span style={{color:C.text.s,fontSize:16,lineHeight:"56px"}}>$</span>
            <input inputMode="numeric" placeholder="0" value={monto} onChange={hm}
              style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 10px",height:56}}/>
          </div>
          <Lbl>Categoría</Lbl>
          <div style={{marginBottom:14}}><CatSelector value={cat} onChange={setCat} subsCustom={catsCustom}/></div>
          <Lbl>Día del mes en que se paga</Lbl>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {Array.from({length:28},(_,i)=>i+1).map(d=>(
              <button key={d} onClick={()=>setDia(d)}
                style={{width:40,height:40,borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                  background:dia===d?C.sky:"rgba(255,255,255,0.06)",
                  color:dia===d?"#000":C.text.b,transition:"all 0.1s"}}>
                {d}
              </button>
            ))}
          </div>
          <Lbl>Frecuencia</Lbl>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {[{id:"mensual",label:"📅 Mensual"},{id:"unico",label:"1️⃣ Una vez"}].map(f=>(
              <button key={f.id} onClick={()=>setFrecuencia(f.id)}
                style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                  background:frecuencia===f.id?`${C.sky}22`:C.surface,
                  outline:frecuencia===f.id?`2px solid ${C.sky}`:"2px solid transparent",
                  color:frecuencia===f.id?C.sky:C.text.s}}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            {isEdit&&!conf&&<button onClick={()=>setConf(true)} style={{padding:"16px 18px",borderRadius:14,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:22,flexShrink:0}}>🗑</button>}
            {isEdit&&conf&&<button onClick={()=>{onDelete(initial.id);onClose();}} style={{padding:"16px 18px",borderRadius:14,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800,flexShrink:0}}>¿Borrar?</button>}
            <button onClick={save} style={{flex:1,padding:16,borderRadius:14,border:"none",cursor:(!nombre.trim()||!raw)?"not-allowed":"pointer",fontSize:15,fontWeight:800,
              background:(!nombre.trim()||!raw)?C.surface:`linear-gradient(135deg,${C.sky},#0284c7)`,
              color:(!nombre.trim()||!raw)?C.text.s:"#fff"}}>
              {(!nombre.trim()||!raw)?"Completa los campos":isEdit?"✓ Guardar":"+ Agregar pago"}
            </button>
          </div>
        </div>
      </div>
    </div>;
  }

  const AnalisisTab=()=>{
    return <div style={{padding:"16px 20px 0"}}>
      <MonthSelector/>
      <GraficaMeses/>
      <Card style={{marginBottom:14}}>
        <Lbl>Resumen del mes</Lbl>
        {[
          {l:"Ingresos del mes",v:totalIngresoMes,c:C.emerald},
          ...(saldoAnterior>0?[{l:"+ Sobrante meses ant.",v:saldoAnterior,c:C.emerald}]:[]),
          {l:"Gastos",v:totalGasto,c:C.red},
          {l:"Ahorros",v:totalAportes,c:C.indigo},
          {l:"Disponible",v:saldo,c:saldoColor},
        ].map(k=>(
          <div key={k.l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text.h}}>{k.l}</span>
            <span style={{fontSize:14,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
          </div>
        ))}
      </Card>
      {diasRestantesMes()<=3&&diasRestantesMes()>=0&&(
        <div style={{
          background:"linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.06))",
          border:`1px solid ${C.amber}44`,borderRadius:14,
          padding:"14px 16px",marginBottom:14,
          display:"flex",gap:12,alignItems:"flex-start",
        }}>
          <span style={{fontSize:24,flexShrink:0}}>📅</span>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:C.amber,marginBottom:4}}>
              {diasRestantesMes()===0?"¡Hoy es el último día del mes!":`Quedan ${diasRestantesMes()} día${diasRestantesMes()===1?"":"s"} del mes`}
            </div>
            <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>
              Revisa que tus movimientos de {MONTHS[now.getMonth()]} estén bien registrados.
            </div>
          </div>
        </div>
      )}
      <FinancialScore totalIng={totalIngresoMes} totalGasto={totalGasto} totalAhorr={totalAportes} goals={goals} tx={tx} saldo={saldo} month={month} C={C} COP={COP} isMonth={isMonth} isAporteMeta={isAporteMeta} isSavingsLegacy={isSavingsLegacy} MONTHS_S={MONTHS_S} onNavigate={changeTab} onAddTx={()=>setModal("new")} onAportarMeta={()=>setModal("meta_aporte")} totalMesesConDatos={totalMesesConDatos}/>
      {byMain.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18,marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>Gastos por categoría</Lbl>
          <span style={{fontSize:11,color:C.text.b,fontWeight:600}}>Toca para ver movimientos</span>
        </div>
        {byMain.map(c=>{
          const limite=presupuestos[c.id]||0;
          const pctPres=limite>0?Math.min(c.total/limite,1):0;
          const sobrePres=limite>0&&c.total>limite;
          const cercaPres=limite>0&&pctPres>=0.8&&!sobrePres;
          const colPres=sobrePres?C.red:cercaPres?C.amber:c.color;
          return <div key={c.id} onClick={()=>{setFiltroMainCat(c.id);setFiltroMainCatOrigen("analisis");changeTab("mov");}}
            onMouseDown={e=>e.currentTarget.style.transform="scale(0.985)"}
            onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
            style={{...cardSurface(c.color),boxShadow:cardShadow(c.color),marginBottom:14,borderRadius:20,padding:"18px 18px 16px",cursor:"pointer",border:`1px solid ${sobrePres?C.red+"44":cercaPres?C.amber+"33":"transparent"}`,transition:"transform 0.15s",position:"relative"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:14,flexShrink:0,background:`${c.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{c.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8}}>
                  <span style={{fontSize:14,fontWeight:600,color:C.text.h}}>{c.label}</span>
                  <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:10}}>
                    <div>
                      <span style={{fontSize:15,fontWeight:700,color:sobrePres?C.red:cercaPres?C.amber:C.text.h}}>{COP(c.total)}</span>
                      {limite>0&&<span style={{fontSize:11,color:C.text.s,marginLeft:4}}>/ {COP(limite)}</span>}
                    </div>
                    <button
                      onClick={e=>{e.stopPropagation();setPresupuestoModal(c);}}
                      aria-label="Ajustar presupuesto"
                      style={{background:"none",border:"none",padding:"4px",cursor:"pointer",color:C.text.s,fontSize:14,lineHeight:1,opacity:0.5,transition:"opacity 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1}
                      onMouseLeave={e=>e.currentTarget.style.opacity=0.5}
                    >⚙</button>
                  </div>
                </div>
                <div style={{background:ink(0.05),borderRadius:99,height:3,overflow:"hidden"}}>
                  <div style={{height:3,borderRadius:99,background:sobrePres?C.red:cercaPres?C.amber:c.color,width:`${limite>0?Math.min(pctPres*100,100):Math.min(c.total/Math.max(totalGasto,1)*100,100)}%`,transition:"width 0.7s",opacity:0.8}}/>
                </div>
                {limite>0&&<div style={{fontSize:11,marginTop:6,color:sobrePres?C.red:cercaPres?C.amber:C.text.s,fontWeight:sobrePres||cercaPres?600:400}}>
                  {sobrePres?`▲ +${COP(c.total-limite)} sobre el límite`:cercaPres?`⚠ ${Math.round(pctPres*100)}% del presupuesto`:`${Math.round(pctPres*100)}% · quedan ${COP(limite-c.total)}`}
                </div>}
                {!limite&&<div style={{fontSize:11,marginTop:6,color:C.text.s,opacity:0.6}}>Sin presupuesto · ⚙ para definir</div>}
              </div>
            </div>
          </div>;
        })}
      </>}
      {monthTx.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:C.text.b,fontSize:14,lineHeight:2.2}}>
          <span style={{fontSize:32}}>📊</span><br/>
          Sin datos para analizar aún.<br/>
          <span style={{fontSize:12,color:C.text.s}}>Registra tus movimientos para ver análisis.</span>
        </div>
      )}
    </div>;
  };

  const MovTab=()=>{
    const [busqueda,setBusqueda]=useState("");
    const [filtroCat,setFiltroCat]=useState("todos"); // todos | gasto | ingreso | meta

    // Categoría principal del filtro (viene desde Análisis)
    const mainCatFiltrada=filtroMainCat?MAIN_CATS.find(m=>m.id===filtroMainCat):null;

    // Filtrar por búsqueda de texto + tipo + categoría main (desde Análisis)
    const txFiltradas=useMemo(()=>{
      let base=[...monthTx];
      // Filtro por categoría principal (seleccionada desde Análisis)
      if(mainCatFiltrada){
        base=base.filter(t=>mainCatFiltrada.subs.some(s=>s.id===t.cat)||(catsCustom[mainCatFiltrada.id]||[]).some(s=>s.id===t.cat));
      }
      // Filtro por tipo
      if(filtroCat==="gasto")   base=base.filter(t=>isGasto(t.cat)&&!isAporteMeta(t));
      if(filtroCat==="ingreso") base=base.filter(t=>isIngreso(t.cat)||isIngresoExtra(t.cat)||isDevolucion(t.cat));
      if(filtroCat==="meta")    base=base.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat));
      // Filtro por texto — busca en descripción, subcategoría y categoría principal
      if(busqueda.trim()){
        const q=busqueda.toLowerCase().trim();
        base=base.filter(t=>{
          const desc=(t.desc||"").toLowerCase();
          // Resolver label real para custom cats
          const subCat=t.cat?.startsWith("custom_")
            ? (()=>{for(const[,subs] of Object.entries(catsCustom||{})){const f=subs?.find(s=>s.id===t.cat);if(f)return f;}return getCatInfo(t.cat);})()
            : getCatInfo(t.cat);
          const subLabel=(subCat.label||"").toLowerCase();
          const mainCat=MAIN_CATS.find(m=>m.subs.some(s=>s.id===t.cat)||(catsCustom[m.id]||[]).some(s=>s.id===t.cat));
          const mainLabel=(mainCat?.label||"").toLowerCase();
          const mainLabelFull=(mainCat?.labelFull||"").toLowerCase();
          return desc.includes(q)||subLabel.includes(q)||mainLabel.includes(q)||mainLabelFull.includes(q);
        });
      }
      return base.sort((a,b)=>parseDateSafe(b.date)-parseDateSafe(a.date));
    },[monthTx,busqueda,filtroCat,mainCatFiltrada]);

    // Total de las tx filtradas (para mostrar en el chip cuando hay filtro de main cat)
    const totalFiltrado=txFiltradas.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);

    const sorted=txFiltradas;
    const hayFiltro=busqueda.trim()!=""||filtroCat!=="todos"||!!mainCatFiltrada;

    // Scroll al mes activo al montar o al cambiar de mes
    useEffect(()=>{
      if(!monthScrollRef.current)return;
      const btns=monthScrollRef.current.querySelectorAll("button");
      if(btns[month]) btns[month].scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
    },[]);
    return <div style={{padding:"16px 20px 0"}}>
      <MonthSelector/>
      {/* Chip de filtro por categoría (viene desde Análisis) */}
      {mainCatFiltrada&&(
        <div style={{
          marginBottom:12,borderRadius:16,padding:"14px 16px",
          background:surface("glass"),
          border:`1px solid ${mainCatFiltrada.color}35`,
          display:"flex",alignItems:"center",gap:12,
          animation:"fadeIn 0.3s ease",
        }}>
          <div style={{
            width:40,height:40,borderRadius:12,flexShrink:0,
            background:`${mainCatFiltrada.color}25`,border:`1px solid ${mainCatFiltrada.color}40`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
          }}>{mainCatFiltrada.icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,color:C.text.s,letterSpacing:1.2,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Filtrando</div>
            <div style={{fontSize:14,fontWeight:800,color:C.text.h,lineHeight:1.2}}>{mainCatFiltrada.labelFull||mainCatFiltrada.label}</div>
            <div style={{fontSize:11,color:C.text.b,marginTop:2}}>
              {txFiltradas.length} movimiento{txFiltradas.length!==1?"s":""}{totalFiltrado>0&&` · ${COP(totalFiltrado)}`}
            </div>
          </div>
          <button
            onClick={()=>{
              const volverAnalisis=filtroMainCatOrigen==="analisis";
              setFiltroMainCat(null);
              setFiltroMainCatOrigen(null);
              if(volverAnalisis) changeTab("anal");
            }}
            aria-label="Quitar filtro"
            style={{
              background:`${C.text.s}18`,border:`1px solid ${C.border}`,
              borderRadius:10,padding:"8px 10px",cursor:"pointer",
              color:C.text.b,fontSize:14,fontWeight:700,lineHeight:1,flexShrink:0,
              transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background=`${C.red}22`;e.currentTarget.style.color=C.red;}}
            onMouseLeave={e=>{e.currentTarget.style.background=`${C.text.s}18`;e.currentTarget.style.color=C.text.b;}}
          >×</button>
        </div>
      )}
      {sorted.length>0&&monthTx.some(t=>esMesPasado(t.date))&&(
        <div style={{fontSize:11,color:C.text.s,textAlign:"center",marginBottom:12,opacity:0.7}}>
          🔒 Mes anterior — solo lectura
        </div>
      )}
      {/* ── Buscador ── */}
      {monthTx.length>0&&<div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",background:C.card,borderRadius:14,border:`1px solid ${busqueda?C.indigo+"44":ink(0.06)}`,padding:"0 14px",gap:10,transition:"border-color 0.2s",marginBottom:10,boxShadow:elev("card")}}>
          <span style={{fontSize:15,color:C.text.s,opacity:0.6}}>🔍</span>
          <input
            placeholder="Buscar..."
            value={busqueda}
            onChange={e=>setBusqueda(e.target.value)}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:14,color:C.text.h,padding:"14px 0"}}
          />
          {busqueda&&<button onClick={()=>setBusqueda("")} style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>}
        </div>
        <div style={{display:"flex",gap:6}}>
          {[
            {id:"todos",   label:"Todos"},
            {id:"gasto",   label:"💸 Gastos"},
            {id:"ingreso", label:"💵 Ingresos"},
            {id:"meta",    label:"⭐ Metas"},
          ].map(f=><button key={f.id} onClick={()=>setFiltroCat(f.id)} style={{
            padding:"6px 12px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
            background:filtroCat===f.id?C.indigo:surface("glass"),
            color:filtroCat===f.id?"#fff":C.text.b,
            transition:"all 0.15s",
          }}>{f.label}</button>)}
        </div>
        {hayFiltro&&<div style={{fontSize:12,color:C.text.s,marginTop:8,textAlign:"center"}}>
          {sorted.length===0?"Sin resultados":`${sorted.length} resultado${sorted.length!==1?"s":""} encontrado${sorted.length!==1?"s":""}`}
        </div>}
      </div>}
      {sorted.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.text.b,fontSize:14,lineHeight:2}}>
        {hayFiltro
          ?<><span style={{fontSize:32}}>🔍</span><br/>Sin resultados para esa búsqueda.<br/><span style={{fontSize:12,color:C.text.s}}>Intenta con otra palabra o categoría.</span></>
          :<>Sin movimientos en {MONTHS[month]}.<br/><span style={{fontSize:11,color:C.text.s}}>Los registros de otros meses están disponibles<br/>seleccionando el mes arriba.</span></>
        }
      </div>}
      {sorted.map(t=><TxRow key={t.id} t={t} onEdit={()=>setModal(t)} catsCustom={catsCustom}/>)}
    </div>;
  };

  // ── Pestaña Calendario + Pagos Programados ───────────────────────────────
  const CalendarioTab=()=>{
    const currentM=now.getMonth(), currentY=now.getFullYear();
    const [calMes,setCalMes]=useState(currentM);
    const [calAnio,setCalAnio]=useState(currentY);
    const [diaSelec,setDiaSelec]=useState(now.getDate());
    const [confirmPago,setConfirmPago]=useState(null); // pago a confirmar

    const ultimoDia=new Date(calAnio,calMes+1,0).getDate();
    const primerDia=new Date(calAnio,calMes,1).getDay(); // 0=Dom
    const esHoy=(d)=>d===now.getDate()&&calMes===currentM&&calAnio===currentY;
    const esPasado=(d)=>new Date(calAnio,calMes,d)<new Date(currentY,currentM,now.getDate());

    // Gastos reales por día
    function gastoDia(d){
      return tx.filter(t=>{
        const[ty,tm,td]=t.date.split("-").map(Number);
        return ty===calAnio&&(tm-1)===calMes&&td===d&&isGasto(t.cat)&&!isAporteMeta(t);
      }).reduce((s,t)=>s+t.amount,0);
    }
    // Pagos programados que caen en este mes
    const pagosDeMes=pagos.filter(p=>{
      if(!p.activo)return false;
      if(p.frecuencia==="mensual")return true;
      if(p.frecuencia==="unico"){
        // Solo mostrar en el mes/año específico en que fue programado
        const mesP=p.mesUnico??now.getMonth();
        const anioP=p.anioUnico??now.getFullYear();
        return mesP===calMes&&anioP===calAnio;
      }
      return false;
    });
    function pagosDia(d){return pagosDeMes.filter(p=>p.dia===d);}
    function yaConfirmado(p){
      // Verificar si hay una tx con pagoId de este pago en el mes/año del calendario
      return tx.some(t=>{
        if(t.pagoId!==p.id)return false;
        const[ty,tm]=t.date.split("-").map(Number);
        return (tm-1)===calMes&&ty===calAnio;
      });
    }

    // Movimientos del día seleccionado
    const txDia=tx.filter(t=>{
      const[ty,tm,td]=t.date.split("-").map(Number);
      return ty===calAnio&&(tm-1)===calMes&&td===diaSelec;
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));

    const maxGasto=Math.max(...Array.from({length:ultimoDia},(_,i)=>gastoDia(i+1)),1);
    const DIAS_S2=["D","L","M","X","J","V","S"];

    return <div style={{padding:"16px 20px 0"}}>
      {/* Navegación mes/año */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <button onClick={()=>{let m=calMes-1,y=calAnio;if(m<0){m=11;y--;}setCalMes(m);setCalAnio(y);setDiaSelec(1);}}
          style={{background:C.border,border:"none",borderRadius:10,padding:"8px 14px",color:C.text.h,cursor:"pointer",fontSize:16,fontWeight:700}}>←</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:17,fontWeight:900,color:C.text.h}}>{MONTHS[calMes]}</div>
          <div style={{fontSize:11,color:C.text.s}}>{calAnio}</div>
        </div>
        <button onClick={()=>{let m=calMes+1,y=calAnio;if(m>11){m=0;y++;}setCalMes(m);setCalAnio(y);setDiaSelec(1);}}
          style={{background:C.border,border:"none",borderRadius:10,padding:"8px 14px",color:C.text.h,cursor:"pointer",fontSize:16,fontWeight:700}}>→</button>
      </div>

      {/* Cuadrícula calendario */}
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:18,padding:"14px 12px",border:`1px solid ${C.border}`,marginBottom:14}}>
        {/* Headers días semana */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:8}}>
          {DIAS_S2.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:C.text.s,padding:"4px 0"}}>{d}</div>)}
        </div>
        {/* Días */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {/* Espacios vacíos antes del día 1 */}
          {Array.from({length:primerDia}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:ultimoDia},(_,i)=>{
            const d=i+1;
            const gasto=gastoDia(d);
            const pagosDiaArr=pagosDia(d);
            const selec=d===diaSelec;
            const hoyDia=esHoy(d);
            const pasado=esPasado(d);
            const tieneGasto=gasto>0;
            const tienePago=pagosDiaArr.length>0;
            const intensidad=tieneGasto?Math.max(gasto/maxGasto,0.2):0;
            return <button key={d} onClick={()=>setDiaSelec(d)}
              style={{
                aspectRatio:"1",borderRadius:10,border:"none",cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
                background:selec
                  ?C.emerald
                  :hoyDia
                  ?"rgba(16,185,129,0.2)"
                  :tieneGasto
                  ?`rgba(239,68,68,${intensidad*0.35})`
                  :tienePago&&!pasado
                  ?"rgba(56,189,248,0.12)"
                  :"transparent",
                outline:hoyDia&&!selec?`2px solid ${C.emerald}44`:"none",
                transition:"all 0.15s",
              }}>
              <span style={{fontSize:12,fontWeight:selec||hoyDia?"800":"600",
                color:selec?"#000":hoyDia?C.emerald:pasado?ink(0.35):C.text.h}}>{d}</span>
              {/* Indicadores */}
              <div style={{display:"flex",gap:2,height:4,alignItems:"center"}}>
                {tieneGasto&&<div style={{width:4,height:4,borderRadius:"50%",background:selec?"rgba(0,0,0,0.5)":C.red}}/>}
                {tienePago&&<div style={{width:4,height:4,borderRadius:"50%",background:selec?"rgba(0,0,0,0.5)":C.sky}}/>}
              </div>
            </button>;
          })}
        </div>
        {/* Leyenda */}
        <div style={{display:"flex",gap:14,marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.text.s}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.red}}/> Gasto registrado
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.text.s}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.sky}}/> Pago programado
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.text.s}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.emerald}}/> Hoy
          </div>
        </div>
      </div>

      {/* Detalle día seleccionado */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>
            {DIAS_S2[new Date(calAnio,calMes,diaSelec).getDay()]} {diaSelec} de {MONTHS[calMes]}
            {esHoy(diaSelec)&&<span style={{marginLeft:8,background:`${C.emerald}22`,color:C.emerald,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,letterSpacing:1}}> HOY</span>}
          </Lbl>
          {!esPasado(diaSelec)&&<button onClick={()=>{setPagoModalDia(diaSelec);setPagoModal("new");}}
            style={{background:`${C.sky}18`,border:`1px solid ${C.sky}44`,borderRadius:8,padding:"5px 12px",color:C.sky,cursor:"pointer",fontSize:11,fontWeight:700}}>
            + Pago programado
          </button>}
        </div>

        {/* Pagos programados del día */}
        {pagosDia(diaSelec).map(p=>{
          const confirmado=yaConfirmado(p);
          const ci=getCatInfo(p.cat);
          return <div key={p.id} style={{
            display:"flex",alignItems:"center",gap:12,marginBottom:8,
            background:confirmado?"rgba(16,185,129,0.08)":"rgba(56,189,248,0.06)",
            borderRadius:14,padding:"12px 14px",
            border:`1px solid ${confirmado?C.emerald+"33":C.sky+"33"}`,
          }}>
            <div style={{width:40,height:40,borderRadius:12,background:`${ci.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{ci.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{p.nombre}</div>
              <div style={{fontSize:11,color:C.text.s}}>{ci.label} · día {p.dia} · {p.frecuencia==="mensual"?"Mensual":"Una vez"}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:14,fontWeight:800,color:confirmado?C.emerald:C.sky}}>{COP(p.monto)}</div>
              {!confirmado&&(esHoy(diaSelec)||esPasado(diaSelec))&&
                <button onClick={()=>setConfirmPago(p)}
                  style={{marginTop:4,background:`${C.amber}22`,border:`1px solid ${C.amber}44`,borderRadius:6,padding:"3px 8px",color:C.amber,cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ¿Lo pagaste?
                </button>}
              {!confirmado&&!esHoy(diaSelec)&&!esPasado(diaSelec)&&
                <div style={{fontSize:10,color:C.sky,fontWeight:700,marginTop:2}}>Programado</div>}
              {confirmado&&<div style={{fontSize:10,color:C.emerald,fontWeight:700,marginTop:2}}>✓ Pagado</div>}
            </div>
            <button onClick={()=>setPagoModal(p)} style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:18,padding:"0 4px"}}>⋮</button>
          </div>;
        })}

        {/* Movimientos reales del día */}
        {txDia.length>0&&<>
          {txDia.map(t=><TxRow key={t.id} t={t} onEdit={()=>esPasado(diaSelec)?null:setModal(t)}/>)}
        </>}
        {txDia.length===0&&pagosDia(diaSelec).length===0&&(
          <div style={{textAlign:"center",padding:"24px 0",color:C.text.s,fontSize:13,lineHeight:2}}>
            {esPasado(diaSelec)?"Sin movimientos este día.":
             esHoy(diaSelec)?"Sin movimientos hoy aún. ¡Toca + para registrar!":
             "Día futuro — puedes programar un pago arriba."}
          </div>
        )}
      </div>

      {/* Lista pagos programados del mes */}
      {pagosDeMes.length>0&&<>
        <Lbl>Pagos programados este mes</Lbl>
        {pagosDeMes.map(p=>{
          const ci=getCatInfo(p.cat);
          const confirmado=yaConfirmado(p);
          const venceHoy=p.dia===now.getDate()&&calMes===currentM&&calAnio===currentY;
          return <div key={p.id} onClick={()=>setPagoModal(p)}
            style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,
              background:venceHoy&&!confirmado?`${C.amber}10`:"rgba(255,255,255,0.03)",
              borderRadius:14,padding:"12px 14px",cursor:"pointer",
              border:`1px solid ${venceHoy&&!confirmado?C.amber+"44":confirmado?C.emerald+"22":C.border}`}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${ci.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{ci.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{p.nombre}</div>
              <div style={{fontSize:11,color:C.text.s}}>Día {p.dia} · {p.frecuencia==="mensual"?"Mensual":"Una vez"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:confirmado?C.emerald:venceHoy?C.amber:C.sky}}>{COP(p.monto)}</div>
              <div style={{fontSize:10,marginTop:2,color:confirmado?C.emerald:venceHoy?C.amber:C.text.s,fontWeight:700}}>
                {confirmado?"✓ Pagado":venceHoy?"⚠️ Hoy":"Pendiente"}
              </div>
            </div>
          </div>;
        })}
      </>}
      <button onClick={()=>setPagoModal("new")}
        style={{width:"100%",padding:14,borderRadius:14,border:`1px dashed ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:8}}>
        + Nuevo pago programado
      </button>
      {/* Modal ¿Pagaste? */}
      {confirmPago&&(
        <div onClick={()=>setConfirmPago(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",position:"relative"}}>
            <SheetCloseBtn onClose={()=>setConfirmPago(null)}/>
            <div style={{display:"flex",justifyContent:"center",marginBottom:16,padding:"4px 0 8px"}}>
              <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
            </div>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:36,marginBottom:10}}>{getCatInfo(confirmPago.cat).icon}</div>
              <div style={{fontSize:17,fontWeight:900,color:C.text.h,marginBottom:6}}>{confirmPago.nombre}</div>
              <div style={{fontSize:26,fontWeight:900,color:C.sky,letterSpacing:-1}}>{COP(confirmPago.monto)}</div>
              <div style={{fontSize:12,color:C.text.s,marginTop:6}}>Día {confirmPago.dia} · {confirmPago.frecuencia==="mensual"?"Mensual":"Una vez"}</div>
            </div>
            <div style={{fontSize:14,fontWeight:800,color:C.text.b,textAlign:"center",marginBottom:16}}>¿Ya realizaste este pago?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={async()=>{await handlePagoConfirmar(confirmPago);setConfirmPago(null);}}
                style={{width:"100%",padding:"16px",borderRadius:14,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${C.emerald},#059669)`,
                  color:"#000",fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>✅</span> Sí, ya lo pagué — registrar
              </button>
              <button onClick={async()=>{await handlePagoPostponer(confirmPago);setConfirmPago(null);}}
                style={{width:"100%",padding:"16px",borderRadius:14,border:`1px solid ${C.amber}44`,cursor:"pointer",
                  background:`${C.amber}12`,
                  color:C.amber,fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>⏰</span> Recordármelo mañana
              </button>
              <button onClick={async()=>{await handlePagoNoPague(confirmPago);setConfirmPago(null);}}
                style={{width:"100%",padding:"16px",borderRadius:14,border:`1px solid ${C.red}33`,cursor:"pointer",
                  background:`${C.red}10`,
                  color:C.red,fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>❌</span> No lo pagué — eliminar recordatorio
              </button>
              <button onClick={()=>setConfirmPago(null)}
                style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:13,padding:"8px",fontWeight:600}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>;
  };


  // ── Eliminar registros de un mes ─────────────────────────────────────────
  function EliminarMesSection({tx, MONTHS, MONTHS_S, user, db, isMonth}){
    const [mesSelec, setMesSelec] = useState(null);
    const [confirm1, setConfirm1] = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [abierto,  setAbierto]  = useState(false);

    const mesesConTx = [...new Set(tx.map(t => {
      const[y,m]=t.date.split("-").map(Number);
      return `${y}-${m-1}`;
    }))].map(k => {
      const[y,m]=k.split("-").map(Number);
      return {y, m, label:`${MONTHS[m]} ${y}`, count: tx.filter(t=>isMonth(t.date,m,y)).length};
    }).sort((a,b)=>b.y!==a.y?b.y-a.y:b.m-a.m);

    async function eliminarMes(){
      if(!mesSelec||!user)return;
      setLoading(true);
      const txDelMes = tx.filter(t=>isMonth(t.date,mesSelec.m,mesSelec.y));
      await Promise.all(txDelMes.map(t=>deleteDoc(doc(db,"usuarios",user.uid,"transacciones",t.id))));
      setMesSelec(null); setConfirm1(false); setLoading(false);
    }

    return (
      <div>
        <div style={{fontSize:13,fontWeight:700,color:C.text.h,marginBottom:4}}>Eliminar registros de un mes</div>
        <div style={{fontSize:12,color:C.text.b,marginBottom:12,lineHeight:1.5}}>
          Borra todas las transacciones de un mes específico. Las metas y presupuestos no se tocan.
        </div>
        {/* Selector personalizado — sin el feo select nativo */}
        <div style={{position:"relative",marginBottom:10}}>
          <button onClick={()=>setAbierto(a=>!a)} style={{
            width:"100%",padding:"11px 14px",borderRadius:10,
            border:`1px solid ${C.border}`,background:C.surface,
            color:mesSelec?C.text.h:C.text.s,fontSize:14,fontWeight:mesSelec?700:400,
            cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",
          }}>
            <span>{mesSelec?`${mesSelec.label} · ${mesSelec.count} movimiento${mesSelec.count!==1?"s":""}` : "Selecciona un mes..."}</span>
            <span style={{fontSize:10,color:C.text.s}}>{abierto?"▲":"▼"}</span>
          </button>
          {abierto&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:C.card||"#0d1117",border:`1px solid ${C.border}`,borderRadius:10,zIndex:100,overflow:"hidden",maxHeight:200,overflowY:"auto"}}>
              {mesesConTx.length===0&&<div style={{padding:"12px 14px",fontSize:13,color:C.text.s}}>Sin meses con movimientos</div>}
              {mesesConTx.map(({y,m,label,count})=>(
                <button key={`${y}-${m}`} onClick={()=>{
                  setMesSelec({y,m,label,count});
                  setConfirm1(false); setAbierto(false);
                }} style={{
                  width:"100%",padding:"11px 14px",background:"none",border:"none",
                  borderBottom:`1px solid ${C.border}`,cursor:"pointer",
                  textAlign:"left",fontSize:13,color:C.text.h,fontWeight:600,
                }}>
                  {label} · <span style={{color:C.text.s,fontWeight:400}}>{count} movimiento{count!==1?"s":""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {mesSelec&&!confirm1&&(
          <button onClick={()=>setConfirm1(true)} style={{width:"100%",padding:"11px",borderRadius:10,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:13,fontWeight:700}}>
            Eliminar {mesSelec.count} movimiento{mesSelec.count!==1?"s":""} de {mesSelec.label}
          </button>
        )}
        {mesSelec&&confirm1&&(
          <div style={{background:`${C.red}12`,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.red}40`}}>
            <div style={{fontSize:12,color:C.text.h,marginBottom:10,lineHeight:1.6}}>
              ¿Seguro? Se eliminarán <b style={{color:C.red}}>{mesSelec.count} movimientos</b> de <b>{mesSelec.label}</b>. No se puede deshacer.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setConfirm1(false);setMesSelec(null);}} style={{flex:1,padding:"10px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:13,fontWeight:700}}>Cancelar</button>
              <button onClick={eliminarMes} disabled={loading} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:C.red,color:"#fff",cursor:loading?"not-allowed":"pointer",fontSize:13,fontWeight:800}}>
                {loading?"Eliminando...":"Sí, eliminar"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Eliminar cuenta completa ──────────────────────────────────────────────
  function EliminarCuentaSection({user, db, handleLogout}){
    const [paso, setPaso] = useState(0); // 0=inicial 1=confirmar 2=eliminando
    // Reset if component remounts
    
    async function eliminarCuenta(){
      if(!user)return;
      setPaso(2);
      const uid=user.uid;
      // Eliminar todas las subcolecciones
      const colecciones=["transacciones","metas","pagos_programados","presupuestos","prestamos"];
      for(const col of colecciones){
        const snap=await getDocs(collection(db,"usuarios",uid,col));
        await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
      }
      // Eliminar el documento principal del usuario
      await deleteDoc(doc(db,"usuarios",uid));
      // Cerrar sesión
      await handleLogout();
    }

    return (
      <div>
        <div style={{fontSize:13,fontWeight:700,color:C.text.h,marginBottom:4}}>Eliminar cuenta y todos los datos</div>
        <div style={{fontSize:12,color:C.text.b,marginBottom:12,lineHeight:1.5}}>
          Borra permanentemente todas tus transacciones, metas, presupuestos y configuración. Tu cuenta de Google no se elimina.
        </div>
        {paso===0&&(
          <button onClick={()=>setPaso(1)} style={{width:"100%",padding:"11px",borderRadius:10,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:13,fontWeight:700}}>
            Eliminar mi cuenta y todos mis datos
          </button>
        )}
        {paso===1&&(
          <div style={{background:`${C.red}12`,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.red}40`}}>
            <div style={{fontSize:13,fontWeight:800,color:C.red,marginBottom:6}}>⚠️ Esto no se puede deshacer</div>
            <div style={{fontSize:12,color:C.text.h,marginBottom:12,lineHeight:1.6}}>
              Se eliminarán permanentemente todas tus transacciones, metas, pagos programados y configuración. ¿Estás completamente seguro?
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setPaso(0)} style={{flex:1,padding:"10px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:13,fontWeight:700}}>
                No, cancelar
              </button>
              <button onClick={eliminarCuenta} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800}}>
                Sí, eliminar todo
              </button>
            </div>
          </div>
        )}
        {paso===2&&(
          <div style={{textAlign:"center",padding:"12px 0",fontSize:13,color:C.text.b}}>
            Eliminando datos... un momento
          </div>
        )}
      </div>
    );
  }

  const ConfigTab=()=>{
    const [tmp,setTmp]=useState(String(sal));
    return <div style={{padding:"16px 20px 0"}}>
      <Card style={{marginBottom:12,display:"flex",alignItems:"center",gap:14}}>
        <img src={user.photoURL} alt="" style={{width:48,height:48,borderRadius:"50%"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text.h}}>{user.displayName}</div>
          <div style={{fontSize:12,color:C.text.b}}>{user.email}</div>
        </div>
        <button onClick={handleLogout} style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:8,padding:"7px 14px",color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>Salir</button>
      </Card>
      <Card style={{marginBottom:12}}>
        <Lbl>Ingreso mensual de referencia (COP)</Lbl>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)}
            style={{flex:1,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text.h,fontSize:16,outline:"none"}}/>
          <button onClick={()=>handleSalarioChange(parseFloat(tmp)||sal)} style={{background:`linear-gradient(135deg,${C.emerald},#059669)`,border:"none",borderRadius:10,padding:"0 20px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:18}}>✓</button>
        </div>
        <div style={{fontSize:12,color:C.text.b,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 14px",lineHeight:2}}>
          El cambio aplica desde el mes siguiente — los meses anteriores conservan su valor original.<br/>
          Puedes registrar ingresos extra con <b style={{color:C.emerald}}>+ Ingreso</b> en el botón +.<br/>
          Con {COP(parseFloat(tmp)||sal)} te sugiero:<br/>
          <span style={{color:C.sky}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:C.indigo}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.10))} Aportes a metas (10%)</span><br/>
          <span style={{color:C.text.b}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.85))} Gastos libres</span>
        </div>
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,rgba(2,44,34,0.75),rgba(6,95,70,0.85))",borderColor:`${C.emerald}55`}}>
        <div style={{fontSize:11,color:"#6ee7b7",letterSpacing:1.2,fontWeight:800,textTransform:"uppercase",marginBottom:8}}>Total guardado en metas</div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid rgba(255,255,255,0.15)`}}>
          <span style={{fontSize:14,color:"#fff",fontWeight:700}}>⭐ En todas las metas</span>
          <span style={{fontSize:15,fontWeight:900,color:"#fff"}}>{COP(totalEnMetas)}</span>
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",marginTop:8,lineHeight:1.6,fontWeight:500}}>
          Cada meta tiene su propio progreso. Ve a la pestaña ⭐ Metas para ver el detalle.
        </div>
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,rgba(30,27,75,0.75),rgba(67,56,202,0.75))",borderColor:`${C.indigo}55`}}>
        <div style={{fontSize:12,color:"#c7d2fe",fontWeight:800,marginBottom:8,letterSpacing:1.2,textTransform:"uppercase"}}>📐 Regla de oro</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.95)",lineHeight:1.8,fontWeight:500}}><b style={{color:"#fff",fontWeight:900}}>Págate primero.</b> Al recibir el sueldo, transfiere el ahorro <i>antes</i> de gastar.</div>
      </Card>
      <Card style={{marginBottom:12}}>
        <Lbl>Tema de color</Lbl>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {Object.entries(TEMAS).map(([key,t])=>(
            <button key={key} onClick={()=>cambiarTema(key)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,border:"none",cursor:"pointer",
                background:tema===key?`${t.indigo}20`:C.surface,
                outline:tema===key?`2px solid ${t.indigo}`:"2px solid transparent",
                transition:"all 0.15s",textAlign:"left"}}>
              {/* Preview colores */}
              <div style={{display:"flex",gap:3,flexShrink:0}}>
                <div style={{width:16,height:16,borderRadius:4,background:t.bg,border:"1px solid rgba(255,255,255,0.15)"}}/>
                <div style={{width:16,height:16,borderRadius:4,background:t.indigo}}/>
                <div style={{width:16,height:16,borderRadius:4,background:t.emerald}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{t.label}</div>
                <div style={{fontSize:11,color:C.text.s,marginTop:1}}>{t.desc}</div>
              </div>
              {tema===key&&<span style={{color:t.indigo,fontSize:16,fontWeight:800}}>✓</span>}
            </button>
          ))}
        </div>
      </Card>
      <Card style={{marginBottom:12}}>
        <Lbl>Estilo de cards</Lbl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            {id:"solid",    label:"Sólido",    desc:"Premium limpio"},
            {id:"glass",    label:"Glass",     desc:"Translúcido"},
            {id:"gradient", label:"Gradiente", desc:"Con color suave"},
            {id:"classic",  label:"Clásico",   desc:"3D con orbs"},
          ].map(s=>(
            <button key={s.id} onClick={()=>cambiarCardStyle(s.id)}
              style={{padding:"12px 10px",borderRadius:12,border:"none",cursor:"pointer",
                background:cardStyle===s.id?`${C.indigo}20`:C.surface,
                outline:cardStyle===s.id?`2px solid ${C.indigo}`:"2px solid transparent",
                transition:"all 0.15s",textAlign:"center"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text.h}}>{s.label}</div>
              <div style={{fontSize:10,color:C.text.s,marginTop:2}}>{s.desc}</div>
            </button>
          ))}
        </div>
      </Card>
      {/* ── Zona de peligro ── */}
      <Card style={{marginBottom:12,borderColor:`${C.red}30`,background:`linear-gradient(135deg,${C.red}08,${C.red}04)`}}>
        <Lbl style={{color:C.red}}>⚠️ Zona de peligro</Lbl>
        <EliminarMesSection tx={tx} MONTHS={MONTHS} MONTHS_S={MONTHS_S} user={user} db={db} isMonth={isMonth}/>
        <div style={{height:1,background:C.border,margin:"16px 0"}}/>
        <EliminarCuentaSection user={user} db={db} handleLogout={handleLogout}/>
      </Card>
      <div style={{textAlign:"center",fontSize:12,color:C.text.s,padding:"18px 0",lineHeight:1.8}}>Datos guardados en Firebase · accesibles desde cualquier dispositivo.</div>
    </div>;
  };

  // Nav con ícono correcto para Metas (⭐ en lugar de 🎯)
  // Ícono SVG estrella outline para Metas
  function StarIcon({active}){
    const pts="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26";
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={active?"#f59e0b":ink(0.32)} strokeWidth={active?"1.8":"1.5"}
      strokeLinecap="round" strokeLinejoin="round">
      <polygon points={pts}/>
    </svg>;
  }

  const NAV=[
    {id:"home", icon:"⬡", label:"Inicio",  activeColor:C.emerald},
    {id:"mov",  icon:"≡", label:"Movim.",  activeColor:C.emerald},
    {id:"anal", icon:"▤", label:"Análisis", activeColor:C.indigo},
    {id:"metas",icon:null, label:"Metas",   activeColor:"#f59e0b"},
    {id:"cal",  icon:"📅", label:"Agenda",  activeColor:C.sky},
  ];

  // ─── MODAL de alerta de gasto elevado ──────────────────────────────────────
  const AlertaGastoModal = alertaGasto ? (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",pointerEvents:"none"}}>
      <div style={{
        width:"100%",maxWidth:430,margin:"0 0 96px",padding:"0 16px",
        animation:"slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        pointerEvents:"auto",
      }}>
        <div style={{
          background:"linear-gradient(135deg,#1a0a00,#2d1500)",
          borderRadius:18,padding:"16px 18px",
          border:`1px solid ${C.amber}55`,
          boxShadow:`0 8px 32px rgba(0,0,0,0.6)`,
        }}>
          <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
            <div style={{fontSize:32,flexShrink:0,lineHeight:1}}>
              {alertaGasto.pct>=1?"🚨":alertaGasto.pct>=0.5?"⚠️":"💡"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:800,color:C.amber,marginBottom:5}}>
                {alertaGasto.pct>=1
                  ? "¡Gasto mayor a tu ingreso mensual!"
                  : alertaGasto.pct>=0.7
                  ? `Este gasto representa el ${Math.round(alertaGasto.pct*100)}% de tu sueldo`
                  : alertaGasto.pct>=0.5
                  ? `La mitad de tu sueldo en un solo gasto`
                  : `Gasto importante: ${Math.round(alertaGasto.pct*100)}% del sueldo`}
              </div>
              <div style={{fontSize:12,color:C.text.b,lineHeight:1.6,marginBottom:10}}>
                {alertaGasto.pct>=1
                  ? `Registraste ${COP(alertaGasto.monto)} pero tu ingreso de referencia es ${COP(salario||0)}. Revisa si es correcto.`
                  : `Registraste ${COP(alertaGasto.monto)} en "${alertaGasto.desc}". Ten en cuenta el impacto en tu presupuesto.`}
              </div>
              <button onClick={()=>setAlertaGasto(null)} style={{
                background:`${C.amber}22`,border:`1px solid ${C.amber}44`,borderRadius:8,
                padding:"6px 16px",color:C.amber,cursor:"pointer",fontSize:12,fontWeight:700,
              }}>Entendido</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return <div style={{minHeight:"100vh",background:C.bg,color:C.text.h,fontFamily:"'DM Sans','Segoe UI',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:88}}>
    <style>{CSS}</style>
    {/* Topbar */}
    <div style={{padding:"16px 20px 14px",background:`${C.bg}f0`,position:"sticky",top:0,zIndex:20,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:C.text.s,letterSpacing:1.8,fontWeight:600,marginBottom:2,opacity:0.7}}>MIS FINANZAS PRO</div>
        <div style={{fontSize:21,fontWeight:700,letterSpacing:-0.5,color:C.text.h}}>{user.displayName?.split(" ")[0]} 👋</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {tab==="home"&&<button onClick={toggleCompacto} style={{
          background:compacto?`${C.indigo}22`:C.card, border:"none",
          borderRadius:10, padding:"8px 10px", cursor:"pointer",
          boxShadow:elev("card"), transition:"all 0.2s",
          display:"flex",alignItems:"center",justifyContent:"center",
          color:compacto?C.indigo:C.text.s, fontSize:16, lineHeight:1,
        }} title={compacto?"Vista completa":"Vista compacta"}>
          {compacto?"⊞":"⊟"}
        </button>}
        <div style={{background:C.card,borderRadius:10,padding:"6px 14px",fontSize:12,color:C.text.b,fontWeight:600,boxShadow:elev("card")}}>{MONTHS_S[now.getMonth()]} {now.getFullYear()}</div>
        {prestamos.filter(p=>!p.devuelto).length>0&&(
          <button onClick={()=>setPrestamosModal(true)}
            style={{background:"rgba(244,63,94,0.12)",border:"none",borderRadius:10,
              padding:"6px 10px",fontSize:12,fontWeight:700,color:"#f43f5e",cursor:"pointer",
              display:"flex",alignItems:"center",gap:4}}>
            🤝 {prestamos.filter(p=>!p.devuelto).length}
          </button>
        )}
        <button onClick={()=>setMenuOpen(o=>!o)} style={{
          background:menuOpen?`${C.indigo}22`:C.card,
          border:"none",
          borderRadius:10,padding:"8px 10px",cursor:"pointer",
          display:"flex",flexDirection:"column",gap:4,alignItems:"center",justifyContent:"center",
          boxShadow:elev("card"),
          transition:"all 0.2s",
        }}>
          {[0,1,2].map(i=><div key={i} style={{
            width:18,height:2,borderRadius:99,
            background:menuOpen?C.indigo:C.text.b,
            transition:"all 0.2s",
            transform:menuOpen?(i===0?"rotate(45deg) translate(4px,4px)":i===2?"rotate(-45deg) translate(4px,-4px)":"scaleX(0)"):"none",
          }}/>)}
        </button>
      </div>
    </div>
    {/* Menú hamburguesa */}
    {menuOpen&&<div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:19,background:"rgba(0,0,0,0.5)",animation:"fadeIn 0.18s ease"}}/>}
    {menuOpen&&<div style={{position:"fixed",top:72,right:20,zIndex:21,background:C.card,borderRadius:18,border:`1px solid ${C.border}`,padding:"0",minWidth:220,boxShadow:"0 16px 48px rgba(0,0,0,0.4)",animation:"slideDown 0.18s ease",overflow:"hidden"}}>
      {/* Info usuario */}
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <img src={user.photoURL} alt="" style={{width:38,height:38,borderRadius:"50%",border:`2px solid ${C.indigo}44`}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.displayName?.split(" ")[0]}</div>
            <div style={{fontSize:10,color:C.text.s,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
          </div>
        </div>
        {/* Resumen financiero rápido */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div style={{background:`${C.emerald}12`,border:`1px solid ${C.emerald}25`,borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:C.emerald,fontWeight:700,letterSpacing:0.8,marginBottom:2}}>DISPONIBLE</div>
            <div style={{fontSize:13,fontWeight:800,color:C.emeraldLight}}>{COP(Math.max(saldo,0))}</div>
          </div>
          <div style={{background:`${C.red}10`,border:`1px solid ${C.red}20`,borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:C.red,fontWeight:700,letterSpacing:0.8,marginBottom:2}}>GASTOS</div>
            <div style={{fontSize:13,fontWeight:800,color:C.red}}>{COP(totalGasto)}</div>
          </div>
        </div>
      </div>
      {/* Opciones */}
      <div style={{padding:"6px 0"}}>
        {[
          {icon:"🏠", label:"Inicio",        onClick:()=>{changeTab("home");setMenuOpen(false);}},
          {icon:"≡",  label:"Movimientos",   onClick:()=>{changeTab("mov");setMenuOpen(false);}},
          {icon:"⭐", label:"Metas",          onClick:()=>{changeTab("metas");setMenuOpen(false);}},
          {icon:"📅", label:"Agenda",         onClick:()=>{changeTab("cal");setMenuOpen(false);}},
        ].map(o=>(
          <button key={o.label} onClick={o.onClick}
            style={{width:"100%",padding:"10px 16px",background:"none",border:"none",cursor:"pointer",
              display:"flex",alignItems:"center",gap:12,fontSize:13,fontWeight:600,
              color:C.text.h,textAlign:"left"}}>
            <span style={{fontSize:16,width:20,textAlign:"center"}}>{o.icon}</span>{o.label}
          </button>
        ))}
        <div style={{height:1,background:C.border,margin:"4px 16px"}}/>
        {[
          {icon:"🤝", label:"Préstamos",            badge:prestamos.filter(p=>!p.devuelto).length||null, color:"#f43f5e", onClick:()=>{setPrestamosModal(true);setMenuOpen(false);}},
          {icon:"📤", label:"Exportar",              onClick:()=>{setExportModal(true);setMenuOpen(false);}},
          {icon:"🎨", label:`Tema: ${TEMAS[tema]?.label||"Navy"}`, onClick:()=>{changeTab("cfg");setMenuOpen(false);}},
          {icon:"⚙️", label:"Configuración",        onClick:()=>{changeTab("cfg");setMenuOpen(false);}},
        ].map(o=>(
          <button key={o.label} onClick={o.onClick}
            style={{width:"100%",padding:"10px 16px",background:"none",border:"none",cursor:"pointer",
              display:"flex",alignItems:"center",gap:12,fontSize:13,fontWeight:600,
              color:C.text.h,textAlign:"left"}}>
            <span style={{fontSize:16,width:20,textAlign:"center"}}>{o.icon}</span>
            <span style={{flex:1}}>{o.label}</span>
            {o.badge&&<span style={{background:"#f43f5e",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:800}}>{o.badge}</span>}
          </button>
        ))}
      </div>
      <div style={{borderTop:`1px solid ${C.border}`}}/>
      <div style={{padding:"6px 0"}}>
        <button onClick={()=>{handleLogout();setMenuOpen(false);}}
          style={{width:"100%",padding:"10px 16px",background:"none",border:"none",cursor:"pointer",
            display:"flex",alignItems:"center",gap:12,fontSize:13,fontWeight:600,color:C.red,textAlign:"left"}}>
          <span style={{fontSize:16,width:20,textAlign:"center"}}>🚪</span> Cerrar sesión
        </button>
      </div>
    </div>}
    {tab==="home"&&<HomeTab/>}{tab==="metas"&&<MetasTab/>}{tab==="cal"&&<CalendarioTab/>}{tab==="mov"&&<MovTab/>}{tab==="anal"&&<AnalisisTab/>}{tab==="cfg"&&<ConfigTab/>}
    {/* FAB */}
    {!modal&&!goalModal&&!pagoModal&&<button onClick={()=>{
      if(tab==="metas") setGoalModal("new");
      else if(tab==="cal"){setPagoModalDia(null);setPagoModal("new");}
      else setModal("new");
    }} style={{
      position:"fixed",bottom:92,right:20,
      width:60,height:60,borderRadius:"50%",
      background:tab==="metas"
        ?`linear-gradient(135deg,#818cf8,#6366f1,#4338ca)`
        :tab==="cal"
        ?`linear-gradient(135deg,#38bdf8,#0284c7)`
        :`linear-gradient(135deg,#34d399,#10b981,#059669)`,
      border:"none",fontSize:30,color:"#fff",cursor:"pointer",
      boxShadow:tab==="metas"
        ?`0 8px 32px rgba(99,102,241,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`
        :tab==="cal"
        ?`0 8px 32px rgba(56,189,248,0.5), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`
        :`0 8px 32px rgba(16,185,129,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:100,lineHeight:1,
      transition:"all 0.3s ease",
    }}>＋</button>}
    {modal&&<TxModal initial={modal==="new"||modal==="meta_aporte"?null:modal} initialCat={modal==="meta_aporte"?"meta_aporte":undefined} goals={goals} saldoDisponible={saldo} onClose={()=>setModal(null)} onSave={handleSave} onDelete={handleDelete} catsCustom={catsCustom} onEditCustom={m=>setCatPersonalModal(m)} onOpenPrestamo={()=>{setPrestamosModal(true);setPrestamoForm("new");}} txHistorial={tx}/>}
    {goalModal&&<GoalModal initial={goalModal==="new"?null:goalModal} onClose={()=>setGoalModal(null)} onSave={handleGoalSave} onDelete={handleGoalDelete}/>}
    {catPersonalModal&&<CatPersonalModal
      main={catPersonalModal}
      catsCustom={catsCustom}
      handleCatCustomSave={handleCatCustomSave}
      onClose={()=>setCatPersonalModal(null)}/>}
    {prestamosModal&&<PrestamosModal
      prestamos={prestamos}
      onClose={()=>setPrestamosModal(false)}
      onSave={handlePrestamoSave}
      onDelete={handlePrestamoDelete}
      onToggle={handlePrestamoToggle}
      prestamoForm={prestamoForm}
      setPrestamoForm={setPrestamoForm}/>}
    {/* Modal plan inteligente (sugerencia inicial + histórico) */}
    {budgetSetupOpen&&(()=>{
      const sug=getSuggestedBudgets({
        salario:salario||0,
        txAll:tx,
        MAIN_CATS,
        isGasto,
        isAporteMeta,
        isMonth,
        presupuestosActuales:presupuestos,
        currentMonth:now.getMonth(),
        currentYear:now.getFullYear(),
      });
      return <BudgetSetupModal
        open={budgetSetupOpen}
        onClose={()=>setBudgetSetupOpen(false)}
        onSave={handleBudgetBulkSave}
        salario={salario||0}
        mode={sug.mode}
        mesesDatos={sug.mesesDatos}
        suggestions={sug.suggestions}
        MAIN_CATS={MAIN_CATS}
        C={C} COP={COP}/>;
    })()}
    {presupuestoModal&&<PresupuestoModal
      cat={presupuestoModal}
      gastoActual={gastosTx.filter(t=>presupuestoModal.subs?.some(s=>s.id===t.cat)).reduce((s,t)=>s+t.amount,0)}
      limiteActual={presupuestos[presupuestoModal.id]||0}
      onClose={()=>setPresupuestoModal(null)}
      onSave={handlePresupuestoSave}/>}
    {pagoModal&&<PagoModal
      initial={pagoModal==="new"?null:pagoModal}
      diaInicial={pagoModalDia||now.getDate()}
      mesInicial={tab==="cal"?undefined:now.getMonth()}
      anioInicial={tab==="cal"?undefined:now.getFullYear()}
      onClose={()=>{setPagoModal(null);setPagoModalDia(null);}}
      onSave={handlePagoSave}
      onDelete={handlePagoDelete}/>}
    {/* Modal exportar */}
    {exportModal&&<ExportModalSheet
      onClose={()=>setExportModal(false)}
      exportarCSV={exportarCSV} exportarPDF={exportarPDF}
      tx={tx} now={now} isMonth={isMonth} MONTHS={MONTHS}/>}
    {/* Banner in-app pagos pendientes hoy */}
    {pagosPendientesHoy.length>0&&!modal&&!goalModal&&!pagoModal&&(
      <div style={{position:"fixed",top:74,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 32px)",maxWidth:398,zIndex:18,animation:"slideDown 0.3s ease"}}>
        <div style={{background:"linear-gradient(135deg,#1a0f00,#2d1a00)",borderRadius:14,padding:"12px 16px",border:`1px solid ${C.amber}55`,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24,flexShrink:0}}>🔔</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:C.amber,marginBottom:2}}>
                {pagosPendientesHoy.length===1
                  ?`Pago pendiente hoy: ${pagosPendientesHoy[0].nombre}`
                  :`${pagosPendientesHoy.length} pagos pendientes hoy`}
              </div>
              <div style={{fontSize:11,color:C.text.b}}>
                {COP(pagosPendientesHoy.reduce((s,p)=>s+p.monto,0))} total · Toca para confirmar
              </div>
            </div>
            <button onClick={()=>changeTab("cal")} style={{background:`${C.amber}22`,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"6px 12px",color:C.amber,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Ver</button>
          </div>
        </div>
      </div>
    )}
    {AlertaGastoModal}
    {/* Nav */}
    <nav style={{
      position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,
      background:`${C.bg}ee`,
      borderTop:`1px solid ${ink(0.06)}`,
      backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      display:"flex",justifyContent:"space-around",padding:"12px 0 20px",zIndex:50,
    }}>
      {NAV.map(v=><button key={v.id} onClick={()=>changeTab(v.id)} style={{
        background:"none",border:"none",cursor:"pointer",
        display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        color:tab===v.id?v.activeColor:ink(0.32),
        transition:"color 0.2s",
        padding:"4px 12px",
      }}>
        {v.id==="metas"
          ?<StarIcon active={tab==="metas"}/>
          :<span style={{fontSize:22,lineHeight:1}}>{v.icon}</span>}
        <span style={{fontSize:10,fontWeight:tab===v.id?700:500,letterSpacing:0.3,transition:"color 0.2s"}}>{v.label}</span>
      </button>)}
    </nav>
    {/* Modal confirmación salir */}
    {exitConfirm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:24,animation:"fadeIn 0.15s ease"}}>
      <div style={{background:C.card,borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:320,boxShadow:"0 24px 60px rgba(0,0,0,0.5)",animation:"fadeSlideUp 0.2s ease"}}>
        <div style={{fontSize:32,textAlign:"center",marginBottom:12}}>👋</div>
        <div style={{fontSize:17,fontWeight:800,color:C.text.h,textAlign:"center",marginBottom:8}}>¿Deseas salir?</div>
        <div style={{fontSize:13,color:C.text.s,textAlign:"center",marginBottom:24,lineHeight:1.5}}>Tus datos están guardados y seguros.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>{
            // Limpiar el stack y salir
            history.go(-(history.length));
            setTimeout(()=>window.close(),100);
          }} style={{width:"100%",padding:14,borderRadius:14,border:"none",cursor:"pointer",fontSize:15,fontWeight:800,background:`linear-gradient(135deg,${C.red},#dc2626)`,color:"#fff"}}>
            Salir
          </button>
          <button onClick={()=>setExitConfirm(false)} style={{width:"100%",padding:14,borderRadius:14,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:15,fontWeight:700,background:C.surface,color:C.text.b}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>}
  </div>;
}