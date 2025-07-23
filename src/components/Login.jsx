// src/components/Login.jsx
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../services/firebase";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
      navigate("/dashboard"); // redirige al dashboard si el login fue exitoso
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      alert("Ocurrió un error al iniciar sesión.");
    }
  };

  return (
    <div className="container mt-5 text-center">
      <h2 className="mb-4">Iniciar sesión</h2>
      <button className="btn btn-danger" onClick={handleLogin}>
        Iniciar sesión con Google
      </button>
    </div>
  );
}

export default Login;
