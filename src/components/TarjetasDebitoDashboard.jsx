import { useState, useEffect } from 'react';
import {
  format,
  parseISO,
  addDays,
  addMonths,
  isAfter,
  isBefore,
  isEqual,
  differenceInDays,
} from 'date-fns';
import { db, auth } from '../services/firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import DebitoChart from './DebitoChart';

/**
 * Dashboard de tarjetas de débito.
 *
 * Permite registrar tarjetas con datos de rendimiento, gestionar los movimientos
 * asociados (ingresos/gastos/recurrentes), generar rendimientos automáticos y
 * visualizar el saldo con una gráfica y un simulador de interés compuesto.
 */
export default function TarjetasDebitoDashboard() {
  // Usuario autenticado
  const [usuario, setUsuario] = useState(null);
  // Tarjetas del usuario
  const [tarjetas, setTarjetas] = useState([]);
  // Tarjeta abierta (por id)
  const [tarjetaAbierta, setTarjetaAbierta] = useState(null);
  // Formulario de alta de tarjeta
  const [formTarjeta, setFormTarjeta] = useState({
    nombre: '',
    tieneRendimiento: false,
    porcentajeRendimiento: '',
    rendimientoTopado: false,
    topeCapital: '',
    frecuenciaRendimiento: 'mensual',
  });
  // Formulario de movimiento
  const [formMov, setFormMov] = useState({
    tipo: 'ingreso',
    monto: '',
    descripcion: '',
    frecuenciaTipo: 'único',
    frecuencia: '',
    fecha: '',
    fechaInicio: '',
    movimientoId: null,
  });
  // Filtros de fecha
  const [filtros, setFiltros] = useState({ inicio: '', fin: '' });

  // Estados para simulación de saldo futuro
  const [fechaSimulacion, setFechaSimulacion] = useState('');
  const [tasaSimulacion, setTasaSimulacion] = useState(10);

  // Suscripción a cambios de autenticación
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
    });
    return () => unsub();
  }, []);

  // Carga inicial de tarjetas para el usuario
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

  // Maneja campos del formulario de alta de tarjeta
  const handleTarjetaChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormTarjeta((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Envía la nueva tarjeta a Firestore
  const handleTarjetaSubmit = async (e) => {
    e.preventDefault();
    if (!usuario) return;
    const nueva = {
      nombre: formTarjeta.nombre,
      rendimiento: {
        tiene: formTarjeta.tieneRendimiento,
        porcentaje: formTarjeta.tieneRendimiento
          ? parseFloat(formTarjeta.porcentajeRendimiento)
          : 0,
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
    setFormTarjeta({
      nombre: '',
      tieneRendimiento: false,
      porcentajeRendimiento: '',
      rendimientoTopado: false,
      topeCapital: '',
      frecuenciaRendimiento: 'mensual',
    });
  };

  // Plancha los rendimientos (guardarlos en Firestore como ingresos reales)
const plancharRendimientos = async (tarjeta) => {
  const { ingresos } = calcularRendimiento(tarjeta);

  const nuevos = ingresos.filter((ingreso) => {
    const yaExiste = tarjeta.movimientos.some(
      (m) => m.fecha === ingreso.fecha && m.descripcion === 'Rendimiento'
    );
    return !yaExiste;
  });

  if (nuevos.length === 0) {
    alert("No hay rendimientos nuevos para guardar.");
    return;
  }

  const movimientosActualizados = [
    ...tarjeta.movimientos,
    ...nuevos.map((r) => ({
      ...r,
      esRendimiento: true,
      frecuenciaTipo: 'único',
      frecuencia: null,
      fechaInicio: null,
    })),
  ];

  await updateDoc(doc(db, 'tarjetasDebito', tarjeta.id), {
    movimientos: movimientosActualizados,
  });

  setTarjetas((prev) =>
    prev.map((t) =>
      t.id === tarjeta.id ? { ...t, movimientos: movimientosActualizados } : t
    )
  );

  alert(`${nuevos.length} rendimiento(s) guardado(s).`);
};

  // Maneja campos del formulario de movimiento
  const handleMovChange = (e) => {
    const { name, value } = e.target;
    setFormMov((prev) => ({ ...prev, [name]: value }));
  };

  // Registra o edita un movimiento en la tarjeta abierta
  const handleMovSubmit = async (e) => {
  e.preventDefault();
  if (!usuario || tarjetaAbierta == null) return;

  const idx = tarjetas.findIndex((t) => t.id === tarjetaAbierta);
  if (idx === -1) return;
  const tarjeta = tarjetas[idx];

  const movimiento = {
    tipo: formMov.tipo,
    monto: parseFloat(formMov.monto),
    descripcion: formMov.descripcion,
    frecuenciaTipo: formMov.frecuenciaTipo,
    frecuencia: formMov.frecuencia,
    fecha: formMov.frecuenciaTipo === 'único' ? formMov.fecha : null,
    fechaInicio: formMov.frecuenciaTipo === 'recurrente' ? formMov.fechaInicio : null,
    id: formMov.movimientoId || Date.now().toString(),

    // ✅ Este campo es clave para mantener rendimientos planchados
    esRendimiento: !!formMov.esRendimiento,
  };

  let nuevosMovs;

  if (formMov.movimientoId) {
    // Edición
    nuevosMovs = tarjeta.movimientos.map((m) =>
      m.id === formMov.movimientoId ? movimiento : m
    );
  } else {
    // Alta
    nuevosMovs = [...tarjeta.movimientos, movimiento];
  }

  const nuevaTarjeta = { ...tarjeta, movimientos: nuevosMovs };

  await updateDoc(doc(db, 'tarjetasDebito', tarjeta.id), {
    movimientos: nuevosMovs,
  });

  const tarjetasCopia = [...tarjetas];
  tarjetasCopia[idx] = nuevaTarjeta;
  setTarjetas(tarjetasCopia);

  // Limpiar formulario
  setFormMov({
    tipo: 'ingreso',
    monto: '',
    descripcion: '',
    frecuenciaTipo: 'único',
    frecuencia: '',
    fecha: '',
    fechaInicio: '',
    movimientoId: null,
    esRendimiento: false, // ← Reinicio explícito
  });
};

  // Abre o cierra una tarjeta en el listado
  const toggleTarjeta = (id) => {
    setTarjetaAbierta((prev) => (prev === id ? null : id));
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

    // ✅ Aquí está el campo que faltaba
    esRendimiento: mov.esRendimiento || false,
  });
};

  // Elimina un movimiento (incluye también los generados por rendimiento)
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

  // Elimina una tarjeta completa
  const eliminarTarjeta = async (id) => {
    if (!window.confirm('¿Eliminar esta tarjeta de débito?')) return;
    await deleteDoc(doc(db, 'tarjetasDebito', id));
    setTarjetas(tarjetas.filter((t) => t.id !== id));
    if (tarjetaAbierta === id) setTarjetaAbierta(null);
  };

  /** Genera ocurrencias de un movimiento recurrente (no se persiste en Firestore) */
  const generarRecurrentes = (mov) => {
    if (mov.frecuenciaTipo !== 'recurrente') return [];
    const inicio = parseISO(mov.fechaInicio);
    const hoy = new Date();
    const occurrences = [];
    let current = new Date(inicio);
    while (current <= hoy) {
      const iso = current.toISOString().slice(0, 10);
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

  /** Calcula rendimiento acumulado y genera ingresos automáticos por rendimiento */
  const calcularRendimiento = (tarjeta) => {
    const { rendimiento, movimientos } = tarjeta;
    if (!rendimiento.tiene || !rendimiento.porcentaje) {
      return { ingresos: [], totalRend: 0 };
    }
    const hoy = new Date();
    const ultima = parseISO(rendimiento.ultimaFecha);
    const frecuencia = rendimiento.frecuencia;
    let current = new Date(ultima);
    let totalRend = 0;
    const ingresos = [];
    // Saldo base: suma de ingresos únicos menos gastos únicos antes de hoy
    const calcularSaldo = () => {
      let saldo = 0;
      movimientos.forEach((m) => {
        if (m.tipo === 'ingreso' && m.frecuenciaTipo === 'único') {
          if (!m.fecha || new Date(m.fecha) <= hoy) saldo += m.monto;
        }
        if (m.tipo === 'gasto' && m.frecuenciaTipo === 'único') {
          if (!m.fecha || new Date(m.fecha) <= hoy) saldo -= m.monto;
        }
      });
      return saldo;
    };
    const saldoBase = calcularSaldo();
    const capitalTopado =
      rendimiento.topado && rendimiento.topeCapital
        ? Math.min(saldoBase, rendimiento.topeCapital)
        : saldoBase;
    const tasa =
      frecuencia === 'diario'
        ? rendimiento.porcentaje / 100 / 365
        : rendimiento.porcentaje / 100 / 12;
    // Generar rendimientos desde la última fecha hasta hoy
    while (current < hoy) {
  const iso = current.toISOString().slice(0, 10);

  // ✅ Verifica si ya hay un rendimiento planchado para esta fecha
  const yaExiste = movimientos.some(
    (m) =>
      m.tipo === 'ingreso' &&
      m.descripcion === 'Rendimiento' &&
      m.fecha === iso &&
      m.esRendimiento === true
  );

  if (!yaExiste) {
    const monto = capitalTopado * tasa;
    ingresos.push({
      tipo: 'ingreso',
      monto,
      descripcion: 'Rendimiento',
      fecha: iso,
      id: `rend-${iso}`,
    });
    totalRend += monto;
  }

  current = frecuencia === 'diario' ? addDays(current, 1) : addMonths(current, 1);
}
    return { ingresos, totalRend };
  };

  /** Aplica filtros y calcula totales para una tarjeta */
 const prepararDatos = (tarjeta) => {
  const generados = tarjeta.movimientos.flatMap((m) => generarRecurrentes(m));
  const { ingresos: rendIngresos } = calcularRendimiento(tarjeta);

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

  // === CLASIFICACIÓN ===
  const ingresos = todos.filter(
    (m) =>
      m.tipo === 'ingreso' &&
      m.descripcion !== 'Rendimiento'
  );

  const rendimientosPlanchados = todos.filter(
    (m) =>
      m.tipo === 'ingreso' &&
      m.descripcion === 'Rendimiento' &&
      m.esRendimiento
  );

  const rendimientosSimulados = todos.filter(
    (m) =>
      m.tipo === 'ingreso' &&
      m.descripcion === 'Rendimiento' &&
      !m.esRendimiento
  );

  const gastos = todos.filter((m) => m.tipo === 'gasto');

  // === TOTALES ===
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
  const totalRend = rendimientosPlanchados.reduce((s, m) => s + m.monto, 0);
  const totalRendSimulado = rendimientosSimulados.reduce((s, m) => s + m.monto, 0);
  const totalGastos = gastos.reduce((s, m) => s + m.monto, 0);

  const saldo = totalIngresos + totalRend - totalGastos;

  return {
    todos,
    ingresos,
    gastos,
    totalIngresos,
    totalGastos,
    totalRend,
    totalRendSimulado,
    saldo,
  };
};


const construirDatosGrafica = (movimientos) => {
  const agrupados = {};

  // Ordenar cronológicamente
  const ordenados = movimientos
    .filter((m) => m.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  let saldo = 0;

  ordenados.forEach((m) => {
    const fecha = m.fecha;
agrupados[fecha] = {
  fecha,
  ingresos: 0,
  gastos: 0,
  rendimientosPlanchados: 0,
  rendimientosSimulados: 0,
  saldo: 0,
};

if (m.tipo === 'ingreso') {
  if (m.esRendimiento) {
    agrupados[fecha].rendimientosPlanchados += m.monto;
    saldo += m.monto; // ✅ solo los planchados suman
  } else if (m.descripcion === 'Rendimiento') {
    agrupados[fecha].rendimientosSimulados += m.monto;
    // ❌ NO suma al saldo
  } else {
    agrupados[fecha].ingresos += m.monto;
    saldo += m.monto; // ✅ ingresos normales sí suman
  }
}


    if (m.tipo === 'gasto') {
      agrupados[fecha].gastos += m.monto;
      saldo -= m.monto;
    }

    agrupados[fecha].saldo = saldo;
  });

  return Object.values(agrupados);
};

  /** Calcula saldo proyectado con interés compuesto */
  const calcularProyeccion = (saldoActual) => {
    if (!fechaSimulacion) return saldoActual;
    const dias = differenceInDays(new Date(fechaSimulacion), new Date());
    const r = tasaSimulacion / 100;
    return saldoActual * Math.pow(1 + r / 365, dias);
  };

  return (
    <div className="container py-3">
      <h3>Tarjetas de débito</h3>

      {/* Formulario de alta de tarjeta */}
      <form onSubmit={handleTarjetaSubmit} className="border rounded p-3 mb-4">
        <h5>Nueva tarjeta de débito</h5>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Nombre de la cuenta</label>
            <input
              type="text"
              className="form-control"
              name="nombre"
              value={formTarjeta.nombre}
              onChange={handleTarjetaChange}
              required
            />
          </div>
          <div className="col-md-4 form-check d-flex align-items-end">
            <input
              type="checkbox"
              className="form-check-input"
              id="tieneRendimiento"
              name="tieneRendimiento"
              checked={formTarjeta.tieneRendimiento}
              onChange={handleTarjetaChange}
            />
            <label className="form-check-label ms-2" htmlFor="tieneRendimiento">
              ¿Tiene rendimiento?
            </label>
          </div>
          {formTarjeta.tieneRendimiento && (
            <>
              <div className="col-md-2">
                <label className="form-label">Porcentaje anual (%)</label>
                <input
                  type="number"
                  className="form-control"
                  name="porcentajeRendimiento"
                  value={formTarjeta.porcentajeRendimiento}
                  onChange={handleTarjetaChange}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Frecuencia</label>
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
              <div className="col-md-4 form-check d-flex align-items-end">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="rendimientoTopado"
                  name="rendimientoTopado"
                  checked={formTarjeta.rendimientoTopado}
                  onChange={handleTarjetaChange}
                />
                <label className="form-check-label ms-2" htmlFor="rendimientoTopado">
                  ¿Rendimiento topado a cierto capital?
                </label>
              </div>
              {formTarjeta.rendimientoTopado && (
                <div className="col-md-4">
                  <label className="form-label">Tope de capital</label>
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
          <div className="col-md-12">
            <button type="submit" className="btn btn-primary">
              Registrar tarjeta
            </button>
          </div>
        </div>
      </form>

      {/* Filtros de fecha */}
      <div className="border rounded p-3 mb-4">
        <h5>Filtros de fecha</h5>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Fecha inicio</label>
            <input
              type="date"
              className="form-control"
              value={filtros.inicio}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, inicio: e.target.value }))
              }
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Fecha fin</label>
            <input
              type="date"
              className="form-control"
              value={filtros.fin}
              onChange={(e) => setFiltros((prev) => ({ ...prev, fin: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Lista de tarjetas */}
      {tarjetas.map((t) => {
        const { todos, totalIngresos, totalGastos, totalRend, totalRendSimulado, saldo } = prepararDatos(t);

        const abierta = tarjetaAbierta === t.id;
        const datosGrafica = construirDatosGrafica(todos)
        const saldoProyectado = calcularProyeccion(saldo);
        return (
          <div className="card mb-3" key={t.id}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <div>
                <strong>{t.nombre}</strong>{' '}
                {t.rendimiento.tiene && (
                  <small className="text-muted">
                    (Rendimiento {t.rendimiento.porcentaje}% {t.rendimiento.frecuencia})
                  </small>
                )}
              </div>
              <div>
                <button
                  className="btn btn-sm btn-outline-secondary me-2"
                  onClick={() => toggleTarjeta(t.id)}
                >
                  {abierta ? 'Cerrar' : 'Ver'}
                </button>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => eliminarTarjeta(t.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
            {abierta && (
  <div className="card-body">
    {/* Botón para planchar rendimientos */}
    <div className="mb-2 text-end">
      <button
        className="btn btn-sm btn-outline-primary"
        onClick={() => plancharRendimientos(t)}
      >
        Planchar rendimientos
      </button>
    </div>

    {/* Resumen con totales visuales */}
    <h6>Resumen</h6>
 <p>
  <span className="badge bg-success me-2">
    +${totalIngresos.toFixed(2)} Ingresos
  </span>
  <span className="badge bg-danger me-2">
    -${totalGastos.toFixed(2)} Gastos
  </span>
  <span className="badge bg-info me-2">
    +${totalRend.toFixed(2)} Rendimientos plancheados
  </span>
  <span className="badge bg-secondary me-2">
    +${totalRendSimulado.toFixed(2)} Simulados
  </span>
  <span
    className={`badge ${saldo >= 0 ? 'bg-success' : 'bg-danger'}`}
  >
    Saldo: ${saldo.toFixed(2)}
  </span>
</p>

    {/* Gráfica (la nueva irá aquí en la siguiente sección) */}
    <h6>Evolución del saldo</h6>
    <DebitoChart data={datosGrafica} />

    {/* Simulación de interés compuesto */}
    <div className="mt-3">
      <h6>Simulación con interés compuesto</h6>
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label">Fecha objetivo</label>
          <input
            type="date"
            className="form-control"
            value={fechaSimulacion}
            onChange={(e) => setFechaSimulacion(e.target.value)}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Tasa anual (%)</label>
          <input
            type="number"
            className="form-control"
            value={tasaSimulacion}
            onChange={(e) => setTasaSimulacion(Number(e.target.value))}
          />
        </div>
        <div className="col-md-4 d-flex align-items-end">
          {fechaSimulacion && (
            <strong>
              Saldo proyectado: ${saldoProyectado.toFixed(2)}
            </strong>
          )}
        </div>
      </div>
    </div>

                {/* Lista de movimientos */}
                <h6 className="mt-3">Movimientos</h6>
                {todos.length === 0 ? (
                  <p>No hay movimientos.</p>
                ) : (
                  <ul className="list-group mb-3">
  {todos.map((m) => {
    const esRendPlanchado = m.descripcion === 'Rendimiento' && m.esRendimiento;
    const esRendSimulado = m.descripcion === 'Rendimiento' && !m.esRendimiento;

    return (
      <li
        key={m.id}
        className={`list-group-item d-flex justify-content-between align-items-start ${
          esRendPlanchado
            ? 'list-group-item-warning'
            : esRendSimulado
            ? 'list-group-item-light text-muted'
            : ''
        }`}
      >
        <div>
          <strong>
            {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toFixed(2)}
          </strong>{' '}
          — {m.descripcion}{' '}
          {m.frecuenciaTipo === 'recurrente' && (
            <small className="text-muted">
              ({m.frecuencia}, inicio {m.fechaInicio})
            </small>
          )}
          {m.fecha && <small className="text-muted"> — {m.fecha}</small>}
          {esRendPlanchado && (
            <span className="badge bg-warning text-dark ms-2">planchado</span>
          )}
          {esRendSimulado && (
            <span className="badge bg-secondary text-light ms-2">simulado</span>
          )}
        </div>
        <div>
          <button
            className="btn btn-sm btn-outline-secondary me-2"
            onClick={() => editarMovimiento(t.id, m)}
          >
            Editar
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => eliminarMovimiento(t.id, m.id)}
          >
            Eliminar
          </button>
        </div>
      </li>
    );
  })}
</ul>
                )}

                {/* Formulario de movimiento */}
                <form onSubmit={handleMovSubmit} className="border rounded p-3">
                  <h6>{formMov.movimientoId ? 'Editar movimiento' : 'Nuevo movimiento'}</h6>
                  <div className="row g-3">
                    <div className="col-md-2">
                      <label className="form-label">Tipo</label>
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
                    <div className="col-md-2">
                      <label className="form-label">Monto</label>
                      <input
                        type="number"
                        className="form-control"
                        name="monto"
                        value={formMov.monto}
                        onChange={handleMovChange}
                        required
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Descripción</label>
                      <input
                        type="text"
                        className="form-control"
                        name="descripcion"
                        value={formMov.descripcion}
                        onChange={handleMovChange}
                        required
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label">¿Único o recurrente?</label>
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
                        <div className="col-md-2">
                          <label className="form-label">Frecuencia</label>
                          <select
                            className="form-select"
                            name="frecuencia"
                            value={formMov.frecuencia}
                            onChange={handleMovChange}
                          >
                            <option value="">Seleccionar</option>
                            <option value="diario">Diario</option>
                            <option value="mensual">Mensual</option>
                          </select>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Fecha de inicio</label>
                          <input
                            type="date"
                            className="form-control"
                            name="fechaInicio"
                            value={formMov.fechaInicio}
                            onChange={handleMovChange}
                          />
                        </div>
                      </>
                    )}
                    {formMov.frecuenciaTipo === 'único' && (
                      <div className="col-md-3">
                        <label className="form-label">Fecha</label>
                        <input
                          type="date"
                          className="form-control"
                          name="fecha"
                          value={formMov.fecha}
                          onChange={handleMovChange}
                        />
                      </div>
                    )}
                    <div className="col-md-12">
                      <button type="submit" className="btn btn-success">
                        {formMov.movimientoId ? 'Guardar cambios' : 'Registrar'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
