import { useCallback, useEffect, useState } from "react";
import { MODO_DEMO, login, obtenerComandas, cambiarEstado, crearComandaDePrueba } from "./api";
import "./App.css";

const TABS = [
  { estado: "PENDIENTE", titulo: "Pendientes" },
  { estado: "EN_PREPARACION", titulo: "En preparación" },
  { estado: "ENTREGADO", titulo: "Entregados" },
];
const CLASE = { PENDIENTE: "pendiente", EN_PREPARACION: "preparando", ENTREGADO: "listo" };

function Tablero({ usuario, salir }) {
  const [comandas, setComandas] = useState([]);
  const [tab, setTab] = useState("PENDIENTE");
  const [ahora, setAhora] = useState(Date.now());
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      setComandas(await obtenerComandas());
      setError("");
    } catch (e) {
      setError(e.message || "Sin conexión con el servidor");
    }
    setAhora(Date.now());
  }, []);

  // Revisa si hay comandas nuevas cada 3 segundos
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 3000);
    return () => clearInterval(t);
  }, [cargar]);

  const mover = async (id, estado) => {
    try {
      await cambiarEstado(id, estado);
    } catch (e) {
      setError(e.message || "No se pudo actualizar la comanda");
    }
    cargar();
  };

  const prueba = async () => {
    await crearComandaDePrueba();
    cargar();
  };

  const de = (estado) => comandas.filter((c) => c.estado === estado);
  const visibles = tab === "ENTREGADO" ? de(tab).slice().reverse() : de(tab);

  return (
    <div className="app">
      <nav className="nav">
        <strong>Cocina</strong>
        <div className="sesion">
          {MODO_DEMO && <button onClick={prueba}>Comanda de prueba</button>}
          <span>{usuario.nombre}</span>
          <button className="salir" onClick={salir}>
            Salir
          </button>
        </div>
      </nav>

      <main className="cocina">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.estado} className={tab === t.estado ? "sel" : ""} onClick={() => setTab(t.estado)}>
              {t.titulo} ({de(t.estado).length})
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {visibles.length === 0 ? (
          <p className="vacio">No hay comandas en esta lista.</p>
        ) : (
          <div className="tickets">
            {visibles.map((c) => {
              const min = Math.max(0, Math.floor((ahora - Date.parse(c.fecha_hora)) / 60000));
              const tarde = min >= 10 && c.estado !== "ENTREGADO";
              return (
                <article key={c.id_comanda} className={`ticket ${CLASE[c.estado]} ${tarde ? "tarde" : ""}`}>
                  <header>
                    <h3>Mesa {c.numero_mesa}</h3>
                    <span>{min < 1 ? "ahora" : `${min} min`}</span>
                  </header>
                  <ul>
                    {c.detalle.map((d) => (
                      <li key={d.nombre}>
                        <b>{d.cantidad}</b> {d.nombre}
                      </li>
                    ))}
                  </ul>
                  {c.notas && <p className="nota">{c.notas}</p>}
                  {c.estado === "PENDIENTE" && (
                    <button className="preparar" onClick={() => mover(c.id_comanda, "EN_PREPARACION")}>
                      Empezar a preparar
                    </button>
                  )}
                  {c.estado === "EN_PREPARACION" && (
                    <button onClick={() => mover(c.id_comanda, "ENTREGADO")}>Marcar entregado</button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

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
      onEntrar(await login(usuario.trim(), contrasena));
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    }
    setCargando(false);
  };

  return (
    <div className="app">
      <nav className="nav">
        <strong>Cocina</strong>
      </nav>
      <main className="login">
        <form onSubmit={entrar}>
          <h2>Iniciar sesión</h2>
          <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
          <input type="password" placeholder="Contraseña" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="current-password" />
          {error && <p className="error">{error}</p>}
          <button className="entrar" disabled={cargando || (!MODO_DEMO && (!usuario || !contrasena))}>
            {cargando ? "Entrando…" : "Entrar"}
          </button>
          {MODO_DEMO && <p className="vacio">Modo demo: entra con cualquier usuario.</p>}
        </form>
      </main>
    </div>
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

  const entrar = (u) => {
    sessionStorage.setItem("usuario", JSON.stringify(u));
    setUsuario(u);
  };
  const salir = () => {
    sessionStorage.removeItem("usuario");
    setUsuario(null);
  };

  return usuario ? <Tablero usuario={usuario} salir={salir} /> : <Login onEntrar={entrar} />;
}