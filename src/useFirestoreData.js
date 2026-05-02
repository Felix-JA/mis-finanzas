// ─── useFirestoreData ─────────────────────────────────────────────────────────
// Hook que centraliza todos los listeners de Firestore (onSnapshot).
// App.jsx lo llama una vez y recibe todos los datos reactivos.
//
// Beneficios:
// - App.jsx pierde ~40 líneas de useEffect
// - Los listeners están agrupados y son fáciles de mantener
// - Si un usuario no está autenticado, todos los estados se limpian solos

import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot,
  query, orderBy,
} from "firebase/firestore";

export function useFirestoreData(user) {
  const [tx, setTx]           = useState([]);
  const [txLoading, setTxL]   = useState(true);
  const [goals, setGoals]     = useState([]);
  const [pagos, setPagos]     = useState([]);
  const [presupuestos, setPresupuestos] = useState({});
  const [prestamos, setPrestamos]       = useState([]);
  const [deudas, setDeudas]   = useState([]);
  const [patrimonio, setPatrimonio]     = useState({ activos: [], pasivosExternos: [] });
  const [isPro, setIsPro]     = useState(false);

  const uid = user?.uid;

  // ── Transacciones ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setTx([]); setTxL(false); return; }
    setTxL(true);
    return onSnapshot(
      query(collection(db, "usuarios", uid, "transacciones"), orderBy("createdAt", "desc")),
      snap => { setTx(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setTxL(false); }
    );
  }, [uid]);

  // ── Metas ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setGoals([]); return; }
    return onSnapshot(
      query(collection(db, "usuarios", uid, "metas"), orderBy("createdAt", "desc")),
      snap => setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [uid]);

  // ── Pagos programados ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setPagos([]); return; }
    return onSnapshot(
      query(collection(db, "usuarios", uid, "pagos_programados"), orderBy("createdAt", "desc")),
      snap => setPagos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [uid]);

  // ── Presupuestos ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setPresupuestos({}); return; }
    return onSnapshot(
      collection(db, "usuarios", uid, "presupuestos"),
      snap => {
        const p = {};
        snap.docs.forEach(d => { p[d.id] = d.data().limite; });
        setPresupuestos(p);
      }
    );
  }, [uid]);

  // ── Préstamos a terceros ───────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setPrestamos([]); return; }
    return onSnapshot(
      query(collection(db, "usuarios", uid, "prestamos"), orderBy("createdAt", "desc")),
      snap => setPrestamos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [uid]);

  // ── Deudas ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setDeudas([]); return; }
    return onSnapshot(
      query(collection(db, "usuarios", uid, "deudas"), orderBy("createdAt", "desc")),
      snap => setDeudas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [uid]);

  // ── Patrimonio + plan Pro ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setPatrimonio({ activos: [], pasivosExternos: [] }); setIsPro(false); return; }
    return onSnapshot(
      doc(db, "usuarios", uid),
      snap => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.patrimonio) setPatrimonio(d.patrimonio);
          setIsPro(d.plan === "pro");
        }
      }
    );
  }, [uid]);

  return {
    tx, setTx, txLoading,
    goals, setGoals,
    pagos, setPagos,
    presupuestos, setPresupuestos,
    prestamos, setPrestamos,
    deudas, setDeudas,
    patrimonio, setPatrimonio,
    isPro, setIsPro,
  };
}