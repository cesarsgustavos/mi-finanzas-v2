import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Captura from './pages/Captura';
import Tarjetas from './pages/Tarjetas';

function App() {
  return (
    <div className="d-flex min-vh-100">
      {/* SIDEBAR */}
      <aside className="bg-dark text-white p-3" style={{ width: '220px' }}>
        <h5 className="mb-4">💰 Finanzas</h5>
        <nav className="nav flex-column gap-2">
          <Link to="/" className="nav-link text-white">📊 Dashboard</Link>
          <Link to="/captura" className="nav-link text-white">✍️ Captura</Link>
          <Link to="/tarjetas" className="nav-link text-white">💳 Tarjetas</Link>
        </nav>
      </aside>

      {/* CONTENIDO */}
      <main className="flex-fill bg-light p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/captura" element={<Captura />} />
          <Route path="/tarjetas" element={<Tarjetas />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
