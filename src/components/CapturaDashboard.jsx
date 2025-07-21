import { useState } from 'react';
import MovementForm from './MovementForm';
import { FaUtensils, FaHome, FaBus, FaHeartbeat, FaWallet, FaEdit, FaTrash } from 'react-icons/fa';

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

  // Filtros
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroTipoRecurrencia, setFiltroTipoRecurrencia] = useState('todos');

  const agregarMovimiento = (nuevo) => {
    if (modoEdicion && indiceEdicion !== null) {
      const copia = [...movimientos];
      copia[indiceEdicion] = nuevo;
      setMovimientos(copia);
      setModoEdicion(false);
      setIndiceEdicion(null);
    } else {
      setMovimientos([...movimientos, nuevo]);
    }
  };

  const eliminarMovimiento = (index) => {
    const confirmacion = window.confirm('¿Eliminar este movimiento?');
    if (confirmacion) {
      const copia = [...movimientos];
      copia.splice(index, 1);
      setMovimientos(copia);
    }
  };

  const editarMovimiento = (index) => {
    setModoEdicion(true);
    setIndiceEdicion(index);
  };

  const renderDetallesFrecuencia = (mov) => {
    if (mov.frecuenciaTipo === 'único') return `📅 ${mov.fecha}`;
    if (mov.frecuencia === 'mensual') return `🗓️ Mensual, día ${mov.diaMes}`;
    if (mov.frecuencia === 'semanal') return `📆 Semanal, ${mov.diaSemana}`;
    if (mov.frecuencia === 'catorcenal') return '🔁 Catorcenal';
    if (mov.frecuencia === 'diario') return '📅 Diario';
  };

  const movimientoEnEdicion = modoEdicion ? movimientos[indiceEdicion] : null;

  // 🎯 FILTRADO
  const filtrarMovimientos = (lista) => {
    return lista.filter((m) => {
      const cumpleRecurrencia =
        filtroTipoRecurrencia === 'todos' ||
        m.frecuenciaTipo === filtroTipoRecurrencia;

      const cumpleFecha =
        m.frecuenciaTipo === 'único'
          ? (!filtroFechaInicio || m.fecha >= filtroFechaInicio) &&
            (!filtroFechaFin || m.fecha <= filtroFechaFin)
          : true;

      return cumpleRecurrencia && cumpleFecha;
    });
  };

  const gastos = filtrarMovimientos(movimientos.filter((m) => m.tipo === 'gasto'));
  const ingresos = filtrarMovimientos(movimientos.filter((m) => m.tipo === 'ingreso'));

  return (
    <div className="p-4">
      <h5>{modoEdicion ? 'Editar movimiento' : 'Registrar movimiento'}</h5>

      {/* Formulario */}
      <div className="mb-4">
        <MovementForm onAdd={agregarMovimiento} movimientoEditar={movimientoEnEdicion} />
      </div>

      {/* FILTROS */}
      <div className="mb-4 border p-3 rounded bg-light">
        <h6>🔍 Filtros</h6>
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label">Fecha inicio (solo aplica a movimientos únicos)</label>
            <input type="date" className="form-control" value={filtroFechaInicio} onChange={(e) => setFiltroFechaInicio(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Fecha fin</label>
            <input type="date" className="form-control" value={filtroFechaFin} onChange={(e) => setFiltroFechaFin(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={filtroTipoRecurrencia} onChange={(e) => setFiltroTipoRecurrencia(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="único">Únicos</option>
              <option value="recurrente">Recurrentes</option>
            </select>
          </div>
        </div>
      </div>

      {/* GASTOS */}
      <div className="mb-5">
        <h6 className="text-danger">🟥 Gastos</h6>
        {gastos.length === 0 ? (
          <p className="text-muted">No hay gastos que coincidan con los filtros.</p>
        ) : (
          <ul className="list-group">
            {gastos.map((m, index) => (
              <li key={index} className="list-group-item d-flex justify-content-between align-items-start">
                <div>
                  <strong>{iconosCategorias[m.categoria]} {m.descripcion}</strong><br />
                  <small>
                    {m.frecuenciaTipo === 'recurrente' ? 'Recurrente' : 'Único'} — {renderDetallesFrecuencia(m)}<br />
                    Categoría: {m.categoria}
                  </small>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-danger">${m.monto.toFixed(2)}</span>
                  <button className="btn btn-sm btn-outline-secondary" title="Editar" onClick={() => editarMovimiento(index)}><FaEdit /></button>
                  <button className="btn btn-sm btn-outline-danger" title="Eliminar" onClick={() => eliminarMovimiento(index)}><FaTrash /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* INGRESOS */}
      <div>
        <h6 className="text-success">🟩 Ingresos</h6>
        {ingresos.length === 0 ? (
          <p className="text-muted">No hay ingresos que coincidan con los filtros.</p>
        ) : (
          <ul className="list-group">
            {ingresos.map((m, index) => (
              <li key={index} className="list-group-item d-flex justify-content-between align-items-start">
                <div>
                  <strong>{iconosCategorias[m.categoria]} {m.descripcion}</strong><br />
                  <small>
                    {m.frecuenciaTipo === 'recurrente' ? 'Recurrente' : 'Único'} — {renderDetallesFrecuencia(m)}<br />
                    Categoría: {m.categoria}
                  </small>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-success">${m.monto.toFixed(2)}</span>
                  <button className="btn btn-sm btn-outline-secondary" title="Editar" onClick={() => editarMovimiento(index)}><FaEdit /></button>
                  <button className="btn btn-sm btn-outline-danger" title="Eliminar" onClick={() => eliminarMovimiento(index)}><FaTrash /></button>
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
