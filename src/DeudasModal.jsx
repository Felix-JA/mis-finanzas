// ─── MÓDULO DE DEUDAS ─────────────────────────────────────────────────────────
// Gestiona deudas personales (créditos, cuotas, financiaciones).
// Flujo:
//   1. Crear deuda: nombre, emoji, monto total, cuota mínima mensual, día de pago
//   2. Cada mes: "¿Ya pagaste?" → input de monto pagado (puede ser más que la cuota)
//   3. Al confirmar → registra gasto en cat "cuotas" + actualiza saldoRestante en Firestore
//   4. La deuda recalcula: cuotas restantes = saldoRestante / cuotaMensual
//   5. Cuando saldoRestante <= 0 → deuda liquidada ✅
//
// Estructura Firestore: usuarios/{uid}/deudas
//   { nombre, emoji, montoTotal, saldoRestante, cuotaMensual, dia,
//     liquidada, pagos:[{fecha,monto,txId}], createdAt }
//
// Props:
//   deudas         → array de deudas del usuario
//   onClose        → () => void
//   onSave         → (deuda) => Promise<void>   // crear/editar
//   onPagar        → (deudaId, monto) => Promise<void>  // registrar pago
//   onDelete       → (deudaId) => Promise<void>
//   C, COP         → theme + formatter

import { useState, useMemo, useRef } from "react";

// Emojis sugeridos para deudas
const EMOJIS_DEUDA = ["📱","🏠","🚗","💻","📺","🎮","✈️","🏥","📚","💍","🛋️","🔧","💳","🏦","🎓"];

export function DeudasModal({ deudas, onClose, onSave, onPagar, onDelete, disponibleGastar, C, COP }) {
  const [vista, setVista] = useState("lista");
  const [deudaSelec, setDeudaSelec] = useState(null);
  const [dragY, setDragY] = useState(0);
  const [dragStartY, setDragStartY] = useState(null);
  const scrollRef = useRef(null);

  function onTouchStart(e) { setDragStartY(e.touches[0].clientY); }
  function onTouchMove(e) {
    if (dragStartY === null) return;
    const scrollTop = scrollRef.current?.scrollTop || 0;
    if (scrollTop > 4) { setDragY(0); return; } // no swipe si hay scroll
    const d = e.touches[0].clientY - dragStartY;
    if (d > 0) setDragY(d);
  }
  function onTouchEnd() {
    if (dragY > 80) onClose();
    setDragY(0); setDragStartY(null);
  }

  const activas = deudas.filter(d => !d.liquidada);
  const liquidadas = deudas.filter(d => d.liquidada);
  const totalDeuda = activas.reduce((s, d) => s + (d.saldoRestante || 0), 0);

  // ── Vista: lista principal ─────────────────────────────────────────────────
  const ListaView = () => (
    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
      {/* Resumen */}
      {activas.length > 0 && (
        <div style={{
          margin: "0 0 16px", padding: "14px 16px", borderRadius: 16,
          background: `rgba(244,63,94,0.08)`, border: `1px solid rgba(244,63,94,0.2)`,
        }}>
          <div style={{ fontSize: 11, color: "rgba(244,63,94,0.8)", fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 4 }}>
            Total por pagar
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#f43f5e", letterSpacing: -0.5 }}>
            {COP(totalDeuda)}
          </div>
          <div style={{ fontSize: 11, color: C.text.s, marginTop: 4 }}>
            {activas.length} {activas.length === 1 ? "deuda activa" : "deudas activas"}
          </div>
        </div>
      )}

      {/* Deudas activas */}
      {activas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 0 12px", color: C.text.s, fontSize: 14, lineHeight: 2 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
          Sin deudas activas<br />
          <span style={{ fontSize: 12 }}>¡Eso es todo un logro!</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {activas.map(d => <DeudaCard key={d.id} d={d} />)}
        </div>
      )}

      {/* Liquidadas colapsadas */}
      {liquidadas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8 }}>
            ✅ Liquidadas ({liquidadas.length})
          </div>
          {liquidadas.map(d => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0", borderBottom: `1px solid ${C.border}`,
              opacity: 0.5,
            }}>
              <span style={{ fontSize: 20 }}>{d.emoji || "💳"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h }}>{d.nombre}</div>
                <div style={{ fontSize: 11, color: C.text.s }}>{COP(d.montoTotal)} · Pagado ✓</div>
              </div>
              <button onClick={() => onDelete(d.id)} style={{
                background: "none", border: "none", color: C.text.s,
                fontSize: 16, cursor: "pointer", padding: 4,
              }}>🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Botón nueva deuda */}
      <button onClick={() => { setDeudaSelec(null); setVista("nueva"); }} style={{
        width: "100%", padding: 14, borderRadius: 14, border: "none", cursor: "pointer",
        background: `linear-gradient(135deg, #f43f5e, #e11d48)`,
        color: "#fff", fontSize: 14, fontWeight: 800,
      }}>
        + Nueva deuda
      </button>
    </div>
  );

  // ── Tarjeta de deuda ───────────────────────────────────────────────────────
  const DeudaCard = ({ d }) => {
    const pct = d.montoTotal > 0 ? Math.min(1 - d.saldoRestante / d.montoTotal, 1) : 0;
    const pagado = d.montoTotal - d.saldoRestante;
    const cuotasRestantes = d.cuotaMensual > 0 ? Math.ceil(d.saldoRestante / d.cuotaMensual) : "?";
    const mesesLabel = cuotasRestantes === 1 ? "mes restante" : "meses restantes";

    return (
      <div style={{
        borderRadius: 18, border: `1px solid rgba(244,63,94,0.2)`,
        background: `rgba(244,63,94,0.05)`, overflow: "hidden",
      }}>
        <div style={{ padding: "14px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: `rgba(244,63,94,0.15)`, border: `1px solid rgba(244,63,94,0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>{d.emoji || "💳"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text.h }}>{d.nombre}</div>
              <div style={{ fontSize: 11, color: C.text.s, marginTop: 1 }}>
                Día {d.dia} · cuota mín {COP(d.cuotaMensual)}
              </div>
            </div>
            <button onClick={() => { setDeudaSelec(d); setVista("nueva"); }} style={{
              background: "none", border: "none", color: C.text.s,
              fontSize: 14, cursor: "pointer", padding: 4,
            }}>✏️</button>
          </div>

          {/* Progreso */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.text.s, marginBottom: 5 }}>
              <span>Pagado: {COP(Math.round(pagado))}</span>
              <span>Resta: <b style={{ color: "#f43f5e" }}>{COP(Math.round(d.saldoRestante))}</b></span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: `rgba(244,63,94,0.15)`, overflow: "hidden" }}>
              <div style={{
                height: 8, borderRadius: 99,
                background: pct >= 0.8 ? `linear-gradient(90deg,#f43f5e,#10b981)` : `linear-gradient(90deg,#f43f5e,#fb7185)`,
                width: `${pct * 100}%`, transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ fontSize: 10, color: C.text.s, marginTop: 4, textAlign: "right" }}>
              {Math.round(pct * 100)}% pagado · ~{cuotasRestantes} {mesesLabel}
            </div>
          </div>

          {/* CTA pagar */}
          <button onClick={() => { setDeudaSelec(d); setVista("pagar"); }} style={{
            width: "100%", padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: `rgba(244,63,94,0.12)`, color: "#f43f5e",
            fontSize: 13, fontWeight: 800,
          }}>
            💳 Registrar pago
          </button>
        </div>
      </div>
    );
  };

  // ── Vista: form nueva/editar deuda ─────────────────────────────────────────
  const FormDeuda = () => {
    const isEdit = !!deudaSelec?.id;
    const [nombre, setNombre] = useState(deudaSelec?.nombre || "");
    const [emoji, setEmoji] = useState(deudaSelec?.emoji || "💳");
    const [montoTotal, setMontoTotal] = useState(
      deudaSelec ? Number(deudaSelec.montoTotal).toLocaleString("es-CO") : ""
    );
    const [cuota, setCuota] = useState(
      deudaSelec ? Number(deudaSelec.cuotaMensual).toLocaleString("es-CO") : ""
    );
    const [dia, setDia] = useState(deudaSelec?.dia || 1);
    const [yaAbonado, setYaAbonado] = useState("");
    // En edición: permitir corregir el saldo restante manualmente
    const [saldoRestanteEdit, setSaldoRestanteEdit] = useState(
      deudaSelec ? Number(deudaSelec.saldoRestante).toLocaleString("es-CO") : ""
    );
    const [showEmojis, setShowEmojis] = useState(false);
    const [saving, setSaving] = useState(false);
    const [conf, setConf] = useState(false);

    const rawTotal = Number(montoTotal.replace(/\./g, "").replace(",", ".")) || 0;
    const rawCuota = Number(cuota.replace(/\./g, "").replace(",", ".")) || 0;
    const rawAbonado = Number(yaAbonado.replace(/\./g, "").replace(",", ".")) || 0;
    const rawSaldoEdit = Number(saldoRestanteEdit.replace(/\./g, "").replace(",", ".")) || 0;
    const saldoCalculado = Math.max(rawTotal - rawAbonado, 0);
    const saldoFinal = isEdit ? rawSaldoEdit : saldoCalculado;
    const cuotasEst = saldoFinal > 0 && rawCuota > 0 ? Math.ceil(saldoFinal / rawCuota) : 0;

    function hm(val, set) {
      const r = val.replace(/\D/g, "");
      set(r ? Number(r).toLocaleString("es-CO") : "");
    }

    async function guardar() {
      if (!nombre.trim() || !rawTotal || !rawCuota) return;
      setSaving(true);
      try {
        await onSave({
          id: deudaSelec?.id || null,
          nombre: nombre.trim(), emoji, montoTotal: rawTotal,
          saldoRestante: saldoFinal,
          cuotaMensual: rawCuota, dia, liquidada: saldoFinal <= 0,
        });
        setVista("lista");
      } finally { setSaving(false); }
    }

    return (
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
        <button onClick={() => setVista("lista")} style={{
          background: "none", border: "none", color: C.text.b,
          fontSize: 13, cursor: "pointer", padding: "0 0 14px", fontWeight: 600,
        }}>← Volver</button>

        <div style={{ fontSize: 17, fontWeight: 800, color: C.text.h, marginBottom: 20 }}>
          {isEdit ? "Editar deuda" : "Nueva deuda"}
        </div>

        {/* Emoji picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Ícono</div>
          <button onClick={() => setShowEmojis(!showEmojis)} style={{
            fontSize: 28, background: `rgba(244,63,94,0.12)`, border: `1px solid rgba(244,63,94,0.25)`,
            borderRadius: 14, width: 52, height: 52, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{emoji}</button>
          {showEmojis && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10,
              padding: 12, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
            }}>
              {EMOJIS_DEUDA.map(e => (
                <button key={e} onClick={() => { setEmoji(e); setShowEmojis(false); }} style={{
                  fontSize: 24, background: emoji === e ? `rgba(244,63,94,0.2)` : "none",
                  border: `1px solid ${emoji === e ? "rgba(244,63,94,0.4)" : "transparent"}`,
                  borderRadius: 10, width: 44, height: 44, cursor: "pointer",
                }}>{e}</button>
              ))}
            </div>
          )}
        </div>

        {/* Nombre */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Nombre</div>
          <input
            value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="ej: iPhone 15, Crédito banco, Nevera..."
            style={{
              width: "100%", background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "13px 16px", color: C.text.h,
              fontSize: 15, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Monto total */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            {isEdit ? "Monto total original" : "¿Cuánto debes en total?"}
          </div>
          <div style={{
            display: "flex", alignItems: "center", background: C.surface,
            border: `1px solid ${rawTotal > 0 ? "rgba(244,63,94,0.4)" : C.border}`,
            borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
          }}>
            <span style={{ padding: "0 14px", color: C.text.s, fontSize: 18, lineHeight: "52px" }}>$</span>
            <input inputMode="numeric" value={montoTotal}
              onChange={e => hm(e.target.value, setMontoTotal)}
              placeholder="0"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 52 }}
            />
          </div>
        </div>

        {/* Ya abonado — solo al crear */}
        {!isEdit && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              ¿Ya has pagado algo? <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", background: C.surface,
              border: `1px solid ${rawAbonado > 0 ? "rgba(16,185,129,0.4)" : C.border}`,
              borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
            }}>
              <span style={{ padding: "0 14px", color: C.text.s, fontSize: 18, lineHeight: "52px" }}>$</span>
              <input inputMode="numeric" value={yaAbonado}
                onChange={e => hm(e.target.value, setYaAbonado)}
                placeholder="0"
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 52 }}
              />
            </div>
            {rawAbonado > 0 && rawTotal > 0 && (
              <div style={{
                marginTop: 8, padding: "10px 14px", borderRadius: 12,
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                fontSize: 12, color: C.text.b, lineHeight: 1.6,
              }}>
                ✅ Saldo restante: <b style={{ color: "#10b981" }}>{COP(saldoCalculado)}</b>
                {" · "}{Math.round((rawAbonado / rawTotal) * 100)}% ya pagado
              </div>
            )}
            {rawAbonado > rawTotal && rawTotal > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f43f5e", fontWeight: 600 }}>
                ⚠️ Lo abonado no puede superar el monto total
              </div>
            )}
          </div>
        )}

        {/* Saldo restante corregible — solo en edición */}
        {isEdit && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Saldo restante actual
            </div>
            <div style={{
              display: "flex", alignItems: "center", background: C.surface,
              border: `1px solid ${rawSaldoEdit > 0 ? "rgba(16,185,129,0.4)" : C.border}`,
              borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
            }}>
              <span style={{ padding: "0 14px", color: C.text.s, fontSize: 18, lineHeight: "52px" }}>$</span>
              <input inputMode="numeric" value={saldoRestanteEdit}
                onChange={e => hm(e.target.value, setSaldoRestanteEdit)}
                placeholder="0"
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 52 }}
              />
            </div>
            <div style={{ fontSize: 11, color: C.text.s, marginTop: 5, lineHeight: 1.5 }}>
              Corrige aquí si ya habías pagado antes de registrar la deuda
            </div>
          </div>
        )}

        {/* Cuota mínima */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Cuota mínima mensual</div>
          <div style={{
            display: "flex", alignItems: "center", background: C.surface,
            border: `1px solid ${rawCuota > 0 ? "rgba(244,63,94,0.4)" : C.border}`,
            borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
          }}>
            <span style={{ padding: "0 14px", color: C.text.s, fontSize: 18, lineHeight: "52px" }}>$</span>
            <input inputMode="numeric" value={cuota}
              onChange={e => hm(e.target.value, setCuota)}
              placeholder="0"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 52 }}
            />
          </div>
          {cuotasEst > 0 && (
            <div style={{ fontSize: 11, color: C.text.s, marginTop: 6 }}>
              ~{cuotasEst} {cuotasEst === 1 ? "mes" : "meses"} pagando la cuota mínima
              {!isEdit && rawAbonado > 0 && " (sobre el saldo restante)"}
            </div>
          )}
        </div>

        {/* Día de pago */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Día de pago mensual</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1,5,10,15,20,25,28,30].map(d => (
              <button key={d} onClick={() => setDia(d)} style={{
                width: 44, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13,
                background: dia === d ? "#f43f5e" : C.surface,
                color: dia === d ? "#fff" : C.text.b,
                border: `1px solid ${dia === d ? "#f43f5e" : C.border}`,
              }}>{d}</button>
            ))}
          </div>
        </div>

        {/* Delete si es edit */}
        {isEdit && (
          <div style={{ marginBottom: 14 }}>
            {!conf ? (
              <button onClick={() => setConf(true)} style={{
                width: "100%", padding: 12, borderRadius: 12,
                border: `1px solid rgba(244,63,94,0.3)`, background: "none",
                color: "#f43f5e", cursor: "pointer", fontSize: 13, fontWeight: 700,
              }}>🗑 Eliminar deuda</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConf(false)} style={{
                  flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
                  background: "none", color: C.text.b, cursor: "pointer", fontSize: 13, fontWeight: 700,
                }}>Cancelar</button>
                <button onClick={async () => { await onDelete(deudaSelec.id); setVista("lista"); }} style={{
                  flex: 1, padding: 12, borderRadius: 12, border: "none",
                  background: "#f43f5e", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 800,
                }}>Confirmar</button>
              </div>
            )}
          </div>
        )}

        {/* CTA guardar */}
        <button onClick={guardar} disabled={saving || !nombre.trim() || !rawTotal || !rawCuota} style={{
          width: "100%", padding: 14, borderRadius: 14, border: "none",
          cursor: (saving || !nombre.trim() || !rawTotal || !rawCuota) ? "not-allowed" : "pointer",
          background: nombre.trim() && rawTotal && rawCuota
            ? "linear-gradient(135deg,#f43f5e,#e11d48)" : C.surface,
          color: nombre.trim() && rawTotal && rawCuota ? "#fff" : C.text.s,
          fontSize: 14, fontWeight: 800, opacity: saving ? 0.6 : 1,
        }}>
          {saving ? "Guardando..." : isEdit ? "Guardar cambios" : `Crear deuda · ${COP(rawTotal)}`}
        </button>
      </div>
    );
  };

  // ── Vista: registrar pago ──────────────────────────────────────────────────
  const PagarView = () => {
    const d = deudaSelec;
    const [monto, setMonto] = useState(
      d ? Number(d.cuotaMensual).toLocaleString("es-CO") : ""
    );
    const [saving, setSaving] = useState(false);
    const raw = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;

    function hm(e) {
      const r = e.target.value.replace(/\D/g, "");
      setMonto(r ? Number(r).toLocaleString("es-CO") : "");
    }

    const saldoDespues = Math.max((d?.saldoRestante || 0) - raw, 0);
    const cuotasRestantes = raw > 0 && d?.cuotaMensual > 0
      ? Math.ceil(saldoDespues / d.cuotaMensual) : null;
    const adelanto = raw > (d?.cuotaMensual || 0)
      ? Math.floor((raw - d.cuotaMensual) / d.cuotaMensual)
      : 0;
    const sinDisponible = disponibleGastar != null && raw > disponibleGastar;

    async function confirmar() {
      if (!raw || !d || sinDisponible) return;
      setSaving(true);
      try {
        await onPagar(d.id, raw);
        setVista("lista");
      } finally { setSaving(false); }
    }

    if (!d) return null;

    return (
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
        <button onClick={() => setVista("lista")} style={{
          background: "none", border: "none", color: C.text.b,
          fontSize: 13, cursor: "pointer", padding: "0 0 14px", fontWeight: 600,
        }}>← Volver</button>

        {/* Header deuda */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>{d.emoji || "💳"}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text.h }}>{d.nombre}</div>
          <div style={{ fontSize: 13, color: C.text.s, marginTop: 4 }}>
            Saldo restante: <b style={{ color: "#f43f5e" }}>{COP(d.saldoRestante)}</b>
          </div>
        </div>

        {/* Input monto */}
        <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          ¿Cuánto vas a pagar hoy?
        </div>
        <div style={{
          display: "flex", alignItems: "center", background: C.surface,
          border: `2px solid ${raw > 0 ? "rgba(244,63,94,0.5)" : C.border}`,
          borderRadius: 14, overflow: "hidden", marginBottom: 12,
          transition: "border-color 0.2s",
        }}>
          <span style={{ padding: "0 14px", color: C.text.s, fontSize: 20, lineHeight: "60px" }}>$</span>
          <input inputMode="numeric" value={monto} onChange={hm}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 26, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 60,
            }}
          />
        </div>

        {/* Atajos de monto */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Cuota mín", val: d.cuotaMensual },
            { label: "El doble", val: d.cuotaMensual * 2 },
            { label: "Todo", val: d.saldoRestante },
          ].map(op => (
            <button key={op.label} onClick={() => setMonto(Number(op.val).toLocaleString("es-CO"))} style={{
              flex: 1, padding: "8px 4px", borderRadius: 10,
              border: `1px solid ${raw === op.val ? "rgba(244,63,94,0.5)" : C.border}`,
              background: raw === op.val ? "rgba(244,63,94,0.1)" : C.surface,
              color: raw === op.val ? "#f43f5e" : C.text.b,
              cursor: "pointer", fontSize: 10, fontWeight: 700, lineHeight: 1.4,
            }}>
              {op.label}<br />
              <span style={{ fontSize: 9 }}>{COP(op.val)}</span>
            </button>
          ))}
        </div>

        {/* Impacto del pago */}
        {raw > 0 && (
          <div style={{
            padding: "14px 16px", borderRadius: 14, marginBottom: 16,
            background: `rgba(244,63,94,0.06)`, border: `1px solid rgba(244,63,94,0.18)`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.text.s }}>Saldo después del pago</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: saldoDespues === 0 ? "#10b981" : "#f43f5e" }}>
                {saldoDespues === 0 ? "¡LIQUIDADA! 🎉" : COP(saldoDespues)}
              </span>
            </div>
            {saldoDespues > 0 && cuotasRestantes !== null && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.text.s }}>Cuotas restantes</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text.h }}>
                  ~{cuotasRestantes} {cuotasRestantes === 1 ? "mes" : "meses"}
                </span>
              </div>
            )}
            {adelanto > 0 && (
              <div style={{
                marginTop: 10, padding: "8px 10px", borderRadius: 10,
                background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
                fontSize: 11, color: "#10b981", fontWeight: 700,
              }}>
                🚀 ¡Adelantarías {adelanto} {adelanto === 1 ? "cuota" : "cuotas"}!
              </div>
            )}
          </div>
        )}

        <div style={{
          padding: "10px 14px", borderRadius: 12, marginBottom: 16,
          background: C.surface, border: `1px solid ${C.border}`,
          fontSize: 11, color: C.text.b, lineHeight: 1.6,
        }}>
          💡 Se registrará como gasto en categoría <b>Cuotas</b> y reducirá tu saldo de esta deuda.
        </div>

        {sinDisponible && raw > 0 && (
          <div style={{
            padding: "10px 14px", borderRadius: 12, marginBottom: 12,
            background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)",
            fontSize: 12, color: "#f43f5e", fontWeight: 600, lineHeight: 1.5,
          }}>
            🚫 No alcanza — tienes {COP(disponibleGastar)} disponibles y este pago es {COP(raw)}.
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setVista("lista")} style={{
            flex: 1, padding: 14, borderRadius: 12,
            border: `1px solid ${C.border}`, background: "none",
            color: C.text.b, cursor: "pointer", fontSize: 14, fontWeight: 700,
          }}>Cancelar</button>
          <button onClick={confirmar} disabled={!raw || saving || sinDisponible} style={{
            flex: 2, padding: 14, borderRadius: 12, border: "none",
            cursor: !raw || saving ? "not-allowed" : "pointer",
            background: raw ? "linear-gradient(135deg,#f43f5e,#e11d48)" : C.surface,
            color: raw ? "#fff" : C.text.s,
            fontSize: 14, fontWeight: 800, opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Registrando..." : raw ? `Pagar ${COP(raw)}` : "Ingresa el monto"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "flex-end", zIndex: 300,
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 430, margin: "0 auto",
          background: C.card, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.border}`,
          padding: "0 20px 36px",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          animation: dragY === 0 ? "slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          transform: `translateY(${dragY}px)`,
          transition: dragStartY === null ? "transform 0.2s ease" : "none",
          position: "relative",
        }}>
        {/* × */}
        <button onClick={onClose} aria-label="Cerrar" style={{
          position: "absolute", top: 14, right: 14,
          background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`,
          borderRadius: 10, width: 32, height: 32, cursor: "pointer",
          color: C.text.b, fontSize: 18, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
        }}>×</button>

        {/* Handle zone — área de swipe dedicada, captura touch antes que los hijos */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position:"absolute", top:0, left:0, right:0, height:60,
            zIndex:10, touchAction:"none", cursor:"grab",
            display:"flex", alignItems:"flex-start", justifyContent:"center",
            paddingTop:12,
          }}>
          <div style={{width:40,height:4,borderRadius:99,background:C.border}}/>
        </div>
        {/* Espaciador para el handle */}
        <div style={{height:28}}/>


        {/* Título */}
        <div style={{ paddingRight: 36, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>💳</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text.h }}>Mis deudas</div>
          </div>
        </div>

        {/* Contenido dinámico */}
        {vista === "lista" && <ListaView />}
        {vista === "nueva" && <FormDeuda />}
        {vista === "pagar" && <PagarView />}
      </div>
    </div>
  );
}