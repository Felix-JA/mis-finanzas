// ─── useSwipeDismiss ─────────────────────────────────────────────────────────
// Hook reutilizable de swipe-to-dismiss para bottom sheets.
// Exportado como módulo independiente para que lo usen todos los modales externos.
//
// Uso:
//   const sw = useSwipeDismiss(onClose);
//   <div ref={sw.overlayRef} style={{...sw.overlayStyle}}>
//     <div ref={sw.cardRef} style={{...sw.cardStyle}}>
//       <div {...sw.handleProps}>  ← barrita
//       <div {...sw.dragProps}>    ← body scrolleable

import { useRef } from "react";

export function useSwipeDismiss(onClose) {
  const cardRef    = useRef(null);
  const overlayRef = useRef(null);
  const startY     = useRef(null);
  const startT     = useRef(null);
  const curY       = useRef(0);
  const isDragging = useRef(false);
  const fromHandle = useRef(false);

  function setTransform(y) {
    const el = cardRef.current;
    if (!el) return;
    el.style.animationName = "none";
    el.style.transition = "none";
    el.style.transform = `translateY(${Math.max(0, y)}px)`;
  }

  function snapBack() {
    const el = cardRef.current;
    if (!el) return;
    el.style.animationName = "none";
    el.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
    el.style.transform = "translateY(0)";
  }

  function closeWithAnimation() {
    const el = cardRef.current;
    const ov = overlayRef.current;
    if (el) {
      const remaining = window.innerHeight - (curY.current || 0);
      const duration = Math.max(180, Math.min(remaining * 0.4, 300));
      el.style.animationName = "none";
      el.style.transition = `transform ${duration}ms cubic-bezier(0.4,0,1,1)`;
      el.style.transform = `translateY(${window.innerHeight}px)`;
    }
    if (ov) {
      ov.style.transition = "opacity 0.22s ease";
      ov.style.opacity = "0";
    }
    setTimeout(onClose, 300);
  }

  function onStart(clientY, isHandle = false) {
    startY.current = clientY;
    startT.current = Date.now();
    curY.current = 0;
    isDragging.current = true;
    fromHandle.current = isHandle;
  }

  function onMove(clientY) {
    if (!isDragging.current || startY.current === null) return;
    const d = clientY - startY.current;
    if (d > 0) { curY.current = d; setTransform(d); }
  }

  function onEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dist = curY.current;
    const velocity = dist / Math.max(Date.now() - startT.current, 1) * 1000;
    const distThreshold = fromHandle.current ? 120 : 200;
    const velThreshold  = fromHandle.current ? 400 : 600;
    if (dist > distThreshold || velocity > velThreshold) {
      closeWithAnimation();
    } else {
      snapBack();
    }
    startY.current = null;
    curY.current = 0;
    fromHandle.current = false;
    isDragging.current = false;
  }

  // handleProps — para la barrita superior (touchAction:none = drag libre)
  const handleProps = {
    style: { cursor: "grab", touchAction: "none", userSelect: "none",
             display: "flex", justifyContent: "center" },
    onTouchStart: e => { e.stopPropagation(); onStart(e.touches[0].clientY, true); },
    onTouchMove:  e => { e.stopPropagation(); onMove(e.touches[0].clientY); },
    onTouchEnd:   e => { e.stopPropagation(); onEnd(); },
  };

  // dragProps — para el body scrolleable
  const dragProps = {
    onTouchStart: e => {
      if (e.currentTarget.scrollTop === 0) onStart(e.touches[0].clientY, false);
    },
    onTouchMove: e => {
      if (startY.current === null) return;
      const d = e.touches[0].clientY - startY.current;
      const speed = d / Math.max(Date.now() - startT.current, 1) * 1000;
      if (d > 12 && speed > 350) onMove(e.touches[0].clientY);
      else if (d < -5) { startY.current = null; snapBack(); }
    },
    onTouchEnd: onEnd,
  };

  // Estilos listos para usar
  const overlayStyle = { animation: "overlayIn 0.22s ease forwards" };
  const cardStyle    = {
    animation: "sheetIn 0.3s cubic-bezier(0.32,0.72,0,1)",
    animationFillMode: "none",
  };

  return {
    cardRef, overlayRef,
    handleProps, dragProps,
    overlayStyle, cardStyle,
    closeWithAnimation,
  };
}