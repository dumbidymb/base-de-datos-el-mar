import { useState } from "react";
import { api } from "./api";
import Panel from "./Panel";
import Cobro from "./Cobro";
import Menu from "./Menu";
import Mesas from "./Mesas";
import Usuarios from "./Usuarios";
import Inventario from "./Inventario";
import Recetas from "./Recetas";
import Compras from "./Compras";
import Gastos from "./Gastos";
import Reportes from "./Reportes";
import "./App.css";

const VISTAS = {
  panel: ["Panel", Panel],
  cobro: ["Cobro", Cobro],
  reportes: ["Reportes", Reportes],
  gastos: ["Gastos", Gastos],
  menu: ["Menú", Menu],
  mesas: ["Mesas", Mesas],
  inventario: ["Inventario", Inventario],
  recetas: ["Recetas", Recetas],
  compras: ["Compras", Compras],
  usuarios: ["Usuarios", Usuarios],
};

function Login({ onEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    try {
      const u = await api.post("/login", { usuario: usuario.trim(), contrasena });
      if (u.rol !== "ADMINISTRADOR") throw new Error("Esta app es solo para administradores");
      onEntrar(u);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    }
    setCargando(false);
  };

  return (
    <main className="login">
      <form onSubmit={entrar}>
        <h1>Administración</h1>
        <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
        <input type="password" placeholder="Contraseña" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="current-password" />
        {error && <p className="error">{error}</p>}
        <button className="btn primario grande" disabled={cargando || !usuario || !contrasena}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("usuario"));
    } catch {
      return null;
    }
  });
  const [vista, setVista] = useState("panel");

  const entrar = (u) => {
    sessionStorage.setItem("usuario", JSON.stringify(u));
    setUsuario(u);
  };
  const salir = () => {
    sessionStorage.removeItem("usuario");
    setUsuario(null);
  };

  if (!usuario) return <Login onEntrar={entrar} />;

  const Vista = VISTAS[vista][1];
  return (
    <div className="shell">
      <aside className="lateral">
        <strong className="marca-app">Administración</strong>
        <nav>
          {Object.entries(VISTAS).map(([clave, [titulo]]) => (
            <button key={clave} className={clave === vista ? "sel" : ""} onClick={() => setVista(clave)}>
              {titulo}
            </button>
          ))}
        </nav>
        <div className="sesion">
          <span>{usuario.nombre}</span>
          <button onClick={salir}>Salir</button>
        </div>
      </aside>
      <main className="contenido">
        <Vista yo={usuario} />
      </main>
    </div>
  );
}