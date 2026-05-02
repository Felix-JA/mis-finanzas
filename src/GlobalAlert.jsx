// ─── GLOBAL ALERT SYSTEM ──────────────────────────────────────────────────────
// Sistema de alertas modales globales con overlay.
// No se renderiza dentro de otros componentes — usa un div raíz propio (#alert-root).
//
// Uso desde cualquier parte del código:
//   showAlert({ type, title, body, actions })
//
// Tipos:
//   "info"    → azul/indigo  — información neutral
//   "success" → verde        — acción completada
//   "warning" → amarillo     — atención requerida
//   "error"   → rojo         — error o límite alcanzado
//   "limit"   → violeta      — límite de mensajes IA (caso especial)
//
// actions: array de { label, onClick, primary?, danger? }
// Si no se pasan actions, aparece solo un botón "Entendido"
//
// API imperativa (no necesita props ni contexto):
//   import { showAlert } from "./GlobalAlert";
//   showAlert({ type: "warning", title: "¡Atención!", body: "Texto aquí" });

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";

// ─── Colores por tipo (independientes del tema C para que funcionen siempre) ──
const TYPE_CONFIG = {
  info:    { color: "#6366f1", bg: "#6366f122", icon: "💡", label: "Info"     },
  success: { color: "#10b981", bg: "#10b98122", icon: "✅", label: "Listo"    },
  warning: { color: "#f59e0b", bg: "#f59e0b22", icon: "⚠️", label: "Atención" },
  error:   { color: "#ef4444", bg: "#ef444422", icon: "🚫", label: "Error"    },
  limit:   { color: "#8b5cf6", bg: "#8b5cf622", icon: "⚡", label: "Límite"   },
};

// ─── Componente interno ───────────────────────────────────────────────────────
function AlertModal({ type = "info", title, body, actions, onDone, isPro }) {
  const [visible, setVisible] = useState(false);
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  // Entrada con spring — pequeño delay para que el DOM esté listo
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Cerrar con animación de salida
  const close = useCallback((fn) => {
    setVisible(false);
    setTimeout(() => { fn?.(); onDone(); }, 220);
  }, [onDone]);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  const defaultActions = [{ label: "Entendido", primary: true, onClick: () => {} }];
  const btns = actions?.length ? actions : defaultActions;

  return (
    <>
      {/* Estilos de animación — inyectados inline para no depender de CSS externo */}
      <style>{`
        @keyframes ga-fade-in  { from { opacity:0 } to { opacity:1 } }
        @keyframes ga-fade-out { from { opacity:1 } to { opacity:0 } }
        @keyframes ga-scale-in  { from { transform:scale(0.88) translateY(12px); opacity:0 } to { transform:scale(1) translateY(0); opacity:1 } }
        @keyframes ga-scale-out { from { transform:scale(1) translateY(0); opacity:1 } to { transform:scale(0.92) translateY(8px); opacity:0 } }
        .ga-overlay { animation: ga-fade-in 0.18s ease forwards; }
        .ga-overlay.out { animation: ga-fade-out 0.2s ease forwards; }
        .ga-card { animation: ga-scale-in 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .ga-card.out { animation: ga-scale-out 0.18s ease forwards; }
        .ga-btn { transition: opacity 0.15s, transform 0.12s; }
        .ga-btn:active { transform: scale(0.96); opacity: 0.8; }
      `}</style>

      {/* Overlay backdrop */}
      <div
        className={`ga-overlay${!visible ? " out" : ""}`}
        onClick={() => close()}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 20px",
        }}
      >
        {/* Card */}
        <div
          className={`ga-card${!visible ? " out" : ""}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 360,
            background: "#1e1e2e",  // neutral oscuro — funciona en todos los temas
            borderRadius: 24,
            border: `1px solid ${cfg.color}40`,
            boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${cfg.color}20, inset 0 1px 0 rgba(255,255,255,0.06)`,
            overflow: "hidden",
            fontFamily: "'DM Sans','Segoe UI',sans-serif",
          }}
        >
          {/* Barra de color superior */}
          <div style={{
            height: 4, background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}88)`,
          }} />

          {/* Cuerpo */}
          <div style={{ padding: "24px 24px 20px" }}>
            {/* Icono + tipo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                background: cfg.bg,
                border: `1px solid ${cfg.color}35`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
              }}>{cfg.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>
                  {cfg.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
                  {title}
                </div>
              </div>
            </div>

            {/* Body */}
            {body && (
              <div style={{
                fontSize: 14, color: "#94a3b8", lineHeight: 1.6,
                marginBottom: 20, paddingLeft: 2,
              }}>
                {body}
              </div>
            )}

            {/* Acciones */}
            <div style={{ display: "flex", gap: 8, flexDirection: btns.length > 2 ? "column" : "row" }}>
              {btns.map((btn, i) => (
                <button
                  key={i}
                  className="ga-btn"
                  onClick={() => close(btn.onClick)}
                  style={{
                    flex: 1, padding: "13px 16px", borderRadius: 14,
                    border: btn.primary ? "none" : `1px solid #334155`,
                    cursor: "pointer", fontSize: 14, fontWeight: 700,
                    background: btn.primary
                      ? `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`
                      : "transparent",
                    color: btn.primary ? "#fff" : "#94a3b8",
                    letterSpacing: btn.primary ? 0.2 : 0,
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Raíz del portal — se crea una sola vez ───────────────────────────────────
let _alertRoot = null;
let _alertContainer = null;

function getRoot() {
  if (!_alertContainer) {
    _alertContainer = document.createElement("div");
    _alertContainer.id = "ga-root";
    document.body.appendChild(_alertContainer);
    _alertRoot = createRoot(_alertContainer);
  }
  return _alertRoot;
}

// ─── API pública ──────────────────────────────────────────────────────────────
// showAlert({ type, title, body, actions })
export function showAlert({ type = "info", title, body, actions } = {}) {
  const root = getRoot();
  const unmount = () => root.render(null);
  root.render(
    <AlertModal
      type={type}
      title={title}
      body={body}
      actions={actions}
      onDone={unmount}
    />
  );
}

// ─── Helpers de conveniencia ──────────────────────────────────────────────────
export const alertInfo    = (title, body, actions) => showAlert({ type: "info",    title, body, actions });
export const alertSuccess = (title, body, actions) => showAlert({ type: "success", title, body, actions });
export const alertWarning = (title, body, actions) => showAlert({ type: "warning", title, body, actions });
export const alertError   = (title, body, actions) => showAlert({ type: "error",   title, body, actions });
export const alertLimit   = (title, body, actions) => showAlert({ type: "limit",   title, body, actions });