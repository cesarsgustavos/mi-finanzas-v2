import { useState, useEffect } from 'react';
import { format, parseISO, addDays, addMonths, isAfter, isBefore, isEqual } from 'date-fns';
import { db, auth } from '../services/firebase';
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * Componente para gestionar tarjetas de débito.
 *
 * Permite registrar una nueva tarjeta con datos de rendimiento y gestionar
 * los movimientos asociados (ingresos/gastos), incluyendo movimientos
 * recurrentes diarios o mensuales y cálculo automático de rendimientos.
 */
function TarjetasDebitoDashboard() {
  // Estado para el usuario autenticado
  const [usuario, setUsuario] = useState(null);
  // Lista de tarjetas de débito del usuario
  const [tarjetas, setTarjetas] = useState([]);
  // Controla qué tarjeta está expandida para ver detalles
  const [tarjetaAbierta, setTarjetaAbierta] = useState(null);
  // Estado del formulario para crear una tarjeta
  const [formTarjeta, setFormTarjeta] = useState({
    nombre: '',
    tieneRendimiento: false,
    porcentajeRendimiento: '',
    rendimientoTopado: false,
    topeCapital: '',
    frecuenciaRendimiento: 'mensual',
  });
  // Estado del formulario para agregar/editar movimientos
  const [formMov, setFormMov] = useState({
    tipo: 'ingreso',
    monto: '',
    descripcion: '',
    frecuenciaTipo: 'único',
    frecuencia: '',
    fecha: '',
    fechaInicio: '',
    movimientoId: null, // null indica un alta; si no, edición
  });
  // Filtros de fecha para mostrar movimientos
  const [filtros, setFiltros] = useState({ inicio: '', fin: '' });

  // Suscripción al cambio de autenticación para saber el usuario actual
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
    });
    return () => unsub();
  }, []);

  // Carga inicial de tarjetas cuando hay un usuario
  useEffect(() => {
    if (!usuario) {
      setTarjetas([]);
      return;
    }
    const cargar = async () => {
      const ref = collection(db, 'tarjetasDebito');
      const q = query(ref, where('userId', '==', usuario.uid));
      const snap = await getDocs(q);
      const t = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTarjetas(t);
    };
    cargar();
  }, [usuario]);

  // Actualiza campos del formulario de tarjeta
  const handleTarjetaChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormTarjeta((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Envía el formulario de alta de tarjeta
  const handleTarjetaSubmit = async (e) => {
    e.preventDefault();
    if (!usuario) return;
    // Construimos el objeto de nueva tarjeta
    const nueva = {
      nombre: formTarjeta.nombre,
      rendimiento: {
        tiene: formTarjeta.tieneRendimiento,
        porcentaje: formTarjeta.tieneRendimiento ? parseFloat(formTarjeta.porcentajeRendimiento) : 0,
        topado: formTarjeta.rendimientoTopado,
        topeCapital: formTarjeta.rendimientoTopado
          ? parseFloat(formTarjeta.topeCapital)
          : null,
        frecuencia: formTarjeta.frecuenciaRendimiento,
        ultimaFecha: new Date().toISOString().slice(0, 10),
      },
      movimientos: [],
      userId: usuario.uid,
    };
    const docRef = await addDoc(collection(db, 'tarjetasDebito'), nueva);
    setTarjetas([...tarjetas, { ...nueva, id: docRef.id }]);
    // Limpiar formulario
    setFormTarjeta({
      nombre: '',
      tieneRendimiento: false,
      porcentajeRendimiento: '',
      rendimientoTopado: false,
      topeCapital: '',
      frecuenciaRendimiento: 'mensual',
    });
  };

  // Maneja cambios en el formulario de movimiento
  const handleMovChange = (e) => {
    const { name, value } = e.target;
    setFormMov((prev) => ({ ...prev, [name]: value }));
  };

  // Añade o actualiza un movimiento en la tarjeta actualmente abierta
  const handleMovSubmit = async (e) => {
    e.preventDefault();
    if (!usuario || tarjetaAbierta == null) return;
    const idx = tarjetas.findIndex((t) => t.id === tarjetaAbierta);
    if (idx === -1) return;
    const tarjeta = tarjetas[idx];
    // Construimos objeto movimiento
    const movimiento = {
      tipo: formMov.tipo,
      monto: parseFloat(formMov.monto),
      descripcion: formMov.descripcion,
      frecuenciaTipo: formMov.frecuenciaTipo,
      frecuencia: formMov.frecuencia,
      fecha: formMov.frecuenciaTipo === 'único' ? formMov.fecha : null,
      fechaInicio: formMov.frecuenciaTipo === 'recurrente' ? formMov.fechaInicio : null,
      id: formMov.movimientoId || Date.now().toString(), // id local
    };
    let nuevosMovs;
    if (formMov.movimientoId) {
      // edición
      nuevosMovs = tarjeta.movimientos.map((m) =>
        m.id === formMov.movimientoId ? movimiento : m,
      );
    } else {
      // alta
      nuevosMovs = [...tarjeta.movimientos, movimiento];
    }
    const nuevaTarjeta = { ...tarjeta, movimientos: nuevosMovs };
    // Actualizar en Firestore
    await updateDoc(doc(db, 'tarjetasDebito', tarjeta.id), {
      movimientos: nuevosMovs,
    });
    // Actualizar en estado local
    const tarjetasCopia = [...tarjetas];
    tarjetasCopia[idx] = nuevaTarjeta;
    setTarjetas(tarjetasCopia);
    // Limpiar formulario movimiento
    setFormMov({
      tipo: 'ingreso',
      monto: '',
      descripcion: '',
      frecuenciaTipo: 'único',
      frecuencia: '',
      fecha: '',
      fechaInicio: '',
      movimientoId: null,
    });
  };

  // Selecciona una tarjeta para verla/ocultarla
  const toggleTarjeta = (id) => {
    setTarjetaAbierta((prev) => (prev === id ? null : id));
    // Al abrir una tarjeta en edición, limpiamos el formulario de movimiento
    setFormMov({
      tipo: 'ingreso',
      monto: '',
      descripcion: '',
      frecuenciaTipo: 'único',
      frecuencia: '',
      fecha: '',
      fechaInicio: '',
      movimientoId: null,
    });
  };

  // Prepara un movimiento para edición
  const editarMovimiento = (tarjetaId, mov) => {
    setTarjetaAbierta(tarjetaId);
    setFormMov({
      tipo: mov.tipo,
      monto: mov.monto.toString(),
      descripcion: mov.descripcion,
      frecuenciaTipo: mov.frecuenciaTipo,
      frecuencia: mov.frecuencia || '',
      fecha: mov.fecha || '',
      fechaInicio: mov.fechaInicio || '',
      movimientoId: mov.id,
    });
  };

  // Elimina un movimiento
  const eliminarMovimiento = async (tarjetaId, movId) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    const idx = tarjetas.findIndex((t) => t.id === tarjetaId);
    if (idx === -1) return;
    const tarjeta = tarjetas[idx];
    const nuevosMovs = tarjeta.movimientos.filter((m) => m.id !== movId);
    await updateDoc(doc(db, 'tarjetasDebito', tarjeta.id), {
      movimientos: nuevosMovs,
    });
    const tarjetasCopia = [...tarjetas];
    tarjetasCopia[idx] = { ...tarjeta, movimientos: nuevosMovs };
    setTarjetas(tarjetasCopia);
  };

  // Elimina una tarjeta por completo
  const eliminarTarjeta = async (id) => {
    if (!window.confirm('¿Eliminar esta tarjeta de débito?')) return;
    await deleteDoc(doc(db, 'tarjetasDebito', id));
    setTarjetas(tarjetas.filter((t) => t.id !== id));
    if (tarjetaAbierta === id) setTarjetaAbierta(null);
  };

  // Genera movimientos recurrentes para una tarjeta (sin persistir en Firestore)
  const generarRecurrentes = (mov) => {
    if (mov.frecuenciaTipo !== 'recurrente') return [];
    const inicio = parseISO(mov.fechaInicio);
    const hoy = new Date();
    const occurrences = [];
    let current = new Date(inicio);
    while (current <= hoy) {
      // Solo agregamos la ocurrencia si cumple los filtros de fecha
      const iso = current.toISOString().slice(0, 10);
      // Si hay filtros de fecha, comprobamos el rango
      if (
        (!filtros.inicio || iso >= filtros.inicio) &&
        (!filtros.fin || iso <= filtros.fin)
      ) {
        occurrences.push({ ...mov, fecha: iso, id: `${mov.id}-${iso}` });
      }
      if (mov.frecuencia === 'diario') current = addDays(current, 1);
      else if (mov.frecuencia === 'mensual') current = addMonths(current, 1);
      else break;
    }
    return occurrences;
  };

  // Calcula el rendimiento acumulado para una tarjeta y genera ingresos automáticos
  const calcularRendimiento = (tarjeta) => {
    const { rendimiento, movimientos } = tarjeta;
    if (!rendimiento.tiene || !rendimiento.porcentaje) return { ingresos: [], totalRend: 0 };
    const hoy = new Date();
    const ultima = parseISO(rendimiento.ultimaFecha);
    const frecuencia = rendimiento.frecuencia; // 'mensual' o 'diario'
    let current = new Date(ultima);
    let totalRend = 0;
    const ingresos = [];
    // Se calcula el saldo actual (sumando ingresos y restando gastos únicos y recurrentes hasta hoy)
    const calcularSaldo = () => {
      let saldo = 0;
      movimientos.forEach((m) => {
        if (m.tipo === 'ingreso' && m.frecuenciaTipo === 'único') {
          if (!m.fecha || new Date(m.fecha) <= hoy) saldo += m.monto;
        }
        if (m.tipo === 'gasto' && m.frecuenciaTipo === 'único') {
          if (!m.fecha || new Date(m.fecha) <= hoy) saldo -= m.monto;
        }
        // ignoramos los recurrentes para calcular capital; se incluirán como parte del rendimiento
      });
      return saldo;
    };
    const saldoBase = calcularSaldo();
    const capitalTopado = rendimiento.topado && rendimiento.topeCapital
      ? Math.min(saldoBase, rendimiento.topeCapital)
      : saldoBase;
    // Obtenemos la tasa diaria o mensual
    const tasa =
      frecuencia === 'diario'
        ? rendimiento.porcentaje / 100 / 365
        : rendimiento.porcentaje / 100 / 12;
    // Genera rendimientos hasta hoy
    while (current < hoy) {
      const iso = current.toISOString().slice(0, 10);
      const monto = capitalTopado * tasa;
      ingresos.push({
        tipo: 'ingreso',
        monto,
        descripcion: 'Rendimiento',
        fecha: iso,
        id: `rend-${iso}`,
      });
      totalRend += monto;
      current =
        frecuencia === 'diario' ? addDays(current, 1) : addMonths(current, 1);
    }
    return { ingresos, totalRend };
  };

  // Aplica filtros y calcula totales para una tarjeta
  const prepararDatos = (tarjeta) => {
    // Generamos movimientos recurrentes (ingresos y gastos)
    const generados = tarjeta.movimientos.flatMap((m) => generarRecurrentes(m));
    // Rendimiento automático
    const { ingresos: rendIngresos, totalRend } = calcularRendimiento(tarjeta);
    // Combina movimientos: únicos + recurrentes generados + rendimientos
    const todos = [
      ...tarjeta.movimientos.filter(
        (m) =>
          m.frecuenciaTipo === 'único' &&
          (!filtros.inicio || m.fecha >= filtros.inicio) &&
          (!filtros.fin || m.fecha <= filtros.fin),
      ),
      ...generados,
      ...rendIngresos,
    ];
    const ingresos = todos.filter((m) => m.tipo === 'ingreso');
    const gastos = todos.filter((m) => m.tipo === 'gasto');
    const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
    const totalGastos = gastos.reduce((s, m) => s + m.monto, 0);
    const saldo = totalIngresos - totalGastos;
    return { todos, ingresos, gastos, totalIngresos, totalGastos, saldo, totalRend };
  };

  return (
    <div className="container mt-3">
      <h2>Tarjetas de débito</h2>
      {/* Formulario alta de tarjeta */}
      <form onSubmit={handleTarjetaSubmit} className="card p-3 mb-3">
        <h4>Nueva tarjeta de débito</h4>
        <div className="mb-2">
          <label>Nombre de la cuenta</label>
          <input
            type="text"
            className="form-control"
            name="nombre"
            value={formTarjeta.nombre}
            onChange={handleTarjetaChange}
            required
          />
        </div>
        <div className="form-check mb-2">
          <input
            type="checkbox"
            className="form-check-input"
          name="tieneRendimiento"
          checked={formTarjeta.tieneRendimiento}
            onChange={handleTarjetaChange}
          />
          <label className="form-check-label">
            ¿Tiene rendimiento?
          </label>
        </div>
        {formTarjeta.tieneRendimiento && (
          <>
            <div className="mb-2">
              <label>Porcentaje anual (%)</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                name="porcentajeRendimiento"
                value={formTarjeta.porcentajeRendimiento}
                onChange={handleTarjetaChange}
              />
            </div>
            <div className="mb-2">
              <label>Frecuencia de generación</label>
              <select
                className="form-select"
                name="frecuenciaRendimiento"
                value={formTarjeta.frecuenciaRendimiento}
                onChange={handleTarjetaChange}
              >
                <option value="mensual">Mensual</option>
                <option value="diario">Diario</option>
              </select>
            </div>
            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                name="rendimientoTopado"
                checked={formTarjeta.rendimientoTopado}
                onChange={handleTarjetaChange}
              />
              <label className="form-check-label">
                ¿Rendimiento topado a cierto capital?
              </label>
            </div>
            {formTarjeta.rendimientoTopado && (
              <div className="mb-2">
                <label>Tope de capital</label>
                <input
                  type="number"
                  className="form-control"
                  name="topeCapital"
                  value={formTarjeta.topeCapital}
                  onChange={handleTarjetaChange}
                />
              </div>
            )}
          </>
        )}
        <button className="btn btn-primary" type="submit">
          Registrar tarjeta
        </button>
      </form>

      {/* Filtros de fecha */}
      <div className="card p-3 mb-3">
        <h4>Filtros de fecha</h4>
        <div className="row">
          <div className="col">
            <label>Fecha inicio</label>
            <input
              type="date"
              className="form-control"
              value={filtros.inicio}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, inicio: e.target.value }))
              }
            />
          </div>
          <div className="col">
            <label>Fecha fin</label>
            <input
              type="date"
              className="form-control"
              value={filtros.fin}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, fin: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      {/* Lista de tarjetas */}
      {tarjetas.map((t) => {
        const { todos, ingresos, gastos, totalIngresos, totalGastos, saldo, totalRend } =
          prepararDatos(t);
        const abierta = tarjetaAbierta === t.id;
        return (
          <div key={t.id} className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div>
                <strong>{t.nombre}</strong>
                {t.rendimiento.tiene && (
                  <small className="text-muted ms-2">
                    Rendimiento: {t.rendimiento.porcentaje}% {t.rendimiento.frecuencia}
                  </small>
                )}
              </div>
              <div>
                <button
                  className="btn btn-sm btn-link"
                  onClick={() => toggleTarjeta(t.id)}
                >
                  {abierta ? 'Cerrar' : 'Ver'}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => eliminarTarjeta(t.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
            {abierta && (
              <div className="card-body">
                {/* Resumen */}
                <div className="mb-3">
                  <h5>Resumen</h5>
                  <p>
                    Total ingresos: <strong>${totalIngresos.toFixed(2)}</strong>
                    <br />
                    Total gastos: <strong>${totalGastos.toFixed(2)}</strong>
                    <br />
                    Rendimientos generados: <strong>${totalRend.toFixed(2)}</strong>
                    <br />
                    Saldo: <strong>${saldo.toFixed(2)}</strong>
                  </p>
                </div>
                {/* Lista de movimientos */}
                <div className="mb-3">
                  <h5>Movimientos</h5>
                  {todos.length === 0 ? (
                    <p>No hay movimientos.</p>
                  ) : (
                    <ul className="list-group">
                      {todos.map((m) => (
                        <li
                          key={m.id}
                          className="list-group-item d-flex justify-content-between"
                        >
                          <div>
                            <span
                              className={
                                m.tipo === 'ingreso' ? 'text-success' : 'text-danger'
                              }
                            >
                              {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toFixed(2)}
                            </span>{' '}
                            — {m.descripcion}{' '}
                            {m.frecuenciaTipo === 'recurrente' && (
                              <small className="text-muted">
                                ({m.frecuencia}, inicio {m.fechaInicio})
                              </small>
                            )}
                            {m.fecha && (
                              <small className="text-muted"> — {m.fecha}</small>
                            )}
                          </div>
                          {!m.id.startsWith('rend-') && (
                            <div>
                              <button
                                className="btn btn-sm btn-link"
                                onClick={() => editarMovimiento(t.id, m)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn btn-sm btn-link text-danger"
                                onClick={() => eliminarMovimiento(t.id, m.id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* Formulario de movimiento */}
                <form onSubmit={handleMovSubmit} className="mb-3">
                  <h5>{formMov.movimientoId ? 'Editar movimiento' : 'Nuevo movimiento'}</h5>
                  <div className="row mb-2">
                    <div className="col">
                      <label>Tipo</label>
                      <select
                        className="form-select"
                        name="tipo"
                        value={formMov.tipo}
                        onChange={handleMovChange}
                      >
                        <option value="ingreso">Ingreso</option>
                        <option value="gasto">Gasto</option>
                      </select>
                    </div>
                    <div className="col">
                      <label>Monto</label>
                      <input
                        type="number"
                        className="form-control"
                        name="monto"
                        step="0.01"
                        value={formMov.monto}
                        onChange={handleMovChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label>Descripción</label>
                    <input
                      type="text"
                      className="form-control"
                      name="descripcion"
                      value={formMov.descripcion}
                      onChange={handleMovChange}
                      required
                    />
                  </div>
                    <div className="mb-2">
                      <label>¿Único o recurrente?</label>
                      <select
                        className="form-select"
                        name="frecuenciaTipo"
                        value={formMov.frecuenciaTipo}
                        onChange={handleMovChange}
                      >
                        <option value="único">Único</option>
                        <option value="recurrente">Recurrente</option>
                      </select>
                    </div>
                  {formMov.frecuenciaTipo === 'recurrente' && (
                    <>
                      <div className="mb-2">
                        <label>Frecuencia</label>
                        <select
                          className="form-select"
                          name="frecuencia"
                          value={formMov.frecuencia}
                          onChange={handleMovChange}
                          required
                        >
                          <option value="">Seleccionar</option>
                          <option value="diario">Diario</option>
                          <option value="mensual">Mensual</option>
                        </select>
                      </div>
                      <div className="mb-2">
                        <label>Fecha de inicio</label>
                        <input
                          type="date"
                          className="form-control"
                          name="fechaInicio"
                          value={formMov.fechaInicio}
                          onChange={handleMovChange}
                          required
                        />
                      </div>
                    </>
                  )}
                  {formMov.frecuenciaTipo === 'único' && (
                    <div className="mb-2">
                      <label>Fecha</label>
                      <input
                        type="date"
                        className="form-control"
                        name="fecha"
                        value={formMov.fecha}
                        onChange={handleMovChange}
                        required
                      />
                    </div>
                  )}
                  <button className="btn btn-success" type="submit">
                    {formMov.movimientoId ? 'Guardar cambios' : 'Registrar'}
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TarjetasDebitoDashboard;
