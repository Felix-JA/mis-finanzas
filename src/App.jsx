import { useState, useEffect, useRef, useCallback } from "react";

// ─── PERSISTENCIA ─────────────────────────────────────────────────────────────
const STORE_KEY = "felix_finanzas_v3";
function load() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
const CATS = [
  { id:"gym",         label:"Gym",         icon:"🏋️", color:"#f97316" },
  { id:"suplementos", label:"Suplementos", icon:"💪", color:"#fb923c" },
  { id:"servicios",   label:"Servicios",   icon:"📱", color:"#38bdf8" },
  { id:"comida",      label:"Comida",      icon:"🍔", color:"#facc15" },
  { id:"salidas",     label:"Salidas",     icon:"🎉", color:"#e879f9" },
  { id:"ropa",        label:"Ropa",        icon:"👕", color:"#a78bfa" },
  { id:"transporte",  label:"Transporte",  icon:"🚌", color:"#34d399" },
  { id:"otros",       label:"Otros",       icon:"📦", color:"#94a3b8" },
];
const SAVINGS = [
  { id:"nu",          label:"Cajita Nu",        icon:"💚", color:"#22c55e" },
  { id:"emergencias", label:"Fondo Emergencias", icon:"🛡️", color:"#0ea5e9" },
];
const ALL_CATS = [...CATS, ...SAVINGS];

const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const now      = new Date();
const COP      = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const isMonth  = (s,m,y) => { const d=new Date(s); return d.getMonth()===m && d.getFullYear()===y; };

// ─── COUNT UP ─────────────────────────────────────────────────────────────────
function useCountUp(target, ms=700) {
  const [v, setV]   = useState(target);
  const prev        = useRef(target);
  const raf         = useRef(null);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = prev.current; prev.current = target;
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

// ─── MODAL CRUD (agregar + editar) ───────────────────────────────────────────
function TxModal({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial;

  const [amount, setAmount] = useState(
    initial ? Number(initial.amount).toLocaleString("es-CO") : ""
  );
  const [desc,   setDesc]   = useState(initial?.desc   || "");
  const [cat,    setCat]    = useState(initial?.cat    || "comida");
  const [date,   setDate]   = useState(initial?.date   || todayStr());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const catScrollRef = useRef(null);
  const inputRef     = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Scroll a categoría seleccionada al abrir en modo edición
  useEffect(() => {
    if (!catScrollRef.current) return;
    const btn = catScrollRef.current.querySelector(`[data-cat="${cat}"]`);
    if (btn) btn.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
  }, []);

  const rawAmount = parseFloat(amount.replace(/\./g,"").replace(",",".")) || 0;
  const catObj    = ALL_CATS.find(c=>c.id===cat) || ALL_CATS[0];
  const changed   = isEdit && (
    rawAmount !== initial.amount ||
    desc.trim() !== initial.desc ||
    cat !== initial.cat ||
    date !== initial.date
  );

  function handleAmount(e) {
    const raw = e.target.value.replace(/\D/g,"");
    setAmount(raw ? Number(raw).toLocaleString("es-CO") : "");
  }

  function handleSave() {
    if (!rawAmount) return;
    onSave({
      id:     initial?.id || Date.now(),
      desc:   desc.trim() || catObj.label,
      amount: rawAmount,
      cat,
      date,
    });
    onClose();
  }

  function handleDelete() {
    onDelete(initial.id);
    onClose();
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{position:"fixed",inset:0,background:"#000000cc",
        display:"flex",alignItems:"flex-end",zIndex:300,
        animation:"fadeIn 0.18s ease"}}>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { transform:translateY(40px); opacity:0 } to { transform:translateY(0); opacity:1 } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
      `}</style>

      <div style={{
        width:"100%", maxWidth:430, margin:"0 auto",
        background:"#0a0f1e", borderRadius:"22px 22px 0 0",
        border:"1px solid #1e293b",
        animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}>
          <div style={{width:40,height:4,borderRadius:99,background:"#1e293b"}}/>
        </div>

        <div style={{padding:"0 20px 0"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
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
              border:`2px solid ${rawAmount>0 ? catObj.color : "#1e293b"}`,
              transition:"border-color 0.2s",
            }}>
              <span style={{padding:"0 12px",fontSize:20,lineHeight:"56px"}}>{catObj.icon}</span>
              <span style={{color:"#334155",fontSize:15,lineHeight:"56px"}}>$</span>
              <input
                ref={inputRef}
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={handleAmount}
                enterKeyHint="next"
                style={{flex:1,background:"none",border:"none",outline:"none",
                  fontSize:26,fontWeight:800,color:"#f8fafc",padding:"0 8px",
                  height:56,letterSpacing:-0.5}}
              />
              {rawAmount > 0 && (
                <button
                  onMouseDown={e=>e.preventDefault()}
                  onClick={()=>setAmount("")}
                  style={{background:"none",border:"none",cursor:"pointer",
                    color:"#334155",fontSize:20,padding:"0 12px",lineHeight:"56px"}}>×</button>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div style={{marginBottom:14}}>
            <Lbl>¿Qué fue?</Lbl>
            <input
              placeholder="ej: Proteína ON, Almuerzo, Netflix…"
              value={desc}
              onChange={e=>setDesc(e.target.value)}
              enterKeyHint="done"
              style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",
                borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,
                outline:"none",boxSizing:"border-box"}}
            />
          </div>

          {/* Categorías */}
          <div style={{marginBottom:14}}>
            <Lbl>Categoría</Lbl>
            <div
              ref={catScrollRef}
              style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,
                scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              {ALL_CATS.map(c=>(
                <button
                  key={c.id}
                  data-cat={c.id}
                  onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{
                    setCat(c.id);
                    // scroll a la seleccionada
                    const el = catScrollRef.current?.querySelector(`[data-cat="${c.id}"]`);
                    el?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});
                  }}
                  style={{
                    flexShrink:0,display:"flex",flexDirection:"column",
                    alignItems:"center",gap:3,padding:"10px 10px",
                    borderRadius:14,border:"none",cursor:"pointer",minWidth:64,
                    background: cat===c.id?`${c.color}22`:"#0f172a",
                    outline: cat===c.id?`2px solid ${c.color}`:"2px solid transparent",
                    transition:"all 0.15s",
                  }}>
                  <span style={{fontSize:20}}>{c.icon}</span>
                  <span style={{fontSize:9,fontWeight:700,
                    color:cat===c.id?c.color:"#334155",letterSpacing:0.3}}>
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div style={{marginBottom:16}}>
            <Lbl>Fecha</Lbl>
            <input
              type="date"
              value={date}
              onChange={e=>setDate(e.target.value)}
              style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",
                borderRadius:12,padding:"11px 14px",color:"#e2e8f0",fontSize:14,
                outline:"none",boxSizing:"border-box"}}
            />
          </div>

          {/* Acciones */}
          <div style={{display:"flex",gap:8,marginBottom:24}}>

            {/* Botón borrar (solo en edición) */}
            {isEdit && !confirmDelete && (
              <button
                onClick={()=>setConfirmDelete(true)}
                style={{
                  padding:"14px 16px",borderRadius:14,border:"1px solid #ef444433",
                  background:"transparent",color:"#ef4444",cursor:"pointer",
                  fontSize:20,flexShrink:0,transition:"all 0.2s",
                }}>
                🗑
              </button>
            )}

            {/* Confirmar borrado */}
            {isEdit && confirmDelete && (
              <button
                onClick={handleDelete}
                style={{
                  padding:"14px 16px",borderRadius:14,border:"none",
                  background:"#ef4444",color:"#fff",cursor:"pointer",
                  fontSize:12,fontWeight:800,flexShrink:0,
                  animation:"shake 0.3s ease",
                }}>
                ¿Borrar?
              </button>
            )}

            {/* Botón guardar */}
            <button
              onClick={handleSave}
              style={{
                flex:1,padding:14,borderRadius:14,border:"none",cursor:"pointer",
                fontSize:15,fontWeight:800,transition:"all 0.2s",
                background: !rawAmount
                  ? "#1e293b"
                  : isEdit && !changed
                    ? "#1e3a5f"
                    : `linear-gradient(135deg,${catObj.color},${catObj.color}bb)`,
                color: !rawAmount ? "#334155"
                  : isEdit && !changed ? "#38bdf8" : "#000",
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

// ─── FILA DE TRANSACCIÓN ─────────────────────────────────────────────────────
function TxRow({ t, onEdit }) {
  const cat    = ALL_CATS.find(c=>c.id===t.cat) || ALL_CATS[ALL_CATS.length-1];
  const isAhorr = !!SAVINGS.find(s=>s.id===t.cat);
  const [pressed, setPressed] = useState(false);

  return (
    <div
      onClick={onEdit}
      onMouseDown={()=>setPressed(true)}
      onMouseUp={()=>setPressed(false)}
      onMouseLeave={()=>setPressed(false)}
      style={{
        display:"flex",alignItems:"center",gap:12,
        marginBottom:8,background: pressed?"#1a2744":"#0f172a",
        borderRadius:14,padding:"13px 14px",
        border:`1px solid ${cat.color}22`,
        cursor:"pointer",transition:"background 0.15s, transform 0.1s",
        transform: pressed?"scale(0.985)":"scale(1)",
        userSelect:"none",
      }}>

      {/* Icono */}
      <div style={{width:40,height:40,borderRadius:12,background:`${cat.color}18`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:18,flexShrink:0}}>{cat.icon}</div>

      {/* Info */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {t.desc}
        </div>
        <div style={{fontSize:11,color:"#334155",marginTop:1}}>
          {t.date.slice(5).replace("-","/")} · {cat.label}
        </div>
      </div>

      {/* Monto + editar hint */}
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:800,color:isAhorr?"#22c55e":"#f1f5f9"}}>
          {isAhorr?"+":"-"}{COP(t.amount)}
        </div>
        <div style={{fontSize:10,color:"#1e3a5f",marginTop:2}}>
          toca para editar
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [salario, setSalario] = useState(1400000);
  const [tx,      setTx]      = useState([]);
  const [month,   setMonth]   = useState(now.getMonth());
  const [tab,     setTab]     = useState("home");
  const [nuMeta,  setNuMeta]  = useState(5000000);
  const [modal,   setModal]   = useState(null); // null | "new" | {tx object}
  const loaded = useRef(false);

  // Persistencia
  useEffect(() => {
    const d = load();
    if (d) {
      if (d.salario) setSalario(d.salario);
      if (d.tx)      setTx(d.tx);
      if (d.nuMeta)  setNuMeta(d.nuMeta);
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) save({ salario, tx, nuMeta });
  }, [salario, tx, nuMeta]);

  // CRUD
  const handleSave = useCallback((t) => {
    setTx(prev => {
      const exists = prev.find(x => x.id === t.id);
      return exists
        ? prev.map(x => x.id === t.id ? t : x)   // editar
        : [t, ...prev];                             // crear
    });
  }, []);

  const handleDelete = useCallback((id) => {
    setTx(prev => prev.filter(x => x.id !== id));
  }, []);

  // Cálculos
  const monthTx    = tx.filter(t => isMonth(t.date, month, now.getFullYear()));
  const gastosTx   = monthTx.filter(t => !SAVINGS.find(s=>s.id===t.cat));
  const ahorrTx    = monthTx.filter(t =>  SAVINGS.find(s=>s.id===t.cat));
  const totalGasto = gastosTx.reduce((s,t)=>s+t.amount,0);
  const totalAhorr = ahorrTx.reduce((s,t)=>s+t.amount,0);
  const saldo      = salario - totalGasto - totalAhorr;
  const tasaAhorr  = salario>0 ? totalAhorr/salario : 0;
  const pctUsado   = salario>0 ? Math.min(totalGasto/salario,1) : 0;
  const nuTotal    = tx.filter(t=>t.cat==="nu").reduce((s,t)=>s+t.amount,0);
  const emgTotal   = tx.filter(t=>t.cat==="emergencias").reduce((s,t)=>s+t.amount,0);
  const saldoColor = saldo>salario*0.4?"#22c55e":saldo>salario*0.15?"#f59e0b":"#ef4444";
  const animSaldo  = useCountUp(Math.max(saldo,0));

  // ─── HOME ────────────────────────────────────────────────────────────────
  const HomeTab = () => {
    const byCat = CATS.map(c=>({
      ...c,
      total: gastosTx.filter(t=>t.cat===c.id).reduce((s,t)=>s+t.amount,0),
    })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

    return (
      <div style={{padding:"16px 20px 0"}}>

        {/* Saldo */}
        <div style={{background:"linear-gradient(160deg,#0a0f1e,#0d1829)",
          borderRadius:20,padding:20,marginBottom:14,border:"1px solid #1e293b"}}>
          <Lbl style={{marginBottom:2}}>Disponible · {MONTHS_S[month]}</Lbl>
          <div style={{fontSize:38,fontWeight:900,letterSpacing:-2,lineHeight:1,
            color:saldoColor,fontVariantNumeric:"tabular-nums",transition:"color 0.4s"}}>
            {COP(animSaldo)}
          </div>
          <div style={{fontSize:11,color:"#334155",marginTop:4}}>
            de {COP(salario)} · gastado {COP(totalGasto)}
          </div>
          <div style={{marginTop:14}}>
            <Bar pct={pctUsado} color={pctUsado>0.85?"#ef4444":pctUsado>0.65?"#f59e0b":"#22c55e"}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
              <span style={{fontSize:10,color:"#1e293b"}}>Gastos</span>
              <span style={{fontSize:10,color:"#1e293b"}}>{Math.round(pctUsado*100)}% del sueldo</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[
            {l:"Gastos",      v:COP(totalGasto), c:"#ef4444"},
            {l:"Ahorrado",    v:COP(totalAhorr), c:"#22c55e"},
            {l:"Tasa ahorro", v:`${Math.round(tasaAhorr*100)}%`, c:"#a78bfa"},
          ].map(k=>(
            <Card key={k.l} style={{padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#334155",letterSpacing:1,marginBottom:4}}>{k.l.toUpperCase()}</div>
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
              <div style={{fontSize:22,fontWeight:900,color:"#22c55e",letterSpacing:-1}}>{COP(nuTotal)}</div>
              <div style={{fontSize:10,color:"#1e293b"}}>Meta: {COP(nuMeta)}</div>
            </div>
          </div>
        </Card>

        {/* Por categoría */}
        {byCat.length>0 && (
          <>
            <Lbl>Gastos por categoría</Lbl>
            {byCat.map(c=>(
              <Card key={c.id} style={{marginBottom:8,borderColor:`${c.color}22`}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${c.color}18`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:16,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600}}>{c.label}</span>
                      <span style={{fontSize:13,fontWeight:800,color:c.color}}>{COP(c.total)}</span>
                    </div>
                    <Bar pct={c.total/Math.max(totalGasto,1)} color={c.color}/>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {monthTx.length===0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",fontSize:13,lineHeight:2}}>
            Sin movimientos aún.<br/>
            <span style={{fontSize:28}}>👆</span><br/>
            Toca <b style={{color:"#22c55e"}}>+</b> para registrar.
          </div>
        )}
      </div>
    );
  };

  // ─── MOVIMIENTOS ─────────────────────────────────────────────────────────
  const MovTab = () => {
    const sorted = [...monthTx].sort((a,b)=>new Date(b.date)-new Date(a.date));
    return (
      <div style={{padding:"16px 20px 0"}}>

        {/* Mes */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12,scrollbarWidth:"none"}}>
          {MONTHS_S.map((m,i)=>(
            <button key={i} onClick={()=>setMonth(i)} style={{
              flexShrink:0,padding:"5px 13px",borderRadius:99,border:"none",
              cursor:"pointer",fontSize:11,fontWeight:700,
              background:month===i?"#22c55e":"#0f172a",
              color:month===i?"#000":"#334155"}}>
              {m}
            </button>
          ))}
        </div>

        {/* Resumen */}
        <Card style={{marginBottom:14}}>
          <Lbl>Resumen · {MONTHS[month]}</Lbl>
          {[
            {l:"Salario",    v:salario,    c:"#94a3b8"},
            {l:"Gastos",     v:totalGasto, c:"#ef4444"},
            {l:"Ahorros",    v:totalAhorr, c:"#22c55e"},
            {l:"Disponible", v:saldo,      c:saldoColor},
          ].map(k=>(
            <div key={k.l} style={{display:"flex",justifyContent:"space-between",
              padding:"7px 0",borderBottom:"1px solid #0a0f1e"}}>
              <span style={{fontSize:13,color:"#475569"}}>{k.l}</span>
              <span style={{fontSize:13,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
            </div>
          ))}
        </Card>

        {/* Hint edición */}
        {sorted.length>0 && (
          <div style={{fontSize:11,color:"#1e3a5f",textAlign:"center",marginBottom:10}}>
            ✏️ Toca cualquier movimiento para editarlo
          </div>
        )}

        {sorted.length===0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",fontSize:13}}>
            Sin movimientos en {MONTHS[month]}
          </div>
        )}

        {sorted.map(t=>(
          <TxRow key={t.id} t={t} onEdit={()=>setModal(t)}/>
        ))}
      </div>
    );
  };

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  const ConfigTab = () => {
    const [tmp,   setTmp]   = useState(String(salario));
    const [tmpNu, setTmpNu] = useState(String(nuMeta));
    return (
      <div style={{padding:"16px 20px 0"}}>

        <Card style={{marginBottom:12}}>
          <Lbl>Sueldo mensual (COP)</Lbl>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)}
              style={{flex:1,background:"#0a0f1e",border:"1px solid #1e293b",
                borderRadius:10,padding:"10px 12px",color:"#f8fafc",fontSize:16,outline:"none"}}/>
            <button onClick={()=>setSalario(parseFloat(tmp)||salario)} style={{
              background:"#22c55e",border:"none",borderRadius:10,
              padding:"0 18px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:16}}>✓</button>
          </div>
          <div style={{fontSize:11,color:"#1e293b",background:"#0a0f1e",
            borderRadius:8,padding:"10px 12px",lineHeight:1.9}}>
            Con {COP(parseFloat(tmp)||salario)} te recomiendo reservar primero:<br/>
            <span style={{color:"#22c55e"}}>→ {COP(Math.round((parseFloat(tmp)||salario)*0.15))} Cajita Nu (15%)</span><br/>
            <span style={{color:"#0ea5e9"}}>→ {COP(Math.round((parseFloat(tmp)||salario)*0.05))} Emergencias (5%)</span><br/>
            <span style={{color:"#94a3b8"}}>→ {COP(Math.round((parseFloat(tmp)||salario)*0.80))} Gastos libres</span>
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
              padding:"0 18px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:16}}>✓</button>
          </div>
        </Card>

        <Card style={{marginBottom:12,background:"linear-gradient(135deg,#042f2e,#0f172a)",borderColor:"#22c55e22"}}>
          <Lbl style={{color:"#4ade80"}}>Ahorros acumulados</Lbl>
          {[
            {l:"💚 Cajita Nu",         v:nuTotal,  c:"#22c55e"},
            {l:"🛡️ Fondo emergencias", v:emgTotal, c:"#0ea5e9"},
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
            <b>Págate primero.</b> Al recibir el sueldo, transfiere ahorro <i>antes</i> de gastar. Lo que quede, es tuyo para gastar sin culpa.
          </div>
        </Card>

        <Card>
          <Lbl>Zona de riesgo</Lbl>
          <button onClick={()=>{
            if(window.confirm("¿Borrar todos los movimientos? No se puede deshacer.")) {
              setTx([]); save({salario, tx:[], nuMeta});
            }
          }} style={{width:"100%",padding:11,borderRadius:10,cursor:"pointer",
            border:"1px solid #ef444433",background:"transparent",
            color:"#ef4444",fontSize:13,fontWeight:700}}>
            Borrar todos los movimientos
          </button>
        </Card>

        <div style={{textAlign:"center",fontSize:11,color:"#1e293b",padding:"16px 0",lineHeight:1.7}}>
          Datos guardados automáticamente en este dispositivo.
        </div>
      </div>
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#030712",color:"#e2e8f0",
      fontFamily:"'DM Sans','Segoe UI',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:80}}>

      {/* Topbar */}
      <div style={{padding:"16px 20px 12px",background:"#030712",position:"sticky",
        top:0,zIndex:20,borderBottom:"1px solid #0a0f1e",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:9,color:"#1e293b",letterSpacing:2.5,fontWeight:700}}>MIS FINANZAS PRO</div>
          <div style={{fontSize:19,fontWeight:900,letterSpacing:-0.5}}>Felix 👋</div>
        </div>
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,
          padding:"5px 12px",fontSize:11,color:"#334155",fontWeight:700}}>
          {MONTHS_S[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      {/* Vistas */}
      {tab==="home" && <HomeTab/>}
      {tab==="mov"  && <MovTab/>}
      {tab==="cfg"  && <ConfigTab/>}

      {/* FAB */}
      {!modal && (
        <button onClick={()=>setModal("new")} style={{
          position:"fixed",bottom:84,right:20,width:56,height:56,
          borderRadius:"50%",background:"linear-gradient(135deg,#22c55e,#15803d)",
          border:"none",fontSize:28,color:"#000",cursor:"pointer",
          boxShadow:"0 0 28px #22c55e66",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:100,lineHeight:1,
        }}>＋</button>
      )}

      {/* Modal CRUD */}
      {modal && (
        <TxModal
          initial={modal === "new" ? null : modal}
          onClose={()=>setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {/* Nav */}
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:430,background:"#030712",borderTop:"1px solid #0a0f1e",
        display:"flex",justifyContent:"space-around",padding:"10px 0 16px",zIndex:50}}>
        {[
          {id:"home",icon:"⬡",label:"Inicio"},
          {id:"mov", icon:"≡",label:"Movimientos"},
          {id:"cfg", icon:"◎",label:"Config"},
        ].map(v=>(
          <button key={v.id} onClick={()=>setTab(v.id)} style={{
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