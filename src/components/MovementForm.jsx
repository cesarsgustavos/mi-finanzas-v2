import { useEffect, useState } from 'react';
import { FaUtensils, FaHome, FaBus, FaHeartbeat, FaWallet } from 'react-icons/fa';

const categoriasCatalogo = [
  { nombre: 'Alimentos', icono: <FaUtensils /> },
  { nombre: 'Vivienda', icono: <FaHome /> },
  { nombre: 'Transporte', icono: <FaBus /> },
  { nombre: 'Salud', icono: <FaHeartbeat /> },
  { nombre: 'Otros', icono: <FaWallet /> },
];

function MovementForm({ onAdd, movimientoEditar }) {
  const [form, setForm] = useState({
    tipo: 'gasto',
    monto: '',
    descripcion: '',
    frecuenciaTipo: 'único',
    frecuencia: '',
    diaMes: '',
    diaSemana: '',
    fecha: '',
    categoria: ''
  });

  useEffect(() => {
    if (movimientoEditar) {
      setForm(movimientoEditar);
    }
  }, [movimientoEditar]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleCategoriaSelect = (categoria) => {
    setForm({ ...form, categoria });
  };

  const isFormValid = () => {
    if (!form.monto || !form.descripcion || !form.categoria) return false;
    if (form.frecuenciaTipo === 'único' && !form.fecha) return false;
    if (form.frecuenciaTipo === 'recurrente' && !form.frecuencia) return false;
    if (form.frecuencia === 'mensual' && !form.diaMes) return false;
    if (form.frecuencia === 'semanal' && !form.diaSemana) return false;
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid()) return;

    const movimiento = {
      ...form,
      monto: parseFloat(form.monto)
    };

    onAdd(movimiento);

    setForm({
      tipo: 'gasto',
      monto: '',
      descripcion: '',
      frecuenciaTipo: 'único',
      frecuencia: '',
      diaMes: '',
      diaSemana: '',
      fecha: '',
      categoria: ''
    });
  };

  const mostrarFrecuencia = form.frecuenciaTipo === 'recurrente';

  return (
    <form className="border p-4 rounded bg-white shadow-sm" onSubmit={handleSubmit}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Tipo</label>
          <select className="form-select" name="tipo" value={form.tipo} onChange={handleChange}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </div>

        <div className="col-md-6">
          <label className="form-label">¿Es único o recurrente?</label>
          <select className="form-select" name="frecuenciaTipo" value={form.frecuenciaTipo} onChange={handleChange}>
            <option value="único">Único</option>
            <option value="recurrente">Recurrente</option>
          </select>
        </div>

        {mostrarFrecuencia && (
          <div className="col-md-6">
            <label className="form-label">Frecuencia</label>
            <select className="form-select" name="frecuencia" value={form.frecuencia} onChange={handleChange}>
              <option value="">Seleccionar</option>
              <option value="diario">Diario</option>
              <option value="semanal">Semanal</option>
              <option value="catorcenal">Catorcenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
        )}

        {form.frecuencia === 'mensual' && (
          <div className="col-md-6">
            <label className="form-label">Día del mes</label>
            <input type="number" className="form-control" name="diaMes" value={form.diaMes} onChange={handleChange} min="1" max="31" />
          </div>
        )}

        {form.frecuencia === 'semanal' && (
          <div className="col-md-6">
            <label className="form-label">Día de la semana</label>
            <select className="form-select" name="diaSemana" value={form.diaSemana} onChange={handleChange}>
              <option value="">Seleccionar</option>
              <option value="lunes">Lunes</option>
              <option value="martes">Martes</option>
              <option value="miércoles">Miércoles</option>
              <option value="jueves">Jueves</option>
              <option value="viernes">Viernes</option>
              <option value="sábado">Sábado</option>
              <option value="domingo">Domingo</option>
            </select>
          </div>
        )}

        {form.frecuenciaTipo === 'único' && (
          <div className="col-md-6">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-control" name="fecha" value={form.fecha} onChange={handleChange} />
          </div>
        )}

        <div className="col-md-6">
          <label className="form-label">Monto</label>
          <input type="number" className="form-control" name="monto" value={form.monto} onChange={handleChange} />
        </div>

        <div className="col-md-6">
          <label className="form-label">Descripción</label>
          <input type="text" className="form-control" name="descripcion" value={form.descripcion} onChange={handleChange} />
        </div>

        <div className="col-md-12">
          <label className="form-label">Categoría</label>
          <div className="d-flex flex-wrap gap-2">
            {categoriasCatalogo.map((cat) => (
              <button
                type="button"
                key={cat.nombre}
                className={`btn btn-sm ${form.categoria === cat.nombre ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleCategoriaSelect(cat.nombre)}
              >
                {cat.icono} {cat.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="col-12">
          <button type="submit" className="btn btn-success w-100" disabled={!isFormValid()}>
            {movimientoEditar ? 'Guardar cambios' : 'Registrar'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default MovementForm;
