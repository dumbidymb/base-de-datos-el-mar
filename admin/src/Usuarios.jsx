import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, Campo, Mensaje } from "./Ui";

export default function Usuarios({ yo }) {
  const { datos: usuarios, error, recargar } = useDatos("/admin/usuarios");
  const { datos: roles } = useDatos("/admin/roles");
  const { fallo, ejecutar } = useAccion(recargar);
  const [form, setForm] = useState(null);

  const cambia = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });
  const nuevo = () => setForm({ nombre: "", usuario: "", contrasena: "", id_rol: roles?.find((r) => r.tipo.toUpperCase() === "MESERO")?.id_rol ?? roles?.[0]?.id_rol, activo: true });

  const guardar = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => (form.id_usuario ? api.put(`/admin/usuarios/${form.id_usuario}`, form) : api.post("/admin/usuarios", form)));
    if (ok) setForm(null);
  };

  const alternar = (u) => {
    const accion = u.activo ? "desactivar" : "activar";
    if (window.confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a ${u.nombre}?`)) {
      ejecutar(() => api.put(`/admin/usuarios/${u.id_usuario}`, { ...u, activo: !u.activo, contrasena: "" }));
    }
  };

  return (
    <>
      <div className="titulo">
        <h1>Usuarios</h1>
        <button className="btn primario" disabled={!roles?.length} onClick={nuevo}>
          + Nuevo usuario
        </button>
      </div>
      <Mensaje texto={error || fallo} />

      {form && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>{form.id_usuario ? "Editar usuario" : "Nuevo usuario"}</h2>
          <div className="campos">
            <Campo etiqueta="Nombre completo">
              <input value={form.nombre} onChange={cambia("nombre")} required />
            </Campo>
            <Campo etiqueta="Usuario (para entrar)">
              <input value={form.usuario} onChange={cambia("usuario")} autoComplete="off" required />
            </Campo>
            <Campo etiqueta="Rol">
              <select value={form.id_rol} onChange={cambia("id_rol")}>
                {(roles || []).map((r) => (
                  <option key={r.id_rol} value={r.id_rol}>
                    {r.tipo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={form.id_usuario ? "Nueva contraseña (opcional)" : "Contraseña"}>
              <input type="password" value={form.contrasena} onChange={cambia("contrasena")} autoComplete="new-password" required={!form.id_usuario} placeholder={form.id_usuario ? "Déjala vacía para no cambiarla" : "Mínimo 4 caracteres"} />
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
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(usuarios || []).map((u) => (
              <tr key={u.id_usuario} className={u.activo ? "" : "apagado"}>
                <td>
                  <b>{u.nombre}</b>
                </td>
                <td>{u.usuario}</td>
                <td>{u.rol}</td>
                <td>
                  <span className={`etiqueta ${u.activo ? "libre" : "ocupada"}`}>{u.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setForm({ ...u, contrasena: "", activo: !!u.activo })}>
                    Editar
                  </button>
                  {u.id_usuario !== yo.id_usuario && (
                    <button className="btn chico peligro" onClick={() => alternar(u)}>
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}