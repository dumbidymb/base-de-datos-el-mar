import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useDatos, dinero } from "./Ui";

// Datos del negocio que salen en el ticket: cámbialos aquí
const NEGOCIO = { nombre: "Restaurante El Mar", direccion: "av siempre viva", telefono: "961 112 61 20" };

export default function Ticket({ idVenta, cerrar }) {
  const { datos: t, error } = useDatos(`/admin/ventas/${idVenta}/ticket`);

  useEffect(() => {

    document.body.classList.add("con-ticket");
    const tecla = (e) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.classList.remove("con-ticket");
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  return createPortal(
    <div className="ticket-fondo" onClick={cerrar}>
      <div className="ticket-caja" onClick={(e) => e.stopPropagation()}>
        <article className="ticket-papel">
          {error && <p className="error">{error}</p>}
          {!t && !error && <p>Cargando…</p>}
          {t && (
            <>
              <h3>{NEGOCIO.nombre}</h3>
              {NEGOCIO.direccion && <p className="centro">{NEGOCIO.direccion}</p>}
              {NEGOCIO.telefono && <p className="centro">Tel. {NEGOCIO.telefono}</p>}
              <hr />
              <p>
                Ticket #{t.id_venta}
                <br />
                {new Date(t.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                <br />
                Mesa {t.numero_mesa} · Atendió: {t.mesero}
              </p>
              <hr />
              {t.lineas.map((l) => (
                <div key={l.nombre} className="ticket-linea">
                  <span>{Number(l.cantidad)}</span>
                  <span>{l.nombre}</span>
                  <span>{dinero(l.importe)}</span>
                </div>
              ))}
              <hr />
              <div className="ticket-linea total">
                <span />
                <span>TOTAL</span>
                <span>{dinero(t.monto_total)}</span>
              </div>
              <p>Pago: {t.metodo.charAt(0) + t.metodo.slice(1).toLowerCase()}</p>
              <hr />
              <p className="centro">¡Gracias por su visita!</p>
              <p className="centro menudo">Comprobante de consumo. No es factura.</p>
            </>
          )}
        </article>
        <div className="acciones">
          <button className="btn primario" disabled={!t} onClick={() => window.print()}>
            Imprimir ticket
          </button>
          <button className="btn" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}