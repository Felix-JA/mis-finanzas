import { useState, useEffect, useRef, useCallback } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  getDoc, setDoc
} from "firebase/firestore";

// ─── PALETA PRINCIPAL ─────────────────────────────────────────────────────────
// Inspirada en Revolut + Robinhood: Indigo (confianza/metas) + Emerald (dinero) + Slate (fondo)
const C = {
  bg:      "#080e1e",          // Azul marino profundo
  surface: "rgba(255,255,255,0.05)",
  border:  "rgba(255,255,255,0.08)",
  indigo:  "#6366f1",       // Metas / acciones principales
  emerald: "#10b981",       // Dinero disponible / ahorros
  amber:   "#f59e0b",       // Alertas
  red:     "#ef4444",       // Gastos / negativo
  violet:  "#8b5cf6",       // 75%+ progreso
  sky:     "#38bdf8",       // Info / menor prioridad
  text:    { h:"#f1f5f9", b:"#94a3b8", s:"#475569" },
};

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
const MAIN_CATS = [
  { id:"comida", label:"Comida", icon:"🍽️", color:"#facc15",
    subs:[{id:"restaurantes",label:"Restaurantes",icon:"🍜"},{id:"mercado",label:"Mercado",icon:"🛒"},{id:"domicilios",label:"Domicilios",icon:"🛵"},{id:"cafeteria",label:"Cafetería",icon:"☕"}]},
  { id:"hogar", label:"Hogar", icon:"🏠", color:"#60a5fa",
    subs:[{id:"arriendo",label:"Arriendo",icon:"🏘️"},{id:"servicios",label:"Servicios",icon:"💡"},{id:"aseo",label:"Aseo",icon:"🧹"},{id:"reparaciones",label:"Reparaciones",icon:"🔧"}]},
  { id:"transporte", label:"Transporte", icon:"🚗", color:"#34d399",
    subs:[{id:"bus",label:"Bus/Metro",icon:"🚌"},{id:"taxi",label:"Taxi/Uber",icon:"🚕"},{id:"gasolina",label:"Gasolina",icon:"⛽"},{id:"parqueadero",label:"Parqueadero",icon:"🅿️"}]},
  { id:"vehiculo", label:"Vehículo", icon:"🏍️", color:"#fb923c",
    subs:[{id:"repuestos",label:"Repuestos",icon:"🔩"},{id:"mantenimiento",label:"Mantenimiento",icon:"🛠️"},{id:"soat",label:"SOAT/Seguro",icon:"📋"},{id:"revision",label:"Rev. Técnica",icon:"🔍"}]},
  { id:"deudas", label:"Deudas", icon:"💳", color:"#f43f5e",
    subs:[{id:"tarjeta",label:"Tarjeta",icon:"💳"},{id:"cuotas",label:"Cuotas",icon:"📦"},{id:"prestamo",label:"Préstamo",icon:"🏦"},{id:"credito",label:"Crédito",icon:"📝"}]},
  { id:"salud", label:"Salud", icon:"💊", color:"#f87171",
    subs:[{id:"medico",label:"Médico",icon:"🏥"},{id:"medicamentos",label:"Medicamentos",icon:"💉"},{id:"gym",label:"Gym",icon:"🏋️"},{id:"suplementos",label:"Suplementos",icon:"💪"}]},
  { id:"ocio", label:"Ocio", icon:"🎉", color:"#e879f9",
    subs:[{id:"salidas",label:"Salidas",icon:"🥂"},{id:"streaming",label:"Streaming",icon:"📺"},{id:"juegos",label:"Juegos",icon:"🎮"},{id:"viajes",label:"Viajes",icon:"✈️"}]},
  { id:"estilo", label:"Estilo", icon:"👕", color:"#a78bfa",
    subs:[{id:"ropa",label:"Ropa",icon:"👗"},{id:"calzado",label:"Calzado",icon:"👟"},{id:"accesorios",label:"Accesorios",icon:"💍"},{id:"belleza",label:"Belleza",icon:"💄"}]},
  { id:"otros_main", label:"Otros", icon:"📦", color:"#94a3b8",
    subs:[{id:"tecnologia",label:"Tecnología",icon:"💻"},{id:"educacion",label:"Educación",icon:"📚"},{id:"mascotas",label:"Mascotas",icon:"🐾"},{id:"otros",label:"Otros",icon:"🗂️"}]},
];
// Solo "ingreso" es categoría especial — suma al saldo
// Las metas son el único concepto de ahorro (unificado)
const INCOME_CAT = {id:"ingreso",label:"Ingreso",icon:"💵",color:"#10b981"};
function isIngreso(cat){ return cat==="ingreso"; }
// Un aporte a meta es cualquier tx con goalId — no necesita categoría especial
function isAporteMeta(t){ return !!t.goalId; }
function isGasto(cat){ return !isIngreso(cat) && cat!=="meta_aporte"; }
// Compatibilidad legacy: emergencias era categoría, ahora es meta especial
function isSavingsLegacy(cat){ return cat==="emergencias"||cat==="meta_aporte"; }
const ALL_SUBS = MAIN_CATS.flatMap(m=>m.subs.map(s=>({...s,mainId:m.id,color:m.color})));
function getCatInfo(id) {
  if(id==="ingreso") return INCOME_CAT;
  if(id==="emergencias") return {id:"emergencias",label:"Fondo Emergencias",icon:"🛡️",color:C.sky};
  if(id==="meta_aporte") return {id:"meta_aporte",label:"Aporte a Meta",icon:"⭐",color:C.indigo};
  return ALL_SUBS.find(s=>s.id===id) ||
    ({gym:{label:"Gym",icon:"🏋️",color:"#f97316"},suplementos:{label:"Suplementos",icon:"💪",color:"#fb923c"},
      servicios:{label:"Servicios",icon:"📱",color:"#38bdf8"},comida:{label:"Comida",icon:"🍔",color:"#facc15"},
      salidas:{label:"Salidas",icon:"🎉",color:"#e879f9"},ropa:{label:"Ropa",icon:"👕",color:"#a78bfa"},
      transporte:{label:"Transporte",icon:"🚌",color:"#34d399"},nu:{label:"Cajita Nu",icon:"💚",color:C.emerald},
      otros:{label:"Otros",icon:"📦",color:"#94a3b8"}}[id]) || {label:id,icon:"📦",color:"#94a3b8"};
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
const isMonth = (s,m,y) => { const d=new Date(s); return d.getMonth()===m&&d.getFullYear()===y; };

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

function useCountUp(target,ms=700){
  const [v,setV]=useState(target),prev=useRef(target),raf=useRef(null);
  useEffect(()=>{
    cancelAnimationFrame(raf.current);
    const from=prev.current;prev.current=target;
    if(from===target)return;
    const t0=Date.now();
    const tick=()=>{const p=Math.min((Date.now()-t0)/ms,1);setV(Math.round(from+(target-from)*(1-Math.pow(1-p,3))));if(p<1)raf.current=requestAnimationFrame(tick);};
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[target]);
  return v;
}

// ─── ATOMS ────────────────────────────────────────────────────────────────────
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
  return <div style={{background:"rgba(255,255,255,0.08)",borderRadius:99,height:h,overflow:"hidden"}}>
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
function Lbl({children,style={}}){
  return <div style={{
    fontSize:10,color:C.text.m,letterSpacing:1.5,fontWeight:700,
    textTransform:"uppercase",marginBottom:6,...style
  }}>{children}</div>;
}

// ─── SELECTOR CATEGORÍAS ──────────────────────────────────────────────────────
function CatSelector({value,onChange}){
  const curMain=MAIN_CATS.find(m=>m.subs.some(s=>s.id===value));
  const [sel,setSel]=useState(curMain?.id||null);
  const isSav=false; // Metas ya no son categorías del selector
  function MBtn({m}){
    const active=curMain?.id===m.id&&!isSav,open=sel===m.id;
    return <button onMouseDown={e=>e.preventDefault()} onClick={()=>setSel(p=>p===m.id?null:m.id)}
      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 4px",borderRadius:14,border:"none",cursor:"pointer",
        background:open?`${m.color}35`:active?`${m.color}22`:C.surface,
        outline:(active||open)?`2px solid ${m.color}`:"2px solid transparent",transition:"all 0.15s"}}>
      <span style={{fontSize:20}}>{m.icon}</span>
      <span style={{fontSize:9,fontWeight:700,color:(active||open)?m.color:C.text.s,textAlign:"center",lineHeight:1.2}}>{m.label}</span>
    </button>;
  }
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:6}}>
      {MAIN_CATS.slice(0,5).map(m=><MBtn key={m.id} m={m}/>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:6}}>
      {MAIN_CATS.slice(5).map(m=><MBtn key={m.id} m={m}/>)}
    </div>
    {sel&&(()=>{
      const main=MAIN_CATS.find(m=>m.id===sel);
      return <div style={{background:`${main.color}12`,border:`1px solid ${main.color}44`,borderRadius:14,padding:"12px 10px",marginBottom:8,animation:"slideDown 0.18s ease"}}>
        <div style={{fontSize:11,color:main.color,fontWeight:700,letterSpacing:1,marginBottom:10,paddingLeft:4}}>{main.icon} {main.label.toUpperCase()}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {main.subs.map(s=>{const a=value===s.id;return <button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(s.id);setSel(null);}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"11px 4px",borderRadius:12,border:"none",cursor:"pointer",
              background:a?`${main.color}35`:C.surface,outline:a?`2px solid ${main.color}`:"2px solid transparent",transition:"all 0.12s"}}>
            <span style={{fontSize:20}}>{s.icon}</span>
            <span style={{fontSize:10,fontWeight:700,color:a?main.color:C.text.b,textAlign:"center",lineHeight:1.2}}>{s.label}</span>
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
  const ref=useRef(null);
  useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
  const val=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
  const pct=initial&&initial.monto>0?Math.min((initial._aportado||0)/initial.monto,1):0;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  function handleM(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
  function save(){if(!name.trim()||!val)return;onSave({id:initial?.id||null,name:name.trim(),monto:val,emoji});onClose();}
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1117",borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div style={{padding:"0 20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:18,fontWeight:800,color:C.text.h}}>{isEdit?"Editar meta":"Nueva meta"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.text.b,fontSize:28,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
        </div>
        {/* Preview */}
        <div style={{background:grad,borderRadius:16,padding:"20px 18px",marginBottom:18,border:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
          <div style={{fontSize:52,marginBottom:10,filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.5))"}}>{emoji}</div>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h,marginBottom:isEdit?6:4}}>{name||"Nombre de tu meta"}</div>
          {isEdit&&<>
            <div style={{fontSize:13,color:col,fontWeight:600,marginBottom:8}}>{getFrase(pct,name||"tu meta")}</div>
            <Bar pct={pct} color={col} h={6}/>
            <div style={{fontSize:12,color:C.text.b,marginTop:6,display:"flex",justifyContent:"space-between"}}>
              <span>{Math.round(pct*100)}% · {COP(initial._aportado||0)} acumulados</span>
              <span>Faltan {COP(Math.max((initial.monto||0)-(initial._aportado||0),0))}</span>
            </div>
          </>}
          {!isEdit&&<div style={{fontSize:13,color:C.text.b}}>{getFrase(0,name||"tu meta")}</div>}
        </div>
        {/* Emoji picker */}
        <Lbl>Ícono</Lbl>
        <button onClick={()=>setShowPicker(!showPicker)} style={{width:"100%",padding:"12px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <span style={{fontSize:28}}>{emoji}</span>
          <span style={{fontSize:14,color:C.text.b,fontWeight:600}}>Cambiar ícono</span>
          <span style={{marginLeft:"auto",color:C.text.s,fontSize:16}}>{showPicker?"▲":"▼"}</span>
        </button>
        {showPicker&&<div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,marginBottom:12,background:C.surface,borderRadius:14,padding:10,border:`1px solid ${C.border}`}}>
          {GOAL_EMOJIS.map(e=><button key={e} onClick={()=>{setEmoji(e);setShowPicker(false);}}
            style={{fontSize:24,padding:8,borderRadius:10,border:"none",cursor:"pointer",
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
        <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${val>0?C.indigo:C.border}`,transition:"border-color 0.2s",marginBottom:20}}>
          <span style={{padding:"0 16px",color:C.text.b,fontSize:18,lineHeight:"56px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={monto} onChange={handleM}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:24,fontWeight:800,color:C.text.h,padding:"0 8px",height:56,letterSpacing:-0.5}}/>
        </div>
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

// ─── CARD META (pestaña Metas) ────────────────────────────────────────────────
function GoalCard({goal,aportado,aportadoEsteMes,onEdit}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const done=pct>=1;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  const frase=getFrase(pct,goal.name);
  return <div onClick={onEdit}
    onMouseDown={e=>e.currentTarget.style.transform="scale(0.985)"}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    style={{borderRadius:18,overflow:"hidden",border:`1px solid ${done?"rgba(16,185,129,0.35)":C.border}`,marginBottom:14,cursor:"pointer",transition:"transform 0.15s"}}>
    <div style={{background:grad,padding:"22px 18px 16px",position:"relative"}}>
      {done&&<div style={{position:"absolute",top:12,right:12,background:C.emerald,borderRadius:99,padding:"4px 12px",fontSize:11,fontWeight:800,color:"#000"}}>✓ META LOGRADA</div>}
      <div style={{fontSize:50,marginBottom:10,filter:"drop-shadow(0 4px 20px rgba(0,0,0,0.6))"}}>{goal.emoji||"⭐"}</div>
      <div style={{fontSize:18,fontWeight:800,color:C.text.h,marginBottom:5}}>{goal.name}</div>
      <div style={{fontSize:13,color:col,fontWeight:600}}>{frase}</div>
    </div>
    <div style={{background:"rgba(255,255,255,0.03)",padding:"14px 18px 16px",borderTop:`1px solid ${C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <div style={{fontSize:22,fontWeight:900,color:col,letterSpacing:-1}}>{Math.round(pct*100)}%</div>
          <div style={{fontSize:11,color:C.text.s}}>completado</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text.h}}>{COP(aportado)}</div>
          <div style={{fontSize:11,color:C.text.s}}>acumulado de {COP(goal.monto)}</div>
        </div>
      </div>
      <Bar pct={pct} color={col} h={8}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
        <div style={{fontSize:11,color:C.text.s}}>
          {aportadoEsteMes>0
            ?<span style={{color:col}}>+{COP(aportadoEsteMes)} este mes</span>
            :<span>Sin aportes este mes</span>}
        </div>
        <div style={{fontSize:12,color:C.text.s}}>Faltan {COP(Math.max(goal.monto-aportado,0))}</div>
      </div>
    </div>
  </div>;
}

// ─── META CHIP (Home — compacto) ──────────────────────────────────────────────
function GoalChip({goal,aportado,aportadoEsteMes,onClick}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const col=goalColor(pct);
  const grad=goalGradient(pct);
  const frase=getFrase(pct,goal.name);
  return <div onClick={onClick}
    onMouseDown={e=>e.currentTarget.style.transform="scale(0.98)"}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    style={{
      background:"rgba(255,255,255,0.05)",
      borderRadius:16,overflow:"hidden",
      border:`1px solid rgba(255,255,255,0.1)`,
      boxShadow:"0 4px 16px rgba(0,0,0,0.3)",
      cursor:"pointer",display:"flex",alignItems:"stretch",marginBottom:10,transition:"all 0.15s"}}>
    <div style={{width:64,flexShrink:0,background:grad,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>
      {goal.emoji||"⭐"}
    </div>
    <div style={{flex:1,padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
        <div style={{flex:1,paddingRight:8}}>
          <div style={{fontSize:14,fontWeight:800,color:C.text.h,lineHeight:1.2,marginBottom:3}}>{goal.name}</div>
          <div style={{fontSize:11,color:col,fontWeight:600,lineHeight:1.3}}>{frase}</div>
        </div>
        <div style={{fontSize:20,fontWeight:900,color:col,flexShrink:0}}>{Math.round(pct*100)}%</div>
      </div>
      <Bar pct={pct} color={col} h={4}/>
      <div style={{fontSize:11,color:C.text.s,marginTop:5,display:"flex",justifyContent:"space-between"}}>
        <span>Faltan {COP(Math.max(goal.monto-aportado,0))}</span>
        {aportadoEsteMes>0&&<span style={{color:goalColor(aportado/Math.max(goal.monto,1))}}> +{COP(aportadoEsteMes)} hoy</span>}
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

function BudgetAlert({pct,salario,gastado}){
  if(pct<0.8)return null;
  const over=pct>=1, c=over?C.red:C.amber;
  return <div style={{background:`${c}18`,border:`1px solid ${c}44`,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,animation:"pulse 2s infinite"}}>
    <span style={{fontSize:26,flexShrink:0}}>{over?"🚨":"⚠️"}</span>
    <div>
      <div style={{fontSize:14,fontWeight:800,color:c,marginBottom:3}}>{over?"¡Presupuesto superado!":"Cerca del límite mensual"}</div>
      <div style={{fontSize:12,color:C.text.b,lineHeight:1.5}}>{over?`Llevas ${COP(gastado-salario)} sobre tu sueldo.`:`Llevas el ${Math.round(pct*100)}% del sueldo gastado.`}</div>
    </div>
  </div>;
}

// Ejemplos de placeholder para gastos e ingresos
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

function TxModal({initial,onClose,onSave,onDelete,goals,saldoDisponible}){
  const isEdit=!!initial;
  const [amount,setAmount]=useState(initial?Number(initial.amount).toLocaleString("es-CO"):"");
  const [desc,setDesc]=useState(initial?.desc||"");
  const [cat,setCat]=useState(initial?.cat||"restaurantes");
  const [date,setDate]=useState(initial?.date||todayStr());
  const [goalId,setGoalId]=useState(initial?.goalId||"");
  const [conf,setConf]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
  const raw=parseFloat(amount.replace(/\./g,"").replace(",","."))||0;
  const ci=getCatInfo(cat);
  const isMeta=cat==="meta_aporte";
  const esIngreso=isIngreso(cat);
  const changed=isEdit&&(raw!==initial.amount||desc.trim()!==initial.desc||cat!==initial.cat||date!==initial.date||goalId!==(initial.goalId||""));
  const acc=esIngreso?C.emerald:isMeta?C.indigo:ci.color||C.emerald;
  function ha(e){const r=e.target.value.replace(/\D/g,"");setAmount(r?Number(r).toLocaleString("es-CO"):"");}
  const esEdicion=!!initial?.id;
  const montoDiff=esEdicion?(raw-initial.amount):raw;
  const sinSaldo=!esIngreso&&!esEdicion&&saldoDisponible<raw&&saldoDisponible>=0;

  // ── Validaciones de campos requeridos ──────────────────────────────────────
  // 1. Monto obligatorio siempre
  const faltaMonto = !raw;
  // 2. Para gastos: debe tener subcategoría (no puede quedar en categoría principal)
  //    Las subcategorías válidas son las de ALL_SUBS. Emergencias y meta_aporte son válidas.
  const subCats = ALL_SUBS.map(s=>s.id);
  const catValida = esIngreso || cat==="emergencias" || cat==="meta_aporte" || subCats.includes(cat);
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
    onSave({
      id:initial?.id||null,
      desc:desc.trim()||(isMeta&&goalId?goals.find(g=>g.id===goalId)?.name||"Aporte meta":esIngreso?"Ingreso del mes":ci.label),
      amount:raw,cat,date,...(isMeta&&goalId?{goalId}:{})
    });
    onClose();
  }
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:300,animation:"fadeIn 0.18s ease"}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0d1117",borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:C.border}}/></div>
      <div style={{padding:"0 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:17,fontWeight:800,color:C.text.h}}>
            {isEdit?(esIngreso?"Editar ingreso":"Editar movimiento"):(esIngreso?"Nuevo ingreso":"Nuevo movimiento")}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.text.b,fontSize:28,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>{esIngreso?"Monto recibido (COP)":"Monto (COP)"}</Lbl>
          <div style={{display:"flex",alignItems:"center",background:C.surface,borderRadius:14,overflow:"hidden",border:`2px solid ${raw>0?acc:C.border}`,transition:"border-color 0.2s"}}>
            <span style={{padding:"0 14px",fontSize:22,lineHeight:"58px"}}>{ci.icon}</span>
            <span style={{color:C.text.s,fontSize:16,lineHeight:"58px"}}>$</span>
            <input ref={ref} inputMode="numeric" placeholder="0" value={amount} onChange={ha} enterKeyHint="next"
              style={{flex:1,background:"none",border:"none",outline:"none",fontSize:28,fontWeight:800,color:C.text.h,padding:"0 10px",height:58,letterSpacing:-0.5}}/>
            {raw>0&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>setAmount("")} style={{background:"none",border:"none",cursor:"pointer",color:C.text.s,fontSize:22,padding:"0 14px",lineHeight:"58px"}}>×</button>}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>{
            esIngreso?"¿De dónde viene?":
            cat==="emergencias"?"Descripción (opcional)":
            cat==="meta_aporte"?"Descripción (opcional)":
            "¿En qué lo gastaste?"
          }</Lbl>
          <input
            placeholder={
              esIngreso
                ?INGRESO_PLACEHOLDERS[Math.abs(desc.length+1)%INGRESO_PLACEHOLDERS.length]
                :cat==="emergencias"
                  ?EMERGENCIA_PLACEHOLDERS[Math.abs(desc.length+1)%EMERGENCIA_PLACEHOLDERS.length]
                :cat==="meta_aporte"
                  ?META_PLACEHOLDERS[Math.abs(desc.length+1)%META_PLACEHOLDERS.length]
                :GASTO_PLACEHOLDERS[Math.abs(desc.length+1)%GASTO_PLACEHOLDERS.length]
            }
            value={desc} onChange={e=>setDesc(e.target.value)} enterKeyHint="done"
            style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Toggle Gasto / Meta / Ingreso */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[
            {id:"gasto",  label:"🛍️ Gasto",   color:C.red,    active:!esIngreso&&cat!=="meta_aporte", onClick:()=>setCat("restaurantes")},
            {id:"meta",   label:"⭐ Meta",     color:C.indigo, active:cat==="meta_aporte",             onClick:()=>setCat("meta_aporte")},
            {id:"ingreso",label:"💵 Ingreso",  color:C.emerald,active:esIngreso,                       onClick:()=>setCat("ingreso")},
          ].map(t=>(
            <button key={t.id} onMouseDown={e=>e.preventDefault()} onClick={t.onClick}
              style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                background:t.active?`${t.color}22`:C.surface,
                outline:t.active?`2px solid ${t.color}`:"2px solid transparent",
                color:t.active?t.color:C.text.s,transition:"all 0.15s"}}>
              {t.label}
            </button>
          ))}
        </div>
        {!esIngreso&&cat!=="meta_aporte"&&<div style={{marginBottom:14}}>
          <Lbl>Categoría del gasto</Lbl>
          <CatSelector value={cat} onChange={v=>{setCat(v);setGoalId("");}}/>
          {faltaSubcat&&raw>0&&<div style={{marginTop:8,fontSize:12,color:C.amber,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <span>⚠️</span><span>Elige el tipo específico dentro de la categoría</span>
          </div>}
        </div>}
        {esIngreso&&<div style={{marginBottom:14,padding:"12px 16px",background:`${C.emerald}10`,border:`1px solid ${C.emerald}30`,borderRadius:12}}>
          <div style={{fontSize:13,color:C.emerald,fontWeight:700,marginBottom:4}}>💵 Registrar ingreso</div>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.7}}>Salario, comisión, freelance, bono, venta u otro dinero que recibiste. Puedes registrar varios ingresos en el mismo mes y se suman automáticamente.</div>
        </div>}
        {isMeta&&goals.length>0&&<div style={{marginBottom:14}}>
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
        {isMeta&&goals.length===0&&<div style={{marginBottom:14,padding:"14px 16px",background:`${C.amber}12`,border:`1px solid ${C.amber}35`,borderRadius:12}}>
          <div style={{fontSize:13,fontWeight:700,color:C.amber,marginBottom:4}}>⭐ Sin metas creadas aún</div>
          <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>Primero ve a la pestaña <b style={{color:C.indigo}}>Metas</b> y crea tu primera meta de ahorro. Luego vuelve aquí para registrar tu aporte.</div>
        </div>}
        <div style={{marginBottom:16}}>
          <Lbl>Fecha</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px",color:C.text.h,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Alerta saldo insuficiente */}
        {sinSaldo&&raw>0&&!esIngreso&&(
          <div style={{marginBottom:12,padding:"12px 14px",background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:12,display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:20,flexShrink:0}}>🚫</span>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:C.red,marginBottom:3}}>
                {saldoDisponible<=0?"No tienes saldo disponible":"Saldo insuficiente para este gasto"}
              </div>
              <div style={{fontSize:12,color:C.text.b,lineHeight:1.6}}>
                {saldoDisponible<=0
                  ?`Tu saldo disponible es ${COP(saldoDisponible)}. Registrar este gasto lo aumentaría aún más.`
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
              fontSize:16,fontWeight:800,transition:"all 0.2s",
              background:(hayError||sinMetas)?C.surface:sinSaldo?`${C.red}20`:isEdit&&!changed?`${C.sky}18`:`linear-gradient(135deg,${acc},${acc}cc)`,
              color:(hayError||sinMetas)?C.text.s:sinSaldo?C.red:isEdit&&!changed?C.sky:"#fff",
              opacity:(hayError||sinSaldo||sinMetas)?0.65:1}}>
            {getMensajeError() ?? (sinSaldo?"Saldo insuficiente 🚫":isEdit&&!changed?"Sin cambios":isEdit?"✓ Guardar":esIngreso?`Registrar ingreso ${COP(raw)} →`:`Registrar ${COP(raw)} →`)}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

function TxRow({t,onEdit}){
  const cat=getCatInfo(t.cat);
  const esMeta=isAporteMeta(t)||isSavingsLegacy(t.cat);
  const esPos=esMeta||isIngreso(t.cat);
  const [p,setP]=useState(false);
  return <div onClick={onEdit}
    onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)} onMouseLeave={()=>setP(false)}
    style={{
      display:"flex",alignItems:"center",gap:12,marginBottom:8,
      background:p?"rgba(255,255,255,0.09)":"rgba(255,255,255,0.04)",
      borderRadius:16,padding:"14px 16px",
      border:`1px solid ${p?C.borderStrong:C.border}`,
      cursor:"pointer",
      transition:"all 0.15s",
      transform:p?"scale(0.985)":"scale(1)",
      boxShadow:"0 2px 8px rgba(0,0,0,0.2)",
      userSelect:"none",
    }}>
    {/* Ícono con fondo de color */}
    <div style={{
      width:44,height:44,borderRadius:13,flexShrink:0,
      background:`linear-gradient(135deg,${cat.color}30,${cat.color}15)`,
      border:`1px solid ${cat.color}30`,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
    }}>{cat.icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:700,color:"#ffffff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</div>
      <div style={{fontSize:11,color:C.text.m,marginTop:3}}>
        {t.date?.slice(5).replace("-","/")} · {isIngreso(t.cat)?"💵 Ingreso":esMeta?"⭐ Meta":cat.label}
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:16,fontWeight:800,color:esPos?C.emeraldLight:C.red,letterSpacing:-0.5}}>
        {esPos?"+":"-"}{COP(t.amount)}
      </div>
      <div style={{fontSize:9,color:C.text.s,marginTop:2}}>editar</div>
    </div>
  </div>;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null),[authLoading,setAL]=useState(true),[loginLoading,setLL]=useState(false);
  const [salario,setSalario]=useState(null),[showOnb,setShowOnb]=useState(false);
  const [tx,setTx]=useState([]),[goals,setGoals]=useState([]);
  const [month,setMonth]=useState(now.getMonth()),[tab,setTab]=useState("home");
  const [modal,setModal]=useState(null),[goalModal,setGoalModal]=useState(null);
  const [txLoading,setTxL]=useState(false);
  const [alertaGasto,setAlertaGasto]=useState(null); // {monto, pct, tipo}

  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setAL(false);}),[]);
  useEffect(()=>{if(!user){setSalario(null);return;}getDoc(doc(db,"usuarios",user.uid)).then(snap=>{if(snap.exists()&&snap.data().salario){setSalario(snap.data().salario);setShowOnb(false);}else{setSalario(0);setShowOnb(true);}});},[user]);
  useEffect(()=>{if(!user||salario===null||showOnb)return;setDoc(doc(db,"usuarios",user.uid),{salario},{merge:true});},[salario,user,showOnb]);
  useEffect(()=>{if(!user){setTx([]);return;}setTxL(true);return onSnapshot(query(collection(db,"usuarios",user.uid,"transacciones"),orderBy("createdAt","desc")),snap=>{setTx(snap.docs.map(d=>({id:d.id,...d.data()})));setTxL(false);});},[user]);
  useEffect(()=>{if(!user){setGoals([]);return;}return onSnapshot(query(collection(db,"usuarios",user.uid,"metas"),orderBy("createdAt","desc")),snap=>{setGoals(snap.docs.map(d=>({id:d.id,...d.data()})));});},[user]);

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
    const pl={name:g.name,monto:g.monto||0,emoji:g.emoji||"⭐",esEmergencias:g.esEmergencias||false};
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

  const monthTx=tx.filter(t=>isMonth(t.date,month,now.getFullYear()));
  const gastosTx=monthTx.filter(t=>isGasto(t.cat)&&!isAporteMeta(t));
  const ingresosTx=monthTx.filter(t=>isIngreso(t.cat));
  // Aportes a metas = cualquier tx con goalId (incluye legacy emergencias/meta_aporte)
  const aporteMesAll=monthTx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat));
  const totalGasto=gastosTx.reduce((s,t)=>s+t.amount,0);
  const totalAportes=aporteMesAll.reduce((s,t)=>s+t.amount,0); // total guardado en metas
  const totalAhorr=totalAportes; // alias para compatibilidad
  const sal=salario||0;
  // Ingreso del mes = salario base SIEMPRE + cualquier ingreso extra registrado (se suman)
  const ingresosExtra=ingresosTx.reduce((s,t)=>s+t.amount,0);
  const totalIngresoMes=sal+ingresosExtra;

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
      const d = new Date(t.date);
      if (d.getFullYear() < limiteYear) return true;
      if (d.getFullYear() === limiteYear && d.getMonth() < limiteMes) return true;
      return false;
    });

    if (txPasadas.length === 0) return 0;

    // 2. Encontrar el mes más antiguo con transacciones
    let minYear = currentYear, minMes = limiteMes;
    txPasadas.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() < minYear || (d.getFullYear() === minYear && d.getMonth() < minMes)) {
        minYear = d.getFullYear();
        minMes = d.getMonth();
      }
    });

    // 3. Agrupar transacciones por año-mes
    const porMes = {};
    txPasadas.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!porMes[key]) porMes[key] = { ingresos: 0, gastos: 0, ahorros: 0 };
      if (isIngreso(t.cat)) porMes[key].ingresos += t.amount;
      else if (isAporteMeta(t)||isSavingsLegacy(t.cat)) porMes[key].ahorros += t.amount;
      else porMes[key].gastos += t.amount;
    });

    // 4. Recorrer mes a mes en cadena — salario base + extras registrados + sobrante anterior
    let saldoAcumulado = 0;
    let y = minYear, m = minMes;
    while (y < limiteYear || (y === limiteYear && m < limiteMes)) {
      const key = `${y}-${m}`;
      const datos = porMes[key] || { ingresos: 0, gastos: 0, ahorros: 0 };
      // Ingreso del mes = salario base + extras registrados (siempre se suman)
      const ingMes = sal + datos.ingresos;
      const disponibleMes = ingMes + saldoAcumulado - datos.gastos - datos.ahorros;
      saldoAcumulado = Math.max(disponibleMes, 0);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return saldoAcumulado;
  }

  const saldoAnterior=getSaldoAcumulado();
  const saldo=totalIngresoMes+saldoAnterior-totalGasto-totalAhorr;
  const tasaAhorr=totalIngresoMes>0?totalAhorr/totalIngresoMes:0;
  const pctUsado=totalIngresoMes>0?totalGasto/totalIngresoMes:0;
  // Total aportado a todas las metas (acumulado histórico)
  const totalEnMetas=tx.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);
  const metaTotal=totalEnMetas; // alias
  const saldoColor=saldo>sal*0.4?C.emerald:saldo>sal*0.15?C.amber:C.red;
  const animSaldo=useCountUp(Math.max(saldo,0));
  function getAportado(gid){
    // Acumulado histórico — incluye legacy y nuevos aportes vinculados por goalId
    return tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===gid)
             .reduce((s,t)=>s+t.amount,0);
  }
  function getAportadoMes(gid,m,y){
    return tx.filter(t=>(isAporteMeta(t)||isSavingsLegacy(t.cat))&&t.goalId===gid&&isMonth(t.date,m,y))
             .reduce((s,t)=>s+t.amount,0);
  }

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap');
    html,body{background:#080e1e!important;margin:0;padding:0;}
    *{box-sizing:border-box;}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.75}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.6);}
    input::placeholder{color:#2d3a4a;}
    ::-webkit-scrollbar{display:none;}
  `;

  if(authLoading)return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text.b,fontFamily:"'DM Sans',sans-serif",fontSize:15}}>Cargando...</div>;
  if(!user)return <LoginScreen onLogin={handleLogin} loading={loginLoading}/>;
  if(salario===null)return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.text.b,fontFamily:"'DM Sans',sans-serif",fontSize:15}}>Cargando perfil...</div>;
  if(showOnb)return <OnboardingScreen user={user} onSave={handleOnbSave}/>;

  const HomeTab=()=>{
    const byMain=MAIN_CATS.map(m=>({...m,total:gastosTx.filter(t=>m.subs.some(s=>s.id===t.cat)).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
    return <div style={{padding:"16px 20px 0"}}>
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
      {/* ── Card principal — gradiente dramático estilo Revolut ── */}
      <div style={{
        borderRadius:22,
        padding:"22px 22px 20px",
        marginBottom:14,
        background: pctUsado>=1
          ?"linear-gradient(135deg,#2d0a0a 0%,#1a0505 100%)"
          :pctUsado>=0.8
          ?"linear-gradient(135deg,#1a1000 0%,#0e0800 100%)"
          :"linear-gradient(135deg,#1a1f4e 0%,#0d1235 50%,#080e1e 100%)",
        border:`1px solid ${pctUsado>=1?C.red+"55":pctUsado>=0.8?C.amber+"44":"rgba(99,102,241,0.3)"}`,
        boxShadow:`0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
        position:"relative",overflow:"hidden",
        transition:"all 0.5s ease",
      }}>
        {/* Círculo decorativo de fondo — sensación de profundidad */}
        <div style={{
          position:"absolute",top:-60,right:-40,width:180,height:180,borderRadius:"50%",
          background:"rgba(99,102,241,0.08)",pointerEvents:"none",
        }}/>
        <div style={{
          position:"absolute",bottom:-30,left:-20,width:120,height:120,borderRadius:"50%",
          background:"rgba(16,185,129,0.05)",pointerEvents:"none",
        }}/>

        <div style={{position:"relative"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>
              Disponible · {MONTHS_S[month]}
            </div>
            {saldoAnterior>0&&(
              <div style={{
                background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.3)",
                borderRadius:99,padding:"3px 10px",fontSize:10,color:C.emeraldLight,fontWeight:700,
              }}>
                +{COP(saldoAnterior)} anterior
              </div>
            )}
          </div>

          {/* Número principal — grande y dominante */}
          <div style={{
            fontSize:48,fontWeight:900,letterSpacing:-2.5,lineHeight:1,
            color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:C.emeraldLight,
            fontVariantNumeric:"tabular-nums",marginBottom:20,
            textShadow:pctUsado<0.8?`0 0 40px rgba(52,211,153,0.3)`:"none",
            transition:"color 0.4s, text-shadow 0.4s",
          }}>
            {COP(animSaldo)}
          </div>

          {/* Barra de progreso — más gruesa y con fondo visible */}
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:99,height:8,overflow:"hidden",marginBottom:10}}>
            <div style={{
              height:8,borderRadius:99,
              background:pctUsado>=1
                ?`linear-gradient(90deg,${C.red},#ff6b6b)`
                :pctUsado>=0.8
                ?`linear-gradient(90deg,${C.amber},#fbbf24)`
                :`linear-gradient(90deg,${C.indigo},${C.emerald})`,
              width:`${Math.min(pctUsado*100,100)}%`,
              transition:"width 0.8s ease",
              boxShadow:pctUsado<0.8?`0 0 12px rgba(99,102,241,0.6)`:"none",
            }}/>
          </div>

          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>
              {totalIngresoMes>0?`de ${COP(totalIngresoMes+saldoAnterior)}`:"Sin ingresos"}
            </span>
            <span style={{
              fontSize:12,fontWeight:700,
              color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:"rgba(255,255,255,0.5)",
            }}>
              {Math.round(pctUsado*100)}% gastado
            </span>
          </div>
        </div>
      </div>
      {/* Stats */}
      {/* Stats — glassmorphism con contraste fuerte */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {/* Gastos */}
        <div style={{
          borderRadius:18,padding:"16px 16px",
          background:"linear-gradient(135deg,rgba(239,68,68,0.12) 0%,rgba(239,68,68,0.05) 100%)",
          border:`1px solid rgba(239,68,68,0.25)`,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
        }}>
          <div style={{fontSize:10,color:"rgba(239,68,68,0.7)",letterSpacing:1.5,fontWeight:700,marginBottom:8}}>GASTOS</div>
          <div style={{fontSize:22,fontWeight:900,color:C.red,letterSpacing:-1,marginBottom:8}}>{COP(totalGasto)}</div>
          <div style={{background:"rgba(239,68,68,0.15)",borderRadius:99,height:4,overflow:"hidden"}}>
            <div style={{height:4,borderRadius:99,background:C.red,width:`${Math.min(pctUsado*100,100)}%`,transition:"width 0.7s"}}/>
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:6}}>{Math.round(pctUsado*100)}% del ingreso</div>
        </div>
        {/* En metas */}
        <div style={{
          borderRadius:18,padding:"16px 16px",
          background:"linear-gradient(135deg,rgba(99,102,241,0.15) 0%,rgba(99,102,241,0.05) 100%)",
          border:`1px solid rgba(99,102,241,0.3)`,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
        }}>
          <div style={{fontSize:10,color:"rgba(129,140,248,0.8)",letterSpacing:1.5,fontWeight:700,marginBottom:8}}>EN METAS</div>
          <div style={{fontSize:22,fontWeight:900,color:C.indigoLight,letterSpacing:-1,marginBottom:8}}>{COP(totalAportes)}</div>
          <div style={{background:"rgba(99,102,241,0.15)",borderRadius:99,height:4,overflow:"hidden"}}>
            <div style={{height:4,borderRadius:99,background:C.indigo,width:`${Math.min(tasaAhorr*100,100)}%`,transition:"width 0.7s"}}/>
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:6}}>
            {totalAportes>0?`${Math.round(tasaAhorr*100)}% guardado`:"Sin aportes aún"}
          </div>
        </div>
      </div>
      {/* Metas chips */}
      {goals.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <Lbl style={{marginBottom:0}}>Mis metas</Lbl>
          <button onClick={()=>setTab("metas")} style={{background:"none",border:"none",color:C.indigo,fontSize:13,fontWeight:700,cursor:"pointer"}}>Ver todas →</button>
        </div>
        {goals.slice(0,3).map(g=><GoalChip key={g.id} goal={g}
            aportado={getAportado(g.id)}
            aportadoEsteMes={getAportadoMes(g.id,month,now.getFullYear())}
            onClick={()=>setTab("metas")}/>)}
      </>}
      {/* Gastos por cat */}
      {byMain.length>0&&<>
        <Lbl style={{marginTop:6}}>Gastos por categoría</Lbl>
        {byMain.map(c=><div key={c.id} style={{
          marginBottom:8,borderRadius:16,padding:"14px 16px",
          background:`linear-gradient(135deg,${c.color}12 0%,rgba(255,255,255,0.03) 100%)`,
          border:`1px solid ${c.color}25`,
          boxShadow:"0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{
              width:44,height:44,borderRadius:14,flexShrink:0,
              background:`linear-gradient(135deg,${c.color}35,${c.color}18)`,
              border:`1px solid ${c.color}40`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
            }}>{c.icon}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                <span style={{fontSize:14,fontWeight:700,color:"#ffffff"}}>{c.label}</span>
                <span style={{fontSize:15,fontWeight:900,color:c.color}}>{COP(c.total)}</span>
              </div>
              <div style={{background:`${c.color}18`,borderRadius:99,height:5,overflow:"hidden"}}>
                <div style={{height:5,borderRadius:99,background:c.color,width:`${Math.min(c.total/Math.max(totalGasto,1)*100,100)}%`,transition:"width 0.7s"}}/>
              </div>
            </div>
          </div>
        </div>)}
      </>}
      {!txLoading&&monthTx.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.text.s,fontSize:14,lineHeight:2.2}}>
        Sin movimientos aún.<br/><span style={{fontSize:32}}>👆</span><br/>Toca <b style={{color:C.emerald}}>+</b> para registrar.
      </div>}
    </div>;
  };

  const MetasTab=()=>{
    const tot=goals.reduce((s,g)=>s+g.monto,0), ap=goals.reduce((s,g)=>s+getAportado(g.id),0);
    return <div style={{padding:"16px 20px 0"}}>
      {goals.length>0&&<Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(30,27,75,0.6),rgba(15,23,42,0.8))",borderColor:`${C.indigo}25`}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Ring pct={tot>0?ap/tot:0} size={56} stroke={5} color={C.indigo} label={`${Math.round(Math.min(tot>0?ap/tot:0,1)*100)}%`}/>
          <div>
            <div style={{fontSize:12,color:C.indigo,fontWeight:700,marginBottom:3}}>⭐ Progreso total</div>
            <div style={{fontSize:22,fontWeight:900,color:C.indigo,letterSpacing:-1}}>{COP(ap)}</div>
            <div style={{fontSize:12,color:C.text.b}}>de {COP(tot)} en {goals.length} meta{goals.length!==1?"s":""}</div>
          </div>
        </div>
      </Card>}
      {goals.map(g=><GoalCard key={g.id} goal={g}
          aportado={getAportado(g.id)}
          aportadoEsteMes={getAportadoMes(g.id,month,now.getFullYear())}
          onEdit={()=>setGoalModal({
            ...g,
            _aportado:getAportado(g.id),
            _aporteCount:tx.filter(t=>t.cat==="meta_aporte"&&t.goalId===g.id).length
          })}/>)}
      {goals.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:C.text.s,fontSize:14,lineHeight:2.4}}>
        <div style={{fontSize:44,marginBottom:10}}>⭐</div>
        Aún no tienes metas.<br/>¡Crea una y empieza a ahorrar<br/>para lo que siempre quisiste!<br/>
        <button onClick={()=>setGoalModal("new")} style={{marginTop:18,padding:"12px 28px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.indigo},#4338ca)`,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>+ Crear mi primera meta</button>
      </div>}
      {goals.length>0&&<button onClick={()=>setGoalModal("new")} style={{width:"100%",padding:14,borderRadius:14,border:`1px dashed ${C.border}`,background:"transparent",color:C.text.b,cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:8}}>+ Nueva meta</button>}
    </div>;
  };

  const MovTab=()=>{
    const sorted=[...monthTx].sort((a,b)=>new Date(b.date)-new Date(a.date));
    return <div style={{padding:"16px 20px 0"}}>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12,scrollbarWidth:"none"}}>
        {MONTHS_S.map((m,i)=><button key={i} onClick={()=>setMonth(i)} style={{flexShrink:0,padding:"7px 15px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:month===i?C.emerald:C.surface,color:month===i?"#000":C.text.b}}>{m}</button>)}
      </div>
      <Card style={{marginBottom:14}}>
        <Lbl>Resumen de movimientos · {MONTHS[month]}</Lbl>
        {[
          {l:"Ingresos del mes",v:totalIngresoMes,c:C.emerald},
          ...(saldoAnterior>0?[{l:"+ Sobrante meses ant.",v:saldoAnterior,c:C.emerald}]:[]),
          {l:"Gastos",v:totalGasto,c:C.red},
          {l:"Ahorros",v:totalAhorr,c:C.indigo},
          {l:"Disponible",v:saldo,c:saldoColor},
        ].map(k=>(
          <div key={k.l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text.h}}>{k.l}</span>
            <span style={{fontSize:14,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
          </div>
        ))}
      </Card>
      {sorted.length>0&&<div style={{fontSize:12,color:C.text.s,textAlign:"center",marginBottom:12}}>✏️ Toca cualquier movimiento para editarlo</div>}
      {sorted.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.text.s,fontSize:14,lineHeight:2}}>
        Sin movimientos en {MONTHS[month]}.<br/>
        <span style={{fontSize:11,color:C.text.s}}>Los registros de otros meses están disponibles<br/>seleccionando el mes arriba.</span>
      </div>}
      {sorted.map(t=><TxRow key={t.id} t={t} onEdit={()=>setModal(t)}/>)}
    </div>;
  };

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
          <button onClick={()=>setSalario(parseFloat(tmp)||sal)} style={{background:`linear-gradient(135deg,${C.emerald},#059669)`,border:"none",borderRadius:10,padding:"0 20px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:18}}>✓</button>
        </div>
        <div style={{fontSize:12,color:C.text.b,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 14px",lineHeight:2}}>
          Este valor se usa cuando no registras ingresos en un mes.<br/>
          Cada mes puedes registrar el ingreso real con <b style={{color:C.emerald}}>+ Ingreso</b> en el botón +.<br/>
          Con {COP(parseFloat(tmp)||sal)} te sugiero:<br/>
          <span style={{color:C.sky}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:C.indigo}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.10))} Aportes a metas (10%)</span><br/>
          <span style={{color:C.text.b}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.85))} Gastos libres</span>
        </div>
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,rgba(2,44,34,0.5),rgba(15,23,42,0.8))",borderColor:`${C.emerald}22`}}>
        <Lbl style={{color:"#34d399"}}>Total guardado en metas</Lbl>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:14,color:C.text.h}}>⭐ En todas las metas</span>
          <span style={{fontSize:14,fontWeight:800,color:C.indigo}}>{COP(metaTotal)}</span>
        </div>
        <div style={{fontSize:11,color:C.text.s,marginTop:8,lineHeight:1.6}}>
          Cada meta tiene su propio progreso. Ve a la pestaña ⭐ Metas para ver el detalle.
        </div>
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,rgba(30,27,75,0.5),rgba(15,23,42,0.8))",borderColor:`${C.indigo}28`}}>
        <div style={{fontSize:12,color:C.indigo,fontWeight:700,marginBottom:8,letterSpacing:1}}>📐 REGLA DE ORO</div>
        <div style={{fontSize:14,color:C.text.b,lineHeight:1.9}}><b style={{color:C.text.h}}>Págate primero.</b> Al recibir el sueldo, transfiere el ahorro <i>antes</i> de gastar.</div>
      </Card>
      <div style={{textAlign:"center",fontSize:12,color:C.text.s,padding:"18px 0",lineHeight:1.8}}>Datos guardados en Firebase · accesibles desde cualquier dispositivo.</div>
    </div>;
  };

  // Nav con ícono correcto para Metas (⭐ en lugar de 🎯)
  // Ícono SVG estrella outline para Metas
  function StarIcon({active}){
    const pts="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26";
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={active?"#f59e0b":"rgba(255,255,255,0.22)"} strokeWidth={active?"1.8":"1.5"}
      strokeLinecap="round" strokeLinejoin="round">
      <polygon points={pts}/>
    </svg>;
  }

  const NAV=[
    {id:"home",  icon:"⬡", label:"Inicio",   activeColor:C.emerald},
    {id:"metas", icon:null, label:"Metas",    activeColor:"#f59e0b"},
    {id:"mov",   icon:"≡", label:"Movim.",   activeColor:C.emerald},
    {id:"cfg",   icon:"◎", label:"Config",   activeColor:C.emerald},
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
    <div style={{padding:"16px 20px 14px",background:`${C.bg}f0`,position:"sticky",top:0,zIndex:20,borderBottom:`1px solid ${C.border}`,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:C.text.s,letterSpacing:2.5,fontWeight:700,marginBottom:2}}>MIS FINANZAS PRO</div>
        <div style={{fontSize:21,fontWeight:900,letterSpacing:-0.5,color:C.text.h}}>{user.displayName?.split(" ")[0]} 👋</div>
      </div>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 14px",fontSize:12,color:C.text.b,fontWeight:700}}>{MONTHS_S[now.getMonth()]} {now.getFullYear()}</div>
    </div>
    {tab==="home"&&<HomeTab/>}{tab==="metas"&&<MetasTab/>}{tab==="mov"&&<MovTab/>}{tab==="cfg"&&<ConfigTab/>}
    {/* FAB */}
    {!modal&&!goalModal&&<button onClick={()=>tab==="metas"?setGoalModal("new"):setModal("new")} style={{
      position:"fixed",bottom:92,right:20,
      width:60,height:60,borderRadius:"50%",
      background:tab==="metas"
        ?`linear-gradient(135deg,#818cf8,#6366f1,#4338ca)`
        :`linear-gradient(135deg,#34d399,#10b981,#059669)`,
      border:"none",fontSize:30,color:"#fff",cursor:"pointer",
      boxShadow:tab==="metas"
        ?`0 8px 32px rgba(99,102,241,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`
        :`0 8px 32px rgba(16,185,129,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:100,lineHeight:1,
      transition:"all 0.3s ease",
    }}>＋</button>}
    {modal&&<TxModal initial={modal==="new"?null:modal} goals={goals} saldoDisponible={saldo} onClose={()=>setModal(null)} onSave={handleSave} onDelete={handleDelete}/>}
    {goalModal&&<GoalModal initial={goalModal==="new"?null:goalModal} onClose={()=>setGoalModal(null)} onSave={handleGoalSave} onDelete={handleGoalDelete}/>}
    {AlertaGastoModal}
    {/* Nav */}
    <nav style={{
      position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,
      background:"rgba(8,14,30,0.92)",
      borderTop:"1px solid rgba(255,255,255,0.10)",
      backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      display:"flex",justifyContent:"space-around",padding:"12px 0 20px",zIndex:50,
    }}>
      {NAV.map(v=><button key={v.id} onClick={()=>setTab(v.id)} style={{
        background:"none",border:"none",cursor:"pointer",
        display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        color:tab===v.id?v.activeColor:"rgba(255,255,255,0.28)",
        transition:"color 0.2s",
        padding:"4px 12px",
      }}>
        {v.id==="metas"
          ?<StarIcon active={tab==="metas"}/>
          :<span style={{fontSize:22,lineHeight:1}}>{v.icon}</span>}
        <span style={{fontSize:9,fontWeight:tab===v.id?800:600,letterSpacing:0.5}}>{v.label}</span>
      </button>)}
    </nav>
  </div>;
}