function Header() {
  return (
    <div className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
      <h4 className="mb-0">Resumen Catorcenal</h4>
      <div>
        <span className="me-3">Gustavo Salame</span>
        <button className="btn btn-outline-primary btn-sm">Cerrar sesión</button>
      </div>
    </div>
  );
}

export default Header;
