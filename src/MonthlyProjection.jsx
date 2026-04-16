// ─── PROYECCIÓN MENSUAL GLOBAL ────────────────────────────────────────────────
// Solo proyecta cuando hay suficientes días con datos para ser confiable
// Requiere mínimo 8 días transcurridos Y al menos 4 días distintos con gastos

export function MonthlyProjection({ gastosTx, saldo, month, C, COP, MONTHS_S }) {
  const now         = new Date();
  const today       = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), month + 1, 0).getDate();
  const daysLeft    = daysInMonth - today;

  // Requisitos mínimos para proyectar con confianza
  if (gastosTx.length === 0 || daysLeft < 1 || saldo == null) return null;
  if (today < 8) return null; // muy inicio de mes — datos insuficientes

  // Agrupar gastos por día
  const porDia = {};
  gastosTx.forEach(t => {
    const d = parseInt(t.date.split('-')[2], 10);
    porDia[d] = (porDia[d] || 0) + t.amount;
  });

  const diasConGasto = Object.keys(porDia).length;
  if (diasConGasto < 4) return null; // menos de 4 días con gastos — no proyectar

  const valoresDias = Object.values(porDia).sort((a, b) => a - b);

  // Usar el percentil 60 (ni el más bajo ni el más alto)
  // Más robusto que mediana o promedio para datos con outliers
  const idx60 = Math.floor(valoresDias.length * 0.6);
  const gastoDiario = valoresDias[Math.min(idx60, valoresDias.length - 1)];

  if (gastoDiario <= 0) return null;

  // Proyección desde el saldo actual
  const gastoRestante = gastoDiario * daysLeft;
  const saldoFinal    = saldo - gastoRestante;

  // Solo mostrar si el resultado es positivo y razonable
  // Si es negativo, no mostrar — el usuario ya sabe que gastó mucho
  if (saldoFinal < 0) return null;

  // "Ajustado" solo si queda menos del 5% del saldo
  const isAjust = saldo > 0 && (saldoFinal / saldo) < 0.05;
  const color   = isAjust ? C.amber : C.emerald;
  const icono   = isAjust ? "⚡" : "📈";

  return (
    <div style={{
      borderRadius: 14, padding: "12px 14px", marginTop: 12,
      background: `${color}10`, border: `1px solid ${color}28`,
      display: "flex", alignItems: "flex-start", gap: 10,
      animation: "fadeIn 0.3s ease",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icono}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h, lineHeight: 1.5 }}>
          {isAjust
            ? <>Vas muy ajustado — terminarás {MONTHS_S[month]} con apenas <span style={{fontWeight:800,color}}>{COP(Math.round(saldoFinal))}</span></>
            : <>A este ritmo terminarás {MONTHS_S[month]} con <span style={{fontWeight:800,color}}>{COP(Math.round(saldoFinal))}</span> disponibles</>
          }
        </div>
        <div style={{ fontSize: 11, color: C.text.b, marginTop: 4 }}>
          Gasto típico: {COP(Math.round(gastoDiario))}/día · {daysLeft} días restantes
        </div>
      </div>
    </div>
  );
}