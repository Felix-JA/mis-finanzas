# 🔧 GUÍA DE INTEGRACIÓN — Mis Finanzas Pro
## Nuevos componentes: InsightsEngine · FinancialScore · MonthlyProjection

### Archivos nuevos creados
Copia estos tres archivos a tu `src/` (o donde viva `App.jsx`):
- `InsightsEngine.jsx`
- `FinancialScore.jsx`
- `MonthlyProjection.jsx`

---

## PASO 1 — Importar los componentes en App.jsx

**Añade al principio de App.jsx** (después de los imports de firebase o al comienzo del archivo),
junto a los demás imports:

```jsx
import { InsightsEngine } from "./InsightsEngine";
import { FinancialScore }  from "./FinancialScore";
import { MonthlyProjection } from "./MonthlyProjection";
```

---

## PASO 2 — Integrar FinancialScore en HomeTab

**Busca esta línea exacta en HomeTab** (aprox línea 2270):
```jsx
      <MonthSelector/>
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
```

**Reemplázala con** (añade FinancialScore ANTES de BudgetAlert):
```jsx
      <MonthSelector/>
      <FinancialScore
        totalIng={totalIngresoMes}
        totalGasto={totalGasto}
        totalAhorr={totalAportes}
        goals={goals}
        tx={tx}
        saldo={saldo}
        C={C}
        COP={COP}
        isMonth={isMonth}
        isAporteMeta={isAporteMeta}
        isSavingsLegacy={isSavingsLegacy}
      />
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
```

---

## PASO 3 — Integrar InsightsEngine en HomeTab

**Busca esta línea exacta** (dentro de HomeTab, después de BudgetAlert):
```jsx
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
      {/* ── Card principal — gradiente dramático estilo Revolut ── */}
```

**Reemplázala con** (InsightsEngine va entre BudgetAlert y la card principal):
```jsx
      <BudgetAlert pct={pctUsado} salario={sal} gastado={totalGasto}/>
      <InsightsEngine
        txAll={tx}
        monthTx={monthTx}
        gastosTx={gastosTx}
        totalGasto={totalGasto}
        totalIng={totalIngresoMes}
        totalAhorr={totalAportes}
        month={month}
        C={C}
        COP={COP}
        MAIN_CATS={MAIN_CATS}
        isGasto={isGasto}
        isAporteMeta={isAporteMeta}
        isSavingsLegacy={isSavingsLegacy}
        isMonth={isMonth}
      />
      {/* ── Card principal — gradiente dramático estilo Revolut ── */}
```

---

## PASO 4 — Integrar MonthlyProjection debajo del saldo principal

**Busca este bloque exacto** (el cierre de la card principal de saldo, aprox línea 2348):
```jsx
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>
              {totalIngresoMes>0?`de ${COP(totalIngresoMes+saldoAnterior)}`:"Sin ingresos"}
            </span>
            <span style={{
              fontSize:12,fontWeight:700,
              color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:"rgba(255,255,255,0.5)",
            }}>
              {Math.round(pctUsado*100)}% gastado
            </span>
          </div>
        </div>
      </div>
```

**Reemplázalo con** (añade MonthlyProjection justo dentro de la card, después de la barra):
```jsx
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>
              {totalIngresoMes>0?`de ${COP(totalIngresoMes+saldoAnterior)}`:"Sin ingresos"}
            </span>
            <span style={{
              fontSize:12,fontWeight:700,
              color:pctUsado>=1?C.red:pctUsado>=0.8?C.amber:"rgba(255,255,255,0.5)",
            }}>
              {Math.round(pctUsado*100)}% gastado
            </span>
          </div>
          <MonthlyProjection
            gastosTx={gastosTx}
            totalIng={totalIngresoMes + saldoAnterior}
            saldo={saldo}
            month={month}
            C={C}
            COP={COP}
            MONTHS_S={MONTHS_S}
          />
        </div>
      </div>
```

---

## ✅ Resultado final en HomeTab (orden visual de arriba a abajo)

```
MonthSelector
FinancialScore          ← NUEVO (score 0-100 con donut)
BudgetAlert
InsightsEngine          ← NUEVO (máx. 3 insights automáticos)
Card Principal (saldo)
  └─ MonthlyProjection ← NUEVO (proyección fin de mes)
Stats (gastos / metas)
GoalChips
GastosPorCategoría
```

---

## Notas de arquitectura

- **Todos los componentes son puros**: reciben props, devuelven JSX, no tienen efectos secundarios.
- **No usan useState/useEffect propios** (excepto MonthlyProjection que es stateless).
- **No modifican Firestore ni el estado del App**.
- **Tree-shakeable**: si no los importas, no afectan el bundle.
- Compatible con los 3 temas (navy, black, forest) porque reciben `C` como prop.
