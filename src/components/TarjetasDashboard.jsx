import { useState, useEffect } from 'react';
import { format, parseISO, isAfter, isBefore, isEqual } from 'date-fns';
import { db } from '../services/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

/**
 * Componente para gestionar tarjetas de crédito en el dashboard.
 *
 * Este componente permite registrar nuevas tarjetas y gestionar los gastos
 * asociados a cada una de ellas. Se ha mejorado el aspecto visual al utilizar
 * tarjetas de Bootstrap y se han eliminado los espacios en blanco que quedaban
 * cuando ciertos campos se ocultaban. Asimismo, se corrigió el cálculo de
 * los montos dentro del ciclo de corte para considerar correctamente las
 * compras a meses sin intereses (MSI), sumando únicamente la cuota mensual
 * correspondiente en lugar del total de la deuda.
 */
function TarjetasDashboard() {
  // Estado para el formulario de creación de tarjetas
  const [formTarjeta, setFormTarjeta] = useState({ nombre: '', diaCorte: '', diasCredito: '', limiteCredito: '' });
  // Lista de tarjetas cargadas desde Firebase
  const [tarjetas, setTarjetas] = useState([]);
  // Controla el tipo de gasto seleccionado por tarjeta (único o recurrente)
  const [tipoGastoSeleccionado, setTipoGastoSeleccionado] = useState({});
  // Controla la frecuencia seleccionada para gastos recurrentes
  const [frecuenciaSeleccionada, setFrecuenciaSeleccionada] = useState({});
  // Indica si se muestran o no los gastos históricos en las tarjetas
  const [mostrarHistoricos, setMostrarHistoricos] = useState(false);
  // Controla si el checkbox de MSI está activado para cada tarjeta; esto nos
  // permite mostrar u ocultar el campo de número de meses sin dejar espacio
  const [esMSISeleccionado, setEsMSISeleccionado] = useState({});

  // Carga inicial de las tarjetas desde Firebase
  useEffect(() => {
    const fetchTarjetas = async () => {
      const snapshot = await getDocs(collection(db, 'tarjetas'));
      const tarjetasData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTarjetas(tarjetasData);
    };
    fetchTarjetas();
  }, []);

  /**
   * Maneja el cambio en el formulario de creación de tarjeta.
   */
  const handleTarjetaChange = e => {
    const { name, value } = e.target;
    setFormTarjeta(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Maneja el envío del formulario de creación de tarjeta. Guarda la tarjeta
   * en Firebase y actualiza el estado local.
   */
  const handleTarjetaSubmit = async e => {
    e.preventDefault();
    const nueva = {
      ...formTarjeta,
      diaCorte: parseInt(formTarjeta.diaCorte, 10),
      diasCredito: parseInt(formTarjeta.diasCredito, 10),
      limiteCredito: parseFloat(formTarjeta.limiteCredito),
      gastos: []
    };
    try {
      const docRef = await addDoc(collection(db, 'tarjetas'), nueva);
      setTarjetas(prev => [...prev, { ...nueva, id: docRef.id }]);
      setFormTarjeta({ nombre: '', diaCorte: '', diasCredito: '', limiteCredito: '' });
    } catch (error) {
      console.error('Error al guardar tarjeta:', error);
      alert('Error al guardar en Firebase');
    }
  };

  /**
   * Calcula el rango de fechas del ciclo de corte a partir del día de corte.
   */
  const calcularRangoCorte = diaCorte => {
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    let inicio, fin;
    if (diaHoy > diaCorte) {
      inicio = new Date(hoy.getFullYear(), hoy.getMonth(), diaCorte + 1);
      fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaCorte);
    } else {
      inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, diaCorte + 1);
      fin = new Date(hoy.getFullYear(), hoy.getMonth(), diaCorte);
    }
    return { inicio, fin };
  };

  /**
   * Determina si una fecha (en formato ISO) se encuentra dentro de un rango.
   */
  const estaEnRango = (fechaStr, inicio, fin) => {
    if (!fechaStr) return false;
    const f = parseISO(fechaStr);
    return (isAfter(f, inicio) || isEqual(f, inicio)) && (isBefore(f, fin) || isEqual(f, fin));
  };

  /**
   * Calcula el total de gastos dentro del ciclo de corte para una tarjeta.
   * Se ha corregido el cálculo para tomar en cuenta las compras a meses sin
   * intereses: en lugar de sumar el total de la compra en el mes en que
   * ocurrió, se suma únicamente la mensualidad correspondiente (monto / meses).
   */
  const calcularTotalEnCiclo = (gastos, inicio, fin) => {
    return gastos.reduce((sum, g) => {
      // Si la serie inicia después del ciclo, ignorar
      const inicioSerie = g.fechaInicio ? parseISO(g.fechaInicio) : null;
      if (inicioSerie && inicioSerie > fin) return sum;

      // Gasto único
      if (g.tipo === 'unico') {
        if (estaEnRango(g.fecha, inicio, fin)) {
          return sum + g.monto;
        }
        return sum;
      }

      // Compras a MSI: sumar solamente la cuota mensual cuando corresponda
      if (g.esMSI && g.mesesMSI && g.fecha) {
        let base;
        try {
          base = parseISO(g.fecha);
          if (isNaN(base)) return sum;
        } catch {
          return sum;
        }
        const cuotaMensual = g.monto / g.mesesMSI;
        let totalMSI = 0;
        for (let i = 0; i < g.mesesMSI; i++) {
          const cuota = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
          // Si existe inicioSerie y la cuota cae antes del inicio de la serie, saltar
          if (inicioSerie && cuota < inicioSerie) continue;
          if (estaEnRango(cuota.toISOString(), inicio, fin)) {
            totalMSI += cuotaMensual;
          }
        }
        return sum + totalMSI;
      }

      // Recurrente mensual: sumar si la ocurrencia de este mes cae en rango
      if (g.frecuencia === 'mensual' && g.diaMes) {
        const mensual = new Date(inicio.getFullYear(), inicio.getMonth(), parseInt(g.diaMes, 10));
        if (inicioSerie && mensual < inicioSerie) return sum;
        if (mensual >= inicio && mensual <= fin) {
          return sum + g.monto;
        }
        return sum;
      }

      // Recurrente semanal, catorcenal o diario
      if (['semanal', 'catorcenal', 'diario'].includes(g.frecuencia)) {
        if (!g.fechaInicio) {
          // Si no hay fecha de inicio se considera activo y se suma el monto
          return sum + g.monto;
        }
        // Si la fecha de inicio es anterior al fin del ciclo, se suma el monto
        if (parseISO(g.fechaInicio) <= fin) {
          return sum + g.monto;
        }
        return sum;
      }

      // Caso por defecto: no sumar
      return sum;
    }, 0);
  };

  /**
   * Maneja el envío del formulario de creación de gastos para una tarjeta.
   * Guarda el gasto en la tarjeta correspondiente y actualiza Firebase.
   */
  const handleGastoSubmit = async (index, e) => {
    e.preventDefault();
    const form = e.target;
    const tipo = form.tipo.value;
    const esMSI = form.esMSI.checked;
    const mesesMSI = form.mesesMSI?.value || null;
    let frecuencia = form.frecuencia?.value || null;
    // Las compras a MSI se consideran de frecuencia mensual
    if (esMSI && mesesMSI) frecuencia = 'mensual';
    if (tipo === 'unico' && !form.fecha.value) { alert('Debes ingresar una fecha para un gasto único.'); return; }

    const gasto = {
      descripcion: form.descripcion.value,
      monto: parseFloat(form.monto.value),
      tipo: esMSI ? 'recurrente' : tipo,
      fecha: form.fecha?.value || null,
      frecuencia,
      diaMes: form.diaMes?.value || null,
      diaSemana: form.diaSemana?.value || null,
      esMSI,
      mesesMSI,
      fechaInicio: form.fechaInicio?.value || null
    };

    const copia = [...tarjetas];
    copia[index].gastos.push(gasto);
    setTarjetas(copia);
    form.reset();
    // Restablecer selectores y estados para este índice
    setTipoGastoSeleccionado(prev => ({ ...prev, [index]: 'unico' }));
    setFrecuenciaSeleccionada(prev => ({ ...prev, [index]: '' }));
    setEsMSISeleccionado(prev => ({ ...prev, [index]: false }));

    try {
      const ref = doc(db, 'tarjetas', copia[index].id);
      await updateDoc(ref, { gastos: copia[index].gastos });
    } catch (error) {
      console.error('Error actualizando gastos en Firebase:', error);
    }
  };

  /**
   * Elimina un gasto de una tarjeta en base a su índice.
   */
  const handleEliminarGasto = async (indexTarjeta, indexGasto) => {
    if (!window.confirm('¿Deseas eliminar este gasto?')) return;
    const copia = [...tarjetas];
    copia[indexTarjeta].gastos.splice(indexGasto, 1);
    setTarjetas(copia);
    try {
      const ref = doc(db, 'tarjetas', copia[indexTarjeta].id);
      await updateDoc(ref, { gastos: copia[indexTarjeta].gastos });
    } catch (error) {
      console.error('Error actualizando Firebase tras eliminar gasto:', error);
    }
  };

  /**
   * Elimina completamente una tarjeta y sus gastos.
   */
  const handleEliminarTarjeta = async index => {
    if (!window.confirm('¿Estás seguro de eliminar esta tarjeta y todos sus gastos?')) return;
    const copia = [...tarjetas];
    const [tarjeta] = copia.splice(index, 1);
    setTarjetas(copia);
    try {
      await deleteDoc(doc(db, 'tarjetas', tarjeta.id));
    } catch (error) {
      console.error('Error al eliminar tarjeta en Firebase:', error);
    }
  };

  /**
   * Permite editar los datos básicos de una tarjeta (nombre, corte, crédito, límite).
   */
  const handleEditarTarjeta = async index => {
    const tarjeta = tarjetas[index];
    const nuevoNombre = prompt('Nuevo nombre de tarjeta:', tarjeta.nombre);
    const nuevoDiaCorte = prompt('Nuevo día de corte:', tarjeta.diaCorte);
    const nuevosDiasCredito = prompt('Nuevos días de crédito:', tarjeta.diasCredito);
    const nuevoLimite = prompt('Nuevo límite de crédito:', tarjeta.limiteCredito);
    if (!nuevoNombre || !nuevoDiaCorte || !nuevosDiasCredito || !nuevoLimite) {
      alert('Todos los campos son obligatorios para editar.');
      return;
    }
    const copia = [...tarjetas];
    copia[index] = {
      ...tarjeta,
      nombre: nuevoNombre,
      diaCorte: parseInt(nuevoDiaCorte, 10),
      diasCredito: parseInt(nuevosDiasCredito, 10),
      limiteCredito: parseFloat(nuevoLimite)
    };
    setTarjetas(copia);
    try {
      const ref = doc(db, 'tarjetas', tarjeta.id);
      await updateDoc(ref, {
        nombre: nuevoNombre,
        diaCorte: parseInt(nuevoDiaCorte, 10),
        diasCredito: parseInt(nuevosDiasCredito, 10),
        limiteCredito: parseFloat(nuevoLimite)
      });
    } catch (error) {
      console.error('Error al actualizar la tarjeta en Firebase:', error);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Registrar nueva tarjeta</h4>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setMostrarHistoricos(!mostrarHistoricos)}>
          {mostrarHistoricos ? 'Ocultar históricos' : 'Ver históricos'}
        </button>
      </div>

      <form onSubmit={handleTarjetaSubmit} className="border rounded p-3 mb-4 bg-white shadow-sm">
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Nombre</label>
            <input type="text" name="nombre" className="form-control" value={formTarjeta.nombre} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Día de corte</label>
            <input type="number" name="diaCorte" className="form-control" value={formTarjeta.diaCorte} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Días de crédito</label>
            <input type="number" name="diasCredito" className="form-control" value={formTarjeta.diasCredito} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Límite de crédito</label>
            <input type="number" name="limiteCredito" className="form-control" value={formTarjeta.limiteCredito} onChange={handleTarjetaChange} />
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary w-100">Guardar tarjeta</button>
          </div>
        </div>
      </form>

      <h5>Tarjetas registradas</h5>
      {tarjetas.length === 0 ? (
        <p className="text-muted">Aún no has registrado tarjetas.</p>
      ) : (
        <div className="row g-4">
          {tarjetas.map((t, i) => {
            const { inicio, fin } = calcularRangoCorte(t.diaCorte);
            const totalCiclo = calcularTotalEnCiclo(t.gastos, inicio, fin);
            return (
              <div key={i} className="col-md-6">
                <div className="card shadow-sm h-100">
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0">{t.nombre}</h6>
                      <div className="btn-group" role="group">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleEditarTarjeta(i)}>Editar</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleEliminarTarjeta(i)}>Eliminar</button>
                      </div>
                    </div>
                    <p className="small mb-1">Corte: día {t.diaCorte} | Crédito: {t.diasCredito} días</p>
                    <p className="small mb-1">Límite: ${t.limiteCredito.toFixed(2)}</p>
                    <p className="text-success small">Ciclo actual: {format(inicio,'dd MMM yyyy')} - {format(fin,'dd MMM yyyy')}</p>
                    <p className="fw-bold text-danger">Total en este ciclo: ${totalCiclo.toFixed(2)}</p>

                    <form onSubmit={e => handleGastoSubmit(i, e)} className="mb-3 border-top pt-3 mt-auto">
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <input name="descripcion" className="form-control" placeholder="Descripción" required />
                        </div>
                        <div className="col-3">
                          <input name="monto" type="number" className="form-control" placeholder="Monto" required />
                        </div>
                        <div className="col-3">
                          <select name="tipo" className="form-select" onChange={e => setTipoGastoSeleccionado(prev => ({ ...prev, [i]: e.target.value }))} defaultValue={tipoGastoSeleccionado[i] || 'unico'}>
                            <option value="unico">Único</option>
                            <option value="recurrente">Recurrente</option>
                          </select>
                        </div>
                      </div>
                      {/* Fecha para gasto único */}
                      {(!tipoGastoSeleccionado[i] || tipoGastoSeleccionado[i] === 'unico') && (
                        <input name="fecha" type="date" className="form-control mb-2" />
                      )}
                      {/* Controles para gasto recurrente */}
                      {tipoGastoSeleccionado[i] === 'recurrente' && (
                        <>
                          <select name="frecuencia" className="form-select mb-2" onChange={e => setFrecuenciaSeleccionada(prev => ({ ...prev, [i]: e.target.value }))} defaultValue={frecuenciaSeleccionada[i] || ''}>
                            <option value="">Selecciona frecuencia</option>
                            <option value="mensual">Mensual</option>
                            <option value="semanal">Semanal</option>
                            <option value="catorcenal">Catorcenal</option>
                            <option value="diario">Diario</option>
                          </select>
                          {frecuenciaSeleccionada[i] === 'mensual' && (
                            <input name="diaMes" type="number" className="form-control mb-2" placeholder="Día del mes" />
                          )}
                          {frecuenciaSeleccionada[i] === 'semanal' && (
                            <select name="diaSemana" className="form-select mb-2">
                              <option value="">Día de la semana</option>
                              <option value="lunes">Lunes</option>
                              <option value="martes">Martes</option>
                              <option value="miércoles">Miércoles</option>
                              <option value="jueves">Jueves</option>
                              <option value="viernes">Viernes</option>
                              <option value="sábado">Sábado</option>
                              <option value="domingo">Domingo</option>
                            </select>
                          )}
                          {/* Fecha de inicio para recurrentes/MSI */}
                          <input name="fechaInicio" type="date" className="form-control mb-2" placeholder="Fecha inicio" />
                        </>
                      )}
                      {/* Controles para MSI */}
                      <div className="row g-2 mb-2 align-items-center">
                        <div className="col-auto d-flex align-items-center">
                          <input name="esMSI" type="checkbox" className="form-check-input" id={`msi-${i}`} onChange={e => setEsMSISeleccionado(prev => ({ ...prev, [i]: e.target.checked }))} />
                          <label htmlFor={`msi-${i}`} className="form-check-label ms-2">¿MSI?</label>
                        </div>
                        {esMSISeleccionado[i] && (
                          <div className="col-4">
                            <input name="mesesMSI" type="number" className="form-control" placeholder="# meses" />
                          </div>
                        )}
                      </div>
                      <button type="submit" className="btn btn-outline-primary w-100 btn-sm">Agregar gasto</button>
                    </form>

                    {/* Lista de gastos */}
                    <ul className="list-group small mt-3">
                      {t.gastos
                        .filter(g => mostrarHistoricos || g.tipo === 'recurrente' || (g.fecha && estaEnRango(g.fecha, inicio, fin)))
                        .map((g, j) => (
                          <li key={j} className="list-group-item d-flex justify-content-between align-items-start">
                            <div>
                              <strong>{g.descripcion}</strong> — ${g.monto.toFixed(2)}<br />
                              <small>
                                {g.tipo === 'unico'
                                  ? `Único • Fecha: ${g.fecha}`
                                  : `Recurrente • ${g.frecuencia} ${(g.diaMes || g.diaSemana) || ''}`}
                                {g.esMSI && g.mesesMSI && ` • ${g.mesesMSI} MSI`}
                                {g.fechaInicio && ` • Inicio: ${g.fechaInicio}`}
                              </small>
                            </div>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleEliminarGasto(i, j)}>
                              🗑
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TarjetasDashboard;