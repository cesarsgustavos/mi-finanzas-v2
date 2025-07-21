function Sidebar() {
  return (
    <div className="bg-light border-end vh-100 p-3" style={{ width: "220px" }}>
      <h5 className="text-dark">Mi Finanzas</h5>
      <ul className="nav flex-column mt-4">
        <li className="nav-item">
          <a className="nav-link active" href="#">Dashboard</a>
        </li>
        <li className="nav-item">
          <a className="nav-link" href="#">Gastos</a>
        </li>
        <li className="nav-item">
          <a className="nav-link" href="#">Ingresos</a>
        </li>
        <li className="nav-item">
          <a className="nav-link" href="#">Tarjetas</a>
        </li>
      </ul>
    </div>
  );
}

export default Sidebar;
