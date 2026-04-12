import { useState, useEffect, useRef, useCallback } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  getDoc, setDoc
} from "firebase/firestore";

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

const SAVINGS = [
  {id:"emergencias",label:"Emergencias",icon:"🛡️",color:"#0ea5e9"},
  {id:"meta_aporte",label:"Aporte a Meta",icon:"🎯",color:"#22c55e"},
];

const ALL_SUBS = MAIN_CATS.flatMap(m=>m.subs.map(s=>({...s,mainId:m.id,color:m.color})));

function getCatInfo(id) {
  return ALL_SUBS.find(s=>s.id===id) || SAVINGS.find(s=>s.id===id) ||
    ({gym:{label:"Gym",icon:"🏋️",color:"#f97316"},suplementos:{label:"Suplementos",icon:"💪",color:"#fb923c"},
      servicios:{label:"Servicios",icon:"📱",color:"#38bdf8"},comida:{label:"Comida",icon:"🍔",color:"#facc15"},
      salidas:{label:"Salidas",icon:"🎉",color:"#e879f9"},ropa:{label:"Ropa",icon:"👕",color:"#a78bfa"},
      transporte:{label:"Transporte",icon:"🚌",color:"#34d399"},nu:{label:"Cajita Nu",icon:"💚",color:"#22c55e"},
      otros:{label:"Otros",icon:"📦",color:"#94a3b8"}}[id]) || {label:id,icon:"📦",color:"#94a3b8"};
}

const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const now = new Date();
const COP = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n);
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const isMonth = (s,m,y) => { const d=new Date(s); return d.getMonth()===m&&d.getFullYear()===y; };

// ─── FRASES MOTIVADORAS POR PROGRESO ─────────────────────────────────────────
function getMotivacion(pct, nombre) {
  if (pct >= 1)    return { emoji:"🏆", frase:`¡Lograste tu meta: ${nombre}!` };
  if (pct >= 0.75) return { emoji:"🔥", frase:"¡Ya casi! La recta final." };
  if (pct >= 0.5)  return { emoji:"💪", frase:"Más de la mitad. ¡Sigue así!" };
  if (pct >= 0.25) return { emoji:"🚀", frase:"Tomando impulso. ¡No pares!" };
  return { emoji:"🌱", frase:"Cada peso cuenta. ¡Tú puedes!" };
}

// ─── IMAGEN VIA WIKIPEDIA API (sin API key, CORS habilitado) ─────────────────
const wikiCache = {};

async function fetchGoalImage(name) {
  if (wikiCache[name] !== undefined) return wikiCache[name];
  
  // Limpiar y preparar el query para Wikipedia
  const clean = name.trim()
    .replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i")
    .replace(/[óòö]/g,"o").replace(/[úùü]/g,"u").replace(/ñ/g,"n");
  
  // Intentar primero con el nombre original, luego con versiones alternativas
  const queries = [
    name.trim(),                         // "Gixxer 250"
    clean,                               // "Gixxer 250" sin tildes
    clean.split(" ").slice(0,2).join("_"), // "Gixxer_250"
  ];

  for (const q of queries) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(q)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
      const res = await fetch(url);
      const data = await res.json();
      const pages = data?.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        if (page?.thumbnail?.source) {
          wikiCache[name] = page.thumbnail.source;
          return page.thumbnail.source;
        }
      }
    } catch(e) {}
  }

  // Fallback: Wikipedia en español
  try {
    const url = `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name.trim())}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (pages) {
      const page = Object.values(pages)[0];
      if (page?.thumbnail?.source) {
        wikiCache[name] = page.thumbnail.source;
        return page.thumbnail.source;
      }
    }
  } catch(e) {}

  // Fallback: loremflickr como segunda opción
  const kw = clean.replace(/[^a-z0-9\s]/g,"").split(/\s+/).slice(0,2).join(",");
  const flickr = `https://loremflickr.com/500/300/${encodeURIComponent(kw)},product/all`;
  wikiCache[name] = flickr;
  return flickr;
}

// Hook para imagen asíncrona
function useGoalImage(name) {
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!name || name.trim().length < 2) return;
    setErr(false);
    setImg(null);
    let cancelled = false;
    fetchGoalImage(name).then(url => {
      if (!cancelled) setImg(url);
    });
    return () => { cancelled = true; };
  }, [name]);
  return { img, err, setErr };
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

function Ring({pct,size=64,stroke=6,color="#22c55e",label}){
  const r=(size-stroke)/2,c2=2*Math.PI*r;
  return <svg width={size} height={size} style={{flexShrink:0}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeDasharray={c2} strokeDashoffset={c2*(1-Math.min(pct,1))} strokeLinecap="round"
      transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.8s ease"}}/>
    {label!==undefined&&<text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
      fill={color} fontSize={size*0.18} fontWeight="bold" fontFamily="DM Sans,sans-serif">{label}</text>}
  </svg>;
}

function Bar({pct,color,h=5}){
  return <div style={{background:"#1e293b",borderRadius:99,height:h,overflow:"hidden"}}>
    <div style={{height:h,borderRadius:99,background:color,width:`${Math.min(pct*100,100)}%`,transition:"width 0.7s ease"}}/>
  </div>;
}

function Card({children,style={}}){return <div style={{background:"#0f172a",borderRadius:16,padding:16,border:"1px solid #1e293b",...style}}>{children}</div>;}
function Lbl({children,style={}}){return <div style={{fontSize:10,color:"#475569",letterSpacing:1.5,fontWeight:700,textTransform:"uppercase",marginBottom:4,...style}}>{children}</div>;}

// ─── SELECTOR CATEGORÍAS ──────────────────────────────────────────────────────
function CatSelector({value,onChange}){
  const curMain=MAIN_CATS.find(m=>m.subs.some(s=>s.id===value));
  const [sel,setSel]=useState(curMain?.id||null);
  const isSav=!!SAVINGS.find(s=>s.id===value);
  function MBtn({m}){
    const active=curMain?.id===m.id&&!isSav,open=sel===m.id;
    return <button onMouseDown={e=>e.preventDefault()} onClick={()=>setSel(p=>p===m.id?null:m.id)}
      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"9px 4px",borderRadius:14,border:"none",cursor:"pointer",
        background:open?`${m.color}33`:active?`${m.color}22`:"#0f172a",
        outline:(active||open)?`2px solid ${m.color}`:"2px solid transparent",transition:"all 0.15s"}}>
      <span style={{fontSize:18}}>{m.icon}</span>
      <span style={{fontSize:8,fontWeight:700,color:(active||open)?m.color:"#334155",textAlign:"center",lineHeight:1.2}}>{m.label}</span>
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
      return <div style={{background:`${main.color}11`,border:`1px solid ${main.color}33`,borderRadius:14,padding:"10px 8px",marginBottom:8,animation:"slideDown 0.18s ease"}}>
        <div style={{fontSize:10,color:main.color,fontWeight:700,letterSpacing:1,marginBottom:8,paddingLeft:4}}>{main.icon} {main.label.toUpperCase()} — elige subcategoría</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {main.subs.map(s=>{const a=value===s.id;return <button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(s.id);setSel(null);}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 4px",borderRadius:12,border:"none",cursor:"pointer",
              background:a?`${main.color}33`:"#0f172a",outline:a?`2px solid ${main.color}`:"2px solid transparent",transition:"all 0.12s"}}>
            <span style={{fontSize:18}}>{s.icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:a?main.color:"#475569",textAlign:"center",lineHeight:1.2}}>{s.label}</span>
          </button>;})}
        </div>
      </div>;
    })()}
    <div style={{display:"flex",gap:6}}>
      {SAVINGS.map(s=>{const a=value===s.id;return <button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(s.id);setSel(null);}}
        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 8px",borderRadius:12,border:"none",cursor:"pointer",
          background:a?`${s.color}22`:"#0f172a",outline:a?`2px solid ${s.color}`:"2px solid transparent",transition:"all 0.12s"}}>
        <span style={{fontSize:16}}>{s.icon}</span>
        <span style={{fontSize:11,fontWeight:700,color:a?s.color:"#334155"}}>{s.label}</span>
      </button>;})}
    </div>
  </div>;
}

// ─── MODAL META ───────────────────────────────────────────────────────────────
function GoalModal({initial,onClose,onSave,onDelete}){
  const isEdit=!!initial;
  const [name,setName]=useState(initial?.name||"");
  const [monto,setMonto]=useState(initial?Number(initial.monto).toLocaleString("es-CO"):"");
  const ref=useRef(null);
  useEffect(()=>{const t=setTimeout(()=>ref.current?.focus(),120);return()=>clearTimeout(t);},[]);
  const {img,err,setErr}=useGoalImage(name);
  const val=parseFloat(monto.replace(/\./g,"").replace(",","."))||0;
  function handleM(e){const r=e.target.value.replace(/\D/g,"");setMonto(r?Number(r).toLocaleString("es-CO"):"");}
  function save(){if(!name.trim()||!val)return;onSave({id:initial?.id||null,name:name.trim(),monto:val});onClose();}
  const pct=initial&&initial.monto>0?Math.min((initial._aportado||0)/initial.monto,1):0;
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"flex-end",zIndex:400,animation:"fadeIn 0.18s ease"}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0a0f1e",borderRadius:"22px 22px 0 0",border:"1px solid #1e293b",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:"#1e293b"}}/></div>
      <div style={{padding:"0 20px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{isEdit?"Editar meta":"Nueva meta 🎯"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",fontSize:26,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
        </div>
        {/* Preview imagen con Wikipedia */}
        <div style={{marginBottom:14,borderRadius:14,overflow:"hidden",height:130,background:"#0f172a",position:"relative",border:"1px solid #1e293b"}}>
          {img&&!err
            ?<img src={img} alt={name} onError={()=>setErr(true)} style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.85}}/>
            :name.trim().length>2&&!img
              ?<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
                <div style={{width:24,height:24,borderRadius:"50%",border:"3px solid #22c55e33",borderTopColor:"#22c55e",animation:"spin 0.8s linear infinite"}}/>
                <div style={{fontSize:10,color:"#334155"}}>Buscando imagen...</div>
              </div>
              :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>🎯</div>}
          {img&&!err&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,#0a0f1e)",height:50}}/>}
          {img&&!err&&<div style={{position:"absolute",bottom:8,left:12,fontSize:9,color:"#475569"}}>📷 Wikipedia · imagen de referencia</div>}
        </div>
        <Lbl>Nombre de la meta</Lbl>
        <input ref={ref} placeholder="ej: Gixxer 250, iPhone 18 Pro, Viaje a Cartagena…"
          value={name} onChange={e=>{setName(e.target.value);setErr(false);}}
          style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
        <Lbl>Monto objetivo (COP)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:"#0f172a",borderRadius:14,overflow:"hidden",border:`2px solid ${val>0?"#22c55e":"#1e293b"}`,transition:"border-color 0.2s",marginBottom:18}}>
          <span style={{padding:"0 14px",color:"#475569",fontSize:16,lineHeight:"52px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={monto} onChange={handleM}
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:22,fontWeight:800,color:"#f8fafc",padding:"0 8px",height:52,letterSpacing:-0.5}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          {isEdit&&<button onClick={()=>{onDelete(initial.id);onClose();}} style={{padding:"14px 16px",borderRadius:14,border:"1px solid #ef444433",background:"transparent",color:"#ef4444",cursor:"pointer",fontSize:20,flexShrink:0}}>🗑</button>}
          <button onClick={save} style={{flex:1,padding:14,borderRadius:14,border:"none",cursor:"pointer",fontSize:15,fontWeight:800,
            background:(!name.trim()||!val)?"#1e293b":"linear-gradient(135deg,#22c55e,#15803d)",
            color:(!name.trim()||!val)?"#334155":"#000",transition:"all 0.2s"}}>
            {(!name.trim()||!val)?"Completa los campos":isEdit?"✓ Guardar cambios":`Crear meta: ${COP(val)} →`}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

// ─── CARD META (pestaña Metas — con imagen y motivación) ──────────────────────
function GoalCard({goal,aportado,onEdit}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const done=pct>=1;
  const color=done?"#22c55e":pct>0.6?"#a78bfa":"#38bdf8";
  const {img,err,setErr}=useGoalImage(goal.name);
  const mot=getMotivacion(pct,goal.name);
  return <div onClick={onEdit}
    onMouseDown={e=>e.currentTarget.style.transform="scale(0.985)"}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
    style={{background:"#0f172a",borderRadius:18,overflow:"hidden",border:`1px solid ${done?"#22c55e44":"#1e293b"}`,marginBottom:14,cursor:"pointer",transition:"transform 0.15s,border-color 0.3s"}}>
    {/* Imagen */}
    <div style={{height:110,overflow:"hidden",position:"relative",background:"#0a0f1e"}}>
      {img&&!err
        ?<img src={img} alt={goal.name} onError={()=>setErr(true)} style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.8}}/>
        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>
          {done?"🏆":"🎯"}
        </div>}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 30%,#0f172a 100%)"}}/>
      {done&&<div style={{position:"absolute",top:10,right:10,background:"#22c55e",borderRadius:99,padding:"3px 12px",fontSize:10,fontWeight:800,color:"#000"}}>✓ META LOGRADA</div>}
      {/* Frase motivadora sobre imagen */}
      <div style={{position:"absolute",bottom:10,left:14,right:14}}>
        <div style={{fontSize:12,fontWeight:700,color:"#f8fafc",textShadow:"0 1px 8px #000"}}>
          {mot.emoji} {mot.frase}
        </div>
      </div>
    </div>
    {/* Info */}
    <div style={{padding:"12px 14px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f8fafc",flex:1,paddingRight:8}}>{goal.name}</div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:900,color,letterSpacing:-0.5}}>{Math.round(pct*100)}%</div>
          <div style={{fontSize:9,color:"#334155"}}>completado</div>
        </div>
      </div>
      <Bar pct={pct} color={color} h={7}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:7,alignItems:"center"}}>
        <div>
          <span style={{fontSize:11,fontWeight:700,color:"#94a3b8"}}>{COP(aportado)}</span>
          <span style={{fontSize:10,color:"#334155"}}> de {COP(goal.monto)}</span>
        </div>
        <span style={{fontSize:10,color:"#1e3a5f"}}>Faltan {COP(Math.max(goal.monto-aportado,0))}</span>
      </div>
    </div>
  </div>;
}

// ─── META CHIP (Home — pequeño y motivador) ────────────────────────────────
function GoalChip({goal,aportado,onClick}){
  const pct=goal.monto>0?Math.min(aportado/goal.monto,1):0;
  const done=pct>=1;
  const color=done?"#22c55e":pct>0.6?"#a78bfa":"#38bdf8";
  const mot=getMotivacion(pct,goal.name);
  const {img,err,setErr}=useGoalImage(goal.name);
  return <div onClick={onClick}
    style={{background:"#0f172a",borderRadius:14,overflow:"hidden",border:`1px solid ${done?"#22c55e33":"#1e293b"}`,
      cursor:"pointer",display:"flex",alignItems:"stretch",marginBottom:8,transition:"transform 0.12s"}}
    onMouseDown={e=>e.currentTarget.style.transform="scale(0.98)"}
    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
    {/* Miniatura */}
    <div style={{width:60,flexShrink:0,position:"relative",background:"#0a0f1e",overflow:"hidden"}}>
      {img&&!err
        ?<img src={img} alt={goal.name} onError={()=>setErr(true)} style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.75}}/>
        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{done?"🏆":"🎯"}</div>}
    </div>
    {/* Info */}
    <div style={{flex:1,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color:"#f8fafc",lineHeight:1.2,marginBottom:2}}>{goal.name}</div>
          <div style={{fontSize:10,color:color,fontWeight:600}}>{mot.emoji} {mot.frase}</div>
        </div>
        <div style={{fontSize:16,fontWeight:900,color,marginLeft:8,flexShrink:0}}>{Math.round(pct*100)}%</div>
      </div>
      <Bar pct={pct} color={color} h={4}/>
      <div style={{fontSize:9,color:"#334155",marginTop:4}}>Faltan {COP(Math.max(goal.monto-aportado,0))}</div>
    </div>
  </div>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,loading}){
  return <div style={{minHeight:"100vh",background:"#030712",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{marginBottom:32,textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:12}}>💰</div>
      <div style={{fontSize:28,fontWeight:900,color:"#f8fafc",letterSpacing:-1}}>Mis Finanzas</div>
      <div style={{fontSize:14,color:"#334155",marginTop:8,lineHeight:1.6}}>Controla tus gastos.<br/>Crece tu ahorro.</div>
    </div>
    <div style={{background:"#0f172a",borderRadius:20,padding:28,border:"1px solid #1e293b",width:"100%",maxWidth:340,textAlign:"center"}}>
      <div style={{fontSize:13,color:"#475569",marginBottom:20,lineHeight:1.6}}>Inicia sesión con Google para acceder a tu cuenta.</div>
      <button onClick={onLogin} disabled={loading} style={{width:"100%",padding:"14px 20px",borderRadius:12,border:"none",background:loading?"#1e293b":"#fff",color:"#1a1a1a",fontWeight:700,fontSize:15,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
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

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingScreen({user,onSave}){
  const [salary,setSalary]=useState(""), [error,setError]=useState(false);
  const val=parseFloat(salary.replace(/\./g,"").replace(",","."))||0;
  function hi(e){const r=e.target.value.replace(/\D/g,"");setSalary(r?Number(r).toLocaleString("es-CO"):"");setError(false);}
  function sub(){if(!val||val<10000){setError(true);return;}onSave(val);}
  return <div style={{minHeight:"100vh",background:"#030712",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:48,marginBottom:12}}>🎯</div>
        <div style={{fontSize:24,fontWeight:900,color:"#f8fafc",letterSpacing:-0.5}}>Bienvenido, {user.displayName?.split(" ")[0]}!</div>
        <div style={{fontSize:14,color:"#475569",marginTop:10,lineHeight:1.7}}>Para empezar, cuéntame cuánto<br/>recibes al mes.</div>
      </div>
      <div style={{background:"#0f172a",borderRadius:20,padding:24,border:"1px solid #1e293b"}}>
        <Lbl>Sueldo o ingreso mensual (COP)</Lbl>
        <div style={{display:"flex",alignItems:"center",background:"#030712",borderRadius:14,overflow:"hidden",border:`2px solid ${error?"#ef4444":val>0?"#22c55e":"#1e293b"}`,transition:"border-color 0.2s",marginBottom:12}}>
          <span style={{padding:"0 14px",color:"#475569",fontSize:20,lineHeight:"60px"}}>$</span>
          <input inputMode="numeric" placeholder="0" value={salary} onChange={hi} autoFocus
            style={{flex:1,background:"none",border:"none",outline:"none",fontSize:28,fontWeight:800,color:"#f8fafc",padding:"0 8px",height:60,letterSpacing:-0.5}}/>
        </div>
        {error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>Ingresa un monto válido (mínimo $10.000)</div>}
        {val>0&&<div style={{background:"#0a0f1e",borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#94a3b8",lineHeight:1.9}}>
          Distribución sugerida con <b style={{color:"#f8fafc"}}>{COP(val)}</b>:<br/>
          <span style={{color:"#0ea5e9"}}>🛡️ {COP(Math.round(val*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:"#22c55e"}}>🎯 {COP(Math.round(val*0.10))} Metas (10%)</span><br/>
          <span style={{color:"#94a3b8"}}>🛒 {COP(Math.round(val*0.85))} Gastos libres</span>
        </div>}
        <button onClick={sub} style={{width:"100%",padding:16,borderRadius:14,border:"none",cursor:val>0?"pointer":"not-allowed",fontSize:16,fontWeight:800,background:val>0?"linear-gradient(135deg,#22c55e,#15803d)":"#1e293b",color:val>0?"#000":"#334155",transition:"all 0.2s"}}>
          {val>0?`Empezar con ${COP(val)} →`:"Ingresa tu sueldo"}
        </button>
      </div>
    </div>
  </div>;
}

function BudgetAlert({pct,salario,gastado}){
  if(pct<0.8)return null;
  const over=pct>=1, c=over?"#ef4444":"#f59e0b";
  return <div style={{background:`${c}11`,border:`1px solid ${c}33`,borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,animation:"pulse 2s infinite"}}>
    <span style={{fontSize:24,flexShrink:0}}>{over?"🚨":"⚠️"}</span>
    <div style={{flex:1}}>
      <div style={{fontSize:13,fontWeight:800,color:c,marginBottom:2}}>{over?"¡Presupuesto superado!":"Cerca del límite mensual"}</div>
      <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5}}>{over?`Llevas ${COP(gastado-salario)} sobre tu sueldo.`:`Llevas el ${Math.round(pct*100)}% del sueldo gastado.`}</div>
    </div>
  </div>;
}

function TxModal({initial,onClose,onSave,onDelete,goals}){
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
  const isSav=!!SAVINGS.find(s=>s.id===cat);
  const isMeta=cat==="meta_aporte";
  const changed=isEdit&&(raw!==initial.amount||desc.trim()!==initial.desc||cat!==initial.cat||date!==initial.date||goalId!==(initial.goalId||""));
  const acc=isMeta?"#22c55e":isSav?"#0ea5e9":ci.color||"#22c55e";
  function ha(e){const r=e.target.value.replace(/\D/g,"");setAmount(r?Number(r).toLocaleString("es-CO"):"");}
  function save(){if(!raw)return;onSave({id:initial?.id||null,desc:desc.trim()||(isMeta&&goalId?goals.find(g=>g.id===goalId)?.name||"Aporte meta":ci.label),amount:raw,cat,date,...(isMeta&&goalId?{goalId}:{})});onClose();}
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"flex-end",zIndex:300,animation:"fadeIn 0.18s ease"}}>
    <div style={{width:"100%",maxWidth:430,margin:"0 auto",background:"#0a0f1e",borderRadius:"22px 22px 0 0",border:"1px solid #1e293b",animation:"slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",maxHeight:"92vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}><div style={{width:40,height:4,borderRadius:99,background:"#1e293b"}}/></div>
      <div style={{padding:"0 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{isEdit?"Editar movimiento":"Nuevo movimiento"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",fontSize:26,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>Monto (COP)</Lbl>
          <div style={{display:"flex",alignItems:"center",background:"#0f172a",borderRadius:14,overflow:"hidden",border:`2px solid ${raw>0?acc:"#1e293b"}`,transition:"border-color 0.2s"}}>
            <span style={{padding:"0 12px",fontSize:20,lineHeight:"56px"}}>{ci.icon}</span>
            <span style={{color:"#334155",fontSize:15,lineHeight:"56px"}}>$</span>
            <input ref={ref} inputMode="numeric" placeholder="0" value={amount} onChange={ha} enterKeyHint="next"
              style={{flex:1,background:"none",border:"none",outline:"none",fontSize:26,fontWeight:800,color:"#f8fafc",padding:"0 8px",height:56,letterSpacing:-0.5}}/>
            {raw>0&&<button onMouseDown={e=>e.preventDefault()} onClick={()=>setAmount("")} style={{background:"none",border:"none",cursor:"pointer",color:"#334155",fontSize:20,padding:"0 12px",lineHeight:"56px"}}>×</button>}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>¿Qué fue?</Lbl>
          <input placeholder="ej: Cuota nevera, Repuesto freno, Netflix…" value={desc} onChange={e=>setDesc(e.target.value)} enterKeyHint="done"
            style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>Categoría</Lbl>
          <CatSelector value={cat} onChange={v=>{setCat(v);if(v!=="meta_aporte")setGoalId("");}}/>
        </div>
        {isMeta&&goals.length>0&&<div style={{marginBottom:14}}>
          <Lbl>¿Para qué meta?</Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {goals.map(g=><button key={g.id} onMouseDown={e=>e.preventDefault()} onClick={()=>setGoalId(g.id)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,border:"none",cursor:"pointer",background:goalId===g.id?"#22c55e22":"#0f172a",outline:goalId===g.id?"2px solid #22c55e":"2px solid transparent",transition:"all 0.12s",textAlign:"left"}}>
              <span style={{fontSize:16}}>🎯</span>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:goalId===g.id?"#22c55e":"#e2e8f0"}}>{g.name}</div><div style={{fontSize:10,color:"#334155"}}>{COP(g.monto)}</div></div>
              {goalId===g.id&&<span style={{color:"#22c55e",fontSize:16}}>✓</span>}
            </button>)}
          </div>
        </div>}
        {isMeta&&goals.length===0&&<div style={{marginBottom:14,padding:"12px 14px",background:"#0f172a",borderRadius:12,fontSize:12,color:"#475569"}}>Crea primero una meta en la pestaña "Metas" 🎯</div>}
        <div style={{marginBottom:16}}>
          <Lbl>Fecha</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"11px 14px",color:"#e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {isEdit&&!conf&&<button onClick={()=>setConf(true)} style={{padding:"14px 16px",borderRadius:14,border:"1px solid #ef444433",background:"transparent",color:"#ef4444",cursor:"pointer",fontSize:20,flexShrink:0}}>🗑</button>}
          {isEdit&&conf&&<button onClick={()=>{onDelete(initial.id);onClose();}} style={{padding:"14px 16px",borderRadius:14,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:800,flexShrink:0,animation:"shake 0.3s ease"}}>¿Borrar?</button>}
          <button onClick={save} style={{flex:1,padding:14,borderRadius:14,border:"none",cursor:"pointer",fontSize:15,fontWeight:800,transition:"all 0.2s",background:!raw?"#1e293b":isEdit&&!changed?"#1e3a5f":`linear-gradient(135deg,${acc},${acc}bb)`,color:!raw?"#334155":isEdit&&!changed?"#38bdf8":"#000"}}>
            {!raw?"Ingresa un monto":isEdit&&!changed?"Sin cambios":isEdit?"✓ Guardar cambios":`Registrar ${COP(raw)} →`}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

function TxRow({t,onEdit}){
  const cat=getCatInfo(t.cat), isSav=!!SAVINGS.find(s=>s.id===t.cat);
  const [p,setP]=useState(false);
  return <div onClick={onEdit} onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)} onMouseLeave={()=>setP(false)}
    style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,background:p?"#1a2744":"#0f172a",borderRadius:14,padding:"13px 14px",border:`1px solid ${cat.color}22`,cursor:"pointer",transition:"background 0.15s,transform 0.1s",transform:p?"scale(0.985)":"scale(1)",userSelect:"none"}}>
    <div style={{width:40,height:40,borderRadius:12,background:`${cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</div>
      <div style={{fontSize:11,color:"#334155",marginTop:1}}>{t.date?.slice(5).replace("-","/")} · {cat.label}</div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:14,fontWeight:800,color:isSav?"#22c55e":"#f1f5f9"}}>{isSav?"+":"-"}{COP(t.amount)}</div>
      <div style={{fontSize:10,color:"#1e3a5f",marginTop:2}}>toca para editar</div>
    </div>
  </div>;
}

// ─── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null),[authLoading,setAL]=useState(true),[loginLoading,setLL]=useState(false);
  const [salario,setSalario]=useState(null),[showOnb,setShowOnb]=useState(false);
  const [tx,setTx]=useState([]),[goals,setGoals]=useState([]);
  const [month,setMonth]=useState(now.getMonth()),[tab,setTab]=useState("home");
  const [modal,setModal]=useState(null),[goalModal,setGoalModal]=useState(null);
  const [txLoading,setTxL]=useState(false);

  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setAL(false);}),[]);
  useEffect(()=>{if(!user){setSalario(null);return;}getDoc(doc(db,"usuarios",user.uid)).then(snap=>{if(snap.exists()&&snap.data().salario){setSalario(snap.data().salario);setShowOnb(false);}else{setSalario(0);setShowOnb(true);}});},[user]);
  useEffect(()=>{if(!user||salario===null||showOnb)return;setDoc(doc(db,"usuarios",user.uid),{salario},{merge:true});},[salario,user,showOnb]);
  useEffect(()=>{if(!user){setTx([]);return;}setTxL(true);return onSnapshot(query(collection(db,"usuarios",user.uid,"transacciones"),orderBy("createdAt","desc")),snap=>{setTx(snap.docs.map(d=>({id:d.id,...d.data()})));setTxL(false);});},[user]);
  useEffect(()=>{if(!user){setGoals([]);return;}return onSnapshot(query(collection(db,"usuarios",user.uid,"metas"),orderBy("createdAt","desc")),snap=>{setGoals(snap.docs.map(d=>({id:d.id,...d.data()})));});},[user]);

  async function handleLogin(){setLL(true);try{await signInWithPopup(auth,provider);}catch(e){console.error(e);}setLL(false);}
  async function handleLogout(){await signOut(auth);setTx([]);setGoals([]);setTab("home");setSalario(null);setShowOnb(false);}
  function handleOnbSave(v){setSalario(v);setShowOnb(false);setDoc(doc(db,"usuarios",user.uid),{salario:v},{merge:true});}
  const handleSave=useCallback(async t=>{if(!user)return;const p={desc:t.desc,amount:t.amount,cat:t.cat,date:t.date,...(t.goalId?{goalId:t.goalId}:{})};if(t.id)await updateDoc(doc(db,"usuarios",user.uid,"transacciones",t.id),p);else await addDoc(collection(db,"usuarios",user.uid,"transacciones"),{...p,createdAt:serverTimestamp()});},[user]);
  const handleDelete=useCallback(async id=>{if(!user)return;await deleteDoc(doc(db,"usuarios",user.uid,"transacciones",id));},[user]);
  const handleGoalSave=useCallback(async g=>{if(!user)return;if(g.id)await updateDoc(doc(db,"usuarios",user.uid,"metas",g.id),{name:g.name,monto:g.monto});else await addDoc(collection(db,"usuarios",user.uid,"metas"),{name:g.name,monto:g.monto,createdAt:serverTimestamp()});},[user]);
  const handleGoalDelete=useCallback(async id=>{if(!user)return;await deleteDoc(doc(db,"usuarios",user.uid,"metas",id));},[user]);

  const monthTx=tx.filter(t=>isMonth(t.date,month,now.getFullYear()));
  const gastosTx=monthTx.filter(t=>!SAVINGS.find(s=>s.id===t.cat));
  const ahorrTx=monthTx.filter(t=>SAVINGS.find(s=>s.id===t.cat));
  const totalGasto=gastosTx.reduce((s,t)=>s+t.amount,0);
  const totalAhorr=ahorrTx.reduce((s,t)=>s+t.amount,0);
  const sal=salario||0, saldo=sal-totalGasto-totalAhorr;
  const tasaAhorr=sal>0?totalAhorr/sal:0, pctUsado=sal>0?totalGasto/sal:0;
  const emgTotal=tx.filter(t=>t.cat==="emergencias").reduce((s,t)=>s+t.amount,0);
  const metaTotal=tx.filter(t=>t.cat==="meta_aporte").reduce((s,t)=>s+t.amount,0);
  const saldoColor=saldo>sal*0.4?"#22c55e":saldo>sal*0.15?"#f59e0b":"#ef4444";
  const animSaldo=useCountUp(Math.max(saldo,0));
  function getAportado(gid){return tx.filter(t=>t.cat==="meta_aporte"&&t.goalId===gid).reduce((s,t)=>s+t.amount,0);}

  const CSS=`html,body{background:#030712!important;margin:0;padding:0;}*{box-sizing:border-box;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.75}}@keyframes spin{to{transform:rotate(360deg)}}
input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}`;

  if(authLoading)return <div style={{minHeight:"100vh",background:"#030712",display:"flex",alignItems:"center",justifyContent:"center",color:"#334155",fontFamily:"'DM Sans',sans-serif",fontSize:14}}>Cargando...</div>;
  if(!user)return <LoginScreen onLogin={handleLogin} loading={loginLoading}/>;
  if(salario===null)return <div style={{minHeight:"100vh",background:"#030712",display:"flex",alignItems:"center",justifyContent:"center",color:"#334155",fontFamily:"'DM Sans',sans-serif",fontSize:14}}>Cargando perfil...</div>;
  if(showOnb)return <OnboardingScreen user={user} onSave={handleOnbSave}/>;

  const HomeTab=()=>{
    const byMain=MAIN_CATS.map(m=>({...m,total:gastosTx.filter(t=>m.subs.some(s=>s.id===t.cat)).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
    return <div style={{padding:"16px 20px 0"}}>
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
      {/* Card saldo */}
      <div style={{background:"linear-gradient(160deg,#0a0f1e,#0d1829)",borderRadius:20,padding:20,marginBottom:14,border:`1px solid ${pctUsado>=0.8?"#f59e0b33":"#1e293b"}`,transition:"border-color 0.4s"}}>
        <Lbl style={{marginBottom:2}}>Disponible · {MONTHS_S[month]}</Lbl>
        <div style={{fontSize:38,fontWeight:900,letterSpacing:-2,lineHeight:1,color:saldoColor,fontVariantNumeric:"tabular-nums",transition:"color 0.4s"}}>{COP(animSaldo)}</div>
        <div style={{fontSize:11,color:"#334155",marginTop:4}}>de {COP(sal)} · gastado {COP(totalGasto)}</div>
        <div style={{marginTop:14}}>
          <Bar pct={pctUsado} color={pctUsado>=1?"#ef4444":pctUsado>0.8?"#f59e0b":"#22c55e"}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
            <span style={{fontSize:10,color:"#1e293b"}}>Gastos</span>
            <span style={{fontSize:10,color:pctUsado>=0.8?"#f59e0b":"#1e293b"}}>{Math.round(pctUsado*100)}% del sueldo</span>
          </div>
        </div>
      </div>
      {/* Mini stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[{l:"Gastos",v:COP(totalGasto),c:"#ef4444"},{l:"Ahorrado",v:COP(totalAhorr),c:"#22c55e"},{l:"Tasa ahorro",v:`${Math.round(tasaAhorr*100)}%`,c:"#a78bfa"}].map(k=>(
          <Card key={k.l} style={{padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#334155",letterSpacing:1,marginBottom:4}}>{k.l.toUpperCase()}</div>
            <div style={{fontSize:13,fontWeight:800,color:k.c}}>{k.v}</div>
          </Card>
        ))}
      </div>
      {/* Metas — chips motivadores (compactos) */}
      {goals.length>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <Lbl style={{marginBottom:0}}>🎯 Mis metas</Lbl>
          <button onClick={()=>setTab("metas")} style={{background:"none",border:"none",color:"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}>Ver todas →</button>
        </div>
        {goals.slice(0,3).map(g=><GoalChip key={g.id} goal={g} aportado={getAportado(g.id)} onClick={()=>setTab("metas")}/>)}
      </>}
      {/* Gastos por categoría */}
      {byMain.length>0&&<>
        <Lbl style={{marginTop:4}}>Gastos por categoría</Lbl>
        {byMain.map(c=><Card key={c.id} style={{marginBottom:8,borderColor:`${c.color}22`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${c.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{c.icon}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:600}}>{c.label}</span>
                <span style={{fontSize:13,fontWeight:800,color:c.color}}>{COP(c.total)}</span>
              </div>
              <Bar pct={c.total/Math.max(totalGasto,1)} color={c.color}/>
            </div>
          </div>
        </Card>)}
      </>}
      {!txLoading&&monthTx.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",fontSize:13,lineHeight:2}}>
        Sin movimientos aún.<br/><span style={{fontSize:28}}>👆</span><br/>Toca <b style={{color:"#22c55e"}}>+</b> para registrar.
      </div>}
    </div>;
  };

  const MetasTab=()=>{
    const tot=goals.reduce((s,g)=>s+g.monto,0), ap=goals.reduce((s,g)=>s+getAportado(g.id),0);
    return <div style={{padding:"16px 20px 0"}}>
      {goals.length>0&&<Card style={{marginBottom:14,background:"linear-gradient(135deg,#0a1628,#0f172a)",borderColor:"#22c55e22"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <Ring pct={tot>0?ap/tot:0} size={54} stroke={5} color="#22c55e" label={`${Math.round(Math.min(tot>0?ap/tot:0,1)*100)}%`}/>
          <div>
            <div style={{fontSize:11,color:"#4ade80",fontWeight:700,marginBottom:2}}>🎯 Progreso total</div>
            <div style={{fontSize:20,fontWeight:900,color:"#22c55e",letterSpacing:-1}}>{COP(ap)}</div>
            <div style={{fontSize:10,color:"#334155"}}>de {COP(tot)} en {goals.length} meta{goals.length!==1?"s":""}</div>
          </div>
        </div>
      </Card>}
      {goals.map(g=><GoalCard key={g.id} goal={g} aportado={getAportado(g.id)} onEdit={()=>setGoalModal({...g,_aportado:getAportado(g.id)})}/>)}
      {goals.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#1e293b",fontSize:13,lineHeight:2.2}}>
        <div style={{fontSize:40,marginBottom:8}}>🎯</div>
        Aún no tienes metas.<br/>Crea tu primera meta y empieza<br/>a ahorrar para lo que quieres.<br/>
        <button onClick={()=>setGoalModal("new")} style={{marginTop:16,padding:"10px 24px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#22c55e,#15803d)",color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}>+ Crear mi primera meta</button>
      </div>}
      {goals.length>0&&<button onClick={()=>setGoalModal("new")} style={{width:"100%",padding:14,borderRadius:14,border:"1px dashed #1e3a5f",background:"transparent",color:"#334155",cursor:"pointer",fontSize:13,fontWeight:700,marginBottom:8}}>+ Nueva meta</button>}
    </div>;
  };

  const MovTab=()=>{
    const sorted=[...monthTx].sort((a,b)=>new Date(b.date)-new Date(a.date));
    return <div style={{padding:"16px 20px 0"}}>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12,scrollbarWidth:"none"}}>
        {MONTHS_S.map((m,i)=><button key={i} onClick={()=>setMonth(i)} style={{flexShrink:0,padding:"5px 13px",borderRadius:99,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:month===i?"#22c55e":"#0f172a",color:month===i?"#000":"#334155"}}>{m}</button>)}
      </div>
      <Card style={{marginBottom:14}}>
        <Lbl>Resumen · {MONTHS[month]}</Lbl>
        {[{l:"Salario",v:sal,c:"#94a3b8"},{l:"Gastos",v:totalGasto,c:"#ef4444"},{l:"Ahorros",v:totalAhorr,c:"#22c55e"},{l:"Disponible",v:saldo,c:saldoColor}].map(k=>(
          <div key={k.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #0a0f1e"}}>
            <span style={{fontSize:13,color:"#475569"}}>{k.l}</span>
            <span style={{fontSize:13,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
          </div>
        ))}
      </Card>
      {sorted.length>0&&<div style={{fontSize:11,color:"#1e3a5f",textAlign:"center",marginBottom:10}}>✏️ Toca cualquier movimiento para editarlo</div>}
      {sorted.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#1e293b",fontSize:13}}>Sin movimientos en {MONTHS[month]}</div>}
      {sorted.map(t=><TxRow key={t.id} t={t} onEdit={()=>setModal(t)}/>)}
    </div>;
  };

  const ConfigTab=()=>{
    const [tmp,setTmp]=useState(String(sal));
    return <div style={{padding:"16px 20px 0"}}>
      <Card style={{marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
        <img src={user.photoURL} alt="" style={{width:44,height:44,borderRadius:"50%"}}/>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#f8fafc"}}>{user.displayName}</div><div style={{fontSize:11,color:"#475569"}}>{user.email}</div></div>
        <button onClick={handleLogout} style={{background:"none",border:"1px solid #ef444433",borderRadius:8,padding:"6px 12px",color:"#ef4444",cursor:"pointer",fontSize:11,fontWeight:700}}>Salir</button>
      </Card>
      <Card style={{marginBottom:12}}>
        <Lbl>Sueldo mensual (COP)</Lbl>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)} style={{flex:1,background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:10,padding:"10px 12px",color:"#f8fafc",fontSize:16,outline:"none"}}/>
          <button onClick={()=>setSalario(parseFloat(tmp)||sal)} style={{background:"#22c55e",border:"none",borderRadius:10,padding:"0 18px",color:"#000",fontWeight:800,cursor:"pointer",fontSize:16}}>✓</button>
        </div>
        <div style={{fontSize:11,color:"#1e293b",background:"#0a0f1e",borderRadius:8,padding:"10px 12px",lineHeight:1.9}}>
          Con {COP(parseFloat(tmp)||sal)} te recomiendo:<br/>
          <span style={{color:"#0ea5e9"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.05))} Emergencias (5%)</span><br/>
          <span style={{color:"#22c55e"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.10))} Metas (10%)</span><br/>
          <span style={{color:"#94a3b8"}}>→ {COP(Math.round((parseFloat(tmp)||sal)*0.85))} Gastos libres</span>
        </div>
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,#042f2e,#0f172a)",borderColor:"#22c55e22"}}>
        <Lbl style={{color:"#4ade80"}}>Ahorros acumulados</Lbl>
        {[{l:"🛡️ Fondo emergencias",v:emgTotal,c:"#0ea5e9"},{l:"🎯 Aportado a metas",v:metaTotal,c:"#22c55e"}].map(k=>(
          <div key={k.l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #0a2a28"}}>
            <span style={{fontSize:13,color:"#475569"}}>{k.l}</span>
            <span style={{fontSize:13,fontWeight:800,color:k.c}}>{COP(k.v)}</span>
          </div>
        ))}
      </Card>
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,#1e1b4b,#0f172a)",borderColor:"#4338ca44"}}>
        <div style={{fontSize:11,color:"#818cf8",fontWeight:700,marginBottom:8,letterSpacing:1}}>📐 REGLA DE ORO</div>
        <div style={{fontSize:13,color:"#c7d2fe",lineHeight:1.8}}><b>Págate primero.</b> Al recibir el sueldo, transfiere ahorro <i>antes</i> de gastar.</div>
      </Card>
      <div style={{textAlign:"center",fontSize:11,color:"#1e293b",padding:"16px 0",lineHeight:1.7}}>Datos guardados en Firebase · accesibles desde cualquier dispositivo.</div>
    </div>;
  };

  const NAV=[{id:"home",icon:"⬡",label:"Inicio"},{id:"metas",icon:"🎯",label:"Metas"},{id:"mov",icon:"≡",label:"Gastos"},{id:"cfg",icon:"◎",label:"Config"}];

  return <div style={{minHeight:"100vh",background:"#030712",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:80}}>
    <style>{CSS}</style>
    <div style={{padding:"16px 20px 12px",background:"#030712",position:"sticky",top:0,zIndex:20,borderBottom:"1px solid #0a0f1e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:9,color:"#1e293b",letterSpacing:2.5,fontWeight:700}}>MIS FINANZAS PRO</div>
        <div style={{fontSize:19,fontWeight:900,letterSpacing:-0.5}}>{user.displayName?.split(" ")[0]} 👋</div>
      </div>
      <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"5px 12px",fontSize:11,color:"#334155",fontWeight:700}}>{MONTHS_S[now.getMonth()]} {now.getFullYear()}</div>
    </div>
    {tab==="home"&&<HomeTab/>}{tab==="metas"&&<MetasTab/>}{tab==="mov"&&<MovTab/>}{tab==="cfg"&&<ConfigTab/>}
    {!modal&&!goalModal&&<button onClick={()=>tab==="metas"?setGoalModal("new"):setModal("new")} style={{position:"fixed",bottom:84,right:20,width:56,height:56,borderRadius:"50%",background:tab==="metas"?"linear-gradient(135deg,#38bdf8,#0284c7)":"linear-gradient(135deg,#22c55e,#15803d)",border:"none",fontSize:28,color:"#000",cursor:"pointer",boxShadow:tab==="metas"?"0 0 28px #38bdf866":"0 0 28px #22c55e66",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,lineHeight:1}}>＋</button>}
    {modal&&<TxModal initial={modal==="new"?null:modal} goals={goals} onClose={()=>setModal(null)} onSave={handleSave} onDelete={handleDelete}/>}
    {goalModal&&<GoalModal initial={goalModal==="new"?null:goalModal} onClose={()=>setGoalModal(null)} onSave={handleGoalSave} onDelete={handleGoalDelete}/>}
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#030712",borderTop:"1px solid #0a0f1e",display:"flex",justifyContent:"space-around",padding:"10px 0 16px",zIndex:50}}>
      {NAV.map(v=><button key={v.id} onClick={()=>setTab(v.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===v.id?"#22c55e":"#1e293b",transition:"color 0.2s"}}>
        <span style={{fontSize:20,lineHeight:1}}>{v.icon}</span>
        <span style={{fontSize:8,fontWeight:700,letterSpacing:0.4}}>{v.label}</span>
      </button>)}
    </nav>
  </div>;
}