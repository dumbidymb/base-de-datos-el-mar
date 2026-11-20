import { useDatos, dinero, hora } from "./Ui";

export default function Panel() {
  const { datos: d, error } = useDatos("/admin/resumen", 10000);
  if (error && !d) return <p className="error">{error}</p>;
  if (!d) return <p className="vacio">Cargando…</p>;

  return (
    <>
      <h1>Panel</h1>
      <div className="kpis">
        <div className="kpi">
          <small>Ventas de hoy</small>
          <strong>{dinero(d.ventas.total)}</strong>
          <span>{d.ventas.cantidad} cobros</span>
        </div>
        <div className="kpi">
          <small>Por cobrar</small>
          <strong>{dinero(d.porCobrar.total)}</strong>
          <span>{d.porCobrar.cantidad} comandas</span>
        </div>
        <div className="kpi">
          <small>En cocina</small>
          <strong>{d.cocina}</strong>
          <span>comandas activas</span>
        </div>
        <div className="kpi">
          <small>Mesas ocupadas</small>
          <strong>
            {d.mesas.ocupadas} / {d.mesas.total}
          </strong>
          <span>ahora</span>
        </div>
        <div className="kpi">
          <small>Stock bajo</small>
          <strong>{d.alertas.bajos}</strong>
          <span>insumos en su mínimo o menos</span>
        </div>
        <div className="kpi">
          <small>Por caducar</small>
          <strong>{d.alertas.por_caducar}</strong>
          <span>en 7 días o ya vencidos</span>
        </div>
      </div>

      <div className="dos">
        <section className="panel">
          <h2>Más vendidos hoy</h2>
          {d.masVendidos.length === 0 ? (
            <p className="vacio">Aún no hay ventas hoy.</p>
          ) : (
            <ul className="lista">
              {d.masVendidos.map((p) => (
                <li key={p.nombre}>
                  <span>{p.nombre}</span>
                  <b>{p.cantidad}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>Últimos cobros</h2>
          {d.ultimasVentas.length === 0 ? (
            <p className="vacio">Aún no hay cobros hoy.</p>
          ) : (
            <ul className="lista">
              {d.ultimasVentas.map((v) => (
                <li key={v.id_venta}>
                  <span>
                    {hora(v.fecha)} · Mesa {v.numero_mesa} · {v.metodo.toLowerCase()}
                  </span>
                  <b>{dinero(v.monto_total)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}