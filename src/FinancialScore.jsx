// ─── MI ESTADO FINANCIERO ─────────────────────────────────────────────────────
import { useState } from "react";

function parseDateSafe(str){
  if(!str||typeof str!=='string')return new Date();
  const[y,m,d]=str.split('-').map(Number);
  return new Date(y,(m||1)-1,d||1);
}

export function FinancialScore({
  totalIng, totalGasto, totalAhorr, goals, tx,
  month, C, COP, isMonth, isAporteMeta, isSavingsLegacy, MONTHS_S,
  onNavigate, onAddTx, onAportarMeta, totalMesesConDatos,
}) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.getDate();

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? currentYear - 1 : currentYear;

  // ── Factor 1: Ahorro (0–30) ───────────────────────────────────────────────
  const tasaAhorro     = totalIng > 0 ? totalAhorr / totalIng : 0;
  const ptsAhorro      = Math.min(Math.round(tasaAhorro * 150), 30);
  const pctAhorroBarra = Math.min(tasaAhorro * 5, 1);

  // ── Factor 2: Gastos (0–30) ───────────────────────────────────────────────
  const tasaGasto     = totalIng > 0 ? totalGasto / totalIng : 1;
  const ptsGasto      = totalIng > 0 ? Math.max(Math.round((1 - Math.min(tasaGasto, 1)) * 30), 0) : 0;
  const pctGastoBarra = Math.min(ptsGasto / 30, 1);

  // ── Factor 3: Metas — constancia (0–25) ──────────────────────────────────
  const mesesConAporte = new Set(
    tx.filter(t => isAporteMeta(t) || isSavingsLegacy(t.cat))
      .map(t => { const d = parseDateSafe(t.date); return `${d.getFullYear()}-${d.getMonth()}`; })
  ).size;
  const ptsMetas      = Math.min(mesesConAporte * 4, 25);
  const pctMetasBarra = Math.min(ptsMetas / 25, 1);
  const metasTexto    = goals.length === 0
    ? "Aún no tienes metas — crea la primera"
    : mesesConAporte === 0
    ? "Empieza con poco — cualquier aporte cuenta"
    : `${mesesConAporte} mes${mesesConAporte !== 1 ? "es" : ""} aportando a tus metas`;

  // ── Factor 4: Constancia (0–15) ───────────────────────────────────────────
  const mesesConMovimiento = totalMesesConDatos ||
    new Set(tx.map(t => { const d = parseDateSafe(t.date); return `${d.getFullYear()}-${d.getMonth()}`; })).size;
  const ptsConstancia      = Math.min(mesesConMovimiento * 3, 15);
  const pctConstanciaBarra = Math.min(ptsConstancia / 15, 1);

  const score = ptsAhorro + ptsGasto + ptsMetas + ptsConstancia;
  const enPeriodoGracia = mesesConMovimiento < 3;

  // ── Delta vs mes anterior (normalizado) ───────────────────────────────────
  const prevTx      = tx.filter(t => isMonth(t.date, prevMonth, prevYear));
  const prevIng     = prevTx.filter(t => t.cat === "ingreso").reduce((s, t) => s + t.amount, 0);
  const prevGasto   = prevTx.filter(t => t.cat !== "ingreso" && t.cat !== "prestamo_devuelto" && t.cat !== "ingreso_extra" && !isAporteMeta(t) && !isSavingsLegacy(t.cat)).reduce((s, t) => s + t.amount, 0);
  const prevAhorr   = prevTx.filter(t => isAporteMeta(t) || isSavingsLegacy(t.cat)).reduce((s, t) => s + t.amount, 0);

  const daysInPrev    = new Date(prevYear, prevMonth + 1, 0).getDate();
  const safeDays      = Math.max(today, 5);
  const normFactor    = safeDays / daysInPrev;
  const prevIngNorm   = prevIng;
  const prevGastoNorm = prevGasto * normFactor;
  const prevAhorrNorm = prevAhorr * normFactor;

  const prevTasaAhorr = prevIngNorm > 0 ? prevAhorrNorm / prevIngNorm : 0;
  const prevTasaGasto = prevIngNorm > 0 ? prevGastoNorm / prevIngNorm : 1;
  const prevPtsAhorro = Math.min(Math.round(prevTasaAhorr * 150), 30);
  const prevPtsGasto  = prevIngNorm > 0 ? Math.max(Math.round((1 - Math.min(prevTasaGasto, 1)) * 30), 0) : 0;
  const prevScore     = prevPtsAhorro + prevPtsGasto + ptsMetas + ptsConstancia;
  const delta         = score - prevScore;
  const hayDelta      = !enPeriodoGracia && (prevIngNorm > 0 || prevGastoNorm > 0);

  // ── Color y etiqueta ─────────────────────────────────────────────────────
  const scoreColor = enPeriodoGracia ? C.indigo : score < 40 ? C.red : score < 70 ? C.amber : C.emerald;
  const scoreLabel = enPeriodoGracia ? "Comenzando" : score < 40 ? "Crítico" : score < 55 ? "En riesgo" : score < 70 ? "Regular" : score < 85 ? "Bueno" : "Excelente";

  function getEtiqueta(pct, enGracia) {
    if (enGracia) return { label: "En progreso", color: C.indigoLight, bg: `${C.indigo}18` };
    if (pct >= 0.85) return { label: "Excelente", color: C.emeraldLight, bg: `${C.emerald}18` };
    if (pct >= 0.60) return { label: "Bien",      color: C.indigoLight,  bg: `${C.indigo}18` };
    if (pct >= 0.30) return { label: "Mejorando", color: C.amber,        bg: `${C.amber}18` };
    return                  { label: "Crítico",   color: C.red,          bg: `${C.red}18` };
  }

  const etAhorro     = getEtiqueta(pctAhorroBarra, false);
  const etGasto      = getEtiqueta(pctGastoBarra, false);
  const etMetas      = getEtiqueta(pctMetasBarra, enPeriodoGracia && mesesConAporte === 0);
  const etConstancia = getEtiqueta(pctConstanciaBarra, enPeriodoGracia);

  // ── Factor más débil — solo uno recibe el CTA ────────────────────────────
  const factores = [
    { pts: ptsAhorro,     max: 30, key: "ahorro" },
    { pts: ptsGasto,      max: 30, key: "gastos" },
    { pts: ptsMetas,      max: 25, key: "metas" },
    { pts: ptsConstancia, max: 15, key: "constancia" },
  ];
  // En período de gracia, no señalar metas/constancia como débiles
  const factoresValidos = enPeriodoGracia
    ? factores.filter(f => f.key === "ahorro" || f.key === "gastos")
    : factores;
  const debil = [...factoresValidos].sort((a, b) => (a.pts / a.max) - (b.pts / b.max))[0];

  const consejoMap = {
    ahorro:     "Intenta guardar aunque sea el 10% de tu ingreso este mes",
    gastos:     "Tus gastos están altos — revisa qué categoría puedes ajustar",
    metas:      "Aporta a tus metas este mes, aunque sea poco",
    constancia: "Registra seguido — la constancia mejora tu estado financiero",
  };
  const consejoGracia = `Llevas ${mesesConMovimiento} mes${mesesConMovimiento !== 1 ? "es" : ""} — el score se vuelve preciso desde el 3er mes`;

  // ── CTAs con IDs de tab correctos ────────────────────────────────────────
  // Tab IDs del app: "home" | "mov" | "metas" | "cal"
  const ctaMap = {
    ahorro:     { label: "Aportar a mis metas →",    action: () => onAportarMeta?.() },
    gastos:     { label: "Ver mis movimientos →",     action: () => onNavigate?.("mov") },  // ← "mov" no "movimientos"
    metas:      { label: "Ver mis metas →",           action: () => onNavigate?.("metas") },
    constancia: { label: "Registrar un movimiento →", action: () => onAddTx?.() },
  };

  // ── SVG donut ─────────────────────────────────────────────────────────────
  const R = 27, SW = 5.5, C2 = 2 * Math.PI * R;
  const dashOffset = C2 * (1 - Math.min(score, 100) / 100);

  // ── Sub-componente Factor ─────────────────────────────────────────────────
  // esDebil: solo el factor más débil muestra el CTA
  const Factor = ({ pregunta, descripcion, pct, pts, max, etiqueta, esDebil, ctaKey }) => {
    const cta = esDebil ? ctaMap[ctaKey] : null;
    return (
      <div style={{
        borderRadius: 14, padding: "12px 13px", marginBottom: 8,
        background: esDebil ? `${C.amber}08` : C.surface,
        border: `1px solid ${esDebil ? C.amber + "40" : C.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h, marginBottom: 3 }}>{pregunta}</div>
            <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.4 }}>{descripcion}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: etiqueta.color, background: etiqueta.bg, borderRadius: 99, padding: "3px 9px" }}>
              {etiqueta.label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: etiqueta.color, minWidth: 28, textAlign: "right" }}>+{pts}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: 99, height: 4, overflow: "hidden" }}>
            <div style={{ height: 4, borderRadius: 99, background: etiqueta.color, width: `${Math.max(pct * 100, pts > 0 ? 3 : 0)}%`, transition: "width 0.8s ease" }}/>
          </div>
          <span style={{ fontSize: 11, color: C.text.b, minWidth: 32, textAlign: "right" }}>{pts}/{max}</span>
        </div>
        {cta && (
          <button onClick={cta.action} style={{
            marginTop: 10, width: "100%",
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "9px 0",
            fontSize: 12, fontWeight: 700, color: C.text.h,
            cursor: "pointer", textAlign: "center",
          }}>
            {cta.label}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      borderRadius: 20, padding: "18px 18px 16px", marginBottom: 16,
      background: `linear-gradient(135deg,${scoreColor}12 0%,rgba(255,255,255,0.02) 100%)`,
      border: `1px solid ${scoreColor}35`,
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
          <svg width={68} height={68} viewBox="0 0 68 68">
            <circle cx={34} cy={34} r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={SW}/>
            <circle cx={34} cy={34} r={R} fill="none" stroke={scoreColor} strokeWidth={SW}
              strokeDasharray={C2} strokeDashoffset={dashOffset} strokeLinecap="round"
              transform="rotate(-90 34 34)" style={{ transition: "stroke-dashoffset 1s ease" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 9, color: C.text.b, marginTop: 1 }}>/100</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.text.b, letterSpacing: 1.2, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
            Mi estado financiero
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: scoreColor }}>{scoreLabel}</span>
            {hayDelta && (
              <span style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? C.emerald : C.red, background: delta >= 0 ? `${C.emerald}18` : `${C.red}18`, borderRadius: 99, padding: "2px 8px" }}>
                {delta >= 0 ? "↑ +" : "↓ "}{delta} vs {MONTHS_S[prevMonth]}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.emerald }}>+{ptsAhorro}</span>
            <span style={{ fontSize: 10, color: C.text.s }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.indigoLight }}>+{ptsGasto}</span>
            <span style={{ fontSize: 10, color: C.text.s }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.amber }}>+{ptsMetas}</span>
            <span style={{ fontSize: 10, color: C.text.s }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.amber }}>+{ptsConstancia}</span>
            <span style={{ fontSize: 10, color: C.text.b, marginLeft: 2 }}>= {score}</span>
          </div>
        </div>
        <button onClick={() => setOpen(o => !o)} style={{
          background: "none", border: `1px solid ${C.border}`, borderRadius: 9,
          padding: "6px 12px", fontSize: 12, fontWeight: 700, color: C.text.b,
          cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
          {open ? "Cerrar" : "Ver"}
        </button>
      </div>

      {/* Consejo siempre visible */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: scoreColor, flexShrink: 0, marginTop: 5 }}/>
        <span style={{ fontSize: 13, color: C.text.b, lineHeight: 1.5 }}>
          {enPeriodoGracia ? consejoGracia : consejoMap[debil?.key || "ahorro"]}
        </span>
      </div>

      {/* Banner período de gracia */}
      {enPeriodoGracia && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: `${C.indigo}12`, border: `1px solid ${C.indigo}25`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: C.indigoLight, lineHeight: 1.6 }}>
            🚀 Tu score mejora automáticamente cada mes que registras — sigue así
          </div>
        </div>
      )}

      {/* Factores colapsables */}
      {open && (
        <div style={{ marginTop: 14, animation: "fadeIn 0.2s ease" }}>
          <Factor
            pregunta="¿Cuánto estás guardando?"
            descripcion={`Guardas el ${Math.round(tasaAhorro * 100)}% de tu ingreso este mes`}
            pct={pctAhorroBarra} pts={ptsAhorro} max={30} etiqueta={etAhorro}
            esDebil={debil?.key === "ahorro"} ctaKey="ahorro"
          />
          <Factor
            pregunta="¿Están controlados tus gastos?"
            descripcion={`Gastaste el ${Math.round(tasaGasto * 100)}% de tu ingreso este mes`}
            pct={pctGastoBarra} pts={ptsGasto} max={30} etiqueta={etGasto}
            esDebil={debil?.key === "gastos"} ctaKey="gastos"
          />
          <Factor
            pregunta="¿Avanzas en tus metas?"
            descripcion={metasTexto}
            pct={pctMetasBarra} pts={ptsMetas} max={25} etiqueta={etMetas}
            esDebil={debil?.key === "metas"} ctaKey="metas"
          />
          <Factor
            pregunta="¿Registras con regularidad?"
            descripcion={`Llevas ${mesesConMovimiento} mes${mesesConMovimiento !== 1 ? "es" : ""} registrando`}
            pct={pctConstanciaBarra} pts={ptsConstancia} max={15} etiqueta={etConstancia}
            esDebil={debil?.key === "constancia"} ctaKey="constancia"
          />
        </div>
      )}
    </div>
  );
}