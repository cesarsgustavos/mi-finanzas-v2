import { useState, useEffect } from 'react';
import { format, addDays, isAfter, isBefore, isEqual, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import CatorcenaChart from './CatorcenaChart';

/**
 * Utilidad para calcular el importe de un movimiento en función de su frecuencia.
 * Movimientos únicos devuelven el monto directamente. Los movimientos
 * diarios, semanales o catorcenales se escalan a la longitud de una
 * catorcena (14 días). Los mensuales se tratan como una única ocurrencia.
 *
 * @param {Object} m Movimiento de Firestore
 * @returns {number} Importe dentro de la catorcena
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
 * Calcula la cuota de pago para una compra con o sin MSI. Si el gasto
 * define un plan de meses sin intereses, el monto se divide entre el
 * número de meses; de lo contrario se devuelve el monto completo.
 *
 * @param {Object} g Gasto de tarjeta
 * @returns {number}
 */
function obtenerPagoTarjeta(g) {
  if (g.esMSI && g.mesesMSI) {
    const meses = Number(g.mesesMSI);
    return meses > 0 ? g.monto / meses : g.monto;
  }
  return g.monto;
}

/**
 * Dada la fecha de compra y la tarjeta, calcula la fecha de vencimiento del
 * pago. Si la compra se realiza después del día de corte, la fecha de corte
 * se mueve al siguiente mes. La fecha de vencimiento se obtiene sumando los
 * días de crédito.
 *
 * @param {Date} fechaCompra Fecha de la compra
 * @param {Object} tarjeta Tarjeta con diaCorte y diasCredito
 * @returns {Date}
 */
function calcularFechaVencimiento(fechaCompra, tarjeta) {
  const corte = new Date(fechaCompra);
  corte.setDate(tarjeta.diaCorte);
  if (fechaCompra.getDate() > tarjeta.diaCorte) {
    corte.setMonth(corte.getMonth() + 1);
  }
  return addDays(corte, tarjeta.diasCredito);
}

/**
 * Genera una lista de fechas de pago de un gasto de tarjeta que caen dentro
 * de una catorcena. Soporta MSI y gastos recurrentes en diferentes
 * frecuencias. Cada ocurrencia se considera una compra independiente para
 * efectos de pago.
 *
 * @param {Object} g Gasto
 * @param {Object} tarjeta Tarjeta con diaCorte y diasCredito
 * @param {Date} inicioCatorcena Inicio de la catorcena
 * @param {Date} finCatorcena Fin de la catorcena
 * @returns {Date[]}
 */
function obtenerFechasPagoEnCatorcena(g, tarjeta, inicioCatorcena, finCatorcena) {
  const fechas = [];
  const fechaBase = g.fecha ? parseISO(g.fecha) : (g.fechaInicio ? parseISO(g.fechaInicio) : null);
  if (!fechaBase) return fechas;
  // MSI: generar pagos mensuales
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
  const esRecurrente = g.frecuenciaTipo === 'recurrente' || (g.frecuencia && g.frecuencia !== 'único');
  if (esRecurrente) {
    switch (g.frecuencia) {
      case 'diario': {
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
        const diasMap = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, jueves: 4, viernes: 5, sábado: 6 };
        const targetDay = diasMap[(g.diaSemana || '').toLowerCase()];
        if (targetDay === undefined) {
          const vencimiento = calcularFechaVencimiento(fechaBase, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            fechas.push(vencimiento);
          }
        } else {
          let current = new Date(fechaBase);
          while (current.getDay() !== targetDay) {
            current.setDate(current.getDate() + 1);
          }
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
        let d = new Date(fechaBase);
        while (d <= finCatorcena) {
          const vencimiento = calcularFechaVencimiento(d, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            fechas.push(new Date(vencimiento));
          }
          d.setDate(d.getDate() + 14);
        }
        break;
      }
      case 'mensual': {
        const dia = g.diaMes ? parseInt(g.diaMes, 10) : fechaBase.getDate();
        let occ = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), dia);
        if (occ < fechaBase) {
          occ.setMonth(occ.getMonth() + 1);
        }
        while (occ <= finCatorcena) {
          const vencimiento = calcularFechaVencimiento(occ, tarjeta);
          if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
              (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
            if (occ >= fechaBase) {
              fechas.push(new Date(vencimiento));
            }
          }
          occ.setMonth(occ.getMonth() + 1);
        }
        break;
      }
      default: {
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
  const vencimiento = calcularFechaVencimiento(fechaBase, tarjeta);
  if ((isAfter(vencimiento, inicioCatorcena) || isEqual(vencimiento, inicioCatorcena)) &&
      (isBefore(vencimiento, finCatorcena) || isEqual(vencimiento, finCatorcena))) {
    fechas.push(vencimiento);
  }
  return fechas;
}

/**
 * Comprueba si un movimiento pertenece a una catorcena concreta. Los
 * movimientos recurrentes se evalúan según su frecuencia y fecha de inicio.
 *
 * @param {Object} m Movimiento
 * @param {Date} inicio Inicio de catorcena
 * @param {Date} fin Fin de catorcena
 * @returns {boolean}
 */
function enCatorcena(m, inicio, fin) {
  const fecha = m.fecha ? parseISO(m.fecha) : null;
  const fechaIni = m.fechaInicio ? parseISO(m.fechaInicio) : new Date(0);
  if (m.frecuenciaTipo === 'único' && fecha) {
    return (isAfter(fecha, inicio) || isEqual(fecha, inicio)) && (isBefore(fecha, fin) || isEqual(fecha, fin));
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
}

/**
 * Suma el total adeudado de una tarjeta dentro de una catorcena. Para cada
 * gasto se generan las fechas de pago dentro del periodo y se multiplica
 * por la cuota correspondiente.
 *
 * @param {Object} t Tarjeta
 * @param {Date} inicio Inicio de catorcena
 * @param {Date} fin Fin de catorcena
 * @returns {number}
 */
function calcularTotalTarjeta(t, inicio, fin) {
  return (t.gastos || []).reduce((sum, g) => {
    const pagos = obtenerFechasPagoEnCatorcena(g, t, inicio, fin);
    return sum + pagos.length * obtenerPagoTarjeta(g);
  }, 0);
}

/**
 * Componente principal del Dashboard Catorcenal. Presenta un tablero
 * interactivo con tarjetas compactas para cada catorcena. Cada tarjeta
 * incluye un gráfico tipo pastel que resume la proporción entre ingresos,
 * gastos y cargos de tarjetas. Al expandirse se muestran los detalles en
 * columnas separadas.
 */
export default function DashboardCatorcenal() {
  const [catorcenas, setCatorcenas] = useState([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [movimientos, setMovimientos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [columnaAbierta, setColumnaAbierta] = useState(null);
  const [pagados, setPagados] = useState({});

  // Establecer el título de la pestaña del navegador al montar el componente
  useEffect(() => {
    document.title = 'MIS FINANZAS';
  }, []);

  // Generar catorcenas según el año seleccionado
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

  // Cargar movimientos y tarjetas cuando cambia el año
  useEffect(() => {
    generarCatorcenas();
    const cargarDatos = async () => {
      const movSnap = await getDocs(collection(db, 'movimientos'));
      setMovimientos(movSnap.docs.map(docu => ({ id: docu.id, ...docu.data() })));
      const tarSnap = await getDocs(collection(db, 'tarjetas'));
      setTarjetas(tarSnap.docs.map(docu => ({ id: docu.id, ...docu.data() })));
    };
    cargarDatos();
  }, [anioSeleccionado]);

  // Cargar pagos marcados una vez
  useEffect(() => {
    const cargarPagados = async () => {
      const snap = await getDocs(collection(db, 'pagosMarcados'));
      const data = {};
      snap.forEach(docu => {
        const { catorcenaIndex, movimientoId } = docu.data();
        if (!data[catorcenaIndex]) data[catorcenaIndex] = [];
        data[catorcenaIndex].push(movimientoId);
      });
      setPagados(data);
    };
    cargarPagados();
  }, []);

  // Cambiar estado de pagado y persistir en Firestore
  const togglePagado = async (index, id) => {
    setPagados(prev => {
      const current = prev[index] || [];
      const yaMarcado = current.includes(id);
      const nuevoEstado = yaMarcado ? current.filter(item => item !== id) : [...current, id];
      const docRef = doc(db, 'pagosMarcados', `${index}_${id}`);
      if (yaMarcado) {
        deleteDoc(docRef);
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

  // Preparar datos para la gráfica de barras general
  const chartData = catorcenas.map(c => {
    const ingresos = movimientos.filter(m => m.tipo === 'ingreso' && enCatorcena(m, c.inicio, c.fin)).reduce((sum, m) => sum + calcularImporte(m), 0);
    const gastos = movimientos.filter(m => m.tipo === 'gasto' && enCatorcena(m, c.inicio, c.fin)).reduce((sum, m) => sum + calcularImporte(m), 0);
    const tarjetasTotal = tarjetas.reduce((sum, t) => sum + calcularTotalTarjeta(t, c.inicio, c.fin), 0);
    return {
      periodo: `${format(c.inicio, 'dd MMM')} - ${format(c.fin, 'dd MMM')}`,
      Ingresos: ingresos,
      Gastos: -gastos,
      Tarjetas: -tarjetasTotal
    };
  });

  // Exportar a Excel
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
      {/* Controles superiores: exportar y seleccionar año */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-primary" onClick={exportarExcel}>Exportar a Excel</button>
        <div>
          <label className="me-2">Selecciona año:</label>
          <select
            value={anioSeleccionado}
            onChange={e => setAnioSeleccionado(Number(e.target.value))}
            className="form-select d-inline-block w-auto"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
      </div>

      {/* Listado de catorcenas */}
      {catorcenas.map((c, i) => {
        const ingresos = movimientos.filter(m => m.tipo === 'ingreso' && enCatorcena(m, c.inicio, c.fin)).sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));
        const gastos = movimientos.filter(m => m.tipo === 'gasto' && enCatorcena(m, c.inicio, c.fin)).sort((a, b) => new Date(a.fecha || a.fechaInicio) - new Date(b.fecha || b.fechaInicio));
        const tarjetasTotal = tarjetas.reduce((sum, t) => sum + calcularTotalTarjeta(t, c.inicio, c.fin), 0);
        const ingresosTotal = ingresos.reduce((sum, m) => sum + calcularImporte(m), 0);
        const gastosTotal = gastos.reduce((sum, m) => sum + calcularImporte(m), 0);
        const balance = ingresosTotal - gastosTotal - tarjetasTotal;
        const mostrar = columnaAbierta === i;
        // Calcular porcentajes para el gráfico de pastel
        const totalPie = ingresosTotal + gastosTotal + tarjetasTotal;
        const ingresosPerc = totalPie > 0 ? (ingresosTotal / totalPie) * 100 : 0;
        const gastosPerc = totalPie > 0 ? (gastosTotal / totalPie) * 100 : 0;
        const tarjetasPerc = totalPie > 0 ? (tarjetasTotal / totalPie) * 100 : 0;
        const stop1 = ingresosPerc;
        const stop2 = ingresosPerc + gastosPerc;
        const pieStyle = {
          width: '70px',
          height: '70px',
          borderRadius: '50%',
          background: `conic-gradient(#198754 0% ${stop1}%, #dc3545 ${stop1}% ${stop2}%, #ffc107 ${stop2}% 100%)`
        };
        // Preparar lista de cargos de tarjeta para esta catorcena
        const tarjetasDetalles = tarjetas.map(t => {
          const gastosTarjeta = [];
          (t.gastos || []).forEach((g, gIdx) => {
            const pagos = obtenerFechasPagoEnCatorcena(g, t, c.inicio, c.fin);
            pagos.forEach((_, pagoIdx) => {
              gastosTarjeta.push({ gasto: g, tId: t.id, gIdx, pagoIdx });
            });
          });
          const totalGastosTarjeta = gastosTarjeta.reduce((s, item) => s + obtenerPagoTarjeta(item.gasto), 0);
          return { tarjeta: t, gastos: gastosTarjeta, total: totalGastosTarjeta };
        }).filter(item => item.gastos.length > 0);
        return (
          <div key={i} className="card shadow-sm mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div className="mb-2" style={{ minWidth: '150px' }}>
                  <h6 className="fw-bold mb-0">{format(c.inicio, 'dd MMM', { locale: es })} – {format(c.fin, 'dd MMM', { locale: es })}</h6>
                  <small className={balance >= 0 ? 'text-success' : 'text-danger'}>
                    Balance: ${balance.toFixed(2)}
                  </small>
                </div>
                <div className="d-flex align-items-center mb-2">
                  <div className="text-success me-3">+ ${ingresosTotal.toFixed(2)}</div>
                  <div className="text-danger me-3">- ${gastosTotal.toFixed(2)}</div>
                  <div className="text-warning me-3">${tarjetasTotal.toFixed(2)}</div>
                </div>
                <div className="d-flex align-items-center mb-2">
                  <div style={pieStyle}></div>
                  <div className="ms-3 small">
                    <div><span className="badge bg-success me-1">&nbsp;</span>Ingresos</div>
                    <div><span className="badge bg-danger me-1">&nbsp;</span>Gastos</div>
                    <div><span className="badge bg-warning text-dark me-1">&nbsp;</span>Tarjetas</div>
                  </div>
                </div>
                <button className="btn btn-link ms-auto" onClick={() => setColumnaAbierta(mostrar ? null : i)}>
                  {mostrar ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
              </div>
              {mostrar && (
                <div className="mt-3">
                  <div className="row">
                    {/* Columna de ingresos */}
                    <div className="col-md-4 mb-3">
                      <h6 className="text-success">Ingresos</h6>
                      {ingresos.length === 0 && <div className="text-muted">Sin ingresos</div>}
                      {ingresos.map(m => (
                        <div key={m.id} className="d-flex align-items-center mb-1">
                          <span className="me-2">+ ${calcularImporte(m).toFixed(2)}</span>
                          <span>{m.descripcion}</span>
                          {m.frecuenciaTipo === 'recurrente' && <span className="badge bg-info ms-2">Recurrente</span>}
                        </div>
                      ))}
                    </div>
                    {/* Columna de gastos */}
                    <div className="col-md-4 mb-3">
                      <h6 className="text-danger">Gastos</h6>
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
                    </div>
                    {/* Columna de tarjetas */}
                    <div className="col-md-4 mb-3">
                      <h6 className="text-warning">Tarjetas</h6>
                      {tarjetasDetalles.length === 0 && <div className="text-muted">Sin cargos en tarjetas</div>}
                      {tarjetasDetalles.map(item => (
                        <div key={item.tarjeta.id} className="mb-2 p-2 border rounded">
                          <div className="fw-semibold mb-1">{item.tarjeta.nombre} — Total: ${item.total.toFixed(2)}</div>
                          {item.gastos.map(det => {
                            const uid = `${det.tId}-${det.gIdx}-${det.pagoIdx}`;
                            const g = det.gasto;
                            return (
                              <div key={uid} className="d-flex align-items-center mb-1">
                                <input
                                  type="checkbox"
                                  className="form-check-input me-2"
                                  checked={pagados[i]?.includes(uid) || false}
                                  onChange={() => togglePagado(i, uid)}
                                />
                                <span className="me-2">- ${obtenerPagoTarjeta(g).toFixed(2)}</span>
                                <span style={{ textDecoration: pagados[i]?.includes(uid) ? 'line-through' : 'none', color: pagados[i]?.includes(uid) ? 'green' : 'inherit' }}>
                                  {g.descripcion}
                                </span>
                                {(g.frecuenciaTipo === 'recurrente' || (g.frecuencia && g.frecuencia !== 'único')) && (
                                  <span className="badge bg-info ms-2">Recurrente</span>
                                )}
                                {g.esMSI && g.mesesMSI && <span className="badge bg-warning text-dark ms-2">{g.mesesMSI} MSI</span>}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* Gráfica de barras comparativa al final */}
      <div className="mt-4">
        <CatorcenaChart data={chartData} />
      </div>
    </>
  );
}