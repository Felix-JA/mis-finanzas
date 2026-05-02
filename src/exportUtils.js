// ─── EXPORT UTILS ────────────────────────────────────────────────────────────
// Funciones de exportación CSV y PDF — sin estado React.
// Reciben todos los datos que necesitan como parámetros.

import { alertInfo, alertWarning } from "./GlobalAlert";

export function exportarCSV(soloMesActual, { tx, now, MONTHS, MAIN_CATS, getCatInfo, isIngreso, isAporteMeta, isSavingsLegacy, isMonth, COP, onDone }) {
  const txExport=soloMesActual
    ?tx.filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear()))
    :[...tx].sort((a,b)=>a.date.localeCompare(b.date));

  if(txExport.length===0){alertInfo("Sin movimientos","Sin movimientos para exportar.");return;}

  const header=["Fecha","Descripción","Categoría","Subcategoría","Monto","Tipo"];
  const rows=txExport.map(t=>{
    const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
    const sub=getCatInfo(t.cat);
    const tipo=isIngreso(t.cat)?"Ingreso":isAporteMeta(t)||isSavingsLegacy(t.cat)?"Meta/Ahorro":"Gasto";
    const monto=(isIngreso(t.cat)||isAporteMeta(t)||isSavingsLegacy(t.cat)?1:-1)*t.amount;
    return [
      t.date,
      `"${(t.desc||"").replace(/"/g,'""')}"`,
      `"${main?.labelFull||main?.label||sub.label}"`,
      `"${sub.label}"`,
      monto,
      tipo,
    ].join(",");
  });

  const csv=[header.join(","),...rows].join("\n");
  const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  const nombre=soloMesActual
    ?`finanzas_${MONTHS[now.getMonth()].toLowerCase()}_${now.getFullYear()}.csv`
    :`finanzas_completo_${now.getFullYear()}.csv`;
  a.href=url; a.download=nombre; a.click();
  URL.revokeObjectURL(url);
  onDone();
}

// ── Exportar movimientos a PDF ────────────────────────────────────────────
export function exportarPDF(soloMesActual, { tx, now, MONTHS, MAIN_CATS, getCatInfo, isIngreso, isIngresoExtra, isAporteMeta, isSavingsLegacy, isDevolucion, isMonth, isGasto, COP, getSalarioDelMes, modoSalario, user, onDone }) {
  const txExport=soloMesActual
    ?[...tx].filter(t=>isMonth(t.date,now.getMonth(),now.getFullYear()))
            .sort((a,b)=>a.date.localeCompare(b.date))
    :[...tx].sort((a,b)=>a.date.localeCompare(b.date));
  if(txExport.length===0){alertInfo("Sin movimientos","No hay movimientos en este período para exportar.");return;}

  const win=window.open("","_blank");
  if(!win){alertWarning("Ventanas bloqueadas","Permite ventanas emergentes en tu navegador.");return;}

  // ── Cálculos financieros ─────────────────────────────────────────────
  // Separar por tipo para poder mostrar breakdown detallado
  const txIngSalario  = txExport.filter(t=>isIngreso(t.cat));       // cat="ingreso" (quincenas registradas)
  const txExtras      = txExport.filter(t=>isIngresoExtra(t.cat));   // cat="ingreso_extra"
  const txDevoluciones= txExport.filter(t=>isDevolucion(t.cat));     // cat="prestamo_devuelto"

  const sumIngSalario  = txIngSalario.reduce((s,t)=>s+t.amount,0);
  const sumExtras      = txExtras.reduce((s,t)=>s+t.amount,0);
  const sumDevoluciones= txDevoluciones.reduce((s,t)=>s+t.amount,0);

  // Salario base del mes desde configuración (igual que usa el home)
  const salBase = soloMesActual ? getSalarioDelMes(now.getFullYear(), now.getMonth()) : 0;

  // Ingreso total:
  // - Reporte mensual: salario configurado + ingreso_extra + prestamo_devuelto (sin doblar con txIngSalario)
  // - Historial completo: sumar transacciones de los tres tipos (sin acceso al historial de salarios mes a mes)
  const totalIng = soloMesActual
    ? salBase + sumExtras + sumDevoluciones
    : sumIngSalario + sumExtras + sumDevoluciones;

  const totalGas=txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).reduce((s,t)=>s+t.amount,0);
  const totalApo=txExport.filter(t=>isAporteMeta(t)||isSavingsLegacy(t.cat)).reduce((s,t)=>s+t.amount,0);

  // balance = ingresoTotal - gastoTotal - aporteMetas
  const balance=totalIng-totalGas-totalApo;
  // Tasas calculadas sobre el mismo totalIng
  const tasaAhorro=totalIng>0?Math.min(Math.round((totalApo/totalIng)*100),100):0;
  const tasaGasto =totalIng>0?Math.min(Math.round((totalGas/totalIng)*100),100):0;
  const diasMes=soloMesActual?new Date(now.getFullYear(),now.getMonth()+1,0).getDate():30;
  const gastoDiario=Math.round(totalGas/diasMes);

  // Gastos por categoría principal
  const _gastosCat={};
  txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).forEach(t=>{
    const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
    const key=main?main.id:t.cat;
    const info=getCatInfo(t.cat);
    if(!_gastosCat[key]) _gastosCat[key]={label:main?main.label:info.label,color:main?main.color:info.color,icon:main?main.icon:info.icon,total:0,count:0};
    _gastosCat[key].total+=t.amount;
    _gastosCat[key].count++;
  });
  const catData=Object.values(_gastosCat).sort((a,b)=>b.total-a.total).slice(0,7);
  const maxCat=catData[0]?.total||1;

  // ── SVG Donut Chart ──────────────────────────────────────────────────
  function buildDonut(data,total){
    const cx=80,cy=80,R=65,hole=40;
    if(!data.length||total===0) return `<text x="${cx}" y="${cy+5}" text-anchor="middle" fill="#94a3b8" font-size="11" font-family="system-ui">Sin datos</text>`;
    function pt(angle,r){const rad=(angle-90)*Math.PI/180;return {x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)};}
    let ang=0;
    const segs=data.map(cat=>{
      const span=(cat.total/total)*360;
      const s=ang, e=ang+span-(span<359.9?0.8:0);
      ang+=span;
      const large=span>180?1:0;
      const p1=pt(s,R),p2=pt(e,R),h1=pt(s,hole),h2=pt(e,hole);
      return `<path d="M ${h1.x.toFixed(1)} ${h1.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L ${h2.x.toFixed(1)} ${h2.y.toFixed(1)} A ${hole} ${hole} 0 ${large} 0 ${h1.x.toFixed(1)} ${h1.y.toFixed(1)} Z" fill="${cat.color}"/>`;
    });
    return segs.join('')+
      `<circle cx="${cx}" cy="${cy}" r="${hole}" fill="#fff"/>
       <text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="system-ui" font-weight="700" letter-spacing="1">GASTOS</text>
       <text x="${cx}" y="${cy+8}" text-anchor="middle" font-size="15" fill="#0f172a" font-family="system-ui" font-weight="900">${tasaGasto}%</text>
       <text x="${cx}" y="${cy+20}" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="system-ui">del ingreso</text>`;
  }

  // ── Paginación ───────────────────────────────────────────────────────
  const RPP=28;
  const txPages=[];
  for(let p=0;p<Math.max(Math.ceil(txExport.length/RPP),1);p++)
    txPages.push(txExport.slice(p*RPP,(p+1)*RPP));

  const fechaDoc=new Date().toLocaleDateString("es-CO",{day:"2-digit",month:"long",year:"numeric"});
  const titulo=soloMesActual
    ?`Reporte · ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
    :"Historial completo de movimientos";

  // ── Helper: fila de tabla ────────────────────────────────────────────
  function txRow(t){
    const main=MAIN_CATS.find(m=>m.subs?.some(s=>s.id===t.cat));
    const sub=getCatInfo(t.cat);
    const esIng=isIngreso(t.cat)||isIngresoExtra(t.cat)||isDevolucion(t.cat);
    const esMeta=isAporteMeta(t)||isSavingsLegacy(t.cat);
    const tipo=esIng?"Ingreso":esMeta?"Meta":"Gasto";
    const badge=esIng?"badge-ing":esMeta?"badge-meta":"badge-gas";
    const monto=(esIng||esMeta?1:-1)*t.amount;
    const catLabel=main?`${main.label} · ${sub.label}`:sub.label;
    const fecha=t.date?`${t.date.slice(8,10)}/${t.date.slice(5,7)}`:"-";
    return `<tr>
      <td class="td-fecha">${fecha}</td>
      <td class="td-desc">${t.desc||"—"}</td>
      <td class="td-cat">${sub.icon||""} ${catLabel}</td>
      <td class="td-tipo"><span class="${badge}">${tipo}</span></td>
      <td class="td-monto ${monto>=0?"pos":"neg"}">${monto>=0?"+":""}${COP(Math.abs(monto))}</td>
    </tr>`;
  }

  // ── CSS ──────────────────────────────────────────────────────────────
  const css=`
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'DM Sans',system-ui,sans-serif;background:#dde3ec;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    /* Página */
    .page{background:#fff;width:210mm;margin:0 auto 20px;border-radius:8px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.18);}
    /* Header degradado */
    .hdr{background:linear-gradient(135deg,#4338ca 0%,#6366f1 60%,#818cf8 100%);padding:20px 24px 18px;color:#fff;position:relative;overflow:hidden;}
    .hdr::before{content:'';position:absolute;top:-40px;right:-30px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.07);}
    .hdr::after{content:'';position:absolute;bottom:-60px;right:60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.05);}
    .hdr-row{display:flex;justify-content:space-between;align-items:flex-start;position:relative;}
    .hdr-logo{font-size:17px;font-weight:900;letter-spacing:-0.5px;opacity:0.95;}
    .hdr-meta{text-align:right;font-size:9.5px;opacity:0.75;line-height:1.6;}
    .hdr-title{font-size:24px;font-weight:900;letter-spacing:-0.8px;margin-top:10px;position:relative;}
    .hdr-sub{font-size:10.5px;opacity:0.7;margin-top:3px;position:relative;}
    /* KPIs */
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #e2e8f0;}
    .kpi{padding:13px 20px;border-right:1px solid #e2e8f0;}
    .kpi:last-child{border-right:none;padding-right:20px;}
    .kpi-lbl{font-size:8.5px;font-weight:700;letter-spacing:1.2px;color:#94a3b8;text-transform:uppercase;margin-bottom:5px;}
    .kpi-val{font-size:15px;font-weight:900;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;}
    .kpi-hint{font-size:8.5px;color:#94a3b8;margin-top:3px;}
    /* Cuerpo */
    .body{padding:14px 24px 0;}
    .sec-lbl{font-size:8.5px;font-weight:700;letter-spacing:1.5px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;}
    /* Gráfica + categorías */
    .analytics{display:grid;grid-template-columns:165px 1fr;gap:18px;margin-bottom:16px;align-items:start;}
    .donut-wrap{text-align:center;}
    .donut-title{font-size:9px;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;}
    /* Lista categorías */
    .cat-list{display:flex;flex-direction:column;gap:7px;}
    .cat-row{display:grid;grid-template-columns:10px 1fr 72px 60px;gap:7px;align-items:center;}
    .cat-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
    .cat-name{font-size:10.5px;color:#334155;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .cat-bar{height:4px;background:#f1f5f9;border-radius:99px;overflow:hidden;}
    .cat-bar-fill{height:4px;border-radius:99px;}
    .cat-val{font-size:10px;font-weight:700;color:#64748b;text-align:right;}
    /* Tabla de ingresos */
    .ing-table{background:#f0fdf4;border-radius:10px;padding:10px 14px;margin-bottom:14px;border:1px solid #bbf7d0;}
    .ing-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #dcfce7;}
    .ing-row:last-child{border-bottom:none;}
    .ing-icon{font-size:13px;width:20px;flex-shrink:0;}
    .ing-lbl{flex:1;font-size:10.5px;color:#334155;font-weight:500;}
    .ing-date{color:#94a3b8;font-size:9px;font-weight:400;}
    .ing-amount{font-size:11px;font-weight:700;text-align:right;min-width:80px;color:#059669;}
    .ing-total-row{margin-top:3px;padding-top:7px!important;border-top:2px solid #86efac!important;border-bottom:none!important;}
    .ing-total-row .ing-lbl{font-weight:800;color:#166534;font-size:11px;}
    .ing-total-row .ing-amount{font-size:13px;}
    /* Insights */
    .insights{background:#f8fafc;border-radius:10px;padding:11px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    .ins-lbl{font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8;text-transform:uppercase;margin-bottom:3px;}
    .ins-val{font-size:14px;font-weight:900;letter-spacing:-0.3px;}
    .ins-hint{font-size:8.5px;color:#94a3b8;margin-top:2px;}
    /* Tabla */
    .tbl-outer{margin:0;}
    table{width:100%;border-collapse:collapse;}
    thead tr{background:#4338ca;}
    thead th{color:#fff;padding:8px 10px;font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;}
    th.th-fecha{width:8%;padding-left:14px;}
    th.th-desc{width:27%;text-align:left;}
    th.th-cat{width:25%;text-align:left;}
    th.th-tipo{width:10%;text-align:center;}
    th.th-monto{width:30%;text-align:right;padding-right:14px;}
    tbody tr:nth-child(even){background:#f8fafc;}
    td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:10.5px;vertical-align:middle;}
    td.td-fecha{padding-left:14px;color:#94a3b8;font-size:9.5px;white-space:nowrap;}
    td.td-desc{font-weight:600;color:#0f172a;}
    td.td-cat{color:#64748b;font-size:10px;}
    td.td-tipo{text-align:center;}
    td.td-monto{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;padding-right:14px;}
    td.pos{color:#059669;}
    td.neg{color:#dc2626;}
    /* Badges tipo */
    .badge-ing,.badge-gas,.badge-meta{display:inline-block;padding:2px 7px;border-radius:99px;font-size:8px;font-weight:700;}
    .badge-ing{background:#dcfce7;color:#166534;}
    .badge-gas{background:#fee2e2;color:#991b1b;}
    .badge-meta{background:#e0e7ff;color:#3730a3;}
    /* Fila total */
    .tr-total td{background:#f1f5f9;font-weight:800;color:#334155;border-top:2px solid #e2e8f0;border-bottom:none;}
    /* Footer */
    .footer{padding:9px 24px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9;}
    .footer-txt{font-size:8.5px;color:#94a3b8;}
    .footer-dot{width:4px;height:4px;border-radius:50%;background:#6366f1;display:inline-block;margin:0 6px;vertical-align:middle;}
    /* Encabezado páginas 2+ */
    .page-hdr{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:9px 24px;display:flex;justify-content:space-between;align-items:center;}
    .page-hdr-logo{font-size:11px;font-weight:900;color:#4338ca;}
    .page-hdr-info{font-size:9px;color:#94a3b8;}
    /* Print */
    @page{margin:14mm 16mm;}
    @media print{
      body{background:#fff;padding:0;}
      .page{box-shadow:none;margin:0;border-radius:0;width:100%;page-break-after:always;}
      .page:last-child{page-break-after:avoid;}
      .no-print{display:none!important;}
    }
  `;

  // ── HTML: KPI cards ──────────────────────────────────────────────────
  const nExtrasTotal=txExtras.length+txDevoluciones.length+(soloMesActual&&salBase>0?1:txIngSalario.length);
  const kpisHTML=`<div class="kpis">
    <div class="kpi"><div class="kpi-lbl">Ingresos del mes</div><div class="kpi-val" style="color:#059669">${COP(totalIng)}</div><div class="kpi-hint">${soloMesActual?`salario + ${txExtras.length+txDevoluciones.length} extras`:`${nExtrasTotal} movimientos`}</div></div>
    <div class="kpi"><div class="kpi-lbl">Gastos</div><div class="kpi-val" style="color:#dc2626">${COP(totalGas)}</div><div class="kpi-hint">${txExport.filter(t=>isGasto(t.cat)&&!isAporteMeta(t)).length} movimientos</div></div>
    <div class="kpi"><div class="kpi-lbl">Aportes a metas</div><div class="kpi-val" style="color:#4f46e5">${COP(totalApo)}</div><div class="kpi-hint">${txExport.filter(t=>isAporteMeta(t)).length} aportes</div></div>
    <div class="kpi"><div class="kpi-lbl">Balance</div><div class="kpi-val" style="color:${balance>=0?"#059669":"#dc2626"}">${balance>=0?"+":""}${COP(balance)}</div><div class="kpi-hint">${balance>=0?"Positivo ✓":"Déficit · revisar gastos"}</div></div>
  </div>`;

  // ── HTML: desglose de ingresos (solo reporte mensual) ───────────────
  const ingresosHTML=soloMesActual?`
    <div class="sec-lbl" style="margin-top:14px">Ingresos del mes</div>
    <div class="ing-table">
      <div class="ing-row">
        <span class="ing-icon">💼</span>
        <span class="ing-lbl">Salario base${modoSalario==="quincenal"?" (quincenal)":""}</span>
        <span class="ing-amount">${COP(salBase)}</span>
      </div>
      ${txExtras.map(t=>`
      <div class="ing-row">
        <span class="ing-icon">💰</span>
        <span class="ing-lbl">${t.desc||"Ingreso extra"} <span class="ing-date">${t.date?`(${t.date.slice(8,10)}/${t.date.slice(5,7)})`:""}  </span></span>
        <span class="ing-amount">+${COP(t.amount)}</span>
      </div>`).join("")}
      ${txDevoluciones.map(t=>`
      <div class="ing-row">
        <span class="ing-icon">↩️</span>
        <span class="ing-lbl">${t.desc||"Devolución recibida"} <span class="ing-date">${t.date?`(${t.date.slice(8,10)}/${t.date.slice(5,7)})`:""}  </span></span>
        <span class="ing-amount">+${COP(t.amount)}</span>
      </div>`).join("")}
      <div class="ing-row ing-total-row">
        <span class="ing-icon">∑</span>
        <span class="ing-lbl">Total ingresos del mes</span>
        <span class="ing-amount">${COP(totalIng)}</span>
      </div>
    </div>`:"";

  // ── HTML: gráfica + categorías ───────────────────────────────────────
  const analyticsHTML=totalGas>0?`
    <div class="sec-lbl" style="margin-top:14px">Distribución de gastos</div>
    <div class="analytics">
      <div class="donut-wrap">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="65" fill="#f1f5f9"/>
          ${buildDonut(catData,totalGas)}
        </svg>
      </div>
      <div class="cat-list">
        ${catData.map(c=>`
          <div class="cat-row">
            <div class="cat-dot" style="background:${c.color}"></div>
            <div class="cat-name">${c.icon} ${c.label}</div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.round(c.total/maxCat*100)}%;background:${c.color}"></div></div>
            <div class="cat-val">${COP(c.total)}</div>
          </div>`).join("")}
      </div>
    </div>`:"";

  // ── HTML: insights ───────────────────────────────────────────────────
  const mayorCat=catData[0];
  const insightsHTML=soloMesActual?`
    <div class="insights">
      <div><div class="ins-lbl">Tasa de ahorro</div>
        <div class="ins-val" style="color:${tasaAhorro>=20?"#059669":tasaAhorro>=10?"#d97706":"#dc2626"}">${tasaAhorro}%</div>
        <div class="ins-hint">${tasaAhorro>=20?"Excelente":tasaAhorro>=10?"Bien":tasaAhorro>0?"Sigue mejorando":"Sin aportes"}</div></div>
      <div><div class="ins-lbl">Gasto diario prom.</div>
        <div class="ins-val" style="color:#0f172a;font-size:13px">${COP(gastoDiario)}</div>
        <div class="ins-hint">por día este mes</div></div>
      <div><div class="ins-lbl">Mayor categoría</div>
        <div class="ins-val" style="color:#0f172a;font-size:12px">${mayorCat?mayorCat.label:"—"}</div>
        <div class="ins-hint">${mayorCat?COP(mayorCat.total):""}</div></div>
      <div><div class="ins-lbl">Gastos vs ingresos</div>
        <div class="ins-val" style="color:${tasaGasto<=70?"#059669":tasaGasto<=90?"#d97706":"#dc2626"}">${tasaGasto}%</div>
        <div class="ins-hint">${tasaGasto<=70?"Controlado":tasaGasto<=90?"Atención":"Excedido"}</div></div>
    </div>`:"";

  // ── HTML: tabla ──────────────────────────────────────────────────────
  function tableHTML(rows,isLast){
    const totalRow=isLast?`<tr class="tr-total">
      <td class="td-fecha" colspan="3">Total del período · ${txExport.length} movimientos</td>
      <td class="td-tipo"></td>
      <td class="td-monto ${balance>=0?"pos":"neg"}">${balance>=0?"+":""}${COP(Math.abs(balance))}</td>
    </tr>`:"";
    return `<div class="tbl-outer"><table>
      <thead><tr>
        <th class="th-fecha">Fecha</th>
        <th class="th-desc">Descripción</th>
        <th class="th-cat">Categoría</th>
        <th class="th-tipo">Tipo</th>
        <th class="th-monto">Monto</th>
      </tr></thead>
      <tbody>${rows.map(txRow).join("")}${totalRow}</tbody>
    </table></div>`;
  }

  // ── HTML: páginas ────────────────────────────────────────────────────
  const page1=`<div class="page">
    <div class="hdr">
      <div class="hdr-row">
        <div class="hdr-logo">💰 MIS FINANZAS PRO</div>
        <div class="hdr-meta"><div>${user.displayName||""}</div><div>${fechaDoc}</div></div>
      </div>
      <div class="hdr-title">${titulo}</div>
      <div class="hdr-sub">${txExport.length} movimientos · generado el ${fechaDoc}</div>
    </div>
    ${kpisHTML}
    <div class="body">
      ${ingresosHTML}
      ${analyticsHTML}
      ${insightsHTML}
      <div class="sec-lbl" style="margin-top:${totalGas>0||soloMesActual?"0":"14px"}">Movimientos</div>
    </div>
    ${tableHTML(txPages[0]||[],txPages.length===1)}
    <div class="footer">
      <span class="footer-txt">mis-finanzas-weld.vercel.app</span>
      <span class="footer-txt">Página 1 de ${txPages.length}<span class="footer-dot"></span>${titulo}</span>
    </div>
  </div>`;

  const otherPages=txPages.slice(1).map((rows,i)=>`<div class="page">
    <div class="page-hdr">
      <span class="page-hdr-logo">💰 MIS FINANZAS PRO</span>
      <span class="page-hdr-info">${titulo} · ${user.displayName||""}</span>
    </div>
    ${tableHTML(rows,i===txPages.length-2)}
    <div class="footer">
      <span class="footer-txt">mis-finanzas-weld.vercel.app</span>
      <span class="footer-txt">Página ${i+2} de ${txPages.length}</span>
    </div>
  </div>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="utf-8">
    <title>Mis Finanzas · ${titulo}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&display=swap" rel="stylesheet">
    <style>${css}</style>
  </head><body>
    <div class="no-print" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 16px;position:sticky;top:0;z-index:99;background:#dde3ec;border-bottom:1px solid #c8d0db;flex-wrap:wrap;">
      <button onclick="window.close()" style="background:#fff;color:#4338ca;border:1.5px solid #c7d2fe;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
        ← Volver a la app
      </button>
      <button onclick="window.print()" style="background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;padding:11px 26px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(79,70,229,0.45);">
        🖨️ Imprimir / Guardar PDF
      </button>
      <span style="font-size:12px;color:#64748b;">Selecciona "Guardar como PDF" en el diálogo de impresión</span>
    </div>
    ${page1}${otherPages}
  </body></html>`);
  win.document.close();
  onDone();
}