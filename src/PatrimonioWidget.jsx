// ─── PATRIMONIO NETO ──────────────────────────────────────────────────────────
// Widget colapsable que muestra: Activos - Pasivos = Patrimonio Neto
// Los activos y pasivos externos son manuales (ingresados por el usuario).
// Las deudas de la app se suman automáticamente a los pasivos.
//
// Datos en Firestore: usuarios/{uid}.patrimonio
//   { activos: [{id, nombre, categoria, valor}],
//     pasivosExternos: [{id, nombre, valor}] }
//
// Props:
//   patrimonio       → { activos:[], pasivosExternos:[] }
//   deudasApp        → number (saldo total de deudas activas en la app)
//   onSave           → (patrimonio) => Promise<void>
//   C, COP

import { useSwipeDismiss } from "./useSwipeDismiss";
import { useState, useMemo } from "react";

const CATEGORIAS_ACTIVO = [
  { id: "vivienda",   label: "Vivienda / Propiedad", icon: "🏠" },
  { id: "vehiculo",   label: "Vehículo",              icon: "🏍" },
  { id: "ahorro",     label: "Ahorros / Inversiones", icon: "💰" },
  { id: "electronico",label: "Electrónicos",          icon: "💻" },
  { id: "otro",       label: "Otro",                  icon: "📦" },
];

function uid6() {
  return Math.random().toString(36).slice(2, 8);
}

export function PatrimonioWidget({ patrimonio = {}, deudasApp = 0, onSave, C, COP }) {
  const activos        = patrimonio.activos        || [];
  const pasivosExt     = patrimonio.pasivosExternos || [];

  const [expanded, setExpanded]   = useState(false);
  const [modal, setModal]         = useState(null); // null | "activo" | "pasivo"
  const [editItem, setEditItem]   = useState(null); // item a editar
  const [saving, setSaving]       = useState(false);

  const totalActivos  = useMemo(() => activos.reduce((s, a) => s + (a.valor || 0), 0), [activos]);
  const totalPasivos  = useMemo(() => pasivosExt.reduce((s, p) => s + (p.valor || 0), 0) + deudasApp, [pasivosExt, deudasApp]);
  const neto          = totalActivos - totalPasivos;
  const enPositivo    = neto >= 0;

  async function guardar(nuevoPatrimonio) {
    setSaving(true);
    try { await onSave(nuevoPatrimonio); } finally { setSaving(false); }
  }

  async function agregarActivo(item) {
    const nuevos = editItem
      ? activos.map(a => a.id === editItem.id ? { ...a, ...item } : a)
      : [...activos, { id: uid6(), ...item }];
    await guardar({ activos: nuevos, pasivosExternos: pasivosExt });
    setModal(null); setEditItem(null);
  }

  async function agregarPasivo(item) {
    const nuevos = editItem
      ? pasivosExt.map(p => p.id === editItem.id ? { ...p, ...item } : p)
      : [...pasivosExt, { id: uid6(), ...item }];
    await guardar({ activos, pasivosExternos: nuevos });
    setModal(null); setEditItem(null);
  }

  async function eliminarActivo(id) {
    await guardar({ activos: activos.filter(a => a.id !== id), pasivosExternos: pasivosExt });
  }

  async function eliminarPasivo(id) {
    await guardar({ activos, pasivosExternos: pasivosExt.filter(p => p.id !== id) });
  }

  const colNeto = enPositivo ? "#10b981" : "#f43f5e";

  return (
    <>
      {/* ── Widget principal ── */}
      <div style={{
        borderRadius: 20, overflow: "hidden", marginBottom: 16,
        background: `linear-gradient(135deg, ${enPositivo ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)"}, rgba(99,102,241,0.06))`,
        border: `1px solid ${enPositivo ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
      }}>
        {/* Header — siempre visible */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: `${colNeto}18`, border: `1px solid ${colNeto}30`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>💼</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 }}>
              Patrimonio neto
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: colNeto, letterSpacing: -0.5 }}>
              {enPositivo ? "" : "-"}{COP(Math.abs(neto))}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: C.text.s }}>
            <div>Activos: <b style={{ color: "#10b981" }}>{COP(totalActivos)}</b></div>
            <div>Pasivos: <b style={{ color: "#f43f5e" }}>{COP(totalPasivos)}</b></div>
            <div style={{ marginTop: 6, color: C.text.s, fontSize: 14 }}>{expanded ? "▲" : "▼"}</div>
          </div>
        </div>

        {/* Detalle expandible */}
        {expanded && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 18px 18px" }}>

            {/* Activos */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", letterSpacing: 1, textTransform: "uppercase" }}>
                  ↑ Activos
                </div>
                <button onClick={() => { setEditItem(null); setModal("activo"); }} style={{
                  background: "rgba(16,185,129,0.12)", border: "none", borderRadius: 8,
                  padding: "4px 10px", color: "#10b981", cursor: "pointer", fontSize: 11, fontWeight: 700,
                }}>+ Agregar</button>
              </div>
              {activos.length === 0
                ? <div style={{ fontSize: 12, color: C.text.s, opacity: 0.6 }}>Sin activos registrados</div>
                : activos.map(a => {
                  const cat = CATEGORIAS_ACTIVO.find(c => c.id === a.categoria) || CATEGORIAS_ACTIVO[4];
                  return (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 18 }}>{cat.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h }}>{a.nombre}</div>
                        <div style={{ fontSize: 10, color: C.text.s }}>{cat.label}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>{COP(a.valor)}</div>
                      <button onClick={() => { setEditItem(a); setModal("activo"); }}
                        style={{ background: "none", border: "none", color: C.text.s, cursor: "pointer", fontSize: 14, padding: 4 }}>✏️</button>
                      <button onClick={() => eliminarActivo(a.id)}
                        style={{ background: "none", border: "none", color: C.text.s, cursor: "pointer", fontSize: 14, padding: 4 }}>🗑</button>
                    </div>
                  );
                })
              }
              {activos.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, fontWeight: 700, color: "#10b981", marginTop: 6 }}>
                  Total: {COP(totalActivos)}
                </div>
              )}
            </div>

            {/* Pasivos */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f43f5e", letterSpacing: 1, textTransform: "uppercase" }}>
                  ↓ Pasivos
                </div>
                <button onClick={() => { setEditItem(null); setModal("pasivo"); }} style={{
                  background: "rgba(244,63,94,0.1)", border: "none", borderRadius: 8,
                  padding: "4px 10px", color: "#f43f5e", cursor: "pointer", fontSize: 11, fontWeight: 700,
                }}>+ Agregar</button>
              </div>

              {/* Deudas de la app — automáticas */}
              {deudasApp > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 18 }}>💳</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h }}>Deudas en la app</div>
                    <div style={{ fontSize: 10, color: C.text.s }}>Calculado automáticamente</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f43f5e" }}>{COP(deudasApp)}</div>
                </div>
              )}

              {pasivosExt.length === 0 && deudasApp === 0
                ? <div style={{ fontSize: 12, color: C.text.s, opacity: 0.6 }}>Sin pasivos registrados</div>
                : pasivosExt.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 18 }}>🏦</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text.h }}>{p.nombre}</div>
                      <div style={{ fontSize: 10, color: C.text.s }}>Deuda externa</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f43f5e" }}>{COP(p.valor)}</div>
                    <button onClick={() => { setEditItem(p); setModal("pasivo"); }}
                      style={{ background: "none", border: "none", color: C.text.s, cursor: "pointer", fontSize: 14, padding: 4 }}>✏️</button>
                    <button onClick={() => eliminarPasivo(p.id)}
                      style={{ background: "none", border: "none", color: C.text.s, cursor: "pointer", fontSize: 14, padding: 4 }}>🗑</button>
                  </div>
                ))
              }
              {(pasivosExt.length > 0 || deudasApp > 0) && (
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, fontWeight: 700, color: "#f43f5e", marginTop: 6 }}>
                  Total: {COP(totalPasivos)}
                </div>
              )}
            </div>

            {/* Barra visual */}
            {(totalActivos > 0 || totalPasivos > 0) && (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{
                    width: `${totalActivos > 0 ? Math.min(totalActivos / (totalActivos + totalPasivos) * 100, 100) : 0}%`,
                    background: "linear-gradient(90deg,#10b981,#34d399)", transition: "width 0.5s ease",
                  }} />
                  <div style={{ flex: 1, background: "rgba(244,63,94,0.4)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.text.s }}>
                  <span style={{ color: "#10b981", fontWeight: 600 }}>
                    {totalActivos > 0 ? Math.round(totalActivos / (totalActivos + totalPasivos) * 100) : 0}% activos
                  </span>
                  <span style={{ color: "#f43f5e", fontWeight: 600 }}>
                    {totalPasivos > 0 ? Math.round(totalPasivos / (totalActivos + totalPasivos) * 100) : 0}% pasivos
                  </span>
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: C.text.s, marginTop: 10, opacity: 0.6, lineHeight: 1.5, textAlign: "center" }}>
              Los valores son estimados manuales. Actualízalos cuando cambien.
            </div>
          </div>
        )}
      </div>

      {/* ── Modal agregar/editar activo ── */}
      {modal === "activo" && (
        <ItemModal
          title={editItem ? "Editar activo" : "Nuevo activo"}
          tipo="activo"
          initial={editItem}
          onClose={() => { setModal(null); setEditItem(null); }}
          onSave={agregarActivo}
          saving={saving}
          C={C} COP={COP}
        />
      )}

      {/* ── Modal agregar/editar pasivo externo ── */}
      {modal === "pasivo" && (
        <ItemModal
          title={editItem ? "Editar pasivo" : "Nueva deuda externa"}
          tipo="pasivo"
          initial={editItem}
          onClose={() => { setModal(null); setEditItem(null); }}
          onSave={agregarPasivo}
          saving={saving}
          C={C} COP={COP}
        />
      )}
    </>
  );
}

// ─── Modal reutilizable para activo y pasivo ───────────────────────────────────
function ItemModal({ title, tipo, initial, onClose, onSave, saving, C, COP }) {
  const [nombre,    setNombre]    = useState(initial?.nombre    || "");
  const [valor,     setValor]     = useState(initial ? Number(initial.valor).toLocaleString("es-CO") : "");
  const [categoria, setCategoria] = useState(initial?.categoria || "otro");
  const [dragY,     setDragY]     = useState(0);
  const [dragStart, setDragStart] = useState(null);

  const raw = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const puedeGuardar = nombre.trim() && raw > 0;

  function hm(e) {
    const r = e.target.value.replace(/\D/g, "");
    setValor(r ? Number(r).toLocaleString("es-CO") : "");
  }


  const accentColor = tipo === "activo" ? "#10b981" : "#f43f5e";

  return (
    <div ref={sw.overlayRef} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "flex-end", zIndex: 500, ...sw.overlayStyle }}>
      <div ref={sw.cardRef} style={{
        width: "100%", maxWidth: 430, margin: "0 auto", background: C.card,
        borderRadius: "22px 22px 0 0", border: `1px solid ${C.border}`,
        padding: "0 20px 36px", maxHeight: "90vh", overflowY: "auto",
        ...sw.cardStyle,
        position: "relative",
      }}>
        {/* × */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.08)",
          border: `1px solid ${C.border}`, borderRadius: 10, width: 32, height: 32,
          cursor: "pointer", color: C.text.b, fontSize: 18, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
        }}>×</button>

        {/* Handle */}
        <div {...sw.handleProps} style={{ ...sw.handleProps.style, justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        <div style={{ fontSize: 18, fontWeight: 800, color: C.text.h, marginBottom: 20, paddingRight: 40 }}>
          {title}
        </div>

        {/* Nombre */}
        <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Nombre</div>
        <input
          value={nombre} onChange={e => setNombre(e.target.value)}
          autoFocus
          placeholder={tipo === "activo" ? "ej: Moto, Casa, Cuenta bancaria..." : "ej: Crédito banco, Hipoteca..."}
          style={{
            width: "100%", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "13px 16px", color: C.text.h, fontSize: 15,
            outline: "none", boxSizing: "border-box", marginBottom: 14,
          }}
        />

        {/* Categoría — solo para activos */}
        {tipo === "activo" && (
          <>
            <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Categoría</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {CATEGORIAS_ACTIVO.map(cat => (
                <button key={cat.id} onClick={() => setCategoria(cat.id)} style={{
                  padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700,
                  background: categoria === cat.id ? `${accentColor}20` : C.surface,
                  color: categoria === cat.id ? accentColor : C.text.s,
                  outline: `2px solid ${categoria === cat.id ? accentColor : "transparent"}`,
                  transition: "all 0.15s",
                }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Valor */}
        <div style={{ fontSize: 11, color: C.text.s, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          Valor estimado
        </div>
        <div style={{
          display: "flex", alignItems: "center", background: C.surface,
          border: `2px solid ${raw > 0 ? accentColor : C.border}`,
          borderRadius: 14, overflow: "hidden", marginBottom: 20, transition: "border-color 0.2s",
        }}>
          <span style={{ padding: "0 14px", color: C.text.s, fontSize: 18, lineHeight: "56px" }}>$</span>
          <input inputMode="numeric" value={valor} onChange={hm}
            placeholder="0"
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 22, fontWeight: 800, color: C.text.h, padding: "0 8px", height: 56 }}
          />
        </div>

        <button onClick={() => puedeGuardar && !saving && onSave({ nombre: nombre.trim(), valor: raw, categoria })}
          disabled={!puedeGuardar || saving}
          style={{
            width: "100%", padding: 14, borderRadius: 14, border: "none",
            cursor: puedeGuardar && !saving ? "pointer" : "not-allowed",
            background: puedeGuardar ? `linear-gradient(135deg, ${accentColor}, ${tipo === "activo" ? "#059669" : "#e11d48"})` : C.surface,
            color: puedeGuardar ? "#fff" : C.text.s,
            fontSize: 14, fontWeight: 800, opacity: saving ? 0.6 : 1, transition: "all 0.2s",
          }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : tipo === "activo" ? `+ Agregar activo${raw > 0 ? " · " + COP(raw) : ""}` : `+ Agregar pasivo${raw > 0 ? " · " + COP(raw) : ""}`}
        </button>
      </div>
    </div>
  );
}