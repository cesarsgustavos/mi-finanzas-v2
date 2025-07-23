import { useEffect, useState } from 'react';
import { format, addDays, isAfter, isBefore, isEqual, parseISO, nextDay, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

const diasMap = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6
};

function calcularImporte(m) {
  const { monto, frecuenciaTipo, frecuencia } = m;
  if (frecuenciaTipo === 'único') {
    return monto;
  }
  switch (frecuencia) {
    case 'diario':
      return monto * 14;
    case 'semanal':
      return monto * 2;
    case 'catorcenal':
      return monto;
    case 'mensual':
      return monto;
    default:
      return 0;
  }
}

function calcularFechaPago(tarjeta, fechaGasto) {
  if (!fechaGasto) return null;
  const fecha = typeof fechaGasto === 'string' ? parseISO(fechaGasto) : fechaGasto;
  const corte = parseInt(tarjeta.diaCorte);
  const diasCredito = parseInt(tarjeta.diasCredito);
  if (isNaN(corte) || isNaN(diasCredito)) return null;

  const anio = fecha.getFullYear();
  const mes = fecha.getMonth();

  const fechaCorte = new Date(anio, mes, corte);
  const fechaRealCorte = fecha > fechaCorte ? new Date(anio, mes + 1, corte) : fechaCorte;
  return addDays(fechaRealCorte, diasCredito);
}

function DashboardCatorcena() {
  const [catorcenas, setCatorcenas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);

  useEffect(() => {
    const generarCatorcenas = () => {
      const year = new Date().getFullYear();
      const inicio = new Date(year, 0, 10);
      const finAnio = new Date(year, 11, 31);
      const lista = [];
      for (let fecha = inicio; fecha <= finAnio; fecha = addDays(fecha, 14)) {
        lista.push({ inicio: new Date(fecha), fin: addDays(new Date(fecha), 13) });
      }
      setCatorcenas(lista);
    };

    const cargarDatos = async () => {
      try {
        const movSnap = await getDocs(collection(db, 'movimientos'));
        setMovimientos(movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error al cargar movimientos:', error);
      }
      try {
        const tarSnap = await getDocs(collection(db, 'tarjetas'));
        setTarjetas(tarSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error al cargar tarjetas:', error);
      }
    };

    generarCatorcenas();
    cargarDatos();
  }, []);

  const movimientosPorCatorcenaYTipo = (inicio, fin, tipo) =>
    movimientos.filter(m => {
      if (m.tipo !== tipo) return false;
      const fecha = m.fecha instanceof Date ? m.fecha : parseISO(m.fecha);
      if (m.frecuenciaTipo === 'único') {
        return (isAfter(fecha, inicio) || isEqual(fecha, inicio)) &&
               (isBefore(fecha, fin)   || isEqual(fecha, fin));
      }
      let inicioRec = m.fechaInicio ? parseISO(m.fechaInicio) : new Date(0);
      if (isAfter(inicioRec, fin)) return false;
      switch (m.frecuencia) {
        case 'mensual': {
          const mensual = new Date(inicio.getFullYear(), inicio.getMonth(), Number(m.diaMes));
          return mensual >= inicio && mensual <= fin && mensual >= inicioRec;
        }
        case 'semanal': {
          const wd = diasMap[m.diaSemana];
          const primera = nextDay(inicioRec, wd);
          return (isAfter(primera, inicio) || isEqual(primera, inicio)) &&
                 (isBefore(primera, fin)   || isEqual(primera, fin));
        }
        case 'catorcenal': {
          const diff = differenceInDays(inicio, inicioRec);
          return diff >= 0 && diff % 14 === 0;
        }
        case 'diario':
          return inicioRec <= fin;
        default:
          return false;
      }
    });

  return (
    <div style={{ overflowX: 'auto', maxWidth: '100vw' }}>
      <div className="d-flex" style={{ minWidth: '1000px' }}>
        {catorcenas.map((c, i) => {
          const displayStart = addDays(c.inicio, 1);
          const displayEnd = addDays(c.fin, 1);

          const ingresos = movimientosPorCatorcenaYTipo(c.inicio, c.fin, 'ingreso');
          const totIng = ingresos.reduce((sum, m) => sum + calcularImporte(m), 0);

          const gastosUnicos = movimientosPorCatorcenaYTipo(c.inicio, c.fin, 'gasto')
            .filter(m => m.frecuenciaTipo === 'único');
          const totGastosUnicos = gastosUnicos.reduce((sum, m) => sum + calcularImporte(m), 0);

          const gastosRecurrentes = movimientosPorCatorcenaYTipo(c.inicio, c.fin, 'gasto')
            .filter(m => m.frecuenciaTipo === 'recurrente');
          const totGastosRecurrentes = gastosRecurrentes.reduce((sum, m) => sum + calcularImporte(m), 0);

          const acumuladoPorTarjeta = tarjetas.map(tar => {
            const gastosFiltrados = (tar.gastos || []).filter(g => {
              let fechaBase = g.fecha ? parseISO(g.fecha) : null;
              if (!fechaBase) return false;
              const fechaPago = calcularFechaPago(tar, fechaBase);
              return fechaPago && fechaPago >= c.inicio && fechaPago <= c.fin;
            });
            const total = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
            return { id: tar.id, nombre: tar.nombre, total };
          }).filter(t => t.total > 0);

          const saldo = totIng - totGastosUnicos - totGastosRecurrentes;

          return (
            <div key={i} className="border p-3 me-3" style={{ minWidth: '300px' }}>
              <h6 className="text-center">
                {format(displayStart, 'd MMMM', { locale: es })} – {format(displayEnd, 'd MMMM', { locale: es })}
              </h6>

              <p className="text-center small fw-bold text-success">Ingresos: ${totIng.toFixed(2)}</p>
              <p className="text-center small fw-bold text-danger">Gastos (únicos): ${totGastosUnicos.toFixed(2)}</p>
              <p className="text-center small fw-bold text-danger">Gastos recurrentes: ${totGastosRecurrentes.toFixed(2)}</p>
              <p className={`text-center small fw-bold ${saldo >= 0 ? 'text-success' : 'text-danger'}`}>Saldo a favor: ${saldo.toFixed(2)}</p>

              <hr />
              <div>
                <strong>💳 Acumulado Tarjetas</strong>
                <ul className="list-unstyled small">
                  {acumuladoPorTarjeta.length > 0 ? (
                    acumuladoPorTarjeta.map(t => (
                      <li key={t.id}>{t.nombre}: ${t.total.toFixed(2)}</li>
                    ))
                  ) : (
                    <li className="text-muted">Sin movimientos en tarjetas</li>
                  )}
                </ul>
              </div>

              <hr />
              <div>
                <strong>🟩 Ingresos</strong>
                <ul className="list-unstyled small">
                  {ingresos.map(m => (
                    <li key={m.id}>+ ${calcularImporte(m).toFixed(2)} — {m.descripcion}</li>
                  ))}
                  {ingresos.length === 0 && <li className="text-muted">Sin ingresos</li>}
                </ul>
              </div>

              <div className="mt-3">
                <strong>🟥 Gastos (únicos)</strong>
                <ul className="list-unstyled small">
                  {gastosUnicos.map(m => (
                    <li key={m.id}>- ${calcularImporte(m).toFixed(2)} — {m.descripcion}</li>
                  ))}
                  {gastosUnicos.length === 0 && <li className="text-muted">Sin gastos únicos</li>}
                </ul>
              </div>

              <div className="mt-3">
                <strong>🟥 Gastos recurrentes</strong>
                <ul className="list-unstyled small">
                  {gastosRecurrentes.map(m => (
                    <li key={m.id}>- ${calcularImporte(m).toFixed(2)} — {m.descripcion}</li>
                  ))}
                  {gastosRecurrentes.length === 0 && <li className="text-muted">Sin gastos recurrentes</li>}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DashboardCatorcena;
