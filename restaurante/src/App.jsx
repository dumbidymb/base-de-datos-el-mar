import { useCallback, useEffect, useState } from "react";
import { MODO_DEMO, login, obtenerMesas, obtenerMenu, enviarComanda, liberarMesa } from "./api";
import "./App.css";

/* ---------- Inicio de sesión (tabla usuario) ---------- */
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
        <strong>Comandas</strong>
      </nav>
      <main className="login">
        <form onSubmit={entrar}>
          <h2>Iniciar sesión</h2>
          <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
          <input type="password" placeholder="Contraseña" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="current-password" />
          {error && <p className="error">{error}</p>}
          <button className="enviar" disabled={cargando || (!MODO_DEMO && (!usuario || !contrasena))}>
            {cargando ? "Entrando…" : "Entrar"}
          </button>
          {MODO_DEMO && <p className="vacio">Modo demo: entra con cualquier usuario.</p>}
        </form>
      </main>
    </div>
  );
}

/* ---------- Toma de comandas ---------- */
function Tablero({ usuario, salir }) {
  const [mesas, setMesas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [platillos, setPlatillos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [mesa, setMesa] = useState(null); // id_mesas
  const [cat, setCat] = useState(null); // id_categoria
  const [items, setItems] = useState({}); // id_platillos -> { p, cant }
  const [notas, setNotas] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [m, menu] = await Promise.all([obtenerMesas(), obtenerMenu()]);
      setMesas(m);
      setCategorias(menu.categorias);
      setPlatillos(menu.platillos);
    } catch (e) {
      setError(e.message || "No se pudo cargar la información");
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const catActual = cat ?? categorias[0]?.id_categoria;
  const delaCategoria = platillos.filter((p) => p.id_categoria === catActual);
  const mesaSel = mesas.find((m) => m.id_mesas === mesa);

  // mysql2 devuelve los DECIMAL como texto ("22.00"), por eso Number()
  const precio = (p) => Number(p.precio);

  const cambiar = (p, d) =>
    setItems((prev) => {
      const cant = (prev[p.id_platillos]?.cant || 0) + d;
      const next = { ...prev };
      if (cant > 0) next[p.id_platillos] = { p, cant };
      else delete next[p.id_platillos];
      return next;
    });

  const lista = Object.values(items);
  const total = lista.reduce((s, { p, cant }) => s + precio(p) * cant, 0);
  const falta = !mesaSel ? "Elige una mesa" : !lista.length ? "Agrega platillos" : "";

  const enviar = async () => {
    if (falta || enviando) return;
    setEnviando(true);
    try {
      await enviarComanda({
        id_mesas: mesaSel.id_mesas,
        numero_mesa: mesaSel.numero_mesa,
        id_usuario: usuario.id_usuario,
        notas: notas.trim(),
        detalle: lista.map(({ p, cant }) => ({
          id_platillos: p.id_platillos,
          nombre: p.nombre,
          cantidad: cant,
          precio_unitario: precio(p),
        })),
      });
      setAviso(`Comanda de la mesa ${mesaSel.numero_mesa} enviada a cocina`);
      setMesa(null);
      setItems({});
      setNotas("");
      setMesas(await obtenerMesas()); // la mesa pasa a OCUPADA
    } catch (e) {
      setAviso(e.message || "No se pudo enviar. Intenta de nuevo.");
    }
    setEnviando(false);
    setTimeout(() => setAviso(""), 3500);
  };

  const liberar = async () => {
    try {
      await liberarMesa(mesaSel.id_mesas);
      setMesas(await obtenerMesas());
      setMesa(null);
    } catch (e) {
      setAviso(e.message || "No se pudo liberar la mesa");
      setTimeout(() => setAviso(""), 3500);
    }
  };

  return (
    <div className="app">
      <nav className="nav">
        <strong>Comandas</strong>
        <div className="sesion">
          <span>{usuario.nombre}</span>
          <button onClick={salir}>Salir</button>
        </div>
      </nav>

      <main className="mesero">
        {cargando && <p className="vacio">Cargando…</p>}
        {error && (
          <div className="error">
            {error} <button onClick={cargar}>Reintentar</button>
          </div>
        )}

        {!cargando && !error && (
          <>
            <section>
              <h2>Mesa</h2>
              <div className="mesas">
                {mesas.map((m) => (
                  <button
                    key={m.id_mesas}
                    className={`${m.id_mesas === mesa ? "sel" : ""} ${m.estado === "OCUPADA" ? "ocupada" : ""}`}
                    onClick={() => setMesa(m.id_mesas)}
                  >
                    <b>{m.numero_mesa}</b>
                    <small>
                      {m.capacidad} pers · {m.ubicacion?.toLowerCase()}
                    </small>
                  </button>
                ))}
              </div>
              <p className="leyenda">Borde ámbar = mesa ocupada</p>
              {mesaSel?.estado === "OCUPADA" && (
                <button className="liberar" onClick={liberar}>
                  Liberar mesa {mesaSel.numero_mesa}
                </button>
              )}
            </section>

            <section>
              <h2>Menú</h2>
              <div className="cats">
                {categorias.map((c) => (
                  <button key={c.id_categoria} className={c.id_categoria === catActual ? "sel" : ""} onClick={() => setCat(c.id_categoria)}>
                    {c.nombre_categoria}
                  </button>
                ))}
              </div>
              <ul className="platillos">
                {delaCategoria.map((p) => {
                  const cant = items[p.id_platillos]?.cant || 0;
                  return (
                    <li key={p.id_platillos}>
                      <span className="nombre">
                        {p.nombre}
                        {p.descripcion && <small>{p.descripcion}</small>}
                      </span>
                      <span className="precio">${precio(p)}</span>
                      <div className="stepper">
                        <button onClick={() => cambiar(p, -1)} disabled={!cant} aria-label={`Quitar ${p.nombre}`}>
                          −
                        </button>
                        <span>{cant}</span>
                        <button onClick={() => cambiar(p, 1)} aria-label={`Agregar ${p.nombre}`}>
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h2>Comanda</h2>
              {lista.length === 0 ? (
                <p className="vacio">Toca + en un platillo para agregarlo.</p>
              ) : (
                <ul className="resumen">
                  {lista.map(({ p, cant }) => (
                    <li key={p.id_platillos}>
                      <span>
                        {cant} × {p.nombre}
                      </span>
                      <span>${precio(p) * cant}</span>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                placeholder="Notas para cocina (sin cebolla, bien cocido…)"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={200}
                rows={2}
              />
            </section>

            <footer className="barra">
              <div>
                <small>{mesaSel ? `Mesa ${mesaSel.numero_mesa}` : "Sin mesa"}</small>
                <strong>${total}</strong>
              </div>
              <button className="enviar" onClick={enviar} disabled={!!falta || enviando}>
                {falta || (enviando ? "Enviando…" : "Enviar a cocina")}
              </button>
            </footer>
          </>
        )}
        {aviso && <div className="aviso">{aviso}</div>}
      </main>
    </div>
  );
}

/* ---------- App ---------- */
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