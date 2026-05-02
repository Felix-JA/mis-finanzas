// ─── SIMULADOR DE DECISIÓN v2 ─────────────────────────────────────────────────
// ¿Me alcanza la plata? que considera:
//   - Gasto proyectado hasta fin de mes (no solo saldo actual)
//   - Días restantes × gasto diario típico = "reserva necesaria"
//   - Próximo pago (quincenas/mensual)
//   - Impacto en metas
//   - Veredicto real: ¿puedes comprar esto SIN quedarte sin dinero?

import { useSwipeDismiss } from "./useSwipeDismiss";
import { useState, useMemo } from "react";

export function SimuladorDecision({
  open, onClose,
  disponibleGastar, salario,
  gastosTx, goals, getAportado,
  presupuestos, MAIN_CATS,
  month, C, COP,
  quincenas, modoSalario,
}) {
  const [monto, setMonto] = useState("");
  const sw = useSwipeDismiss(onClose);

  const raw = Number(String(monto).replace(/\D/g, "")) || 0;

  const resultado = useMemo(() => {
    if (raw <= 0) return null;

    const now = new Date();
    const today = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const diasRestantes = daysInMonth - today;

    // ── Gasto diario típico (percentil 60, excluye aportes a metas) ──────────
    const porDia = {};
    gastosTx.forEach(t => {
      if (t.goalId) return;
      const d = parseInt((t.date || "").split("-")[2] || "1", 10);
      porDia[d] = (porDia[d] || 0) + t.amount;
    });
    const vals = Object.values(porDia).sort((a, b) => a - b);
    const idx = Math.floor(vals.length * 0.6);
    const gastoDiarioReal = vals.length >= 3 ? vals[Math.min(idx, vals.length - 1)] : 0;

    // Si no hay suficientes datos, usar estimado conservador: 60% del salario ÷ 30
    // Esto evita que la reserva sea $0 y el simulador diga "puedes comprarlo" siempre
    const gastoDiarioEstimado = salario > 0 ? Math.round((salario * 0.6) / 30) : 0;
    const gastoDiario = gastoDiarioReal > 0 ? gastoDiarioReal : gastoDiarioEstimado;
    const esEstimado = gastoDiarioReal === 0;

    // ── Reserva necesaria hasta cobrar ───────────────────────────────────────
    let diasAlPago = null;
    let proximoPago = null;
    // dia1=día de pago mensual o 1ra quincena, dia2=2da quincena
    // Default conservador: fin de mes (día 30)
    const { dia1 = 30, dia2 = 15 } = quincenas || {};
    if (modoSalario === "quincenal") {
      if (today < dia1) { diasAlPago = dia1 - today; proximoPago = dia1; }
      else if (today < dia2) { diasAlPago = dia2 - today; proximoPago = dia2; }
      else { diasAlPago = daysInMonth - today + dia1; proximoPago = dia1; }
    } else {
      const diaPago = (quincenas && dia1 > 0) ? dia1 : 30;
      if (today < diaPago) { diasAlPago = diaPago - today; proximoPago = diaPago; }
      else { diasAlPago = daysInMonth - today + diaPago; proximoPago = diaPago; }
    }
    // Mínimo 1 día para evitar división por cero
    diasAlPago = Math.max(1, diasAlPago);

    // Reserva = gasto diario × días hasta cobrar
    const reservaNecesaria = gastoDiario * diasAlPago;

    // Margen REAL = disponible - reserva - compra
    const margenReal = disponibleGastar - reservaNecesaria - raw;
    // Disponible "seguro" = disponible - reserva
    const disponibleSeguro = disponibleGastar - reservaNecesaria;
    // Disponible después de comprar (sin considerar reserva)
    const disponibleDespues = disponibleGastar - raw;

    // ── Nivel de riesgo ───────────────────────────────────────────────────────
    // 0=ok, 1=ajustado, 2=riesgo, 3=no alcanza
    let nivelRiesgo;
    let veredicto;
    let colorVeredicto;

    if (disponibleDespues < 0) {
      nivelRiesgo = 3;
      veredicto = { icono: "❌", titulo: "No te alcanza", texto: `Te faltan ${COP(Math.abs(disponibleDespues))} — no tienes este dinero disponible.` };
      colorVeredicto = C.red;
    } else if (margenReal < 0) {
      // Alcanza el saldo pero no la reserva para vivir hasta cobrar
      const faltaReserva = Math.abs(margenReal);
      nivelRiesgo = 2;
      veredicto = {
        icono: "⚠️",
        titulo: "Ojo, puede ser riesgoso",
        texto: `Tienes los ${COP(raw)} pero te quedarían solo ${COP(Math.max(disponibleDespues,0))} para ${diasAlPago} días más. Necesitas ~${COP(Math.round(reservaNecesaria))} para llegar al día ${proximoPago}.`,
      };
      colorVeredicto = C.amber;
    } else if (margenReal < reservaNecesaria * 0.3) {
      nivelRiesgo = 1;
      veredicto = {
        icono: "⚡",
        titulo: "Alcanza, pero justo",
        texto: `Alcanza, pero solo te sobrarían ${COP(Math.round(margenReal))} de sobra para imprevistos hasta el día ${proximoPago}.`,
      };
      colorVeredicto = C.amber;
    } else {
      nivelRiesgo = 0;
      veredicto = {
        icono: "✅",
        titulo: "Sí te alcanza",
        texto: `Después de cubrir tus gastos del mes, te sobrarían ${COP(Math.round(margenReal))} para cuando llegue tu próximo pago el día ${proximoPago}.`,
      };
      colorVeredicto = C.emerald;
    }

    // ── % del salario ─────────────────────────────────────────────────────────
    const pctSalario = salario > 0 ? raw / salario : 0;

    // ── Días equivalentes de gasto ────────────────────────────────────────────
    const diasEquivalentes = gastoDiario > 0 ? raw / gastoDiario : 0;

    // ── Impacto en metas ──────────────────────────────────────────────────────
    const metasActivas = (goals || []).filter(g => {
      const aportado = getAportado(g.id);
      return g.monto > 0 && aportado < g.monto;
    });
    const impactoMetas = metasActivas.slice(0, 3).map(g => {
      const aportado = getAportado(g.id);
      const txMeta = gastosTx.filter(t => t.goalId === g.id);
      const totalMeta = txMeta.reduce((s, t) => s + t.amount, 0);
      const promMeta = txMeta.length > 0 ? totalMeta / txMeta.length : 0;
      const mesesExtra = promMeta > 0 ? Math.ceil(raw / promMeta) : 0;
      return { ...g, aportado, mesesExtra };
    }).filter(g => g.mesesExtra > 0);

    // ── Alternativa inteligente ───────────────────────────────────────────────
    // ¿Cuánto podría gastar sin riesgo?
    const montoSeguro = Math.max(0, Math.floor(disponibleSeguro * 0.7 / 1000) * 1000);

    return {
      disponibleDespues,
      disponibleSeguro,
      margenReal,
      reservaNecesaria,
      diasAlPago,
      proximoPago,
      gastoDiario,
      esEstimado,
      diasEquivalentes,
      nivelRiesgo,
      veredicto,
      colorVeredicto,
      pctSalario,
      impactoMetas,
      montoSeguro,
      diasRestantes,
    };
  }, [raw, disponibleGastar, salario, goals, getAportado, gastosTx, month, quincenas, modoSalario]);

  if (!open) return null;

  const display = raw > 0 ? raw.toLocaleString("es-CO") : "";

  return (
    <div
      ref={sw.overlayRef}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "flex-end", zIndex: 400,
        ...sw.overlayStyle,
      }}
    >
      <div
        ref={sw.cardRef}
        {...sw.dragProps}
        style={{
          width: "100%", maxWidth: 430, margin: "0 auto",
          background: C.card, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.border}`,
          padding: "20px 20px 36px",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          position: "relative",
          overflowY: "auto", overscrollBehavior: "contain",
          ...sw.cardStyle,
        }}
      >
        {/* × */}
        <button onClick={onClose} aria-label="Cerrar" style={{
          position: "absolute", top: 14, right: 14,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, width: 32, height: 32, cursor: "pointer",
          color: C.text.b, fontSize: 18, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
        }}>×</button>

        {/* Handle */}
        <div {...sw.handleProps} style={{...sw.handleProps.style, marginBottom: 14, padding: "4px 0 8px"}}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: 16, paddingRight: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>🔮</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text.h }}>¿Me alcanza la plata?</div>
          </div>
          <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.5 }}>
            ¿Puedes hacer esa compra sin quedarte corto?
          </div>
        </div>

        {/* Contexto rápido */}
        {resultado === null && (
          <div style={{
            display: "flex", gap: 8, marginBottom: 16,
          }}>
            {[
              { label: "Tienes ahora", val: COP(disponibleGastar), color: C.emerald },
              { label: "Gastas/día", val: (() => {
                const porDia = {};
                gastosTx.forEach(t => { if (t.goalId) return; const d = parseInt((t.date||"").split("-")[2]||"1",10); porDia[d]=(porDia[d]||0)+t.amount; });
                const vals = Object.values(porDia).sort((a,b)=>a-b);
                const idx = Math.floor(vals.length*0.6);
                const gd = vals.length>=3?vals[Math.min(idx,vals.length-1)]:0;
                return gd > 0 ? COP(Math.round(gd)) : "—";
              })(), color: C.amber },
              { label: "Días pa' cobro", val: (() => {
                if (!quincenas) return "—";
                const today = new Date().getDate();
                const { dia1=30, dia2=15 } = quincenas;
                const dim = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
                if (modoSalario==="quincenal") {
                  if (today<dia1) return `${dia1-today}d`;
                  if (today<dia2) return `${dia2-today}d`;
                  return `${dim-today+dia1}d`;
                }
                return today<dia1 ? `${dia1-today}d` : `${dim-today+dia1}d`;
              })(), color: C.indigo },
            ].map(item => (
              <div key={item.label} style={{
                flex: 1, background: C.surface, borderRadius: 12,
                padding: "10px 10px 8px", textAlign: "center",
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: 10, color: C.text.s, marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Input monto */}
        <div style={{
          display: "flex", alignItems: "center",
          background: C.surface, borderRadius: 16,
          border: `2px solid ${raw > 0 ? C.indigo : C.border}`,
          overflow: "hidden", marginBottom: 16,
          transition: "border-color 0.2s",
        }}>
          <span style={{ padding: "0 16px", color: C.text.b, fontSize: 20, lineHeight: "60px" }}>$</span>
          <input
            inputMode="numeric"
            placeholder="¿Cuánto vale?"
            value={display}
            onChange={e => setMonto(e.target.value.replace(/\D/g, ""))}
            autoFocus
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 26, fontWeight: 800, color: C.text.h,
              padding: "0 8px 0 0", height: 60, letterSpacing: -0.5,
              caretColor: C.indigo,
            }}
          />
        </div>

        {/* Estado vacío */}
        {!resultado && (
          <div style={{ textAlign: "center", padding: "24px 0", color: C.text.s, fontSize: 14, lineHeight: 1.7 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            Escribe el valor y te digo si te alcanza.
          </div>
        )}

        {/* Resultados */}
        {resultado && (
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* VEREDICTO — siempre primero y grande */}
            <div style={{
              borderRadius: 18, padding: "18px",
              background: `${resultado.colorVeredicto}14`,
              border: `2px solid ${resultado.colorVeredicto}40`,
              marginBottom: 10,
              animation: "fadeIn 0.2s ease",
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{resultado.veredicto.icono}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: resultado.colorVeredicto, marginBottom: 6 }}>
                {resultado.veredicto.titulo}
              </div>
              <div style={{ fontSize: 13, color: C.text.b, lineHeight: 1.6 }}>
                {resultado.veredicto.texto}
              </div>
            </div>

            {/* Breakdown financiero */}
            <div style={{
              borderRadius: 18, padding: "14px 16px",
              background: C.surface, border: `1px solid ${C.border}`,
              marginBottom: 10, animation: "fadeIn 0.25s ease",
            }}>
              <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
                Hasta que te paguen el día {resultado.proximoPago}
              </div>
              {[
                { label: "Disponible ahora", val: COP(disponibleGastar), color: C.emerald },
                { label: `Gastos estimados — ${resultado.diasAlPago} días`, val: `- ${COP(Math.round(resultado.reservaNecesaria))}`, color: C.amber },
                { label: "Esta compra", val: `- ${COP(raw)}`, color: C.red },
                { label: "Margen real", val: COP(Math.round(resultado.margenReal)), color: resultado.margenReal >= 0 ? C.emerald : C.red, bold: true },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0",
                  borderBottom: i < 3 ? `1px solid ${C.border}` : "none",
                }}>
                  <span style={{ fontSize: 12, color: C.text.b, flex: 1, paddingRight: 8 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: row.bold ? 900 : 700, color: row.color }}>{row.val}</span>
                </div>
              ))}
              {resultado.esEstimado && (
                <div style={{ fontSize: 10, color: C.text.s, marginTop: 8, lineHeight: 1.5 }}>
                  * Estimado con base en tu salario. Mejora con más registros.
                </div>
              )}
            </div>

            {/* Alternativa inteligente — solo si el riesgo es alto */}
            {resultado.nivelRiesgo >= 2 && resultado.montoSeguro > 0 && resultado.montoSeguro < raw && (
              <div style={{
                borderRadius: 18, padding: "14px 16px",
                background: `${C.indigo}10`, border: `1px solid ${C.indigo}28`,
                marginBottom: 10, animation: "fadeIn 0.3s ease",
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text.h, marginBottom: 4 }}>
                  💡 ¿Puedes esperar al día {resultado.proximoPago}?
                </div>
                <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.6 }}>
                  Hoy podrías gastar hasta <span style={{ fontWeight: 800, color: C.indigo }}>{COP(resultado.montoSeguro)}</span> sin riesgo. 
                  Después de cobrar tendrás más margen para esta compra.
                </div>
              </div>
            )}

            {/* Equivalencia días */}
            {resultado.diasEquivalentes >= 1 && resultado.gastoDiario > 0 && (
              <div style={{
                borderRadius: 18, padding: "14px 16px",
                background: `${C.amber}10`, border: `1px solid ${C.amber}28`,
                marginBottom: 10, animation: "fadeIn 0.35s ease",
              }}>
                <div style={{ fontSize: 13, color: C.text.h, fontWeight: 700, marginBottom: 2 }}>
                  ⏱ = {Math.round(resultado.diasEquivalentes)} días de gastos
                </div>
                <div style={{ fontSize: 11, color: C.text.b }}>
                  Tu gasto típico es {COP(Math.round(resultado.gastoDiario))}/día
                </div>
              </div>
            )}

            {/* Impacto en metas */}
            {resultado.impactoMetas.length > 0 && (
              <div style={{
                borderRadius: 18, padding: "14px 16px",
                background: `${C.violet}10`, border: `1px solid ${C.violet}28`,
                marginBottom: 10, animation: "fadeIn 0.4s ease",
              }}>
                <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                  Impacto en tus metas
                </div>
                {resultado.impactoMetas.map(g => (
                  <div key={g.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 0", borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{g.emoji || "⭐"}</span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h }}>{g.name}</div>
                    </div>
                    <div style={{
                      background: `${C.violet}20`, borderRadius: 8,
                      padding: "4px 10px", fontSize: 11, fontWeight: 800, color: C.violet,
                    }}>+{g.mesesExtra} {g.mesesExtra === 1 ? "mes" : "meses"}</div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}