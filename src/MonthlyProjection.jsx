// ─── PROYECCIÓN MENSUAL GLOBAL ────────────────────────────────────────────────
// Base: saldo actual (ya tiene descontado gastos + metas + sobrante anterior)
// Proyección: cuánto más gastarás a este ritmo vs lo que te queda

export function MonthlyProjection({ gastosTx, saldo, month, C, COP, MONTHS_S }) {
  const now         = new Date();
  const today       = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), month + 1, 0).getDate();
  const daysLeft    = daysInMonth - today;

  if (gastosTx.length === 0 || daysLeft < 1 || saldo == null) return null;

  const totalGastado = gastosTx.reduce((s, t) => s + t.amount, 0);

  // safeDays: mínimo 5 para evitar proyecciones exageradas al inicio del mes
  const safeDays    = Math.max(today, 5);
  const gastoDiario = totalGastado / safeDays;

  if (gastoDiario <= 0) return null;

  // Gasto restante proyectado a este ritmo
  const gastoRestante    = gastoDiario * daysLeft;
  // Saldo al final del mes = lo que tienes hoy - lo que gastarás a este ritmo
  const saldoFinal       = saldo - gastoRestante;

  const isNeg   = saldoFinal < 0;
  const isAjust = !isNeg && saldo > 0 && (saldoFinal / saldo) < 0.15;
  const isBien  = !isNeg && !isAjust;

  const color = isNeg ? C.red : isAjust ? C.amber : C.emerald;
  const icono = isNeg ? "💪" : isAjust ? "⚡" : "📈";

  // Mensaje: usa el saldo final real
  let titulo, subtexto;
  if (isBien) {
    titulo   = <>A este ritmo terminarás {MONTHS_S[month]} con <span style={{fontWeight:800,color}}>{COP(Math.round(saldoFinal))}</span> disponibles</>;
    subtexto = `Gasto diario: ${COP(Math.round(gastoDiario))} · ${daysLeft} días restantes`;
  } else if (isAjust) {
    titulo   = <>Vas ajustado — terminarás {MONTHS_S[month]} con apenas <span style={{fontWeight:800,color}}>{COP(Math.round(saldoFinal))}</span></>;
    subtexto = `Intenta reducir gastos los ${daysLeft} días que quedan`;
  } else {
    titulo   = <>Este mes estuvo difícil, pero el siguiente lo harás mejor 💪</>;
    subtexto = `Gasto diario: ${COP(Math.round(gastoDiario))} · Saldo disponible: ${COP(Math.max(saldo, 0))}`;
  }

  return (
    <div style={{
      borderRadius: 14, padding: "12px 14px", marginTop: 12,
      background: `${color}10`, border: `1px solid ${color}28`,
      display: "flex", alignItems: "flex-start", gap: 10,
      animation: "fadeIn 0.3s ease",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icono}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h, lineHeight: 1.5 }}>{titulo}</div>
        <div style={{ fontSize: 11, color: C.text.b, marginTop: 4 }}>{subtexto}</div>
      </div>
    </div>
  );
}