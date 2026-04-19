// ─── LOGROS ENGINE ────────────────────────────────────────────────────────────

// ─── NIVELES ─────────────────────────────────────────────────────────────────
export const NIVELES = [
  { min:0,    max:99,   label:"Aprendiz",   icon:"🌱", color:"#6b7f96" },
  { min:100,  max:299,  label:"Organizado", icon:"💼", color:"#38bdf8" },
  { min:300,  max:599,  label:"Constante",  icon:"📈", color:"#10b981" },
  { min:600,  max:999,  label:"Estratega",  icon:"💡", color:"#f59e0b" },
  { min:1000, max:9999, label:"Experto",    icon:"🏆", color:"#6366f1" },
];

export function getNivel(pts) {
  return NIVELES.find(n => pts >= n.min && pts <= n.max) || NIVELES[0];
}

export function getNivelSiguiente(pts) {
  const idx = NIVELES.findIndex(n => pts >= n.min && pts <= n.max);
  return idx < NIVELES.length - 1 ? NIVELES[idx + 1] : null;
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
export const BADGE_CATS = [
  { id:"primeros",    label:"Primeros pasos", color:"#10b981" },
  { id:"habitos",     label:"Hábitos",        color:"#38bdf8" },
  { id:"metas",       label:"Metas",          color:"#6366f1" },
  { id:"presupuesto", label:"Presupuesto",    color:"#f59e0b" },
  { id:"especiales",  label:"Especiales",     color:"#e879f9" },
];

// ─── HELPER: mesesResumen ─────────────────────────────────────────────────────
// Refleja exactamente la fórmula de App.jsx:
//   ingresos = getSalarioDelMes(y,m) + ingresos registrados
//   gastos   = isGasto && !isAporteMeta
//   aportes  = isAporteMeta || isSavingsLegacy
export function buildMesesResumen({ tx, getSalarioDelMes, isGasto, isAporteMeta, isSavingsLegacy, isIngreso }) {
  const porMes = {};
  tx.forEach(t => {
    if (!t?.date) return;
    const [sy, sm] = t.date.split('-').map(Number);
    const anio = sy, mes = sm - 1;
    const key = `${anio}-${mes}`;
    if (!porMes[key]) porMes[key] = { anio, mes, gastos:0, ingresos:0, aportes:0, totalTx:0 };
    porMes[key].totalTx++;
    if (isIngreso(t.cat)) porMes[key].ingresos += t.amount;
    else if (isAporteMeta(t) || isSavingsLegacy(t.cat)) porMes[key].aportes += t.amount;
    else if (isGasto(t.cat)) porMes[key].gastos += t.amount;
  });
  // Salario SIEMPRE se suma — igual que App.jsx (getSalarioDelMes + ingresosExtra)
  Object.values(porMes).forEach(m => {
    m.ingresos += getSalarioDelMes(m.anio, m.mes) || 0;
  });
  return Object.values(porMes);
}

// ─── HELPER: meses con presupuesto perfecto ───────────────────────────────────
export function calcMesesPerfectos({ tx, presupuestos, MAIN_CATS, isGasto, isAporteMeta }) {
  if (!Object.values(presupuestos || {}).some(v => v > 0)) return 0;
  // Solo evaluar meses donde haya al menos un gasto registrado
  const mesesSet = new Set(
    tx.filter(t => isGasto(t.cat) && !isAporteMeta(t)).map(t => {
      const [sy, sm] = t.date.split('-').map(Number);
      return `${sy}-${sm - 1}`;
    })
  );
  let count = 0;
  mesesSet.forEach(key => {
    const [y, m] = key.split('-').map(Number);
    const txMes = tx.filter(t => {
      const [sy, sm] = t.date.split('-').map(Number);
      return sy === y && sm - 1 === m;
    });
    const perfecto = MAIN_CATS.every(cat => {
      const limite = presupuestos[cat.id] || 0;
      if (!limite) return true;
      const gasto = txMes
        .filter(t => isGasto(t.cat) && !isAporteMeta(t) && cat.subs.some(s => s.id === t.cat))
        .reduce((s, t) => s + t.amount, 0);
      return gasto <= limite;
    });
    if (perfecto) count++;
  });
  return count;
}

// ─── HELPER: racha de meses consecutivos en verde ────────────────────────────
// Se calcula en App.jsx y se pasa como rachaActual — aquí solo se usa

// ─── DEFINICIÓN DE BADGES ────────────────────────────────────────────────────
// check(ctx) → boolean
// ctx tiene: tx, goals, presupuestos, prestamos, rachaActual,
//            totalMesesConDatos, mesesResumen, mesesPerfectos, getAportado,
//            MAIN_CATS, isGasto, isAporteMeta
export const BADGES_DEF = [

  // ── Primeros pasos ─────────────────────────────────────────────────────────
  {
    id:"primer_movimiento", cat:"primeros", pts:10,
    icon:"📅", label:"Primer movimiento",
    desc:"Ya arrancaste. El primer registro es el más difícil.",
    check:({tx}) => tx.length > 0,
  },
  {
    id:"primer_mes_verde", cat:"primeros", pts:15,
    icon:"💰", label:"Primer mes en verde",
    desc:"Gastaste menos de lo que ganaste. Así se hace.",
    check:({mesesResumen}) =>
      mesesResumen.some(m => m.ingresos > 0 && m.gastos < m.ingresos),
  },
  {
    id:"primer_presupuesto", cat:"primeros", pts:15,
    icon:"🎯", label:"Primer presupuesto",
    desc:"Le pusiste límites a tu plata. Eso ya es mucho.",
    check:({presupuestos}) =>
      Object.values(presupuestos || {}).some(v => v > 0),
  },
  {
    id:"primer_cobro", cat:"primeros", pts:10,
    icon:"🤝", label:"Primer cobro",
    desc:"Te pagaron lo que te debían. Bien ahí.",
    check:({prestamos}) => (prestamos || []).some(p => p.devuelto),
  },
  {
    id:"primera_meta_creada", cat:"primeros", pts:10,
    icon:"⭐", label:"Primera meta creada",
    desc:"Ya tienes algo por lo que ahorrar.",
    check:({goals}) => goals.length > 0,
  },

  // ── Hábitos ────────────────────────────────────────────────────────────────
  {
    id:"racha_3", cat:"habitos", pts:30,
    icon:"🔥", label:"Racha x3",
    desc:"3 meses seguidos en verde. Ya es un patrón.",
    check:({rachaActual}) => rachaActual >= 3,
    progreso:({rachaActual}) => ({ actual:Math.min(rachaActual,3), total:3 }),
  },
  {
    id:"racha_6", cat:"habitos", pts:60,
    icon:"⚡", label:"Racha x6",
    desc:"Medio año controlando los gastos. No es suerte.",
    check:({rachaActual}) => rachaActual >= 6,
    progreso:({rachaActual}) => ({ actual:Math.min(rachaActual,6), total:6 }),
  },
  {
    id:"racha_12", cat:"habitos", pts:150,
    icon:"👑", label:"Racha x12",
    desc:"Un año entero. Eso es disciplina de verdad.",
    check:({rachaActual}) => rachaActual >= 12,
    progreso:({rachaActual}) => ({ actual:Math.min(rachaActual,12), total:12 }),
  },
  {
    id:"registrador", cat:"habitos", pts:25,
    icon:"📋", label:"Registrador",
    desc:"20 movimientos en un mes. Sabes exactamente en qué va tu plata.",
    check:({mesesResumen}) => mesesResumen.some(m => m.totalTx >= 20),
    progreso:({mesesResumen}) => {
      const max = Math.max(0, ...mesesResumen.map(m => m.totalTx));
      return { actual:Math.min(max,20), total:20 };
    },
  },
  {
    id:"constante_6", cat:"habitos", pts:40,
    icon:"🗓️", label:"Constante",
    desc:"6 meses con datos. La app ya te conoce bien.",
    check:({totalMesesConDatos}) => totalMesesConDatos >= 6,
    progreso:({totalMesesConDatos}) => ({ actual:Math.min(totalMesesConDatos,6), total:6 }),
  },
  {
    id:"veterano_12", cat:"habitos", pts:80,
    icon:"📆", label:"Veterano",
    desc:"12 meses registrando. Ya eres otro con tu plata.",
    check:({totalMesesConDatos}) => totalMesesConDatos >= 12,
    progreso:({totalMesesConDatos}) => ({ actual:Math.min(totalMesesConDatos,12), total:12 }),
  },

  // ── Metas ──────────────────────────────────────────────────────────────────
  {
    id:"primera_meta_completada", cat:"metas", pts:50,
    icon:"🎊", label:"Primera meta completada",
    desc:"Primera meta cumplida. ¿Ya tienes la siguiente?",
    // aportado ya incluye saldoInicial via getAportado() de App.jsx
    check:({goals, getAportado}) =>
      goals.some(g => g.monto > 0 && getAportado(g.id) >= g.monto),
  },
  {
    id:"meta_millonaria", cat:"metas", pts:100,
    icon:"💎", label:"Meta millonaria",
    desc:"Un millón ahorrado para algo que valía la pena.",
    check:({goals, getAportado}) =>
      goals.some(g => g.monto >= 1000000 && getAportado(g.id) >= g.monto),
  },
  {
    id:"tres_metas", cat:"metas", pts:75,
    icon:"🚀", label:"Tres metas",
    desc:"Tres metas. Ya sabes cómo funciona esto.",
    check:({goals, getAportado}) =>
      goals.filter(g => g.monto > 0 && getAportado(g.id) >= g.monto).length >= 3,
    progreso:({goals, getAportado}) => ({
      actual: Math.min(goals.filter(g => g.monto > 0 && getAportado(g.id) >= g.monto).length, 3),
      total: 3,
    }),
  },
  {
    id:"cinco_metas", cat:"metas", pts:120,
    icon:"🎯", label:"Cinco metas",
    desc:"Cinco metas completadas. Eso no lo logra cualquiera.",
    check:({goals, getAportado}) =>
      goals.filter(g => g.monto > 0 && getAportado(g.id) >= g.monto).length >= 5,
    progreso:({goals, getAportado}) => ({
      actual: Math.min(goals.filter(g => g.monto > 0 && getAportado(g.id) >= g.monto).length, 5),
      total: 5,
    }),
  },

  // ── Presupuesto ────────────────────────────────────────────────────────────
  {
    id:"presupuesto_perfecto_1", cat:"presupuesto", pts:40,
    icon:"💡", label:"Presupuesto perfecto",
    desc:"Un mes sin salirte de ningún límite. Difícil de lograr.",
    check:({mesesPerfectos}) => mesesPerfectos >= 1,
  },
  {
    id:"presupuesto_perfecto_3", cat:"presupuesto", pts:80,
    icon:"🔒", label:"Presupuesto x3",
    desc:"Tres meses sin pasarte de ningún límite. Eso es control.",
    check:({mesesPerfectos}) => mesesPerfectos >= 3,
    progreso:({mesesPerfectos}) => ({ actual:Math.min(mesesPerfectos,3), total:3 }),
  },
  {
    id:"inversor", cat:"presupuesto", pts:35,
    icon:"🌱", label:"Inversor",
    desc:"Más del 20% del ingreso a metas en un mes. Le estás apostando al futuro.",
    check:({mesesResumen}) =>
      mesesResumen.some(m => m.ingresos > 0 && m.aportes / m.ingresos >= 0.2),
  },

  // ── Especiales ─────────────────────────────────────────────────────────────
  {
    id:"ahorrador_anio", cat:"especiales", pts:200,
    icon:"🏆", label:"Ahorrador del año",
    desc:"10 meses en verde en el mismo año. Año sólido.",
    check:({mesesResumen}) => {
      const porAnio = {};
      mesesResumen.forEach(m => {
        if (m.ingresos > 0 && m.gastos < m.ingresos)
          porAnio[m.anio] = (porAnio[m.anio] || 0) + 1;
      });
      return Object.values(porAnio).some(v => v >= 10);
    },
    progreso:({mesesResumen}) => {
      const porAnio = {};
      mesesResumen.forEach(m => {
        if (m.ingresos > 0 && m.gastos < m.ingresos)
          porAnio[m.anio] = (porAnio[m.anio] || 0) + 1;
      });
      const max = Object.values(porAnio).length ? Math.max(...Object.values(porAnio)) : 0;
      return { actual:Math.min(max,10), total:10 };
    },
  },
  {
    // Superávit: saldo disponible al final del mes > 50% del ingreso
    // Fórmula: ingresos - gastos - aportes > ingresos * 0.5
    id:"superavit", cat:"especiales", pts:50,
    icon:"🤑", label:"Superávit",
    desc:"Terminaste un mes con más del 50% del ingreso intacto. Raro y bueno.",
    check:({mesesResumen}) =>
      mesesResumen.some(m =>
        m.ingresos > 0 && (m.ingresos - m.gastos - m.aportes) > m.ingresos * 0.5
      ),
  },
  {
    // Sin deudas: mes con gastos registrados pero ninguno en categoría Deudas
    id:"sin_deudas_mes", cat:"especiales", pts:30,
    icon:"✂️", label:"Mes sin deudas",
    desc:"Un mes completo con gastos pero sin ninguno en categoría Deudas.",
    check:({tx, MAIN_CATS, isGasto, isAporteMeta}) => {
      const catDeudas = MAIN_CATS.find(c => c.id === "deudas");
      if (!catDeudas) return false;
      const deudaIds = new Set(catDeudas.subs.map(s => s.id));
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${now.getMonth()}`;

      // Solo evaluar meses PASADOS completos (no el mes actual en curso)
      // que tengan al menos 5 gastos registrados (mes real, no solo 1 tx aislada)
      const mesesConGasto = new Set(
        tx.filter(t => isGasto(t.cat) && !isAporteMeta(t))
          .map(t => { const [sy,sm]=t.date.split('-').map(Number); return `${sy}-${sm-1}`; })
          .filter(k => k !== currentKey)
      );

      return [...mesesConGasto].some(key => {
        const [y, m] = key.split('-').map(Number);
        const txMes = tx.filter(t => {
          const [sy,sm] = t.date.split('-').map(Number);
          return sy===y && sm-1===m;
        });
        const gastosDelMes = txMes.filter(t => isGasto(t.cat) && !isAporteMeta(t));
        if (gastosDelMes.length < 5) return false; // mes con pocos datos no cuenta
        const tieneDeuda = gastosDelMes.some(t => deudaIds.has(t.cat));
        return !tieneDeuda;
      });
    },
  },
];

// ─── CALCULAR BADGES ─────────────────────────────────────────────────────────
export function calcBadgesDesbloqueados(ctx) {
  const result = {};
  BADGES_DEF.forEach(b => {
    try {
      result[b.id] = !!b.check(ctx);
    } catch(e) {
      console.warn(`[Logros] Error en badge ${b.id}:`, e);
      result[b.id] = false;
    }
  });
  return result;
}

// ─── COMPONENTE: LogrosTab ────────────────────────────────────────────────────
export function LogrosTab({
  badgesDesbloqueados, totalPts,
  tx, goals, presupuestos, prestamos,
  rachaActual, totalMesesConDatos, mesesResumen, mesesPerfectos,
  getAportado, MAIN_CATS, isGasto, isAporteMeta,
  C,
}) {
  const nivel = getNivel(totalPts);
  const nivelSig = getNivelSiguiente(totalPts);
  const pctNivel = nivelSig
    ? (totalPts - nivel.min) / (nivelSig.min - nivel.min)
    : 1;
  const ptsParaSig = nivelSig ? nivelSig.min - totalPts : 0;
  const totalDesbloqueados = Object.values(badgesDesbloqueados).filter(Boolean).length;

  const ctx = {
    tx, goals, presupuestos, prestamos,
    rachaActual, totalMesesConDatos, mesesResumen, mesesPerfectos,
    getAportado, MAIN_CATS, isGasto, isAporteMeta,
  };

  return (
    <div style={{ padding:"16px 20px 80px" }}>

      {/* Nivel */}
      <div style={{ background:C.card, borderRadius:20, padding:20, marginBottom:16,
        boxShadow:"0 2px 12px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:16, flexShrink:0,
            background:`${nivel.color}20`, border:`2px solid ${nivel.color}50`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>
            {nivel.icon}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.text.s, fontWeight:700, letterSpacing:1,
              textTransform:"uppercase", marginBottom:3 }}>Tu nivel</div>
            <div style={{ fontSize:20, fontWeight:900, color:nivel.color, letterSpacing:-0.5 }}>
              {nivel.label}
            </div>
            <div style={{ fontSize:12, color:C.text.b, marginTop:1 }}>
              {totalPts} puntos · {totalDesbloqueados}/{BADGES_DEF.length} logros
            </div>
          </div>
        </div>
        <div style={{ background:`${nivel.color}15`, borderRadius:99, height:6, overflow:"hidden", marginBottom:6 }}>
          <div style={{ height:6, borderRadius:99, background:nivel.color,
            width:`${Math.min(pctNivel*100,100)}%`, transition:"width 0.8s ease" }}/>
        </div>
        {nivelSig
          ? <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.text.s }}>
              <span>{nivel.label}</span>
              <span style={{ color:C.text.b }}>
                {ptsParaSig} pts para <b style={{ color:nivelSig.color }}>{nivelSig.label}</b>
              </span>
            </div>
          : <div style={{ fontSize:11, color:nivel.color, textAlign:"center", fontWeight:700 }}>
              Nivel máximo alcanzado 🏆
            </div>
        }
      </div>

      {/* Badges por categoría */}
      {BADGE_CATS.map(cat => {
        const badgesCat = BADGES_DEF.filter(b => b.cat === cat.id);
        const nDesbloq = badgesCat.filter(b => badgesDesbloqueados[b.id]).length;
        return (
          <div key={cat.id} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.text.s, letterSpacing:1, textTransform:"uppercase" }}>
                {cat.label}
              </div>
              <div style={{ fontSize:11, color:cat.color, fontWeight:700 }}>
                {nDesbloq}/{badgesCat.length}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {badgesCat.map(badge => {
                const desbloqueado = !!badgesDesbloqueados[badge.id];
                const prog = badge.progreso ? badge.progreso(ctx) : null;
                const pctProg = prog ? prog.actual / prog.total : 0;
                return (
                  <div key={badge.id} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"14px 16px", borderRadius:16,
                    background: desbloqueado ? `${cat.color}12` : C.card,
                    border:`1px solid ${desbloqueado ? cat.color+"30" : "rgba(255,255,255,0.06)"}`,
                    opacity: desbloqueado ? 1 : 0.7,
                  }}>
                    <div style={{ width:44, height:44, borderRadius:13, flexShrink:0,
                      background: desbloqueado ? `${cat.color}22` : "rgba(255,255,255,0.04)",
                      border:`1px solid ${desbloqueado ? cat.color+"44" : "rgba(255,255,255,0.08)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
                      filter: desbloqueado ? "none" : "grayscale(1) opacity(0.4)" }}>
                      {badge.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                        <div style={{ fontSize:13, fontWeight:700, color: desbloqueado ? C.text.h : C.text.b }}>
                          {badge.label}
                        </div>
                        <div style={{ fontSize:10, fontWeight:800,
                          color: desbloqueado ? cat.color : C.text.s,
                          background: desbloqueado ? `${cat.color}18` : "rgba(255,255,255,0.05)",
                          padding:"2px 8px", borderRadius:99, flexShrink:0, marginLeft:8 }}>
                          +{badge.pts} pts
                        </div>
                      </div>
                      <div style={{ fontSize:11, color:C.text.s, lineHeight:1.4 }}>
                        {desbloqueado
                          ? badge.desc
                          : prog
                            ? `${prog.actual} de ${prog.total} — ${badge.desc}`
                            : badge.desc
                        }
                      </div>
                      {!desbloqueado && prog && (
                        <div style={{ marginTop:6 }}>
                          <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:99, height:3, overflow:"hidden" }}>
                            <div style={{ height:3, borderRadius:99, background:cat.color,
                              width:`${Math.min(pctProg*100,100)}%`, opacity:0.7 }}/>
                          </div>
                        </div>
                      )}
                    </div>
                    {desbloqueado && (
                      <div style={{ fontSize:16, color:cat.color, flexShrink:0 }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}