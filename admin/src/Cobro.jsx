import { useState } from "react";
import { api } from "./api";
import { useDatos, useAccion, dinero, hora, Mensaje } from "./Ui";
import Ticket from "./Tickets";

const ESTADO = { PENDIENTE: "Pendiente", EN_PREPARACION: "En preparación", ENTREGADO: "Entregada" };

export default function Cobro() {
  const { datos: comandas, error, recargar } = useDatos("/admin/por-cobrar", 5000);
  const { datos: metodos } = useDatos("/admin/metodos-pago");
  const { fallo, ejecutar } = useAccion(recargar);
  const [elegido, setElegido] = useState(null);
  const [aviso, setAviso] = useState("");
  const [ticket, setTicket] = useState(null);

  const idMetodo = elegido ?? metodos?.[0]?.id_metodo_pago;
  const nombreMetodo = metodos?.find((m) => m.id_metodo_pago === idMetodo)?.tipo || "";

  const cobrar = async (c) => {
    if (!window.confirm(`¿Cobrar ${dinero(c.total)} de la mesa ${c.numero_mesa} (${nombreMetodo.toLowerCase()})?`)) return;
    let liberada = false;
    let idVenta = null;
    const ok = await ejecutar(async () => {
      const r = await api.post("/admin/ventas", { id_comanda: c.id_comanda, id_metodo_pago: idMetodo });
      liberada = r.mesa_liberada;
      idVenta = r.id_venta;
    });
    if (ok) {
      setTicket(idVenta);
      setAviso(`Mesa ${c.numero_mesa} cobrada${liberada ? " y liberada" : ""}.`);
      setTimeout(() => setAviso(""), 4000);
    }
  };

  const cancelar = async (c) => {
    if (!window.confirm(`¿Cancelar la comanda de la mesa ${c.numero_mesa}? No se puede deshacer.`)) return;
    await ejecutar(() => api.patch(`/admin/comandas/${c.id_comanda}/cancelar`));
  };

  return (
    <>
      <h1>Cobro</h1>
      {metodos && metodos.length === 0 && (
        <Mensaje texto="No hay métodos de pago en la base de datos. Ejecuta sql/fase1-admin.sql." />
      )}
      <div className="metodos">
        <span>Cobrar con:</span>
        {(metodos || []).map((m) => (
          <button key={m.id_metodo_pago} className={m.id_metodo_pago === idMetodo ? "sel" : ""} onClick={() => setElegido(m.id_metodo_pago)}>
            {m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <Mensaje texto={error || fallo} />
      <Mensaje texto={aviso} tipo="ok" />

      {comandas && comandas.length === 0 && <p className="vacio">No hay comandas por cobrar.</p>}
      <div className="comandas">
        {(comandas || []).map((c) => (
          <article key={c.id_comanda} className={`comanda ${c.estado === "ENTREGADO" ? "lista" : ""}`}>
            <header>
              <h3>Mesa {c.numero_mesa}</h3>
              <span className="etiqueta">{ESTADO[c.estado]}</span>
            </header>
            <small>
              {hora(c.fecha_hora)} · {c.mesero}
            </small>
            <ul>
              {c.detalle.map((d) => (
                <li key={d.nombre}>
                  <b>{d.cantidad}</b> {d.nombre}
                </li>
              ))}
            </ul>
            {c.notas && <p className="nota">{c.notas}</p>}
            <div className="acciones">
              <button className="btn primario" disabled={c.estado !== "ENTREGADO" || !idMetodo} onClick={() => cobrar(c)}>
                {c.estado === "ENTREGADO" ? `Cobrar ${dinero(c.total)}` : "Aún en cocina"}
              </button>
              <button className="btn peligro" onClick={() => cancelar(c)}>
                Cancelar
              </button>
            </div>
          </article>
        ))}
      </div>
      {ticket && <Ticket idVenta={ticket} cerrar={() => setTicket(null)} />}
    </>
  );
}