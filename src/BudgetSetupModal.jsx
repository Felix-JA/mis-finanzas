// ─── BUDGET SETUP MODAL ───────────────────────────────────────────────────────
// Modal de activación del presupuesto inteligente.
// Muestra las sugerencias por categoría con campos editables, total del plan
// y monto libre. Solo al confirmar se escribe en Firestore.
//
// Props:
//   open                → bool
//   onClose             → () => void
//   onSave              → (presupuestos: {catId: monto}) => Promise<void>
//   salario             → number
//   mode                → 'template' | 'historical'
//   mesesDatos          → number
//   suggestions         → {catId: monto} inicial
//   MAIN_CATS, C, COP   → utilidades

import { useState, useMemo } from 'react';

export function BudgetSetupModal({
  open, onClose, onSave,
  salario, mode, mesesDatos, suggestions,
  MAIN_CATS, C, COP,
}) {
  // Estado local editable — inicia con las sugerencias, el usuario ajusta
  const [draft, setDraft] = useState(() => ({ ...suggestions }));
  const [saving, setSaving] = useState(false);
  // Swipe down to dismiss
  const [dragY, setDragY] = useState(0);
  const [dragStartY, setDragStartY] = useState(null);

  const totalPresup = useMemo(
    () => Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0),
    [draft]
  );
  const libre = Math.max(salario - totalPresup, 0);
  const pctUsado = salario > 0 ? totalPresup / salario : 0;
  const overSalario = totalPresup > salario;

  if (!open) return null;

  function onTouchStart(e) { setDragStartY(e.touches[0].clientY); }
  function onTouchMove(e) {
    if (dragStartY === null) return;
    const delta = e.touches[0].clientY - dragStartY;
    if (delta > 0) setDragY(delta);
  }
  function onTouchEnd() {
    if (dragY > 80) onClose();
    setDragY(0);
    setDragStartY(null);
  }

  const handleChange = (catId, value) => {
    const raw = String(value).replace(/\D/g, '');
    setDraft(d => ({ ...d, [catId]: raw ? Number(raw) : 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filtrar solo los que tienen valor > 0
      const toSave = {};
      Object.entries(draft).forEach(([k, v]) => {
        if (v > 0) toSave[k] = v;
      });
      await onSave(toSave);
      onClose();
    } catch (e) {
      console.error('Error guardando presupuesto:', e);
    } finally {
      setSaving(false);
    }
  };

  // Solo renderizar las categorías que tienen sugerencia (o que el usuario ya tocó)
  const visibleCats = MAIN_CATS.filter(c => draft[c.id] !== undefined || suggestions[c.id] > 0);

  const colTot = overSalario ? C.red : pctUsado > 0.9 ? C.amber : C.emerald;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'flex-end', zIndex: 400,
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 430, margin: '0 auto', background: C.card,
        borderRadius: '22px 22px 0 0', border: `1px solid ${C.border}`,
        padding: '20px 20px 28px', maxHeight: '90vh', display: 'flex',
        flexDirection: 'column',
        animation: dragY === 0 ? 'slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
        transform: `translateY(${dragY}px)`,
        transition: dragStartY === null ? 'transform 0.2s ease' : 'none',
        position: 'relative',
      }}>
        {/* Botón × esquina superior derecha */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute', top: 14, right: 14,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, width: 32, height: 32, cursor: 'pointer',
            color: C.text.b, fontSize: 18, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2, transition: 'all 0.15s',
          }}
        >×</button>
        {/* Handle con swipe down */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, padding: '4px 0 8px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }}/>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 16, paddingRight: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>✨</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text.h }}>
              Tu plan del mes
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.text.b, lineHeight: 1.5 }}>
            {mode === 'historical'
              ? `Basado en tu gasto real de los últimos ${mesesDatos} meses. Ajusta lo que quieras.`
              : `Sugerencias iniciales basadas en un perfil LATAM. La app las ajustará a tu patrón real con el tiempo.`
            }
          </div>
        </div>

        {/* Resumen pegajoso */}
        <div style={{
          padding: '14px 16px', borderRadius: 14, marginBottom: 16,
          background: `${colTot}10`, border: `1px solid ${colTot}30`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.text.b, fontWeight: 600 }}>
              Presupuesto total
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: colTot }}>
              {COP(totalPresup)}
            </span>
          </div>
          <div style={{ background: `${colTot}18`, borderRadius: 99, height: 6, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: 6, borderRadius: 99, background: colTot,
              width: `${Math.min(pctUsado * 100, 100)}%`,
              transition: 'width 0.4s ease',
            }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: C.text.s }}>
              {Math.round(pctUsado * 100)}% de tu sueldo ({COP(salario)})
            </span>
            <span style={{ color: libre > 0 ? C.emerald : C.red, fontWeight: 700 }}>
              {overSalario
                ? `⚠ Excedes en ${COP(totalPresup - salario)}`
                : `Libre: ${COP(libre)}`}
            </span>
          </div>
          {!overSalario && libre > 0 && (
            <div style={{ fontSize: 10, color: C.text.s, marginTop: 6, lineHeight: 1.4 }}>
              💡 Este margen queda disponible para metas, ahorro o imprevistos
            </div>
          )}
        </div>

        {/* Lista categorías scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 14, marginLeft: -4, paddingLeft: 4, paddingRight: 4 }}>
          {visibleCats.map(cat => {
            const monto = draft[cat.id] || 0;
            const pctCat = salario > 0 ? monto / salario : 0;
            const display = monto > 0 ? Number(monto).toLocaleString('es-CO') : '';

            return (
              <div key={cat.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: `${cat.color}22`, border: `1px solid ${cat.color}38`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>{cat.icon}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text.h }}>
                    {cat.label}
                  </div>
                  <div style={{ fontSize: 10, color: C.text.s, marginTop: 1 }}>
                    {monto > 0 ? `${Math.round(pctCat * 100)}% del sueldo` : 'Sin presupuesto'}
                  </div>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: C.surface, borderRadius: 10,
                  border: `1px solid ${monto > 0 ? cat.color + '40' : C.border}`,
                  padding: '0 8px', width: 120, flexShrink: 0,
                }}>
                  <span style={{ fontSize: 12, color: C.text.s }}>$</span>
                  <input
                    inputMode="numeric"
                    value={display}
                    onChange={e => handleChange(cat.id, e.target.value)}
                    placeholder="0"
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontSize: 13, fontWeight: 700, color: C.text.h,
                      padding: '10px 4px', textAlign: 'right', minWidth: 0,
                      width: '100%',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '14px 18px', borderRadius: 12,
              border: `1px solid ${C.border}`, background: 'transparent',
              color: C.text.b, cursor: saving ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
              opacity: saving ? 0.5 : 1,
            }}
          >
            Ahora no
          </button>
          <button
            onClick={handleSave}
            disabled={saving || totalPresup === 0}
            style={{
              flex: 1, padding: 14, borderRadius: 12, border: 'none',
              cursor: (saving || totalPresup === 0) ? 'default' : 'pointer',
              fontSize: 14, fontWeight: 800,
              background: totalPresup > 0
                ? `linear-gradient(135deg, ${C.indigo}, ${C.violet})`
                : C.surface,
              color: totalPresup > 0 ? '#fff' : C.text.s,
              opacity: saving ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {saving
              ? 'Guardando...'
              : totalPresup > 0
                ? `Activar plan · ${COP(totalPresup)}`
                : 'Define al menos uno'}
          </button>
        </div>
      </div>
    </div>
  );
}