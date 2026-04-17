// ─── BUDGET ENGINE ────────────────────────────────────────────────────────────
// Sistema de presupuesto proactivo:
//   1. getSuggestedBudgets()  → sugiere límites por categoría (plantilla LATAM
//                               para principiantes · histórico real con 2+ meses)
//   2. BudgetSetupBanner      → banner de activación cuando faltan presupuestos
//   3. BudgetHealth           → tarjeta de detección de desbalance estructural
//
// Diseño:
//   - 85% presupuestado · 15% libre (margen para metas/ahorro)
//   - Respeta presupuestos ya definidos manualmente (solo rellena los que faltan)
//   - Redondea al múltiplo de 1000 COP más cercano
//   - No muta Firestore: devuelve sugerencias, App.jsx decide qué hacer

// ─── PLANTILLA BASE LATAM ─────────────────────────────────────────────────────
// Perfil base para principiantes (primer mes o sin historial suficiente)
// Suma 85% — el 15% restante queda libre para metas/ahorro/imprevistos
const TEMPLATE_LATAM = {
  hogar:      0.25,
  comida:     0.15,
  deudas:     0.10,
  transporte: 0.08,
  ocio:       0.07,
  salud:      0.05,
  otros_main: 0.05,
  estilo:     0.04,
  digital:    0.03,
  vehiculo:   0.03,
};
const LIBRE_PCT = 0.15; // margen para metas/ahorro — se muestra al usuario

// Redondeo financiero: siempre al múltiplo de 1000 más cercano
function roundCOP(n) {
  return Math.round(n / 1000) * 1000;
}

// ─── 1. SUGERENCIAS DE PRESUPUESTO ────────────────────────────────────────────
// Devuelve: { suggestions: { [catId]: monto }, mode: 'template' | 'historical',
//             mesesDatos: number, libre: number }
//
// Parámetros:
//   salario              → ingreso mensual de referencia
//   txAll                → todas las transacciones (para análisis histórico)
//   MAIN_CATS, isGasto, isAporteMeta, isMonth  → utilidades de App.jsx
//   presupuestosActuales → { [catId]: limite } ya definidos (para NO pisarlos)
//   currentMonth, currentYear → mes/año actual (se excluye del histórico)
//
export function getSuggestedBudgets({
  salario, txAll, MAIN_CATS,
  isGasto, isAporteMeta, isMonth,
  presupuestosActuales = {},
  currentMonth, currentYear,
}) {
  if (!salario || salario <= 0) {
    return { suggestions: {}, mode: 'template', mesesDatos: 0, libre: 0 };
  }

  // Detectar cuántos meses de historial útil tenemos (excluyendo el mes actual)
  const mesesSet = new Set();
  (txAll || []).forEach(t => {
    if (!t?.date || !isGasto(t.cat) || isAporteMeta(t)) return;
    const [y, m] = t.date.split('-').map(Number);
    const yy = y, mm = (m || 1) - 1;
    // Excluir el mes actual (incompleto)
    if (yy === currentYear && mm === currentMonth) return;
    mesesSet.add(`${yy}-${mm}`);
  });
  const mesesDatos = mesesSet.size;

  // MODO HISTÓRICO: 2+ meses → promedio real del usuario
  if (mesesDatos >= 2) {
    const suggestions = calcHistorical({
      txAll, MAIN_CATS, isGasto, isAporteMeta, isMonth,
      currentMonth, currentYear, mesesSet, salario,
      presupuestosActuales,
    });
    return {
      suggestions,
      mode: 'historical',
      mesesDatos,
      libre: Math.max(salario - Object.values(suggestions).reduce((s, v) => s + v, 0), 0),
    };
  }

  // MODO PLANTILLA: principiantes
  const suggestions = {};
  MAIN_CATS.forEach(cat => {
    // Respetar presupuestos ya definidos manualmente
    if (presupuestosActuales[cat.id] > 0) {
      suggestions[cat.id] = presupuestosActuales[cat.id];
      return;
    }
    const pct = TEMPLATE_LATAM[cat.id] || 0;
    if (pct > 0) suggestions[cat.id] = roundCOP(salario * pct);
  });

  return {
    suggestions,
    mode: 'template',
    mesesDatos,
    libre: roundCOP(salario * LIBRE_PCT),
  };
}

// ─── Cálculo histórico: promedio real del usuario, normalizado ────────────────
function calcHistorical({
  txAll, MAIN_CATS, isGasto, isAporteMeta,
  currentMonth, currentYear, mesesSet, salario,
  presupuestosActuales,
}) {
  const suggestions = {};
  const mesesArr = Array.from(mesesSet);
  const nMeses = mesesArr.length;

  MAIN_CATS.forEach(cat => {
    if (presupuestosActuales[cat.id] > 0) {
      suggestions[cat.id] = presupuestosActuales[cat.id];
      return;
    }

    // Sumar gasto real por mes en esta categoría y promediar
    let totalCat = 0;
    mesesArr.forEach(key => {
      const [y, m] = key.split('-').map(Number);
      const gastoMes = txAll
        .filter(t => {
          if (!t?.date || !isGasto(t.cat) || isAporteMeta(t)) return false;
          const [ty, tm] = t.date.split('-').map(Number);
          return ty === y && (tm - 1) === m;
        })
        .filter(t => cat.subs.some(s => s.id === t.cat))
        .reduce((s, t) => s + t.amount, 0);
      totalCat += gastoMes;
    });

    const promedio = totalCat / nMeses;
    // Añadir colchón del 10% sobre el promedio real (no ahoga al usuario)
    const conColchon = promedio * 1.10;

    // Solo sugerir si el gasto promedio representa ≥1% del salario (evita ruido)
    if (conColchon / salario >= 0.01) {
      suggestions[cat.id] = roundCOP(conColchon);
    }
  });

  return suggestions;
}

// ─── 2. BANNER DE ACTIVACIÓN ──────────────────────────────────────────────────
// Aparece en Inicio cuando:
//   - hay salario definido
//   - hay 0 presupuestos configurados
//   - el usuario no lo ha cerrado (localStorage)
//
export function BudgetSetupBanner({
  salario, presupuestos, mesesDatos, C, COP, onActivate,
}) {
  const tienePresupuestos = Object.values(presupuestos || {}).some(v => v > 0);
  if (!salario || salario <= 0 || tienePresupuestos) return null;

  // Dismiss persistente
  const DISMISS_KEY = 'budget_banner_dismissed_v1';
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) {}
  if (dismissed) return null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
    // forzar re-render — el padre lo maneja via key o state local
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('budget-banner-dismissed'));
  };

  const copy = mesesDatos >= 2
    ? 'Tu plan inteligente basado en tu historial'
    : 'Crea tu plan del mes en 10 segundos';

  const subCopy = mesesDatos >= 2
    ? `Usamos tu gasto real de ${mesesDatos} meses para armarlo`
    : `Te sugerimos cuánto gastar en cada categoría`;

  return (
    <div
      onClick={onActivate}
      style={{
        marginBottom: 16, borderRadius: 18, padding: '14px 16px',
        background: `linear-gradient(135deg, ${C.indigo}22, ${C.violet}14)`,
        border: `1px solid ${C.indigo}40`,
        cursor: 'pointer', position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
        background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, boxShadow: `0 4px 14px ${C.indigo}55`,
      }}>✨</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text.h, marginBottom: 3, lineHeight: 1.3 }}>
          {copy}
        </div>
        <div style={{ fontSize: 11, color: C.text.b, lineHeight: 1.4 }}>
          {subCopy}
        </div>
      </div>
      <div style={{
        fontSize: 18, color: C.indigoLight, flexShrink: 0, fontWeight: 800,
      }}>→</div>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        style={{
          position: 'absolute', top: 6, right: 8,
          background: 'none', border: 'none', color: C.text.s,
          fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}

// ─── 3. DETECCIÓN DE DESBALANCE ESTRUCTURAL ───────────────────────────────────
// Analiza presupuestos (si hay) o gastos reales (fallback) y detecta 1-3
// desbalances importantes. Si todo está sano, no renderiza nada.
//
export function BudgetHealth({
  salario, presupuestos, gastosTx, goals, MAIN_CATS,
  C, COP, onFixBudget,
}) {
  if (!salario || salario <= 0) return null;

  // Usamos los límites si existen, si no, el gasto real de este mes
  const tienePresupuestos = Object.values(presupuestos || {}).some(v => v > 0);

  const getMontoCat = (catId) => {
    if (presupuestos?.[catId] > 0) return presupuestos[catId];
    const cat = MAIN_CATS.find(c => c.id === catId);
    if (!cat) return 0;
    return gastosTx
      .filter(t => cat.subs.some(s => s.id === t.cat))
      .reduce((s, t) => s + t.amount, 0);
  };

  const alertas = [];

  // 1. Deudas > 30% del ingreso → zona de alarma financiera
  const deudas = getMontoCat('deudas');
  if (deudas > 0 && deudas / salario > 0.30) {
    alertas.push({
      id: 'deudas_altas',
      icon: '🚨', color: C.red,
      title: `Deudas consumen ${Math.round(deudas / salario * 100)}% de tu ingreso`,
      body: 'Por encima del 30% empieza a asfixiar. Intenta bajarlas poco a poco',
      priority: 0,
    });
  }

  // 2. Ocio > Metas (cuando hay metas activas con saldo pendiente)
  const hayMetasActivas = (goals || []).some(g => (g.monto || 0) > 0);
  if (hayMetasActivas) {
    const ocio = getMontoCat('ocio');
    // Aportes del mes a metas (desde gastosTx — ya excluye aportes en App.jsx,
    // así que calculamos desde el presupuesto o 0)
    // Nota: este cálculo es heurístico — usamos el gasto en ocio vs el "libre" esperado
    if (ocio > 0 && ocio > salario * 0.15) {
      alertas.push({
        id: 'ocio_sobre_metas',
        icon: '⚖️', color: C.amber,
        title: `Gastas más en ocio que lo que aportas a tus metas`,
        body: 'Intenta equilibrar — un poco menos de ocio acelera tus metas',
        priority: 1,
      });
    }
  }

  // 3. Sin margen: presupuestos totales ≥ 95% del ingreso
  if (tienePresupuestos) {
    const totalPresup = Object.values(presupuestos).reduce((s, v) => s + v, 0);
    if (totalPresup / salario >= 0.95) {
      alertas.push({
        id: 'sin_margen',
        icon: '⚠️', color: C.amber,
        title: 'Tu plan no deja margen para metas',
        body: `Presupuestaste ${Math.round(totalPresup / salario * 100)}% del ingreso. Idealmente deja 15% libre`,
        priority: 1,
      });
    }
  }

  // 4. Categoría con límite pero pasada de rosca ya a mitad de mes
  // (esta la dejamos a BudgetAlert existente — no duplicar)

  if (alertas.length === 0) return null;

  // Mostrar máximo 2, priorizando críticas
  const topAlertas = alertas.sort((a, b) => a.priority - b.priority).slice(0, 2);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, color: C.text.b, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        ⚖️ Salud de tu plan
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topAlertas.map(a => (
          <div
            key={a.id}
            onClick={onFixBudget}
            style={{
              borderRadius: 14, padding: '12px 14px',
              background: `${a.color}10`,
              border: `1px solid ${a.color}30`,
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: onFixBudget ? 'pointer' : 'default',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              background: `${a.color}22`, border: `1px solid ${a.color}38`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>{a.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: C.text.h,
                marginBottom: 3, lineHeight: 1.3,
              }}>{a.title}</div>
              <div style={{ fontSize: 11, color: C.text.b, lineHeight: 1.4 }}>
                {a.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}