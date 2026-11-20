import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, Campo, Mensaje } from "./Ui";

export default function Menu() {
  const cats = useDatos("/categorias");
  const plats = useDatos("/admin/platillos");
  const { fallo, ejecutar } = useAccion(cats.recargar, plats.recargar);
  const [cat, setCat] = useState(null); // formulario de categoría
  const [plat, setPlat] = useState(null); // formulario de platillo
  const [filtro, setFiltro] = useState("");

  const categorias = cats.datos || [];
  const platillos = (plats.datos || []).filter((p) => !filtro || String(p.id_categoria) === filtro);

  const guardarCategoria = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() =>
      cat.id_categoria ? api.put(`/admin/categorias/${cat.id_categoria}`, cat) : api.post("/admin/categorias", cat)
    );
    if (ok) setCat(null);
  };

  const guardarPlatillo = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() =>
      plat.id_platillos ? api.put(`/admin/platillos/${plat.id_platillos}`, plat) : api.post("/admin/platillos", plat)
    );
    if (ok) setPlat(null);
  };

  const borrarCategoria = (c) => {
    if (window.confirm(`¿Eliminar la categoría "${c.nombre_categoria}"?`)) ejecutar(() => api.del(`/admin/categorias/${c.id_categoria}`));
  };
  const borrarPlatillo = (p) => {
    if (window.confirm(`¿Eliminar "${p.nombre}"?`)) ejecutar(() => api.del(`/admin/platillos/${p.id_platillos}`));
  };
  const alternar = (p) => ejecutar(() => api.put(`/admin/platillos/${p.id_platillos}`, { ...p, disponible: !p.disponible }));

  return (
    <>
      <h1>Menú</h1>
      <Mensaje texto={cats.error || plats.error || fallo} />

      <div className="titulo">
        <h2>Categorías</h2>
        <button className="btn" onClick={() => setCat({ nombre_categoria: "", descripcion: "" })}>
          + Nueva categoría
        </button>
      </div>
      {cat && (
        <form className="panel formulario" onSubmit={guardarCategoria}>
          <div className="campos">
            <Campo etiqueta="Nombre">
              <input value={cat.nombre_categoria} onChange={(e) => setCat({ ...cat, nombre_categoria: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Descripción">
              <input value={cat.descripcion} onChange={(e) => setCat({ ...cat, descripcion: e.target.value })} />
            </Campo>
          </div>
          <div className="acciones">
            <button className="btn primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setCat(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="fichas">
        {categorias.map((c) => (
          <div key={c.id_categoria} className="ficha">
            <span>{c.nombre_categoria}</span>
            <button className="btn chico" onClick={() => setCat({ ...c, descripcion: c.descripcion ?? "" })}>
              Editar
            </button>
            <button className="btn chico peligro" onClick={() => borrarCategoria(c)}>
              ×
            </button>
          </div>
        ))}
        {cats.datos && categorias.length === 0 && <p className="vacio">Crea primero una categoría.</p>}
      </div>

      <div className="titulo">
        <h2>Platillos</h2>
        <div className="acciones">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id_categoria} value={c.id_categoria}>
                {c.nombre_categoria}
              </option>
            ))}
          </select>
          <button
            className="btn primario"
            disabled={!categorias.length}
            onClick={() => setPlat({ id_categoria: filtro || categorias[0]?.id_categoria, nombre: "", descripcion: "", precio: "", disponible: true })}
          >
            + Nuevo platillo
          </button>
        </div>
      </div>
      {plat && (
        <form className="panel formulario" onSubmit={guardarPlatillo}>
          <h2>{plat.id_platillos ? "Editar platillo" : "Nuevo platillo"}</h2>
          <div className="campos">
            <Campo etiqueta="Nombre">
              <input value={plat.nombre} onChange={(e) => setPlat({ ...plat, nombre: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Categoría">
              <select value={plat.id_categoria} onChange={(e) => setPlat({ ...plat, id_categoria: e.target.value })}>
                {categorias.map((c) => (
                  <option key={c.id_categoria} value={c.id_categoria}>
                    {c.nombre_categoria}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Precio">
              <input type="number" min="0" step="0.01" value={plat.precio} onChange={(e) => setPlat({ ...plat, precio: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Descripción">
              <input value={plat.descripcion ?? ""} onChange={(e) => setPlat({ ...plat, descripcion: e.target.value })} />
            </Campo>
          </div>
          <label className="marca">
            <input type="checkbox" checked={!!plat.disponible} onChange={(e) => setPlat({ ...plat, disponible: e.target.checked })} />
            Disponible para los meseros
          </label>
          <div className="acciones">
            <button className="btn primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setPlat(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Platillo</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {platillos.map((p) => (
              <tr key={p.id_platillos} className={p.disponible ? "" : "apagado"}>
                <td>
                  <b>{p.nombre}</b>
                  {p.descripcion && <small className="sub">{p.descripcion}</small>}
                </td>
                <td>{p.categoria}</td>
                <td>{dinero(p.precio)}</td>
                <td>
                  <button className={`etiqueta boton ${p.disponible ? "libre" : "ocupada"}`} onClick={() => alternar(p)} title="Cambiar disponibilidad">
                    {p.disponible ? "Disponible" : "Oculto"}
                  </button>
                </td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setPlat({ ...p })}>
                    Editar
                  </button>
                  <button className="btn chico peligro" onClick={() => borrarPlatillo(p)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {plats.datos && platillos.length === 0 && <p className="vacio">No hay platillos en esta categoría.</p>}
      </section>
    </>
  );
}