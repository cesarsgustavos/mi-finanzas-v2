import { useState, useEffect } from 'react';
import MovementForm from './MovementForm';
import { FaUtensils, FaHome, FaBus, FaHeartbeat, FaWallet, FaEdit, FaTrash } from 'react-icons/fa';
import { getDocs, collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';

const iconosCategorias = {
  Alimentos: <FaUtensils />, 
  Vivienda: <FaHome />, 
  Transporte: <FaBus />, 
  Salud: <FaHeartbeat />, 
  Otros: <FaWallet />
};

function Dashboard() {
  const [movimientos, setMovimientos] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [indiceEdicion, setIndiceEdicion] = useState(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroTipoRecurrencia, setFiltroTipoRecurrencia] = useState('todos');

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

  const agregarMovimiento = async (nuevo) => {
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

  const eliminarMovimiento = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    setMovimientos(movimientos.filter(m => m.id !== id));
    try {
      await deleteDoc(doc(db, 'movimientos', id));
    } catch (error) {
      console.error('Error al eliminar movimiento:', error);
    }
  };

  const editarMovimiento = (id) => {
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

  const renderDetallesFrecuencia = (mov) => {
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

  const filtrarMovimientos = (lista) => {
    return lista.filter(m => {
      if (filtroTipoRecurrencia !== 'todos' && m.frecuenciaTipo !== filtroTipoRecurrencia) return false;
      const fechaValor = m.frecuenciaTipo === 'único' ? m.fecha : m.fechaInicio;
      if (filtroFechaInicio && fechaValor < filtroFechaInicio) return false;
      if (filtroFechaFin && fechaValor > filtroFechaFin) return false;
      return true;
    });
  };

  const gastos = filtrarMovimientos(movimientos.filter(m => m.tipo === 'gasto'));
  const ingresos = filtrarMovimientos(movimientos.filter(m => m.tipo === 'ingreso'));

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

      <div className="mb-4 border p-3 rounded bg-light">
        <h6>🔍 Filtros</h6>
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

      {/* Gastos */}
      <div className="mb-5">
        <h6 className="text-danger">🟥 Gastos</h6>
        {gastos.length === 0 ? (
          <p className="text-muted">No hay gastos que coincidan con los filtros.</p>
        ) : (
          <ul className="list-group">
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

      {/* Ingresos */}
      <div>
        <h6 className="text-success">🟩 Ingresos</h6>
        {ingresos.length === 0 ? (
          <p className="text-muted">No hay ingresos que coincidan con los filtros.</p>
        ) : (
          <ul className="list-group">
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
  );
}

export default Dashboard;
