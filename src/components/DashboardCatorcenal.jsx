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
   * implementation is identical to the original one and determines which
   * charges fall within the billing cycle based on cut dates and credit days.
   */
  const calcularTotalTarjeta = (t, inicio, fin) => {
  const gastos = (t.gastos || []).filter(g => {
    const base = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
    if (!base) return false;

    const corte = t.diaCorte;
    const diasCredito = t.diasCredito;
    const posibleCorte = new Date(base);
    posibleCorte.setDate(corte);
    if (base.getDate() > corte) {
      posibleCorte.setMonth(posibleCorte.getMonth() + 1);
    }

    const fechasPago = [];

    if (g.esMSI && g.mesesMSI) {
      for (let j = 0; j < Number(g.mesesMSI); j++) {
        const cuota = new Date(posibleCorte);
        cuota.setMonth(cuota.getMonth() + j);
        fechasPago.push(addDays(cuota, diasCredito));
      }
    } else if (g.frecuencia === 'mensual' && g.diaMes) {
      const dia = parseInt(g.diaMes, 10);
      const ocurrencia = new Date(inicio.getFullYear(), inicio.getMonth(), dia);
      if (ocurrencia >= base && ocurrencia >= inicio && ocurrencia <= fin) {
        fechasPago.push(addDays(ocurrencia, diasCredito));
      }
    } else {
      fechasPago.push(addDays(posibleCorte, diasCredito));
    }

    return fechasPago.some(fp =>
      (isAfter(fp, inicio) || isEqual(fp, inicio)) &&
      (isBefore(fp, fin) || isEqual(fp, fin))
    );
  });

  return gastos.reduce((s, g) => s + g.monto, 0);
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
    <div className="container-fluid">
      {/* Export button and year selector */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-primary" onClick={exportarExcel}>📥 Exportar a Excel</button>
        <div>
          <label className="me-2">Selecciona año:</label>
          <select
            className="form-select d-inline-block w-auto"
            value={anioSeleccionado}
            onChange={e => setAnioSeleccionado(Number(e.target.value))}
          >
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
  const gt = (t.gastos || []).filter(g => {
    const base = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
    if (!base) return false;
    const corte = t.diaCorte;
    const diasCredito = t.diasCredito;
    const posibleCorte = new Date(base);
    posibleCorte.setDate(corte);
    if (base.getDate() > corte) {
      posibleCorte.setMonth(posibleCorte.getMonth() + 1);
    }
    const fechasPago = [];
    if (g.esMSI && g.mesesMSI) {
      for (let j = 0; j < Number(g.mesesMSI); j++) {
        const cuota = new Date(posibleCorte);
        cuota.setMonth(cuota.getMonth() + j);
        fechasPago.push(addDays(cuota, diasCredito));
      }
    } else if (g.frecuencia === 'mensual' && g.diaMes) {
      const dia = parseInt(g.diaMes, 10);
      const ocurrencia = new Date(c.inicio.getFullYear(), c.inicio.getMonth(), dia);
      if (ocurrencia >= base && ocurrencia >= c.inicio && ocurrencia <= c.fin) {
        fechasPago.push(addDays(ocurrencia, diasCredito));
      }
    } else {
      fechasPago.push(addDays(posibleCorte, diasCredito));
    }
    return fechasPago.some(fp =>
      (isAfter(fp, c.inicio) || isEqual(fp, c.inicio)) &&
      (isBefore(fp, c.fin) || isEqual(fp, c.fin))
    );
  });
  return sum + gt.reduce((s, g) => s + g.monto, 0);
}, 0);
        const ingresosTotal = ingresos.reduce((sum, m) => sum + calcularImporte(m), 0);
const gastosTotal = gastos.reduce((sum, m) => sum + calcularImporte(m), 0);
const balance = ingresosTotal - gastosTotal - tarjetasTotal;
const mostrar = columnaAbierta === i;
        return (
          <div key={i} className="card mb-3">
            <div className="card-header d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center">
              <div>
                <h6 className="mb-1">
                  {format(c.inicio, 'dd MMM', { locale: es })} – {format(c.fin, 'dd MMM', { locale: es })}
                </h6>
                <small>
                  + Ingresos: ${ingresosTotal.toFixed(2)} &nbsp;|&nbsp; - Gastos: ${gastosTotal.toFixed(2)} &nbsp;|&nbsp; 💳 Tarjetas: ${tarjetasTotal.toFixed(2)}
                </small>
              </div>
              <div className="mt-2 mt-md-0 text-md-end">
                <div className={balance >= 0 ? 'text-success fw-semibold' : 'text-danger fw-semibold'}>
                  Balance: ${balance.toFixed(2)}
                </div>
                <button
                  className="btn btn-sm btn-link"
                  onClick={() => setColumnaAbierta(mostrar ? null : i)}
                >
                  {mostrar ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
              </div>
            </div>
            {mostrar && (
              <div className="card-body">
                {/* Ingresos list */}
                <h6 className="fw-bold">🟩 Ingresos</h6>
                {ingresos.length === 0 && <p className="text-muted">Sin ingresos</p>}
                {ingresos.map(m => (
                  <div key={m.id} className="ms-2">
                    <span>
                      + ${calcularImporte(m).toFixed(2)} — {m.descripcion}
                      {m.frecuenciaTipo === 'recurrente' && <em className="ms-1">Recurrente</em>}
                    </span>
                  </div>
                ))}
                {/* Gastos list with checkbox */}
                <h6 className="fw-bold mt-3">🟥 Gastos</h6>
                {gastos.length === 0 && <p className="text-muted">Sin gastos</p>}
                {gastos.map(m => (
                  <div key={m.id} className="d-flex align-items-center ms-2">
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={Boolean(pagados[i] && pagados[i].includes(m.id))}
                      onChange={() => togglePagado(i, m.id)}
                    />
                    <span
                      style={pagados[i] && pagados[i].includes(m.id)
                        ? { textDecoration: 'line-through', color: 'green' }
                        : {}}
                    >
                      - ${calcularImporte(m).toFixed(2)} — {m.descripcion}
                      {m.frecuenciaTipo === 'recurrente' && <em className="ms-1">Recurrente</em>}
                    </span>
                  </div>
                ))}
                {/* Card charges section */}
                <h6 className="fw-bold mt-3">💳 Tarjetas</h6>
                {tarjetas.every(t => (t.gastos || []).length === 0) && (
                  <p className="text-muted ms-2">Sin cargos en tarjetas</p>
                )}
                {tarjetas.map((t) => {
  const gastosTarjeta = (t.gastos || []).filter((g) => {
    const base = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
    if (!base) return false;

    const corte = t.diaCorte;
    const diasCredito = t.diasCredito;
    const posibleCorte = new Date(base);
    posibleCorte.setDate(corte);
    if (base.getDate() > corte) {
      posibleCorte.setMonth(posibleCorte.getMonth() + 1);
    }

    const fechasPago = [];

    if (g.esMSI && g.mesesMSI) {
      for (let j = 0; j < Number(g.mesesMSI); j++) {
        const cuota = new Date(posibleCorte);
        cuota.setMonth(cuota.getMonth() + j);
        fechasPago.push(addDays(cuota, diasCredito));
      }
    } else if (g.frecuencia === 'mensual' && g.diaMes) {
      const dia = parseInt(g.diaMes, 10);
      const ocurrencia = new Date(c.inicio.getFullYear(), c.inicio.getMonth(), dia);
      if (ocurrencia >= base && ocurrencia >= c.inicio && ocurrencia <= c.fin) {
        fechasPago.push(addDays(ocurrencia, diasCredito));
      }
    } else {
      fechasPago.push(addDays(posibleCorte, diasCredito));
    }

    return fechasPago.some(
      (fp) =>
        (isAfter(fp, c.inicio) || isEqual(fp, c.inicio)) &&
        (isBefore(fp, c.fin) || isEqual(fp, c.fin))
    );
  });

  if (gastosTarjeta.length === 0) return null;

  const totalGastosTarjeta = gastosTarjeta.reduce((s, g) => s + g.monto, 0);

  return (
    <div key={t.id} className="ms-2 mb-2">
      <div className="fw-semibold">
        {t.nombre + ' — Total: $' + totalGastosTarjeta.toFixed(2)}
      </div>
      {gastosTarjeta.map((g, idx) => {
        const uniqueId = `${t.id}-${idx}`;
        return (
          <div key={uniqueId} className="d-flex align-items-center ms-3">
            <input
              type="checkbox"
              className="form-check-input me-2"
              checked={Boolean(pagados[i] && pagados[i].includes(uniqueId))}
              onChange={() => togglePagado(i, uniqueId)}
            />
            <span
              style={
                pagados[i] && pagados[i].includes(uniqueId)
                  ? { textDecoration: 'line-through', color: 'green' }
                  : {}
              }
            >
              - ${g.monto.toFixed(2)} — {g.descripcion}
              {g.frecuenciaTipo === 'recurrente' && <em className="ms-1">Recurrente</em>}
            </span>
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
    </div>
  );
}