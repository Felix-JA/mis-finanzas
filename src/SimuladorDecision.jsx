// ─── SIMULADOR DE DECISIÓN ────────────────────────────────────────────────────
// "¿Qué pasa si compro X hoy?"
// Muestra el impacto real de una compra en:
//   1. Disponible restante del mes
//   2. Metas: cuántos meses se retrasa cada una
//   3. Categorías: si excede algún presupuesto
//   4. Proyección: cuántos días "de gasto típico" representa
//
// Props:
//   open               → bool
//   onClose            → () => void
//   disponibleGastar   → number (disponible actual)
//   salario            → number
//   gastosTx           → array de tx del mes (gastos reales)
//   goals              → array de metas activas
//   getAportado        → (goalId) => number (total aportado a esa meta)
//   presupuestos       → { [catId]: limite }
//   MAIN_CATS          → array
//   month              → number (0-11)
//   C                  → theme object
//   COP                → formatter fn

import { useState, useMemo } from "react";

export function SimuladorDecision({
  open, onClose,
  disponibleGastar, salario,
  gastosTx, goals, getAportado,
  presupuestos, MAIN_CATS,
  month, C, COP,
}) {
  const [monto, setMonto] = useState("");
  const [dragY, setDragY] = useState(0);
  const [dragStartY, setDragStartY] = useState(null);

  const MONTHS_S = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

  // Swipe to dismiss
  function onTouchStart(e) { setDragStartY(e.touches[0].clientY); }
  function onTouchMove(e) {
    if (dragStartY === null) return;
    const d = e.touches[0].clientY - dragStartY;
    if (d > 0) setDragY(d);
  }
  function onTouchEnd() {
    if (dragY > 80) onClose();
    setDragY(0);
    setDragStartY(null);
  }

  const raw = Number(String(monto).replace(/\D/g, "")) || 0;

  const resultado = useMemo(() => {
    if (raw <= 0) return null;

    // 1. Disponible restante
    const disponibleDespues = disponibleGastar - raw;
    const alcanza = disponibleDespues >= 0;

    // 2. % del salario que representa
    const pctSalario = salario > 0 ? raw / salario : 0;

    // 3. Impacto en metas activas (las que no están logradas)
    const metasActivas = (goals || []).filter(g => {
      const aportado = getAportado(g.id);
      return g.monto > 0 && aportado < g.monto;
    });

    // Promedio mensual de aportes a metas este mes como referencia
    const totalAportadoMes = gastosTx
      .filter(t => !!t.goalId)
      .reduce((s, t) => s + t.amount, 0);
    const aporteProm = totalAportadoMes;

    // Cuántos "meses de ahorro" representa la compra
    const mesesAhorro = aporteProm > 0 ? raw / aporteProm : 0;

    // Impacto por meta: cuántos meses más tarda
    // Solo calcular si hay aportes reales a esa meta este mes (evitar cifras inventadas)
    const impactoMetas = metasActivas.slice(0, 3).map(g => {
      const aportado = getAportado(g.id);
      const faltan = Math.max(g.monto - aportado, 0);
      const txMeta = gastosTx.filter(t => t.goalId === g.id);
      const totalMeta = txMeta.reduce((s, t) => s + t.amount, 0);
      // Promedio real basado en aportes del mes (transacciones individuales)
      const promMeta = txMeta.length > 0 ? totalMeta / txMeta.length : 0;
      const mesesExtra = promMeta > 0 ? Math.ceil(raw / promMeta) : 0;
      return { ...g, aportado, faltan, mesesExtra, promMeta };
    }).filter(g => g.mesesExtra > 0); // solo mostrar si hay impacto calculable

    // 4. Gasto diario típico — cuántos días representa
    const porDia = {};
    gastosTx.forEach(t => {
      if (t.goalId) return; // excluir aportes a metas
      const d = parseInt((t.date || "").split("-")[2] || "1", 10);
      porDia[d] = (porDia[d] || 0) + t.amount;
    });
    const vals = Object.values(porDia).sort((a, b) => a - b);
    const idx = Math.floor(vals.length * 0.6);
    const gastoDiario = vals.length >= 3 ? vals[Math.min(idx, vals.length - 1)] : 0;
    const diasEquivalentes = gastoDiario > 0 ? raw / gastoDiario : 0;

    return {
      disponibleDespues,
      alcanza,
      pctSalario,
      mesesAhorro,
      impactoMetas,
      gastoDiario,
      diasEquivalentes,
    };
  }, [raw, disponibleGastar, salario, goals, getAportado, gastosTx, presupuestos, MAIN_CATS, month]);

  if (!open) return null;

  const display = raw > 0 ? raw.toLocaleString("es-CO") : "";

  // Color semáforo del disponible
  const colorDisp = resultado
    ? resultado.disponibleDespues < 0
      ? C.red
      : resultado.disponibleDespues / Math.max(disponibleGastar, 1) < 0.15
        ? C.amber
        : C.emerald
    : C.text.s;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "flex-end", zIndex: 400,
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 430, margin: "0 auto",
          background: C.card, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.border}`,
          padding: "20px 20px 36px",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          animation: dragY === 0 ? "slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          transform: `translateY(${dragY}px)`,
          transition: dragStartY === null ? "transform 0.2s ease" : "none",
          position: "relative",
        }}
      >
        {/* × */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute", top: 14, right: 14,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, width: 32, height: 32, cursor: "pointer",
            color: C.text.b, fontSize: 18, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2,
          }}
        >×</button>

        {/* Handle */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            display: "flex", justifyContent: "center",
            marginBottom: 14, padding: "4px 0 8px",
            cursor: "grab", touchAction: "none",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: 20, paddingRight: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>🔮</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text.h }}>
              Simulador de decisión
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.5 }}>
            ¿Qué pasa si lo compras hoy? Ve el impacto real antes de decidir.
          </div>
        </div>

        {/* Input monto */}
        <div style={{
          display: "flex", alignItems: "center",
          background: C.surface, borderRadius: 16,
          border: `2px solid ${raw > 0 ? C.indigo : C.border}`,
          overflow: "hidden", marginBottom: 20,
          transition: "border-color 0.2s",
        }}>
          <span style={{ padding: "0 16px", color: C.text.b, fontSize: 20, lineHeight: "60px" }}>$</span>
          <input
            inputMode="numeric"
            placeholder="¿Cuánto cuesta?"
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

        {/* Resultados */}
        {!resultado && (
          <div style={{
            textAlign: "center", padding: "32px 0",
            color: C.text.s, fontSize: 14, lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            Escribe el monto y verás el impacto<br />al instante.
          </div>
        )}

        {resultado && (
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* 1. Disponible después */}
            <div style={{
              borderRadius: 18, padding: "16px",
              background: `${colorDisp}12`,
              border: `1px solid ${colorDisp}35`,
              marginBottom: 10,
              animation: "fadeIn 0.25s ease",
            }}>
              <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Tu disponible quedaría en
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: colorDisp, letterSpacing: -1, marginBottom: 4 }}>
                {resultado.disponibleDespues < 0 ? "-" : ""}{COP(Math.abs(resultado.disponibleDespues))}
              </div>
              <div style={{ fontSize: 12, color: C.text.b }}>
                {resultado.disponibleDespues < 0
                  ? `⚠️ Te faltan ${COP(Math.abs(resultado.disponibleDespues))} — no alcanza este mes`
                  : resultado.pctSalario >= 0.3
                    ? `Ojo: eso es el ${Math.round(resultado.pctSalario * 100)}% de tu salario`
                    : `Tienes ${COP(disponibleGastar)} ahora — quedarías con ${COP(resultado.disponibleDespues)}`
                }
              </div>
            </div>

            {/* 2. Equivalencia en días */}
            {resultado.diasEquivalentes >= 1 && (
              <div style={{
                borderRadius: 18, padding: "14px 16px",
                background: `${C.amber}10`,
                border: `1px solid ${C.amber}28`,
                marginBottom: 10,
                animation: "fadeIn 0.3s ease",
              }}>
                <div style={{ fontSize: 13, color: C.text.h, fontWeight: 700, marginBottom: 2 }}>
                  ⏱ Equivale a {resultado.diasEquivalentes >= 1 ? `${Math.round(resultado.diasEquivalentes)} días` : "menos de un día"} de gastos
                </div>
                <div style={{ fontSize: 11, color: C.text.b }}>
                  Basado en tu gasto típico de {COP(Math.round(resultado.gastoDiario))}/día
                </div>
              </div>
            )}

            {/* 3. Impacto en metas */}
            {resultado.impactoMetas.length > 0 && resultado.mesesAhorro >= 0.5 && (
              <div style={{
                borderRadius: 18, padding: "14px 16px",
                background: `${C.violet}10`,
                border: `1px solid ${C.violet}28`,
                marginBottom: 10,
                animation: "fadeIn 0.35s ease",
              }}>
                <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                  Impacto en tus metas
                </div>
                {resultado.impactoMetas.map(g => (
                  <div key={g.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{g.emoji || "⭐"}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h }}>{g.name}</div>
                        <div style={{ fontSize: 10, color: C.text.s }}>
                          {COP(g.aportado)} / {COP(g.monto)}
                        </div>
                      </div>
                    </div>
                    {g.mesesExtra > 0 ? (
                      <div style={{
                        background: `${C.violet}20`, borderRadius: 8,
                        padding: "4px 10px", fontSize: 11, fontWeight: 800, color: C.violet,
                        whiteSpace: "nowrap",
                      }}>
                        +{g.mesesExtra} {g.mesesExtra === 1 ? "mes" : "meses"}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: C.emerald, fontWeight: 700 }}>Sin impacto</div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 10, color: C.text.s, marginTop: 8, lineHeight: 1.5 }}>
                  Tiempo extra estimado si este dinero hubiera ido a metas
                </div>
              </div>
            )}

            {/* 4. Veredicto final */}
            {(() => {
              const pctCompra = disponibleGastar > 0 ? raw / disponibleGastar : 1;
              const dispDespues = resultado.disponibleDespues;
              let icono, texto;
              if (dispDespues < 0) {
                icono = "❌"; texto = `No alcanza — te faltan ${COP(Math.abs(dispDespues))} este mes.`;
              } else if (pctCompra >= 0.9) {
                icono = "🔴"; texto = "Casi vacía tu disponible. Solo te quedaría para emergencias.";
              } else if (pctCompra >= 0.7) {
                icono = "🤔"; texto = "Gasto grande — usarías más del 70% de tu disponible. ¿Es urgente?";
              } else if (pctCompra >= 0.3) {
                icono = "⚡"; texto = "Te deja ajustado para el resto del mes.";
              } else {
                icono = "✅"; texto = "Lo puedes cubrir sin afectar tu mes.";
              }
              return (
                <div style={{
                  borderRadius: 18, padding: "14px 16px",
                  background: C.surface, border: `1px solid ${C.border}`,
                  marginBottom: 4, animation: "fadeIn 0.45s ease",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h, lineHeight: 1.6 }}>
                    {icono} {texto}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}