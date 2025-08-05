import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { parseISO, format } from 'date-fns';

export default function ResumenGrafica({ tarjetas, movimientos }) {
  const resumenMensual = {};

  tarjetas.forEach(t => {
    const movs = movimientos[t.id] || [];
    movs.forEach(m => {
      if (!m.fecha || !m.monto) return;
      const mes = format(parseISO(m.fecha), 'yyyy-MM');
      if (!resumenMensual[mes]) {
        resumenMensual[mes] = { mes, ingresos: 0, gastos: 0, rendimiento: 0 };
      }
      if (m.tipo === 'ingreso') {
        if (m.descripcion?.toLowerCase().includes('rendimiento')) {
          resumenMensual[mes].rendimiento += m.monto;
        } else {
          resumenMensual[mes].ingresos += m.monto;
        }
      } else if (m.tipo === 'gasto') {
        resumenMensual[mes].gastos += m.monto;
      }
    });
  });

  const data = Object.values(resumenMensual).sort((a, b) => a.mes.localeCompare(b.mes));

  return (
    <div className="card mt-4 p-3">
      <h5>Resumen Mensual</h5>
      {data.length === 0 ? (
        <p>No hay datos suficientes.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="ingresos" fill="#198754" />
            <Bar dataKey="gastos" fill="#dc3545" />
            <Bar dataKey="rendimiento" fill="#0d6efd" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
