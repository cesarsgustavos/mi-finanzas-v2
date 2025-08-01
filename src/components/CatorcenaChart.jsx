import React from 'react';

/**
 * Componente de apoyo que presenta un resumen de las catorcenas en forma de
 * tabla. Se listan los periodos y los totales de ingresos, gastos y cargos
 * de tarjetas. Este componente es deliberadamente simple para evitar
 * dependencias externas de gráficos; si se desea un gráfico más elaborado,
 * puede reemplazarse por una biblioteca como Recharts en el futuro.
 *
 * @param {Object[]} data Arreglo de objetos con las claves periodo,
 *   Ingresos, Gastos y Tarjetas.
 */
export default function CatorcenaChart({ data }) {
  return (
    <div>
      <h5 className="mb-3">Resumen de catorcenas</h5>
      <div className="table-responsive">
        <table className="table table-sm table-bordered">
          <thead className="table-light">
            <tr>
              <th>Periodo</th>
              <th className="text-success">Ingresos</th>
              <th className="text-danger">Gastos</th>
              <th className="text-warning">Tarjetas</th>
              <th className="text-primary">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const ingresos = row.Ingresos || 0;
              const gastos = row.Gastos || 0;
              const tarjetas = row.Tarjetas || 0;
              const balance = ingresos + gastos + tarjetas;
              return (
                <tr key={idx}>
                  <td>{row.periodo}</td>
                  <td className="text-success">${ingresos.toFixed(2)}</td>
                  <td className="text-danger">-${Math.abs(gastos).toFixed(2)}</td>
                  <td className="text-warning">${Math.abs(tarjetas).toFixed(2)}</td>
                  <td className={balance >= 0 ? 'text-success' : 'text-danger'}>
                    {balance >= 0 ? '+' : '-'}${Math.abs(balance).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}