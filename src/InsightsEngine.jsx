// ─── INSIGHTS ENGINE ──────────────────────────────────────────────────────────
// Sistema de insights accionables:
//   • 11 insights potenciales, máximo 3 visibles
//   • Sistema de familias (max 1 por familia → evita repetición)
//   • Priorización: alerta_critica > oportunidad > logro > observacional
//   • Dismiss con × persistente por mes (localStorage)
//   • Copy orientado a acción, no a observación

import { useEffect, useState } from "react";

function parseDateSafe(str) {
  if (!str || typeof str !== 'string') return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Llave de localStorage por mes — se "resetea" solo al cambiar de mes
function dismissKey(year, month) {
  return `insights_dismissed_${year}-${month}`;
}

function getDismissed(year, month) {
  try {
    const raw = localStorage.getItem(dismissKey(year, month));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addDismissed(year, month, id) {
  try {
    const curr = getDismissed(year, month);
    if (!curr.includes(id)) {
      curr.push(id);
      localStorage.setItem(dismissKey(year, month), JSON.stringify(curr));
    }
    // Limpieza ligera: borrar keys de meses viejos (+3 meses atrás)
    const cutoff = new Date(year, month - 3, 1);
    Object.keys(localStorage).forEach(k => {
      if (!k.startsWith('insights_dismissed_')) return;
      const [, , ym] = k.split('_');
      if (!ym) return;
      const [y, m] = ym.split('-').map(Number);
      if (new Date(y, m, 1) < cutoff) localStorage.removeItem(k);
    });
  } catch { /* silent */ }
}

// ─── PRIORIDAD & FAMILIAS ─────────────────────────────────────────────────────
// Orden: menor número = más prioritario
const PRIORIDAD = {
  alerta_critica: 0,   // pago sin saldo, deudas desbocadas
  oportunidad:    1,   // meta_aceleracion, presupuesto_sobrado
  alerta_suave:   2,   // presupuesto_cerca_limite, cat_subida, dia_gasto_fuerte
  logro:          3,   // mejor_mes, vs_anterior_bajada
  observacional:  4,   // top_cat, sugerencia_ahorro
  sugerencia:     5,   // sin_metas
};

// Familias: si dos insights comparten familia, solo pasa el de mayor prioridad
const FAMILIAS = {
  alerta_critica:       ["pago_proximo_sin_saldo", "deudas_desbocadas"],
  comparacion_mes:      ["vs_anterior_sube", "vs_anterior_baja"],
  top_gasto:            ["top_cat", "cat_subida"],
  presupuesto:          ["presupuesto_cerca_limite", "presupuesto_sobrado"],
  metas:                ["meta_aceleracion", "sin_metas"],
  patron:               ["mejor_mes_categoria", "dia_gasto_fuerte"],
};

// Construye el mapa inverso: insight_id → familia_id
const INSIGHT_FAMILIA = {};
Object.entries(FAMILIAS).forEach(([fam, ids]) => {
  ids.forEach(id => { INSIGHT_FAMILIA[id] = fam; });
});

// ─── COMPONENTE ───────────────────────────────────────────────────────────────
export function InsightsEngine({
  txAll, monthTx, gastosTx, totalGasto, totalIng, totalAhorr,
  month, C, COP, MAIN_CATS, isGasto, isAporteMeta, isSavingsLegacy, isMonth,
  // Props nuevos (Fase 2C)
  presupuestos = {}, goals = [], pagos = [], saldo = 0,
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.getDate();

  // Re-render al dismissar un insight
  const [dismissTick, setDismissTick] = useState(0);
  const dismissed = getDismissed(currentYear, month);

  const handleDismiss = (id) => {
    addDismissed(currentYear, month, id);
    setDismissTick(t => t + 1);
  };

  // Si el mes cambia, forzar refresco de la lista de dismisses
  useEffect(() => { setDismissTick(t => t + 1); }, [month]);

  // ─── Datos base ─────────────────────────────────────────────────────────────
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? currentYear - 1 : currentYear;

  const prevTx = txAll.filter(t => isMonth(t.date, prevMonth, prevYear));
  const prevGastos = prevTx.filter(t => isGasto(t.cat) && !isAporteMeta(t));
  const prevTotalRaw = prevGastos.reduce((s, t) => s + t.amount, 0);

  const daysInCurr = new Date(currentYear, month + 1, 0).getDate();
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate();
  const safeDays = Math.max(today, 5);
  const factor = safeDays / daysInPrev;
  const prevTotal = prevTotalRaw * factor;

  // Gastos por categoría (mes actual) + (mes anterior normalizado)
  const byCat = MAIN_CATS.map(m => ({
    ...m,
    total: gastosTx.filter(t => m.subs.some(s => s.id === t.cat)).reduce((s, t) => s + t.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const byCatPrev = MAIN_CATS.map(m => ({
    ...m,
    total: prevGastos.filter(t => m.subs.some(s => s.id === t.cat)).reduce((s, t) => s + t.amount, 0) * factor,
  }));

  const insights = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // INSIGHTS EXISTENTES (mantenidos, con familias asignadas)
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Top cat del mes
  if (byCat.length > 0) {
    const top = byCat[0];
    const pctDelIng = totalIng > 0 ? top.total / totalIng : 0;
    insights.push({
      id: "top_cat", icon: top.icon, color: top.color,
      title: `${top.label} lidera tus gastos este mes`,
      body: `${COP(top.total)}${pctDelIng > 0 ? ` — ${Math.round(pctDelIng * 100)}% de tu ingreso` : ""}`,
      tipo: "observacional",
      prioridad: PRIORIDAD.observacional,
      bgType: pctDelIng > 0.4 ? "warning" : "info",
    });
  }

  // 2. vs mes anterior (sube)
  if (prevTotal > 100 && totalGasto > 0) {
    const diff = totalGasto - prevTotal;
    const pct = Math.abs(diff / prevTotal) * 100;
    if (pct >= 8) {
      const subio = diff > 0;
      insights.push({
        id: subio ? "vs_anterior_sube" : "vs_anterior_baja",
        icon: subio ? "📈" : "📉",
        color: subio ? C.amber : C.emerald,
        title: subio
          ? `Este mes se te fue un ${Math.round(pct)}% más que el anterior`
          : `¡Vas ${Math.round(pct)}% mejor que el mes pasado!`,
        body: subio
          ? "Puedes equilibrarlo ajustando una categoría los días que quedan"
          : "Vas por buen camino — sigue así 🎉",
        tipo: subio ? "alerta_suave" : "logro",
        prioridad: subio ? PRIORIDAD.alerta_suave : PRIORIDAD.logro,
        bgType: subio ? "warning" : "success",
      });
    }
  }

  // 3. Categoría que más subió vs mes anterior
  const catSubidas = byCat
    .map(c => {
      const prev = byCatPrev.find(p => p.id === c.id)?.total || 0;
      if (prev < 5000 || c.total === 0) return null;
      const pct = ((c.total - prev) / prev) * 100;
      return { ...c, pct };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  if (catSubidas.length > 0 && catSubidas[0].pct >= 25) {
    const c = catSubidas[0];
    insights.push({
      id: "cat_subida", icon: c.icon, color: C.amber,
      title: `${c.label} creció ${Math.round(c.pct)}% vs el mes pasado`,
      body: "Si quieres, puedes revisar qué movimientos lo llevaron ahí",
      tipo: "alerta_suave",
      prioridad: PRIORIDAD.alerta_suave,
      bgType: "warning",
    });
  }

  // 4. Sugerencia de ahorro (gasto > 80% del ingreso)
  if (totalIng > 0 && totalGasto / totalIng > 0.8 && byCat.length >= 2) {
    const segundo = byCat[1];
    const posibleAhorro = Math.round(segundo.total * 0.2);
    insights.push({
      id: "sugerencia_ahorro", icon: "💡", color: C.indigo,
      title: `Bajando ${segundo.label} un 20% te quedan ${COP(posibleAhorro)} extra`,
      body: "Es la segunda categoría donde más gastaste",
      tipo: "observacional",
      prioridad: PRIORIDAD.observacional,
      bgType: "tip",
    });
  }

  // 5. Sin aportes a metas (solo si hay metas activas)
  const hayMetas = goals.some(g => (g.monto || 0) > 0);
  if (totalIng > 0 && totalAhorr === 0 && hayMetas) {
    insights.push({
      id: "sin_metas", icon: "⭐", color: C.violet,
      title: "Tus metas te esperan este mes",
      body: "Empieza con poco — cualquier monto acerca lo que quieres",
      tipo: "sugerencia",
      prioridad: PRIORIDAD.sugerencia,
      bgType: "tip",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSIGHTS NUEVOS (Fase 2C)
  // ═══════════════════════════════════════════════════════════════════════════

  // 6. META ACELERACION — si bajas X categoría, llegas antes a tu meta
  // Requiere: meta activa + categoría "desperdicio" recurrente + aportando algo
  const metasActivas = goals
    .filter(g => (g.monto || 0) > 0)
    .map(g => {
      const aportado = (g.saldoInicial || 0) + txAll
        .filter(t => (isAporteMeta(t) || isSavingsLegacy(t.cat)) && t.goalId === g.id)
        .reduce((s, t) => s + t.amount, 0);
      return { ...g, aportado, pct: g.monto > 0 ? aportado / g.monto : 0 };
    })
    .filter(g => g.pct < 1) // solo metas NO completadas
    .sort((a, b) => b.pct - a.pct); // la más cercana a completarse primero

  if (metasActivas.length > 0 && totalIng > 0) {
    const meta = metasActivas[0];
    // Buscar una categoría "recortable" — ocio, digital o comida con gasto considerable
    const recortables = ["ocio", "digital", "comida"];
    const catRecortable = byCat.find(c => recortables.includes(c.id) && c.total >= 30000);

    if (catRecortable) {
      const recorte = Math.round(catRecortable.total * 0.25); // sugerencia: recortar 25%
      const faltante = meta.monto - meta.aportado;
      const aporteActual = monthTx
        .filter(t => (isAporteMeta(t) || isSavingsLegacy(t.cat)) && t.goalId === meta.id)
        .reduce((s, t) => s + t.amount, 0);
      const aporteMensualEst = aporteActual || Math.max(faltante / 24, recorte); // mínimo 24 meses o lo que recortes
      const mesesActuales = aporteMensualEst > 0 ? Math.ceil(faltante / aporteMensualEst) : 999;
      const mesesNuevos = (aporteMensualEst + recorte) > 0 ? Math.ceil(faltante / (aporteMensualEst + recorte)) : 999;
      const ahorroMeses = mesesActuales - mesesNuevos;

      if (ahorroMeses >= 1 && mesesActuales < 120) {
        insights.push({
          id: "meta_aceleracion", icon: "🚀", color: C.indigo,
          title: `Bajar ${catRecortable.label} un 25% te ahorra ${ahorroMeses} mes${ahorroMeses > 1 ? "es" : ""} hacia ${meta.nombre || "tu meta"}`,
          body: `Recortar ${COP(recorte)} de ${catRecortable.label} acelera tu meta`,
          tipo: "oportunidad",
          prioridad: PRIORIDAD.oportunidad,
          bgType: "tip",
        });
      }
    }
  }

  // 7. PRESUPUESTO CERCA DEL LIMITE (>=75% pasando día 15)
  if (today >= 15) {
    const catsEnRiesgo = MAIN_CATS
      .map(cat => {
        const limite = presupuestos[cat.id] || 0;
        if (limite <= 0) return null;
        const gasto = gastosTx
          .filter(t => cat.subs.some(s => s.id === t.cat))
          .reduce((s, t) => s + t.amount, 0);
        const pct = gasto / limite;
        if (pct < 0.75 || pct >= 1) return null; // ya superado lo maneja BudgetAlert
        return { ...cat, gasto, limite, pct };
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);

    if (catsEnRiesgo.length > 0) {
      const c = catsEnRiesgo[0];
      const diasRestantes = daysInCurr - today;
      insights.push({
        id: "presupuesto_cerca_limite", icon: c.icon, color: C.amber,
        title: `${c.label} va en ${Math.round(c.pct * 100)}% de tu plan`,
        body: `Quedan ${diasRestantes} día${diasRestantes !== 1 ? "s" : ""} — ajustar un poco el ritmo ayuda a cerrar bien el mes`,
        tipo: "alerta_suave",
        prioridad: PRIORIDAD.alerta_suave,
        bgType: "warning",
      });
    }
  }

  // 8. PRESUPUESTO SOBRADO (fin de mes, gastado ≤50% del límite)
  if (today >= 25) {
    const catsSobradas = MAIN_CATS
      .map(cat => {
        const limite = presupuestos[cat.id] || 0;
        if (limite <= 0) return null;
        const gasto = gastosTx
          .filter(t => cat.subs.some(s => s.id === t.cat))
          .reduce((s, t) => s + t.amount, 0);
        const pct = limite > 0 ? gasto / limite : 0;
        if (pct > 0.5 || gasto === 0) return null;
        return { ...cat, gasto, limite, sobrante: limite - gasto, pct };
      })
      .filter(Boolean)
      .sort((a, b) => b.sobrante - a.sobrante);

    if (catsSobradas.length > 0) {
      const c = catsSobradas[0];
      insights.push({
        id: "presupuesto_sobrado", icon: c.icon, color: C.emerald,
        title: `Te sobran ${COP(c.sobrante)} en ${c.label}`,
        body: "Buen candidato para mover a tus metas o ahorro",
        tipo: "oportunidad",
        prioridad: PRIORIDAD.oportunidad,
        bgType: "success",
      });
    }
  }

  // 9. PAGO PROGRAMADO PROXIMO + saldo insuficiente
  if (pagos && pagos.length > 0 && saldo != null) {
    const pagosMes = pagos.filter(p => {
      if (!p.activo) return false;
      if (p.frecuencia === "mensual") return true;
      if (p.frecuencia === "unico") {
        return (p.mesUnico ?? month) === month && (p.anioUnico ?? currentYear) === currentYear;
      }
      return false;
    });

    // Pagos pendientes en los próximos 5 días
    const pagosProximos = pagosMes.filter(p => {
      const dia = p.dia;
      if (dia < today) return false; // ya pasaron
      if (dia - today > 5) return false; // muy lejos
      // Verificar si ya está confirmado (hay tx con pagoId)
      const confirmado = txAll.some(t => {
        if (t.pagoId !== p.id) return false;
        const [ty, tm] = t.date.split('-').map(Number);
        return ty === currentYear && (tm - 1) === month;
      });
      return !confirmado;
    });

    if (pagosProximos.length > 0) {
      const totalPagos = pagosProximos.reduce((s, p) => s + (p.monto || 0), 0);
      const diasMin = Math.min(...pagosProximos.map(p => p.dia - today));

      if (saldo < totalPagos && saldo >= 0) {
        insights.push({
          id: "pago_proximo_sin_saldo", icon: "🔔", color: C.amber,
          title: `${COP(totalPagos)} en pagos ${diasMin === 0 ? "hoy" : diasMin === 1 ? "mañana" : `en ${diasMin} días`}`,
          body: `Tienes ${COP(saldo)} disponibles — organízate antes para que no te sorprenda`,
          tipo: "alerta_critica",
          prioridad: PRIORIDAD.alerta_critica,
          bgType: "warning",
        });
      }
    }
  }

  // 10. MEJOR MES EN UNA CATEGORIA (mínimo histórico de ≥3 meses)
  // Solo si pasamos la mitad del mes (datos representativos)
  if (today >= 15 && byCat.length > 0) {
    const mesesHistoricos = new Set();
    txAll.forEach(t => {
      if (!t?.date || !isGasto(t.cat) || isAporteMeta(t)) return;
      const [y, m] = t.date.split('-').map(Number);
      // Excluir mes actual
      if (y === currentYear && (m - 1) === month) return;
      mesesHistoricos.add(`${y}-${m - 1}`);
    });

    if (mesesHistoricos.size >= 3) {
      // Calcular gasto promedio por categoría en meses históricos
      const mejoresPorCat = byCat
        .filter(c => c.total > 0)
        .map(c => {
          let totalHist = 0, nMeses = 0;
          mesesHistoricos.forEach(key => {
            const [y, m] = key.split('-').map(Number);
            const gastoM = txAll
              .filter(t => {
                if (!t?.date || !isGasto(t.cat) || isAporteMeta(t)) return false;
                const [ty, tm] = t.date.split('-').map(Number);
                return ty === y && (tm - 1) === m && c.subs.some(s => s.id === t.cat);
              })
              .reduce((s, t) => s + t.amount, 0);
            if (gastoM > 0) { totalHist += gastoM; nMeses++; }
          });
          const promedio = nMeses > 0 ? totalHist / nMeses : 0;
          const ahorro = promedio - c.total;
          return { ...c, promedio, ahorro };
        })
        .filter(c => c.promedio > 0 && c.ahorro > c.promedio * 0.2) // al menos 20% menos
        .sort((a, b) => b.ahorro - a.ahorro);

      if (mejoresPorCat.length > 0) {
        const c = mejoresPorCat[0];
        insights.push({
          id: "mejor_mes_categoria", icon: "🎉", color: C.emerald,
          title: `Tu mejor mes en ${c.label} en un tiempo`,
          body: `${COP(Math.round(c.ahorro))} menos que tu promedio — ¡bien hecho!`,
          tipo: "logro",
          prioridad: PRIORIDAD.logro,
          bgType: "success",
        });
      }
    }
  }

  // 11. DIA DE GASTO FUERTE (un solo día concentra >=40% del gasto mensual)
  if (totalGasto > 50000 && gastosTx.length >= 3) {
    const porDia = {};
    gastosTx.forEach(t => {
      const d = parseInt(t.date.split('-')[2], 10);
      porDia[d] = (porDia[d] || 0) + t.amount;
    });
    const dias = Object.entries(porDia).sort((a, b) => b[1] - a[1]);
    if (dias.length > 0) {
      const [diaTop, montoTop] = dias[0];
      const pctDia = montoTop / totalGasto;
      if (pctDia >= 0.4 && gastosTx.length >= 5) {
        insights.push({
          id: "dia_gasto_fuerte", icon: "📌", color: C.amber,
          title: `El día ${diaTop} concentraste ${Math.round(pctDia * 100)}% del gasto del mes`,
          body: `${COP(montoTop)} en un solo día — si fue planeado, todo bien. Si no, revisa`,
          tipo: "alerta_suave",
          prioridad: PRIORIDAD.alerta_suave,
          bgType: "warning",
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTRADO: dismissed + familias + prioridad
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Quitar los dismissed
  let candidatos = insights.filter(ins => !dismissed.includes(ins.id));

  // 2. Ordenar por prioridad
  candidatos.sort((a, b) => a.prioridad - b.prioridad);

  // 3. Aplicar familias: max 1 por familia (ya vienen ordenados por prioridad)
  const familiasUsadas = new Set();
  const filtrados = [];
  for (const ins of candidatos) {
    const familia = INSIGHT_FAMILIA[ins.id];
    if (!familia) {
      // insight sin familia: siempre pasa (ej. pago_proximo_sin_saldo)
      filtrados.push(ins);
    } else if (!familiasUsadas.has(familia)) {
      familiasUsadas.add(familia);
      filtrados.push(ins);
    }
  }

  // 4. Cortar a 3
  const top3 = filtrados.slice(0, 3);

  if (top3.length === 0) return null;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const BG_MAP = {
    warning: `${C.amber}10`, success: `${C.emerald}10`,
    tip: `${C.indigo}10`, info: C.surface,
  };
  const BORDER_MAP = {
    warning: `${C.amber}30`, success: `${C.emerald}30`,
    tip: `${C.indigo}30`, info: C.border,
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: C.text.b, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
        🧠 Insights del mes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top3.map(ins => (
          <div key={ins.id} style={{
            borderRadius: 18, padding: "14px 16px",
            background: ins.bgType === "info" ? (C.isLight ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)") : BG_MAP[ins.bgType],
            border: "1px solid transparent",
            display: "flex", alignItems: "center", gap: 12,
            animation: "fadeIn 0.3s ease",
            position: "relative",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: `${ins.color}22`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>{ins.icon}</div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text.h, marginBottom: 3, lineHeight: 1.3 }}>
                {ins.title}
              </div>
              <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.4 }}>
                {ins.body}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(ins.id); }}
              aria-label="Descartar insight"
              style={{
                position: "absolute", top: 6, right: 8,
                background: "none", border: "none", color: C.text.s,
                fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1,
                opacity: 0.6, transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}