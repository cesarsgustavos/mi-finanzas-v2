import { useState, useEffect } from 'react';
import MovementForm from './MovementForm';
import { FaUtensils, FaHome, FaBus, FaHeartbeat, FaWallet, FaEdit, FaTrash } from 'react-icons/fa';
import { getDocs, collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Dashboard para la captura y visualización de movimientos (ingresos y gastos).
 *
 * Este componente presenta un formulario de registro/edición de movimientos,
 * filtros básicos por fecha y tipo de recurrencia, y un resumen visual de
 * gastos e ingresos. La presentación se ha mejorado utilizando tarjetas
 * coloreadas para cada categoría (gastos e ingresos), mostrando los totales
 * correspondientes y listando los movimientos en una lista estilizada.
 */
const iconosCategorias = {
  Alimentos: <FaUtensils />, 
  Vivienda: <FaHome />, 
  Transporte: <FaBus />, 
  Salud: <FaHeartbeat />, 
  Otros: <FaWallet />
};

function CapturaDashboard() {
  const [movimientos, setMovimientos] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [indiceEdicion, setIndiceEdicion] = useState(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroTipoRecurrencia, setFiltroTipoRecurrencia] = useState('todos');

  // Cargar movimientos desde Firebase al montar el componente
  useEffect(() => {
    async function cargarMovimientos() {
      try {
        const snapshot = await getDocs(collection(db, 'movimientos'));
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMovimientos(docs);
      } catch (error) {
        console.error('Error al cargar movimientos:', error);
      }
    }
    cargarMovimientos();
  }, []);

  /**
   * Agrega un nuevo movimiento o actualiza uno existente.
   */
  const agregarMovimiento = async nuevo => {
    const movConFecha = {
      ...nuevo,
      ...(nuevo.frecuenciaTipo === 'recurrente' && { fechaInicio })
    };
    if (modoEdicion && indiceEdicion !== null) {
      const copia = [...movimientos];
      const id = copia[indiceEdicion].id;
      copia[indiceEdicion] = { ...movConFecha, id };
      setMovimientos(copia);
      setModoEdicion(false);
      setIndiceEdicion(null);
      try {
        await updateDoc(doc(db, 'movimientos', id), movConFecha);
      } catch (error) {
        console.error('Error al actualizar movimiento:', error);
      }
    } else {
      try {
        const docRef = await addDoc(collection(db, 'movimientos'), movConFecha);
        setMovimientos([...movimientos, { ...movConFecha, id: docRef.id }]);
      } catch (error) {
        console.error('Error al guardar movimiento:', error);
      }
    }
  };

  /**
   * Elimina un movimiento de la lista y de Firebase.
   */
  const eliminarMovimiento = async id => {
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    setMovimientos(movimientos.filter(m => m.id !== id));
    try {
      await deleteDoc(doc(db, 'movimientos', id));
    } catch (error) {
      console.error('Error al eliminar movimiento:', error);
    }
  };

  /**
   * Prepara un movimiento para su edición.
   */
  const editarMovimiento = id => {
    const idx = movimientos.findIndex(m => m.id === id);
    if (idx !== -1) {
      const mov = movimientos[idx];
      setModoEdicion(true);
      setIndiceEdicion(idx);
      if (mov.frecuenciaTipo === 'recurrente') {
        setFechaInicio(mov.fechaInicio || '');
      }
    }
  };

  /**
   * Construye una cadena de detalles para mostrar la recurrencia del movimiento.
   */
  const renderDetallesFrecuencia = mov => {
    if (mov.frecuenciaTipo === 'único') return `📅 ${mov.fecha}`;
    let detalle = '';
    switch (mov.frecuencia) {
      case 'mensual': detalle = `🗓️ Mensual, día ${mov.diaMes}`; break;
      case 'semanal': detalle = `📆 Semanal, ${mov.diaSemana}`; break;
      case 'catorcenal': detalle = '🔁 Catorcenal'; break;
      case 'diario': detalle = '📅 Diario'; break;
    }
    if (mov.frecuenciaTipo === 'recurrente' && mov.fechaInicio) {
      detalle += ` — Inicio: ${mov.fechaInicio}`;
    }
    return detalle;
  };

  const movimientoEnEdicion = modoEdicion ? movimientos[indiceEdicion] : null;

  /**
   * Aplica filtros a una lista de movimientos en función del tipo, fecha
   * de inicio y fecha de fin.
   */
  const filtrarMovimientos = lista => {
    return lista.filter(m => {
      if (filtroTipoRecurrencia !== 'todos' && m.frecuenciaTipo !== filtroTipoRecurrencia) return false;
      const fechaValor = m.frecuenciaTipo === 'único' ? m.fecha : m.fechaInicio;
      if (filtroFechaInicio && fechaValor < filtroFechaInicio) return false;
      if (filtroFechaFin && fechaValor > filtroFechaFin) return false;
      return true;
    });
  };

  // Listas filtradas de gastos e ingresos
  const gastos = filtrarMovimientos(movimientos.filter(m => m.tipo === 'gasto'));
  const ingresos = filtrarMovimientos(movimientos.filter(m => m.tipo === 'ingreso'));

  // Totales para cada categoría
  const totalGastos = gastos.reduce((sum, m) => sum + m.monto, 0);
  const totalIngresos = ingresos.reduce((sum, m) => sum + m.monto, 0);

  return (
    <div className="p-4">
      <h5>{modoEdicion ? 'Editar movimiento' : 'Registrar movimiento'}</h5>
      <div className="mb-4">
        <MovementForm
          onAdd={agregarMovimiento}
          movimientoEditar={movimientoEnEdicion}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
        />
      </div>

      {/* Filtros */}
      <div className="mb-4 border p-3 rounded bg-light">
        <h6>Filtros</h6>
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label">Fecha inicio</label>
            <input
              type="date"
              className="form-control"
              value={filtroFechaInicio}
              onChange={e => setFiltroFechaInicio(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Fecha fin</label>
            <input
              type="date"
              className="form-control"
              value={filtroFechaFin}
              onChange={e => setFiltroFechaFin(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tipo</label>
            <select
              className="form-select"
              value={filtroTipoRecurrencia}
              onChange={e => setFiltroTipoRecurrencia(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="único">Únicos</option>
              <option value="recurrente">Recurrentes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Resumen de gastos e ingresos */}
      <div className="row g-4">
        {/* Gastos */}
        <div className="col-md-6">
          <div className="card border-danger h-100">
            <div className="card-header bg-danger text-white d-flex justify-content-between align-items-center">
              <span>🟥 Gastos</span>
              <span>Total: ${totalGastos.toFixed(2)}</span>
            </div>
            <div className="card-body p-0">
              {gastos.length === 0 ? (
                <p className="text-muted p-3 mb-0">No hay gastos que coincidan con los filtros.</p>
              ) : (
                <ul className="list-group list-group-flush">
                  {gastos.map((m, idx) => (
                    <li key={idx} className="list-group-item d-flex justify-content-between align-items-start">
                      <div>
                        <strong>{iconosCategorias[m.categoria]} {m.descripcion}</strong><br />
                        <small>{renderDetallesFrecuencia(m)}<br />Categoría: {m.categoria}</small>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-danger">${m.monto.toFixed(2)}</span>
                        <button className="btn btn-sm btn-outline-secondary" title="Editar" onClick={() => editarMovimiento(m.id)}><FaEdit /></button>
                        <button className="btn btn-sm btn-outline-danger" title="Eliminar" onClick={() => eliminarMovimiento(m.id)}><FaTrash /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        {/* Ingresos */}
        <div className="col-md-6">
          <div className="card border-success h-100">
            <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
              <span>🟩 Ingresos</span>
              <span>Total: ${totalIngresos.toFixed(2)}</span>
            </div>
            <div className="card-body p-0">
              {ingresos.length === 0 ? (
                <p className="text-muted p-3 mb-0">No hay ingresos que coincidan con los filtros.</p>
              ) : (
                <ul className="list-group list-group-flush">
                  {ingresos.map((m, idx) => (
                    <li key={idx} className="list-group-item d-flex justify-content-between align-items-start">
                      <div>
                        <strong>{iconosCategorias[m.categoria]} {m.descripcion}</strong><br />
                        <small>{renderDetallesFrecuencia(m)}<br />Categoría: {m.categoria}</small>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-success">${m.monto.toFixed(2)}</span>
                        <button className="btn btn-sm btn-outline-secondary" title="Editar" onClick={() => editarMovimiento(m.id)}><FaEdit /></button>
                        <button className="btn btn-sm btn-outline-danger" title="Eliminar" onClick={() => eliminarMovimiento(m.id)}><FaTrash /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CapturaDashboard;