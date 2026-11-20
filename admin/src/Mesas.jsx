import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, Campo, Mensaje } from "./Ui";

const VACIA = { numero_mesa: "", capacidad: 4, ubicacion: "INTERIOR" };

export default function Mesas() {
  const { datos: mesas, error, recargar } = useDatos("/mesas");
  const { fallo, ejecutar } = useAccion(recargar);
  const [form, setForm] = useState(null); // null = cerrado

  const cambia = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => (form.id_mesas ? api.put(`/admin/mesas/${form.id_mesas}`, form) : api.post("/admin/mesas", form)));
    if (ok) setForm(null);
  };

  const borrar = (m) => {
    if (window.confirm(`¿Eliminar la mesa ${m.numero_mesa}?`)) ejecutar(() => api.del(`/admin/mesas/${m.id_mesas}`));
  };

  return (
    <>
      <div className="titulo">
        <h1>Mesas</h1>
        <button className="btn primario" onClick={() => setForm({ ...VACIA })}>
          + Nueva mesa
        </button>
      </div>
      <Mensaje texto={error || fallo} />

      {form && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>{form.id_mesas ? "Editar mesa" : "Nueva mesa"}</h2>
          <div className="campos">
            <Campo etiqueta="Número">
              <input type="number" min="1" value={form.numero_mesa} onChange={cambia("numero_mesa")} required />
            </Campo>
            <Campo etiqueta="Capacidad (personas)">
              <input type="number" min="1" value={form.capacidad} onChange={cambia("capacidad")} required />
            </Campo>
            <Campo etiqueta="Ubicación">
              <input list="ubicaciones" value={form.ubicacion ?? ""} onChange={cambia("ubicacion")} />
              <datalist id="ubicaciones">
                <option value="INTERIOR" />
                <option value="TERRAZA" />
                <option value="BARRA" />
              </datalist>
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

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Mesa</th>
              <th>Capacidad</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(mesas || []).map((m) => (
              <tr key={m.id_mesas}>
                <td>
                  <b>{m.numero_mesa}</b>
                </td>
                <td>{m.capacidad} personas</td>
                <td>{m.ubicacion}</td>
                <td>
                  <span className={`etiqueta ${m.estado === "OCUPADA" ? "ocupada" : "libre"}`}>{m.estado === "OCUPADA" ? "Ocupada" : "Libre"}</span>
                </td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setForm({ ...m })}>
                    Editar
                  </button>
                  <button className="btn chico peligro" onClick={() => borrar(m)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {mesas && mesas.length === 0 && <p className="vacio">Aún no hay mesas.</p>}
      </section>
    </>
  );
}