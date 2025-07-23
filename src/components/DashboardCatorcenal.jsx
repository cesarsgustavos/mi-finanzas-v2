import { useState, useEffect } from 'react';
import { format, addDays, isAfter, isBefore, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import CatorcenaChart from './CatorcenaChart';

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

function DashboardCatorcenal() {
  const [catorcenas, setCatorcenas] = useState([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [movimientos, setMovimientos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [columnaAbierta, setColumnaAbierta] = useState(null);

  const generarCatorcenas = () => {
    const inicioMap = {
      2025: new Date(2025, 0, 10),
      2026: new Date(2026, 0, 9),
      2027: new Date(2027, 0, 8),
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

  const enCatorcena = (m, inicio, fin) => {
    const fecha    = m.fecha ? parseISO(m.fecha) : null;
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
  
// Mover definición de calcularTotalTarjeta completa aquí
  const calcularTotalTarjeta = (t, inicio, fin) => {
    const gastos = (t.gastos || []).filter(g => {
      const base = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
      if (!base) return false;
      const corte = t.diaCorte;
      const diasCredito = t.diasCredito;
      const posibleCorte = new Date(base);
      posibleCorte.setDate(corte);
      if (base.getDate() > corte) posibleCorte.setMonth(posibleCorte.getMonth() + 1);

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
        (isBefore(fp, fin)   || isEqual(fp, fin))
      );
    });
    return gastos.reduce((s, g) => s + g.monto, 0);
  };

  // Sección exportar Excel y gráfica
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
    Gastos: -gastos,       // signo invertido
    Tarjetas: -tarjetasTotal, // signo invertido
  };
});

  const exportarExcel = () => {
const rows = chartData.map(r => ({
  Periodo: r.periodo,
  Ingresos: r.Ingresos,
  Gastos: r.Gastos,
  'Tarjetas (MSI/Crédito)': r.Tarjetas,
  Balance: r.Ingresos + r.Gastos + r.Tarjetas  // ahora suma, corrige el balance
}));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catorcenas');
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([data], { type: 'application/octet-stream' }), `dashboard_${anioSeleccionado}.xlsx`);
  };

  return (
    <div className="container-fluid px-0">
      <div className="mb-3 d-flex align-items-center">
        <button className="btn btn-sm btn-primary me-3" onClick={exportarExcel}>
          📥 Exportar a Excel
        </button>
        <label className="form-label fw-bold me-2">Selecciona año:</label>
        <select
          className="form-select w-auto"
          value={anioSeleccionado}
          onChange={e => setAnioSeleccionado(Number(e.target.value))}
        >
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>
      </div>

      <div className="mb-4">
        <CatorcenaChart data={chartData} />
      </div>

      <div className="dashboard-scroll" style={{ overflowX: 'auto', width: '100%' }}>
        <div className="d-flex flex-nowrap" style={{ minWidth: 'max-content' }}>
          {catorcenas.map((c, i) => {
            const ingresos = movimientos
              .filter(m => m.tipo === 'ingreso' && enCatorcena(m, c.inicio, c.fin))
              .sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));
            const gastos = movimientos
              .filter(m => m.tipo === 'gasto' && enCatorcena(m, c.inicio, c.fin))
              .sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));

            const ingresosTotal = ingresos.reduce((sum, m) => sum + calcularImporte(m), 0);
            const gastosTotal   = gastos.reduce((sum, m) => sum + calcularImporte(m), 0);

            const tarjetasTotal = tarjetas.reduce((sum, t) => {
              const gt = (t.gastos || []).filter(g => {
                const base = g.fecha
                  ? parseISO(g.fecha)
                  : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
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
                  (isBefore(fp, c.fin)   || isEqual(fp, c.fin))
                );
              });
              return sum + gt.reduce((s, g) => s + g.monto, 0);
            }, 0);

            const mostrar = columnaAbierta === i;
            const balance = ingresosTotal - gastosTotal - tarjetasTotal;

            return (
              <div key={i} className="border p-3 me-3 bg-light" style={{ minWidth: 300 }}>
                <h6 className="text-center">
                  {format(c.inicio, 'dd MMM', { locale: es })} – {format(c.fin, 'dd MMM', { locale: es })}
                </h6>

                <p className="text-success fw-bold small">+ Ingresos: ${ingresosTotal.toFixed(2)}</p>
                <p className="text-danger fw-bold small">- Gastos: ${gastosTotal.toFixed(2)}</p>
                <p className="text-warning fw-bold small">💳 Tarjetas: ${tarjetasTotal.toFixed(2)}</p>

                <p className={`fw-bold small ${balance >= 0 ? 'text-success' : 'text-danger'}`}>
                  Balance: ${balance.toFixed(2)}
                </p>

                <button
                  className="btn btn-sm btn-outline-secondary w-100"
                  onClick={() => setColumnaAbierta(mostrar ? null : i)}
                >
                  {mostrar ? 'Ocultar detalles' : 'Ver detalles'}
                </button>

                {mostrar && (
                  <div className="mt-2">
                    <strong className="d-block">🟩 Ingresos</strong>
                    <ul className="list-unstyled small">
                      {ingresos.map(m => (
                        <li key={m.id}>
                          + ${m.monto} — {m.descripcion}
                          {m.frecuenciaTipo === 'recurrente' && <span className="badge bg-secondary ms-1">Recurrente</span>}
                        </li>
                      ))}
                      {ingresos.length === 0 && <li className="text-muted">Sin ingresos</li>}
                    </ul>

                    <strong className="d-block mt-2">🟥 Gastos</strong>
                    <ul className="list-unstyled small">
                      {gastos.map(m => (
                        <li key={m.id}>
                          - ${m.monto} — {m.descripcion}
                          {m.frecuenciaTipo === 'recurrente' && <span className="badge bg-secondary ms-1">Recurrente</span>}
                        </li>
                      ))}
                      {gastos.length === 0 && <li className="text-muted">Sin gastos</li>}
                    </ul>

                    <strong className="d-block mt-2">💳 Tarjetas</strong>
                    <ul className="list-unstyled small">
                      {(tarjetas || []).map(t => {
                        const gastosTarjeta = (t.gastos || []).filter(g => {
                          // misma lógica que arriba...
                          const base = g.fecha
                            ? parseISO(g.fecha)
                            : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
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
                            (isBefore(fp, c.fin)   || isEqual(fp, c.fin))
                          );
                        });

                        if (gastosTarjeta.length === 0) return null;
                        return (
                          <li key={t.id}>
                            <strong>
                              {t.nombre} — Total: ${gastosTarjeta.reduce((s, g) => s + g.monto, 0).toFixed(2)}
                            </strong>
                            <ul className="list-unstyled ms-3">
                              {gastosTarjeta.map((g, idx) => (
                                <li key={idx}>
                                  - ${g.monto} — {g.descripcion}
                                  {g.frecuenciaTipo === 'recurrente' && <span className="badge bg-secondary ms-1">Recurrente</span>}
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                      {tarjetas.every(t => (t.gastos || []).length === 0) && (
                        <li className="text-muted">Sin cargos en tarjetas</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DashboardCatorcenal;
