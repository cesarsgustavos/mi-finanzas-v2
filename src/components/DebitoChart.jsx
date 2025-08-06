import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * Recibe: data = [{ fecha, ingresos, gastos, rendimientos, saldo }]
 */
export default function DebitoChart({ data }) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="fecha" />
          <YAxis />
          <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
          <Legend />
          <Line
            type="monotone"
            dataKey="ingresos"
            name="Ingresos"
            stroke="#28a745"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="gastos"
            name="Gastos"
            stroke="#dc3545"
            strokeWidth={2}
            dot={false}
          />
      <Line
  type="monotone"
  dataKey="rendimientosPlanchados"
  name="Rendimientos (plancheados)"
  stroke="#ffc107"
  strokeWidth={2}
  dot={false}
/>
<Line
  type="monotone"
  dataKey="rendimientosSimulados"
  name="Rendimientos (simulados)"
  stroke="#fd7e14"
  strokeDasharray="5 5"
  strokeWidth={2}
  dot={false}
/>
          
          <Line
            type="monotone"
            dataKey="saldo"
            name="Saldo"
            stroke="#007bff"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
