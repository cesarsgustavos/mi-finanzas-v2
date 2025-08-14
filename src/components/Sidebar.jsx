import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";

function Sidebar() {
  const navigate = useNavigate();

const handleLogout = async () => {
  try {
    await signOut(auth);
    navigate("/login");
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
};

  return (
    <div className="bg-light border-end vh-100 p-3" style={{ width: "220px" }}>
      <h5 className="text-dark">Mi Finanzas</h5>

      <ul className="nav flex-column mt-4">
        <li className="nav-item">
          <Link to="/" className="nav-link">📊 Dashboard</Link>
        </li>
        <li className="nav-item">
          <Link to="/captura" className="nav-link">✍️ Captura</Link>
        </li>
        <li className="nav-item">
          <Link to="/tarjetas" className="nav-link">💳 Tarjetas de Credito</Link>
        </li>
        <li>
  <Link to="/tarjetas-debito" className="nav-link">
    🏦 Tarjetas de débito
  </Link>
</li>
<li>
  <Link to="/reporte">
    <i className="fa fa-chart-bar"></i> Reporte
  </Link>
</li>
      </ul>

      <hr />

      {/* Botón de cerrar sesión */}
<button onClick={handleLogout} className="btn btn-outline-danger btn-sm w-100">
  Cerrar sesión
</button>

      {/* Si quieres mostrar el usuario: */}
      {/* <div className="text-muted small mt-3">{auth.currentUser?.email}</div> */}
    </div>
  );
}

export default Sidebar;

