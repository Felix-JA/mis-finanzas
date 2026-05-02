// ─── FINANZAS UTILS ───────────────────────────────────────────────────────────
// Funciones puras de cálculo financiero — sin estado React, sin Firebase.
// Reciben todos los datos que necesitan como parámetros.
// Fáciles de testear de forma aislada.

/**
 * Devuelve el salario que correspondía a un mes/año específico,
 * teniendo en cuenta el historial de cambios y el modo de pago.
 *
 * @param {number} y - Año
 * @param {number} m - Mes (0-11)
 * @param {object} opts - { salario, salarioHistory, modoSalario, quincenas }
 */
export function getSalarioDelMes(y, m, { salario, salarioHistory, modoSalario, quincenas }) {
  // Buscar la entrada de historial más reciente que sea <= al mes pedido
  let best = salario || 0;
  Object.entries(salarioHistory || {}).forEach(([key, val]) => {
    const [ky, km] = key.split("-").map(Number);
    if (ky < y || (ky === y && km <= m)) {
      const bestKey = Object.keys(salarioHistory)
        .filter(k => {
          const [by, bm] = k.split("-").map(Number);
          return by < y || (by === y && bm <= m);
        })
        .sort((a, b) => {
          const [ay, am] = a.split("-").map(Number);
          const [by, bm] = b.split("-").map(Number);
          return (ay * 12 + am) - (by * 12 + bm);
        })
        .pop();
      if (!bestKey || (ky * 12 + km) >= (bestKey.split("-").map(Number).reduce((a, b, i) => i === 0 ? a * 12 : a + b, 0)))
        best = val;
    }
  });

  // Si modo quincenal: calcular cuántas quincenas han llegado este mes
  if (modoSalario === "quincenal") {
    const now = new Date();
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();
    if (isCurrentMonth) {
      const today = now.getDate();
      const { dia1 = 1, dia2 = 15 } = quincenas || {};
      const qCount = (today >= dia1 ? 1 : 0) + (today >= dia2 ? 1 : 0);
      return best * (qCount || 1);
    }
    return best * 2; // meses pasados → salario completo
  }
  return best;
}

/**
 * Calcula el saldo acumulado de meses anteriores al mes seleccionado.
 * Itera mes a mes desde el más antiguo con datos.
 *
 * @param {object} opts - Todos los datos necesarios
 */
export function calcSaldoAcumulado({
  tx, month, selectedYear,
  salario, salarioHistory, modoSalario, quincenas,
  isIngreso, isDevolucion, isIngresoExtra, isPrestamoTercero,
  isAporteMeta, isSavingsLegacy, parseDateSafe,
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const esMesFuturoInmediato = month === currentMonth + 1 && selectedYear === currentYear;
  const esMesFuturoLejano = selectedYear > currentYear || (selectedYear === currentYear && month > currentMonth + 1);
  if (esMesFuturoLejano) return 0;

  const limiteMes = esMesFuturoInmediato ? currentMonth + 1 : month;
  const limiteYear = selectedYear === currentYear ? currentYear : selectedYear;

  const txPasadas = tx.filter(t => {
    const d = parseDateSafe(t.date);
    if (d.getFullYear() < limiteYear) return true;
    if (d.getFullYear() === limiteYear && d.getMonth() < limiteMes) return true;
    return false;
  });

  if (txPasadas.length === 0) return 0;

  let minYear = limiteYear, minMes = limiteMes;
  txPasadas.forEach(t => {
    const d = parseDateSafe(t.date);
    if (d.getFullYear() < minYear || (d.getFullYear() === minYear && d.getMonth() < minMes)) {
      minYear = d.getFullYear();
      minMes = d.getMonth();
    }
  });

  const porMes = {};
  txPasadas.forEach(t => {
    const d = parseDateSafe(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!porMes[key]) porMes[key] = { ingresos: 0, gastos: 0, ahorros: 0, devoluciones: 0, extras: 0, prestamos: 0 };
    if (isIngreso(t.cat)) porMes[key].ingresos += t.amount;
    else if (isDevolucion(t.cat)) porMes[key].devoluciones += t.amount;
    else if (isIngresoExtra(t.cat)) porMes[key].extras += t.amount;
    else if (isPrestamoTercero(t.cat)) porMes[key].prestamos += t.amount;
    else if (isAporteMeta(t) || isSavingsLegacy(t.cat)) porMes[key].ahorros += t.amount;
    else porMes[key].gastos += t.amount;
  });

  let saldoAcumulado = 0;
  let y = minYear, m = minMes;
  while (y < limiteYear || (y === limiteYear && m < limiteMes)) {
    const key = `${y}-${m}`;
    const datos = porMes[key] || { ingresos: 0, gastos: 0, ahorros: 0, devoluciones: 0, extras: 0, prestamos: 0 };
    const salMes = getSalarioDelMes(y, m, { salario, salarioHistory, modoSalario, quincenas });
    const ingMes = salMes + datos.ingresos;
    const disponibleMes = ingMes + saldoAcumulado - datos.gastos - datos.ahorros - (datos.prestamos || 0) + datos.devoluciones + datos.extras;
    saldoAcumulado = Math.max(disponibleMes, 0);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return saldoAcumulado;
}