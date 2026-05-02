import { SplashScreen } from "./SplashScreen";
import * as FS from "./firestoreService";
import { getSalarioDelMes as getSalarioDelMesUtil, calcSaldoAcumulado } from "./finanzasUtils";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { alertInfo, alertError, alertWarning, alertLimit } from "./GlobalAlert";
import { InsightsEngine } from "./InsightsEngine";
import { LogrosTab, calcBadgesDesbloqueados, calcMesesPerfectos, BADGES_DEF } from "./LogrosEngine";
import { FinancialScore } from "./FinancialScore";
import { MonthlyProjection } from "./MonthlyProjection";
import { getSuggestedBudgets, BudgetSetupBanner, BudgetHealth } from "./BudgetEngine";
import { BudgetSetupModal } from "./BudgetSetupModal";
import { SimuladorDecision } from "./SimuladorDecision";
import { AsistenteIA } from "./AsistenteIA";
import { DeudasModal } from "./DeudasModal";
import { PatrimonioWidget } from "./PatrimonioWidget";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  getDoc, setDoc, getDocs
} from "firebase/firestore";

// ─── TEMAS OSCUROS ────────────────────────────────────────────────────────────
const TEMAS = {
  // ── OSCUROS ───────────────────────────────────────────────────────────────

  // Navy — azul profundo clásico
  navy: {
    _tid:"navy",
    bg:"#080c18", card:"#0d1117",
    surface:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.09)", borderStrong:"rgba(255,255,255,0.18)",
    indigo:"#6366f1", indigoLight:"#818cf8",
    emerald:"#10b981", emeraldLight:"#34d399",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#f1f5f9", b:"#94a3b8", s:"#64748b", m:"#64748b" },
    label:"🌊 Navy", desc:"Azul profundo clásico",
  },

  // Midnight — AMOLED premium, hero card con variante elegible
  black: {
    _tid:"black",
    bg:"#000000", card:"#080808",
    surface:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.08)", borderStrong:"rgba(255,255,255,0.18)",
    indigo:"#6366f1", indigoLight:"#818cf8",
    emerald:"#10b981", emeraldLight:"#34d399",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#ffffff", b:"#cbd5e1", s:"#64748b", m:"#64748b" },
    label:"🖤 Midnight", desc:"AMOLED premium",
  },

  // Noir — negro mate elegante, profundidad 3D
  forest: {
    _tid:"noir",
    bg:"#111111", card:"#181818",
    surface:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.09)", borderStrong:"rgba(255,255,255,0.18)",
    indigo:"#6366f1", indigoLight:"#818cf8",
    emerald:"#10b981", emeraldLight:"#34d399",
    amber:"#f59e0b", red:"#ef4444", violet:"#8b5cf6", sky:"#38bdf8",
    text:{ h:"#f9fafb", b:"#9ca3af", s:"#6b7280", m:"#6b7280" },
    label:"⬛ Noir", desc:"Negro mate premium 3D",
  },

  // ── CLAROS ────────────────────────────────────────────────────────────────

  // Perla — blanco puro minimalista con orbs suaves
  pearl: {
    _tid:"pearl", isLight:true,
    bg:"#f4f6f9", card:"#ffffff",
    surface:"rgba(15,23,42,0.03)", border:"rgba(15,23,42,0.07)", borderStrong:"rgba(15,23,42,0.14)",
    indigo:"#4f46e5", indigoLight:"#6366f1",
    emerald:"#059669", emeraldLight:"#10b981",
    amber:"#d97706", red:"#dc2626", violet:"#7c3aed", sky:"#0284c7",
    text:{ h:"#0f172a", b:"#475569", s:"#94a3b8", m:"#94a3b8" },
    label:"🤍 Perla", desc:"Blanco puro minimalista",
  },


  // Bruma — gris azulado suave (versión original restaurada)
  mist: {
    _tid:"mist", isLight:true,
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

// Fondo con gradiente/textura por tema — el glass necesita algo detrás para verse
function themeBg(){
  const tid = C._tid || "navy";
  // Midnight — gradiente índigo profundo desde arriba (como el original)
  if(tid==="black")  return "radial-gradient(ellipse 110% 55% at 50% -5%, #1a1040 0%, #000000 60%)";
  // Noir — negro mate con capas sutiles, sin color
  if(tid==="noir")   return "linear-gradient(180deg, #1a1a1a 0%, #111111 50%, #0d0d0d 100%)";
  // Perla — blanco con toque azul muy sutil
  if(tid==="pearl")  return "linear-gradient(160deg, #eef2ff 0%, #f4f6f9 40%, #f0f4ff 100%)";

  // Bruma — gris azulado original, no tan intenso
  if(tid==="mist")   return "linear-gradient(160deg, #dde3ec 0%, #eef2f6 40%, #e4eaf2 100%)";
  // Navy default
  return "radial-gradient(ellipse 110% 55% at 50% -5%, #0f1535 0%, #080c18 55%)";
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


// ─── SISTEMA DE DISEÑO POR TEMA ──────────────────────────────────────────────
// Cada tema define su propia identidad visual — no hay estilos de card separados.
// Midnight → glassmorphism máximo, negro profundo, sombras dramáticas
// Navy     → glass moderado, azul profundo, elegante
// Forest   → glass con tinte verde oscuro, orgánico
// Bruma    → glass claro premium, iOS 26 Liquid Glass
// Perla    → blanco limpio, minimalista puro
// Arena    → cálido, gradientes suaves

// CS sigue existiendo para compatibilidad con código que lo lee
const CS = { style: "glass" };
// Estilo de la hero card — "gradient" | "glass" | "matte"
// gradient = gradiente clásico con orbs (default, el que mejor se ve)
// glass    = translúcido con blur
// matte    = sólido premium sin transparencias
const HS = { style: "gradient" };

// Retorna el background de una card según el tema activo
function cardBg(accentColor){
  const acc = accentColor || C.indigo;
  const tid = C._tid || "navy";
  if(tid==="pearl") return "rgba(255,255,255,0.82)";
  if(tid==="sand")  return "rgba(255,255,255,0.85)";
  if(tid==="mist")  return "rgba(255,255,255,0.78)";
  if(C.isLight)     return "rgba(255,255,255,0.80)";
  // Oscuros
  if(tid==="noir")  return "rgba(255,255,255,0.05)";
  return "rgba(255,255,255,0.04)"; // navy, black
}

// Retorna el border de una card según el tema activo
function cardBorderVal(accentColor, raised=false){
  const acc = accentColor || C.indigo;
  const tid = C._tid || "navy";
  if(C.isLight)    return raised ? "1px solid rgba(255,255,255,0.92)" : "1px solid rgba(255,255,255,0.75)";
  if(tid==="noir") return raised ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.09)";
  if(tid==="black") return raised ? `1px solid ${acc}30` : "1px solid rgba(255,255,255,0.08)";
  return raised ? `1px solid ${acc}28` : "1px solid rgba(255,255,255,0.09)";
}

// Retorna la sombra de una card según el tema activo
function cardShadowVal(accentColor, raised=false){
  const acc = accentColor || C.indigo;
  const tid = C._tid || "navy";
  // Claros
  if(C.isLight) return raised
    ? `0 12px 40px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.9)`
    : `0 4px 20px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.7)`;
  // Noir — profundidad 3D sin color
  if(tid==="noir") return raised
    ? `0 20px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.3)`
    : `0 6px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`;
  // Midnight — dramático con glow
  if(tid==="black") return raised
    ? `0 28px 70px rgba(0,0,0,0.75), 0 6px 20px ${acc}35, inset 0 1px 0 rgba(255,255,255,0.08)`
    : `0 8px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`;
  // Navy default
  return raised
    ? `0 20px 60px rgba(0,0,0,0.5), 0 4px 16px ${acc}28, inset 0 1px 0 rgba(255,255,255,0.07)`
    : `0 6px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`;
}

// Blur por tema
function cardBlur(){
  const tid = C._tid || "navy";
  if(tid==="black") return "blur(40px)";
  if(tid==="noir")  return "blur(16px)";
  if(C.isLight)     return "blur(32px)";
  return "blur(28px)"; // navy
}

// Compatibilidad con código existente que usa cardSurface/cardShadow/cardBorder
function cardSurface(accentColor){
  return {
    background: cardBg(accentColor),
    backdropFilter: cardBlur(),
    WebkitBackdropFilter: cardBlur(),
  };
}
function cardShadow(accentColor){ return cardShadowVal(accentColor, false); }
function cardBorder(accentColor){ return cardBorderVal(accentColor, false); }

// Hero card — estilo según HS.style (gradient | glass | matte)
function heroCard(accentColor){
  const acc = accentColor || C.indigo;
  const tid = C._tid || "navy";
  const hs = HS.style || "gradient";

  if(hs === "glass") {
    return {
      background: cardBg(acc),
      backdropFilter: cardBlur(),
      WebkitBackdropFilter: cardBlur(),
      border: cardBorderVal(acc, true),
      boxShadow: cardShadowVal(acc, true),
    };
  }

  if(hs === "matte") {
    // Sólido premium — sin transparencias, con depth via sombras
    const matBg = C.isLight ? C.card : (tid==="black" ? "#0f0f0f" : tid==="noir" ? "#1c1c1c" : "#0d1117");
    return {
      background: matBg,
      border: `1px solid ${C.isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)"}`,
      boxShadow: C.isLight
        ? `0 8px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.8)`
        : `0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)`,
    };
  }

  // gradient — el original con orbs (default y el que mejor se ve)
  const gradBg = C.isLight
    ? `linear-gradient(145deg, ${acc}18 0%, ${C.card} 55%)`
    : `linear-gradient(135deg, ${acc}28 0%, ${acc}10 50%, ${C.bg} 100%)`;
  return {
    background: gradBg,
    border: `1px solid ${acc}40`,
    boxShadow: C.isLight
      ? `0 12px 40px ${acc}18, 0 2px 8px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)`
      : `0 24px 60px rgba(0,0,0,0.5), 0 4px 16px ${acc}30, inset 0 1px 0 rgba(255,255,255,0.07)`,
  };
}

function GradientOrbs({color}){
  // Solo mostrar orbs en modo gradient — glass y matte no los necesitan
  if(HS.style !== "gradient") return null;
  const tid = C._tid || "navy";
  const acc = color || C.indigo;

  // Claros — orbs suaves (Perla con efecto 3D clásico)
  if(C.isLight) return <>
    <div style={{position:"absolute",top:-50,right:-30,width:180,height:180,borderRadius:"50%",
      background:`radial-gradient(circle,${acc}14 0%,transparent 65%)`,
      pointerEvents:"none",filter:"blur(24px)"}}/>
    <div style={{position:"absolute",bottom:-30,left:-20,width:120,height:120,borderRadius:"50%",
      background:`radial-gradient(circle,${acc}10 0%,transparent 70%)`,
      pointerEvents:"none",filter:"blur(16px)"}}/>
  </>;

  // Noir — orbs neutros para profundidad 3D
  if(tid==="noir") return <>
    <div style={{position:"absolute",top:-50,right:-30,width:180,height:180,borderRadius:"50%",
      background:"radial-gradient(circle,rgba(255,255,255,0.06) 0%,transparent 65%)",
      pointerEvents:"none",filter:"blur(20px)"}}/>
    <div style={{position:"absolute",bottom:-30,left:-20,width:120,height:120,borderRadius:"50%",
      background:"radial-gradient(circle,rgba(255,255,255,0.03) 0%,transparent 70%)",
      pointerEvents:"none",filter:"blur(14px)"}}/>
  </>;

  // Oscuros — orbs de color (Navy, Midnight)
  return <>
    <div style={{position:"absolute",top:-60,right:-40,width:220,height:220,borderRadius:"50%",
      background:`radial-gradient(circle,${acc}30 0%,${acc}12 40%,transparent 70%)`,
      pointerEvents:"none",filter:"blur(24px)"}}/>
    <div style={{position:"absolute",bottom:-50,left:-30,width:160,height:160,borderRadius:"50%",
      background:`radial-gradient(circle,${C.violet}20 0%,transparent 65%)`,
      pointerEvents:"none",filter:"blur(18px)"}}/>
  </>;
}

const MAIN_CATS = [
  { id:"comida",     label:"Comida",    labelFull:"Comida",                  icon:"🍽️", color:"#facc15",
    subs:[{id:"desayuno",label:"Desayuno",icon:"🍳"},{id:"almuerzo",label:"Restaurantes",icon:"🍽️"},{id:"comidas_rapidas",label:"Comida rápida",icon:"🍔"},{id:"domicilios",label:"Domicilios",icon:"🛵"},{id:"mercado",label:"Mercado",icon:"🛒"},{id:"snacks",label:"Snacks",icon:"🧃"}]},
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
    subs:[{id:"ropa",label:"Ropa",icon:"👔"},{id:"calzado",label:"Calzado",icon:"👟"},{id:"accesorios",label:"Accesorios",icon:"⌚"},{id:"peluqueria",label:"Belleza",icon:"💅"},{id:"cuidado",label:"Cuidado",icon:"🧴"}]},
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
    comidas_rapidas:{label:"Comida rápida",icon:"🍔",color:"#facc15"},
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
  const bg = cardBg();
  const blur = cardBlur();
  const shadow = glow
    ? `0 0 0 1px ${glow}40, ${cardShadowVal(glow,false)}`
    : cardShadowVal(null,false);
  return <div style={{
    background: bg,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    borderRadius:18,
    padding:16,
    border: cardBorderVal(null,false),
    boxShadow: shadow,
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
    <div style={{display:"grid",gridTemplateColumns:SC.isSmall?"1fr":"1fr 1fr",gap:SC.isSmall?8:12,marginBottom:24}}>
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
// Hook para detectar pantalla pequeña y escalar UI
function useScreenSize(){
  const [w,setW]=useState(()=>window.innerWidth);
  useEffect(()=>{
    const h=()=>setW(window.innerWidth);
    window.addEventListener('resize',h);
    return()=>window.removeEventListener('resize',h);
  },[]);
  return{
    isSmall:w<=320,      // 320px — Huawei viejos, iPhone SE 1era gen
    isTiny:w<=280,       // 280px — extremo
    w,
    // Escala fuentes y padding proporcionalmente
    fs:(base)=>w<=320?Math.round(base*0.88):base,
    pad:(base)=>w<=320?Math.round(base*0.8):base,
  };
}

function useSheetDismiss(onClose){
  const cardRef=useRef(null);
  const overlayRef=useRef(null);
  const startY=useRef(null);
  const startT=useRef(null);
  const curY=useRef(0);
  const isDragging=useRef(false);
  const fromHandle=useRef(false);

  function setTransform(y){
    const el=cardRef.current;
    if(!el) return;
    el.style.animationName="none";
    el.style.transition="none";
    el.style.transform=`translateY(${Math.max(0,y)}px)`;
  }

  function snapBack(){
    const el=cardRef.current;
    if(!el) return;
    el.style.animationName="none";
    el.style.transition="transform 0.3s cubic-bezier(0.32,0.72,0,1)";
    el.style.transform="translateY(0)";
  }

  function closeWithAnimation(){
    const el=cardRef.current;
    const ov=overlayRef.current;
    if(el){
      // Continuar desde posición actual hacia abajo — sin resetear transform
      const currentY=curY.current||0;
      const target=window.innerHeight;
      const remaining=target-currentY;
      const duration=Math.max(180,Math.min(remaining*0.4,300));
      el.style.animationName="none";
      el.style.transition=`transform ${duration}ms cubic-bezier(0.4,0,1,1)`;
      el.style.transform=`translateY(${target}px)`;
    }
    if(ov){
      ov.style.transition="opacity 0.22s ease";
      ov.style.opacity="0";
    }
    setTimeout(onClose,300);
  }

  function onStart(clientY,isHandle=false){
    startY.current=clientY;
    startT.current=Date.now();
    curY.current=0;
    isDragging.current=true;
    fromHandle.current=isHandle;
  }

  function onMove(clientY){
    if(!isDragging.current||startY.current===null) return;
    const d=clientY-startY.current;
    if(d>0){ curY.current=d; setTransform(d); }
  }

  function onEnd(){
    if(!isDragging.current) return;
    isDragging.current=false;
    const dist=curY.current;
    const elapsed=Math.max(Date.now()-startT.current,1);
    const velocity=dist/elapsed*1000;
    const distThreshold=fromHandle.current?120:200;
    const velThreshold=fromHandle.current?400:600;
    if(dist>distThreshold||velocity>velThreshold){
      closeWithAnimation();
    } else {
      snapBack();
    }
    startY.current=null;
    fromHandle.current=false;
    isDragging.current=false;
  }

  const handleProps={
    style:{cursor:"grab",touchAction:"none",userSelect:"none"},
    onTouchStart:e=>{e.stopPropagation();onStart(e.touches[0].clientY,true);},
    onTouchMove:e=>{e.stopPropagation();onMove(e.touches[0].clientY);},
    onTouchEnd:e=>{e.stopPropagation();onEnd();},
  };

  const dragProps={
    onTouchStart:e=>{
      if(e.currentTarget.scrollTop===0) onStart(e.touches[0].clientY,false);
    },
    onTouchMove:e=>{
      if(startY.current===null) return;
      const d=e.touches[0].clientY-startY.current;
      const elapsed=Math.max(Date.now()-startT.current,1);
      const speed=d/elapsed*1000;
      if(d>12&&speed>350) onMove(e.touches[0].clientY);
      else if(d<-5){startY.current=null; snapBack();}
    },
    onTouchEnd:onEnd,
  };

  const overlayProps={
    ref:overlayRef,
    style:{animation:"overlayIn 0.22s ease forwards"},
  };
  const cardStyle={
    animation:"sheetSpringIn 0.36s cubic-bezier(0.34,1.56,0.64,1)",
    animationFillMode:"none",
  };
  return {handleProps,dragProps,cardStyle,cardRef,overlayRef,overlayProps,closeWithAnimation,dragY:0};
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
    ref={sheet.overlayRef} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:500,...sheet.overlayProps.style}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"85vh",overflowY:"auto",overscrollBehavior:"contain",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
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
    ref={sheet.overlayRef} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",zIndex:400,...sheet.overlayProps.style}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto",overscrollBehavior:"contain",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
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
  return <div className="tap" onClick={onEdit}
    style={{...cardSurface(),overflow:"hidden",borderRadius:20,border:`1px solid ${C.border}`,boxShadow:elev("card"),marginBottom:14,cursor:"pointer",transition:"transform 0.15s"}}>
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
        background:surface("glass"),borderRadius:12,padding:"12px 14px",marginTop:4,
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
  const [paso,setPaso]=useState(1);
  const [modo,setModo]=useState("mensual");
  const [salary,setSalary]=useState("");
  const [dia1,setDia1]=useState(1);
  const [dia2,setDia2]=useState(15);
  const [error,setError]=useState(false);
  const val=parseFloat(salary.replace(/\./g,"").replace(",","."))||0;

  function hi(e){const r=e.target.value.replace(/\D/g,"");setSalary(r?Number(r).toLocaleString("es-CO"):"");setError(false);}
  function sub(){
    if(!val||val<10000){setError(true);return;}
    onSave(val,modo,modo==="quincenal"?{dia1,dia2}:null);
  }

  // Paso 1 — frecuencia
  if(paso===1) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:52,marginBottom:14}}>👋</div>
        <div style={{fontSize:26,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>Bienvenido, {user.displayName?.split(" ")[0]}!</div>
        <div style={{fontSize:15,color:C.text.b,marginTop:10,lineHeight:1.7}}>Primero cuéntame,<br/><b style={{color:C.text.h}}>¿cada cuánto te pagan?</b></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:24}}>
        {[
          {id:"mensual",  icon:"📅", label:"Una vez al mes",     sub:"Recibes tu pago completo mensualmente"},
          {id:"quincenal",icon:"📆", label:"Dos veces al mes",   sub:"Recibes dos pagos iguales al mes"},
        ].map(o=>(
          <button key={o.id} onClick={()=>setModo(o.id)}
            style={{display:"flex",alignItems:"center",gap:14,padding:"18px 20px",borderRadius:18,
              border:`2px solid ${modo===o.id?C.indigo:C.border}`,
              background:modo===o.id?`${C.indigo}12`:C.card,
              cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
            <span style={{fontSize:28,flexShrink:0}}>{o.icon}</span>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:modo===o.id?C.indigo:C.text.h}}>{o.label}</div>
              <div style={{fontSize:12,color:C.text.s,marginTop:2,lineHeight:1.4}}>{o.sub}</div>
            </div>
            {modo===o.id&&<span style={{marginLeft:"auto",color:C.indigo,fontSize:20}}>✓</span>}
          </button>
        ))}
      </div>
      <button onClick={()=>setPaso(2)}
        style={{width:"100%",padding:17,borderRadius:14,border:"none",cursor:"pointer",
          fontSize:16,fontWeight:800,
          background:`linear-gradient(135deg,${C.indigo},#4338ca)`,color:"#fff"}}>
        Continuar →
      </button>
    </div>
  </div>;

  // Paso 2 — días de quincena (solo si quincenal)
  if(paso===2&&modo==="quincenal") return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <button onClick={()=>setPaso(1)} style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:6}}>← Atrás</button>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:52,marginBottom:14}}>📆</div>
        <div style={{fontSize:24,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>¿Qué días te pagan?</div>
        <div style={{fontSize:13,color:C.text.s,marginTop:8,lineHeight:1.6}}>La app te avisará cuando llegue cada quincena</div>
      </div>
      <div style={{background:C.card,borderRadius:20,padding:24,border:`1px solid ${C.border}`,marginBottom:16}}>
        {[
          {label:"Primera quincena — día",val:dia1,set:setDia1,hint:"Normalmente el 1 o el 15"},
          {label:"Segunda quincena — día",val:dia2,set:setDia2,hint:"Normalmente el 15 o el último día"},
        ].map((q,i)=>(
          <div key={i} style={{marginBottom:i===0?20:0}}>
            <div style={{fontSize:11,color:C.text.s,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>{q.label}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:4}}>
              {[1,5,10,15,20,25,28,30].map(d=>(
                <button key={d} onClick={()=>q.set(d)}
                  style={{width:44,height:40,borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                    background:q.val===d?C.indigo:C.surface,
                    color:q.val===d?"#fff":C.text.b,
                    outline:`2px solid ${q.val===d?C.indigo:"transparent"}`,
                    transition:"all 0.15s"}}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,color:C.text.s,opacity:0.6}}>{q.hint}</div>
          </div>
        ))}
      </div>
      <button onClick={()=>setPaso(3)}
        style={{width:"100%",padding:17,borderRadius:14,border:"none",cursor:"pointer",
          fontSize:16,fontWeight:800,
          background:`linear-gradient(135deg,${C.indigo},#4338ca)`,color:"#fff"}}>
        Continuar →
      </button>
    </div>
  </div>;

  // Paso 2/3 — monto
  const pasoMonto=modo==="quincenal"?3:2;
  const salMensualEst=modo==="quincenal"?val*2:val;

  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <button onClick={()=>setPaso(modo==="quincenal"?2:1)} style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:6}}>← Atrás</button>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:52,marginBottom:14}}>{modo==="quincenal"?"📆":"📅"}</div>
        <div style={{fontSize:24,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>
          {modo==="quincenal"?"¿Cuánto recibes cada vez?":"¿Cuánto recibes al mes?"}
        </div>
        <div style={{fontSize:13,color:C.text.s,marginTop:8,lineHeight:1.6}}>
          {modo==="quincenal"
            ?`El monto que te llega el día ${dia1} y el día ${dia2}`
            :"Tu salario o ingreso mensual total"}
        </div>
      </div>
      <div style={{background:C.card,borderRadius:20,padding:24,border:`1px solid ${C.border}`}}>
        <Lbl>{modo==="quincenal"?"Monto por quincena (COP)":"Sueldo o ingreso mensual (COP)"}</Lbl>
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${error?C.red:val>0?C.indigo:C.border}`,transition:"border-color 0.2s",marginBottom:12}}>
          <span style={{padding:"0 16px",color:C.text.b,fontSize:22,lineHeight:"62px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={salary} onChange={hi} autoFocus
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:30,fontWeight:800,color:C.text.h,padding:"0 8px",height:62,letterSpacing:-0.5}}/>
        </div>
        {error&&<div style={{fontSize:13,color:C.red,marginBottom:10}}>Ingresa un monto válido (mínimo $10.000)</div>}
        {val>0&&<div style={{background:C.surface,borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:C.text.b,lineHeight:2}}>
          {modo==="quincenal"&&<div style={{fontSize:12,color:C.indigo,marginBottom:6,fontWeight:700}}>
            📆 {COP(val)} × 2 = <b>{COP(salMensualEst)}/mes</b>
          </div>}
          Sugerido con <b style={{color:C.text.h}}>{COP(salMensualEst)}/mes</b>:<br/>
          <span style={{color:C.sky}}>🛡️ {COP(Math.round(salMensualEst*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:C.indigo}}>⭐ {COP(Math.round(salMensualEst*0.10))} Metas (10%)</span><br/>
          <span style={{color:C.text.b}}>🛒 {COP(Math.round(salMensualEst*0.85))} Gastos libres</span>
        </div>}
        <button onClick={sub} style={{width:"100%",padding:17,borderRadius:14,border:"none",cursor:val>0?"pointer":"not-allowed",fontSize:16,fontWeight:800,background:val>0?`linear-gradient(135deg,${C.indigo},#4338ca)`:C.surface,color:val>0?"#fff":C.text.s,transition:"all 0.2s"}}>
          {val>0?"Empezar →":"Ingresa tu monto"}
        </button>
      </div>
    </div>
  </div>;
}


// ─── BANNER QUINCENA ──────────────────────────────────────────────────────────
// Aparece en home cuando es el día de cobro de una quincena
// y el usuario aún no la ha registrado ni dismissado
function BannerQuincena({modoSalario,quincenas,salario,tx,month,now,onConfirmar,onPosponer,onNoRecordar,C,COP}){
  if(modoSalario!=="quincenal"||!salario) return null;
  const today=now.getDate();
  const currentM=now.getMonth(), currentY=now.getFullYear();
  const {dia1=1,dia2=15,dismissed={},creadoEn=null}=quincenas;

  // No mostrar si el usuario se registró hace menos de 1 día
  // (creadoEn se guarda en quincenas al hacer onboarding)
  if(creadoEn){
    const msDesdeCreacion=Date.now()-creadoEn;
    if(msDesdeCreacion<86400000) return null; // menos de 24h
  }

  // Solo mostrar el día EXACTO de pago (o días siguientes si fue pospuesta)
  // dia1: mostrar en día dia1 y hasta 2 días después si fue pospuesto
  // dia2: mostrar en día dia2 y hasta 2 días después si fue pospuesto
  let quincenaActiva=null;
  if(today>=dia1&&today<=dia1+2&&today<dia2){
    quincenaActiva={num:1,dia:dia1,key:`${currentY}-${currentM}-Q1`};
  } else if(today>=dia2&&today<=dia2+2){
    quincenaActiva={num:2,dia:dia2,key:`${currentY}-${currentM}-Q2`};
  }

  if(!quincenaActiva) return null;

  // Ya fue dismissada
  const dis=dismissed[quincenaActiva.key];
  if(dis==="no_recordar") return null;
  // Pospuesta: solo volver a mostrar al día siguiente
  if(typeof dis==="number"&&dis>=today) return null;

  // Ya registró ingreso en el período de esta quincena
  const yaRegistro=tx.some(t=>{
    if(t.cat!=="ingreso") return false;
    const[ty,tm,td]=t.date.split("-").map(Number);
    if(ty!==currentY||(tm-1)!==currentM) return false;
    if(quincenaActiva.num===1) return td>=dia1&&td<dia2;
    return td>=dia2;
  });
  if(yaRegistro) return null;

  return <div style={{
    borderRadius:18,padding:"14px 16px",marginBottom:16,
    background:`linear-gradient(135deg,${C.emerald}15,${C.indigo}10)`,
    border:`1px solid ${C.emerald}35`,
    animation:"fadeIn 0.3s ease",
  }}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <span style={{fontSize:24}}>📆</span>
      <div>
        <div style={{fontSize:14,fontWeight:800,color:C.text.h}}>
          ¿Te llegó tu quincena {quincenaActiva.num===1?"1ª":"2ª"}?
        </div>
        <div style={{fontSize:12,color:C.text.b,marginTop:1}}>
          {COP(salario)} esperados hoy (día {quincenaActiva.dia})
        </div>
      </div>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button onClick={()=>onConfirmar(quincenaActiva)}
        style={{flex:2,padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",
          background:`linear-gradient(135deg,${C.emerald},#059669)`,
          color:"#000",fontSize:13,fontWeight:800}}>
        ✅ Sí, llegó — registrar
      </button>
      <button onClick={()=>onPosponer(quincenaActiva)}
        style={{flex:1,padding:"10px 0",borderRadius:10,border:`1px solid ${C.amber}44`,cursor:"pointer",
          background:`${C.amber}12`,color:C.amber,fontSize:12,fontWeight:700}}>
        ⏰ Mañana
      </button>
      <button onClick={()=>onNoRecordar(quincenaActiva)}
        style={{flex:1,padding:"10px 0",borderRadius:10,border:`1px solid ${C.border}`,cursor:"pointer",
          background:"none",color:C.text.s,fontSize:11,fontWeight:600}}>
        ✕ No recordar
      </button>
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

function TxModal({initial,initialCat,onClose,onSave,onDelete,goals,saldoDisponible,catsCustom={},onEditCustom,onOpenPrestamo,txHistorial=[],deudas=[]}){
  const isEdit=!!initial;
  const [amount,setAmount]=useState(initial?Number(initial.amount).toLocaleString("es-CO"):"");
  const [desc,setDesc]=useState(initial?.desc||"");
  const [cat,setCat]=useState(initial?.cat||(initialCat||"almuerzo"));
  const [date,setDate]=useState(initial?.date||todayStr());
  const [goalId,setGoalId]=useState(initial?.goalId||"");
  const [deudaId,setDeudaId]=useState(initial?.deudaId||"");
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
  const esCuota=cat==="cuotas";
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
  const sinDisponible=!esIngreso&&!esIngresoExtra&&!esEdicion&&!isEdit&&saldoDisponible<raw;
  const sinSaldo=false;

  const subCats = ALL_SUBS.map(s=>s.id);
  const isCustomSub = cat?.startsWith("custom_");
  const catValida = esIngreso || esIngresoExtra || cat==="emergencias" || cat==="meta_aporte" || cat==="prestamo_devuelto" || subCats.includes(cat) || isCustomSub;
  const faltaMonto = !raw;
  const faltaSubcat = !catValida;
  const faltaMeta = isMeta && !goalId && goals.length > 0;
  const sinMetas = isMeta && goals.length === 0;
  const deudasActivas = (deudas||[]).filter(d=>!d.liquidada);
  const hayError = faltaMonto || faltaSubcat || faltaMeta;

  function getMensajeError() {
    if (faltaMonto) return "Ingresa el monto primero";
    if (faltaSubcat) return "Elige una subcategoría de la categoría";
    if (faltaMeta) return "Selecciona a qué meta va este aporte";
    if (sinMetas) return "Crea una meta primero en la pestaña ⭐ Metas";
    return null;
  }

  function save(){
    if(hayError || sinMetas) return;
    const catLabel=(()=>{
      if(cat?.startsWith("custom_")){
        for(const[,subs] of Object.entries(catsCustom||{})){
          const found=subs?.find(s=>s.id===cat);
          if(found) return found.label;
        }
      }
      return ci.label;
    })();
    const deudaObj=esCuota&&deudaId?{deudaId}:{};
    onSave({
      id:initial?.id||null,
      desc:desc.trim()||(isMeta&&goalId?goals.find(g=>g.id===goalId)?.name||"Aporte meta":esCuota&&deudaId?deudasActivas.find(d=>d.id===deudaId)?.nombre||"Cuota":esIngreso?(modoSalario==="quincenal"?"Quincena":"Ingreso del mes"):esIngresoExtra?"Ingreso extra":catLabel),
      amount:raw,cat,date,...(isMeta&&goalId?{goalId}:{}), ...deudaObj
    });
    onClose();
  }
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    ref={sheet.overlayRef} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:300,...sheet.overlayProps.style}}>
    <div ref={sheet.cardRef} style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",display:"flex",flexDirection:"column",position:"relative",...sheet.cardStyle}}>
      <SheetCloseBtn onClose={onClose}/>
      <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px",flexShrink:0}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div ref={scrollRef} style={{overflowY:"auto",touchAction:"pan-y",overscrollBehavior:"contain",flex:1,padding:"0 20px"}} {...sheet.dragProps}>
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
        {/* ── Selector de deuda (solo cuando cat=cuotas) ── */}
        {esCuota&&deudasActivas.length>0&&<div style={{marginBottom:14,animation:"fadeIn 0.18s ease"}}>
          <Lbl>¿A qué deuda corresponde? <span style={{color:C.text.s,fontWeight:500}}>(opcional)</span></Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {deudasActivas.map(d=>{
              const pct=d.montoTotal>0?Math.min(1-d.saldoRestante/d.montoTotal,1):0;
              const cuotasR=d.cuotaMensual>0?Math.ceil(d.saldoRestante/d.cuotaMensual):"?";
              const sel=deudaId===d.id;
              return <button key={d.id} onMouseDown={e=>e.preventDefault()}
                onClick={()=>setDeudaId(sel?"":d.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:12,
                  border:"none",cursor:"pointer",textAlign:"left",
                  background:sel?"rgba(244,63,94,0.12)":C.surface,
                  outline:sel?"2px solid #f43f5e":"2px solid transparent",
                  transition:"all 0.12s"}}>
                <span style={{fontSize:22,flexShrink:0}}>{d.emoji||"💳"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:sel?"#f43f5e":C.text.h,marginBottom:3}}>{d.nombre}</div>
                  {/* Barra de progreso */}
                  <div style={{height:4,borderRadius:99,background:"rgba(244,63,94,0.15)",overflow:"hidden",marginBottom:3}}>
                    <div style={{height:4,borderRadius:99,background:"#f43f5e",width:`${pct*100}%`,transition:"width 0.3s"}}/>
                  </div>
                  <div style={{fontSize:10,color:C.text.s}}>
                    Resta <b style={{color:"#f43f5e"}}>{COP(d.saldoRestante)}</b> · ~{cuotasR} {cuotasR===1?"mes":"meses"}
                  </div>
                </div>
                {sel&&<span style={{color:"#f43f5e",fontSize:18,flexShrink:0}}>✓</span>}
              </button>;
            })}
          </div>
          {deudaId&&raw>0&&(()=>{
            const d=deudasActivas.find(x=>x.id===deudaId);
            if(!d)return null;
            const nuevo=Math.max(d.saldoRestante-raw,0);
            const cuotasR=d.cuotaMensual>0?Math.ceil(nuevo/d.cuotaMensual):"?";
            const adelanto=raw>d.cuotaMensual?Math.floor((raw-d.cuotaMensual)/d.cuotaMensual):0;
            return <div style={{marginTop:8,padding:"10px 14px",borderRadius:12,
              background:"rgba(244,63,94,0.07)",border:"1px solid rgba(244,63,94,0.2)",
              fontSize:12,color:C.text.b,lineHeight:1.6}}>
              Saldo después: <b style={{color:nuevo===0?"#10b981":"#f43f5e"}}>{nuevo===0?"¡LIQUIDADA! 🎉":COP(nuevo)}</b>
              {adelanto>0&&<span style={{color:"#10b981",fontWeight:700}}> · 🚀 +{adelanto} {adelanto===1?"cuota":"cuotas"} adelantadas</span>}
              {nuevo>0&&<span style={{color:C.text.s}}> · ~{cuotasR} meses restantes</span>}
            </div>;
          })()}
        </div>}
        {esCuota&&deudasActivas.length===0&&<div style={{marginBottom:14,padding:"12px 16px",
          background:"rgba(244,63,94,0.08)",border:"1px solid rgba(244,63,94,0.2)",borderRadius:12,animation:"fadeIn 0.18s ease"}}>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>
            💡 Puedes registrar esta cuota como gasto normal, o <b style={{color:"#f43f5e"}}>crear una deuda</b> en el menú 💳 para rastrear el progreso.
          </div>
        </div>}
        <div style={{marginBottom:16}}>
          <Lbl>Fecha</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Bloqueo: no alcanza el disponible para este gasto */}
        {sinDisponible&&raw>0&&!esIngreso&&!esIngresoExtra&&(
          <div style={{marginBottom:12,padding:"12px 14px",
            background:saldoDisponible<=0?`${C.red}15`:`${C.amber}15`,
            border:`1px solid ${saldoDisponible<=0?C.red:C.amber}40`,
            borderRadius:12,display:"flex",gap:10,alignItems:"flex-start",animation:"fadeIn 0.18s ease"}}>
            <span style={{fontSize:20,flexShrink:0}}>{saldoDisponible<=0?"🚫":"⚠️"}</span>
            <div>
              <div style={{fontSize:13,fontWeight:800,
                color:saldoDisponible<=0?C.red:C.amber,marginBottom:3}}>
                {saldoDisponible<=0?"Sin disponible":"No alcanza para este gasto"}
              </div>
              <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>
                {saldoDisponible<=0
                  ?"Registra un ingreso o baja el monto de una meta."
                  :`Tienes ${COP(saldoDisponible)} disponibles y este gasto es ${COP(raw)}.`}
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:8,marginBottom:28}}>
          {isEdit&&!conf&&<button onClick={()=>setConf(true)} style={{padding:"16px 18px",borderRadius:14,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontSize:22,flexShrink:0}}>🗑</button>}
          {isEdit&&conf&&<button onClick={()=>{onDelete(initial.id);onClose();}} style={{padding:"16px 18px",borderRadius:14,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800,flexShrink:0,animation:"shake 0.3s ease"}}>¿Borrar?</button>}
          <button onClick={(hayError||sinSaldo||sinDisponible||sinMetas)?undefined:save}
            style={{flex:1,padding:16,borderRadius:14,border:"none",
              cursor:(hayError||sinSaldo||sinDisponible||sinMetas)?"not-allowed":"pointer",
              fontSize:raw>=1000000?13:raw>=100000?14:16,fontWeight:800,transition:"all 0.2s",
              background:(hayError||sinMetas)?C.surface:sinDisponible?(saldoDisponible<=0?`${C.red}20`:`${C.amber}20`):isEdit&&!changed?`${C.sky}18`:`linear-gradient(135deg,${acc},${acc}cc)`,
              color:(hayError||sinMetas)?C.text.s:sinDisponible?(saldoDisponible<=0?C.red:C.amber):isEdit&&!changed?C.sky:"#fff",
              opacity:(hayError||sinSaldo||sinDisponible||sinMetas)?0.65:1}}>
            {getMensajeError() ?? (sinDisponible?(saldoDisponible<=0?"Sin disponible":"No alcanza — tienes "+COP(saldoDisponible)):isEdit&&!changed?"Sin cambios":isEdit?"✓ Guardar":esIngreso?`Registrar salario ${COP(raw)} →`:esIngresoExtra?`Registrar extra ${COP(raw)} →`:`Registrar ${COP(raw)} →`)}
          </button>
        </div>
      </div>{/* cierre scrollRef */}
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
          // Buscar categoría principal — subs normales + custom
          const main=MAIN_CATS.find(m=>
            m.subs?.some(s=>s.id===t.cat) ||
            (catsCustom[m.id]||[]).some(s=>s.id===t.cat) ||
            (_customSubsLookup[m.id]||[]).some(s=>s.id===t.cat)
          );
          if(!main && t.cat?.startsWith("custom_")){
            for(const[mainId,subs] of Object.entries(_customSubsLookup)){
              if(subs?.some(s=>s.id===t.cat)){
                const m2=MAIN_CATS.find(m=>m.id===mainId);
                return m2?`${m2.label} · ${cat.label}`:cat.label;
              }
            }
          }
          return main?`${main.label} · ${cat.label}`:cat.label;
        })()}
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:15,fontWeight:600,color:esPos?(C.isLight?C.emerald:C.emeraldLight):C.text.h,letterSpacing:-0.3}}>
        {esPos?"+":"-"}{COP(t.amount)}
      </div>
      {!bloqueado&&<div style={{fontSize:10,color:C.text.s,marginTop:2,opacity:0.6}}>editar</div>}
    </div>
  </div>;
}

// ─── MODAL PRÉSTAMOS A TERCEROS ───────────────────────────────────────────────
function ExportModalSheet({onClose,exportarCSV,exportarPDF,tx,now,isMonth,MONTHS}){
  const sheet=useSheetDismiss(onClose);
  return <div ref={sheet.overlayRef} onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:400,...sheet.overlayProps.style}}>
    <div ref={sheet.cardRef} onClick={e=>e.stopPropagation()} {...sheet.dragProps}
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
          <div><div style={{color:C.isLight?C.emerald:C.emeraldLight}}>Solo {MONTHS[now.getMonth()]} {now.getFullYear()}</div>
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

function PrestamosModal({prestamos,onClose,onSave,onDelete,onToggle,prestamoForm,setPrestamoForm,isPro,setProGate}){
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
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:600,animation:"overlayIn 0.22s ease forwards"}}>
      <div onClick={e=>e.stopPropagation()} ref={sheet2.cardRef}
        style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
          border:`1px solid rgba(244,63,94,0.3)`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"90vh",overflowY:"auto",overscrollBehavior:"contain",position:"relative",...sheet2.cardStyle}}>
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
              ?"Editar no cambia el historial. Si el monto cambió, elimina y crea uno nuevo."
              :"Se registra como gasto en Deudas. Cuando te paguen, anota el ingreso."}
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
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:500,animation:"overlayIn 0.22s ease forwards"}}>
    <div onClick={e=>e.stopPropagation()}
      style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        maxHeight:"90vh",overflowY:"auto",overscrollBehavior:"contain",position:"relative",...sheet.cardStyle}} ref={sheet.cardRef} {...sheet.dragProps}>
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
        <button onClick={()=>{
            if(!isPro&&prestamos.filter(p=>!p.devuelto).length>=1){
              setProGate&&setProGate({titulo:"Préstamos ilimitados",descripcion:"Plan Free: 1 préstamo activo. Pro: ilimitados.",features:[{icon:"🤝",label:"Préstamos ilimitados"},{icon:"💰",label:"Control de cobros"},{icon:"📈",label:"Intereses automáticos"}]});
              return;
            }
            setPrestamoForm("new");
          }}
          style={{width:"100%",padding:14,borderRadius:14,border:"1px dashed rgba(244,63,94,0.4)",background:"transparent",
            color:RED,cursor:"pointer",fontSize:14,fontWeight:700,marginTop:8,marginBottom:16}}>
          + Nuevo préstamo{!isPro&&prestamos.filter(p=>!p.devuelto).length>=1?" ⚡":""}
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
function MenuSheet({onClose,user,disponibleGastar,totalGasto,tema,TEMAS,changeTab,setMenuOpen,setExportModal,handleLogout,C,COP,isPro,setProGate}){
  return <>
    {/* Backdrop invisible — cierra al tocar fuera */}
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:149}}/>
    {/* Dropdown anclado al header — top derecha */}
    <div style={{
      position:"fixed",top:64,right:16,zIndex:150,
      width:260,
      background:C.card,borderRadius:18,
      border:`1px solid ${C.border}`,
      boxShadow:`0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)`,
      animation:"fadeIn 0.16s ease",
      overflow:"hidden",
    }}>
      {/* Perfil */}
      <div style={{padding:"16px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <img src={user.photoURL} alt="" style={{width:38,height:38,borderRadius:"50%",border:`2px solid ${C.indigo}44`,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.displayName?.split(" ")[0]}</div>
            <div style={{fontSize:10,color:C.text.s,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
          </div>
        </div>
        {/* Resumen financiero compacto */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div style={{background:`${C.emerald}12`,border:`1px solid ${C.emerald}25`,borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:8,color:C.emerald,fontWeight:700,letterSpacing:0.8,marginBottom:2}}>DISPONIBLE</div>
            <div style={{fontSize:13,fontWeight:800,color:C.emerald}}>{COP(disponibleGastar)}</div>
          </div>
          <div style={{background:`${C.red}10`,border:`1px solid ${C.red}20`,borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:8,color:C.red,fontWeight:700,letterSpacing:0.8,marginBottom:2}}>GASTOS</div>
            <div style={{fontSize:13,fontWeight:800,color:C.red}}>{COP(totalGasto)}</div>
          </div>
        </div>
      </div>
      {/* Acciones */}
      <div style={{padding:"4px 0 4px"}}>
        {[
          {icon:"🎨",label:`Tema: ${TEMAS[tema]?.label||"Navy"}`,onClick:()=>{changeTab("cfg");setMenuOpen(false);}},
          {icon:"⚙️",label:"Configuración",onClick:()=>{changeTab("cfg");setMenuOpen(false);}},
          {icon:"📤",label:`Exportar movimientos${isPro?"":" ⚡"}`,onClick:()=>{setMenuOpen(false);isPro?setExportModal(true):setProGate({titulo:"Exportar PDF",descripcion:"Reporte completo de tus finanzas en PDF.",features:[{icon:"📄",label:"Reporte mensual completo"},{icon:"📊",label:"Gráficas y análisis"},{icon:"📋",label:"Tabla de movimientos"}]});}},
        ].map(o=>(
          <button key={o.label} onClick={o.onClick}
            style={{width:"100%",padding:"11px 16px",background:"none",border:"none",cursor:"pointer",
              display:"flex",alignItems:"center",gap:12,fontSize:13,fontWeight:600,color:C.text.h,textAlign:"left"}}>
            <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>{o.icon}</span>
            <span>{o.label}</span>
          </button>
        ))}
        <div style={{height:1,background:C.border,margin:"4px 16px"}}/>
        <button onClick={()=>{handleLogout();setMenuOpen(false);}}
          style={{width:"100%",padding:"11px 16px",background:"none",border:"none",cursor:"pointer",
            display:"flex",alignItems:"center",gap:12,fontSize:13,fontWeight:600,color:C.red,textAlign:"left"}}>
          <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>🚪</span>Cerrar sesión
        </button>
      </div>
    </div>
  </>;
}


// ─── PRO GATE — pantalla de upgrade reutilizable ─────────────────────────────
function ProGate({titulo, descripcion, features, onClose, C}){
  const startY=useRef(null);
  const sheetRef=useRef(null);
  function swipeStart(y){startY.current=y;}
  function swipeMove(y){if(startY.current===null)return;const dy=y-startY.current;if(dy>0&&sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`;}
  function swipeEnd(y){if(startY.current===null)return;const dy=y-startY.current;if(sheetRef.current)sheetRef.current.style.transform="";if(dy>60)onClose();startY.current=null;}
  return(
    <div style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",
    }} onClick={onClose}>
      <div ref={sheetRef} onClick={e=>e.stopPropagation()}
        onTouchStart={e=>swipeStart(e.touches[0].clientY)}
        onTouchMove={e=>swipeMove(e.touches[0].clientY)}
        onTouchEnd={e=>swipeEnd(e.changedTouches[0].clientY)}
        style={{
          transition:"transform 0.1s",
          width:"100%",maxWidth:430,
          background:C.card,borderRadius:"24px 24px 0 0",
          padding:"28px 24px 40px",
          border:`1px solid ${C.border}`,
        }}>
        {/* Handle */}
        <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 20px"}}/>
        {/* Icono y título */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{
            fontSize:44,marginBottom:12,
            filter:"drop-shadow(0 4px 12px rgba(99,102,241,0.4))"
          }}>⚡</div>
          <div style={{fontSize:20,fontWeight:900,color:C.text.h,marginBottom:6}}>
            {titulo||"Función Pro"}
          </div>
          <div style={{fontSize:14,color:C.text.b,lineHeight:1.5}}>
            {descripcion||"Disponible en el plan Pro."}
          </div>
        </div>
        {/* Features */}
        {features&&features.length>0&&(
          <div style={{
            background:C.surface,borderRadius:16,padding:"14px 16px",
            marginBottom:20,display:"flex",flexDirection:"column",gap:10,
          }}>
            {features.map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>{f.icon}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>{f.label}</div>
                  {f.desc&&<div style={{fontSize:11,color:C.text.b}}>{f.desc}</div>}
                </div>
                <span style={{marginLeft:"auto",color:"#10b981",fontSize:18}}>✓</span>
              </div>
            ))}
          </div>
        )}
        {/* Precio */}
        <div style={{
          background:`linear-gradient(135deg,${C.indigo},${C.violet})`,
          borderRadius:16,padding:"16px 20px",marginBottom:16,
          display:"flex",alignItems:"center",justifyContent:"space-between",
        }}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:700,letterSpacing:1}}>PLAN PRO</div>
            <div style={{fontSize:24,fontWeight:900,color:"#fff"}}>$9.900 <span style={{fontSize:13,fontWeight:500}}>COP/mes</span></div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Menos de un tinto al día ☕</div>
          </div>
          <div style={{fontSize:36}}>🚀</div>
        </div>
        {/* Botón pago Wompi */}
        <button
          onClick={()=>{
            // Checkout Wompi — reemplaza PUBLIC_KEY con tu llave pública cuando llegue
            const WOMPI_PUBLIC_KEY = "pub_test_PENDIENTE"; // ← aquí va tu llave pública de Wompi
            const redirectUrl = encodeURIComponent(window.location.origin + "?pago=exitoso");
            const url = `https://checkout.wompi.co/p/?public-key=${WOMPI_PUBLIC_KEY}&currency=COP&amount-in-cents=990000&reference=pro_${Date.now()}&redirect-url=${redirectUrl}`;
            window.open(url, "_blank");
          }}
          style={{
            width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.indigo},${C.violet})`,
            color:"#fff",fontSize:15,fontWeight:800,marginBottom:10,
            boxShadow:`0 4px 16px ${C.indigo}40`,
          }}>
          🚀 Activar Plan Pro — $9.900/mes
        </button>
        <button onClick={onClose} style={{
          width:"100%",padding:"13px",borderRadius:14,border:`1px solid ${C.border}`,
          background:"transparent",color:C.text.b,fontSize:14,cursor:"pointer",
        }}>
          Continuar con plan gratis
        </button>
      </div>
    </div>
  );
}

export default function App(){
  const [user,setUser]=useState(null),[authLoading,setAL]=useState(true),[loginLoading,setLL]=useState(false);
  const [salario,setSalario]=useState(null),[showOnb,setShowOnb]=useState(false);
  const [modoSalario,setModoSalario]=useState("mensual");
  const [quincenas,setQuincenas]=useState({dia1:1,dia2:15,dismissed:{}});
  const [salarioHistory,setSalarioHistory]=useState({}); // {"YYYY-M": monto}
  const [tx,setTx]=useState([]),[goals,setGoals]=useState([]);
  const [month,setMonth]=useState(now.getMonth()),[tab,setTab]=useState("home");
  const [monthChanging,setMonthChanging]=useState(false);
  const monthChangeTimer=useRef(null);
  function setMonthSafe(m){
    clearTimeout(monthChangeTimer.current);
    setMonthChanging(true);
    setMonth(m);
    // requestAnimationFrame garantiza que el render con el nuevo mes ya ocurrió
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        monthChangeTimer.current=setTimeout(()=>setMonthChanging(false),80);
      });
    });
  }
  const SC=useScreenSize(); // SC.fs(n) escala fuente, SC.pad(n) escala padding
  const [selectedYear,setSelectedYear]=useState(now.getFullYear());
  const [filtroMainCat,setFiltroMainCat]=useState(null); // id de MAIN_CAT para filtrar en MovTab desde Análisis
  const [filtroMainCatOrigen,setFiltroMainCatOrigen]=useState(null); // de dónde vino: "analisis" | null
  const monthScrollRef=useRef(null);
  const [modal,setModal]=useState(null),[goalModal,setGoalModal]=useState(null);
  const [txLoading,setTxL]=useState(true);
  const [alertaGasto,setAlertaGasto]=useState(null);
  const [pagos,setPagos]=useState([]);
  const [presupuestos,setPresupuestos]=useState({}); // {catId: limite}
  const [menuOpen,setMenuOpen]=useState(false);
  const [pagoModal,setPagoModal]=useState(null); // null | "new" | pago
  const [pagoModalDia,setPagoModalDia]=useState(null); // día preseleccionado
  const [presupuestoModal,setPresupuestoModal]=useState(null); // cat obj
  const [budgetSetupOpen,setBudgetSetupOpen]=useState(false); // modal plan inteligente
  const [simuladorOpen,setSimuladorOpen]=useState(false);
  const [asistenteOpen,setAsistenteOpen]=useState(false);
  const [fabOpen,setFabOpen]=useState(false);
  const [fabVoz,setFabVoz]=useState(false);
  const [fabVozText,setFabVozText]=useState("");
  const fabVozRef=useRef(null);
  const holdTimer=useRef(null);
  const [calMes,setCalMes]=useState(now.getMonth()); // mes visible en el calendario
  const [calAnio,setCalAnio]=useState(now.getFullYear()); // año visible en el calendario
  const [bannerDismissTick,setBannerDismissTick]=useState(0); // re-render al dismiss
  const [exportModal,setExportModal]=useState(false);
  const [catsCustom,setCatsCustom]=useState({}); // {mainId:[{id,label,icon}]}
  const [catPersonalModal,setCatPersonalModal]=useState(null); // main obj | null
  const [prestamos,setPrestamos]=useState([]);
  const [prestamosModal,setPrestamosModal]=useState(false);
  const [deudas,setDeudas]=useState([]);
  const [deudasModal,setDeudasModal]=useState(false);
  const [patrimonio,setPatrimonio]=useState({activos:[],pasivosExternos:[]});
  const [notifSheetOpen,setNotifSheetOpen]=useState(false);
  const [prestamoForm,setPrestamoForm]=useState(null);
  const [badgesGuardados,setBadgesGuardados]=useState({});
  const [badgesNuevos,setBadgesNuevos]=useState([]);
  const [badgesLoaded,setBadgesLoaded]=useState(false); // true cuando Firestore terminó de cargar badges
  const [isPro,setIsPro]=useState(false); // true si usuarios/{uid}.plan === "pro"
  const [proGate,setProGate]=useState(null); // null | {titulo,descripcion,features}
  const badgesResettingRef=useRef(false);
  const [tema,setTema]=useState(()=>{
    const saved=localStorage.getItem("mf_tema");
    return (saved && TEMAS[saved]) ? saved : "navy";
  });
  const [cardStyle,setCardStyle]=useState(()=>localStorage.getItem("mf_card_style")||"solid");
  const [heroStyle,setHeroStyle]=useState(()=>{ const s=localStorage.getItem("heroStyle")||"gradient"; HS.style=s; return s; });
  const [compacto,setCompacto]=useState(()=>localStorage.getItem("mf_compacto")==="1");
  function toggleCompacto(){setCompacto(v=>{const n=!v;localStorage.setItem("mf_compacto",n?"1":"0");return n;});}

  // Mutar C con el tema activo antes de cada render
  const paleta=TEMAS[tema]||TEMAS.navy;
  Object.assign(C,paleta);
  Object.assign(C.text,paleta.text);
  if(!paleta.isLight) C.isLight=false;
  C._tid = paleta._tid || tema;
  // Mutar CS y HS con el estilo activo
  CS.style=cardStyle;
  C._tid = paleta._tid || tema;

  function cambiarTema(nuevoTema){
    setTema(nuevoTema);
    localStorage.setItem("mf_tema",nuevoTema);
  }
  function cambiarCardStyle(s){
    setCardStyle(s);
    localStorage.setItem("mf_card_style",s);
  }
  function cambiarHeroStyle(s){
    setHeroStyle(s);
    HS.style=s;
    localStorage.setItem("heroStyle",s);
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
    history.pushState({mfApp:"top"},"");
    const handler=()=>{
      const s=backRef.current;
      const anyModal=!!(s.modal||s.goalModal||s.pagoModal||s.prestamosModal||
        s.menuOpen||s.exportModal||s.catPersonalModal||s.budgetSetupOpen||s.presupuestoModal||s.filtroMainCat);
      if(anyModal){history.replaceState({mfApp:"top"},"");return;}
      if(s.tab!=="home"){s.setTab("home");history.pushState({mfApp:"top"},"");return;}
      clearTimeout(exitTimer.current);
      s.setExitConfirm(true);
      exitTimer.current=setTimeout(()=>s.setExitConfirm(false),5000);
      history.pushState({mfApp:"top"},"");
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
        setModoSalario(snap.data().modoSalario||"mensual");
        setQuincenas(snap.data().quincenas||{dia1:1,dia2:15,dismissed:{}});
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

  useEffect(()=>{if(!user){setDeudas([]);return;}
    return onSnapshot(query(collection(db,"usuarios",user.uid,"deudas"),orderBy("createdAt","desc")),snap=>{
      setDeudas(snap.docs.map(d=>({id:d.id,...d.data()})));
    });},[user]);

  useEffect(()=>{if(!user){setPatrimonio({activos:[],pasivosExternos:[]});setIsPro(false);return;}
    const unsub=onSnapshot(doc(db,"usuarios",user.uid),snap=>{
      if(snap.exists()){
        const d=snap.data();
        if(d.patrimonio) setPatrimonio(d.patrimonio);
        setIsPro(d.plan==="pro");
      }
    });
    return unsub;},[user]);

  // Micro-animaciones de tap — event listener global (más confiable que CSS :active en iOS)
  useEffect(()=>{
    const TAGS=["BUTTON","A"];
    const TAP_CLASSES=["tap"];
    function isTappable(el){
      if(!el||el===document.body)return false;
      if(TAGS.includes(el.tagName))return true;
      if(TAP_CLASSES.some(c=>el.classList?.contains(c)))return true;
      return false;
    }
    function findTappable(el){
      let cur=el;
      for(let i=0;i<6;i++){
        if(!cur||cur===document.body)return null;
        if(isTappable(cur))return cur;
        cur=cur.parentElement;
      }
      return null;
    }
    let active=null;
    function onStart(e){
      const t=findTappable(e.target);
      if(!t)return;
      active=t;
      t.style.transition="transform 0.1s cubic-bezier(0.34,1.56,0.64,1)";
      t.style.transform=TAGS.includes(t.tagName)?"scale(0.96)":"scale(0.97)";
    }
    function onEnd(){
      if(!active)return;
      active.style.transform="scale(1)";
      active=null;
    }
    document.addEventListener("touchstart",onStart,{passive:true});
    document.addEventListener("touchend",onEnd,{passive:true});
    document.addEventListener("touchcancel",onEnd,{passive:true});
    return()=>{
      document.removeEventListener("touchstart",onStart);
      document.removeEventListener("touchend",onEnd);
      document.removeEventListener("touchcancel",onEnd);
    };
  },[]);

  // Cargar badges guardados desde Firestore
  useEffect(()=>{if(!user){setBadgesGuardados({});setBadgesLoaded(false);return;}
    getDoc(doc(db,"usuarios",user.uid)).then(snap=>{
      if(snap.exists()&&snap.data().badges) setBadgesGuardados(snap.data().badges);
      setBadgesLoaded(true);
    }).catch(()=>setBadgesLoaded(true));},[user]);

  // Listener del dismiss del banner de presupuesto (desde BudgetEngine)
  useEffect(()=>{
    const h=()=>setBannerDismissTick(t=>t+1);
    window.addEventListener('budget-banner-dismissed',h);
    return()=>window.removeEventListener('budget-banner-dismissed',h);
  },[]);

  // Cambiar salario: aplica desde el mes SIGUIENTE, guarda historial por mes
  async function handleSalarioChange(nuevoValor, skipConfirm=false){
    if(!user||!nuevoValor)return;
    if(!skipConfirm){
      const {showAlert}=await import("./GlobalAlert");
      showAlert({
        type:"warning",
        title:"¿Confirmas el cambio?",
        body:`Tu nuevo ingreso será ${COP(nuevoValor)}${modoSalario==="quincenal"?" por quincena ("+COP(nuevoValor*2)+"/mes)":""}.\nAplica desde el próximo mes.`,
        actions:[
          {label:"Cancelar", primary:false, onClick:()=>{}},
          {label:"Confirmar", primary:true, onClick:()=>handleSalarioChange(nuevoValor, true)},
        ]
      });
      return;
    }
    const y=now.getFullYear(), m=now.getMonth();
    const keyProximo=`${y}-${m+1<=11?m+1:0}`;
    const newHistory={...salarioHistory,[keyProximo]:nuevoValor};
    setSalario(nuevoValor);
    setSalarioHistory(newHistory);
    await setDoc(doc(db,"usuarios",user.uid),{salario:nuevoValor,salarioHistory:newHistory},{merge:true});
  }
  // Wrapper local — pasa el estado actual al util puro
  function getSalarioDelMes(y,m){
    return getSalarioDelMesUtil(y,m,{salario,salarioHistory,modoSalario,quincenas});
  }

  async function handleLogin(){setLL(true);try{await signInWithPopup(auth,provider);}catch(e){console.error(e);}setLL(false);}
  async function handleLogout(){await signOut(auth);setTx([]);setGoals([]);setTab("home");setSalario(null);setShowOnb(false);}
  function handleOnbSave(v,modo="mensual",diasQ=null){
    setSalario(v);
    setModoSalario(modo);
    if(diasQ){
      const q={dia1:diasQ.dia1,dia2:diasQ.dia2,dismissed:{},creadoEn:Date.now()};
      setQuincenas(q);
      setDoc(doc(db,"usuarios",user.uid),{salario:v,modoSalario:modo,quincenas:q},{merge:true});
    } else {
      setDoc(doc(db,"usuarios",user.uid),{salario:v,modoSalario:modo},{merge:true});
    }
    setShowOnb(false);
    setTimeout(()=>crearMetaEmergencias(),800);
  }
  const handleSave=useCallback(async t=>{
    if(!user)return;
    const result=await FS.saveTx(user.uid,t);
    if(result.created&&t.deudaId){
      await FS.actualizarDeudaTrasNuevaTx(user.uid,t.deudaId,t.amount,result.id,t.date);
    }
    // Alerta gasto significativo — lógica de UI, se queda aquí
    if(result.created&&isGasto(t.cat)&&!isAporteMeta(t)&&(salario||0)>0){
      const pct=t.amount/(salario||1);
      if(pct>=0.3){
        setAlertaGasto({monto:t.amount,pct,desc:t.desc||"este gasto"});
        setTimeout(()=>setAlertaGasto(null),10000);
      }
    }
  },[user,salario]);
  const handleDelete=useCallback(async id=>{
    if(!user)return;
    // 1. Buscar la tx en el estado local (ya la tenemos — no necesitamos getDoc)
    const txData=tx.find(t=>t.id===id);
    if(!txData)return;

    // 2. OPTIMISTIC UPDATE — actualizar UI inmediatamente
    setTx(prev=>prev.filter(t=>t.id!==id));

    // 3. Si tiene deudaId → actualizar deuda en estado local también
    if(txData.deudaId&&txData.amount){
      const deudasActual=deudas.find(d=>d.id===txData.deudaId);
      if(deudasActual){
        const nuevoSaldo=Math.min((deudasActual.saldoRestante||0)+txData.amount, deudasActual.montoTotal||0);
        const pagosActualizados=(deudasActual.pagos||[]).filter(p=>p.txId!==id);
        setDeudas(prev=>prev.map(d=>d.id===txData.deudaId
          ?{...d,saldoRestante:nuevoSaldo,liquidada:nuevoSaldo<=0,pagos:pagosActualizados}
          :d
        ));
      }
    }

    // 4. Firestore en background — si falla, revertir
    try{
      // Actualizar deuda en Firestore si aplica
      if(txData.deudaId&&txData.amount){
        const dSnap=await getDoc(doc(db,"usuarios",user.uid,"deudas",txData.deudaId));
        if(dSnap.exists()){
          const dData=dSnap.data();
          const nuevoSaldo=Math.min((dData.saldoRestante||0)+txData.amount, dData.montoTotal||0);
          const pagos=(dData.pagos||[]).filter(p=>p.txId!==id);
          await updateDoc(doc(db,"usuarios",user.uid,"deudas",txData.deudaId),{
            saldoRestante:nuevoSaldo, liquidada:nuevoSaldo<=0, pagos,
          });
        }
      }
      await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",id));
    }catch(e){
      // Revertir si falló — el onSnapshot de Firestore restaurará el estado real
      console.error("Error al eliminar tx:",e);
    }
  },[user,tx,deudas]);
  const handleGoalSave=useCallback(async g=>{
    if(!user)return;
    if(!g.id&&!isPro&&goals.length>=3){
      setProGate({titulo:"Metas ilimitadas",descripcion:"Plan Free: hasta 3 metas. Pro: ilimitadas.",features:[{icon:"🎯",label:"Metas ilimitadas",desc:"Crea tantas como quieras"},{icon:"🖼️",label:"Imágenes personalizadas"},{icon:"📊",label:"Proyecciones de logro"}]});
      return;
    }
    await FS.saveMeta(user.uid,g);
  },[user,isPro,goals.length]);

  // Crear meta de Emergencias por defecto al hacer onboarding
  const crearMetaEmergencias=useCallback(async()=>{
    if(!user||goals.some(g=>g.esEmergencias))return;
    await FS.crearMetaEmergencias(user.uid);
  },[user,goals]);
  const handleGoalDelete=useCallback(async id=>{
    if(!user)return;
    const aporteIds=tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===id).map(t=>t.id);
    await FS.deleteMeta(user.uid,id,aporteIds);
  },[user,tx]);

  // ── Exportar movimientos a CSV ───────────────────────────────────────────
  function exportarCSV(soloMesActual=false){
    const txExport=soloMesActual
      ?tx.filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear()))
      :[...tx].sort((a,b)=>a.date.localeCompare(b.date));

    if(txExport.length===0){alertInfo("Sin movimientos","Sin movimientos para exportar.");return;}

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
    if(txExport.length===0){alertInfo("Sin movimientos","No hay movimientos en este período para exportar.");return;}

    const win=window.open("","_blank");
    if(!win){alertWarning("Ventanas bloqueadas","Permite ventanas emergentes en tu navegador.");return;}

    // ── Cálculos financieros ─────────────────────────────────────────────
    // Separar por tipo para poder mostrar breakdown detallado
    const txIngSalario  = txExport.filter(t=>isIngreso(t.cat));       // cat="ingreso" (quincenas registradas)
    const txExtras      = txExport.filter(t=>isIngresoExtra(t.cat));   // cat="ingreso_extra"
    const txDevoluciones= txExport.filter(t=>isDevolucion(t.cat));     // cat="prestamo_devuelto"

    const sumIngSalario  = txIngSalario.reduce((s,t)=>s+t.amount,0);
    const sumExtras      = txExtras.reduce((s,t)=>s+t.amount,0);
    const sumDevoluciones= txDevoluciones.reduce((s,t)=>s+t.amount,0);

    // Salario base del mes desde configuración (igual que usa el home)
    const salBase = soloMesActual ? getSalarioDelMes(now.getFullYear(), now.getMonth()) : 0;

    // Ingreso total:
    // - Reporte mensual: salario configurado + ingreso_extra + prestamo_devuelto (sin doblar con txIngSalario)
    // - Historial completo: sumar transacciones de los tres tipos (sin acceso al historial de salarios mes a mes)
    const totalIng = soloMesActual
      ? salBase + sumExtras + sumDevoluciones
      : sumIngSalario + sumExtras + sumDevoluciones;

    const totalGas=txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
    const totalApo=txExport.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);

    // balance = ingresoTotal - gastoTotal - aporteMetas
    const balance=totalIng-totalGas-totalApo;
    // Tasas calculadas sobre el mismo totalIng
    const tasaAhorro=totalIng>0?Math.min(Math.round((totalApo/totalIng)*100),100):0;
    const tasaGasto =totalIng>0?Math.min(Math.round((totalGas/totalIng)*100),100):0;
    const diasMes=soloMesActual?new Date(now.getFullYear(),now.getMonth()+1,0).getDate():30;
    const gastoDiario=Math.round(totalGas/diasMes);

    // Gastos por categoría principal
    const _gastosCat={};
    txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).forEach(t=>{
      const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
      const key=main?main.id:t.cat;
      const info=getCatInfo(t.cat);
      if(!_gastosCat[key]) _gastosCat[key]={label:main?main.label:info.label,color:main?main.color:info.color,icon:main?main.icon:info.icon,total:0,count:0};
      _gastosCat[key].total+=t.amount;
      _gastosCat[key].count++;
    });
    const catData=Object.values(_gastosCat).sort((a,b)=>b.total-a.total).slice(0,7);
    const maxCat=catData[0]?.total||1;

    // ── SVG Donut Chart ──────────────────────────────────────────────────
    function buildDonut(data,total){
      const cx=80,cy=80,R=65,hole=40;
      if(!data.length||total===0) return `<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="#94a3b8" font-size="11" font-family="system-ui">Sin datos</text>`;
      function pt(angle,r){const rad=(angle-90)*Math.PI/180;return {x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)};}
      let ang=0;
      const segs=data.map(cat=>{
        const span=(cat.total/total)*360;
        const s=ang, e=ang+span-(span<359.9?0.8:0);
        ang+=span;
        const large=span>180?1:0;
        const p1=pt(s,R),p2=pt(e,R),h1=pt(s,hole),h2=pt(e,hole);
        return `<path d="M ${h1.x.toFixed(1)} ${h1.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L ${h2.x.toFixed(1)} ${h2.y.toFixed(1)} A ${hole} ${hole} 0 ${large} 0 ${h1.x.toFixed(1)} ${h1.y.toFixed(1)} Z" fill="${cat.color}"/>`;
      });
      return segs.join('')+
        `<circle cx="${cx}" cy="${cy}" r="${hole}" fill="#fff"/>
         <text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="system-ui" font-weight="700" letter-spacing="1">GASTOS</text>
         <text x="${cx}" y="${cy+8}" text-anchor="middle" font-size="15" fill="#0f172a" font-family="system-ui" font-weight="900">${tasaGasto}%</text>
         <text x="${cx}" y="${cy+20}" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="system-ui">del ingreso</text>`;
    }

    // ── Paginación ───────────────────────────────────────────────────────
    const RPP=28;
    const txPages=[];
    for(let p=0;p<Math.max(Math.ceil(txExport.length/RPP),1);p++)
      txPages.push(txExport.slice(p*RPP,(p+1)*RPP));

    const fechaDoc=new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"long",year:"numeric"});
    const titulo=soloMesActual
      ?`Reporte · ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
      :"Historial completo de movimientos";

    // ── Helper: fila de tabla ────────────────────────────────────────────
    function txRow(t){
      const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
      const sub=getCatInfo(t.cat);
      const esIng=isIngreso(t.cat)||isIngresoExtra(t.cat)||isDevolucion(t.cat);
      const esMeta=isAporteMeta(t)||isSavingsLegacy(t.cat);
      const tipo=esIng?"Ingreso":esMeta?"Meta":"Gasto";
      const badge=esIng?"badge-ing":esMeta?"badge-meta":"badge-gas";
      const monto=(esIng||esMeta?1:-1)*t.amount;
      const catLabel=main?`${main.label} · ${sub.label}`:sub.label;
      const fecha=t.date?`${t.date.slice(8,10)}/${t.date.slice(5,7)}`:"-";
      return `<tr>
        <td class="td-fecha">${fecha}</td>
        <td class="td-desc">${t.desc||"—"}</td>
        <td class="td-cat">${sub.icon||""} ${catLabel}</td>
        <td class="td-tipo"><span class="${badge}">${tipo}</span></td>
        <td class="td-monto ${monto>=0?"pos":"neg"}">${monto>=0?"+":""}${COP(Math.abs(monto))}</td>
      </tr>`;
    }

    // ── CSS ──────────────────────────────────────────────────────────────
    const css=`
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'DM Sans',system-ui,sans-serif;background:#dde3ec;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      /* Página */
      .page{background:#fff;width:210mm;margin:0 auto 20px;border-radius:8px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.18);}
      /* Header degradado */
      .hdr{background:linear-gradient(135deg,#4338ca 0%,#6366f1 60%,#818cf8 100%);padding:20px 24px 18px;color:#fff;position:relative;overflow:hidden;}
      .hdr::before{content:'';position:absolute;top:-40px;right:-30px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.07);}
      .hdr::after{content:'';position:absolute;bottom:-60px;right:60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.05);}
      .hdr-row{display:flex;justify-content:space-between;align-items:flex-start;position:relative;}
      .hdr-logo{font-size:17px;font-weight:900;letter-spacing:-0.5px;opacity:0.95;}
      .hdr-meta{text-align:right;font-size:9.5px;opacity:0.75;line-height:1.6;}
      .hdr-title{font-size:24px;font-weight:900;letter-spacing:-0.8px;margin-top:10px;position:relative;}
      .hdr-sub{font-size:10.5px;opacity:0.7;margin-top:3px;position:relative;}
      /* KPIs */
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #e2e8f0;}
      .kpi{padding:13px 20px;border-right:1px solid #e2e8f0;}
      .kpi:last-child{border-right:none;padding-right:20px;}
      .kpi-lbl{font-size:8.5px;font-weight:700;letter-spacing:1.2px;color:#94a3b8;text-transform:uppercase;margin-bottom:5px;}
      .kpi-val{font-size:15px;font-weight:900;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;}
      .kpi-hint{font-size:8.5px;color:#94a3b8;margin-top:3px;}
      /* Cuerpo */
      .body{padding:14px 24px 0;}
      .sec-lbl{font-size:8.5px;font-weight:700;letter-spacing:1.5px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;}
      /* Gráfica + categorías */
      .analytics{display:grid;grid-template-columns:165px 1fr;gap:18px;margin-bottom:16px;align-items:start;}
      .donut-wrap{text-align:center;}
      .donut-title{font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;}
      /* Lista categorías */
      .cat-list{display:flex;flex-direction:column;gap:7px;}
      .cat-row{display:grid;grid-template-columns:10px 1fr 72px 60px;gap:7px;align-items:center;}
      .cat-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
      .cat-name{font-size:10.5px;color:#334155;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cat-bar{height:4px;background:#f1f5f9;border-radius:99px;overflow:hidden;}
      .cat-bar-fill{height:4px;border-radius:99px;}
      .cat-val{font-size:10px;font-weight:700;color:#64748b;text-align:right;}
      /* Tabla de ingresos */
      .ing-table{background:#f0fdf4;border-radius:10px;padding:10px 14px;margin-bottom:14px;border:1px solid #bbf7d0;}
      .ing-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #dcfce7;}
      .ing-row:last-child{border-bottom:none;}
      .ing-icon{font-size:13px;width:20px;flex-shrink:0;}
      .ing-lbl{flex:1;font-size:10.5px;color:#334155;font-weight:500;}
      .ing-date{color:#94a3b8;font-size:9px;font-weight:400;}
      .ing-amount{font-size:11px;font-weight:700;text-align:right;min-width:80px;color:#059669;}
      .ing-total-row{margin-top:3px;padding-top:7px!important;border-top:2px solid #86efac!important;border-bottom:none!important;}
      .ing-total-row .ing-lbl{font-weight:800;color:#166534;font-size:11px;}
      .ing-total-row .ing-amount{font-size:13px;}
      /* Insights */
      .insights{background:#f8fafc;border-radius:10px;padding:11px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
      .ins-lbl{font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8;text-transform:uppercase;margin-bottom:3px;}
      .ins-val{font-size:14px;font-weight:900;letter-spacing:-0.3px;}
      .ins-hint{font-size:8.5px;color:#94a3b8;margin-top:2px;}
      /* Tabla */
      .tbl-outer{margin:0;}
      table{width:100%;border-collapse:collapse;}
      thead tr{background:#4338ca;}
      thead th{color:#fff;padding:8px 10px;font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;}
      th.th-fecha{width:8%;padding-left:14px;}
      th.th-desc{width:27%;text-align:left;}
      th.th-cat{width:25%;text-align:left;}
      th.th-tipo{width:10%;text-align:center;}
      th.th-monto{width:30%;text-align:right;padding-right:14px;}
      tbody tr:nth-child(even){background:#f8fafc;}
      td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:10.5px;vertical-align:middle;}
      td.td-fecha{padding-left:14px;color:#94a3b8;font-size:9.5px;white-space:nowrap;}
      td.td-desc{font-weight:600;color:#0f172a;}
      td.td-cat{color:#64748b;font-size:10px;}
      td.td-tipo{text-align:center;}
      td.td-monto{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;padding-right:14px;}
      td.pos{color:#059669;}
      td.neg{color:#dc2626;}
      /* Badges tipo */
      .badge-ing,.badge-gas,.badge-meta{display:inline-block;padding:2px 7px;border-radius:99px;font-size:8px;font-weight:700;}
      .badge-ing{background:#dcfce7;color:#166534;}
      .badge-gas{background:#fee2e2;color:#991b1b;}
      .badge-meta{background:#e0e7ff;color:#3730a3;}
      /* Fila total */
      .tr-total td{background:#f1f5f9;font-weight:800;color:#334155;border-top:2px solid #e2e8f0;border-bottom:none;}
      /* Footer */
      .footer{padding:9px 24px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9;}
      .footer-txt{font-size:8.5px;color:#94a3b8;}
      .footer-dot{width:4px;height:4px;border-radius:50%;background:#6366f1;display:inline-block;margin:0 6px;vertical-align:middle;}
      /* Encabezado páginas 2+ */
      .page-hdr{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:9px 24px;display:flex;justify-content:space-between;align-items:center;}
      .page-hdr-logo{font-size:11px;font-weight:900;color:#4338ca;}
      .page-hdr-info{font-size:9px;color:#94a3b8;}
      /* Print */
      @page{margin:14mm 16mm;}
      @media print{
        body{background:#fff;padding:0;}
        .page{box-shadow:none;margin:0;border-radius:0;width:100%;page-break-after:always;}
        .page:last-child{page-break-after:avoid;}
        .no-print{display:none!important;}
      }
    `;

    // ── HTML: KPI cards ──────────────────────────────────────────────────
    const nExtrasTotal=txExtras.length+txDevoluciones.length+(soloMesActual&&salBase>0?1:txIngSalario.length);
    const kpisHTML=`<div class="kpis">
      <div class="kpi"><div class="kpi-lbl">Ingresos del mes</div><div class="kpi-val" style="color:#059669">${COP(totalIng)}</div><div class="kpi-hint">${soloMesActual?`salario + ${txExtras.length+txDevoluciones.length} extras`:`${nExtrasTotal} movimientos`}</div></div>
      <div class="kpi"><div class="kpi-lbl">Gastos</div><div class="kpi-val" style="color:#dc2626">${COP(totalGas)}</div><div class="kpi-hint">${txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).length} movimientos</div></div>
      <div class="kpi"><div class="kpi-lbl">Aportes a metas</div><div class="kpi-val" style="color:#4f46e5">${COP(totalApo)}</div><div class="kpi-hint">${txExport.filter(t=>isAporteMeta(t)).length} aportes</div></div>
      <div class="kpi"><div class="kpi-lbl">Balance</div><div class="kpi-val" style="color:${balance>=0?"#059669":"#dc2626"}">${balance>=0?"+":""}${COP(balance)}</div><div class="kpi-hint">${balance>=0?"Positivo ✓":"Déficit · revisar gastos"}</div></div>
    </div>`;

    // ── HTML: desglose de ingresos (solo reporte mensual) ───────────────
    const ingresosHTML=soloMesActual?`
      <div class="sec-lbl" style="margin-top:14px">Ingresos del mes</div>
      <div class="ing-table">
        <div class="ing-row">
          <span class="ing-icon">💼</span>
          <span class="ing-lbl">Salario base${modoSalario==="quincenal"?" (quincenal)":""}</span>
          <span class="ing-amount">${COP(salBase)}</span>
        </div>
        ${txExtras.map(t=>`
        <div class="ing-row">
          <span class="ing-icon">💰</span>
          <span class="ing-lbl">${t.desc||"Ingreso extra"} <span class="ing-date">${t.date?`(${t.date.slice(8,10)}/${t.date.slice(5,7)})`:""}  </span></span>
          <span class="ing-amount">+${COP(t.amount)}</span>
        </div>`).join("")}
        ${txDevoluciones.map(t=>`
        <div class="ing-row">
          <span class="ing-icon">↩️</span>
          <span class="ing-lbl">${t.desc||"Devolución recibida"} <span class="ing-date">${t.date?`(${t.date.slice(8,10)}/${t.date.slice(5,7)})`:""}  </span></span>
          <span class="ing-amount">+${COP(t.amount)}</span>
        </div>`).join("")}
        <div class="ing-row ing-total-row">
          <span class="ing-icon">∑</span>
          <span class="ing-lbl">Total ingresos del mes</span>
          <span class="ing-amount">${COP(totalIng)}</span>
        </div>
      </div>`:"";

    // ── HTML: gráfica + categorías ───────────────────────────────────────
    const analyticsHTML=totalGas>0?`
      <div class="sec-lbl" style="margin-top:14px">Distribución de gastos</div>
      <div class="analytics">
        <div class="donut-wrap">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="65" fill="#f1f5f9"/>
            ${buildDonut(catData,totalGas)}
          </svg>
        </div>
        <div class="cat-list">
          ${catData.map(c=>`
            <div class="cat-row">
              <div class="cat-dot" style="background:${c.color}"></div>
              <div class="cat-name">${c.icon} ${c.label}</div>
              <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.round(c.total/maxCat*100)}%;background:${c.color}"></div></div>
              <div class="cat-val">${COP(c.total)}</div>
            </div>`).join("")}
        </div>
      </div>`:"";

    // ── HTML: insights ───────────────────────────────────────────────────
    const mayorCat=catData[0];
    const insightsHTML=soloMesActual?`
      <div class="insights">
        <div><div class="ins-lbl">Tasa de ahorro</div>
          <div class="ins-val" style="color:${tasaAhorro>=20?"#059669":tasaAhorro>=10?"#d97706":"#dc2626"}">${tasaAhorro}%</div>
          <div class="ins-hint">${tasaAhorro>=20?"Excelente":tasaAhorro>=10?"Bien":tasaAhorro>0?"Sigue mejorando":"Sin aportes"}</div></div>
        <div><div class="ins-lbl">Gasto diario prom.</div>
          <div class="ins-val" style="color:#0f172a;font-size:13px">${COP(gastoDiario)}</div>
          <div class="ins-hint">por día este mes</div></div>
        <div><div class="ins-lbl">Mayor categoría</div>
          <div class="ins-val" style="color:#0f172a;font-size:12px">${mayorCat?mayorCat.label:"—"}</div>
          <div class="ins-hint">${mayorCat?COP(mayorCat.total):""}</div></div>
        <div><div class="ins-lbl">Gastos vs ingresos</div>
          <div class="ins-val" style="color:${tasaGasto<=70?"#059669":tasaGasto<=90?"#d97706":"#dc2626"}">${tasaGasto}%</div>
          <div class="ins-hint">${tasaGasto<=70?"Controlado":tasaGasto<=90?"Atención":"Excedido"}</div></div>
      </div>`:"";

    // ── HTML: tabla ──────────────────────────────────────────────────────
    function tableHTML(rows,isLast){
      const totalRow=isLast?`<tr class="tr-total">
        <td class="td-fecha" colspan="3">Total del período · ${txExport.length} movimientos</td>
        <td class="td-tipo"></td>
        <td class="td-monto ${balance>=0?"pos":"neg"}">${balance>=0?"+":""}${COP(Math.abs(balance))}</td>
      </tr>`:"";
      return `<div class="tbl-outer"><table>
        <thead><tr>
          <th class="th-fecha">Fecha</th>
          <th class="th-desc">Descripción</th>
          <th class="th-cat">Categoría</th>
          <th class="th-tipo">Tipo</th>
          <th class="th-monto">Monto</th>
        </tr></thead>
        <tbody>${rows.map(txRow).join("")}${totalRow}</tbody>
      </table></div>`;
    }

    // ── HTML: páginas ────────────────────────────────────────────────────
    const page1=`<div class="page">
      <div class="hdr">
        <div class="hdr-row">
          <div class="hdr-logo">💰 MIS FINANZAS PRO</div>
          <div class="hdr-meta"><div>${user.displayName||""}</div><div>${fechaDoc}</div></div>
        </div>
        <div class="hdr-title">${titulo}</div>
        <div class="hdr-sub">${txExport.length} movimientos · generado el ${fechaDoc}</div>
      </div>
      ${kpisHTML}
      <div class="body">
        ${ingresosHTML}
        ${analyticsHTML}
        ${insightsHTML}
        <div class="sec-lbl" style="margin-top:${totalGas>0||soloMesActual?"0":"14px"}">Movimientos</div>
      </div>
      ${tableHTML(txPages[0]||[],txPages.length===1)}
      <div class="footer">
        <span class="footer-txt">mis-finanzas-weld.vercel.app</span>
        <span class="footer-txt">Página 1 de ${txPages.length}<span class="footer-dot"></span>${titulo}</span>
      </div>
    </div>`;

    const otherPages=txPages.slice(1).map((rows,i)=>`<div class="page">
      <div class="page-hdr">
        <span class="page-hdr-logo">💰 MIS FINANZAS PRO</span>
        <span class="page-hdr-info">${titulo} · ${user.displayName||""}</span>
      </div>
      ${tableHTML(rows,i===txPages.length-2)}
      <div class="footer">
        <span class="footer-txt">mis-finanzas-weld.vercel.app</span>
        <span class="footer-txt">Página ${i+2} de ${txPages.length}</span>
      </div>
    </div>`).join("");

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="utf-8">
      <title>Mis Finanzas · ${titulo}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&display=swap" rel="stylesheet">
      <style>${css}</style>
    </head><body>
      <div class="no-print" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 16px;position:sticky;top:0;z-index:99;background:#dde3ec;border-bottom:1px solid #c8d0db;flex-wrap:wrap;">
        <button onclick="window.close()" style="background:#fff;color:#4338ca;border:1.5px solid #c7d2fe;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
          ← Volver a la app
        </button>
        <button onclick="window.print()" style="background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;padding:11px 26px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(79,70,229,0.45);">
          🖨️ Imprimir / Guardar PDF
        </button>
        <span style="font-size:12px;color:#64748b;">Selecciona "Guardar como PDF" en el diálogo de impresión</span>
      </div>
      ${page1}${otherPages}
    </body></html>`);
    win.document.close();
    setExportModal(false);
    setMenuOpen(false);
  }
  const handlePresupuestoSave=useCallback(async(catId,limite)=>{
    if(!user)return;
    await FS.savePresupuesto(user.uid,catId,limite);
  },[user]);
 
  // Guardar varios presupuestos de golpe (plan inteligente)
  const handleBudgetBulkSave=useCallback(async(presupuestosObj)=>{
    if(!user)return;
    await FS.saveBudgetBulk(user.uid,presupuestosObj);
  },[user]);

  // Guardar subcategorías personalizadas — campo catsCustom en usuarios/{uid}
  const handleCatCustomSave=useCallback(async(mainId,subs)=>{
    if(!user)return;
    const updated={...catsCustom,[mainId]:subs};
    setCatsCustom(updated);
    await FS.saveCatsCustom(user.uid,updated);
  },[user,catsCustom]);

  // CRUD préstamos a terceros
  const handlePrestamoSave=useCallback(async p=>{
    if(!user)return;
    await FS.savePrestamo(user.uid,p);
  },[user]);
  const handlePrestamoDelete=useCallback(async(id,txId)=>{
    if(!user)return;
    await FS.deletePrestamo(user.uid,id,txId);
  },[user]);
  const handlePrestamoToggle=useCallback(async(id,devuelto,montoDevuelto,nombre)=>{
    if(!user)return;
    await FS.togglePrestamo(user.uid,id,devuelto,montoDevuelto,nombre);
  },[user]);

  // CRUD deudas
  const handleDeudaSave=useCallback(async(d)=>{
    if(!user)return;
    await FS.saveDeuda(user.uid,d);
  },[user]);

  const handleDeudaPagar=useCallback(async(deudaId,monto)=>{
    if(!user)return;
    await FS.pagarDeuda(user.uid,deudaId,monto);
  },[user]);

  const handleDeudaDelete=useCallback(async(deudaId)=>{
    if(!user)return;
    await FS.deleteDeuda(user.uid,deudaId);
  },[user]);

  const handlePatrimonioSave=useCallback(async(p)=>{
    if(!user)return;
    await FS.savePatrimonio(user.uid,p);
  },[user]);

  // CRUD pagos programados
  const handlePagoSave=useCallback(async p=>{
    if(!user)return;
    await FS.savePago(user.uid,p,calMes,calAnio);
  },[user,calMes,calAnio]);
  const handlePagoDelete=useCallback(async id=>{
    if(!user)return;
    await FS.deletePago(user.uid,id);
  },[user]);
  const handlePagoConfirmar=useCallback(async p=>{
    if(!user)return;
    await FS.confirmarPago(user.uid,p);
  },[user]);
  const handlePagoNoPague=useCallback(async p=>{
    if(!user)return;
    await FS.deletePago(user.uid,p.id);
  },[user]);
  const handlePagoPostponer=useCallback(async p=>{
    if(!user)return;
    await FS.posponerPago(user.uid,p.id);
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

  const monthTx=tx.filter(t=>isMonth(t.date,month,selectedYear));
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
  // Salario mensual efectivo: si quincenal, el usuario recibe sal×2 al mes
  const salMensualEfectivo=modoSalario==="quincenal"?sal*2:sal;
  const salDelMes=getSalarioDelMes(selectedYear,month);
  const ingresosExtra=ingresosTx.reduce((s,t)=>s+t.amount,0);
  const totalIngresoMes=salDelMes+ingresosExtra; // solo salario + ingresos reales de trabajo

  // Saldo acumulativo — delegado al util puro
  const saldoAnterior=useMemo(()=>calcSaldoAcumulado({
    tx,month,selectedYear,
    salario,salarioHistory,modoSalario,quincenas,
    isIngreso,isDevolucion,isIngresoExtra,isPrestamoTercero,
    isAporteMeta,isSavingsLegacy,parseDateSafe,
  }),[tx,month,selectedYear,salario,salarioHistory,modoSalario,quincenas]);
  const saldo=totalIngresoMes+saldoAnterior-totalGasto-totalAportes-totalPrestamos+totalDevoluciones+totalExtras;
  // disponible para gastar: ingresos + extras - gastos - metas - préstamos (metas son intocables)
  const disponibleGastar=Math.max(totalIngresoMes+saldoAnterior+totalExtras+totalDevoluciones-totalGasto-totalAportes-totalPrestamos,0);
  const tasaAhorr=totalIngresoMes>0?totalAportes/totalIngresoMes:0;
  // "de $X" muestra el salario puro — referencia fija del mes
  const totalDisponibleBase=totalIngresoMes+saldoAnterior;
  // % gastado = gastos / salario — cuánto del sueldo se fue en gastos
  const pctUsado=totalIngresoMes>0?totalGasto/totalIngresoMes:totalGasto>0?1:0;
  const totalEnMetas=tx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
  const saldoColor=pctUsado<0.7?C.emerald:pctUsado<0.9?C.amber:C.red;
  const animSaldo=useCountUp(disponibleGastar);
  const animGasto=useCountUp(totalGasto,800);
  const animAportes=useCountUp(totalAportes,850);
  // Compartidos entre HomeTab y AnalisisTab — subidos al scope de App()
  const byMain=useMemo(()=>MAIN_CATS.map(m=>({...m,total:gastosTx.filter(t=>m.subs.some(s=>s.id===t.cat)||(catsCustom[m.id]||[]).some(s=>s.id===t.cat)).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0||(presupuestos[c.id]||0)>0).sort((a,b)=>(b.total-a.total)||((presupuestos[b.id]||0)-(presupuestos[a.id]||0)))
  ,[gastosTx,presupuestos,catsCustom]);
  const totalMesesConDatos=new Set(tx.map(t=>{const d=parseDateSafe(t.date);return `${d.getFullYear()}-${d.getMonth()}`;})).size;

  // ── Cálculo de logros ──────────────────────────────────────────────────────
  // mesesResumen usa la misma lógica exacta de App.jsx — sin reimplementar nada
  const mesesResumen=useMemo(()=>{
    const mesesSet=new Set(tx.map(t=>{
      const d=parseDateSafe(t.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    return [...mesesSet].map(key=>{
      const [y,m]=key.split('-').map(Number);
      const mTx=tx.filter(t=>{const d=parseDateSafe(t.date);return d.getFullYear()===y&&d.getMonth()===m;});
      const gastos=mTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
      const ingresosReg=mTx.filter(t=>isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0);
      const ingresos=getSalarioDelMes(y,m)+ingresosReg; // igual que totalIngresoMes
      const aportes=mTx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
      const totalTx=mTx.length;
      return{anio:y,mes:m,gastos,ingresos,aportes,totalTx};
    });
  },[tx,salario,salarioHistory]);

  const mesesPerfectos=useMemo(()=>calcMesesPerfectos({
    tx,presupuestos,MAIN_CATS,isGasto,isAporteMeta,
  }),[tx,presupuestos]);

  // Racha actual (meses consecutivos gastos < ingresos, hacia atrás desde hoy)
  const rachaActualLogros=useMemo(()=>{
    const currentM=now.getMonth(),currentY=now.getFullYear();
    let racha=0;
    let y=currentY,m=currentM-1; // empezar desde el mes anterior
    if(m<0){m=11;y--;}
    for(let i=0;i<24;i++){
      const mr=mesesResumen.find(r=>r.anio===y&&r.mes===m);
      if(!mr||mr.gastos>=mr.ingresos) break;
      racha++;
      m--;if(m<0){m=11;y--;}
    }
    return racha;
  },[mesesResumen]);

  // Mapa goalId→total aportado — calculado una vez por cambio en tx o goals
  const aportadoMap=useMemo(()=>{
    const map={};
    goals.forEach(g=>{
      const saldoInicial=g.saldoInicial||0;
      const aportesApp=tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===g.id)
               .reduce((s,t)=>s+t.amount,0);
      map[g.id]=saldoInicial+aportesApp;
    });
    return map;
  },[tx,goals]);
  function getAportado(gid){ return aportadoMap[gid]||0; }
  function getAportadoMes(gid,m,y){
    return tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===gid&&isMonth(t.date,m,y))
             .reduce((s,t)=>s+t.amount,0);
  }

  const badgesDesbloqueados=useMemo(()=>calcBadgesDesbloqueados({
    tx,goals,presupuestos,prestamos,
    rachaActual:rachaActualLogros,
    totalMesesConDatos,mesesResumen,mesesPerfectos,
    getAportado,MAIN_CATS,isGasto,isAporteMeta,
  }),[tx,goals,presupuestos,prestamos,rachaActualLogros,totalMesesConDatos,mesesResumen,mesesPerfectos]);

  const totalPts=useMemo(()=>
    BADGES_DEF.filter(b=>badgesDesbloqueados[b.id]).reduce((s,b)=>s+b.pts,0)
  ,[badgesDesbloqueados]);

  // Detectar badges nuevos y guardar en Firestore
  useEffect(()=>{
    if(!user||!tx.length||!badgesLoaded||badgesResettingRef.current) return;
    const nuevos=Object.entries(badgesDesbloqueados)
      .filter(([id,val])=>val&&!badgesGuardados[id])
      .map(([id])=>id);
    if(nuevos.length===0) return;
    const updated={...badgesGuardados};
    nuevos.forEach(id=>{updated[id]=true;});
    setBadgesGuardados(updated);
    setBadgesNuevos(nuevos);
    setDoc(doc(db,"usuarios",user.uid),{badges:updated},{merge:true});
    setTimeout(()=>setBadgesNuevos([]),6000);
  },[badgesDesbloqueados,user]);


  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap');
    html,body{background:${themeBg()}!important;margin:0;padding:0;}
    *{box-sizing:border-box;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes float{0%,100%{transform:translateY(0px)}50%{transform:translateY(-8px)}}
    @keyframes glow{0%,100%{opacity:0.6}50%{opacity:1}}
    @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.75}}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:0.4}100%{transform:translate(-50%,-50%) scale(20);opacity:0}}
    @keyframes fadeSlideUp{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
    @keyframes fadeSlideDown{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(6px)}}
    @keyframes overlayIn{from{opacity:0;backdrop-filter:blur(0px)}to{opacity:1;backdrop-filter:blur(3px)}}
    @keyframes overlayOut{from{opacity:1;backdrop-filter:blur(3px)}to{opacity:0;backdrop-filter:blur(0px)}}
    @keyframes sheetSpringIn{0%{transform:translateY(100%);opacity:0}100%{transform:translateY(0);opacity:1}}
    @keyframes sheetSpringOut{0%{transform:translateY(0);opacity:1}100%{transform:translateY(100%);opacity:0}}
    @keyframes sheetIn{0%{transform:translateY(60px);opacity:0}100%{transform:translateY(0);opacity:1}}
    input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6);}
    input::placeholder{color:${paleta.text.s}44;}
    ::-webkit-scrollbar{display:none;}
    button:active{transform:scale(0.96);transition:transform 0.12s cubic-bezier(0.34,1.56,0.64,1);}
    button{transition:transform 0.15s cubic-bezier(0.34,1.56,0.64,1),opacity 0.15s;}
    .tap:active{transform:scale(0.97);transition:transform 0.12s cubic-bezier(0.34,1.56,0.64,1);}
  `;

  if(authLoading)return <SplashScreen mensaje="Cargando..."/>;
  if(!user)return <LoginScreen onLogin={handleLogin} loading={loginLoading}/>;
  if(salario===null)return <SplashScreen mensaje="Cargando tu perfil..."/>;
  if(showOnb)return <OnboardingScreen user={user} onSave={handleOnbSave}/>;

  // ── Selector de mes inteligente — solo meses relevantes ─────────────────
  const MonthSelector=()=>{
    const currentM=now.getMonth(), currentY=now.getFullYear();

    // Años con transacciones + año actual siempre disponible
    const aniosSet=new Set(tx.map(t=>parseDateSafe(t.date).getFullYear()));
    aniosSet.add(currentY);
    const anios=[...aniosSet].sort((a,b)=>a-b);
    const minAnio=anios[0], maxAnio=currentY;

    // Meses con datos del año seleccionado
    const conTxAnio=new Set(
      tx.filter(t=>parseDateSafe(t.date).getFullYear()===selectedYear)
        .map(t=>parseDateSafe(t.date).getMonth())
    );
    // Siempre incluir mes actual si es el año actual
    if(selectedYear===currentY){
      conTxAnio.add(currentM);
      if(currentM+1<=11) conTxAnio.add(currentM+1); // mes siguiente
    }
    const mesesVisibles=[...conTxAnio].sort((a,b)=>a-b);

    useEffect(()=>{
      if(!monthScrollRef.current)return;
      const active=monthScrollRef.current.querySelector("[data-active='true']");
      if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
    },[selectedYear]);

    function cambiarAnio(nuevoAnio){
      setSelectedYear(nuevoAnio);
      // Al cambiar año, ir al último mes con datos de ese año (o enero)
      const mesesDelAnio=new Set(
        tx.filter(t=>parseDateSafe(t.date).getFullYear()===nuevoAnio)
          .map(t=>parseDateSafe(t.date).getMonth())
      );
      if(nuevoAnio===currentY) mesesDelAnio.add(currentM);
      const ultimo=mesesDelAnio.size?Math.max(...mesesDelAnio):0;
      setMonthSafe(ultimo);
    }

    const puedeIrAtras=selectedYear>minAnio;
    const puedeIrAdelante=selectedYear<maxAnio;

    return <div style={{marginBottom:0}}>
      {/* Selector de año — solo si hay más de un año */}
      {anios.length>1&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <button onClick={()=>puedeIrAtras&&cambiarAnio(selectedYear-1)}
          style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.card,
            color:puedeIrAtras?C.text.h:C.text.s,cursor:puedeIrAtras?"pointer":"default",
            fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>
        <span style={{fontSize:12,fontWeight:700,color:C.text.b,letterSpacing:0.5}}>{selectedYear}</span>
        <button onClick={()=>puedeIrAdelante&&cambiarAnio(selectedYear+1)}
          style={{width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:C.card,
            color:puedeIrAdelante?C.text.h:C.text.s,cursor:puedeIrAdelante?"pointer":"default",
            fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>›</button>
      </div>}
      {/* Scroll de meses */}
      <div ref={monthScrollRef} style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:14,paddingTop:2,
        scrollbarWidth:"none",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",alignItems:"center"}}>
        {mesesVisibles.map(i=>{
          const isNext=selectedYear===currentY&&i===currentM+1;
          const isActive=month===i;
          return <button key={i} data-active={isActive?"true":"false"}
            onClick={()=>setMonthSafe(i)}
            style={{
              flexShrink:0,padding:"8px 18px",borderRadius:99,border:"none",cursor:"pointer",
              fontSize:12,fontWeight:isActive?700:500,
              background:isActive?C.emerald:isNext?`${C.indigo}22`:cardBg(),
              backdropFilter:isActive?"none":cardBlur(),
              WebkitBackdropFilter:isActive?"none":cardBlur(),
              border:isActive?"none":cardBorderVal(),
              color:isActive?C.isLight?"#fff":"#000":isNext?C.indigoLight:C.text.s,
              boxShadow:isActive?`0 4px 16px ${C.emerald}44`:"none",
              transition:"all 0.2s",
            }}>{MONTHS_S[i]}</button>;
        })}
        {mesesVisibles.length===0&&<span style={{fontSize:12,color:C.text.s,padding:"8px 0"}}>Sin datos en {selectedYear}</span>}
      </div>
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
      ...cardSurface(C.emerald),
      border:cardBorder(C.emerald),
      boxShadow:cardShadow(C.emerald),
      borderRadius:18,
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
    if(compacto) return <div style={{padding:`${SC.pad(16)}px ${SC.pad(20)}px 100px`}}>
      <MonthSelector/>
      {/* Card única tipo Apple Wallet */}
      <div style={{
        ...heroCard(pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.indigo),
        borderRadius:28, padding:"24px 22px",
        marginBottom:16, animation:"fadeIn 0.25s ease",
        position:"relative", overflow:"hidden",
      }}>
        <GradientOrbs color={pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.indigo}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>Disponible · {MONTHS_S[month]}</div>
          <div style={{fontSize:SC.fs(48),fontWeight:700,letterSpacing:-1,color:pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.emerald,fontVariantNumeric:"tabular-nums",marginBottom:20,lineHeight:1}}>
            {COP(animSaldo)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:ink(0.08),borderRadius:14,overflow:"hidden"}}>
            {[
              {label:"Gastos",value:COP(animGasto),color:C.red},
              {label:"En metas",value:COP(animAportes),color:C.indigoLight},
              {label:"Libre",value:`${Math.round(Math.max((totalIngresoMes-totalAportes)>0?(totalIngresoMes-totalAportes-totalGasto)/(totalIngresoMes-totalAportes)*100:0,0))}%`,color:pctUsado>=0.9?C.red:C.emerald},
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
        <div style={{...cardSurface(),border:cardBorder(),boxShadow:cardShadow(),borderRadius:20,padding:"0 16px",marginBottom:16}}>
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
              <div style={{fontSize:13,fontWeight:700,color:esPos?(C.isLight?C.emerald:C.emeraldLight):C.text.h,flexShrink:0}}>
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
        {goals.slice(0,2).map(g=><GoalChip key={g.id} goal={g} aportado={getAportado(g.id)} aportadoEsteMes={getAportadoMes(g.id,month,selectedYear)} txAll={tx} onClick={()=>changeTab("metas")}/>)}
      </>}
    </div>;

    return <div style={{padding:`${SC.pad(16)}px ${SC.pad(20)}px 100px`}}>
      <MonthSelector/>
      <ResumenSemanal/>
      {/* Banner quincena */}
      <BannerQuincena
        modoSalario={modoSalario}
        quincenas={quincenas}
        salario={sal}
        tx={tx}
        month={month}
        now={now}
        onConfirmar={async(q)=>{
          // Registrar ingreso automáticamente
          await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
            desc:`Quincena ${q.num===1?"1ª":"2ª"}`,amount:sal,cat:"ingreso",
            date:todayStr(),createdAt:serverTimestamp(),
          });
          // Marcar como no mostrar más esta quincena
          const newQ={...quincenas,dismissed:{...quincenas.dismissed,[q.key]:"no_recordar"}};
          setQuincenas(newQ);
          setDoc(doc(db,"usuarios",user.uid),{quincenas:newQ},{merge:true});
        }}
        onPosponer={(q)=>{
          const newQ={...quincenas,dismissed:{...quincenas.dismissed,[q.key]:now.getDate()}};
          setQuincenas(newQ);
          setDoc(doc(db,"usuarios",user.uid),{quincenas:newQ},{merge:true});
        }}
        onNoRecordar={(q)=>{
          const newQ={...quincenas,dismissed:{...quincenas.dismissed,[q.key]:"no_recordar"}};
          setQuincenas(newQ);
          setDoc(doc(db,"usuarios",user.uid),{quincenas:newQ},{merge:true});
        }}
        C={C} COP={COP}
      />
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
      {/* ── 1. Disponible — Hero Card ── */}
      <div style={{
        ...heroCard(pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.indigo),
        borderRadius:28, padding:"30px 24px 24px", marginBottom:20,
        transition:"all 0.5s ease",
        position:"relative", overflow:"hidden",
      }}>
        <GradientOrbs color={pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.indigo}/>
        <div style={{position:"relative"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.8,fontWeight:600,textTransform:"uppercase"}}>Disponible · {MONTHS_S[month]}</div>
          {saldoAnterior>0&&<div style={{background:ink(0.06),borderRadius:99,padding:"3px 10px",fontSize:11,color:C.isLight?C.emerald:C.emeraldLight,fontWeight:600}}>+{COP(saldoAnterior)}</div>}
        </div>
        <div style={{fontSize:(()=>{const l=COP(animSaldo).replace(/[^\d]/g,"").length;return SC.fs(l>=10?36:l>=8?44:52);})()
          ,fontWeight:700,letterSpacing:-1,lineHeight:1,color:pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.emerald,fontVariantNumeric:"tabular-nums",marginBottom:28,transition:"color 0.4s",wordBreak:"break-word"}}>
          {COP(animSaldo)}
        </div>
        <div style={{background:ink(0.06),borderRadius:99,height:3,overflow:"hidden",marginBottom:12}}>
          <div style={{height:3,borderRadius:99,background:pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.emerald,width:`${Math.min(pctUsado*100,100)}%`,transition:"width 0.8s ease",opacity:0.7}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          {totalIngresoMes>0?(
            totalAportes>0
              ? <span style={{fontSize:11,color:C.text.b,fontWeight:500}}>
                  de {COP(totalIngresoMes-totalAportes)} para gastar · <span style={{color:C.indigoLight}}>{COP(totalAportes)} en metas</span>
                  {modoSalario==="quincenal"&&<span style={{color:C.text.s}}> · quincenal</span>}
                </span>
              : <span style={{fontSize:12,color:C.text.b,fontWeight:500}}>
                  de {COP(totalIngresoMes)}{modoSalario==="quincenal"?" · quincenal":""}
                </span>
          ):<span style={{fontSize:12,color:C.text.b}}>Sin ingresos</span>}
          <span style={{fontSize:12,fontWeight:600,color:pctUsado>=0.9?C.red:pctUsado>=0.7?C.amber:C.text.s}}>{Math.round(pctUsado*100)}% gastado</span>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {[
              {label:"Gastos", valor:animGasto, color:C.red, sub:`${Math.round(pctUsado*100)}% del ingreso`},
              {label:"En metas", valor:animAportes, color:C.indigo, sub:totalAportes>0?`${Math.round(tasaAhorr*100)}% guardado`:"Empieza cuando quieras"},
            ].map(item=>(
              <div key={item.label} style={{
                ...cardSurface(item.color),
                borderRadius:22, padding:"18px 16px",
                border: cardBorder(item.color),
                boxShadow: cardShadow(item.color),
                position:"relative", overflow:"hidden",
              }}>
                <div style={{
                  position:"absolute",top:0,left:0,right:0,height:2,
                  background:`linear-gradient(90deg,${item.color},${item.color}44)`,
                  borderRadius:"22px 22px 0 0",
                }}/>
                <div style={{fontSize:11,color:C.text.s,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10,marginTop:4}}>
                  {item.label}
                </div>
                <div style={{fontSize:21,fontWeight:800,color:item.color,marginBottom:4,letterSpacing:-0.5,lineHeight:1}}>
                  {COP(item.valor)}
                </div>
                <div style={{fontSize:11,color:C.text.s}}>{item.sub}</div>
              </div>
            ))}
          </div>
          {/* ── 2.3 Bienvenida usuario nuevo ── */}
          {tx.length===0&&(
            <div style={{
              borderRadius:20,padding:"24px 20px",marginBottom:24,
              background:`linear-gradient(135deg,${C.indigo}18,${C.violet}10)`,
              border:`1px solid ${C.indigo}30`,
              animation:"fadeIn 0.4s ease",
            }}>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontSize:42,marginBottom:10}}>🚀</div>
                <div style={{fontSize:17,fontWeight:900,color:C.text.h,marginBottom:8}}>
                  ¡Todo listo para empezar!
                </div>
                <div style={{fontSize:13,color:C.text.b,lineHeight:1.7}}>
                  Registra tu primer movimiento<br/>y la app empieza a trabajar para ti.
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={()=>setModal("new")} style={{
                  width:"100%",padding:"14px 0",borderRadius:14,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${C.indigo},#4338ca)`,
                  color:"#fff",fontSize:14,fontWeight:800,
                }}>💸 Registrar mi primer gasto</button>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{if(!isPro&&goals.length>=3){setProGate({titulo:"Metas ilimitadas",descripcion:"Con el plan Free puedes tener hasta 3 metas activas.",features:[{icon:"🎯",label:"Metas ilimitadas",desc:"Crea tantas como quieras"},{icon:"📊",label:"Proyecciones de logro"}]});}else setGoalModal("new");}} style={{
                    flex:1,padding:"12px 0",borderRadius:12,
                    border:`1px solid ${C.indigo}33`,
                    background:`${C.indigo}10`,color:C.indigoLight,
                    fontSize:13,fontWeight:700,cursor:"pointer",
                  }}>⭐ Crear meta</button>
                  <button onClick={()=>changeTab("cfg")} style={{
                    flex:1,padding:"12px 0",borderRadius:12,
                    border:`1px solid ${C.border}`,
                    background:C.surface,color:C.text.b,
                    fontSize:13,fontWeight:700,cursor:"pointer",
                  }}>⚙️ Configurar</button>
                </div>
              </div>
            </div>
          )}
          {/* ── 2.5 Banner plan inteligente (si no hay presupuestos) ── */}
          <BudgetSetupBanner
            key={bannerDismissTick}
            salario={salMensualEfectivo}
            presupuestos={presupuestos}
            mesesDatos={totalMesesConDatos||0}
            C={C} COP={COP}
            onActivate={()=>setBudgetSetupOpen(true)}/>
          {/* ── 2.45 Simulador ── */}
          {disponibleGastar>0&&<button
            onClick={()=>isPro?setSimuladorOpen(true):setProGate({titulo:"Simulador de decisión",descripcion:"Analiza si puedes permitirte una compra sin afectar tus finanzas.",features:[{icon:"🎯",label:"Simulación de impacto"},{icon:"📊",label:"Análisis de cuotas"},{icon:"💡",label:"Recomendación inteligente"}]})}
            style={{
              width:"100%",display:"flex",alignItems:"center",gap:12,
              ...cardSurface(C.violet),
              border:cardBorder(C.violet),
              boxShadow:cardShadow(C.violet),
              borderRadius:14,padding:"11px 14px",cursor:"pointer",
              marginBottom:14,
              borderLeft:`3px solid ${C.violet}`,
              transition:"transform 0.15s",
            }}
            onMouseDown={e=>e.currentTarget.style.transform="scale(0.98)"}
            onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
            onTouchStart={e=>e.currentTarget.style.transform="scale(0.98)"}
            onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}
          >
            <span style={{fontSize:16,flexShrink:0}}>🔮</span>
            <div style={{flex:1,textAlign:"left"}}>
              <span style={{fontSize:13,fontWeight:700,color:C.text.h}}>Simulador{!isPro?" ⚡":""}</span>
              <span style={{fontSize:12,color:C.text.s,marginLeft:6}}>¿Me alcanza la plata?</span>
            </div>
            <span style={{fontSize:12,color:C.violet,fontWeight:700}}>→</span>
          </button>}
          {/* ── 2.6 Racha — solo si es impresionante (3+ meses) ── */}
          {rachaActualLogros>=3&&<RachaWidget/>}
          {/* ── 3. Insights ── */}
          <InsightsEngine txAll={tx} monthTx={monthTx} gastosTx={gastosTx} totalGasto={totalGasto} totalIng={totalIngresoMes} totalAhorr={totalAportes} month={month} C={C} COP={COP} MAIN_CATS={MAIN_CATS} isGasto={isGasto} isAporteMeta={isAporteMeta} isSavingsLegacy={isSavingsLegacy} isMonth={isMonth} presupuestos={presupuestos} goals={goals} pagos={pagos} saldo={saldo} disponibleGastar={disponibleGastar} totalAportesMes={totalAportes} rachaActual={rachaActualLogros}/>
          {/* ── 3.5 Salud del plan (si hay desbalance) ── */}
          <BudgetHealth
            salario={salMensualEfectivo}
            presupuestos={presupuestos}
            gastosTx={gastosTx}
            goals={goals}
            aporteMesTx={aporteMesAll}
            MAIN_CATS={MAIN_CATS}
            C={C} COP={COP}
            onFixBudget={()=>setBudgetSetupOpen(true)}/>
        </>
      )}
      {/* ── 4.5 Últimos movimientos ── */}
      {monthTx.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,marginTop:4}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Últimos movimientos</div>
          <button onClick={()=>changeTab("mov")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer"}}>Ver todos →</button>
        </div>
        <div style={{background:C.card,borderRadius:20,padding:"0 16px",boxShadow:elev("card"),marginBottom:20}}>
          {[...monthTx].sort((a,b)=>parseDateSafe(b.date)-parseDateSafe(a.date)).slice(0,5).map((t,i,arr)=>{
            const cat=getCatInfo(t.cat);
            const esPos=isAporteMeta(t)||isIngreso(t.cat)||isDevolucion(t.cat)||isIngresoExtra(t.cat);
            return <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",
              borderBottom:i<arr.length-1?`1px solid ${ink(0.05)}`:"none"}}>
              <div style={{width:38,height:38,borderRadius:12,flexShrink:0,background:`${cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{cat.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc||cat.label}</div>
                <div style={{fontSize:11,color:C.text.s,marginTop:1}}>{t.date?.slice(5).replace("-","/")} · {cat.label}</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:esPos?(C.isLight?C.emerald:C.emeraldLight):C.text.h,flexShrink:0}}>
                {esPos?"+":"-"}{COP(t.amount)}
              </div>
            </div>;
          })}
        </div>
      </>}
      {/* ── 5. Metas chips ── */}
      {goals.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,marginTop:8}}>
          <div style={{fontSize:11,color:C.text.s,letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Mis metas</div>
          <button onClick={()=>changeTab("metas")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:600,cursor:"pointer"}}>Ver todas →</button>
        </div>
        {goals.slice(0,3).map(g=><GoalChip key={g.id} goal={g} aportado={getAportado(g.id)} aportadoEsteMes={getAportadoMes(g.id,month,selectedYear)} txAll={tx} onClick={()=>changeTab("metas")}/>)}
      </>}
      {!txLoading&&monthTx.length===0&&month===now.getMonth()&&<div style={{textAlign:"center",padding:"40px 0",color:C.text.b,fontSize:14,lineHeight:2.2}}>
        Todo listo para empezar.<br/><span style={{fontSize:32}}>👆</span><br/>Toca <b style={{color:C.emerald}}>+</b> para registrar tu primer movimiento.
      </div>}
    </div>;
  };
  const MetasTab=()=>{
    const tot=goals.reduce((s,g)=>s+g.monto,0), ap=goals.reduce((s,g)=>s+getAportado(g.id),0);
    return <div style={{padding:`${SC.pad(16)}px ${SC.pad(20)}px 100px`}}>
      {goals.length>0&&<div style={{...cardSurface(),padding:"20px",marginBottom:16,borderRadius:20,border:`1px solid ${C.border}`,boxShadow:elev("card")}}>
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
          aportadoEsteMes={getAportadoMes(g.id,month,selectedYear)}
          txAll={tx}
          onEdit={()=>setGoalModal({
            ...g,
            _aportado:getAportado(g.id)-(g.saldoInicial||0),
            _aporteCount:tx.filter(t=>t.cat==="meta_aporte"&&t.goalId===g.id).length
          })}/>)}
      {goals.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:C.text.s,fontSize:14,lineHeight:2.4}}>
        <div style={{fontSize:44,marginBottom:10}}>⭐</div>
        Aún no tienes metas.<br/>¡Crea una y empieza a ahorrar<br/>para lo que siempre quisiste!<br/>
        <button onClick={()=>{if(!isPro&&goals.length>=3){setProGate({titulo:"Metas ilimitadas",descripcion:"Con el plan Free puedes tener hasta 3 metas activas.",features:[{icon:"🎯",label:"Metas ilimitadas",desc:"Crea tantas como quieras"},{icon:"📊",label:"Proyecciones de logro"}]});}else setGoalModal("new");}} style={{marginTop:18,padding:"12px 28px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.indigo},#4338ca)`,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>+ Crear mi primera meta</button>
      </div>}
      {goals.length>0&&<button onClick={()=>{if(!isPro&&goals.length>=3){setProGate({titulo:"Metas ilimitadas",descripcion:"Con el plan Free puedes tener hasta 3 metas activas.",features:[{icon:"🎯",label:"Metas ilimitadas",desc:"Crea tantas como quieras"},{icon:"📊",label:"Proyecciones de logro"}]});}else setGoalModal("new");}} style={{width:"100%",padding:16,borderRadius:16,border:`1px solid ${ink(0.08)}`,background:surface("glass"),boxShadow:elev("card"),color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:500,marginBottom:8}}>+ Nueva meta</button>}
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
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"overlayIn 0.22s ease forwards"}}>
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
        {val>0&&<div style={{marginBottom:16,padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
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
    // Siempre mostrar gráfica semanal del mes seleccionado
    const ly=month>currentM?currentY-1:currentY; // si seleccionó mes futuro imposible — igual lo manejamos
    const lm=month;
    const ultimoDia=new Date(ly,lm+1,0).getDate();
    const hoy=ly===currentY&&lm===currentM?now.getDate():ultimoDia;
    const totalG=tx.filter(t=>{
      const[ty,tm]=t.date.split("-").map(Number);
      return ty===ly&&(tm-1)===lm&&isGasto(t.cat)&&!isAporteMeta(t);
    }).reduce((s,t)=>s+t.amount,0);

    // Semana inicial: mes actual → semana de hoy, mes pasado → última semana
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
        const[ty,tm,td]=t.date.split("-").map(Number);
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
          <line x1={0} y1={H} x2={W} y2={H} stroke={ink(0.06)} strokeWidth={1}/>
          {diasData.map(({dia,gasto},i)=>{
            const x=gapUnit+(bW+gapUnit)*i;
            const h=Math.max(gasto/maxD*H,gasto>0?8:0);
            const esHoy=dia===hoy&&ly===currentY&&lm===currentM;
            const fechaDia=new Date(ly,lm,dia);
            const nombreDia=DIAS_S[fechaDia.getDay()];
            const barColor=esHoy?(gasto>0?C.red:C.emerald):gasto>0?C.red:ink(0.06);
            const barOpacity=esHoy?1:gasto>0?0.75:1;
            return <g key={dia}>
              {esHoy&&<rect x={x-3} y={4} width={bW+6} height={H-4} rx={6} fill={C.emerald} fillOpacity={0.05}/>}
              <rect x={x} y={H-Math.max(h,2)} width={bW} height={Math.max(h,2)}
                rx={Math.min(6,bW/2)} fill={barColor} fillOpacity={barOpacity}/>
              {gasto>0&&<text x={x+bW/2} y={H-h-7} textAnchor="middle" fontSize={9} fontWeight="700"
                fill={esHoy?C.emerald:C.red} fillOpacity={0.9} fontFamily="DM Sans,sans-serif">
                {abrevD(gasto)}</text>}
              <text x={x+bW/2} y={H+14} textAnchor="middle" fontSize={9}
                fill={esHoy?C.emerald:ink(0.45)} fontWeight={esHoy?"700":"500"} fontFamily="DM Sans,sans-serif">{nombreDia}</text>
              <text x={x+bW/2} y={H+25} textAnchor="middle" fontSize={8}
                fill={esHoy?C.emerald:ink(0.3)} fontWeight={esHoy?"700":"400"} fontFamily="DM Sans,sans-serif">{dia}</text>
              {esHoy&&<circle cx={x+bW/2} cy={H+33} r={2.5} fill={C.emerald}/>}
            </g>;
          })}
        </svg>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6,fontSize:10,color:C.text.s}}>
          {ly===currentY&&lm===currentM&&<>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.emerald,flexShrink:0}}/>
            <span style={{color:C.emerald,fontWeight:600}}>Hoy · {DIAS_S[new Date(ly,lm,hoy).getDay()]} {hoy}</span>
          </>}
        </div>
      </div>
    </div>;
  };

  // ── Resumen Anual ────────────────────────────────────────────────────────
  const ResumenAnualTab=()=>{
    const currentY=now.getFullYear();
    const [anio,setAnio]=useState(currentY);

    const aniosDisponibles=[...new Set(tx.map(t=>parseDateSafe(t.date).getFullYear()))].sort((a,b)=>b-a);
    if(!aniosDisponibles.includes(currentY)) aniosDisponibles.unshift(currentY);

    const datosMeses=MONTHS.map((_,m)=>{
      const mTx=tx.filter(t=>{const d=parseDateSafe(t.date);return d.getFullYear()===anio&&d.getMonth()===m;});
      const gastos=mTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
      const ingresos=mTx.filter(t=>isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0)+(getSalarioDelMes(anio,m)||0);
      const aportes=mTx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
      const tieneDatos=mTx.length>0;
      const esFuturo=anio===currentY&&m>now.getMonth();
      return{m,gastos,ingresos,aportes,tieneDatos,esFuturo};
    });

    const mesesConDatos=datosMeses.filter(d=>d.tieneDatos);
    const totalAnioGastos=mesesConDatos.reduce((s,d)=>s+d.gastos,0);
    const totalAnioIngresos=mesesConDatos.reduce((s,d)=>s+d.ingresos,0);
    const totalAnioAhorros=mesesConDatos.reduce((s,d)=>s+d.aportes,0);
    const mesesValidos=mesesConDatos.filter(d=>!d.esFuturo&&d.gastos>0);
    const mejorMes=mesesValidos.length?mesesValidos.reduce((a,b)=>a.gastos<b.gastos?a:b):null;
    const peorMes=mesesValidos.length?mesesValidos.reduce((a,b)=>a.gastos>b.gastos?a:b):null;
    const maxVal=Math.max(...datosMeses.map(d=>Math.max(d.gastos,d.ingresos)),1);

    // Gráfica con scroll horizontal — cada mes ocupa 52px, cómodo para dedo
    const COL=52, H=130, BW=18, SVG_W=COL*12, SVG_H=H+32;

    return <div style={{padding:`${SC.pad(16)}px ${SC.pad(20)}px 100px`}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <div style={{fontSize:11,color:C.text.s,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:2}}>Resumen anual</div>
          <div style={{fontSize:22,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>{anio}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setAnio(a=>a-1)} disabled={!aniosDisponibles.includes(anio-1)}
            style={{width:36,height:36,borderRadius:10,border:`1px solid ${C.border}`,background:C.card,
              color:aniosDisponibles.includes(anio-1)?C.text.h:C.text.s,
              cursor:aniosDisponibles.includes(anio-1)?"pointer":"default",
              fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <button onClick={()=>setAnio(a=>a+1)} disabled={anio>=currentY}
            style={{width:36,height:36,borderRadius:10,border:`1px solid ${C.border}`,background:C.card,
              color:anio<currentY?C.text.h:C.text.s,cursor:anio<currentY?"pointer":"default",
              fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>
      </div>

      {/* Totales */}
      {mesesConDatos.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
        {[
          {label:"Ingresos",val:totalAnioIngresos,color:C.emerald},
          {label:"Gastos",val:totalAnioGastos,color:C.red},
          {label:"En metas",val:totalAnioAhorros,color:C.indigo},
        ].map(item=><div key={item.label} style={{background:C.card,borderRadius:16,padding:"14px 12px",boxShadow:elev("card")}}>
          <div style={{fontSize:9,color:item.color,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{item.label}</div>
          <div style={{fontSize:14,fontWeight:800,color:item.color,letterSpacing:-0.3}}>
            {item.val>=1000000?`$${(item.val/1000000).toFixed(1)}M`:item.val>=1000?`$${Math.round(item.val/1000)}k`:`$${item.val}`}
          </div>
        </div>)}
      </div>}

      {/* Gráfica scrollable */}
      <div style={{background:C.card,borderRadius:20,paddingTop:18,paddingBottom:0,boxShadow:elev("card"),marginBottom:16,overflow:"hidden"}}>
        {/* Leyenda */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingLeft:16,paddingRight:16,marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text.s,letterSpacing:1,textTransform:"uppercase"}}>Gastos vs ingresos</div>
          <div style={{display:"flex",gap:14,fontSize:11,color:C.text.s}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:10,height:10,borderRadius:3,background:C.emerald,display:"inline-block",opacity:0.8}}/>Ingresos
            </span>
            <span style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:10,height:10,borderRadius:3,background:C.red,display:"inline-block"}}/>Gastos
            </span>
          </div>
        </div>
        {/* Área scrollable */}
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:14}}>
          <svg width={SVG_W} height={SVG_H} style={{display:"block",minWidth:SVG_W}}>
            {/* Línea base */}
            <line x1={0} y1={H} x2={SVG_W} y2={H} stroke={ink(0.06)} strokeWidth={1}/>
            {datosMeses.map((d,i)=>{
              const x=i*COL+COL/2;
              const hI=d.ingresos>0?Math.max(d.ingresos/maxVal*H,5):0;
              const hG=d.gastos>0?Math.max(d.gastos/maxVal*H,5):0;
              const esActual=anio===currentY&&d.m===now.getMonth();
              const esMejor=mejorMes?.m===d.m;
              const esPeor=peorMes?.m===d.m&&mejorMes?.m!==d.m;
              const tocable=d.tieneDatos&&!d.esFuturo;
              return <g key={d.m} onClick={tocable?()=>{setMonth(d.m);changeTab("anal");}:undefined}
                style={{cursor:tocable?"pointer":"default"}}>
                {/* Fondo columna activa */}
                {esActual&&<rect x={i*COL+4} y={4} width={COL-8} height={H-4} rx={8}
                  fill={C.emerald} fillOpacity={0.06}/>}
                {/* Badges mejor/peor */}
                {esMejor&&<text x={x} y={H-hG-14} textAnchor="middle" fontSize={13} fill={C.emerald}>★</text>}
                {esPeor&&<text x={x} y={H-hG-14} textAnchor="middle" fontSize={11} fill={C.red} fontWeight="700">▲</text>}
                {/* Barra ingresos */}
                <rect x={x-BW-1} y={H-hI} width={BW} height={hI} rx={4}
                  fill={C.emerald} fillOpacity={d.esFuturo?0.1:d.tieneDatos?0.6:0.07}/>
                {/* Barra gastos */}
                <rect x={x+1} y={H-hG} width={BW} height={hG} rx={4}
                  fill={C.red} fillOpacity={d.esFuturo?0.1:d.tieneDatos?0.85:0.07}/>
                {/* Label mes */}
                <text x={x} y={H+20} textAnchor="middle" fontSize={11}
                  fill={esActual?C.emerald:d.tieneDatos?ink(0.65):ink(0.2)}
                  fontWeight={esActual?"800":d.tieneDatos?"600":"400"}
                  fontFamily="DM Sans,sans-serif">
                  {MONTHS_S[d.m]}
                </text>
              </g>;
            })}
          </svg>
        </div>
        {/* Hint pegado a la gráfica */}
        <div style={{textAlign:"center",padding:"10px 0 14px",borderTop:`1px solid ${ink(0.05)}`}}>
          <span style={{fontSize:12,color:C.text.b,fontWeight:600}}>👆 Toca un mes con datos para ver su análisis</span>
        </div>
      </div>

      {/* Mejor y peor mes */}
      {(mejorMes||peorMes)&&mesesValidos.length>1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {mejorMes&&<div style={{background:`${C.emerald}10`,border:`1px solid ${C.emerald}25`,borderRadius:16,padding:"14px"}}>
          <div style={{fontSize:10,color:C.emerald,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>★ Mejor mes</div>
          <div style={{fontSize:15,fontWeight:800,color:C.text.h,marginBottom:2}}>{MONTHS[mejorMes.m]}</div>
          <div style={{fontSize:13,color:C.emerald,fontWeight:700}}>{COP(mejorMes.gastos)}</div>
          <div style={{fontSize:10,color:C.text.s,marginTop:2}}>en gastos</div>
        </div>}
        {peorMes&&<div style={{background:`${C.red}10`,border:`1px solid ${C.red}25`,borderRadius:16,padding:"14px"}}>
          <div style={{fontSize:10,color:C.red,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>▲ Mes más caro</div>
          <div style={{fontSize:15,fontWeight:800,color:C.text.h,marginBottom:2}}>{MONTHS[peorMes.m]}</div>
          <div style={{fontSize:13,color:C.red,fontWeight:700}}>{COP(peorMes.gastos)}</div>
          <div style={{fontSize:10,color:C.text.s,marginTop:2}}>en gastos</div>
        </div>}
      </div>}

      {/* Detalle por mes — solo meses con datos */}
      {mesesConDatos.length>0&&<div style={{background:C.card,borderRadius:20,padding:"4px 0",boxShadow:elev("card"),marginBottom:16}}>
        <div style={{padding:"14px 16px 10px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text.s,letterSpacing:1,textTransform:"uppercase"}}>Detalle por mes</div>
        </div>
        {datosMeses.filter(d=>d.tieneDatos&&!d.esFuturo).map((d,i,arr)=>{
          const pct=d.ingresos>0?d.gastos/d.ingresos:0;
          const col=pct>=1?C.red:pct>=0.8?C.amber:C.emerald;
          return <div key={d.m} onClick={()=>{setMonth(d.m);changeTab("anal");}}
            style={{padding:"12px 16px",borderBottom:i<arr.length-1?`1px solid ${ink(0.04)}`:"none",
              cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,flexShrink:0,
              background:mejorMes?.m===d.m?`${C.emerald}18`:peorMes?.m===d.m?`${C.red}18`:`${C.surface}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:12,fontWeight:800,color:mejorMes?.m===d.m?C.emerald:peorMes?.m===d.m?C.red:C.text.s}}>
              {MONTHS_S[d.m]}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                <span style={{fontSize:14,fontWeight:700,color:C.text.h}}>{COP(d.gastos)}</span>
                <span style={{fontSize:12,fontWeight:600,color:col}}>{Math.round(pct*100)}% del ingreso</span>
              </div>
              <div style={{background:ink(0.05),borderRadius:99,height:4,overflow:"hidden"}}>
                <div style={{height:4,borderRadius:99,background:col,width:`${Math.min(pct*100,100)}%`,transition:"width 0.6s"}}/>
              </div>
            </div>
            <div style={{fontSize:14,color:C.text.s,flexShrink:0}}>›</div>
          </div>;
        })}
      </div>}

      {mesesConDatos.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:C.text.s}}>
        <div style={{fontSize:40,marginBottom:12}}>📅</div>
        <div style={{fontSize:15,fontWeight:700,color:C.text.h,marginBottom:6}}>Sin datos para {anio}</div>
        <div style={{fontSize:13,lineHeight:1.6}}>Aún no hay movimientos registrados en este año.</div>
      </div>}
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
    const [esVariable,setEsVariable]=useState(initial?.esVariable||false);
    const [conf,setConf]=useState(false);
    const [showSugP,setShowSugP]=useState(false);
    const ref=useRef(null);
    const sheet=useSheetDismiss(onClose);
    useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
    const raw=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
    function hm(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
    function save(){
      if(!nombre.trim()) return;
      if(!esVariable&&!raw) return; // monto requerido solo si no es variable
      onSave({
        id:initial?.id||null,nombre:nombre.trim(),
        monto:esVariable?0:raw,
        esVariable,cat,dia,frecuencia,
        mesUnico:initial?.mesUnico??(mesInicial??now.getMonth()),
        anioUnico:initial?.anioUnico??(anioInicial??now.getFullYear()),
      });
      onClose();
    }
    // ── Sugerencias para nombre de pago ────────────────────────────────────────
    // Fuente 1: pagos programados ya existentes (excluye el que se está editando)
    // Fuente 2: transacciones históricas (mismo nombre/desc)
    const sugerenciasPago=useMemo(()=>{
      if(!nombre.trim()||nombre.length<2||isEdit) return [];
      const q=nombre.toLowerCase().trim();
      const vistos=new Map();
      // Pagos programados existentes
      pagos.filter(p=>p.nombre&&p.id!==initial?.id&&p.nombre.toLowerCase().includes(q))
        .forEach(p=>{
          const key=`${p.nombre}|${p.cat}`;
          if(!vistos.has(key)) vistos.set(key,{nombre:p.nombre,cat:p.cat,monto:p.monto,count:2,fuente:"pago"});
          else vistos.get(key).count+=2;
        });
      // Transacciones históricas
      tx.filter(t=>t.desc&&t.cat&&t.desc.toLowerCase().includes(q))
        .forEach(t=>{
          const key=`${t.desc}|${t.cat}`;
          if(!vistos.has(key)) vistos.set(key,{nombre:t.desc,cat:t.cat,monto:t.amount,count:1,fuente:"tx"});
          else vistos.get(key).count++;
        });
      return [...vistos.values()].sort((a,b)=>b.count-a.count).slice(0,4);
    },[nombre,isEdit]);
    function aplicarSugP(sug){
      setNombre(sug.nombre);
      setCat(sug.cat);
      if(sug.monto>0) setMonto(Number(sug.monto).toLocaleString("es-CO"));
      setShowSugP(false);
    }
    const ci=getCatInfo(cat);
    return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      ref={sheet.overlayRef} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:300,...sheet.overlayProps.style}}>
      <div {...sheet.dragProps} ref={sheet.cardRef} style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto",overscrollBehavior:"contain",scrollBehavior:"auto",position:"relative",...sheet.cardStyle}}>
        <SheetCloseBtn onClose={onClose}/>
        <div {...sheet.handleProps} style={{...sheet.handleProps.style,display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
        <div style={{padding:"0 20px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,paddingRight:40}}>
            <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>{isEdit?"Editar pago":"Nuevo pago programado"}</div>
          </div>
          <Lbl>Nombre del pago</Lbl>
          <div style={{position:"relative",marginBottom:14}}>
            <input ref={ref} placeholder="ej: Arriendo, Gym, Netflix, Seguro..." value={nombre}
              onChange={e=>{setNombre(e.target.value);setShowSugP(true);}}
              onFocus={()=>setShowSugP(true)}
              onBlur={()=>setTimeout(()=>setShowSugP(false),150)}
              style={{width:"100%",background:C.surface,border:`1px solid ${showSugP&&sugerenciasPago.length>0?C.sky+"55":C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
            {showSugP&&sugerenciasPago.length>0&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:C.card,border:`1px solid ${C.sky}44`,borderRadius:12,overflow:"hidden",zIndex:10,boxShadow:elev("raised")}}>
                {sugerenciasPago.map((sug,i)=>{
                  const ci2=getCatInfo(sug.cat);
                  return <button key={i} onMouseDown={e=>e.preventDefault()} onClick={()=>aplicarSugP(sug)}
                    style={{width:"100%",padding:"11px 14px",background:"none",border:"none",borderBottom:i<sugerenciasPago.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18,flexShrink:0}}>{ci2.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text.h,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sug.nombre}</div>
                      <div style={{fontSize:11,color:C.text.s,marginTop:1}}>{ci2.label}{sug.monto>0?` · ${COP(sug.monto)}`:""}</div>
                    </div>
                    <span style={{fontSize:10,color:C.sky,fontWeight:700,flexShrink:0}}>↵ usar</span>
                  </button>;
                })}
              </div>
            )}
          </div>
          <Lbl>Monto (COP)</Lbl>
          {/* Toggle fijo / variable */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {[{id:false,label:"$ Fijo"},{id:true,label:"🔔 Variable"}].map(o=>(
              <button key={String(o.id)} onClick={()=>setEsVariable(o.id)}
                style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                  background:esVariable===o.id?`${C.sky}22`:C.surface,
                  outline:esVariable===o.id?`2px solid ${C.sky}`:"2px solid transparent",
                  color:esVariable===o.id?C.sky:C.text.s,transition:"all 0.15s"}}>
                {o.label}
              </button>
            ))}
          </div>
          {esVariable
            ?<div style={{padding:"12px 14px",borderRadius:12,marginBottom:14,
                background:`${C.sky}10`,border:`1px solid ${C.sky}30`,
                fontSize:12,color:C.text.b,lineHeight:1.6}}>
              🔔 El monto varía cada mes (ej: servicios públicos, agua, gas).<br/>
              Al confirmar el pago podrás ingresar el monto real.
            </div>
            :<div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${raw>0?C.sky:C.border}`,marginBottom:14}}>
              <span style={{padding:"0 14px",fontSize:20,lineHeight:"56px"}}>{ci.icon}</span>
              <span style={{color:C.text.s,fontSize:16,lineHeight:"56px"}}>$</span>
              <input inputMode="numeric" placeholder="0" value={monto} onChange={hm}
                style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 10px",height:56}}/>
            </div>
          }
          <Lbl>Categoría</Lbl>
          <div style={{marginBottom:14}}><CatSelector value={cat} onChange={setCat} subsCustom={catsCustom}/></div>
          <Lbl>Día del mes en que se paga</Lbl>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {Array.from({length:28},(_,i)=>i+1).map(d=>(
              <button key={d} onClick={()=>setDia(d)}
                style={{width:40,height:40,borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                  background:dia===d?C.sky:C.surface,
                  color:dia===d?"#fff":C.text.b,transition:"all 0.1s"}}>
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
            <button onClick={save} style={{flex:1,padding:16,borderRadius:14,border:"none",
              cursor:(!nombre.trim()||(!esVariable&&!raw))?"not-allowed":"pointer",fontSize:15,fontWeight:800,
              background:(!nombre.trim()||(!esVariable&&!raw))?C.surface:`linear-gradient(135deg,${C.sky},#0284c7)`,
              color:(!nombre.trim()||(!esVariable&&!raw))?C.text.s:"#fff"}}>
              {!nombre.trim()?"Escribe el nombre":(!esVariable&&!raw)?"Ingresa el monto":isEdit?"✓ Guardar":"+ Agregar pago"}
            </button>
          </div>
        </div>
      </div>
    </div>;
  }

  const AnalisisTab=()=>{
    const prevMonth2 = month === 0 ? 11 : month - 1;
    const prevYear2  = month === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevTx2    = tx.filter(t => isMonth(t.date, prevMonth2, prevYear2));
    const prevGasto2 = prevTx2.filter(t => isGasto(t.cat) && !isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
    const prevIng2   = prevTx2.filter(t => isIngreso(t.cat)).reduce((s,t)=>s+t.amount,0) + (getSalarioDelMes(prevYear2,prevMonth2)||sal);
    const prevAhorr2 = prevTx2.filter(t => isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);

    function DiffChip({curr,prev}){
      if(!prev||!curr) return null;
      const diff=Math.round((curr-prev)/prev*100);
      if(Math.abs(diff)<2) return null;
      const sube=diff>0;
      return <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:99,
        background:sube?`${C.red}15`:`${C.emerald}15`,
        color:sube?C.red:C.emerald,marginLeft:6}}>
        {sube?"↑":"↓"}{Math.abs(diff)}%
      </span>;
    }

    return <div style={{padding:"16px 20px 100px",opacity:monthChanging?0:1,transition:"opacity 0.15s ease"}}>
      <MonthSelector/>
      {txLoading ? null : <>
      {monthTx.length===0
        ? <div style={{
            ...cardSurface(),
            borderRadius:20,padding:"32px 20px",marginBottom:20,
            border:`1px solid ${C.border}`,
            textAlign:"center",
            boxShadow:elev("card"),
            animation:"fadeIn 0.3s ease",
          }}>
            <div style={{fontSize:40,marginBottom:12}}>📊</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text.h,marginBottom:8}}>
              Sin actividad en {MONTHS[month]}
            </div>
            <div style={{fontSize:13,color:C.text.b,lineHeight:1.7,marginBottom:20}}>
              {month===now.getMonth()&&selectedYear===now.getFullYear()
                ? "Registra un movimiento y el análisis aparece solo."
                : "Sin movimientos en este período."}
            </div>
            {month===now.getMonth()&&selectedYear===now.getFullYear()&&(
              <button onClick={()=>setModal("new")} style={{
                padding:"13px 28px",borderRadius:14,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${C.indigo},#4338ca)`,
                color:"#fff",fontSize:14,fontWeight:800,
              }}>+ Registrar movimiento</button>
            )}
          </div>
        : <GraficaMeses/>
      }
      <Card style={{marginBottom:14}}>
        <Lbl>Resumen del mes</Lbl>
        {[
          {l:"Ingresos del mes",    v:totalIngresoMes, c:C.emerald, prev:prevIng2},
          ...(saldoAnterior>0?[{l:"+ Sobrante meses ant.",v:saldoAnterior,c:C.emerald}]:[]),
          {l:"Gastos",             v:totalGasto,       c:C.red,    prev:prevGasto2},
          {l:"Ahorros",            v:totalAportes,     c:C.indigo, prev:prevAhorr2},
          {l:"Disponible",         v:saldo,            c:saldoColor},
        ].map(k=>(
          <div key={k.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text.h}}>{k.l}</span>
            <div style={{display:"flex",alignItems:"center"}}>
              {k.prev!=null&&<DiffChip curr={k.v} prev={k.prev}/>}
              <span style={{fontSize:14,fontWeight:800,color:k.c,marginLeft:6}}>{COP(k.v)}</span>
            </div>
          </div>
        ))}
        {prevGasto2>0&&<div style={{fontSize:10,color:C.text.s,marginTop:8,opacity:0.7}}>
          vs {MONTHS[prevMonth2]} — comparativa proporcional al período
        </div>}
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
      {/* ── Patrimonio neto ── */}
      <PatrimonioWidget
        patrimonio={patrimonio}
        deudasApp={deudas.filter(d=>!d.liquidada).reduce((s,d)=>s+(d.saldoRestante||0),0)}
        onSave={handlePatrimonioSave}
        C={C} COP={COP}/>
      {byMain.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18,marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>Gastos por categoría</Lbl>
          <span style={{fontSize:11,color:C.text.b,fontWeight:600}}>Toca para ver movimientos</span>
        </div>
        {(()=>{
          // Estado local para expandir tendencia por cat
          const [expandedCat,setExpandedCat]=useState(null);

          // Pre-calcular últimos 4 meses para tendencia
          const currentM2=now.getMonth(), currentY2=now.getFullYear();
          const ultimos4=[];
          for(let i=3;i>=0;i--){
            let m2=currentM2-i, y2=currentY2;
            if(m2<0){m2+=12;y2--;}
            ultimos4.push({m:m2,y:y2});
          }

          return byMain.map(c=>{
            const limite=presupuestos[c.id]||0;
            const pctPres=limite>0?Math.min(c.total/limite,1):0;
            const sobrePres=limite>0&&c.total>limite;
            const cercaPres=limite>0&&pctPres>=0.8&&!sobrePres;
            const isExpanded=expandedCat===c.id;

            // Datos de tendencia — gasto por mes en esta cat
            const tendencia=ultimos4.map(({m:m2,y:y2})=>{
              const gasto=tx.filter(t=>{
                const[ty,tm]=t.date.split("-").map(Number);
                return ty===y2&&(tm-1)===m2&&c.subs.some(s=>s.id===t.cat)&&isGasto(t.cat)&&!isAporteMeta(t);
              }).reduce((s,t)=>s+t.amount,0);
              return{m:m2,y:y2,gasto};
            });
            const maxT=Math.max(...tendencia.map(d=>d.gasto),1);
            const mesActualT=tendencia[tendencia.length-1];
            const mesAnteriorT=tendencia[tendencia.length-2];
            const diffT=mesAnteriorT?.gasto>0?Math.round((mesActualT.gasto-mesAnteriorT.gasto)/mesAnteriorT.gasto*100):null;

            return <div key={c.id} style={{...cardSurface(c.color),boxShadow:cardShadow(c.color),marginBottom:14,borderRadius:20,border:`1px solid ${sobrePres?C.red+"44":cercaPres?C.amber+"33":"transparent"}`,overflow:"hidden"}}>
              {/* Fila principal */}
              <div
                onClick={()=>{setFiltroMainCat(c.id);setFiltroMainCatOrigen("analisis");changeTab("mov");}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.985)"}
                onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                style={{padding:"18px 18px 16px",cursor:"pointer",transition:"transform 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:44,height:44,borderRadius:14,flexShrink:0,background:`${c.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{c.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8}}>
                      <span style={{fontSize:14,fontWeight:600,color:C.text.h}}>{c.label}</span>
                      <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:6}}>
                        {diffT!==null&&Math.abs(diffT)>=5&&<span style={{fontSize:10,fontWeight:700,padding:"2px 5px",borderRadius:99,
                          background:diffT>0?`${C.red}15`:`${C.emerald}15`,
                          color:diffT>0?C.red:C.emerald}}>
                          {diffT>0?"↑":"↓"}{Math.abs(diffT)}%
                        </span>}
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
              </div>
              {/* Botón tendencia */}
              {tendencia.some(d=>d.gasto>0)&&<button
                onClick={e=>{e.stopPropagation();setExpandedCat(isExpanded?null:c.id);}}
                style={{width:"100%",padding:"8px 18px",background:ink(0.03),border:"none",
                  borderTop:`1px solid ${ink(0.04)}`,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                  fontSize:11,color:C.text.s,fontWeight:600,transition:"background 0.15s"}}>
                {isExpanded?"▲ Ocultar tendencia":"📈 Ver tendencia 4 meses"}
              </button>}
              {/* Mini gráfica tendencia */}
              {isExpanded&&<div style={{padding:"14px 18px 16px",borderTop:`1px solid ${ink(0.04)}`}}>
                <div style={{display:"flex",alignItems:"flex-end",gap:6,height:56,marginBottom:8}}>
                  {tendencia.map(({m:m2,gasto},i)=>{
                    const pct=gasto/maxT;
                    const esMesActual=i===tendencia.length-1;
                    const col=esMesActual?c.color:ink(0.2);
                    return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                      {gasto>0&&<div style={{fontSize:8,fontWeight:700,color:esMesActual?c.color:C.text.s}}>
                        {gasto>=1000000?`$${(gasto/1000000).toFixed(1)}M`:gasto>=1000?`${Math.round(gasto/1000)}k`:`$${gasto}`}
                      </div>}
                      <div style={{width:"100%",borderRadius:"4px 4px 0 0",background:col,
                        height:`${Math.max(pct*40,gasto>0?4:1)}px`,opacity:esMesActual?0.9:0.4,
                        transition:"height 0.4s ease"}
                      }/>
                      <div style={{fontSize:9,color:esMesActual?C.text.h:C.text.s,fontWeight:esMesActual?700:400}}>
                        {MONTHS_S[m2]}
                      </div>
                    </div>;
                  })}
                </div>
                <div style={{fontSize:10,color:C.text.s,textAlign:"center",opacity:0.7}}>
                  {diffT===null?"Sin datos del mes anterior":
                    diffT===0?"Igual que el mes pasado":
                    diffT>0?`${Math.abs(diffT)}% más que ${MONTHS_S[mesAnteriorT.m]}`:
                    `${Math.abs(diffT)}% menos que ${MONTHS_S[mesAnteriorT.m]} 🎉`}
                </div>
              </div>}
            </div>;
          });
        })()}
      </>}
      {/* ── Proyección de flujo de caja ── */}
      {sal>0&&(()=>{
        const currentM2=now.getMonth(), currentY2=now.getFullYear();
        // Solo mostrar si estamos en el mes actual
        if(month!==currentM2) return null;

        // Construir próximos 4 meses (incluyendo el actual)
        const mesesProyectados=[];
        for(let i=0;i<4;i++){
          let m2=currentM2+i, y2=currentY2;
          if(m2>11){m2-=12;y2++;}
          mesesProyectados.push({m:m2,y:y2,esMesActual:i===0});
        }

        // Saldo de arranque = saldo actual del mes
        let saldoAcum=saldo;

        const filas=mesesProyectados.map(({m:m2,y:y2,esMesActual})=>{
          const salMes=getSalarioDelMes(y2,m2)||sal;

          // Pagos programados que aplican a este mes
          const pagosMes2=pagos.filter(p=>{
            if(!p.activo) return false;
            if(p.frecuencia==="mensual"){
              const mesI=p.mesInicio??0;
              const anioI=p.anioInicio??2000;
              return (y2*12+m2)>=(anioI*12+mesI);
            }
            if(p.frecuencia==="unico") return (p.mesUnico??0)===m2&&(p.anioUnico??currentY2)===y2;
            return false;
          });
          const totalPagosProg=pagosMes2.reduce((s,p)=>s+(p.monto||0),0);

          // Cuotas de deudas activas
          const totalDeudas=deudas.filter(d=>!d.liquidada).reduce((s,d)=>s+(d.cuotaMensual||0),0);

          // Si es mes actual: usar gasto real registrado, si es futuro: estimar con pagos
          const gastoEstimado=esMesActual?totalGasto:totalPagosProg+totalDeudas;

          // Saldo proyectado al cierre
          const saldoCierre=esMesActual
            ? saldo  // ya calculado en tiempo real
            : saldoAcum+salMes-gastoEstimado;

          if(!esMesActual) saldoAcum=Math.max(saldoCierre,0);

          const enRojo=saldoCierre<0;
          const enAmbar=saldoCierre>=0&&saldoCierre/salMes<0.1;

          return{m:m2,y:y2,salMes,gastoEstimado,totalPagosProg,totalDeudas,saldoCierre,enRojo,enAmbar,esMesActual,pagosMes2};
        });

        return <div style={{marginTop:24,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,color:C.text.s,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>
              📅 Proyección próximos meses
            </div>
            <span style={{fontSize:10,color:C.text.s,opacity:0.6}}>Estimado</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filas.map(({m:m2,y:y2,salMes,gastoEstimado,totalPagosProg,totalDeudas,saldoCierre,enRojo,enAmbar,esMesActual,pagosMes2})=>{
              const col=enRojo?C.red:enAmbar?C.amber:C.emerald;
              return <div key={`${y2}-${m2}`} style={{
                borderRadius:18,padding:"14px 16px",
                background:`${col}08`,border:`1px solid ${col}28`,
                animation:"fadeIn 0.3s ease",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:C.text.h}}>
                      {MONTHS[m2]}{y2!==currentY2?` ${y2}`:""}
                      {esMesActual&&<span style={{fontSize:10,color:C.text.s,fontWeight:500,marginLeft:6}}>en curso</span>}
                    </div>
                    <div style={{fontSize:11,color:C.text.s,marginTop:2}}>
                      Ingreso: {COP(salMes)}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:C.text.s,marginBottom:2}}>
                      {esMesActual?"Disponible actual":"Saldo proyectado"}
                    </div>
                    <div style={{fontSize:20,fontWeight:900,color:col,letterSpacing:-0.5}}>
                      {enRojo?"-":""}{COP(Math.abs(saldoCierre))}
                    </div>
                  </div>
                </div>
                {/* Desglose */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {!esMesActual&&totalPagosProg>0&&<div style={{
                    fontSize:10,padding:"3px 8px",borderRadius:99,
                    background:ink(0.06),color:C.text.s,fontWeight:600,
                  }}>📅 {COP(totalPagosProg)} pagos prog.</div>}
                  {!esMesActual&&totalDeudas>0&&<div style={{
                    fontSize:10,padding:"3px 8px",borderRadius:99,
                    background:`${C.red}12`,color:C.red,fontWeight:600,
                  }}>💳 {COP(totalDeudas)} deudas</div>}
                  {esMesActual&&<div style={{
                    fontSize:10,padding:"3px 8px",borderRadius:99,
                    background:ink(0.06),color:C.text.s,fontWeight:600,
                  }}>💸 {COP(totalGasto)} gastado</div>}
                  {enRojo&&<div style={{
                    fontSize:10,padding:"3px 8px",borderRadius:99,
                    background:`${C.red}12`,color:C.red,fontWeight:700,
                  }}>⚠ No alcanza</div>}
                </div>
              </div>;
            })}
          </div>
          <div style={{fontSize:10,color:C.text.s,textAlign:"center",marginTop:8,opacity:0.6,lineHeight:1.6}}>
            Proyección basada en tu salario, pagos programados y cuotas de deudas.{"\n"}Los meses futuros no incluyen gastos variables.
          </div>
        </div>;
      })()}
      </>}
    </div>;
  };

  const MovTab=()=>{
    const [busqueda,setBusqueda]=useState("");
    const [filtroCat,setFiltroCat]=useState("todos"); // todos | gasto | ingreso | meta | deuda

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
      if(filtroCat==="gasto")   base=base.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)&&!t.deudaId);
      if(filtroCat==="ingreso") base=base.filter(t=>isIngreso(t.cat)||isIngresoExtra(t.cat)||isDevolucion(t.cat));
      if(filtroCat==="meta")    base=base.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat));
      if(filtroCat==="deuda")   base=base.filter(t=>!!t.deudaId);
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
    return <div style={{padding:"16px 20px 100px",opacity:monthChanging?0:1,transition:"opacity 0.15s ease"}}>
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
        <div style={{display:"flex",alignItems:"center",background:surface("glass"),borderRadius:14,border:`1px solid ${busqueda?C.indigo+"44":ink(0.08)}`,padding:"0 14px",gap:10,transition:"border-color 0.2s",marginBottom:10,boxShadow:elev("card")}}>
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
            {id:"deuda",   label:"💳 Deudas"},
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
      {sorted.length===0&&(
        hayFiltro
          ? <div style={{textAlign:"center",padding:"36px 0",color:C.text.b,animation:"fadeIn 0.3s ease"}}>
              <div style={{fontSize:36,marginBottom:10}}>🔍</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text.h,marginBottom:6}}>Sin resultados</div>
              <div style={{fontSize:13,color:C.text.s,lineHeight:1.6}}>Intenta con otra palabra o categoría.</div>
            </div>
          : <div style={{
              ...cardSurface(),
              borderRadius:20,padding:"32px 20px",
              border:`1px solid ${C.border}`,
              boxShadow:elev("card"),
              textAlign:"center",marginTop:8,
              animation:"fadeIn 0.3s ease",
            }}>
              <div style={{fontSize:40,marginBottom:12}}>📭</div>
              <div style={{fontSize:16,fontWeight:800,color:C.text.h,marginBottom:8}}>
                Sin movimientos en {MONTHS[month]}
              </div>
              <div style={{fontSize:13,color:C.text.b,lineHeight:1.7,marginBottom:20}}>
                {month===now.getMonth()&&selectedYear===now.getFullYear()
                  ? "Aún no hay registros este mes."
                  : "Sin registros. Cambia el mes arriba."}
              </div>
              {month===now.getMonth()&&selectedYear===now.getFullYear()&&(
                <button onClick={()=>setModal("new")} style={{
                  padding:"13px 28px",borderRadius:14,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${C.indigo},#4338ca)`,
                  color:"#fff",fontSize:14,fontWeight:800,
                }}>+ Añadir movimiento</button>
              )}
            </div>
      )}
      {(()=>{
        // Agrupar por día
        const grupos={};
        sorted.forEach(t=>{
          const dia=t.date?.slice(0,10)||"";
          if(!grupos[dia]) grupos[dia]=[];
          grupos[dia].push(t);
        });
        const diasOrdenados=Object.keys(grupos).sort((a,b)=>parseDateSafe(b)-parseDateSafe(a));
        const hoyStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
        const ayerDate=new Date(now); ayerDate.setDate(now.getDate()-1);
        const ayerStr=`${ayerDate.getFullYear()}-${String(ayerDate.getMonth()+1).padStart(2,"0")}-${String(ayerDate.getDate()).padStart(2,"0")}`;
        return diasOrdenados.map(dia=>{
          const txsDia=grupos[dia];
          // Label del día
          const d=parseDateSafe(dia);
          const dNum=d.getDate();
          const mesLabel=MONTHS[d.getMonth()];
          const labelDia=dia===hoyStr?"Hoy":dia===ayerStr?"Ayer":`${dNum} de ${mesLabel}`;
          return <div key={dia} style={{marginBottom:4}}>
            {/* Header del día */}
            <div style={{
              padding:"10px 0 6px",
              borderBottom:`1px solid ${ink(0.07)}`,
              marginBottom:2,
            }}>
              <span style={{fontSize:12,fontWeight:700,color:C.text.s,letterSpacing:0.3}}>
                {labelDia}
              </span>
            </div>
            {txsDia.map(t=><TxRow key={t.id} t={t} onEdit={()=>setModal(t)} catsCustom={catsCustom}/>)}
          </div>;
        });
      })()}
    </div>;
  };

  // ── Pestaña Calendario + Pagos Programados ───────────────────────────────
  const CalendarioTab=()=>{
    const currentM=now.getMonth(), currentY=now.getFullYear();
    // calMes/calAnio viven en App() para que PagoModal pueda leerlos al crear pagos
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
      if(p.frecuencia==="mensual"){
        // Solo mostrar desde el mes en que fue creado
        const mesI=p.mesInicio??0; // si no tiene mesInicio, era antes del fix → mostrar siempre
        const anioI=p.anioInicio??2000;
        const calKey=calAnio*12+calMes;
        const inicioKey=anioI*12+mesI;
        return calKey>=inicioKey;
      }
      if(p.frecuencia==="unico"){
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

    return <div style={{padding:"16px 20px 100px"}}>
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
      <div style={{background:C.surface,borderRadius:18,padding:"14px 12px",border:`1px solid ${C.border}`,marginBottom:14}}>
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
          {!esPasado(diaSelec)&&<button onClick={()=>{
              if(!isPro&&pagos.filter(p=>p.activo).length>=3){
                setProGate({titulo:"Pagos programados ilimitados",descripcion:"Plan Free: hasta 3 pagos. Pro: ilimitados.",features:[{icon:"📅",label:"Pagos ilimitados"},{icon:"🔔",label:"Recordatorios"},{icon:"✅",label:"Historial completo"}]});
                return;
              }
              setPagoModalDia(diaSelec);setPagoModal("new");
            }}
            style={{background:`${C.sky}18`,border:`1px solid ${C.sky}44`,borderRadius:8,padding:"5px 12px",color:C.sky,cursor:"pointer",fontSize:11,fontWeight:700}}>
            + Pago programado{!isPro&&pagos.filter(p=>p.activo).length>=3?" ⚡":""}
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
              <div style={{fontSize:14,fontWeight:800,color:confirmado?C.emerald:C.sky}}>
                {p.esVariable?"$?":COP(p.monto)}
              </div>
              {p.esVariable&&!confirmado&&<div style={{fontSize:9,color:C.sky,fontWeight:600,marginTop:1}}>Variable</div>}
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
              background:venceHoy&&!confirmado?`${C.amber}10`:C.surface,
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
      <button onClick={()=>{
          if(!isPro&&pagos.filter(p=>p.activo).length>=3){
            setProGate({titulo:"Pagos programados ilimitados",descripcion:"Con el plan Free puedes tener hasta 3 pagos programados. Activa Pro para agregar más.",features:[{icon:"📅",label:"Pagos ilimitados"},{icon:"🔔",label:"Recordatorios automáticos"},{icon:"✅",label:"Historial completo"}]});
            return;
          }
          setPagoModal("new");
        }}
        style={{width:"100%",padding:14,borderRadius:14,border:`1px dashed ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:8}}>
        + Nuevo pago programado{!isPro&&pagos.filter(p=>p.activo).length>=3?" ⚡":""}
      </button>
      {/* Modal ¿Pagaste? */}
      {confirmPago&&(()=>{
        const [montoVar,setMontoVar]=useState(confirmPago.esVariable?"":"");
        const rawVar=parseFloat((montoVar||"").replace(/\./g,"").replace(",","."))||0;
        const montoFinal=confirmPago.esVariable?rawVar:confirmPago.monto;
        const puedeConfirmar=confirmPago.esVariable?rawVar>0:true;
        return <div onClick={()=>setConfirmPago(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"overlayIn 0.22s ease forwards"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:"100%",maxWidth:430,margin:"0 auto",background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,padding:"20px 20px 36px",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",position:"relative"}}>
            <SheetCloseBtn onClose={()=>setConfirmPago(null)}/>
            <div style={{display:"flex",justifyContent:"center",marginBottom:16,padding:"4px 0 8px"}}>
              <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
            </div>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:36,marginBottom:10}}>{getCatInfo(confirmPago.cat).icon}</div>
              <div style={{fontSize:17,fontWeight:900,color:C.text.h,marginBottom:6}}>{confirmPago.nombre}</div>
              {confirmPago.esVariable
                ?<div style={{fontSize:13,color:C.text.b,marginBottom:4}}>Monto variable — ¿cuánto pagaste?</div>
                :<div style={{fontSize:26,fontWeight:900,color:C.sky,letterSpacing:-1}}>{COP(confirmPago.monto)}</div>
              }
              <div style={{fontSize:12,color:C.text.s,marginTop:6}}>Día {confirmPago.dia} · {confirmPago.frecuencia==="mensual"?"Mensual":"Una vez"}</div>
            </div>
            {confirmPago.esVariable&&<div style={{
              display:"flex",alignItems:"center",background:C.surface,
              border:`2px solid ${rawVar>0?C.emerald:C.border}`,borderRadius:14,
              overflow:"hidden",marginBottom:16,transition:"border-color 0.2s",
            }}>
              <span style={{padding:"0 14px",color:C.text.s,fontSize:18,lineHeight:"54px"}}>$</span>
              <input inputMode="numeric" placeholder="¿Cuánto pagaste?" value={montoVar}
                autoFocus
                onChange={e=>{const r=e.target.value.replace(/\D/g,"");setMontoVar(r?Number(r).toLocaleString("es-CO"):"");}}
                style={{flex:1,background:"none",border:"none",outline:"none",fontSize:22,fontWeight:800,color:C.text.h,padding:"0 8px",height:54}}/>
            </div>}
            <div style={{fontSize:14,fontWeight:800,color:C.text.b,textAlign:"center",marginBottom:16}}>¿Ya realizaste este pago?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button
                onClick={async()=>{
                  if(!puedeConfirmar)return;
                  await handlePagoConfirmar({...confirmPago,monto:montoFinal});
                  setConfirmPago(null);
                }}
                disabled={!puedeConfirmar}
                style={{width:"100%",padding:"16px",borderRadius:14,border:"none",
                  cursor:puedeConfirmar?"pointer":"not-allowed",
                  background:puedeConfirmar?`linear-gradient(135deg,${C.emerald},#059669)`:C.surface,
                  color:puedeConfirmar?"#000":C.text.s,fontSize:15,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>✅</span> {confirmPago.esVariable&&!rawVar?"Ingresa el monto primero":`Sí, pagué${montoFinal>0?" "+COP(montoFinal):""} — registrar`}
              </button>
              <button onClick={async()=>{await handlePagoPostponer(confirmPago);setConfirmPago(null);}}
                style={{width:"100%",padding:"16px",borderRadius:14,border:`1px solid ${C.amber}44`,cursor:"pointer",
                  background:`${C.amber}12`,color:C.amber,fontSize:15,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>⏰</span> Recordármelo mañana
              </button>
              <button onClick={async()=>{await handlePagoNoPague(confirmPago);setConfirmPago(null);}}
                style={{width:"100%",padding:"16px",borderRadius:14,border:`1px solid ${C.red}33`,cursor:"pointer",
                  background:`${C.red}10`,color:C.red,fontSize:15,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>❌</span> No lo pagué — eliminar recordatorio
              </button>
              <button onClick={()=>setConfirmPago(null)}
                style={{background:"none",border:"none",color:C.text.s,cursor:"pointer",fontSize:13,padding:"8px",fontWeight:600}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>;
      })()}
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

  // ── Componente días de pago (necesita useState propio) ──────────────────────
  function DiasPageConfig({quincenas, modoSalario, setQuincenas, user, db, C, COP}){
    const [editando, setEditando] = useState(false);

    const guardar = async(q) => {
      const {showAlert} = await import("./GlobalAlert");
      showAlert({
        type:"warning",
        title:"¿Cambiar fecha de pago?",
        body:"Solo cámbialo si tu fecha de depósito cambió.",
        actions:[
          {label:"Cancelar", primary:false, onClick:()=>{}},
          {label:"Sí, actualizar", primary:true, onClick:async()=>{
            setQuincenas(q);
            await setDoc(doc(db,"usuarios",user.uid),{quincenas:q},{merge:true});
            setEditando(false);
          }},
        ]
      });
    };

    return (
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:11,color:C.text.s,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>
            ¿Cuándo te pagan?
          </div>
          {!editando&&(
            <button onClick={()=>setEditando(true)} style={{
              background:"none",border:`1px solid ${C.indigo}44`,borderRadius:8,
              padding:"4px 12px",color:C.indigo,cursor:"pointer",fontSize:11,fontWeight:700
            }}>Editar</button>
          )}
        </div>

        {!editando ? (
          <div style={{
            background:C.surface,borderRadius:10,padding:"12px 16px",
            display:"flex",justifyContent:"space-between",alignItems:"center"
          }}>
            <span style={{fontSize:13,color:C.text.b}}>
              {modoSalario==="quincenal" ? "Días de quincena" : "Día de depósito"}
            </span>
            <span style={{fontSize:15,fontWeight:800,color:C.text.h}}>
              {modoSalario==="quincenal"
                ? `día ${quincenas.dia1||1} y día ${quincenas.dia2||15}`
                : `día ${quincenas.dia1||30} de cada mes`}
            </span>
          </div>
        ) : (
          <>
            <div style={{
              background:`${C.amber}12`,border:`1px solid ${C.amber}30`,
              borderRadius:10,padding:"10px 14px",marginBottom:8,
              fontSize:12,color:C.amber,lineHeight:1.5
            }}>
              ⚠️ Solo cámbialo si tu fecha de depósito cambió.
            </div>

            {modoSalario==="quincenal" ? (
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.text.s,marginBottom:4}}>1er pago</div>
                  <input type="number" min="1" max="31"
                    defaultValue={quincenas.dia1||1} id="cfg-q-dia1"
                    style={{width:"100%",background:C.surface,border:`2px solid ${C.indigo}44`,
                      borderRadius:10,padding:"10px 12px",color:C.text.h,
                      fontSize:18,fontWeight:800,outline:"none",textAlign:"center"}}/>
                </div>
                <div style={{fontSize:14,color:C.text.s,paddingTop:18}}>y</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.text.s,marginBottom:4}}>2do pago</div>
                  <input type="number" min="1" max="31"
                    defaultValue={quincenas.dia2||15} id="cfg-q-dia2"
                    style={{width:"100%",background:C.surface,border:`2px solid ${C.indigo}44`,
                      borderRadius:10,padding:"10px 12px",color:C.text.h,
                      fontSize:18,fontWeight:800,outline:"none",textAlign:"center"}}/>
                </div>
              </div>
            ) : (
              <input type="number" min="1" max="31"
                defaultValue={quincenas.dia1||30} id="cfg-m-dia1"
                style={{width:"100%",background:C.surface,border:`2px solid ${C.indigo}44`,
                  borderRadius:10,padding:"10px 12px",color:C.text.h,
                  fontSize:18,fontWeight:800,outline:"none",textAlign:"center",marginBottom:8}}/>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditando(false)} style={{
                flex:1,padding:"10px",borderRadius:10,
                border:`1px solid ${C.border}`,background:"transparent",
                color:C.text.s,cursor:"pointer",fontSize:13,fontWeight:700
              }}>Cancelar</button>
              <button onClick={()=>{
                if(modoSalario==="quincenal"){
                  const d1=Math.max(1,Math.min(31,parseInt(document.getElementById("cfg-q-dia1")?.value)||1));
                  const d2=Math.max(1,Math.min(31,parseInt(document.getElementById("cfg-q-dia2")?.value)||15));
                  guardar({...quincenas,dia1:d1,dia2:d2});
                } else {
                  const d=Math.max(1,Math.min(31,parseInt(document.getElementById("cfg-m-dia1")?.value)||30));
                  guardar({...quincenas,dia1:d});
                }
              }} style={{
                flex:1,padding:"10px",borderRadius:10,border:"none",
                background:`linear-gradient(135deg,${C.indigo},${C.violet})`,
                color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800
              }}>Guardar</button>
            </div>
          </>
        )}
      </div>
    );
  }

  const ConfigTab=()=>{
    const [tmp,setTmp]=useState(String(sal));
    return <div style={{padding:"16px 20px 100px"}}>
      <Card style={{marginBottom:12,display:"flex",alignItems:"center",gap:14}}>
        <img src={user.photoURL} alt="" style={{width:48,height:48,borderRadius:"50%"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text.h}}>{user.displayName}</div>
          <div style={{fontSize:12,color:C.text.b}}>{user.email}</div>
        </div>
        <button onClick={handleLogout} style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:8,padding:"7px 14px",color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>Salir</button>
      </Card>
      <Card style={{marginBottom:12}}>
        <Lbl>{modoSalario==="quincenal"?"Ingreso por quincena (COP)":"Ingreso mensual de referencia (COP)"}</Lbl>
        {/* Modo de pago */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {[{id:"mensual",label:"📅 Mensual"},{id:"quincenal",label:"📆 Quincenal"}].map(o=>(
            <button key={o.id} onClick={async()=>{
              setModoSalario(o.id);
              await setDoc(doc(db,"usuarios",user.uid),{modoSalario:o.id},{merge:true});
            }} style={{
              flex:1,padding:"8px 0",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
              background:modoSalario===o.id?`${C.indigo}22`:C.surface,
              outline:`2px solid ${modoSalario===o.id?C.indigo:"transparent"}`,
              color:modoSalario===o.id?C.indigo:C.text.s,transition:"all 0.15s",
            }}>{o.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)}
            style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text.h,fontSize:16,outline:"none"}}/>
          <button onClick={()=>handleSalarioChange(parseFloat(tmp)||sal)} style={{background:`linear-gradient(135deg,${C.emerald},#059669)`,border:"none",borderRadius:10,padding:"0 20px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:18}}>✓</button>
        </div>
        {/* Días de pago — componente separado para poder usar useState */}
        <DiasPageConfig
          quincenas={quincenas} modoSalario={modoSalario}
          setQuincenas={setQuincenas} user={user} db={db}
          C={C} COP={COP}
        />
        <div style={{fontSize:12,color:C.text.b,background:C.surface,borderRadius:8,padding:"12px 14px",lineHeight:2}}>
          {modoSalario==="quincenal"
            ?<>Modo quincena — recibes <b style={{color:C.text.h}}>{COP(parseFloat(tmp)||sal)}</b> dos veces al mes ({COP((parseFloat(tmp)||sal)*2)}/mes).<br/></>
            :<>El cambio aplica desde el mes siguiente — los meses anteriores conservan su valor original.<br/></>}
          Puedes registrar ingresos extra con <b style={{color:C.emerald}}>+ Ingreso</b> en el botón +.<br/>
          Con {COP((parseFloat(tmp)||sal)*(modoSalario==="quincenal"?2:1))}/mes te sugiero:<br/>
          <span style={{color:C.sky}}>→ {COP(Math.round((parseFloat(tmp)||sal)*(modoSalario==="quincenal"?2:1)*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:C.indigo}}>→ {COP(Math.round((parseFloat(tmp)||sal)*(modoSalario==="quincenal"?2:1)*0.10))} Aportes a metas (10%)</span><br/>
          <span style={{color:C.text.b}}>→ {COP(Math.round((parseFloat(tmp)||sal)*(modoSalario==="quincenal"?2:1)*0.85))} Gastos libres</span>
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
      {/* ── Estilo de la card principal ── */}
      <Card style={{marginBottom:12}}>
        <Lbl>Estilo de la tarjeta principal</Lbl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:4}}>
          {[
            {id:"gradient", icon:"🌈", label:"Gradiente", desc:"Clásico con color"},
            {id:"glass",    icon:"🔮", label:"Glass",     desc:"Translúcido"},
            {id:"matte",    icon:"⬛", label:"Mate",      desc:"Premium sólido"},
          ].map(s=>(
            <button key={s.id} onClick={()=>cambiarHeroStyle(s.id)}
              style={{
                padding:"12px 8px",borderRadius:14,border:"none",cursor:"pointer",
                background:heroStyle===s.id?`${C.indigo}20`:C.surface,
                outline:`2px solid ${heroStyle===s.id?C.indigo:"transparent"}`,
                transition:"all 0.15s",textAlign:"center",
              }}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:11,fontWeight:700,color:C.text.h}}>{s.label}</div>
              <div style={{fontSize:9,color:C.text.s,marginTop:2}}>{s.desc}</div>
            </button>
          ))}
        </div>
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
                <div style={{width:16,height:16,borderRadius:4,background:t.bg,border:`1px solid ${t.isLight?"rgba(15,23,42,0.18)":"rgba(255,255,255,0.2)"}`}}/>
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

  // ─── TAB MÁS ─────────────────────────────────────────────────────────────────
  function MasTab(){
    const prestamosActivos=prestamos.filter(p=>!p.devuelto).length;
    const deudasActivas=deudas.filter(d=>!d.liquidada).length;

    const ITEMS=[
      {icon:"📅", label:"Agenda",        color:C.sky,     onClick:()=>changeTab("cal")},
      {icon:"🏆", label:"Logros",        color:"#f59e0b", onClick:()=>changeTab("logros"),
       badge:totalPts>0?`${totalPts}pts`:null},
      {icon:"📈", label:"Resumen anual", color:C.emerald, onClick:()=>isPro?changeTab("anual"):setProGate({titulo:"Resumen anual",descripcion:"Visualiza tus finanzas de los últimos 12 meses con tendencias.",features:[{icon:"📅",label:"Vista 12 meses"},{icon:"📈",label:"Tendencias y comparativas"},{icon:"🏆",label:"Mejor y peor mes"}]})},
      {icon:"🤝", label:"Préstamos",  color:C.indigo,  onClick:()=>setPrestamosModal(true),
       badge:prestamosActivos||null},
      {icon:"💳", label:"Mis deudas", color:C.red,     onClick:()=>setDeudasModal(true),
       badge:deudasActivas||null},
      {icon:"🏦", label:"Patrimonio",    color:C.violet,  onClick:()=>changeTab("anal")},
    ];

    return <div style={{padding:"20px 20px 100px",animation:"fadeIn 0.2s ease"}}>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:900,color:C.text.h,letterSpacing:-0.5}}>Más</div>
        <div style={{fontSize:13,color:C.text.s,marginTop:2}}>Herramientas y secciones</div>
      </div>

      {/* Grid 2 columnas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {ITEMS.map(item=>(
          <button key={item.label} onClick={item.onClick} style={{
            ...cardSurface(),
            border:`1px solid ${C.border}`,borderRadius:18,
            padding:"20px 16px",cursor:"pointer",textAlign:"left",
            display:"flex",flexDirection:"column",gap:10,
            boxShadow:elev("card"),position:"relative",
            transition:"opacity 0.15s",
          }}>
            {/* Badge */}
            {item.badge&&<div style={{
              position:"absolute",top:10,right:10,
              background:typeof item.badge==="number"?"#f43f5e":`${C.indigo}22`,
              color:typeof item.badge==="number"?"#fff":C.indigo,
              borderRadius:99,padding:"2px 8px",
              fontSize:10,fontWeight:800,lineHeight:1.4,
            }}>{item.badge}</div>}
            {/* Icono */}
            <div style={{
              width:44,height:44,borderRadius:14,
              background:`${item.color}18`,border:`1px solid ${item.color}30`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:22,
            }}>{item.icon}</div>
            {/* Label */}
            <div style={{fontSize:14,fontWeight:700,color:C.text.h,lineHeight:1.2}}>
              {item.label}
            </div>
          </button>
        ))}
      </div>
    </div>;
  }

  const NAV=[
    {id:"home", icon:"⬡", label:"Inicio",   activeColor:C.emerald},
    {id:"mov",  icon:"≡", label:"Movim.",   activeColor:C.emerald},
    {id:"metas",icon:null, label:"Metas",   activeColor:"#f59e0b"},
    {id:"anal", icon:"▤", label:"Análisis", activeColor:C.indigo},
    {id:"mas",  icon:"⋯", label:"Más",      activeColor:C.sky},
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
          position:"relative",
        }}>
          <button onClick={()=>setAlertaGasto(null)} style={{position:"absolute",top:8,right:10,background:"none",border:"none",color:C.text.s,fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
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

  return <div style={{minHeight:"100vh",background:themeBg(),color:C.text.h,fontFamily:"'DM Sans','Segoe UI',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:88,fontSize:SC.fs(15),position:"relative"}}>
    <style>{CSS}</style>
    {/* Topbar */}
    <div style={{padding:`${SC.pad(16)}px ${SC.pad(20)}px 14px`,
      background: C.isLight ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.25)",
      position:"sticky",top:0,zIndex:20,
      backdropFilter:"blur(40px)",WebkitBackdropFilter:"blur(40px)",
      borderBottom:`1px solid ${C.indigo}22`,
      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:C.text.s,letterSpacing:1.8,fontWeight:600,marginBottom:2,opacity:0.7}}>{isPro?"MIS FINANZAS PRO":"MIS FINANZAS"}</div>
        <div style={{fontSize:SC.fs(23),fontWeight:900,letterSpacing:-0.5,color:C.text.h}}>{user.displayName?.split(" ")[0]} 👋</div>
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
        {(()=>{
          const nPrest=prestamos.filter(p=>!p.devuelto).length;
          const nDeud=deudas.filter(d=>!d.liquidada).length;
          const total=nPrest+nDeud;
          if(total===0) return null;
          const [notifOpen,setNotifOpen]=[notifSheetOpen,setNotifSheetOpen];
          return <button onClick={()=>setNotifSheetOpen(o=>!o)}
            style={{position:"relative",background:notifSheetOpen?`${C.red}22`:C.card,border:"none",
              borderRadius:10,padding:"7px 10px",cursor:"pointer",
              boxShadow:elev("card"),transition:"all 0.2s",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
            🔔
            <span style={{position:"absolute",top:-4,right:-4,
              background:C.red,color:"#fff",borderRadius:99,
              fontSize:9,fontWeight:800,minWidth:16,height:16,
              display:"flex",alignItems:"center",justifyContent:"center",
              padding:"0 3px",lineHeight:1}}>
              {total}
            </span>
          </button>;
        })()}
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
    {/* Menú hamburguesa — bottom sheet */}
    {menuOpen&&<MenuSheet onClose={()=>setMenuOpen(false)} user={user} disponibleGastar={disponibleGastar} totalGasto={totalGasto} tema={tema} TEMAS={TEMAS} changeTab={changeTab} setMenuOpen={setMenuOpen} setExportModal={setExportModal} handleLogout={handleLogout} C={C} COP={COP} isPro={isPro} setProGate={setProGate}/>}
    {tab==="home"&&<HomeTab/>}{tab==="metas"&&<MetasTab/>}{tab==="cal"&&<CalendarioTab/>}{tab==="mov"&&<MovTab/>}{tab==="anal"&&<AnalisisTab/>}{tab==="cfg"&&<ConfigTab/>}{tab==="anual"&&(isPro?<ResumenAnualTab/>:<ProGate titulo="Resumen anual" descripcion="12 meses de tus finanzas de un vistazo." features={[{icon:"📅",label:"Vista 12 meses"},{icon:"📈",label:"Tendencias y comparativas"},{icon:"🏆",label:"Mejor y peor mes"}]} onClose={()=>changeTab("home")} C={C}/>)}{tab==="logros"&&<LogrosTab badgesDesbloqueados={badgesDesbloqueados} badgesGuardados={badgesGuardados} totalPts={totalPts} tx={tx} goals={goals} presupuestos={presupuestos} prestamos={prestamos} rachaActual={rachaActualLogros} totalMesesConDatos={totalMesesConDatos} mesesResumen={mesesResumen} mesesPerfectos={mesesPerfectos} getAportado={getAportado} MAIN_CATS={MAIN_CATS} isGasto={isGasto} isAporteMeta={isAporteMeta} C={C} COP={COP}/>}{tab==="mas"&&<MasTab/>}
    {/* FAB unificado — tap: speed dial, hold: voz directa */}
    {!modal&&!goalModal&&!pagoModal&&tab!=="anual"&&tab!=="logros"&&tab!=="mas"&&<>
      {/* Overlay para cerrar speed dial */}
      {fabOpen&&<div onClick={()=>setFabOpen(false)} style={{position:"fixed",inset:0,zIndex:98}}/>}
      {/* Orb de voz activa */}
      {fabVoz&&<div style={{
        position:"fixed",inset:0,zIndex:200,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
      }} onClick={()=>{fabVozRef.current?.stop();setFabVoz(false);}}>
        <div style={{
          width:120,height:120,borderRadius:"50%",
          background:`radial-gradient(circle,${C.violet}44 0%,${C.indigo}22 60%,transparent 80%)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          animation:"pulse 1s ease infinite",
          boxShadow:`0 0 60px ${C.indigo}66`,
        }}>
          <div style={{fontSize:48}}>🎤</div>
        </div>
        <div style={{color:"#fff",fontSize:16,fontWeight:700,marginTop:24}}>Escuchando...</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:13,marginTop:8}}>Toca para cancelar</div>
      </div>}
      {/* Speed dial — botones que aparecen al hacer tap */}
      {fabOpen&&!fabVoz&&<>
        {/* Opción IA/Chat */}
        <div style={{
          position:"fixed",bottom:182,right:16,
          display:"flex",alignItems:"center",gap:10,
          animation:"fadeSlideUp 0.18s ease",
          zIndex:99,
        }}>
          <div style={{
            background:C.isLight?"rgba(99,102,241,0.9)":"rgba(99,102,241,0.25)",
            backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            borderRadius:99,padding:"7px 16px",
            fontSize:12,fontWeight:700,color:"#fff",
            border:"1px solid rgba(99,102,241,0.4)",
            boxShadow:"0 4px 16px rgba(99,102,241,0.35)",
          }}>Asistente IA</div>
          <button onClick={()=>{setFabOpen(false);setAsistenteOpen(true);}} style={{
            width:48,height:48,borderRadius:"50%",border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.violet},${C.indigo})`,
            fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 4px 16px ${C.indigo}55`,flexShrink:0,
          }}>🤖</button>
        </div>
        {/* Opción Manual */}
        <div style={{
          position:"fixed",bottom:244,right:16,
          display:"flex",alignItems:"center",gap:10,
          animation:"fadeSlideUp 0.22s ease",
          zIndex:99,
        }}>
          <div style={{
            background:C.isLight?"rgba(16,185,129,0.9)":"rgba(16,185,129,0.25)",
            backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            borderRadius:99,padding:"7px 16px",
            fontSize:12,fontWeight:700,color:"#fff",
            border:"1px solid rgba(16,185,129,0.4)",
            boxShadow:"0 4px 16px rgba(16,185,129,0.35)",
          }}>
            {tab==="metas"?"Nueva meta":tab==="cal"?"Pago programado":"Registro manual"}
          </div>
          <button onClick={()=>{
            setFabOpen(false);
            if(tab==="metas"){if(!isPro&&goals.length>=3){setProGate({titulo:"Metas ilimitadas",descripcion:"Con el plan Free puedes tener hasta 3 metas activas.",features:[{icon:"🎯",label:"Metas ilimitadas"}]});}else setGoalModal("new");}
            else if(tab==="cal"){setPagoModalDia(null);setPagoModal("new");}
            else setModal("new");
          }} style={{
            width:48,height:48,borderRadius:"50%",border:"none",cursor:"pointer",
            background:tab==="metas"?`linear-gradient(135deg,#818cf8,#4338ca)`:tab==="cal"?`linear-gradient(135deg,#38bdf8,#0284c7)`:`linear-gradient(135deg,#34d399,#059669)`,
            fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 4px 16px rgba(16,185,129,0.5)`,flexShrink:0,
          }}>✍️</button>
        </div>
      </>}
      {/* FAB Principal — verde, + centrado */}
      <button
        onPointerDown={e=>{
          e.preventDefault();
          holdTimer.current=setTimeout(()=>{
            holdTimer.current=null;
            setFabOpen(false);
            const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
            if(!SR){alertInfo("Voz no disponible","Usa Chrome para activar el micrófono.");return;}
            const rec=new SR();
            rec.lang="es-CO";rec.continuous=false;rec.interimResults=false;
            rec.onstart=()=>setFabVoz(true);
            rec.onresult=(ev)=>{
              const txt=Array.from(ev.results).map(r=>r[0].transcript).join("");
              setFabVoz(false);
              setFabVozText(txt);
              setAsistenteOpen(true);
            };
            rec.onend=()=>setFabVoz(false);
            rec.onerror=()=>setFabVoz(false);
            fabVozRef.current=rec;
            rec.start();
          },500);
        }}
        onPointerUp={()=>{
          if(holdTimer.current){clearTimeout(holdTimer.current);holdTimer.current=null;setFabOpen(o=>!o);}
        }}
        onPointerLeave={()=>{if(holdTimer.current){clearTimeout(holdTimer.current);holdTimer.current=null;}}}
        style={{
          position:"fixed",bottom:108,right:20,
          width:60,height:60,borderRadius:"50%",
          background:fabOpen
            ?"linear-gradient(135deg,#ef4444,#dc2626)"
            :`linear-gradient(135deg,#34d399,#10b981,#059669)`,
          border:"none",
          boxShadow:fabOpen
            ?`0 8px 32px rgba(239,68,68,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`
            :`0 8px 32px rgba(16,185,129,0.6), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:101,cursor:"pointer",
          transition:"all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          transform:fabOpen?"rotate(45deg)":"rotate(0deg)",
        }}>
        <span style={{fontSize:28,lineHeight:1,color:"#fff",display:"block",marginTop:-1}}>+</span>
      </button>
    </>}
    {modal&&<TxModal initial={modal==="new"||modal==="meta_aporte"?null:modal} initialCat={modal==="meta_aporte"?"meta_aporte":undefined} goals={goals} saldoDisponible={disponibleGastar} onClose={()=>setModal(null)} onSave={handleSave} onDelete={handleDelete} catsCustom={catsCustom} onEditCustom={m=>setCatPersonalModal(m)} onOpenPrestamo={()=>{setPrestamosModal(true);setPrestamoForm("new");}} txHistorial={tx} deudas={deudas}/>}
    {goalModal&&<GoalModal initial={goalModal==="new"?null:goalModal} onClose={()=>setGoalModal(null)} onSave={handleGoalSave} onDelete={handleGoalDelete}/>}
    {catPersonalModal&&<CatPersonalModal
      main={catPersonalModal}
      catsCustom={catsCustom}
      handleCatCustomSave={handleCatCustomSave}
      onClose={()=>setCatPersonalModal(null)}/>}
    {proGate&&<ProGate {...proGate} onClose={()=>setProGate(null)} C={C}/>}
    {prestamosModal&&<PrestamosModal
      prestamos={prestamos}
      onClose={()=>setPrestamosModal(false)}
      onSave={handlePrestamoSave}
      onDelete={handlePrestamoDelete}
      onToggle={handlePrestamoToggle}
      prestamoForm={prestamoForm}
      setPrestamoForm={setPrestamoForm}
      isPro={isPro}
      setProGate={setProGate}/>}
    {/* Modal plan inteligente (sugerencia inicial + histórico) */}
    {budgetSetupOpen&&(()=>{
      const sug=getSuggestedBudgets({
        salario:salMensualEfectivo,
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
        salario={salMensualEfectivo}
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
      mesInicial={tab==="cal"?calMes:now.getMonth()}
      anioInicial={tab==="cal"?calAnio:now.getFullYear()}
      onClose={()=>{setPagoModal(null);setPagoModalDia(null);}}
      onSave={handlePagoSave}
      onDelete={handlePagoDelete}/>}
    {/* Modal exportar */}
    {exportModal&&<ExportModalSheet
      onClose={()=>setExportModal(false)}
      exportarCSV={exportarCSV} exportarPDF={exportarPDF}
      tx={tx} now={now} isMonth={isMonth} MONTHS={MONTHS}/>}
    {/* Simulador de decisión */}
    {simuladorOpen&&<SimuladorDecision
      open={simuladorOpen}
      onClose={()=>setSimuladorOpen(false)}
      disponibleGastar={disponibleGastar}
      salario={salario||0}
      gastosTx={gastosTx}
      goals={goals}
      getAportado={getAportado}
      presupuestos={presupuestos}
      MAIN_CATS={MAIN_CATS}
      month={month}
      quincenas={quincenas}
      modoSalario={modoSalario}
      C={C} COP={COP}/>}
    {asistenteOpen&&<AsistenteIA
      onClose={()=>{setAsistenteOpen(false);setFabVozText("");}}
      onRegistrarTx={async(txData)=>{
        if(!user)return;
        // ── Validación plan Free: préstamos a terceros ──────────────────
        if(txData.cat==="prestamo_tercero"){
          if(!isPro&&prestamos.filter(p=>!p.devuelto).length>=1){
            throw new Error("PLAN_FREE:préstamos|Ya usaste tu préstamo gratuito. Activa el Plan Pro para registrar más préstamos a terceros. ⚡");
          }
        }
        const txRef = await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
          desc:txData.desc||"Sin descripción",
          amount:Number(txData.amount)||0,
          cat:txData.cat||"otros",
          date:todayStr(),
          createdAt:serverTimestamp(),
        });
        // ── Si es préstamo a tercero, crear también en colección prestamos ──
        if(txData.cat==="prestamo_tercero"){
          const nombre = (txData.desc||"").replace(/^Préstamo a /i,"").split("·")[0].trim()||"Sin nombre";
          await addDoc(collection(db,"usuarios",user.uid,"prestamos"),{
            nombre,
            monto:Number(txData.amount)||0,
            fechaPrestamo:todayStr(),
            descripcion:"Registrado por IA",
            devuelto:false,
            txId:txRef.id,
            createdAt:serverTimestamp(),
          });
        }
      }}
      onCrearPago={async(data)=>{
        if(!user)return;
        // ── Validación plan Free: máx 3 pagos programados ───────────────
        if(!isPro&&pagos.filter(p=>p.activo).length>=3){
          throw new Error("PLAN_FREE:pagos|Ya tienes 3 pagos programados (límite Free). Activa el Plan Pro para agregar más. ⚡");
        }
        await addDoc(collection(db,"usuarios",user.uid,"pagos_programados"),{
          nombre:data.nombre||"Pago",
          monto:Number(data.monto)||0,
          cat:data.cat||"otros",
          dia:Number(data.dia)||1,
          frecuencia:data.frecuencia||"mensual",
          activo:true,
          createdAt:serverTimestamp(),
        });
      }}
      onAporteMeta={async(data)=>{
        if(!user||!data.goalId)return;
        await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{
          desc:data.desc||"Aporte a meta",
          amount:Number(data.amount)||0,
          cat:"meta_aporte",
          goalId:data.goalId,
          date:todayStr(),
          createdAt:serverTimestamp(),
        });
      }}
      disponibleGastar={disponibleGastar}
      totalGasto={totalGasto}
      totalIngresoMes={totalIngresoMes}
      salario={salario||0}
      month={month} now={now} MONTHS={MONTHS}
      tx={tx} goals={goals} getAportado={getAportado}
      presupuestos={presupuestos} MAIN_CATS={MAIN_CATS}
      modoSalario={modoSalario} deudas={deudas} user={user}
      isPro={isPro}
      initialText={fabVozText}
      C={C} COP={COP}/>}
    {deudasModal&&<DeudasModal
      deudas={deudas}
      onClose={()=>setDeudasModal(false)}
      onSave={handleDeudaSave}
      onPagar={handleDeudaPagar}
      onDelete={handleDeudaDelete}
      disponibleGastar={disponibleGastar}
      isPro={isPro}
      setProGate={setProGate}
      C={C} COP={COP}/>}
    {/* Mini sheet de notificaciones (préstamos + deudas) */}
    {notifSheetOpen&&<>
      <div onClick={()=>setNotifSheetOpen(false)} style={{position:"fixed",inset:0,zIndex:299,background:"rgba(0,0,0,0.4)",animation:"fadeIn 0.15s ease"}}/>
      <div style={{position:"fixed",top:70,right:16,zIndex:300,background:C.card,borderRadius:18,
        border:`1px solid ${C.border}`,boxShadow:elev("modal"),minWidth:220,
        animation:"fadeIn 0.18s ease",overflow:"hidden"}}>
        <div style={{padding:"12px 16px 4px",fontSize:10,color:C.text.s,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Pendientes</div>
        {prestamos.filter(p=>!p.devuelto).length>0&&(
          <button onClick={()=>{setNotifSheetOpen(false);setPrestamosModal(true);}}
            style={{width:"100%",padding:"12px 16px",background:"none",border:"none",
              borderTop:`1px solid ${C.border}`,cursor:"pointer",
              display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
            <span style={{fontSize:20}}>🤝</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>Préstamos</div>
              <div style={{fontSize:11,color:C.text.s}}>{prestamos.filter(p=>!p.devuelto).length} pendiente{prestamos.filter(p=>!p.devuelto).length!==1?"s":""}</div>
            </div>
            <span style={{fontSize:12,color:C.indigo,fontWeight:700}}>→</span>
          </button>
        )}
        {deudas.filter(d=>!d.liquidada).length>0&&(
          <button onClick={()=>{setNotifSheetOpen(false);isPro?setDeudasModal(true):setProGate({titulo:"Mis deudas",descripcion:"Controla todas tus deudas, cuotas y fechas de pago en un solo lugar.",features:[{icon:"💳",label:"Registro de deudas"},{icon:"📅",label:"Fechas y cuotas"},{icon:"✅",label:"Marca deudas como pagadas"}]});}}
            style={{width:"100%",padding:"12px 16px",background:"none",border:"none",
              borderTop:`1px solid ${C.border}`,cursor:"pointer",
              display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
            <span style={{fontSize:20}}>💳</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text.h}}>Deudas</div>
              <div style={{fontSize:11,color:C.text.s}}>{deudas.filter(d=>!d.liquidada).length} activa{deudas.filter(d=>!d.liquidada).length!==1?"s":""} · {COP(deudas.filter(d=>!d.liquidada).reduce((s,d)=>s+d.saldoRestante,0))}</div>
            </div>
            <span style={{fontSize:12,color:C.indigo,fontWeight:700}}>→</span>
          </button>
        )}
        <div style={{height:8}}/>
      </div>
    </>}
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
    {/* Toast de badge nuevo */}
    {badgesNuevos.length>0&&(()=>{
      const b=BADGES_DEF.find(x=>x.id===badgesNuevos[0]);
      if(!b) return null;
      return <div style={{position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",
        width:"calc(100% - 32px)",maxWidth:390,zIndex:600,animation:"slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)"}}>
        <div style={{background:C.card,borderRadius:18,padding:"14px 16px",
          border:`1px solid ${C.indigo}40`,boxShadow:`0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${C.indigo}20`,
          display:"flex",alignItems:"center",gap:12,position:"relative"}}>
          <button onClick={()=>setBadgesNuevos([])} style={{position:"absolute",top:6,right:8,
            background:"none",border:"none",color:C.text.s,fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
          <div style={{width:44,height:44,borderRadius:13,flexShrink:0,
            background:`${C.indigo}22`,border:`1px solid ${C.indigo}44`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{b.icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:C.indigo,fontWeight:700,letterSpacing:1,marginBottom:2}}>🏆 LOGRO DESBLOQUEADO</div>
            <div style={{fontSize:14,fontWeight:800,color:C.text.h,marginBottom:1}}>{b.label}</div>
            <div style={{fontSize:11,color:C.text.s}}>{b.desc}</div>
          </div>
          <div style={{fontSize:13,fontWeight:800,color:C.indigo,flexShrink:0,
            background:`${C.indigo}18`,padding:"4px 10px",borderRadius:99}}>+{b.pts}pts</div>
        </div>
      </div>;
    })()}
    {/* Nav — Pill flotante iOS 26 */}
    <div style={{
      position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,
      padding:"8px 16px 20px",
      zIndex:50,
      pointerEvents:"none",
    }}>
      <nav style={{
        background: C.isLight
          ? "rgba(255,255,255,0.82)"
          : "rgba(18,18,28,0.82)",
        backdropFilter:"blur(40px)", WebkitBackdropFilter:"blur(40px)",
        border: C.isLight
          ? "1px solid rgba(255,255,255,0.9)"
          : "1px solid rgba(255,255,255,0.10)",
        borderRadius:28,
        boxShadow: C.isLight
          ? "0 8px 32px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset"
          : "0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
        display:"flex", justifyContent:"space-around", alignItems:"center",
        padding:"10px 8px",
        pointerEvents:"auto",
      }}>
        {NAV.map(v=>{
          const isActive = tab===v.id;
          return (
            <button key={v.id} onClick={()=>changeTab(v.id)} style={{
              background: isActive
                ? C.isLight ? `${v.activeColor}18` : `${v.activeColor}20`
                : "none",
              border:"none", cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              color: isActive ? v.activeColor : C.text.s,
              transition:"all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
              padding:"7px 14px", borderRadius:18,
              transform: isActive ? "scale(1.05)" : "scale(1)",
            }}>
              {v.id==="metas"
                ? <StarIcon active={isActive}/>
                : <span style={{fontSize:20,lineHeight:1,transition:"all 0.2s"}}>{v.icon}</span>}
              <span style={{
                fontSize:10,
                fontWeight: isActive ? 700 : 500,
                letterSpacing:0.2,
                transition:"all 0.2s",
              }}>{v.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
    {/* Modal confirmación salir */}
    {exitConfirm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:24,animation:"fadeIn 0.15s ease"}}>
      <div style={{background:C.card,borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:320,boxShadow:"0 24px 60px rgba(0,0,0,0.5)",animation:"fadeSlideUp 0.2s ease"}}>
        <div style={{fontSize:32,textAlign:"center",marginBottom:12}}>👋</div>
        <div style={{fontSize:17,fontWeight:800,color:C.text.h,textAlign:"center",marginBottom:8}}>¿Cerrar sesión?</div>
        <div style={{fontSize:13,color:C.text.s,textAlign:"center",marginBottom:24,lineHeight:1.5}}>Tus datos están guardados en la nube.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>{setExitConfirm(false);handleLogout();}} style={{width:"100%",padding:14,borderRadius:14,border:"none",cursor:"pointer",fontSize:15,fontWeight:800,background:`linear-gradient(135deg,${C.red},#dc2626)`,color:"#fff"}}>
            Cerrar sesión
          </button>
          <button onClick={()=>setExitConfirm(false)} style={{width:"100%",padding:14,borderRadius:14,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:15,fontWeight:700,background:C.surface,color:C.text.b}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>}
  </div>;
}