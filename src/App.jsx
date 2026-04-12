import { useState, useEffect, useRef, useCallback } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  getDoc, setDoc
} from "firebase/firestore";

// ─── CATEGORÍAS 2 NIVELES ────────────────────────────────────────────────────
const MAIN_CATS = [
  {
    id: "comida",    label: "Comida",     icon: "🍽️", color: "#facc15",
    subs: [
      { id: "restaurantes",  label: "Restaurantes",  icon: "🍜" },
      { id: "mercado",       label: "Mercado",       icon: "🛒" },
      { id: "domicilios",    label: "Domicilios",    icon: "🛵" },
      { id: "cafeteria",     label: "Cafetería",     icon: "☕" },
    ]
  },
  {
    id: "hogar",     label: "Hogar",      icon: "🏠", color: "#60a5fa",
    subs: [
      { id: "arriendo",      label: "Arriendo",      icon: "🏘️" },
      { id: "servicios",     label: "Servicios",     icon: "💡" },
      { id: "aseo",          label: "Aseo",          icon: "🧹" },
      { id: "reparaciones",  label: "Reparaciones",  icon: "🔧" },
    ]
  },
  {
    id: "transporte", label: "Transporte", icon: "🚗", color: "#34d399",
    subs: [
      { id: "bus",           label: "Bus/Metro",     icon: "🚌" },
      { id: "taxi",          label: "Taxi/Uber",     icon: "🚕" },
      { id: "gasolina",      label: "Gasolina",      icon: "⛽" },
      { id: "parqueadero",   label: "Parqueadero",   icon: "🅿️" },
    ]
  },
  {
    id: "salud",     label: "Salud",      icon: "💊", color: "#f87171",
    subs: [
      { id: "medico",        label: "Médico",        icon: "🏥" },
      { id: "medicamentos",  label: "Medicamentos",  icon: "💉" },
      { id: "gym",           label: "Gym",           icon: "🏋️" },
      { id: "suplementos",   label: "Suplementos",   icon: "💪" },
    ]
  },
  {
    id: "ocio",      label: "Ocio",       icon: "🎉", color: "#e879f9",
    subs: [
      { id: "salidas",       label: "Salidas",       icon: "🥂" },
      { id: "streaming",     label: "Streaming",     icon: "📺" },
      { id: "juegos",        label: "Juegos",        icon: "🎮" },
      { id: "viajes",        label: "Viajes",        icon: "✈️" },
    ]
  },
  {
    id: "estilo",    label: "Estilo",     icon: "👕", color: "#a78bfa",
    subs: [
      { id: "ropa",          label: "Ropa",          icon: "👗" },
      { id: "calzado",       label: "Calzado",       icon: "👟" },
      { id: "accesorios",    label: "Accesorios",    icon: "💍" },
      { id: "belleza",       label: "Belleza",       icon: "💄" },
    ]
  },
  {
    id: "otros_main", label: "Otros",    icon: "📦", color: "#94a3b8",
    subs: [
      { id: "tecnologia",    label: "Tecnología",    icon: "💻" },
      { id: "educacion",     label: "Educación",     icon: "📚" },
      { id: "mascotas",      label: "Mascotas",      icon: "🐾" },
      { id: "otros",         label: "Otros",         icon: "🗂️" },
    ]
  },
];

const SAVINGS = [
  { id: "nu",           label: "Cajita Nu",        icon: "💚", color: "#22c55e" },
  { id: "emergencias",  label: "Fondo Emergencias", icon: "🛡️", color: "#0ea5e9" },
];

// Aplanar todas las subcategorías para búsquedas y display
const ALL_SUBS = MAIN_CATS.flatMap(m =>
  m.subs.map(s => ({ ...s, mainId: m.id, mainLabel: m.label, color: m.color }))
);
const ALL_CATS_FLAT = [
  ...ALL_SUBS,
  ...SAVINGS,
];

function getCatInfo(catId) {
  const sub = ALL_SUBS.find(s => s.id === catId);
  if (sub) return sub;
  const sav = SAVINGS.find(s => s.id === catId);
  if (sav) return sav;
  // Legado: ids viejos
  return { id: catId, label: catId, icon: "📦", color: "#94a3b8" };
}

function getMainForSub(catId) {
  return MAIN_CATS.find(m => m.subs.some(s => s.id === catId));
}

const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const now = new Date();
const COP = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const isMonth = (s,m,y) => { const d=new Date(s); return d.getMonth()===m && d.getFullYear()===y; };

// ─── COUNT UP ────────────────────────────────────────────────────────────────
function useCountUp(target, ms=700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  const raf  = useRef(null);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now()-t0)/ms, 1);
      setV(Math.round(from + (target-from)*(1-Math.pow(1-p,3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return v;
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function Ring({ pct, size=64, stroke=6, color="#22c55e", label }) {
  const r = (size-stroke)/2, c2 = 2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c2} strokeDashoffset={c2*(1-Math.min(pct,1))}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:"stroke-dashoffset 0.8s ease"}}/>
      {label !== undefined && (
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={size*0.17} fontWeight="bold" fontFamily="DM Sans,sans-serif">
          {label}
        </text>
      )}
    </svg>
  );
}

function Bar({ pct, color, h=5 }) {
  return (
    <div style={{background:"#1e293b",borderRadius:99,height:h,overflow:"hidden"}}>
      <div style={{height:h,borderRadius:99,background:color,
        width:`${Math.min(pct*100,100)}%`,transition:"width 0.7s ease"}}/>
    </div>
  );
}

function Card({ children, style={} }) {
  return <div style={{background:"#0f172a",borderRadius:16,padding:16,border:"1px solid #1e293b",...style}}>{children}</div>;
}

function Lbl({ children, style={} }) {
  return <div style={{fontSize:10,color:"#475569",letterSpacing:1.5,fontWeight:700,
    textTransform:"uppercase",marginBottom:4,...style}}>{children}</div>;
}

// ─── SELECTOR DE CATEGORÍAS 2 NIVELES ───────────────────────────────────────
function CatSelector({ value, onChange }) {
  // Determinar main actual desde el sub seleccionado
  const currentMain = MAIN_CATS.find(m => m.subs.some(s => s.id === value));
  const [selMain, setSelMain] = useState(currentMain?.id || null);
  const isSaving = !!SAVINGS.find(s => s.id === value);

  function handleMainClick(m) {
    if (selMain === m.id) {
      setSelMain(null); // colapsar si ya está abierto
    } else {
      setSelMain(m.id);
    }
  }

  function handleSubClick(subId) {
    onChange(subId);
    setSelMain(null);
  }

  function handleSavClick(sId) {
    onChange(sId);
    setSelMain(null);
  }

  return (
    <div>
      {/* Nivel 1 — Categorías principales */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>
        {MAIN_CATS.map(m => {
          const isActive = currentMain?.id === m.id && !isSaving;
          const isOpen   = selMain === m.id;
          return (
            <button key={m.id} onMouseDown={e=>e.preventDefault()}
              onClick={() => handleMainClick(m)}
              style={{
                display:"flex",flexDirection:"column",alignItems:"center",
                gap:3,padding:"10px 4px",borderRadius:14,border:"none",
                cursor:"pointer",
                background: isOpen ? `${m.color}33` : isActive ? `${m.color}22` : "#0f172a",
                outline: (isActive || isOpen) ? `2px solid ${m.color}` : "2px solid transparent",
                transition:"all 0.15s",
              }}>
              <span style={{fontSize:20}}>{m.icon}</span>
              <span style={{fontSize:9,fontWeight:700,
                color:(isActive||isOpen)?m.color:"#334155",letterSpacing:0.3}}>
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Nivel 2 — Subcategorías (aparecen al seleccionar main) */}
      {selMain && (() => {
        const main = MAIN_CATS.find(m => m.id === selMain);
        return (
          <div style={{
            background:`${main.color}11`,
            border:`1px solid ${main.color}33`,
            borderRadius:14,padding:"10px 8px",marginBottom:8,
            animation:"slideDown 0.18s ease",
          }}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {main.subs.map(s => {
                const isActive = value === s.id;
                return (
                  <button key={s.id} onMouseDown={e=>e.preventDefault()}
                    onClick={() => handleSubClick(s.id)}
                    style={{
                      display:"flex",flexDirection:"column",alignItems:"center",
                      gap:3,padding:"10px 4px",borderRadius:12,border:"none",
                      cursor:"pointer",
                      background: isActive ? `${main.color}33` : "#0f172a",
                      outline: isActive ? `2px solid ${main.color}` : "2px solid transparent",
                      transition:"all 0.12s",
                    }}>
                    <span style={{fontSize:18}}>{s.icon}</span>
                    <span style={{fontSize:9,fontWeight:700,
                      color:isActive?main.color:"#475569",textAlign:"center",
                      lineHeight:1.2}}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Fila de Ahorros */}
      <div style={{display:"flex",gap:6}}>
        {SAVINGS.map(s => {
          const isActive = value === s.id;
          return (
            <button key={s.id} onMouseDown={e=>e.preventDefault()}
              onClick={() => handleSavClick(s.id)}
              style={{
                flex:1,display:"flex",alignItems:"center",
                justifyContent:"center",gap:6,
                padding:"10px 8px",borderRadius:12,border:"none",
                cursor:"pointer",
                background: isActive ? `${s.color}22` : "#0f172a",
                outline: isActive ? `2px solid ${s.color}` : "2px solid transparent",
                transition:"all 0.12s",
              }}>
              <span style={{fontSize:16}}>{s.icon}</span>
              <span style={{fontSize:11,fontWeight:700,
                color:isActive?s.color:"#334155"}}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div style={{minHeight:"100vh",background:"#030712",display:"flex",
      flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>💰</div>
        <div style={{fontSize:28,fontWeight:900,color:"#f8fafc",letterSpacing:-1}}>Mis Finanzas</div>
        <div style={{fontSize:14,color:"#334155",marginTop:8,lineHeight:1.6}}>
          Controla tus gastos.<br/>Crece tu ahorro.
        </div>
      </div>
      <div style={{background:"#0f172a",borderRadius:20,padding:28,
        border:"1px solid #1e293b",width:"100%",maxWidth:340,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#475569",marginBottom:20,lineHeight:1.6}}>
          Inicia sesión con Google para acceder a tu cuenta.
          Tus datos son privados y solo tú los puedes ver.
        </div>
        <button onClick={onLogin} disabled={loading} style={{
          width:"100%",padding:"14px 20px",borderRadius:12,border:"none",
          background:loading?"#1e293b":"#fff",color:"#1a1a1a",fontWeight:700,
          fontSize:15,cursor:loading?"not-allowed":"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
        }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
            <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/>
            <path fill="#FBBC05" d="M24 46c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.7 37 27 38 24 38c-5.7 0-10.6-3.1-11.7-8.4l-7 5.4C8.6 41.7 15.7 46 24 46z"/>
            <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1 3-3.3 5.4-6.3 7L36.2 41c4.4-4.1 7.8-10.3 7.8-18 0-1.3-.2-2.7-.5-4z"/>
          </svg>
          {loading ? "Iniciando..." : "Continuar con Google"}
        </button>
        <div style={{fontSize:11,color:"#1e293b",marginTop:16,lineHeight:1.6}}>
          Tus datos se guardan de forma segura en Firebase.
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingScreen({ user, onSave }) {
  const [salary, setSalary] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit() {
    const val = parseFloat(salary.replace(/\./g,"").replace(",","."));
    if (!val || val < 10000) { setError(true); return; }
    onSave(val);
  }

  function handleInput(e) {
    const raw = e.target.value.replace(/\D/g,"");
    setSalary(raw ? Number(raw).toLocaleString("es-CO") : "");
    setError(false);
  }

  const val = parseFloat(salary.replace(/\./g,"").replace(",",".")) || 0;

  return (
    <div style={{minHeight:"100vh",background:"#030712",display:"flex",
      flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:12}}>🎯</div>
          <div style={{fontSize:24,fontWeight:900,color:"#f8fafc",letterSpacing:-0.5}}>
            ¡Bienvenido, {user.displayName?.split(" ")[0]}!
          </div>
          <div style={{fontSize:14,color:"#475569",marginTop:10,lineHeight:1.7}}>
            Para empezar, cuéntame cuánto<br/>recibes al mes.
          </div>
        </div>

        <div style={{background:"#0f172a",borderRadius:20,padding:24,
          border:"1px solid #1e293b"}}>
          <div style={{fontSize:11,color:"#475569",letterSpacing:1.5,
            fontWeight:700,textTransform:"uppercase",marginBottom:8}}>
            Sueldo o ingreso mensual (COP)
          </div>
          <div style={{
            display:"flex",alignItems:"center",
            background:"#030712",borderRadius:14,overflow:"hidden",
            border:`2px solid ${error?"#ef4444":val>0?"#22c55e":"#1e293b"}`,
            transition:"border-color 0.2s",marginBottom:12,
          }}>
            <span style={{padding:"0 14px",color:"#475569",fontSize:20,lineHeight:"60px"}}>$</span>
            <input
              inputMode="numeric"
              placeholder="0"
              value={salary}
              onChange={handleInput}
              autoFocus
              style={{flex:1,background:"none",border:"none",outline:"none",
                fontSize:28,fontWeight:800,color:"#f8fafc",padding:"0 8px",
                height:60,letterSpacing:-0.5}}
            />
          </div>
          {error && (
            <div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>
              Ingresa un monto válido (mínimo $10.000)
            </div>
          )}

          {val > 0 && (
            <div style={{background:"#0a0f1e",borderRadius:12,padding:"12px 14px",
              marginBottom:16,fontSize:12,color:"#94a3b8",lineHeight:1.9}}>
              Distribución sugerida con <b style={{color:"#f8fafc"}}>{COP(val)}</b>:<br/>
              <span style={{color:"#22c55e"}}>💚 {COP(Math.round(val*0.15))} → Cajita Nu (15%)</span><br/>
              <span style={{color:"#0ea5e9"}}>🛡️ {COP(Math.round(val*0.05))} → Emergencias (5%)</span><br/>
              <span style={{color:"#94a3b8"}}>🛒 {COP(Math.round(val*0.80))} → Gastos libres</span>
            </div>
          )}

          <button onClick={handleSubmit} style={{
            width:"100%",padding:16,borderRadius:14,border:"none",
            cursor:val>0?"pointer":"not-allowed",fontSize:16,fontWeight:800,
            background:val>0?"linear-gradient(135deg,#22c55e,#15803d)":"#1e293b",
            color:val>0?"#000":"#334155",transition:"all 0.2s",
          }}>
            {val>0 ? `Empezar con ${COP(val)} →` : "Ingresa tu sueldo"}
          </button>
        </div>

        <div style={{textAlign:"center",fontSize:11,color:"#1e293b",
          marginTop:16,lineHeight:1.6}}>
          Puedes cambiarlo cuando quieras en Configuración.
        </div>
      </div>
    </div>
  );
}

// ─── ALERTA DE PRESUPUESTO ───────────────────────────────────────────────────
function BudgetAlert({ pct, salario, gastado }) {
  if (pct < 0.8) return null;
  const isOver = pct >= 1;
  const color = isOver ? "#ef4444" : "#f59e0b";
  const bgColor = isOver ? "#ef444411" : "#f59e0b11";
  const borderColor = isOver ? "#ef444433" : "#f59e0b33";

  return (
    <div style={{
      background:bgColor,border:`1px solid ${borderColor}`,
      borderRadius:14,padding:"12px 16px",marginBottom:14,
      display:"flex",alignItems:"center",gap:12,
      animation:"pulse 2s infinite",
    }}>
      <span style={{fontSize:24,flexShrink:0}}>{isOver?"🚨":"⚠️"}</span>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:800,color,marginBottom:2}}>
          {isOver ? "¡Presupuesto superado!" : "Cerca del límite mensual"}
        </div>
        <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5}}>
          {isOver
            ? `Llevas ${COP(gastado - salario)} sobre tu sueldo.`
            : `Llevas el ${Math.round(pct*100)}% del sueldo gastado.`
          }
        </div>
      </div>
    </div>
  );
}

// ─── MODAL CRUD ───────────────────────────────────────────────────────────────
function TxModal({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial;
  const [amount, setAmount] = useState(
    initial ? Number(initial.amount).toLocaleString("es-CO") : ""
  );
  const [desc,    setDesc]    = useState(initial?.desc  || "");
  const [cat,     setCat]     = useState(initial?.cat   || "restaurantes");
  const [date,    setDate]    = useState(initial?.date  || todayStr());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const rawAmount = parseFloat(amount.replace(/\./g,"").replace(",",".")) || 0;
  const catInfo   = getCatInfo(cat);
  const isSaving  = !!SAVINGS.find(s => s.id === cat);
  const changed   = isEdit && (
    rawAmount !== initial.amount || desc.trim() !== initial.desc ||
    cat !== initial.cat || date !== initial.date
  );

  function handleAmount(e) {
    const raw = e.target.value.replace(/\D/g,"");
    setAmount(raw ? Number(raw).toLocaleString("es-CO") : "");
  }

  function handleSave() {
    if (!rawAmount) return;
    onSave({
      id: initial?.id || null,
      desc: desc.trim() || catInfo.label,
      amount: rawAmount, cat, date,
    });
    onClose();
  }

  function handleDelete() { onDelete(initial.id); onClose(); }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{position:"fixed",inset:0,background:"#000000cc",
        display:"flex",alignItems:"flex-end",zIndex:300,animation:"fadeIn 0.18s ease"}}>
      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { transform:translateY(40px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes shake   { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        @keyframes slideDown { from { opacity:0;transform:translateY(-8px) } to { opacity:1;transform:translateY(0) } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.75} }
      `}</style>
      <div style={{
        width:"100%",maxWidth:430,margin:"0 auto",
        background:"#0a0f1e",borderRadius:"22px 22px 0 0",
        border:"1px solid #1e293b",
        animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        maxHeight:"92vh",overflowY:"auto",
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}>
          <div style={{width:40,height:4,borderRadius:99,background:"#1e293b"}}/>
        </div>
        <div style={{padding:"0 20px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:18}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>
                {isEdit ? "Editar movimiento" : "Nuevo movimiento"}
              </div>
              {isEdit && (
                <div style={{fontSize:11,color:"#334155",marginTop:2}}>
                  Modifica lo que necesites
                </div>
              )}
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",
              color:"#475569",fontSize:26,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
          </div>

          {/* Monto */}
          <div style={{marginBottom:14}}>
            <Lbl>Monto (COP)</Lbl>
            <div style={{
              display:"flex",alignItems:"center",
              background:"#0f172a",borderRadius:14,overflow:"hidden",
              border:`2px solid ${rawAmount>0 ? (isSaving?"#22c55e":catInfo.color||"#22c55e") : "#1e293b"}`,
              transition:"border-color 0.2s",
            }}>
              <span style={{padding:"0 12px",fontSize:20,lineHeight:"56px"}}>{catInfo.icon}</span>
              <span style={{color:"#334155",fontSize:15,lineHeight:"56px"}}>$</span>
              <input ref={inputRef} inputMode="numeric" placeholder="0"
                value={amount} onChange={handleAmount} enterKeyHint="next"
                style={{flex:1,background:"none",border:"none",outline:"none",
                  fontSize:26,fontWeight:800,color:"#f8fafc",padding:"0 8px",
                  height:56,letterSpacing:-0.5}}/>
              {rawAmount > 0 && (
                <button onMouseDown={e=>e.preventDefault()} onClick={()=>setAmount("")}
                  style={{background:"none",border:"none",cursor:"pointer",
                    color:"#334155",fontSize:20,padding:"0 12px",lineHeight:"56px"}}>×</button>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div style={{marginBottom:14}}>
            <Lbl>¿Qué fue?</Lbl>
            <input placeholder="ej: Proteína ON, Almuerzo, Netflix…"
              value={desc} onChange={e=>setDesc(e.target.value)}
              enterKeyHint="done"
              style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",
                borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,
                outline:"none",boxSizing:"border-box"}}/>
          </div>

          {/* Categoría 2 niveles */}
          <div style={{marginBottom:14}}>
            <Lbl>Categoría</Lbl>
            <CatSelector value={cat} onChange={setCat}/>
          </div>

          {/* Fecha */}
          <div style={{marginBottom:16}}>
            <Lbl>Fecha</Lbl>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",
                borderRadius:12,padding:"11px 14px",color:"#e2e8f0",fontSize:14,
                outline:"none",boxSizing:"border-box"}}/>
          </div>

          {/* Acciones */}
          <div style={{display:"flex",gap:8,marginBottom:24}}>
            {isEdit && !confirmDelete && (
              <button onClick={()=>setConfirmDelete(true)} style={{
                padding:"14px 16px",borderRadius:14,border:"1px solid #ef444433",
                background:"transparent",color:"#ef4444",cursor:"pointer",
                fontSize:20,flexShrink:0,transition:"all 0.2s",
              }}>🗑</button>
            )}
            {isEdit && confirmDelete && (
              <button onClick={handleDelete} style={{
                padding:"14px 16px",borderRadius:14,border:"none",
                background:"#ef4444",color:"#fff",cursor:"pointer",
                fontSize:12,fontWeight:800,flexShrink:0,
                animation:"shake 0.3s ease",
              }}>¿Borrar?</button>
            )}
            <button onClick={handleSave} style={{
              flex:1,padding:14,borderRadius:14,border:"none",cursor:"pointer",
              fontSize:15,fontWeight:800,transition:"all 0.2s",
              background: !rawAmount
                ? "#1e293b"
                : isEdit && !changed
                  ? "#1e3a5f"
                  : isSaving
                    ? "linear-gradient(135deg,#22c55e,#15803d)"
                    : `linear-gradient(135deg,${catInfo.color||"#22c55e"},${catInfo.color||"#22c55e"}bb)`,
              color: !rawAmount ? "#334155" : isEdit && !changed ? "#38bdf8" : "#000",
            }}>
              {!rawAmount
                ? "Ingresa un monto"
                : isEdit && !changed
                  ? "Sin cambios"
                  : isEdit
                    ? `✓ Guardar cambios`
                    : `Registrar ${COP(rawAmount)} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FILA DE TRANSACCIÓN ──────────────────────────────────────────────────────
function TxRow({ t, onEdit }) {
  const cat     = getCatInfo(t.cat);
  const isAhorr = !!SAVINGS.find(s => s.id === t.cat);
  const [pressed, setPressed] = useState(false);
  return (
    <div onClick={onEdit}
      onMouseDown={()=>setPressed(true)}
      onMouseUp={()=>setPressed(false)}
      onMouseLeave={()=>setPressed(false)}
      style={{
        display:"flex",alignItems:"center",gap:12,
        marginBottom:8,background:pressed?"#1a2744":"#0f172a",
        borderRadius:14,padding:"13px 14px",
        border:`1px solid ${cat.color}22`,
        cursor:"pointer",transition:"background 0.15s, transform 0.1s",
        transform:pressed?"scale(0.985)":"scale(1)",
        userSelect:"none",
      }}>
      <div style={{width:40,height:40,borderRadius:12,background:`${cat.color}18`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:18,flexShrink:0}}>{cat.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {t.desc}
        </div>
        <div style={{fontSize:11,color:"#334155",marginTop:1}}>
          {t.date?.slice(5).replace("-","/")} · {cat.label}
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:800,color:isAhorr?"#22c55e":"#f1f5f9"}}>
          {isAhorr?"+":"-"}{COP(t.amount)}
        </div>
        <div style={{fontSize:10,color:"#1e3a5f",marginTop:2}}>toca para editar</div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,         setUser]         = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  // null = no cargado aún, number = sueldo cargado, false = usuario nuevo
  const [salario,      setSalario]      = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tx,           setTx]           = useState([]);
  const [month,        setMonth]        = useState(now.getMonth());
  const [tab,          setTab]          = useState("home");
  const [nuMeta,       setNuMeta]       = useState(5000000);
  const [modal,        setModal]        = useState(null);
  const [txLoading,    setTxLoading]    = useState(false);

  // ── Auth ──
  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // ── Cargar config del usuario ──
  useEffect(() => {
    if (!user) { setSalario(null); return; }
    getDoc(doc(db, "usuarios", user.uid)).then(snap => {
      if (snap.exists() && snap.data().salario) {
        // Usuario existente con salario guardado
        const d = snap.data();
        setSalario(d.salario);
        if (d.nuMeta) setNuMeta(d.nuMeta);
        setShowOnboarding(false);
      } else {
        // Usuario nuevo — mostrar onboarding
        setSalario(0);
        setShowOnboarding(true);
      }
    });
  }, [user]);

  // ── Guardar config cuando cambia (solo si ya pasó onboarding) ──
  useEffect(() => {
    if (!user || salario === null || showOnboarding) return;
    setDoc(doc(db, "usuarios", user.uid), { salario, nuMeta }, { merge: true });
  }, [salario, nuMeta, user, showOnboarding]);

  // ── Transacciones en tiempo real ──
  useEffect(() => {
    if (!user) { setTx([]); return; }
    setTxLoading(true);
    const q = query(
      collection(db, "usuarios", user.uid, "transacciones"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, snap => {
      setTx(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTxLoading(false);
    });
  }, [user]);

  async function handleLogin() {
    setLoginLoading(true);
    try { await signInWithPopup(auth, provider); }
    catch(e) { console.error(e); }
    setLoginLoading(false);
  }

  async function handleLogout() {
    await signOut(auth);
    setTx([]); setTab("home"); setSalario(null); setShowOnboarding(false);
  }

  function handleOnboardingSave(val) {
    setSalario(val);
    setShowOnboarding(false);
    // Guardar directamente en Firestore
    setDoc(doc(db, "usuarios", user.uid), { salario: val, nuMeta }, { merge: true });
  }

  // ── CRUD ──
  const handleSave = useCallback(async (t) => {
    if (!user) return;
    if (t.id) {
      await updateDoc(doc(db, "usuarios", user.uid, "transacciones", t.id), {
        desc: t.desc, amount: t.amount, cat: t.cat, date: t.date,
      });
    } else {
      await addDoc(collection(db, "usuarios", user.uid, "transacciones"), {
        desc: t.desc, amount: t.amount, cat: t.cat, date: t.date,
        createdAt: serverTimestamp(),
      });
    }
  }, [user]);

  const handleDelete = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "usuarios", user.uid, "transacciones", id));
  }, [user]);

  // ── Cálculos ──
  const monthTx    = tx.filter(t => isMonth(t.date, month, now.getFullYear()));
  const gastosTx   = monthTx.filter(t => !SAVINGS.find(s => s.id === t.cat));
  const ahorrTx    = monthTx.filter(t => SAVINGS.find(s => s.id === t.cat));
  const totalGasto = gastosTx.reduce((s,t) => s+t.amount, 0);
  const totalAhorr = ahorrTx.reduce((s,t)  => s+t.amount, 0);
  const sal        = salario || 0;
  const saldo      = sal - totalGasto - totalAhorr;
  const tasaAhorr  = sal > 0 ? totalAhorr / sal : 0;
  const pctUsado   = sal > 0 ? totalGasto / sal : 0;
  const nuTotal    = tx.filter(t => t.cat === "nu").reduce((s,t) => s+t.amount, 0);
  const emgTotal   = tx.filter(t => t.cat === "emergencias").reduce((s,t) => s+t.amount, 0);
  const saldoColor = saldo > sal*0.4 ? "#22c55e" : saldo > sal*0.15 ? "#f59e0b" : "#ef4444";
  const animSaldo  = useCountUp(Math.max(saldo, 0));

  // ── Loading / Login / Onboarding ──
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#030712",display:"flex",
      alignItems:"center",justifyContent:"center",
      color:"#334155",fontFamily:"'DM Sans',sans-serif",fontSize:14}}>
      Cargando...
    </div>
  );
  if (!user)       return <LoginScreen onLogin={handleLogin} loading={loginLoading}/>;
  if (showOnboarding || salario === null) return (
    salario === null
      ? <div style={{minHeight:"100vh",background:"#030712",display:"flex",
          alignItems:"center",justifyContent:"center",
          color:"#334155",fontFamily:"'DM Sans',sans-serif",fontSize:14}}>
          Cargando perfil...
        </div>
      : <OnboardingScreen user={user} onSave={handleOnboardingSave}/>
  );

  // ─── HOME ─────────────────────────────────────────────────────────────────
  const HomeTab = () => {
    // Agrupar gastos por categoría PRINCIPAL
    const byMain = MAIN_CATS.map(m => ({
      ...m,
      total: gastosTx.filter(t => m.subs.some(s => s.id === t.cat))
                     .reduce((s,t) => s+t.amount, 0),
    })).filter(c => c.total > 0).sort((a,b) => b.total - a.total);

    return (
      <div style={{padding:"16px 20px 0"}}>
        {/* Alerta de presupuesto */}
        <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>

        {/* Card principal */}
        <div style={{background:"linear-gradient(160deg,#0a0f1e,#0d1829)",
          borderRadius:20,padding:20,marginBottom:14,
          border:`1px solid ${pctUsado>=0.8?"#f59e0b33":"#1e293b"}`,
          transition:"border-color 0.4s"}}>
          <Lbl style={{marginBottom:2}}>Disponible · {MONTHS_S[month]}</Lbl>
          <div style={{fontSize:38,fontWeight:900,letterSpacing:-2,lineHeight:1,
            color:saldoColor,fontVariantNumeric:"tabular-nums",transition:"color 0.4s"}}>
            {COP(animSaldo)}
          </div>
          <div style={{fontSize:11,color:"#334155",marginTop:4}}>
            de {COP(sal)} · gastado {COP(totalGasto)}
          </div>
          <div style={{marginTop:14}}>
            <Bar pct={pctUsado} color={
              pctUsado >= 1 ? "#ef4444" :
              pctUsado > 0.8 ? "#f59e0b" :
              pctUsado > 0.65 ? "#f59e0b" : "#22c55e"
            }/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
              <span style={{fontSize:10,color:"#1e293b"}}>Gastos</span>
              <span style={{fontSize:10,
                color:pctUsado>=0.8?"#f59e0b":"#1e293b"}}>
                {Math.round(pctUsado*100)}% del sueldo
              </span>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[
            {l:"Gastos",      v:COP(totalGasto), c:"#ef4444"},
            {l:"Ahorrado",    v:COP(totalAhorr), c:"#22c55e"},
            {l:"Tasa ahorro", v:`${Math.round(tasaAhorr*100)}%`, c:"#a78bfa"},
          ].map(k=>(
            <Card key={k.l} style={{padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#334155",letterSpacing:1,marginBottom:4}}>
                {k.l.toUpperCase()}
              </div>
              <div style={{fontSize:13,fontWeight:800,color:k.c}}>{k.v}</div>
            </Card>
          ))}
        </div>

        {/* Cajita Nu */}
        <Card style={{marginBottom:14,background:"linear-gradient(135deg,#042f2e,#0f172a)",borderColor:"#22c55e22"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <Ring pct={nuTotal/nuMeta} size={54} stroke={5} color="#22c55e"
              label={`${Math.round(Math.min(nuTotal/nuMeta,1)*100)}%`}/>
            <div>
              <div style={{fontSize:11,color:"#4ade80",fontWeight:700}}>💚 Cajita Nu</div>
              <div style={{fontSize:22,fontWeight:900,color:"#22c55e",letterSpacing:-1}}>
                {COP(nuTotal)}
              </div>
              <div style={{fontSize:10,color:"#1e293b"}}>Meta: {COP(nuMeta)}</div>
            </div>
          </div>
        </Card>

        {/* Gastos por categoría principal */}
        {byMain.length > 0 && (
          <>
            <Lbl>Gastos por categoría</Lbl>
            {byMain.map(c=>(
              <Card key={c.id} style={{marginBottom:8,borderColor:`${c.color}22`}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,
                    background:`${c.color}18`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:16,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600}}>{c.label}</span>
                      <span style={{fontSize:13,fontWeight:800,color:c.color}}>
                        {COP(c.total)}
                      </span>
                    </div>
                    <Bar pct={c.total/Math.max(totalGasto,1)} color={c.color}/>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {txLoading && (
          <div style={{textAlign:"center",padding:20,color:"#334155",fontSize:12}}>
            Cargando...
          </div>
        )}
        {!txLoading && monthTx.length === 0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",
            fontSize:13,lineHeight:2}}>
            Sin movimientos aún.<br/>
            <span style={{fontSize:28}}>👆</span><br/>
            Toca <b style={{color:"#22c55e"}}>+</b> para registrar.
          </div>
        )}
      </div>
    );
  };

  // ─── MOVIMIENTOS ──────────────────────────────────────────────────────────
  const MovTab = () => {
    const sorted = [...monthTx].sort((a,b) => new Date(b.date)-new Date(a.date));
    return (
      <div style={{padding:"16px 20px 0"}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12,scrollbarWidth:"none"}}>
          {MONTHS_S.map((m,i) => (
            <button key={i} onClick={() => setMonth(i)} style={{
              flexShrink:0,padding:"5px 13px",borderRadius:99,border:"none",
              cursor:"pointer",fontSize:11,fontWeight:700,
              background:month===i?"#22c55e":"#0f172a",
              color:month===i?"#000":"#334155"}}>
              {m}
            </button>
          ))}
        </div>
        <Card style={{marginBottom:14}}>
          <Lbl>Resumen · {MONTHS[month]}</Lbl>
          {[
            {l:"Salario",    v:sal,         c:"#94a3b8"},
            {l:"Gastos",     v:totalGasto,  c:"#ef4444"},
            {l:"Ahorros",    v:totalAhorr,  c:"#22c55e"},
            {l:"Disponible", v:saldo,       c:saldoColor},
          ].map(k=>(
            <div key={k.l} style={{display:"flex",justifyContent:"space-between",
              padding:"7px 0",borderBottom:"1px solid #0a0f1e"}}>
              <span style={{fontSize:13,color:"#475569"}}>{k.l}</span>
              <span style={{fontSize:13,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
            </div>
          ))}
        </Card>
        {sorted.length > 0 && (
          <div style={{fontSize:11,color:"#1e3a5f",textAlign:"center",marginBottom:10}}>
            ✏️ Toca cualquier movimiento para editarlo
          </div>
        )}
        {sorted.length === 0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",fontSize:13}}>
            Sin movimientos en {MONTHS[month]}
          </div>
        )}
        {sorted.map(t => (
          <TxRow key={t.id} t={t} onEdit={() => setModal(t)}/>
        ))}
      </div>
    );
  };

  // ─── CONFIG ───────────────────────────────────────────────────────────────
  const ConfigTab = () => {
    const [tmp,   setTmp]   = useState(String(sal));
    const [tmpNu, setTmpNu] = useState(String(nuMeta));
    return (
      <div style={{padding:"16px 20px 0"}}>
        <Card style={{marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
          <img src={user.photoURL} alt=""
            style={{width:44,height:44,borderRadius:"50%"}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"#f8fafc"}}>{user.displayName}</div>
            <div style={{fontSize:11,color:"#475569"}}>{user.email}</div>
          </div>
          <button onClick={handleLogout} style={{background:"none",
            border:"1px solid #ef444433",borderRadius:8,padding:"6px 12px",
            color:"#ef4444",cursor:"pointer",fontSize:11,fontWeight:700}}>
            Salir
          </button>
        </Card>

        <Card style={{marginBottom:12}}>
          <Lbl>Sueldo mensual (COP)</Lbl>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)}
              style={{flex:1,background:"#0a0f1e",border:"1px solid #1e293b",
                borderRadius:10,padding:"10px 12px",color:"#f8fafc",fontSize:16,outline:"none"}}/>
            <button onClick={()=>setSalario(parseFloat(tmp)||sal)} style={{
              background:"#22c55e",border:"none",borderRadius:10,
              padding:"0 18px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:16}}>
              ✓
            </button>
          </div>
          <div style={{fontSize:11,color:"#1e293b",background:"#0a0f1e",
            borderRadius:8,padding:"10px 12px",lineHeight:1.9}}>
            Con {COP(parseFloat(tmp)||sal)} te recomiendo:<br/>
            <span style={{color:"#22c55e"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.15))} Cajita Nu (15%)</span><br/>
            <span style={{color:"#0ea5e9"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.05))} Emergencias (5%)</span><br/>
            <span style={{color:"#94a3b8"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.80))} Gastos libres</span>
          </div>
        </Card>

        <Card style={{marginBottom:12}}>
          <Lbl>Meta cajita Nu</Lbl>
          <div style={{display:"flex",gap:8}}>
            <input type="number" value={tmpNu} onChange={e=>setTmpNu(e.target.value)}
              style={{flex:1,background:"#0a0f1e",border:"1px solid #1e293b",
                borderRadius:10,padding:"10px 12px",color:"#f8fafc",fontSize:16,outline:"none"}}/>
            <button onClick={()=>setNuMeta(parseFloat(tmpNu)||nuMeta)} style={{
              background:"#22c55e",border:"none",borderRadius:10,
              padding:"0 18px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:16}}>
              ✓
            </button>
          </div>
        </Card>

        <Card style={{marginBottom:12,background:"linear-gradient(135deg,#042f2e,#0f172a)",borderColor:"#22c55e22"}}>
          <Lbl style={{color:"#4ade80"}}>Ahorros acumulados</Lbl>
          {[
            {l:"💚 Cajita Nu",          v:nuTotal,  c:"#22c55e"},
            {l:"🛡️ Fondo emergencias",  v:emgTotal, c:"#0ea5e9"},
          ].map(k=>(
            <div key={k.l} style={{display:"flex",justifyContent:"space-between",
              padding:"8px 0",borderBottom:"1px solid #0a2a28"}}>
              <span style={{fontSize:13,color:"#475569"}}>{k.l}</span>
              <span style={{fontSize:13,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
            </div>
          ))}
        </Card>

        <Card style={{marginBottom:12,background:"linear-gradient(135deg,#1e1b4b,#0f172a)",borderColor:"#4338ca44"}}>
          <div style={{fontSize:11,color:"#818cf8",fontWeight:700,marginBottom:8,letterSpacing:1}}>
            📐 REGLA DE ORO
          </div>
          <div style={{fontSize:13,color:"#c7d2fe",lineHeight:1.8}}>
            <b>Págate primero.</b> Al recibir el sueldo, transfiere ahorro{" "}
            <i>antes</i> de gastar.
          </div>
        </Card>

        <div style={{textAlign:"center",fontSize:11,color:"#1e293b",
          padding:"16px 0",lineHeight:1.7}}>
          Datos guardados en Firebase · accesibles desde cualquier dispositivo.
        </div>
      </div>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#030712",color:"#e2e8f0",
      fontFamily:"'DM Sans','Segoe UI',sans-serif",
      maxWidth:430,margin:"0 auto",paddingBottom:80}}>

      <style>{`
        html, body { background: #030712 !important; margin: 0; padding: 0; }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.75} }
      `}</style>

      {/* Topbar */}
      <div style={{padding:"16px 20px 12px",background:"#030712",position:"sticky",
        top:0,zIndex:20,borderBottom:"1px solid #0a0f1e",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:9,color:"#1e293b",letterSpacing:2.5,fontWeight:700}}>
            MIS FINANZAS PRO
          </div>
          <div style={{fontSize:19,fontWeight:900,letterSpacing:-0.5}}>
            {user.displayName?.split(" ")[0]} 👋
          </div>
        </div>
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,
          padding:"5px 12px",fontSize:11,color:"#334155",fontWeight:700}}>
          {MONTHS_S[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      {tab==="home" && <HomeTab/>}
      {tab==="mov"  && <MovTab/>}
      {tab==="cfg"  && <ConfigTab/>}

      {/* FAB */}
      {!modal && (
        <button onClick={() => setModal("new")} style={{
          position:"fixed",bottom:84,right:20,width:56,height:56,
          borderRadius:"50%",background:"linear-gradient(135deg,#22c55e,#15803d)",
          border:"none",fontSize:28,color:"#000",cursor:"pointer",
          boxShadow:"0 0 28px #22c55e66",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:100,lineHeight:1,
        }}>＋</button>
      )}

      {modal && (
        <TxModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {/* Nav */}
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:430,background:"#030712",
        borderTop:"1px solid #0a0f1e",
        display:"flex",justifyContent:"space-around",padding:"10px 0 16px",zIndex:50}}>
        {[
          {id:"home", icon:"⬡", label:"Inicio"},
          {id:"mov",  icon:"≡", label:"Movimientos"},
          {id:"cfg",  icon:"◎", label:"Config"},
        ].map(v=>(
          <button key={v.id} onClick={() => setTab(v.id)} style={{
            background:"none",border:"none",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            color:tab===v.id?"#22c55e":"#1e293b",transition:"color 0.2s",
          }}>
            <span style={{fontSize:22,lineHeight:1}}>{v.icon}</span>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:0.5}}>{v.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}