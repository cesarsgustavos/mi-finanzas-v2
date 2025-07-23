import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parse } from 'date-fns';

// CatorcenaChart recibe props.data: arreglo de objetos { periodo: string, Ingresos, Gastos, Tarjetas }
export default function CatorcenaChart({ data }) {
  // Convertir periodo "dd MMM - dd MMM" a fecha para ejes (opcional)
  const formatted = data.map(item => ({
    ...item,
    // parseamos fecha inicial para eje X (usamos primer día)
    _fecha: parse(item.periodo.split(' - ')[0], 'dd MMM', new Date())
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={formatted} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <XAxis
          dataKey="periodo"
          tickFormatter={str => str.split(' - ')[0]}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis />
        <Tooltip formatter={value => `$${Number(value).toFixed(2)}`} />
+      <Bar dataKey="Ingresos" stackId="a" fill="#4CAF50" />
+      <Bar dataKey="Gastos"   stackId="a" fill="#F44336" />
+      <Bar dataKey="Tarjetas" stackId="a" fill="#FF9800" />
      </BarChart>
    </ResponsiveContainer>
  );
}
