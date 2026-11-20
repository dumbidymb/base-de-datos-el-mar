import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, hoy, Campo, Mensaje } from "./Ui";

/* ---------- Compras ---------- */
function ListaCompras() {
  const compras = useDatos("/admin/compras");
  const provs = useDatos("/admin/proveedores");
  const insumos = useDatos("/admin/insumos");
  const { fallo, ejecutar } = useAccion(compras.recargar, insumos.recargar);
  const [form, setForm] = useState(null);
  const [aviso, setAviso] = useState("");

  const lista = insumos.datos || [];
  const insumoDe = (id) => lista.find((i) => i.id_insumos === Number(id));
  const total = form ? form.lineas.reduce((s, l) => s + Number(l.cantidad || 0) * Number(insumoDe(l.id_insumos)?.precio_unitario || 0), 0) : 0;

  const nueva = () =>
    setForm({ id_proveedor: provs.datos?.[0]?.id_proveedor, fecha_compra: hoy(), lineas: [{ id_insumos: lista[0]?.id_insumos, cantidad: "" }] });
  const cambia = (k, campo, valor) => setForm({ ...form, lineas: form.lineas.map((l, i) => (i === k ? { ...l, [campo]: valor } : l)) });

  const registrar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => api.post("/admin/compras", form));
    if (ok) {
      setForm(null);
      setAviso("Compra registrada y stock actualizado.");
      setTimeout(() => setAviso(""), 4000);
    }
  };

  const sinDatos = !provs.datos?.length ? "Primero agrega un proveedor en la pestaña Proveedores." : !lista.length ? "Primero agrega insumos en Inventario." : "";

  return (
    <>
      <div className="titulo">
        <h2>Compras</h2>
        <button className="btn primario" disabled={!!sinDatos} onClick={nueva}>
          + Nueva compra
        </button>
      </div>
      <Mensaje texto={compras.error || provs.error || insumos.error || fallo} />
      <Mensaje texto={aviso} tipo="ok" />
      {provs.datos && insumos.datos && sinDatos && <p className="vacio">{sinDatos}</p>}

      {form && (
        <form className="panel formulario" onSubmit={registrar}>
          <h2>Nueva compra</h2>
          <div className="campos">
            <Campo etiqueta="Proveedor">
              <select value={form.id_proveedor} onChange={(e) => setForm({ ...form, id_proveedor: e.target.value })}>
                {provs.datos.map((p) => (
                  <option key={p.id_proveedor} value={p.id_proveedor}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" value={form.fecha_compra} onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })} required />
            </Campo>
          </div>
          <div className="lineas">
            {form.lineas.map((l, k) => (
              <div key={k} className="linea">
                <select value={l.id_insumos} onChange={(e) => cambia(k, "id_insumos", e.target.value)}>
                  {lista.map((i) => (
                    <option key={i.id_insumos} value={i.id_insumos}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
                <input type="number" min="0.01" step="0.01" placeholder="Cantidad" value={l.cantidad} onChange={(e) => cambia(k, "cantidad", e.target.value)} required />
                <span className="unidad">{insumoDe(l.id_insumos)?.unidad_medida}</span>
                <span className="unidad">{dinero(Number(l.cantidad || 0) * Number(insumoDe(l.id_insumos)?.precio_unitario || 0))}</span>
                <button type="button" className="btn chico peligro" disabled={form.lineas.length === 1} onClick={() => setForm({ ...form, lineas: form.lineas.filter((_, i) => i !== k) })}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="acciones">
            <button type="button" className="btn" onClick={() => setForm({ ...form, lineas: [...form.lineas, { id_insumos: lista[0]?.id_insumos, cantidad: "" }] })}>
              + Agregar insumo
            </button>
          </div>
          <p className="resumen-costo">
            Total: <b>{dinero(total)}</b> <span className="vacio">(usa el precio actual de cada insumo)</span>
          </p>
          <div className="acciones">
            <button className="btn primario">Registrar compra</button>
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
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Detalle</th>
              <th>Registró</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(compras.datos || []).map((c) => (
              <tr key={c.id_compra}>
                <td>{c.fecha_compra}</td>
                <td>
                  <b>{c.proveedor}</b>
                </td>
                <td>
                  {c.lineas.map((l) => (
                    <small key={l.nombre} className="sub">
                      {Number(l.cantidad)} {l.unidad_medida} · {l.nombre}
                    </small>
                  ))}
                </td>
                <td>{c.usuario}</td>
                <td>
                  <b>{dinero(c.monto_total)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {compras.datos && compras.datos.length === 0 && <p className="vacio">Aún no hay compras registradas.</p>}
      </section>
    </>
  );
}

/* ---------- Proveedores ---------- */
const VACIO = { nombre: "", tipo_insumo: "", telefono: "", correo: "", direccion: "" };

function Proveedores() {
  const { datos, error, recargar } = useDatos("/admin/proveedores");
  const { fallo, ejecutar } = useAccion(recargar);
  const [form, setForm] = useState(null);
  const cambia = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => (form.id_proveedor ? api.put(`/admin/proveedores/${form.id_proveedor}`, form) : api.post("/admin/proveedores", form)));
    if (ok) setForm(null);
  };
  const borrar = (p) => {
    if (window.confirm(`¿Eliminar al proveedor "${p.nombre}"?`)) ejecutar(() => api.del(`/admin/proveedores/${p.id_proveedor}`));
  };

  return (
    <>
      <div className="titulo">
        <h2>Proveedores</h2>
        <button className="btn primario" onClick={() => setForm({ ...VACIO })}>
          + Nuevo proveedor
        </button>
      </div>
      <Mensaje texto={error || fallo} />

      {form && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>{form.id_proveedor ? "Editar proveedor" : "Nuevo proveedor"}</h2>
          <div className="campos">
            <Campo etiqueta="Nombre">
              <input value={form.nombre} onChange={cambia("nombre")} required />
            </Campo>
            <Campo etiqueta="Qué surte">
              <input value={form.tipo_insumo ?? ""} onChange={cambia("tipo_insumo")} />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input value={form.telefono ?? ""} onChange={cambia("telefono")} maxLength={11} />
            </Campo>
            <Campo etiqueta="Correo">
              <input type="email" value={form.correo ?? ""} onChange={cambia("correo")} />
            </Campo>
            <Campo etiqueta="Dirección">
              <input value={form.direccion ?? ""} onChange={cambia("direccion")} />
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
              <th>Proveedor</th>
              <th>Surte</th>
              <th>Contacto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(datos || []).map((p) => (
              <tr key={p.id_proveedor}>
                <td>
                  <b>{p.nombre}</b>
                  {p.direccion && <small className="sub">{p.direccion}</small>}
                </td>
                <td>{p.tipo_insumo || "—"}</td>
                <td>
                  {p.telefono || "—"}
                  {p.correo && <small className="sub">{p.correo}</small>}
                </td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setForm({ ...p })}>
                    Editar
                  </button>
                  <button className="btn chico peligro" onClick={() => borrar(p)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {datos && datos.length === 0 && <p className="vacio">Aún no hay proveedores.</p>}
      </section>
    </>
  );
}

export default function Compras() {
  const [pestana, setPestana] = useState("compras");
  return (
    <>
      <h1>Compras y proveedores</h1>
      <div className="metodos">
        <button className={pestana === "compras" ? "sel" : ""} onClick={() => setPestana("compras")}>
          Compras
        </button>
        <button className={pestana === "proveedores" ? "sel" : ""} onClick={() => setPestana("proveedores")}>
          Proveedores
        </button>
      </div>
      {pestana === "compras" ? <ListaCompras /> : <Proveedores />}
    </>
  );
}