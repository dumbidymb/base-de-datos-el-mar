import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, Mensaje } from "./ui";

export default function Recetas() {
  const costos = useDatos("/admin/costos");
  const insumos = useDatos("/admin/insumos");
  const { fallo, ejecutar } = useAccion(costos.recargar);
  const [edit, setEdit] = useState(null); // { platillo, lineas }

  const lista = insumos.datos || [];
  const insumoDe = (id) => lista.find((i) => i.id_insumos === Number(id));
  const costoLinea = (l) => Number(l.cantidad_requerida || 0) * Number(insumoDe(l.id_insumos)?.precio_unitario || 0);

  const abrir = (p) =>
    ejecutar(async () => {
      const lineas = await api.get(`/admin/recetas/${p.id_platillos}`);
      setEdit({ platillo: p, lineas });
    });

  const cambia = (k, campo, valor) => setEdit({ ...edit, lineas: edit.lineas.map((l, i) => (i === k ? { ...l, [campo]: valor } : l)) });
  const quitar = (k) => setEdit({ ...edit, lineas: edit.lineas.filter((_, i) => i !== k) });
  const agregar = () => setEdit({ ...edit, lineas: [...edit.lineas, { id_insumos: lista[0]?.id_insumos, cantidad_requerida: "" }] });

  const guardar = async () => {
    const ok = await ejecutar(() => api.put(`/admin/recetas/${edit.platillo.id_platillos}`, { lineas: edit.lineas }));
    if (ok) setEdit(null);
  };

  const costo = edit ? edit.lineas.reduce((s, l) => s + costoLinea(l), 0) : 0;
  const precio = edit ? Number(edit.platillo.precio) : 0;

  return (
    <>
      <h1>Recetas y costos</h1>
      <p className="vacio">Al entregar una comanda, cocina descuenta del inventario los insumos de la receta de cada platillo. Un platillo sin receta no descuenta nada.</p>
      <Mensaje texto={costos.error || insumos.error || fallo} />

      {edit && (
        <section className="panel formulario">
          <h2>Receta de {edit.platillo.nombre}</h2>
          <p className="vacio">Cantidad de cada insumo para <b>una porción</b>.</p>
          <div className="lineas">
            {edit.lineas.map((l, k) => (
              <div key={k} className="linea">
                <select value={l.id_insumos} onChange={(e) => cambia(k, "id_insumos", e.target.value)}>
                  {lista.map((i) => (
                    <option key={i.id_insumos} value={i.id_insumos}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
                <input type="number" min="0.01" step="0.01" placeholder="Cantidad" value={l.cantidad_requerida} onChange={(e) => cambia(k, "cantidad_requerida", e.target.value)} />
                <span className="unidad">{insumoDe(l.id_insumos)?.unidad_medida}</span>
                <span className="unidad">{dinero(costoLinea(l))}</span>
                <button type="button" className="btn chico peligro" onClick={() => quitar(k)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="acciones">
            <button type="button" className="btn" onClick={agregar} disabled={!lista.length}>
              + Agregar ingrediente
            </button>
          </div>
          <p className="resumen-costo">
            Costo: <b>{dinero(costo)}</b> · Precio de venta: <b>{dinero(precio)}</b> · Utilidad:{" "}
            <b className={precio - costo < 0 ? "negativo" : "positivo"}>
              {dinero(precio - costo)}
              {precio > 0 && ` (${Math.round(((precio - costo) / precio) * 100)}%)`}
            </b>
          </p>
          <div className="acciones">
            <button className="btn primario" onClick={guardar}>
              Guardar receta
            </button>
            <button className="btn" onClick={() => setEdit(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Platillo</th>
              <th>Precio</th>
              <th>Costo</th>
              <th>Utilidad</th>
              <th>Receta</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(costos.datos || []).map((p) => {
              const utilidad = Number(p.precio) - Number(p.costo);
              return (
                <tr key={p.id_platillos}>
                  <td>
                    <b>{p.nombre}</b>
                    <small className="sub">{p.categoria}</small>
                  </td>
                  <td>{dinero(p.precio)}</td>
                  <td>{p.ingredientes ? dinero(p.costo) : "—"}</td>
                  <td>{p.ingredientes ? <span className={utilidad < 0 ? "negativo" : "positivo"}>{dinero(utilidad)}</span> : "—"}</td>
                  <td>{p.ingredientes ? `${p.ingredientes} ingredientes` : <span className="etiqueta aviso">Sin receta</span>}</td>
                  <td className="derecha">
                    <button className="btn chico" onClick={() => abrir(p)}>
                      {p.ingredientes ? "Editar receta" : "Crear receta"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {costos.datos && costos.datos.length === 0 && <p className="vacio">Primero agrega platillos en Menú.</p>}
      </section>
    </>
  );
}