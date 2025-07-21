import { useState } from 'react';

function TarjetasDashboard() {
  const [formTarjeta, setFormTarjeta] = useState({ nombre: '', diaCorte: '', diasCredito: '', limiteCredito: '' });
  const [tarjetas, setTarjetas] = useState([]);
  const [tipoGastoSeleccionado, setTipoGastoSeleccionado] = useState({});
  const [frecuenciaSeleccionada, setFrecuenciaSeleccionada] = useState({});

  const handleTarjetaChange = (e) => {
    const { name, value } = e.target;
    setFormTarjeta({ ...formTarjeta, [name]: value });
  };

  const handleTarjetaSubmit = (e) => {
    e.preventDefault();
    const nueva = {
      ...formTarjeta,
      diaCorte: parseInt(formTarjeta.diaCorte),
      diasCredito: parseInt(formTarjeta.diasCredito),
      limiteCredito: parseFloat(formTarjeta.limiteCredito),
      gastos: []
    };
    setTarjetas([...tarjetas, nueva]);
    setFormTarjeta({ nombre: '', diaCorte: '', diasCredito: '', limiteCredito: '' });
  };

  const handleEliminarTarjeta = (index) => {
    const confirmacion = window.confirm("¿Estás seguro de eliminar esta tarjeta y todos sus gastos?");
    if (confirmacion) {
      const copia = [...tarjetas];
      copia.splice(index, 1);
      setTarjetas(copia);
    }
  };

  const handleEliminarGasto = (indexTarjeta, indexGasto) => {
    const confirmacion = window.confirm("¿Deseas eliminar este gasto?");
    if (confirmacion) {
      const copia = [...tarjetas];
      copia[indexTarjeta].gastos.splice(indexGasto, 1);
      setTarjetas(copia);
    }
  };

  const handleGastoSubmit = (index, e) => {
    e.preventDefault();
    const form = e.target;
    const tipo = form.tipo.value;
    const esMSI = form.esMSI.checked;
    const mesesMSI = form.mesesMSI?.value || null;
    let frecuencia = form.frecuencia?.value || null;

    // Si es MSI, se convierte en recurrente
    if (esMSI && mesesMSI) {
      frecuencia = 'mensual';
    }

    // Validar fecha si es único
    if (tipo === 'unico' && !form.fecha?.value) {
      alert('Debes ingresar una fecha para un gasto único.');
      return;
    }

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
    };

    const copia = [...tarjetas];
    copia[index].gastos.push(gasto);
    setTarjetas(copia);
    form.reset();
    setTipoGastoSeleccionado({ ...tipoGastoSeleccionado, [index]: 'unico' });
    setFrecuenciaSeleccionada({ ...frecuenciaSeleccionada, [index]: '' });
  };

  const calcularTotal = (gastos) => gastos.reduce((acum, g) => acum + g.monto, 0);

  const mostrarMontoMSI = (g) => g.esMSI && g.mesesMSI ? ` • ${g.mesesMSI} MSI → $${(g.monto / g.mesesMSI).toFixed(2)}/mes` : '';

  return (
    <div>
      <h5>💳 Registrar nueva tarjeta</h5>
      <form onSubmit={handleTarjetaSubmit} className="border rounded p-3 mb-4 bg-white">
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Nombre</label>
            <input type="text" className="form-control" name="nombre" value={formTarjeta.nombre} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Día de corte</label>
            <input type="number" className="form-control" name="diaCorte" value={formTarjeta.diaCorte} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Días de crédito</label>
            <input type="number" className="form-control" name="diasCredito" value={formTarjeta.diasCredito} onChange={handleTarjetaChange} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Límite de crédito</label>
            <input type="number" className="form-control" name="limiteCredito" value={formTarjeta.limiteCredito} onChange={handleTarjetaChange} />
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary w-100">Guardar tarjeta</button>
          </div>
        </div>
      </form>

      <h6>📋 Tarjetas registradas</h6>
      {tarjetas.length === 0 ? <p className="text-muted">Aún no has registrado tarjetas.</p> : (
        <div className="row g-4">
          {tarjetas.map((t, i) => (
            <div key={i} className="col-md-6">
              <div className="card shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center">
                    <h6>{t.nombre}</h6>
                    <div>
                      <button className="btn btn-sm btn-outline-danger me-2" onClick={() => handleEliminarTarjeta(i)}>Eliminar</button>
                    </div>
                  </div>
                  <p className="small mb-1">
                    Corte: día {t.diaCorte} | Crédito: {t.diasCredito} días<br />
                    Límite: ${t.limiteCredito.toFixed(2)}
                  </p>
                  <p className="text-danger fw-bold">
                    Total gastado: ${calcularTotal(t.gastos).toFixed(2)}
                  </p>

                  <form onSubmit={(e) => handleGastoSubmit(i, e)} className="mb-3 border-top pt-3">
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <input type="text" name="descripcion" className="form-control" placeholder="Descripción" required />
                      </div>
                      <div className="col-3">
                        <input type="number" name="monto" className="form-control" placeholder="Monto" required />
                      </div>
                      <div className="col-3">
                        <select
                          name="tipo"
                          className="form-select"
                          onChange={(e) => setTipoGastoSeleccionado({ ...tipoGastoSeleccionado, [i]: e.target.value })}
                          defaultValue="unico"
                        >
                          <option value="unico">Único</option>
                          <option value="recurrente">Recurrente</option>
                        </select>
                      </div>
                    </div>

                    {tipoGastoSeleccionado[i] === 'unico' && (
                      <input type="date" name="fecha" className="form-control mb-2" />
                    )}

                    {tipoGastoSeleccionado[i] === 'recurrente' && (
                      <>
                        <select
                          name="frecuencia"
                          className="form-select mb-2"
                          onChange={(e) => setFrecuenciaSeleccionada({ ...frecuenciaSeleccionada, [i]: e.target.value })}
                        >
                          <option value="">Selecciona frecuencia</option>
                          <option value="mensual">Mensual</option>
                          <option value="semanal">Semanal</option>
                          <option value="catorcenal">Catorcenal</option>
                          <option value="diario">Diario</option>
                        </select>

                        {frecuenciaSeleccionada[i] === 'mensual' && (
                          <input type="number" name="diaMes" className="form-control mb-2" placeholder="Día del mes" />
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
                      </>
                    )}

                    <div className="row g-2 mb-2 align-items-center">
                      <div className="col-auto">
                        <input type="checkbox" className="form-check-input" name="esMSI" id={`msi-${i}`} />
                        <label htmlFor={`msi-${i}`} className="form-check-label ms-2">¿MSI?</label>
                      </div>
                      <div className="col-4">
                        <input type="number" name="mesesMSI" className="form-control" placeholder="# meses" />
                      </div>
                    </div>

                    <button className="btn btn-outline-primary w-100 btn-sm">Agregar gasto</button>
                  </form>

                  <ul className="list-group small">
                    {t.gastos.map((g, j) => (
                      <li key={j} className="list-group-item d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{g.descripcion}</strong> — ${g.monto.toFixed(2)}<br />
                          <small>
                            {g.tipo === 'unico' ? `Único • Fecha: ${g.fecha}` : `Recurrente • ${g.frecuencia} ${g.diaMes || g.diaSemana || ''}`}
                            {mostrarMontoMSI(g)}
                          </small>
                        </div>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleEliminarGasto(i, j)}>🗑</button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TarjetasDashboard;
