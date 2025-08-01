import { useState, useEffect } from 'react';
import { format, addDays, isAfter, isBefore, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, getDocs,doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import CatorcenaChart from './CatorcenaChart';

/**
 * Utility to calculate the total amount for a movement based on its frequency.
 * If the movement is one–off (único) the amount is returned directly.
 * For recurring movements the amount is scaled according to the frequency and
 * the length of a catorcena (14 days).  For monthly recurring movements the
 * base amount is returned because the component only displays a single
 * occurrence in a given catorcena.
 *
 * @param {Object} m Movement object from Firestore
 * @returns {number}
 */
function calcularImporte(m) {
  const { monto, frecuenciaTipo, frecuencia } = m;
  if (frecuenciaTipo === 'único') return monto;
  switch (frecuencia) {
    case 'diario':     return monto * 14;
    case 'semanal':    return monto * 2;
    case 'catorcenal': return monto;
    case 'mensual':    return monto;
    default:           return 0;
  }
}

/**
 * Calculate the per-payment amount for a credit card expense. For MSI charges,
 * the total amount is divided equally across the number of months specified.
 * All other charges return the full amount.
 *
 * @param {Object} g Card expense object
 * @returns {number} The amount due for the current catorcena
 */
function obtenerPagoTarjeta(g) {
  if (g.esMSI && g.mesesMSI) {
    const meses = Number(g.mesesMSI);
    return meses > 0 ? g.monto / meses : g.monto;
  }
  return g.monto;
}

/**
 * Calculate the due date for a given purchase based on the credit card's
 * cut‑off day and the grace period (diasCredito).  A purchase made on a
 * particular day is billed in the statement whose cut date is on or after
 * the purchase date.  The payment due date is then the cut date plus
 * diasCredito days.
 *
 * @param {Date} fechaCompra The date of the purchase (occurrence)
 * @param {Object} tarjeta The credit card object with diaCorte and diasCredito
 * @returns {Date} The calculated due date
 */
function calcularFechaVencimiento(fechaCompra, tarjeta) {
  const corte = new Date(fechaCompra);
  corte.setDate(tarjeta.diaCorte);
  // If the purchase was after the cut date for the month, shift to the next month
  if (fechaCompra.getDate() > tarjeta.diaCorte) {
    corte.setMonth(corte.getMonth() + 1);
  }
  // Add the grace period to get the due date
  return addDays(corte, tarjeta.diasCredito);
}

/**
 * Generate all payment due dates for a card expense that fall inside a
 * particular catorcena.  This helper handles MSI plans as well as
 * recurrent card expenses (diario, semanal, catorcenal, mensual).  Each
 * occurrence is treated as a new purchase; its due date is computed using
 * the credit card's cut date and grace period.  Only due dates that fall
 * within the provided catorcena (inclusive) are returned.
 *
 * @param {Object} g The expense object from the tarjeta.gastos array
 * @param {Object} tarjeta The credit card object with diaCorte and diasCredito
 * @param {Date} inicioCatorcena Start of the catorcena
 * @param {Date} finCatorcena End of the catorcena
 * @returns {Date[]} Array of due dates inside the catorcena
 */
function obtenerFechasPagoEnCatorcena(g, tarjeta, inicioCatorcena, finCatorcena) {
  const fechas = [];
  // Determine the starting date of the expense
  const fechaBase = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
  if (!fechaBase) return fechas;

  // Handle months without interest (MSI) by splitting the total across the
  // number of months.  Each month is treated as a separate purchase occurring
  // on the same day of the month as the original.  The due date for each
  // purchase is computed and only those falling within the catorcena are kept.
  if (g.esMSI && g.mesesMSI) {
    const totalMeses = Number(g.mesesMSI);
    for (let j = 0; j < totalMeses; j++) {
      const compra = new Date(fechaBase);
      compra.setMonth(compra.getMonth() + j);
      const vencimiento = calcularFechaVencimiento(compra, tarjeta);
      if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
          (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
        fechas.push(vencimiento);
      }
    }
    return fechas;
  }

  // For recurrent expenses we generate occurrences according to their frequency
  if (g.frecuenciaTipo === 'recurrente') {
    switch (g.frecuencia) {
      case 'diario': {
        // Purchases every day starting from fechaBase
        // We iterate until the purchase date exceeds the end of the catorcena
        for (let d = new Date(fechaBase); d <= finCatorcena; d.setDate(d.getDate() + 1)) {
          const vencimiento = calcularFechaVencimiento(d, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            fechas.push(new Date(vencimiento));
          }
        }
        break;
      }
      case 'semanal': {
        // Purchases every week on a specific day of the week
        const diasMap = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, jueves: 4, viernes: 5, sábado: 6 };
        const targetDay = diasMap[(g.diaSemana || '').toLowerCase()];
        if (targetDay === undefined) {
          // Without a valid day of week we treat it as a one‑off purchase
          const vencimiento = calcularFechaVencimiento(fechaBase, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            fechas.push(vencimiento);
          }
        } else {
          // Find the first occurrence of the target weekday on or after the
          // expense start date
          let current = new Date(fechaBase);
          // Move to the first matching day of week
          while (current.getDay() !== targetDay) {
            current.setDate(current.getDate() + 1);
          }
          // Iterate weekly and compute due dates
          for (let d = new Date(current); d <= finCatorcena; d.setDate(d.getDate() + 7)) {
            const vencimiento = calcularFechaVencimiento(d, tarjeta);
            if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
                (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
              fechas.push(new Date(vencimiento));
            }
          }
        }
        break;
      }
      case 'catorcenal': {
        // Purchases every 14 days starting from fechaBase
        // We need to align to the period; skip forward in 14‑day increments
        let d = new Date(fechaBase);
        // Advance to the first purchase date such that its due date might fall within the catorcena
        while (d <= finCatorcena) {
          const vencimiento = calcularFechaVencimiento(d, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            fechas.push(new Date(vencimiento));
          }
          // Move to the next purchase in 14 days
          d.setDate(d.getDate() + 14);
        }
        break;
      }
      case 'mensual': {
        // Purchases occur on a specific day of the month (diaMes).  If diaMes
        // isn't provided we use the day of the start date.
        const dia = g.diaMes ? parseInt(g.diaMes, 10) : fechaBase.getDate();
        // Start from the month of the expense start date
        let occ = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), dia);
        // Ensure the first occurrence is not before the start date
        if (occ < fechaBase) {
          occ.setMonth(occ.getMonth() + 1);
        }
        // Advance occurrences until the purchase date surpasses the end of the catorcena
        while (occ <= finCatorcena) {
          const vencimiento = calcularFechaVencimiento(occ, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            // Only include if the original occurrence is not before the expense start
            if (occ >= fechaBase) {
              fechas.push(new Date(vencimiento));
            }
          }
          // Move to next month
          occ.setMonth(occ.getMonth() + 1);
        }
        break;
      }
      default: {
        // If the frequency is unknown treat it as a single purchase
        const vencimiento = calcularFechaVencimiento(fechaBase, tarjeta);
        if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
            (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
          fechas.push(vencimiento);
        }
        break;
      }
    }
    return fechas;
  }

  // Non‑recurrent (único) expense: just one payment
  const vencimiento = calcularFechaVencimiento(fechaBase, tarjeta);
  if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
      (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
    fechas.push(vencimiento);
  }
  return fechas;
}

/**
 * DashboardCatorcenal component
 *
 * This component renders a list of 26 catorcenas (14‑day periods) for the
 * selected year.  For each catorcena it summarises the total income, total
 * expenses and card charges, and allows the user to drill down to see the
 * individual movements.  A checkbox is provided next to each expense so
 * that the user can mark it as covered.  When marked the item will be
 * displayed with a line‑through and green colour.  The state is tracked per
 * catorcena, meaning that marking an expense in one period does not affect
 * its appearance in another period.
 */
export default function DashboardCatorcenal() {
  const [catorcenas, setCatorcenas] = useState([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [movimientos, setMovimientos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [columnaAbierta, setColumnaAbierta] = useState(null);
  // Track which expenses have been marked as covered per catorcena.
  // The keys are the index of the catorcena and the values are arrays of IDs.
  const [pagados, setPagados] = useState({});

  /**
   * Generate the list of catorcenas for the selected year.  The starting
   * catorcena date varies per year and is defined here.  If no mapping is
   * provided for a particular year the default is January 10th of that year.
   */
  const generarCatorcenas = () => {
    const inicioMap = {
      2025: new Date(2025, 0, 10),
      2026: new Date(2026, 0, 9),
      2027: new Date(2027, 0, 8)
    };
    const inicio = inicioMap[anioSeleccionado] || new Date(anioSeleccionado, 0, 10);
    const lista = [];
    for (let i = 0; i < 26; i++) {
      const desde = addDays(inicio, i * 14);
      const hasta = addDays(desde, 13);
      lista.push({ inicio: desde, fin: hasta });
    }
    setCatorcenas(lista);
  };

  /**
   * Load movements and cards from Firestore whenever the selected year
   * changes.  This effect also regenerates the list of catorcenas.
   */
  useEffect(() => {
    generarCatorcenas();
    const cargarDatos = async () => {
      const movSnap = await getDocs(collection(db, 'movimientos'));
      setMovimientos(movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      const tarSnap = await getDocs(collection(db, 'tarjetas'));
      setTarjetas(tarSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    cargarDatos();
  }, [anioSeleccionado]);

  useEffect(() => {
    const cargarPagados = async () => {
      const snap = await getDocs(collection(db, 'pagosMarcados'));
      const data = {};
      snap.forEach(doc => {
        const { catorcenaIndex, movimientoId } = doc.data();
        if (!data[catorcenaIndex]) data[catorcenaIndex] = [];
        data[catorcenaIndex].push(movimientoId);
      });
      setPagados(data);
    };

    cargarPagados();
  }, []);

  /**
   * Determine whether a movement belongs to the given catorcena.  The logic
   * mirrors the original implementation and takes into account one‑off
   * movements, monthly and weekly recurrences, and catorcena frequency.
   *
   * @param {Object} m Movement
   * @param {Date} inicio Start of catorcena
   * @param {Date} fin End of catorcena
   */
  const enCatorcena = (m, inicio, fin) => {
    const fecha = m.fecha ? parseISO(m.fecha) : null;
    const fechaIni = m.fechaInicio ? parseISO(m.fechaInicio) : new Date(0);
    if (m.frecuenciaTipo === 'único' && fecha) {
      return (isAfter(fecha, inicio) || isEqual(fecha, inicio)) &&
             (isBefore(fecha, fin)   || isEqual(fecha, fin));
    }
    if (m.frecuenciaTipo === 'recurrente') {
      if (isAfter(fechaIni, fin)) return false;
      switch (m.frecuencia) {
        case 'mensual': {
          if (!m.diaMes) return false;
          const dia = parseInt(m.diaMes, 10);
          const ocurrencia = new Date(inicio.getFullYear(), inicio.getMonth(), dia);
          return ocurrencia >= inicio && ocurrencia <= fin && ocurrencia >= fechaIni;
        }
        case 'semanal': {
          if (!m.diaSemana) return false;
          const diasMap = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, jueves: 4, viernes: 5, sábado: 6 };
          const targetDay = diasMap[m.diaSemana.toLowerCase()];
          for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === targetDay && d >= fechaIni) return true;
          }
          return false;
        }
        case 'catorcenal': {
          const diff = Math.floor((inicio - fechaIni) / (1000 * 60 * 60 * 24));
          return diff >= 0 && diff % 14 === 0;
        }
        case 'diario':
          return fechaIni <= fin;
        default:
          return false;
      }
    }
    return false;
  };

  /**
   * Compute the total due for a credit card in a given catorcena.  This
   * implementation determines which charges fall within the billing cycle
   * based on cut dates and credit days.  For MSI charges the amount is
   * divided equally across the number of months specified.
   */
  const calcularTotalTarjeta = (t, inicio, fin) => {
    // Para cada gasto de la tarjeta calculamos cuántos pagos se generan
    // dentro de la catorcena y multiplicamos por el monto por pago.  Esto
    // soporta pagos recurrentes (diario, semanal, catorcenal, mensual) y MSI.
    return (t.gastos || []).reduce((sum, g) => {
      const pagos = obtenerFechasPagoEnCatorcena(g, t, inicio, fin);
      return sum + pagos.length * obtenerPagoTarjeta(g);
    }, 0);
  };

  /**
   * Toggle the covered state for a given movement within a specific catorcena.
   * When the checkbox is checked the movement's ID is added to the list of
   * covered expenses for that catorcena; unchecking it removes the ID.
   *
   * @param {number} index Index of the catorcena in the list
   * @param {string} id ID of the movement or card charge
   */
  const togglePagado = async (index, id) => {
    setPagados(prev => {
      const current = prev[index] || [];
      const yaMarcado = current.includes(id);
      const nuevoEstado = yaMarcado
        ? current.filter(item => item !== id)
        : [...current, id];

      // Guardar o eliminar en Firestore
      const docRef = doc(db, 'pagosMarcados', `${index}_${id}`);
      if (yaMarcado) {
        deleteDoc(docRef); // desmarcar
      } else {
        setDoc(docRef, {
          catorcenaIndex: index,
          movimientoId: id,
          timestamp: new Date().toISOString()
        });
      }

      return { ...prev, [index]: nuevoEstado };
    });
  };

  /**
   * Prepare data for the catorcena bar chart.  Expenses and card totals are
   * negated so they render below the zero axis.  The chart itself is
   * rendered by the CatorcenaChart component (not shown here).
   */
  const chartData = catorcenas.map(c => {
    const ingresos = movimientos
      .filter(m => m.tipo === 'ingreso' && enCatorcena(m, c.inicio, c.fin))
      .reduce((sum, m) => sum + calcularImporte(m), 0);
    const gastos = movimientos
      .filter(m => m.tipo === 'gasto' && enCatorcena(m, c.inicio, c.fin))
      .reduce((sum, m) => sum + calcularImporte(m), 0);
    const tarjetasTotal = tarjetas
      .reduce((sum, t) => sum + calcularTotalTarjeta(t, c.inicio, c.fin), 0);
    return {
      periodo: `${format(c.inicio, 'dd MMM')} - ${format(c.fin, 'dd MMM')}`,
      Ingresos: ingresos,
      Gastos: -gastos,
      Tarjetas: -tarjetasTotal
    };
  });

  /**
   * Export the chart data to an Excel file.  A balance column is added to
   * reflect the net total for each catorcena.
   */
  const exportarExcel = () => {
    const rows = chartData.map(r => ({
      Periodo: r.periodo,
      Ingresos: r.Ingresos,
      Gastos: r.Gastos,
      'Tarjetas (MSI/Crédito)': r.Tarjetas,
      Balance: r.Ingresos + r.Gastos + r.Tarjetas
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catorcenas');
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([data], { type: 'application/octet-stream' }), `dashboard_${anioSeleccionado}.xlsx`);
  };

  return (
    <>
      {/* Export button and year selector */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-primary" onClick={exportarExcel}>
          📥 Exportar a Excel
        </button>
        <div>
          <label className="me-2">Selecciona año:</label>
          <select value={anioSeleccionado} onChange={(e) => setAnioSeleccionado(Number(e.target.value))} className="form-select d-inline-block w-auto">
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
      </div>

      {/* Render catorcenas list */}
      {catorcenas.map((c, i) => {
        const ingresos = movimientos
          .filter(m => m.tipo === 'ingreso' && enCatorcena(m, c.inicio, c.fin))
          .sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));
        const gastos = movimientos
          .filter(m => m.tipo === 'gasto' && enCatorcena(m, c.inicio, c.fin))
          .sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));
        const tarjetasTotal = tarjetas.reduce((sum, t) => {
          let subtotal = 0;
          (t.gastos || []).forEach(g => {
            const pagos = obtenerFechasPagoEnCatorcena(g, t, c.inicio, c.fin);
            subtotal += pagos.length * obtenerPagoTarjeta(g);
          });
          return sum + subtotal;
        }, 0);
        const ingresosTotal = ingresos.reduce((sum, m) => sum + calcularImporte(m), 0);
        const gastosTotal = gastos.reduce((sum, m) => sum + calcularImporte(m), 0);
        const balance = ingresosTotal - gastosTotal - tarjetasTotal;
        const mostrar = columnaAbierta === i;
        return (
          <div key={i} className="mb-3 p-3 border rounded">
            <div className="d-flex justify-content-between align-items-center">
              <div className="fw-bold">
                {format(c.inicio, 'dd MMM', { locale: es })} – {format(c.fin, 'dd MMM', { locale: es })}
              </div>
              <div>
                <span className="text-success">+ Ingresos: ${ingresosTotal.toFixed(2)}</span> &nbsp;|&nbsp;
                <span className="text-danger">- Gastos: ${gastosTotal.toFixed(2)}</span> &nbsp;|&nbsp;
                <span className="text-warning">💳 Tarjetas: ${tarjetasTotal.toFixed(2)}</span>
              </div>
              <div className={balance >= 0 ? 'text-success fw-semibold' : 'text-danger fw-semibold'}>
                Balance: ${balance.toFixed(2)}
              </div>
              <button className="btn btn-link" onClick={() => setColumnaAbierta(mostrar ? null : i)}>
                {mostrar ? 'Ocultar detalles' : 'Ver detalles'}
              </button>
            </div>
            {mostrar && (
              <div className="mt-3">
                {/* Ingresos list */}
                <h6 className="text-success">🟩 Ingresos</h6>
                {ingresos.length === 0 && <div className="text-muted">Sin ingresos</div>}
                {ingresos.map(m => (
                  <div key={m.id} className="d-flex align-items-center mb-1">
                    <span className="me-2">+ ${calcularImporte(m).toFixed(2)}</span>
                    <span>{m.descripcion}</span>
                    {m.frecuenciaTipo === 'recurrente' && <span className="badge bg-info ms-2">Recurrente</span>}
                  </div>
                ))}
                {/* Gastos list with checkbox */}
                <h6 className="text-danger mt-3">🟥 Gastos</h6>
                {gastos.length === 0 && <div className="text-muted">Sin gastos</div>}
                {gastos.map(m => (
                  <div key={m.id} className="d-flex align-items-center mb-1">
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={pagados[i]?.includes(m.id) || false}
                      onChange={() => togglePagado(i, m.id)}
                    />
                    <span className="me-2">- ${calcularImporte(m).toFixed(2)}</span>
                    <span style={{ textDecoration: pagados[i]?.includes(m.id) ? 'line-through' : 'none', color: pagados[i]?.includes(m.id) ? 'green' : 'inherit' }}>
                      {m.descripcion}
                    </span>
                    {m.frecuenciaTipo === 'recurrente' && <span className="badge bg-info ms-2">Recurrente</span>}
                  </div>
                ))}
                {/* Card charges section */}
                <h6 className="text-warning mt-3">💳 Tarjetas</h6>
                {tarjetas.every(t => (t.gastos || []).length === 0) && (
                  <div className="text-muted">Sin cargos en tarjetas</div>
                )}
                {tarjetas.map((t) => {
                  // Generamos una lista plana de pagos de tarjeta en esta catorcena.
                  const gastosTarjeta = [];
                  (t.gastos || []).forEach((g, gIdx) => {
                    const pagos = obtenerFechasPagoEnCatorcena(g, t, c.inicio, c.fin);
                    pagos.forEach((_, pagoIdx) => {
                      gastosTarjeta.push({ gasto: g, gIdx, pagoIdx });
                    });
                  });
                  if (gastosTarjeta.length === 0) return null;
                  const totalGastosTarjeta = gastosTarjeta.reduce((s, item) => s + obtenerPagoTarjeta(item.gasto), 0);
                  return (
                    <div key={t.id} className="mb-2 p-2 border rounded">
                      <div className="fw-semibold">
                        {t.nombre + ' — Total: $' + totalGastosTarjeta.toFixed(2)}
                      </div>
                      {gastosTarjeta.map((item) => {
                        const uniqueId = `${t.id}-${item.gIdx}-${item.pagoIdx}`;
                        const g = item.gasto;
                        return (
                          <div key={uniqueId} className="d-flex align-items-center mb-1">
                            <input
                              type="checkbox"
                              className="form-check-input me-2"
                              checked={pagados[i]?.includes(uniqueId) || false}
                              onChange={() => togglePagado(i, uniqueId)}
                            />
                            <span className="me-2">- ${obtenerPagoTarjeta(g).toFixed(2)}</span>
                            <span style={{ textDecoration: pagados[i]?.includes(uniqueId) ? 'line-through' : 'none', color: pagados[i]?.includes(uniqueId) ? 'green' : 'inherit' }}>
                              {g.descripcion}
                            </span>
                            {/* Mostrar etiqueta de recurrente para gastos de tarjeta que no son únicos */}
                            {g.frecuenciaTipo === 'recurrente' && <span className="badge bg-info ms-2">Recurrente</span>}
                            {g.esMSI && g.mesesMSI && <span className="badge bg-warning text-dark ms-2">{g.mesesMSI} MSI</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {/* Render the bar chart below the list */}
      <div className="mt-4">
        <CatorcenaChart data={chartData} />
      </div>
    </>
  );
}
