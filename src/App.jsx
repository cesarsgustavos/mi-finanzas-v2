import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './services/firebase';

import Dashboard from './pages/Dashboard';
import Captura from './pages/Captura';
import Tarjetas from './pages/Tarjetas';
import TarjetasDebito from './pages/TarjetasDebito'; // importar la nueva página
import Login from './components/Login';
import Sidebar from './components/Sidebar'; // ✅ usamos Sidebar con logout
import Reportes from "./pages/Reportes";


function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setUsuario(user);
      setCargando(false);
    });
    return () => unsubscribe();
  }, []);

  if (cargando) return <p className="text-center mt-5">Cargando...</p>;

  const estaLogueado = Boolean(usuario);
  const esLogin = location.pathname === '/login';

  if (!estaLogueado && !esLogin) {
    return <Navigate to="/login" replace />;
  }

  // Si está en /login, solo renderizamos el login
  if (esLogin) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  // Si está logueado, mostramos la app con Sidebar
  return (
    <div className="d-flex min-vh-100">
      <Sidebar /> {/* ✅ Sidebar ya contiene enlaces y botón de logout */}

      <main className="flex-fill bg-light p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/captura" element={<Captura />} />
          <Route path="/tarjetas" element={<Tarjetas />} />
          <Route path="/tarjetas-debito" element={<TarjetasDebito />} /> {/* nueva ruta */}
          <Route path="/reporte" element={<Reportes />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
