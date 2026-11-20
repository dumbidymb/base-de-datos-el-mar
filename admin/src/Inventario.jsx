import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, hoy, Campo, Mensaje } from "./Ui";

const VACIO = { nombre: "", tipo: "", unidad_medida: "kg", cantidad_stock: 0, stock_minimo: 0, fecha_caducidad: "", precio_unitario: 0 };

function estado(i) {
  if (Number(i.cantidad_stock) < 0) return { clase: "ocupada", texto: "Revisar (negativo)" };
  if (i.fecha_caducidad && i.fecha_caducidad < hoy()) return { clase: "ocupada", texto: "Caducado" };
  if (Number(i.cantidad_stock) <= Number(i.stock_minimo)) return { clase: "aviso", texto: "Stock bajo" };
  if (i.fecha_caducidad && i.fecha_caducidad <= hoy(7)) return { clase: "aviso", texto: "Por caducar" };
  return { clase: "libre", texto: "Bien" };
}

export default function Inventario() {
  const ins = useDatos("/admin/insumos");
  const movs = useDatos("/admin/movimientos");
  const { fallo, ejecutar } = useAccion(ins.recargar, movs.recargar);
  const [form, setForm] = useState(null);
  const [mov, setMov] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);

  const lista = (ins.datos || []).filter(
    (i) => i.nombre.toLowerCase().includes(buscar.toLowerCase()) && (!soloAlertas || estado(i).clase !== "libre")
  );

  const cambia = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => (form.id_insumos ? api.put(`/admin/insumos/${form.id_insumos}`, form) : api.post("/admin/insumos", form)));
    if (ok) setForm(null);
  };

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => api.post("/admin/movimientos", mov));
    if (ok) setMov(null);
  };

  const borrar = (i) => {
    if (window.confirm(`¿Eliminar el insumo "${i.nombre}"?`)) ejecutar(() => api.del(`/admin/insumos/${i.id_insumos}`));
  };

  return (
    <>
      <div className="titulo">
        <h1>Inventario</h1>
        <button className="btn primario" onClick={() => setForm({ ...VACIO })}>
          + Nuevo insumo
        </button>
      </div>
      <Mensaje texto={ins.error || movs.error || fallo} />

      {form && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>{form.id_insumos ? "Editar insumo" : "Nuevo insumo"}</h2>
          <div className="campos">
            <Campo etiqueta="Nombre">
              <input value={form.nombre} onChange={cambia("nombre")} required />
            </Campo>
            <Campo etiqueta="Tipo (ej. mariscos, abarrotes)">
              <input value={form.tipo} onChange={cambia("tipo")} required />
            </Campo>
            <Campo etiqueta="Unidad de medida">
              <input list="unidades" value={form.unidad_medida} onChange={cambia("unidad_medida")} required />
              <datalist id="unidades">
                <option value="kg" />
                <option value="g" />
                <option value="litro" />
                <option value="ml" />
                <option value="pieza" />
              </datalist>
            </Campo>
            {!form.id_insumos && (
              <Campo etiqueta="Stock inicial">
                <input type="number" min="0" step="0.01" value={form.cantidad_stock} onChange={cambia("cantidad_stock")} />
              </Campo>
            )}
            <Campo etiqueta="Stock mínimo">
              <input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={cambia("stock_minimo")} required />
            </Campo>
            <Campo etiqueta="Precio por unidad">
              <input type="number" min="0" step="0.01" value={form.precio_unitario} onChange={cambia("precio_unitario")} required />
            </Campo>
            <Campo etiqueta="Caducidad (opcional)">
              <input type="date" value={form.fecha_caducidad ?? ""} onChange={cambia("fecha_caducidad")} />
            </Campo>
          </div>
          {form.id_insumos && <p className="vacio">Para cambiar el stock usa el botón «Movimiento», así queda registro.</p>}
          <div className="acciones">
            <button className="btn primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mov && (
        <form className="panel formulario" onSubmit={registrarMovimiento}>
          <h2>Movimiento de {mov.nombre}</h2>
          <div className="campos">
            <Campo etiqueta="Tipo">
              <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                <option value="ENTRADA">Entrada (llegó mercancía)</option>
                <option value="SALIDA">Salida (se usó o se sacó)</option>
                <option value="MERMA">Merma (se echó a perder)</option>
              </select>
            </Campo>
            <Campo etiqueta={`Cantidad (${mov.unidad_medida})`}>
              <input type="number" min="0.01" step="0.01" value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Motivo (opcional)">
              <input value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
            </Campo>
          </div>
          <div className="acciones">
            <button className="btn primario">Registrar</button>
            <button type="button" className="btn" onClick={() => setMov(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="acciones filtros">
        <input placeholder="Buscar insumo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <label className="marca">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Solo los que hay que revisar
        </label>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Stock</th>
              <th>Mínimo</th>
              <th>Caducidad</th>
              <th>Precio</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const e = estado(i);
              return (
                <tr key={i.id_insumos}>
                  <td>
                    <b>{i.nombre}</b>
                    <small className="sub">{i.tipo}</small>
                  </td>
                  <td>
                    <b>{Number(i.cantidad_stock)}</b> {i.unidad_medida}
                  </td>
                  <td>{Number(i.stock_minimo)}</td>
                  <td>{i.fecha_caducidad || "—"}</td>
                  <td>
                    {dinero(i.precio_unitario)} / {i.unidad_medida}
                  </td>
                  <td>
                    <span className={`etiqueta ${e.clase}`}>{e.texto}</span>
                  </td>
                  <td className="derecha">
                    <button className="btn chico" onClick={() => setMov({ id_insumos: i.id_insumos, nombre: i.nombre, unidad_medida: i.unidad_medida, tipo: "ENTRADA", cantidad: "", motivo: "" })}>
                      Movimiento
                    </button>
                    <button className="btn chico" onClick={() => setForm({ ...i, fecha_caducidad: i.fecha_caducidad ?? "" })}>
                      Editar
                    </button>
                    <button className="btn chico peligro" onClick={() => borrar(i)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ins.datos && lista.length === 0 && <p className="vacio">No hay insumos que mostrar.</p>}
      </section>

      <h2 className="subtitulo">Últimos movimientos</h2>
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Insumo</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Usuario</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {(movs.datos || []).map((m) => (
              <tr key={m.id_movimiento}>
                <td>{new Date(m.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{m.insumo}</td>
                <td>
                  <span className={`etiqueta ${m.tipo === "ENTRADA" ? "libre" : m.tipo === "MERMA" ? "ocupada" : "aviso"}`}>{m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()}</span>
                </td>
                <td>
                  {m.tipo === "ENTRADA" ? "+" : "−"}
                  {Number(m.cantidad)} {m.unidad_medida}
                </td>
                <td>{m.usuario}</td>
                <td>{m.motivo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movs.datos && movs.datos.length === 0 && <p className="vacio">Aún no hay movimientos.</p>}
      </section>
    </>
  );
}