import { useState } from "react";
import { useDatos, dinero, hoy, Mensaje } from "./Ui";
import Ticket from "./Tickets";

const primerDia = (f) => new Date(f.getFullYear(), f.getMonth(), 1).toLocaleDateString("en-CA");
const ultimoDia = (f) => new Date(f.getFullYear(), f.getMonth() + 1, 0).toLocaleDateString("en-CA");
const metodo = (m) => m.charAt(0) + m.slice(1).toLowerCase();

export default function Reportes() {
  const [desde, setDesde] = useState(primerDia(new Date()));
  const [hasta, setHasta] = useState(hoy());
  const rep = useDatos(`/admin/reporte?desde=${desde}&hasta=${hasta}`);
  const ventas = useDatos(`/admin/ventas-historial?desde=${desde}&hasta=${hasta}`);
  const d = rep.datos;
  const [ticket, setTicket] = useState(null);

  const poner = (a, b) => () => {
    setDesde(a);
    setHasta(b);
  };
  const ahora = new Date();
  const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

  const maxDia = d ? Math.max(...d.porDia.map((x) => Number(x.total)), 1) : 1;
  const sumaMetodos = d ? d.porMetodo.reduce((s, m) => ({ cobros: s.cobros + m.cobros, ventas: s.ventas + m.ventas, gastos: s.gastos + m.gastos }), { cobros: 0, ventas: 0, gastos: 0 }) : null;

  return (
    <>
      <div className="titulo">
        <h1>Reportes</h1>
        <button className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="acciones filtros">
        <div className="metodos">
          <button onClick={poner(hoy(), hoy())}>Hoy</button>
          <button onClick={poner(hoy(-6), hoy())}>Últimos 7 días</button>
          <button onClick={poner(primerDia(ahora), hoy())}>Este mes</button>
          <button onClick={poner(primerDia(mesPasado), ultimoDia(mesPasado))}>Mes pasado</button>
        </div>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
      </div>
      <p className="solo-impresion">
        Periodo: {d?.desde} al {d?.hasta}
      </p>
      <Mensaje texto={rep.error || ventas.error} />
      {!d && !rep.error && <p className="vacio">Cargando…</p>}

      {d && (
        <>
          <div className="kpis">
            <div className="kpi">
              <small>Ventas</small>
              <strong>{dinero(d.resumen.ventas)}</strong>
              <span>
                {d.resumen.cobros} cobros · ticket promedio {dinero(d.resumen.ticket_promedio)}
              </span>
            </div>
            <div className="kpi">
              <small>Compras de insumos</small>
              <strong>{dinero(d.resumen.compras)}</strong>
              <span>mermas estimadas: {dinero(d.resumen.mermas)}</span>
            </div>
            <div className="kpi">
              <small>Gastos</small>
              <strong>{dinero(d.resumen.gastos)}</strong>
              <span>renta, luz, sueldos…</span>
            </div>
            <div className="kpi utilidad">
              <small>Utilidad</small>
              <strong className={d.resumen.utilidad < 0 ? "negativo" : "positivo"}>{dinero(d.resumen.utilidad)}</strong>
              <span>ventas − compras − gastos</span>
            </div>
          </div>

          <section className="panel">
            <h2>Corte de caja</h2>
            {d.porMetodo.length === 0 ? (
              <p className="vacio">No hubo cobros ni gastos en este periodo.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Cobros</th>
                    <th>Ventas</th>
                    <th>Gastos pagados</th>
                    <th>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porMetodo.map((m) => (
                    <tr key={m.metodo}>
                      <td>
                        <b>{metodo(m.metodo)}</b>
                      </td>
                      <td>{m.cobros}</td>
                      <td>{dinero(m.ventas)}</td>
                      <td>{dinero(m.gastos)}</td>
                      <td>
                        <b>{dinero(m.ventas - m.gastos)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <b>Total</b>
                    </td>
                    <td>{sumaMetodos.cobros}</td>
                    <td>{dinero(sumaMetodos.ventas)}</td>
                    <td>{dinero(sumaMetodos.gastos)}</td>
                    <td>
                      <b>{dinero(sumaMetodos.ventas - sumaMetodos.gastos)}</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
            <p className="vacio">Los gastos sin método de pago aparecen como «Sin especificar».</p>
          </section>

          <div className="dos">
            <section className="panel">
              <h2>Ventas por día</h2>
              {d.porDia.length === 0 ? (
                <p className="vacio">Sin ventas en este periodo.</p>
              ) : (
                <div className="dias">
                  {d.porDia.map((x) => (
                    <div key={x.dia} className="dia">
                      <span>{x.dia.slice(5)}</span>
                      <div className="relleno" style={{ width: `${(Number(x.total) / maxDia) * 100}%` }} />
                      <b>{dinero(x.total)}</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <h2>Gastos por categoría</h2>
              {d.gastosCategoria.length === 0 ? (
                <p className="vacio">Sin gastos en este periodo.</p>
              ) : (
                <ul className="lista">
                  {d.gastosCategoria.map((g) => (
                    <li key={g.categoria}>
                      <span>{g.categoria}</span>
                      <b>{dinero(g.total)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel">
            <h2>Platillos más vendidos</h2>
            {d.masVendidos.length === 0 ? (
              <p className="vacio">Sin ventas en este periodo.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Platillo</th>
                    <th>Cantidad</th>
                    <th>Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {d.masVendidos.map((p) => (
                    <tr key={p.nombre}>
                      <td>
                        <b>{p.nombre}</b>
                      </td>
                      <td>{Number(p.cantidad)}</td>
                      <td>{dinero(p.ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <h2 className="subtitulo">Ventas del periodo</h2>
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Mesa</th>
              <th>Método</th>
              <th>Atendió</th>
              <th>Monto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(ventas.datos || []).map((v) => (
              <tr key={v.id_venta}>
                <td>{new Date(v.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{v.numero_mesa}</td>
                <td>{metodo(v.metodo)}</td>
                <td>{v.mesero}</td>
                <td>
                  <b>{dinero(v.monto_total)}</b>
                </td>
                <td className="derecha">
                  <button className="btn chico" onClick={() => setTicket(v.id_venta)}>
                    Ticket
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ventas.datos && ventas.datos.length === 0 && <p className="vacio">No hay ventas en este periodo.</p>}
        {ventas.datos && ventas.datos.length === 200 && <p className="vacio">Se muestran las 200 ventas más recientes del periodo.</p>}
      </section>
      {ticket && <Ticket idVenta={ticket} cerrar={() => setTicket(null)} />}
    </>
  );
}