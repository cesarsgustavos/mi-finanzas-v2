// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../services/firebase";

import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip,
  Title,
} from "chart.js";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  addMonths,
  endOfMonth,
  parseISO,
  isBefore,
  isAfter,
} from "date-fns";

// =============== Registro Chart.js ===============
ChartJS.register(
  ArcElement,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip,
  Title
);

// =============== Utilidades ===============
const COLORS = {
  lineMSI: "#1e88e5",
  lineMSIbg: "rgba(30, 136, 229, .18)",
  pie: ["#9e9e9e", "#ff9800", "#3f51b5"], // Normal, Recurrente, MSI
};

const fmtMXN = (n) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });

// YYYY-MM-DD local (evitar UTC/toISOString)
const ymdLocal = (d) => {
  const pad = (x) => (x < 10 ? `0${x}` : `${x}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Sumar meses manteniendo día; si no existe, clampa al último día del mes
function addMonthsSameDaySafe(date, months) {
  const target = addMonths(date, months);
  const last = endOfMonth(target).getDate();
  const desired = date.getDate();
  const d = new Date(target);
  d.setDate(Math.min(desired, last));
  return d;
}

// Próximo pago y fecha fin MSI (todo en local, sin UTC)
function calcularMSIDetalle(g) {
  if (!g?.esMSI || !g?.mesesMSI || !g?.fecha) return null;
  const base = parseISO(g.fecha); // se asume 'YYYY-MM-DD'
  if (isNaN(base)) return null;

  const cuotaMensual = (Number(g.monto) || 0) / Number(g.mesesMSI);
  const hoy = new Date();
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const cuotas = Array.from({ length: g.mesesMSI }, (_, i) =>
    addMonthsSameDaySafe(base, i)
  );
  const fechaFin = ymdLocal(cuotas[cuotas.length - 1]);

  const proximoPagoDate =
    cuotas.find((d) => d >= hoyLocal) ?? cuotas[cuotas.length - 1];
  const proximoPago = ymdLocal(proximoPagoDate);

  const pagosRealizados = cuotas.filter((d) => d < hoyLocal).length;
  const pagosRestantes = Math.max(g.mesesMSI - pagosRealizados, 0);

  return {
    cuotaMensual,
    pagosRealizados,
    pagosRestantes,
    proximoPago,
    fechaFin,
  };
}

// Fecha base (para filtros): único -> fecha ; recurrente -> fechaInicio
const fechaBaseMov = (m) => m?.fecha || m?.fechaInicio || null;

// Helpers
const sortBy = (arr, keyFn) =>
  [...arr].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka === kb) return 0;
    return ka < kb ? -1 : 1;
  });

// =============== Componente principal ===============
export default function Reportes() {
  const [usuario, setUsuario] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]); // crédito
  const [tarjetasDebito, setTarjetasDebito] = useState([]);

  // Filtros (SOLO afectan “Gastos (general)”)
  const [filtroInicio, setFiltroInicio] = useState(""); // YYYY-MM-DD
  const [filtroFin, setFiltroFin] = useState(""); // YYYY-MM-DD

  // Toggle para incluir débito en gráficas (por defecto: false)
  const [incluirDebitoEnGraficas, setIncluirDebitoEnGraficas] = useState(false);

  // ---- auth ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUsuario(u));
    return () => unsub();
  }, []);

  // ---- cargar movimientos generales ----
  useEffect(() => {
    const cargar = async () => {
      if (!usuario) {
        setMovimientos([]);
        return;
      }
      const ref = collection(db, "movimientos");
      const q = query(ref, where("userId", "==", usuario.uid));
      const snap = await getDocs(q);
      setMovimientos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    cargar();
  }, [usuario]);

  // ---- cargar tarjetas crédito ----
  useEffect(() => {
    const cargar = async () => {
      if (!usuario) {
        setTarjetas([]);
        return;
      }
      const ref = collection(db, "tarjetas");
      const q = query(ref, where("userId", "==", usuario.uid));
      const snap = await getDocs(q);
      setTarjetas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    cargar();
  }, [usuario]);

  // ---- cargar tarjetas débito ----
  useEffect(() => {
    const cargar = async () => {
      if (!usuario) {
        setTarjetasDebito([]);
        return;
      }
      const ref = collection(db, "tarjetasDebito");
      const q = query(ref, where("userId", "==", usuario.uid));
      const snap = await getDocs(q);
      setTarjetasDebito(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    cargar();
  }, [usuario]);

  // =================== TABLAS ===================

  // ---- 1) Gastos (general) -> ESTA SÍ USA FILTRO ----
  const enRango = (fechaStr) => {
    if (!fechaStr) return false;
    if (!filtroInicio && !filtroFin) return true;
    const d = parseISO(fechaStr);
    if (isNaN(d)) return false;
    if (filtroInicio && isBefore(d, parseISO(filtroInicio))) return false;
    if (filtroFin && isAfter(d, parseISO(filtroFin))) return false;
    return true;
  };

  const gastosTabla = useMemo(() => {
    const generales = movimientos
      .filter((m) => m.tipo === "gasto" && enRango(fechaBaseMov(m)))
      .map((m) => ({ origen: "General", ...m }));

    const credito = tarjetas.flatMap((t) =>
      (t.gastos || [])
        .filter((g) => enRango(fechaBaseMov(g)))
        .map((g) => ({ origen: `TC: ${t.nombre}`, tipo: "gasto", ...g }))
    );

    const debito = tarjetasDebito.flatMap((t) =>
      (t.movimientos || [])
        .filter((m) => m.tipo === "gasto" && enRango(fechaBaseMov(m)))
        .map((m) => ({ origen: `TD: ${t.nombre}`, ...m }))
    );

    const lista = [...generales, ...credito, ...debito];
    return sortBy(lista, (x) => fechaBaseMov(x) || "9999-12-31"); // orden por fecha asc
  }, [movimientos, tarjetas, tarjetasDebito, filtroInicio, filtroFin]);

  const totalGastosTabla = useMemo(
    () => gastosTabla.reduce((s, m) => s + (Number(m.monto) || 0), 0),
    [gastosTabla]
  );

  // ---- 2) Recurrentes (SOLO GASTOS) -> NO usa filtro ----
  const recurrentesTabla = useMemo(() => {
    const esRec = (x) =>
      x?.frecuenciaTipo === "recurrente" ||
      ["mensual", "semanal", "catorcenal", "diario"].includes(x?.frecuencia || "");

    const lista = [];

    // Generales (solo gastos)
    movimientos.forEach((m) => {
      const rec = esRec(m);
      if (rec && m.tipo === "gasto") {
        lista.push({
          origen: "General",
          tipo: "gasto",
          descripcion: m.descripcion,
          monto: Number(m.monto) || 0,
          frecuencia: m.frecuencia || "—",
          fechaInicio: m.fechaInicio || "—",
          esMSI: false,
        });
      }
    });

    // Crédito (MSI como recurrentes + recurrentes NO-MSI) -> todos son gastos
    tarjetas.forEach((t) => {
      (t.gastos || []).forEach((g) => {
        const detMSI = calcularMSIDetalle(g);
        const esMSI = !!detMSI;
        const recNoMSI =
          !esMSI &&
          (g.frecuenciaTipo === "recurrente" ||
            ["mensual", "semanal", "catorcenal", "diario"].includes(
              g.frecuencia || ""
            ));

        if (esMSI) {
          lista.push({
            origen: `TC: ${t.nombre}`,
            tipo: "gasto",
            descripcion: g.descripcion,
            monto: detMSI.cuotaMensual, // flujo mensual MSI
            frecuencia: `MSI (${g.mesesMSI})`,
            fechaInicio: g.fecha || g.fechaInicio || "—",
            esMSI: true,
          });
        }

        if (recNoMSI) {
          lista.push({
            origen: `TC: ${t.nombre}`,
            tipo: "gasto",
            descripcion: g.descripcion,
            monto: Number(g.monto) || 0,
            frecuencia: g.frecuencia || "—",
            fechaInicio: g.fechaInicio || g.fecha || "—",
            esMSI: false,
          });
        }
      });
    });

    // Débito recurrente (si existe) — también solo gastos
    tarjetasDebito.forEach((t) => {
      (t.movimientos || []).forEach((m) => {
        const rec =
          m?.frecuenciaTipo === "recurrente" ||
          ["mensual", "semanal", "catorcenal", "diario"].includes(
            m.frecuencia || ""
          );
        if (rec && m.tipo === "gasto") {
          lista.push({
            origen: `TD: ${t.nombre}`,
            tipo: "gasto",
            descripcion: m.descripcion,
            monto: Number(m.monto) || 0,
            frecuencia: m.frecuencia || "—",
            fechaInicio: m.fechaInicio || m.fecha || "—",
            esMSI: false,
          });
        }
      });
    });

    // Ordenar por fechaInicio asc (los sin fecha al final)
    return sortBy(lista, (x) => x.fechaInicio || "9999-12-31");
  }, [movimientos, tarjetas, tarjetasDebito]);

  const totalRecurrentesTabla = useMemo(
    () => recurrentesTabla.reduce((s, r) => s + (Number(r.monto) || 0), 0),
    [recurrentesTabla]
  );
  const totalRecurrentesMSI = useMemo(
    () =>
      recurrentesTabla
        .filter((r) => r.esMSI)
        .reduce((s, r) => s + (Number(r.monto) || 0), 0),
    [recurrentesTabla]
  );

  // ---- 3) Compras a MSI (NO usa filtro) ----
  const comprasMSI = useMemo(() => {
    const lista = [];
    tarjetas.forEach((t) => {
      (t.gastos || []).forEach((g) => {
        const det = calcularMSIDetalle(g);
        if (!det) return;
        lista.push({
          tarjeta: t.nombre,
          descripcion: g.descripcion,
          monto: Number(g.monto) || 0,
          mesesMSI: Number(g.mesesMSI) || 0,
          cuotaMensual: det.cuotaMensual,
          pagosRealizados: det.pagosRealizados,
          pagosRestantes: det.pagosRestantes,
          proximoPago: det.proximoPago,
          fechaFin: det.fechaFin,
          fecha: g.fecha, // para tabla/orden
        });
      });
    });
    return sortBy(lista, (x) => x.fecha || "9999-12-31");
  }, [tarjetas]);

  const totMSI = useMemo(
    () => ({
      monto: comprasMSI.reduce((s, x) => s + x.monto, 0),
      cuota: comprasMSI.reduce((s, x) => s + x.cuotaMensual, 0),
    }),
    [comprasMSI]
  );

  // =================== GRÁFICAS (2) — NO usan filtro ===================

  // A) Línea MSI por mes (flujo de cuotas hasta liquidar)
  function yyyymm(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const msiSerie = useMemo(() => {
    if (comprasMSI.length === 0) return { labels: [], data: [] };

    const comprasExpand = comprasMSI.map((c) => {
      const base = parseISO(c.fecha);
      const meses = c.mesesMSI;
      const cuotas = Array.from({ length: meses }, (_, i) =>
        addMonthsSameDaySafe(base, i)
      );
      return { c, cuotas };
    });

    const primera = comprasExpand.reduce(
      (min, x) => (x.cuotas[0] < min ? x.cuotas[0] : min),
      comprasExpand[0].cuotas[0]
    );
    const ultima = comprasExpand.reduce(
      (max, x) =>
        x.cuotas[x.cuotas.length - 1] > max
          ? x.cuotas[x.cuotas.length - 1]
          : max,
      comprasExpand[0].cuotas[comprasExpand[0].cuotas.length - 1]
    );

    const mesesMap = {};
    let cursor = new Date(primera.getFullYear(), primera.getMonth(), 1);
    const fin = new Date(ultima.getFullYear(), ultima.getMonth(), 1);
    while (cursor <= fin) {
      mesesMap[yyyymm(cursor)] = 0;
      cursor = addMonths(cursor, 1);
    }

    comprasExpand.forEach(({ c, cuotas }) => {
      cuotas.forEach((d) => {
        const key = yyyymm(d);
        if (mesesMap[key] !== undefined) {
          mesesMap[key] += c.cuotaMensual;
        }
      });
    });

    const labels = Object.keys(mesesMap).sort();
    const data = labels.map((k) => mesesMap[k]);
    return { labels, data };
  }, [comprasMSI]);

  const msiLineData = {
    labels: msiSerie.labels,
    datasets: [
      {
        label: "Flujo mensual MSI",
        data: msiSerie.data,
        borderColor: COLORS.lineMSI,
        backgroundColor: COLORS.lineMSIbg,
        fill: true,
        tension: 0.25,
        pointRadius: 2,
      },
    ],
  };
  const msiLineOpts = {
    plugins: {
      title: { display: true, text: "MSI por mes (hasta liquidar)" },
      tooltip: { callbacks: { label: (ctx) => fmtMXN(ctx.raw) } },
      legend: { position: "bottom" },
    },
    scales: { y: { ticks: { callback: (v) => fmtMXN(v) } } },
  };

  // B) Pastel: gastos Normal vs Recurrente vs MSI (por defecto SIN DÉBITO)
  const pieGastos = useMemo(() => {
    // Generales (SOLO gastos, sin filtro)
    const generales = movimientos.filter((m) => m.tipo === "gasto");
    // Crédito
    const credito = tarjetas.flatMap((t) => t.gastos || []);
    // Débito (opcional)
    const debito = incluirDebitoEnGraficas
      ? tarjetasDebito.flatMap((t) => (t.movimientos || []).filter((m) => m.tipo === "gasto"))
      : [];

    let totalNormal = 0;
    let totalRecurrente = 0;
    let totalMSI = 0;

    const esRec = (x) =>
      x?.frecuenciaTipo === "recurrente" ||
      ["mensual", "semanal", "catorcenal", "diario"].includes(x?.frecuencia || "");

    // Generales
    generales.forEach((m) => {
      if (esRec(m)) totalRecurrente += Number(m.monto) || 0;
      else totalNormal += Number(m.monto) || 0;
    });

    // Crédito
    credito.forEach((g) => {
      const det = calcularMSIDetalle(g);
      if (det) totalMSI += det.cuotaMensual; // flujo mensual MSI
      else if (esRec(g)) totalRecurrente += Number(g.monto) || 0;
      else totalNormal += Number(g.monto) || 0;
    });

    // Débito (solo si toggle)
    debito.forEach((m) => {
      if (esRec(m)) totalRecurrente += Number(m.monto) || 0;
      else totalNormal += Number(m.monto) || 0;
    });

    return {
      labels: ["Normal", "Recurrente", "MSI (cuota)"],
      values: [totalNormal, totalRecurrente, totalMSI],
    };
  }, [movimientos, tarjetas, tarjetasDebito, incluirDebitoEnGraficas]);

  const gastosPieData = {
    labels: pieGastos.labels,
    datasets: [
      {
        data: pieGastos.values,
        backgroundColor: COLORS.pie,
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    ],
  };
  const gastosPieOpts = {
    plugins: {
      title: { display: true, text: "Gastos: Normal vs Recurrente vs MSI" },
      tooltip: { callbacks: { label: (ctx) => fmtMXN(ctx.raw) } },
      legend: { position: "bottom" },
    },
  };

  // =================== EXPORTAR ===================
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja: Gastos (tabla simple, RESPETA filtros)
    const sheetGastos = XLSX.utils.json_to_sheet(
      gastosTabla.map((m) => ({
        Origen: m.origen,
        Monto: Number(m.monto) || 0,
        Descripción: m.descripcion,
        Categoría: m.categoria || "",
        FrecuenciaTipo: m.frecuenciaTipo || "",
        Frecuencia: m.frecuencia || "",
        Fecha: fechaBaseMov(m) || "",
      }))
    );
    XLSX.utils.book_append_sheet(wb, sheetGastos, "Gastos_(filtrados)");

    // Hoja: Recurrentes (NO usa filtros; solo gastos)
    const sheetRec = XLSX.utils.json_to_sheet(
      recurrentesTabla.map((r) => ({
        Origen: r.origen,
        Tipo: r.tipo,
        Descripción: r.descripcion,
        MontoFlujo: r.monto,
        Frecuencia: r.frecuencia,
        FechaInicio: r.fechaInicio,
        EsMSI: r.esMSI ? "Sí" : "No",
      }))
    );
    XLSX.utils.book_append_sheet(wb, sheetRec, "Recurrentes_(solo_gasto)");

    // Hoja: Compras MSI (NO usa filtros)
    const sheetMSI = XLSX.utils.json_to_sheet(
      comprasMSI.map((c) => ({
        Tarjeta: c.tarjeta,
        Descripción: c.descripcion,
        Meses: c.mesesMSI,
        CuotaMensual: c.cuotaMensual,
        PagosRealizados: c.pagosRealizados,
        PagosRestantes: c.pagosRestantes,
        ProximoPago: c.proximoPago,
        FechaFin: c.fechaFin,
        Monto: c.monto,
        FechaCompra: c.fecha,
      }))
    );
    XLSX.utils.book_append_sheet(wb, sheetMSI, "Compras_MSI");

    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([data], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
      }),
      "reporte_financiero.xlsx"
    );
  };

  // =============== Render ===============
  return (
    <div className="container my-4">
      <h1>Reporte financiero</h1>

      {/* Filtros (SOLO afectan la tabla “Gastos (general)”) */}
      <div className="row g-2 mb-3">
        <div className="col-auto">
          <label className="form-label mb-0">Desde</label>
          <input
            type="date"
            className="form-control"
            value={filtroInicio}
            onChange={(e) => setFiltroInicio(e.target.value)}
          />
        </div>
        <div className="col-auto">
          <label className="form-label mb-0">Hasta</label>
          <input
            type="date"
            className="form-control"
            value={filtroFin}
            onChange={(e) => setFiltroFin(e.target.value)}
          />
        </div>

        {/* Toggle por si quieres incluir DÉBITO en la gráfica de pastel */}
        <div className="col-auto d-flex align-items-end">
          <div className="form-check">
            <input
              id="debitoToggle"
              className="form-check-input"
              type="checkbox"
              checked={incluirDebitoEnGraficas}
              onChange={(e) => setIncluirDebitoEnGraficas(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="debitoToggle">
              Incluir débito en gráfica de pastel
            </label>
          </div>
        </div>

        <div className="col d-flex align-items-end">
          <div className="ms-auto">
            <button className="btn btn-primary" onClick={exportarExcel}>
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* ====== TABLA: Gastos (general) — USA filtros ====== */}
      <div className="mt-3">
        <h2>Gastos (general)</h2>
        <table className="table table-bordered table-sm">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Monto</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Frecuencia</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {gastosTabla.map((m, idx) => (
              <tr key={idx}>
                <td>{m.origen}</td>
                <td>{fmtMXN(m.monto)}</td>
                <td>{m.descripcion}</td>
                <td>{m.categoria || "-"}</td>
                <td>
                  {m.frecuenciaTipo === "recurrente"
                    ? m.frecuencia || "Recurrente"
                    : "Único"}
                </td>
                <td>{fechaBaseMov(m) || "-"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fw-bold">
              <td>Total</td>
              <td>{fmtMXN(totalGastosTabla)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ====== TABLA: Recurrentes (SOLO gastos; NO usa filtros) ====== */}
      <div className="mt-4">
        <h2>Gastos recurrentes (incluye MSI y TC)</h2>
        <table className="table table-bordered table-sm">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Monto (flujo)</th>
              <th>Frecuencia</th>
              <th>Fecha inicio</th>
              <th>MSI</th>
            </tr>
          </thead>
          <tbody>
            {recurrentesTabla.map((r, idx) => (
              <tr key={idx}>
                <td>{r.origen}</td>
                <td>{r.tipo}</td>
                <td>{r.descripcion}</td>
                <td>{fmtMXN(r.monto)}</td>
                <td>{r.frecuencia}</td>
                <td>{r.fechaInicio}</td>
                <td>{r.esMSI ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fw-bold">
              <td colSpan={3}>Total recurrentes</td>
              <td>{fmtMXN(totalRecurrentesTabla)}</td>
              <td colSpan={2}>Solo MSI (cuotas)</td>
              <td>{fmtMXN(totalRecurrentesMSI)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ====== TABLA: Compras a MSI (NO usa filtros) ====== */}
      <div className="mt-4">
        <h2>Compras a MSI</h2>
        <small className="text-muted">
          Fechas locales; “Próximo pago” se calcula con el día de compra.
        </small>
        <table className="table table-striped table-sm mt-2">
          <thead>
            <tr>
              <th>Fecha compra</th>
              <th>Tarjeta</th>
              <th>Descripción</th>
              <th>Meses</th>
              <th>Cuota mensual</th>
              <th>Pagos realizados</th>
              <th>Pagos restantes</th>
              <th>Próximo pago</th>
              <th>Fin de pagos</th>
              <th>Monto total</th>
            </tr>
          </thead>
          <tbody>
            {comprasMSI.map((c, idx) => (
              <tr key={idx}>
                <td>{c.fecha}</td>
                <td>{c.tarjeta}</td>
                <td>{c.descripcion}</td>
                <td>{c.mesesMSI}</td>
                <td>{fmtMXN(c.cuotaMensual)}</td>
                <td>{c.pagosRealizados}</td>
                <td>{c.pagosRestantes}</td>
                <td>{c.proximoPago}</td>
                <td>{c.fechaFin}</td>
                <td>{fmtMXN(c.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="fw-bold">
              <td colSpan={4}>Totales</td>
              <td>{fmtMXN(totMSI.cuota)}</td>
              <td colSpan={4}></td>
              <td>{fmtMXN(totMSI.monto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ====== GRÁFICAS (NO usan filtros) ====== */}
      <div style={{ maxWidth: 860, marginTop: 36 }}>
        <Line data={msiLineData} options={msiLineOpts} />
      </div>
      <div style={{ maxWidth: 420, marginTop: 36 }}>
        <Pie data={gastosPieData} options={gastosPieOpts} />
      </div>

      {/* Export */}
      <div className="mt-3">
        <button className="btn btn-primary" onClick={exportarExcel}>
          Exportar Excel
        </button>
      </div>
    </div>
  );
}
