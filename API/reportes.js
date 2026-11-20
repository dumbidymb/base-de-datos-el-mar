// Gastos y reportes (solo ADMINISTRADOR).
export default function rutasReportes(app, db, autenticar, solo) {
  const admin = [autenticar, solo()];

  const texto = (v, max) => String(v ?? "").trim().slice(0, max);
  const entero = (v) => (v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) ? Number(v) : NaN);
  const decimal = (v) => (v === "" || v === null || v === undefined ? NaN : Math.round(Number(v) * 100) / 100);
  const redondea = (n) => Math.round(Number(n) * 100) / 100;
  // null si viene vacía, false si no es una fecha válida, o el texto AAAA-MM-DD
  const fechaValida = (v) => (!v ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v)) ? String(v) : false);

  const errorBD = (e, res, { dup, fk } = {}) => {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: dup || "Ya existe un registro con ese valor" });
    if (e.code === "ER_ROW_IS_REFERENCED_2") return res.status(409).json({ error: fk || "No se puede eliminar: tiene registros relacionados" });
    if (e.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "El registro relacionado no existe" });
    throw e;
  };

  // Periodo pedido por el administrador; si no manda fechas, es el mes en curso
  const hoyISO = () => new Date().toLocaleDateString("en-CA");
  const rango = (q = {}) => {
    const hasta = fechaValida(q.hasta) || hoyISO();
    const desde = fechaValida(q.desde) || hoyISO().slice(0, 8) + "01";
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  };
  const RANGO_VENTA = "v.fecha >= ? AND v.fecha < DATE_ADD(?, INTERVAL 1 DAY)";

  /* ---------- Categorías de gasto ---------- */
  app.get("/admin/categorias-gasto", admin, async (_req, res) => {
    const [filas] = await db.query("SELECT id_categoria_gasto, nombre FROM categoria_gasto ORDER BY nombre");
    res.json(filas);
  });

  app.post("/admin/categorias-gasto", admin, async (req, res) => {
    const nombre = texto(req.body?.nombre, 60);
    if (!nombre) return res.status(400).json({ error: "Escribe el nombre de la categoría" });
    const [r] = await db.query("INSERT INTO categoria_gasto (nombre) VALUES (?)", [nombre]);
    res.status(201).json({ id_categoria_gasto: r.insertId });
  });

  app.put("/admin/categorias-gasto/:id", admin, async (req, res) => {
    const nombre = texto(req.body?.nombre, 60);
    if (!nombre) return res.status(400).json({ error: "Escribe el nombre de la categoría" });
    const [r] = await db.query("UPDATE categoria_gasto SET nombre = ? WHERE id_categoria_gasto = ?", [nombre, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "La categoría no existe" });
    res.json({ ok: true });
  });

  app.delete("/admin/categorias-gasto/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM categoria_gasto WHERE id_categoria_gasto = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "La categoría no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: la categoría ya tiene gastos registrados" });
    }
  });

  /* ---------- Gastos ---------- */
  const datosGasto = (b = {}) => ({
    categoria: entero(b.id_categoria_gasto),
    metodo: b.id_metodo_pago === "" || b.id_metodo_pago === null || b.id_metodo_pago === undefined ? null : entero(b.id_metodo_pago),
    fecha: fechaValida(b.fecha),
    descripcion: texto(b.descripcion, 150) || null,
    monto: decimal(b.monto),
  });
  const gastoValido = (g) =>
    Number.isInteger(g.categoria) && (g.metodo === null || Number.isInteger(g.metodo)) && typeof g.fecha === "string" && Number.isFinite(g.monto) && g.monto > 0;
  const MENSAJE_GASTO = "Elige la categoría, una fecha válida y un monto mayor a 0";

  app.get("/admin/gastos", admin, async (req, res) => {
    const { desde, hasta } = rango(req.query);
    const [filas] = await db.query(
      `SELECT g.id_gasto, DATE_FORMAT(g.fecha, '%Y-%m-%d') AS fecha, g.descripcion, g.monto,
              g.id_categoria_gasto, c.nombre AS categoria, g.id_metodo_pago, mp.tipo AS metodo
         FROM gasto g
         JOIN categoria_gasto c ON c.id_categoria_gasto = g.id_categoria_gasto
         LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = g.id_metodo_pago
        WHERE g.fecha BETWEEN ? AND ?
        ORDER BY g.fecha DESC, g.id_gasto DESC`,
      [desde, hasta]
    );
    res.json(filas);
  });

  app.post("/admin/gastos", admin, async (req, res) => {
    const g = datosGasto(req.body);
    if (!gastoValido(g)) return res.status(400).json({ error: MENSAJE_GASTO });
    try {
      const [r] = await db.query(
        "INSERT INTO gasto (id_categoria_gasto, id_metodo_pago, fecha, descripcion, monto) VALUES (?, ?, ?, ?, ?)",
        [g.categoria, g.metodo, g.fecha, g.descripcion, g.monto]
      );
      res.status(201).json({ id_gasto: r.insertId });
    } catch (e) {
      errorBD(e, res);
    }
  });

  app.put("/admin/gastos/:id", admin, async (req, res) => {
    const g = datosGasto(req.body);
    if (!gastoValido(g)) return res.status(400).json({ error: MENSAJE_GASTO });
    try {
      const [r] = await db.query(
        "UPDATE gasto SET id_categoria_gasto = ?, id_metodo_pago = ?, fecha = ?, descripcion = ?, monto = ? WHERE id_gasto = ?",
        [g.categoria, g.metodo, g.fecha, g.descripcion, g.monto, req.params.id]
      );
      if (!r.affectedRows) return res.status(404).json({ error: "El gasto no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res);
    }
  });

  app.delete("/admin/gastos/:id", admin, async (req, res) => {
    const [r] = await db.query("DELETE FROM gasto WHERE id_gasto = ?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "El gasto no existe" });
    res.json({ ok: true });
  });

  /* ---------- Reporte del periodo ---------- */
  app.get("/admin/reporte", admin, async (req, res) => {
    const { desde, hasta } = rango(req.query);

    const [[ventas]] = await db.query(
      `SELECT COUNT(*) AS cobros, COALESCE(SUM(v.monto_total), 0) AS total FROM venta v WHERE ${RANGO_VENTA}`,
      [desde, hasta]
    );
    const [[compras]] = await db.query("SELECT COALESCE(SUM(monto_total), 0) AS total FROM compra WHERE fecha_compra BETWEEN ? AND ?", [desde, hasta]);
    const [[gastos]] = await db.query("SELECT COALESCE(SUM(monto), 0) AS total FROM gasto WHERE fecha BETWEEN ? AND ?", [desde, hasta]);
    const [[mermas]] = await db.query(
      `SELECT COALESCE(SUM(m.cantidad * i.precio_unitario), 0) AS total
         FROM movimiento_inventario m JOIN insumos i ON i.id_insumos = m.id_insumos
        WHERE m.tipo = 'MERMA' AND m.fecha >= ? AND m.fecha < DATE_ADD(?, INTERVAL 1 DAY)`,
      [desde, hasta]
    );

    // Corte de caja: ventas y gastos por método de pago
    const [ventasMetodo] = await db.query(
      `SELECT mp.tipo AS metodo, COUNT(*) AS cobros, SUM(v.monto_total) AS total
         FROM venta v JOIN metodo_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
        WHERE ${RANGO_VENTA} GROUP BY mp.id_metodo_pago, mp.tipo`,
      [desde, hasta]
    );
    const [gastosMetodo] = await db.query(
      `SELECT COALESCE(mp.tipo, 'SIN ESPECIFICAR') AS metodo, SUM(g.monto) AS total
         FROM gasto g LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = g.id_metodo_pago
        WHERE g.fecha BETWEEN ? AND ? GROUP BY mp.id_metodo_pago, mp.tipo`,
      [desde, hasta]
    );
    const metodos = new Map();
    for (const v of ventasMetodo) metodos.set(v.metodo, { metodo: v.metodo, cobros: v.cobros, ventas: Number(v.total), gastos: 0 });
    for (const g of gastosMetodo) {
      const m = metodos.get(g.metodo) || { metodo: g.metodo, cobros: 0, ventas: 0, gastos: 0 };
      m.gastos = Number(g.total);
      metodos.set(g.metodo, m);
    }

    const [porDia] = await db.query(
      `SELECT DATE_FORMAT(v.fecha, '%Y-%m-%d') AS dia, COUNT(*) AS cobros, SUM(v.monto_total) AS total
         FROM venta v WHERE ${RANGO_VENTA} GROUP BY dia ORDER BY dia`,
      [desde, hasta]
    );
    const [masVendidos] = await db.query(
      `SELECT p.nombre, SUM(d.cantidad) AS cantidad, SUM(d.cantidad * d.precio_unitario) AS ingresos
         FROM venta v
         JOIN detalle_comanda d ON d.id_comanda = v.id_comanda
         JOIN platillos p ON p.id_platillos = d.id_platillos
        WHERE ${RANGO_VENTA} GROUP BY p.id_platillos, p.nombre ORDER BY cantidad DESC LIMIT 10`,
      [desde, hasta]
    );
    const [gastosCategoria] = await db.query(
      `SELECT c.nombre AS categoria, SUM(g.monto) AS total
         FROM gasto g JOIN categoria_gasto c ON c.id_categoria_gasto = g.id_categoria_gasto
        WHERE g.fecha BETWEEN ? AND ? GROUP BY c.id_categoria_gasto, c.nombre ORDER BY total DESC`,
      [desde, hasta]
    );

    const totalVentas = redondea(ventas.total);
    res.json({
      desde,
      hasta,
      resumen: {
        ventas: totalVentas,
        cobros: ventas.cobros,
        ticket_promedio: ventas.cobros ? redondea(totalVentas / ventas.cobros) : 0,
        compras: redondea(compras.total),
        gastos: redondea(gastos.total),
        utilidad: redondea(totalVentas - compras.total - gastos.total),
        mermas: redondea(mermas.total),
      },
      porMetodo: [...metodos.values()],
      porDia,
      masVendidos,
      gastosCategoria,
    });
  });

  app.get("/admin/ventas-historial", admin, async (req, res) => {
    const { desde, hasta } = rango(req.query);
    const [filas] = await db.query(
      `SELECT v.id_venta, v.fecha, v.monto_total, m.numero_mesa, mp.tipo AS metodo, u.nombre AS mesero
         FROM venta v
         JOIN comanda c ON c.id_comanda = v.id_comanda
         JOIN mesas m ON m.id_mesas = c.id_mesas
         JOIN metodo_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         JOIN usuario u ON u.id_usuario = c.id_usuario
        WHERE ${RANGO_VENTA}
        ORDER BY v.fecha DESC LIMIT 200`,
      [desde, hasta]
    );
    res.json(filas);
  });

  // Datos para imprimir el ticket de una venta
  app.get("/admin/ventas/:id/ticket", admin, async (req, res) => {
    const [[v]] = await db.query(
      `SELECT v.id_venta, v.id_comanda, v.fecha, v.monto_total, m.numero_mesa, mp.tipo AS metodo, u.nombre AS mesero
         FROM venta v
         JOIN comanda c ON c.id_comanda = v.id_comanda
         JOIN mesas m ON m.id_mesas = c.id_mesas
         JOIN metodo_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         JOIN usuario u ON u.id_usuario = c.id_usuario
        WHERE v.id_venta = ?`,
      [req.params.id]
    );
    if (!v) return res.status(404).json({ error: "La venta no existe" });
    const [lineas] = await db.query(
      `SELECT p.nombre, d.cantidad, d.precio_unitario, d.cantidad * d.precio_unitario AS importe
         FROM detalle_comanda d JOIN platillos p ON p.id_platillos = d.id_platillos
        WHERE d.id_comanda = ? ORDER BY p.nombre`,
      [v.id_comanda]
    );
    res.json({ ...v, lineas });
  });
}