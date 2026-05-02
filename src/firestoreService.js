// ─── FIRESTORE SERVICE ────────────────────────────────────────────────────────
// Funciones puras de acceso a Firestore — sin estado React.
// App.jsx las llama y maneja los efectos secundarios (estado local, alertas, etc.)
//
// Patrón: todas reciben `uid` como primer parámetro.
// No importan hooks ni estado — solo Firebase y lógica de datos.

import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  setDoc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const u = (uid, ...path) => doc(db, "usuarios", uid, ...path);
const c = (uid, col) => collection(db, "usuarios", uid, col);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

// ─── TRANSACCIONES ───────────────────────────────────────────────────────────
export async function saveTx(uid, t) {
  const p = {
    desc: t.desc, amount: t.amount, cat: t.cat, date: t.date,
    ...(t.goalId ? {goalId: t.goalId} : {}),
    ...(t.deudaId ? {deudaId: t.deudaId} : {}),
  };
  if (t.id) {
    await updateDoc(u(uid, "transacciones", t.id), p);
    return { updated: true };
  }
  const ref = await addDoc(c(uid, "transacciones"), {...p, createdAt: serverTimestamp()});
  return { created: true, id: ref.id };
}

export async function deleteTx(uid, id) {
  await deleteDoc(u(uid, "transacciones", id));
}

// Actualizar deuda cuando se registra pago (vía TxModal con deudaId)
export async function actualizarDeudaTrasNuevaTx(uid, deudaId, amount, txId, date) {
  const dSnap = await getDoc(u(uid, "deudas", deudaId));
  if (!dSnap.exists()) return;
  const d = dSnap.data();
  const nuevoSaldo = Math.max((d.saldoRestante||0) - amount, 0);
  const pagos = [...(d.pagos||[]), {fecha: date, monto: amount}];
  await updateDoc(u(uid, "deudas", deudaId), {
    saldoRestante: nuevoSaldo,
    liquidada: nuevoSaldo <= 0,
    pagos,
  });
}

// Restaurar deuda cuando se elimina una tx de cuota
export async function restaurarDeudaTrasEliminarTx(uid, deudaId, amount, txId) {
  const dSnap = await getDoc(u(uid, "deudas", deudaId));
  if (!dSnap.exists()) return;
  const d = dSnap.data();
  const nuevoSaldo = Math.min((d.saldoRestante||0) + amount, d.montoTotal||0);
  const pagos = (d.pagos||[]).filter(p => p.txId !== txId);
  await updateDoc(u(uid, "deudas", deudaId), {
    saldoRestante: nuevoSaldo,
    liquidada: nuevoSaldo <= 0,
    pagos,
  });
}

// ─── METAS ───────────────────────────────────────────────────────────────────
export async function saveMeta(uid, g) {
  const pl = {
    name: g.name, monto: g.monto||0, emoji: g.emoji||"⭐",
    esEmergencias: g.esEmergencias||false,
    saldoInicial: g.saldoInicial||0,
    ...(g.imagen ? {imagen: g.imagen} : {imagen: null}),
  };
  if (g.id) {
    await updateDoc(u(uid, "metas", g.id), pl);
  } else {
    await addDoc(c(uid, "metas"), {...pl, createdAt: serverTimestamp()});
  }
}

export async function deleteMeta(uid, id, aporteIds) {
  await deleteDoc(u(uid, "metas", id));
  await Promise.all(aporteIds.map(txId => deleteTx(uid, txId)));
}

export async function crearMetaEmergencias(uid) {
  await addDoc(c(uid, "metas"), {
    name: "Fondo Emergencias", emoji: "🛡️", monto: 0, esEmergencias: true,
    createdAt: serverTimestamp(),
  });
}

// ─── PRESUPUESTOS ─────────────────────────────────────────────────────────────
export async function savePresupuesto(uid, catId, limite) {
  if (!limite || limite <= 0) {
    await deleteDoc(u(uid, "presupuestos", catId));
  } else {
    await setDoc(u(uid, "presupuestos", catId), {limite});
  }
}

export async function saveBudgetBulk(uid, presupuestosObj) {
  await Promise.all(
    Object.entries(presupuestosObj).map(([catId, limite]) =>
      setDoc(u(uid, "presupuestos", catId), {limite})
    )
  );
}

// ─── CATEGORÍAS PERSONALIZADAS ────────────────────────────────────────────────
export async function saveCatsCustom(uid, updated) {
  await setDoc(u(uid), {catsCustom: updated}, {merge: true});
}

// ─── PRÉSTAMOS ────────────────────────────────────────────────────────────────
export async function savePrestamo(uid, p) {
  const pl = {
    nombre: p.nombre, monto: p.monto,
    fechaPrestamo: p.fechaPrestamo, descripcion: p.descripcion||"",
    devuelto: p.devuelto||false,
  };
  if (p.id) {
    await updateDoc(u(uid, "prestamos", p.id), pl);
    return null;
  }
  const fechaFmt = p.fechaPrestamo && /^\d{4}-\d{2}-\d{2}$/.test(p.fechaPrestamo)
    ? p.fechaPrestamo : todayStr();
  const txRef = await addDoc(c(uid, "transacciones"), {
    desc: `Préstamo a ${p.nombre}${p.descripcion ? ` · ${p.descripcion}` : ""}`,
    amount: p.monto, cat: "prestamo_tercero",
    date: fechaFmt, createdAt: serverTimestamp(),
  });
  await addDoc(c(uid, "prestamos"), {...pl, txId: txRef.id, createdAt: serverTimestamp()});
  return txRef.id;
}

export async function deletePrestamo(uid, id, txId) {
  const snap = await getDoc(u(uid, "prestamos", id));
  const txDevId = snap.data()?.txDevolucionId;
  await deleteDoc(u(uid, "prestamos", id));
  if (txId) try { await deleteTx(uid, txId); } catch(_) {}
  if (txDevId) try { await deleteTx(uid, txDevId); } catch(_) {}
}

export async function togglePrestamo(uid, id, devuelto, montoDevuelto, nombre) {
  if (devuelto && montoDevuelto > 0) {
    const txDev = await addDoc(c(uid, "transacciones"), {
      desc: `Devolución de ${nombre}`,
      amount: montoDevuelto, cat: "prestamo_devuelto",
      date: todayStr(), createdAt: serverTimestamp(),
    });
    await updateDoc(u(uid, "prestamos", id), {
      devuelto: true, fechaDevolucion: todayStr(),
      txDevolucionId: txDev.id, montoDevuelto,
    });
  } else {
    const snap = await getDoc(u(uid, "prestamos", id));
    const txDevId = snap.data()?.txDevolucionId;
    if (txDevId) try { await deleteTx(uid, txDevId); } catch(_) {}
    await updateDoc(u(uid, "prestamos", id), {
      devuelto: false, fechaDevolucion: null,
      txDevolucionId: null, montoDevuelto: null,
    });
  }
}

// ─── DEUDAS ───────────────────────────────────────────────────────────────────
export async function saveDeuda(uid, d) {
  const pl = {
    nombre: d.nombre, emoji: d.emoji, montoTotal: d.montoTotal,
    saldoRestante: d.saldoRestante, cuotaMensual: d.cuotaMensual,
    dia: d.dia, liquidada: false,
  };
  if (d.id) {
    await updateDoc(u(uid, "deudas", d.id), pl);
  } else {
    await addDoc(c(uid, "deudas"), {...pl, pagos: [], createdAt: serverTimestamp()});
  }
}

export async function pagarDeuda(uid, deudaId, monto) {
  const txRef = await addDoc(c(uid, "transacciones"), {
    desc: "Cuota deuda", amount: monto, cat: "cuotas",
    date: todayStr(), createdAt: serverTimestamp(),
  });
  const snap = await getDoc(u(uid, "deudas", deudaId));
  if (!snap.exists()) return;
  const data = snap.data();
  const nuevoSaldo = Math.max((data.saldoRestante||0) - monto, 0);
  const pagos = [...(data.pagos||[]), {fecha: todayStr(), monto, txId: txRef.id}];
  await updateDoc(u(uid, "deudas", deudaId), {
    saldoRestante: nuevoSaldo, liquidada: nuevoSaldo <= 0, pagos,
  });
}

export async function deleteDeuda(uid, deudaId) {
  await deleteDoc(u(uid, "deudas", deudaId));
}

// ─── PATRIMONIO ───────────────────────────────────────────────────────────────
export async function savePatrimonio(uid, patrimonio) {
  await setDoc(u(uid), {patrimonio}, {merge: true});
}

// ─── PAGOS PROGRAMADOS ────────────────────────────────────────────────────────
export async function savePago(uid, p, calMes, calAnio) {
  const ahora = new Date();
  const pl = {
    nombre: p.nombre, monto: p.monto, cat: p.cat, dia: p.dia,
    frecuencia: p.frecuencia||"mensual", activo: true,
    esVariable: p.esVariable||false,
    ...(p.frecuencia === "unico"
      ? {mesUnico: p.mesUnico ?? ahora.getMonth(), anioUnico: p.anioUnico ?? ahora.getFullYear()}
      : {}),
    ...(!p.id && (p.frecuencia === "mensual" || !p.frecuencia)
      ? {mesInicio: p.mesInicio ?? calMes, anioInicio: p.anioInicio ?? calAnio}
      : {}),
  };
  if (p.id) {
    await updateDoc(u(uid, "pagos_programados", p.id), pl);
  } else {
    await addDoc(c(uid, "pagos_programados"), {...pl, createdAt: serverTimestamp()});
  }
}

export async function deletePago(uid, id) {
  await deleteDoc(u(uid, "pagos_programados", id));
}

export async function confirmarPago(uid, p) {
  await addDoc(c(uid, "transacciones"), {
    desc: p.nombre, amount: p.monto, cat: p.cat,
    date: todayStr(), createdAt: serverTimestamp(), pagoId: p.id,
  });
}

export async function posponerPago(uid, id) {
  const maniana = new Date();
  maniana.setDate(maniana.getDate() + 1);
  await updateDoc(u(uid, "pagos_programados", id), {dia: maniana.getDate()});
}

// ─── SALARIO ──────────────────────────────────────────────────────────────────
export async function saveSalario(uid, nuevoValor, salarioHistory, modoSalario, quincenas) {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const keyProximo = `${y}-${m + 1 <= 11 ? m + 1 : 0}`;
  const newHistory = {...salarioHistory, [keyProximo]: nuevoValor};
  const payload = {salario: nuevoValor, salarioHistory: newHistory};
  if (quincenas) payload.quincenas = quincenas;
  if (modoSalario) payload.modoSalario = modoSalario;
  await setDoc(u(uid), payload, {merge: true});
  return newHistory;
}