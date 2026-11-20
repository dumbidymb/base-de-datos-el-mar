import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, hoy, Campo, Mensaje } from "./Ui";

export default function Gastos() {
  const [desde, setDesde] = useState(hoy().slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy());
  const gastos = useDatos(`/admin/gastos?desde=${desde}&hasta=${hasta}`);
  const cats = useDatos("/admin/categorias-gasto");
  const metodos = useDatos("/admin/metodos-pago");
  const { fallo, ejecutar } = useAccion(gastos.recargar, cats.recargar);
  const [form, setForm] = useState(null);
  const [cat, setCat] = useState(null);

  const categorias = cats.datos || [];
  const total = (gastos.datos || []).reduce((s, g) => s + Number(g.monto), 0);
  const cambia = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const nuevo = () =>
    setForm({ id_categoria_gasto: categorias[0]?.id_categoria_gasto, id_metodo_pago: "", fecha: hoy(), descripcion: "", monto: "" });

  const guardar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => (form.id_gasto ? api.put(`/admin/gastos/${form.id_gasto}`, form) : api.post("/admin/gastos", form)));
    if (ok) setForm(null);
  };

  const guardarCategoria = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() =>
      cat.id_categoria_gasto ? api.put(`/admin/categorias-gasto/${cat.id_categoria_gasto}`, cat) : api.post("/admin/categorias-gasto", cat)
    );
    if (ok) setCat(null);
  };

  const borrar = (g) => {
    if (window.confirm(`¿Eliminar el gasto de ${dinero(g.monto)} (${g.categoria})?`)) ejecutar(() => api.del(`/admin/gastos/${g.id_gasto}`));
  };
  const borrarCategoria = (c) => {
    if (window.confirm(`¿Eliminar la categoría "${c.nombre}"?`)) ejecutar(() => api.del(`/admin/categorias-gasto/${c.id_categoria_gasto}`));
  };

  return (
    <>
      <div className="titulo">
        <h1>Gastos</h1>
        <button className="btn primario" disabled={!categorias.length} onClick={nuevo}>
          + Nuevo gasto
        </button>
      </div>
      <Mensaje texto={gastos.error || cats.error || fallo} />

      <div className="titulo">
        <h2>Categorías</h2>
        <button className="btn" onClick={() => setCat({ nombre: "" })}>
          + Nueva categoría
        </button>
      </div>
      {cat && (
        <form className="panel formulario" onSubmit={guardarCategoria}>
          <div className="campos">
            <Campo etiqueta="Nombre">
              <input value={cat.nombre} onChange={(e) => setCat({ ...cat, nombre: e.target.value })} required />
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
          <div key={c.id_categoria_gasto} className="ficha">
            <span>{c.nombre}</span>
            <button className="btn chico" onClick={() => setCat({ ...c })}>
              Editar
            </button>
            <button className="btn chico peligro" onClick={() => borrarCategoria(c)}>
              ×
            </button>
          </div>
        ))}
        {cats.datos && !categorias.length && <p className="vacio">Crea primero una categoría (renta, luz, sueldos…).</p>}
      </div>

      {form && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>{form.id_gasto ? "Editar gasto" : "Nuevo gasto"}</h2>
          <div className="campos">
            <Campo etiqueta="Categoría">
              <select value={form.id_categoria_gasto} onChange={cambia("id_categoria_gasto")}>
                {categorias.map((c) => (
                  <option key={c.id_categoria_gasto} value={c.id_categoria_gasto}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" value={form.fecha} onChange={cambia("fecha")} required />
            </Campo>
            <Campo etiqueta="Monto">
              <input type="number" min="0.01" step="0.01" value={form.monto} onChange={cambia("monto")} required />
            </Campo>
            <Campo etiqueta="Pagado con (opcional)">
              <select value={form.id_metodo_pago ?? ""} onChange={cambia("id_metodo_pago")}>
                <option value="">Sin especificar</option>
                {(metodos.datos || []).map((m) => (
                  <option key={m.id_metodo_pago} value={m.id_metodo_pago}>
                    {m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Descripción">
              <input value={form.descripcion ?? ""} onChange={cambia("descripcion")} />
            </Campo>
          </div>
          <div className="acciones">
            <button className="btn primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="titulo">
        <h2>Gastos del periodo</h2>
        <div className="acciones">
          <Campo etiqueta="Desde">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hasta">
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
        </div>
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Pagado con</th>
              <th>Monto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(gastos.datos || []).map((g) => (
              <tr key={g.id_gasto}>
                <td>{g.fecha}</td>
                <td>
                  <b>{g.categoria}</b>
                </td>
                <td>{g.descripcion || "—"}</td>
                <td>{g.metodo ? g.metodo.charAt(0) + g.metodo.slice(1).toLowerCase() : "—"}</td>
                <td>{dinero(g.monto)}</td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setForm({ ...g, descripcion: g.descripcion ?? "", id_metodo_pago: g.id_metodo_pago ?? "" })}>
                    Editar
                  </button>
                  <button className="btn chico peligro" onClick={() => borrar(g)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {gastos.datos && gastos.datos.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <b>Total del periodo</b>
                </td>
                <td colSpan={2}>
                  <b>{dinero(total)}</b>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {gastos.datos && gastos.datos.length === 0 && <p className="vacio">No hay gastos en este periodo.</p>}
      </section>
    </>
  );
}