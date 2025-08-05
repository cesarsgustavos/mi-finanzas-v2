// src/components/DebitoChart.jsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * Gráfica de líneas para mostrar la evolución del saldo o los movimientos
 * de una tarjeta de débito. Se espera un arreglo de objetos con las claves
 * `fecha` (YYYY-MM-DD) y `saldo` (número).
 */
export default function DebitoChart({ data }) {
  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="fecha" />
          <YAxis />
          <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
          <Line
            type="monotone"
            dataKey="saldo"
            stroke="#8884d8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
