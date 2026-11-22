// Inventario, recetas, proveedores y compras (solo ADMINISTRADOR).
// Nota: tu tabla insumos tiene la columna "stock_monimo" (con ese nombre); aquí se usa tal cual.

// Descuenta del inventario los insumos de las recetas de una comanda.
// Se llama dentro de una transacción cuando cocina marca la comanda como ENTREGADO.
// El stock puede quedar negativo: así cocina nunca se bloquea y se nota que falta registrar una compra.
export async function descontarInsumos(con, id_comanda, id_usuario) {
  const [usos] = await con.query(
    `SELECT r.id_insumos, SUM(r.cantidad_requerida * d.cantidad) AS cantidad
       FROM detalle_comanda d JOIN receta r ON r.id_platillos = d.id_platillos
      WHERE d.id_comanda = ? GROUP BY r.id_insumos ORDER BY r.id_insumos`,
    [id_comanda]
  );
  for (const u of usos) {
    await con.query("UPDATE insumos SET cantidad_stock = cantidad_stock - ? WHERE id_insumos = ?", [u.cantidad, u.id_insumos]);
  }
  if (usos.length) {
    await con.query("INSERT INTO movimiento_inventario (id_insumos, id_usuario, tipo, cantidad, motivo) VALUES ?", [
      usos.map((u) => [u.id_insumos, id_usuario, "SALIDA", u.cantidad, `Comanda #${id_comanda}`]),
    ]);
  }
}

export default function rutasInventario(app, db, autenticar, solo) {
  const admin = [autenticar, solo()];

  const texto = (v, max) => String(v ?? "").trim().slice(0, max);
  const entero = (v) => (v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) ? Number(v) : NaN);
  const decimal = (v) => (v === "" || v === null || v === undefined ? NaN : Math.round(Number(v) * 100) / 100);
  const redondea = (n) => Math.round(n * 100) / 100;
  const fechaValida = (v) => (!v ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : false);

  const errorBD = (e, res, { dup, fk } = {}) => {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: dup || "Ya existe un registro con ese valor" });
    if (e.code === "ER_ROW_IS_REFERENCED_2") return res.status(409).json({ error: fk || "No se puede eliminar: tiene registros relacionados" });
    if (e.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "El registro relacionado no existe" });
    throw e;
  };

  /* ---------- Insumos ---------- */
  const COLUMNAS = `id_insumos, tipo, nombre, cantidad_stock, stock_monimo AS stock_minimo, unidad_medida,
                    DATE_FORMAT(fecha_caducidad, '%Y-%m-%d') AS fecha_caducidad, precio_unitario`;

  const datosInsumo = (b = {}) => ({
    tipo: texto(b.tipo, 30),
    nombre: texto(b.nombre, 100),
    unidad: texto(b.unidad_medida, 15),
    minimo: decimal(b.stock_minimo),
    precio: decimal(b.precio_unitario),
    caducidad: fechaValida(b.fecha_caducidad),
    stock: b.cantidad_stock === undefined || b.cantidad_stock === "" ? 0 : decimal(b.cantidad_stock),
  });
  const insumoValido = (i) =>
    i.tipo && i.nombre && i.unidad && i.caducidad !== false &&
    [i.minimo, i.precio, i.stock].every((n) => Number.isFinite(n) && n >= 0);
  const MENSAJE_INSUMO = "Completa nombre, tipo y unidad, y usa números mayores o iguales a 0";

  app.get("/admin/insumos", admin, async (_req, res) => {
    const [filas] = await db.query(`SELECT ${COLUMNAS} FROM insumos ORDER BY nombre`);
    res.json(filas);
  });

  app.post("/admin/insumos", admin, async (req, res) => {
    const i = datosInsumo(req.body);
    if (!insumoValido(i)) return res.status(400).json({ error: MENSAJE_INSUMO });
    const con = await db.getConnection();
    try {
      await con.beginTransaction();
      const [r] = await con.query(
        "INSERT INTO insumos (tipo, nombre, cantidad_stock, stock_monimo, unidad_medida, fecha_caducidad, precio_unitario) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [i.tipo, i.nombre, i.stock, i.minimo, i.unidad, i.caducidad, i.precio]
      );
      if (i.stock > 0) {
        await con.query(
          "INSERT INTO movimiento_inventario (id_insumos, id_usuario, tipo, cantidad, motivo) VALUES (?, ?, 'ENTRADA', ?, 'Stock inicial')",
          [r.insertId, req.usuario.id_usuario, i.stock]
        );
      }
      await con.commit();
      res.status(201).json({ id_insumos: r.insertId });
    } catch (e) {
      await con.rollback();
      throw e;
    } finally {
      con.release();
    }
  });

  // El stock no se edita aquí: se cambia con movimientos para que quede registro
  app.put("/admin/insumos/:id", admin, async (req, res) => {
    const i = datosInsumo({ ...req.body, cantidad_stock: 0 });
    if (!insumoValido(i)) return res.status(400).json({ error: MENSAJE_INSUMO });
    const [r] = await db.query(
      "UPDATE insumos SET tipo = ?, nombre = ?, stock_monimo = ?, unidad_medida = ?, fecha_caducidad = ?, precio_unitario = ? WHERE id_insumos = ?",
      [i.tipo, i.nombre, i.minimo, i.unidad, i.caducidad, i.precio, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "El insumo no existe" });
    res.json({ ok: true });
  });

  app.delete("/admin/insumos/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM insumos WHERE id_insumos = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "El insumo no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: el insumo tiene movimientos, compras o recetas" });
    }
  });

  /* ---------- Movimientos de inventario ---------- */
  app.get("/admin/movimientos", admin, async (_req, res) => {
    const [filas] = await db.query(
      `SELECT m.id_movimiento, m.fecha, m.tipo, m.cantidad, m.motivo, i.nombre AS insumo, i.unidad_medida, u.nombre AS usuario
         FROM movimiento_inventario m
         JOIN insumos i ON i.id_insumos = m.id_insumos
         JOIN usuario u ON u.id_usuario = m.id_usuario
        ORDER BY m.fecha DESC, m.id_movimiento DESC LIMIT 50`
    );
    res.json(filas);
  });

  app.post("/admin/movimientos", admin, async (req, res) => {
    const id_insumos = entero(req.body?.id_insumos);
    const tipo = String(req.body?.tipo || "");
    const cantidad = decimal(req.body?.cantidad);
    const motivo = texto(req.body?.motivo, 200) || null;
    if (!Number.isInteger(id_insumos) || !["ENTRADA", "SALIDA", "MERMA"].includes(tipo) || !(cantidad > 0)) {
      return res.status(400).json({ error: "Elige el insumo, el tipo y una cantidad mayor a 0" });
    }

    const con = await db.getConnection();
    const abortar = async (codigo, error) => {
      await con.rollback();
      return res.status(codigo).json({ error });
    };
    try {
      await con.beginTransaction();
      const [[i]] = await con.query("SELECT cantidad_stock FROM insumos WHERE id_insumos = ? FOR UPDATE", [id_insumos]);
      if (!i) return await abortar(404, "El insumo no existe");
      const delta = tipo === "ENTRADA" ? cantidad : -cantidad;
      if (delta < 0 && i.cantidad_stock + delta < 0) return await abortar(409, `No hay suficiente stock (hay ${i.cantidad_stock})`);
      await con.query("UPDATE insumos SET cantidad_stock = cantidad_stock + ? WHERE id_insumos = ?", [delta, id_insumos]);
      await con.query("INSERT INTO movimiento_inventario (id_insumos, id_usuario, tipo, cantidad, motivo) VALUES (?, ?, ?, ?, ?)", [
        id_insumos,
        req.usuario.id_usuario,
        tipo,
        cantidad,
        motivo,
      ]);
      await con.commit();
      res.status(201).json({ ok: true });
    } catch (e) {
      await con.rollback();
      throw e;
    } finally {
      con.release();
    }
  });

  /* ---------- Recetas y costos ---------- */
  app.get("/admin/costos", admin, async (_req, res) => {
    const [filas] = await db.query(
      `SELECT p.id_platillos, p.nombre, p.precio, c.nombre_categoria AS categoria,
              COALESCE(SUM(r.cantidad_requerida * i.precio_unitario), 0) AS costo,
              COUNT(r.id_insumos) AS ingredientes
         FROM platillos p
         JOIN categoria_platillo c ON c.id_categoria = p.id_categoria
         LEFT JOIN receta r ON r.id_platillos = p.id_platillos
         LEFT JOIN insumos i ON i.id_insumos = r.id_insumos
        GROUP BY p.id_platillos, p.nombre, p.precio, c.nombre_categoria
        ORDER BY c.nombre_categoria, p.nombre`
    );
    res.json(filas);
  });

  app.get("/admin/recetas/:id", admin, async (req, res) => {
    const [filas] = await db.query("SELECT id_insumos, cantidad_requerida FROM receta WHERE id_platillos = ?", [req.params.id]);
    res.json(filas);
  });

  // Reemplaza la receta completa del platillo
  app.put("/admin/recetas/:id", admin, async (req, res) => {
    const id = entero(req.params.id);
    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
    const cantidades = new Map();
    for (const l of lineas) {
      const insumo = entero(l.id_insumos);
      const cant = decimal(l.cantidad_requerida);
      if (!Number.isInteger(insumo) || !(cant > 0)) {
        return res.status(400).json({ error: "Cada ingrediente necesita un insumo y una cantidad mayor a 0" });
      }
      cantidades.set(insumo, redondea((cantidades.get(insumo) || 0) + cant));
    }

    const con = await db.getConnection();
    try {
      await con.beginTransaction();
      await con.query("DELETE FROM receta WHERE id_platillos = ?", [id]);
      if (cantidades.size) {
        await con.query("INSERT INTO receta (id_platillos, id_insumos, cantidad_requerida) VALUES ?", [
          [...cantidades].map(([insumo, cant]) => [id, insumo, cant]),
        ]);
      }
      await con.commit();
      res.json({ ok: true });
    } catch (e) {
      await con.rollback();
      errorBD(e, res);
    } finally {
      con.release();
    }
  });

  /* ---------- Proveedores (tabla "provedores") ---------- */
  const datosProveedor = (b = {}) => ({
    nombre: texto(b.nombre, 100),
    tipo: texto(b.tipo_insumo, 100) || null,
    telefono: texto(b.telefono, 11) || null,
    correo: texto(b.correo, 100) || null,
    direccion: texto(b.direccion, 100) || null,
  });

  app.get("/admin/proveedores", admin, async (_req, res) => {
    const [filas] = await db.query("SELECT id_proveedor, nombre, tipo_insumo, telefono, correo, direccion FROM provedores ORDER BY nombre");
    res.json(filas);
  });

  app.post("/admin/proveedores", admin, async (req, res) => {
    const p = datosProveedor(req.body);
    if (!p.nombre) return res.status(400).json({ error: "Escribe el nombre del proveedor" });
    const [r] = await db.query("INSERT INTO provedores (nombre, tipo_insumo, telefono, correo, direccion) VALUES (?, ?, ?, ?, ?)", [
      p.nombre,
      p.tipo,
      p.telefono,
      p.correo,
      p.direccion,
    ]);
    res.status(201).json({ id_proveedor: r.insertId });
  });

  app.put("/admin/proveedores/:id", admin, async (req, res) => {
    const p = datosProveedor(req.body);
    if (!p.nombre) return res.status(400).json({ error: "Escribe el nombre del proveedor" });
    const [r] = await db.query(
      "UPDATE provedores SET nombre = ?, tipo_insumo = ?, telefono = ?, correo = ?, direccion = ? WHERE id_proveedor = ?",
      [p.nombre, p.tipo, p.telefono, p.correo, p.direccion, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "El proveedor no existe" });
    res.json({ ok: true });
  });

  app.delete("/admin/proveedores/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM provedores WHERE id_proveedor = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "El proveedor no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: el proveedor ya tiene compras registradas" });
    }
  });

  /* ---------- Compras ---------- */
  app.get("/admin/compras", admin, async (_req, res) => {
    const [compras] = await db.query(
      `SELECT c.id_compra, DATE_FORMAT(c.fecha_compra, '%Y-%m-%d') AS fecha_compra, c.monto_total, p.nombre AS proveedor, u.nombre AS usuario
         FROM compra c
         JOIN provedores p ON p.id_proveedor = c.id_proveedor
         JOIN usuario u ON u.id_usuario = c.id_usuario
        ORDER BY c.fecha_compra DESC, c.id_compra DESC LIMIT 30`
    );
    if (!compras.length) return res.json([]);
    const [lineas] = await db.query(
      `SELECT d.id_compra, i.nombre, i.unidad_medida, d.cantidad
         FROM detalle_compra d JOIN insumos i ON i.id_insumos = d.id_insumos
        WHERE d.id_compra IN (?)`,
      [compras.map((c) => c.id_compra)]
    );
    res.json(compras.map((c) => ({ ...c, lineas: lineas.filter((l) => l.id_compra === c.id_compra) })));
  });

  // El total se calcula con el precio actual de cada insumo (tu detalle_compra ya no guarda precio)
  app.post("/admin/compras", admin, async (req, res) => {
    const id_proveedor = entero(req.body?.id_proveedor);
    const fecha = fechaValida(req.body?.fecha_compra);
    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
    const cantidades = new Map();
    for (const l of lineas) {
      const insumo = entero(l.id_insumos);
      const cant = decimal(l.cantidad);
      if (!Number.isInteger(insumo) || !(cant > 0)) {
        return res.status(400).json({ error: "Cada línea necesita un insumo y una cantidad mayor a 0" });
      }
      cantidades.set(insumo, redondea((cantidades.get(insumo) || 0) + cant));
    }
    if (!Number.isInteger(id_proveedor) || fecha === false || !cantidades.size) {
      return res.status(400).json({ error: "Elige proveedor, una fecha válida y al menos un insumo" });
    }

    const con = await db.getConnection();
    try {
      await con.beginTransaction();
      const [insumos] = await con.query(
        "SELECT id_insumos, precio_unitario FROM insumos WHERE id_insumos IN (?) ORDER BY id_insumos FOR UPDATE",
        [[...cantidades.keys()]]
      );
      if (insumos.length !== cantidades.size) {
        await con.rollback();
        return res.status(400).json({ error: "Hay insumos que ya no existen" });
      }

      const total = redondea(insumos.reduce((s, i) => s + i.precio_unitario * cantidades.get(i.id_insumos), 0));
      const [r] = await con.query("INSERT INTO compra (id_proveedor, id_usuario, fecha_compra, monto_total) VALUES (?, ?, COALESCE(?, CURDATE()), ?)", [
        id_proveedor,
        req.usuario.id_usuario,
        fecha,
        total,
      ]);
      await con.query("INSERT INTO detalle_compra (id_insumos, id_compra, cantidad) VALUES ?", [
        insumos.map((i) => [i.id_insumos, r.insertId, cantidades.get(i.id_insumos)]),
      ]);
      for (const i of insumos) {
        await con.query("UPDATE insumos SET cantidad_stock = cantidad_stock + ? WHERE id_insumos = ?", [cantidades.get(i.id_insumos), i.id_insumos]);
      }
      await con.query("INSERT INTO movimiento_inventario (id_insumos, id_usuario, tipo, cantidad, motivo) VALUES ?", [
        insumos.map((i) => [i.id_insumos, req.usuario.id_usuario, "ENTRADA", cantidades.get(i.id_insumos), `Compra #${r.insertId}`]),
      ]);
      await con.commit();
      res.status(201).json({ id_compra: r.insertId, total });
    } catch (e) {
      await con.rollback();
      errorBD(e, res);
    } finally {
      con.release();
    }
  });
}