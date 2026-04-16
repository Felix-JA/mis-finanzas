// ─── INSIGHTS ENGINE ──────────────────────────────────────────────────────────
// Compara mes actual vs anterior normalizado por días transcurridos
// Máximo 3 insights · copywriting orientado a acción

function parseDateSafe(str){
  if(!str||typeof str!=='string')return new Date();
  const[y,m,d]=str.split('-').map(Number);
  return new Date(y,(m||1)-1,d||1);
}

export function InsightsEngine({
  txAll, monthTx, gastosTx, totalGasto, totalIng, totalAhorr,
  month, C, COP, MAIN_CATS, isGasto, isAporteMeta, isSavingsLegacy, isMonth
}) {
  const now         = new Date();
  const currentYear = now.getFullYear();
  const today       = now.getDate();

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? currentYear - 1 : currentYear;

  const prevTx     = txAll.filter(t => isMonth(t.date, prevMonth, prevYear));
  const prevGastos = prevTx.filter(t => isGasto(t.cat) && !isAporteMeta(t));
  const prevTotalRaw = prevGastos.reduce((s, t) => s + t.amount, 0);

  // Normalizar mes anterior a los mismos días transcurridos del mes actual
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate();
  const safeDays   = Math.max(today, 5);
  const factor     = safeDays / daysInPrev;
  const prevTotal  = prevTotalRaw * factor;

  // Gastos por categoría mes actual — usa label corto (NO labelFull)
  const byCat = MAIN_CATS.map(m => ({
    ...m,
    total: gastosTx.filter(t => m.subs.some(s => s.id === t.cat)).reduce((s, t) => s + t.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Gastos por categoría mes anterior (normalizados)
  const byCatPrev = MAIN_CATS.map(m => ({
    ...m,
    total: (prevGastos.filter(t => m.subs.some(s => s.id === t.cat)).reduce((s, t) => s + t.amount, 0)) * factor,
  }));

  const insights = [];

  // 1. Mayor gasto del mes — usa label corto siempre
  if (byCat.length > 0) {
    const top       = byCat[0];
    const pctDelIng = totalIng > 0 ? top.total / totalIng : 0;
    // Usar label corto — nunca labelFull que puede incluir "y Préstamos" etc
    const catNombre = top.label;
    insights.push({
      id: "top_cat", icon: top.icon, color: top.color,
      title: `${catNombre} es donde más estás gastando`,
      body: `${COP(top.total)} este mes${pctDelIng > 0 ? ` — ${Math.round(pctDelIng * 100)}% de tu ingreso` : ""}`,
      type: pctDelIng > 0.4 ? "warning" : "info",
    });
  }

  // 2. Comparación vs mes anterior normalizado
  if (prevTotal > 100 && totalGasto > 0) {
    const diff = totalGasto - prevTotal;
    const pct  = Math.abs(diff / prevTotal) * 100;
    if (pct >= 8) {
      const subió = diff > 0;
      insights.push({
        id: "vs_anterior", icon: subió ? "📈" : "📉",
        color: subió ? C.amber : C.emerald,
        title: subió
          ? `Tus gastos subieron ${Math.round(pct)}% vs el mes pasado`
          : `¡Gastas ${Math.round(pct)}% menos que el mes pasado!`,
        body: subió
          ? `Revisa en qué categoría puedes ajustar`
          : `Vas mejor que antes — sigue así 🎉`,
        type: subió ? "warning" : "success",
      });
    }
  }

  // 3. Categoría que más subió vs mes anterior — usa label corto
  const catSubidas = byCat
    .map(c => {
      const prev = byCatPrev.find(p => p.id === c.id)?.total || 0;
      if (prev < 5000 || c.total === 0) return null;
      const pct = ((c.total - prev) / prev) * 100;
      return { ...c, pct, prevTotal: prev };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  if (catSubidas.length > 0 && catSubidas[0].pct >= 25) {
    const c = catSubidas[0];
    insights.push({
      id: "cat_subida", icon: c.icon, color: C.amber,
      // Usar label corto — no labelFull
      title: `${c.label} subió ${Math.round(c.pct)}% vs el mes pasado`,
      body: `Revisa si hay algo que puedas reducir ahí`,
      type: "warning",
    });
  }

  // 4. Sugerencia ahorro si gasto > 80% del ingreso — usa label corto
  if (totalIng > 0 && totalGasto / totalIng > 0.8 && byCat.length >= 2) {
    const segundo       = byCat[1];
    const posibleAhorro = Math.round(segundo.total * 0.2);
    insights.push({
      id: "sugerencia_ahorro", icon: "💡", color: C.indigo,
      title: `Reducir ${segundo.label} un 20% te daría ${COP(posibleAhorro)} extra`,
      body: `Es el segundo gasto más alto de este mes`,
      type: "tip",
    });
  }

  // 5. Sin aportes a metas
  if (totalIng > 0 && totalAhorr === 0) {
    insights.push({
      id: "sin_metas", icon: "⭐", color: C.violet,
      title: "Aún no has aportado a tus metas este mes",
      body: "Empieza con poco — cualquier monto cuenta",
      type: "tip",
    });
  }

  // Máximo 3, priorizando warnings > success > tip > info
  const ORDER  = { warning: 0, success: 1, tip: 2, info: 3 };
  const top3   = [...insights].sort((a, b) => ORDER[a.type] - ORDER[b.type]).slice(0, 3);

  if (top3.length === 0) return null;

  const BG_MAP = {
    warning: `${C.amber}10`, success: `${C.emerald}10`,
    tip: `${C.indigo}10`,   info: "rgba(255,255,255,0.04)",
  };
  const BORDER_MAP = {
    warning: `${C.amber}30`, success: `${C.emerald}30`,
    tip: `${C.indigo}30`,   info: "rgba(255,255,255,0.08)",
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: C.text.b, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
        🧠 Insights del mes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {top3.map(ins => (
          <div key={ins.id} style={{
            borderRadius: 16, padding: "13px 15px",
            background: BG_MAP[ins.type],
            border: `1px solid ${BORDER_MAP[ins.type]}`,
            display: "flex", alignItems: "center", gap: 12,
            animation: "fadeIn 0.3s ease",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: `${ins.color}20`, border: `1px solid ${ins.color}35`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>{ins.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h, marginBottom: 3, lineHeight: 1.3 }}>
                {ins.title}
              </div>
              <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.4 }}>
                {ins.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}