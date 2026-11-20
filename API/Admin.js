import bcrypt from "bcryptjs";

// Rutas del ADMINISTRADOR. Todas exigen una sesión con rol ADMINISTRADOR.
export default function rutasAdmin(app, db, autenticar, solo) {
  const admin = [autenticar, solo()];

  const texto = (v, max) => String(v ?? "").trim().slice(0, max);
  const entero = (v) => (v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) ? Number(v) : NaN);
  const decimal = (v) => (v === "" || v === null || v === undefined ? NaN : Math.round(Number(v) * 100) / 100);

  // Traduce errores típicos de MySQL a mensajes claros
  const errorBD = (e, res, { dup, fk } = {}) => {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: dup || "Ya existe un registro con ese valor" });
    if (e.code === "ER_ROW_IS_REFERENCED_2") return res.status(409).json({ error: fk || "No se puede eliminar: tiene registros relacionados" });
    if (e.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "El registro relacionado no existe" });
    throw e;
  };

  async function conDetalle(comandas) {
    if (!comandas.length) return [];
    const [lineas] = await db.query(
      `SELECT d.id_comanda, p.nombre, d.cantidad
         FROM detalle_comanda d JOIN platillos p ON p.id_platillos = d.id_platillos
        WHERE d.id_comanda IN (?)`,
      [comandas.map((c) => c.id_comanda)]
    );
    return comandas.map((c) => ({
      ...c,
      detalle: lineas.filter((l) => l.id_comanda === c.id_comanda).map(({ nombre, cantidad }) => ({ nombre, cantidad })),
    }));
  }

  // Libera la mesa si ya no quedan comandas sin cobrar
  async function liberarMesaSiLibre(con, id_mesas) {
    const [[pendiente]] = await con.query(
      `SELECT 1 AS si FROM comanda c LEFT JOIN venta v ON v.id_comanda = c.id_comanda
        WHERE c.id_mesas = ? AND c.estado <> 'CANCELADO' AND v.id_venta IS NULL LIMIT 1`,
      [id_mesas]
    );
    if (!pendiente) await con.query("UPDATE mesas SET estado = 'LIBRE' WHERE id_mesas = ?", [id_mesas]);
    return !pendiente;
  }

  /* ---------- Panel ---------- */
  app.get("/admin/resumen", admin, async (_req, res) => {
    const [[ventas]] = await db.query(
      "SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_total), 0) AS total FROM venta WHERE DATE(fecha) = CURDATE()"
    );
    const [[porCobrar]] = await db.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(c.total), 0) AS total
         FROM comanda c LEFT JOIN venta v ON v.id_comanda = c.id_comanda
        WHERE v.id_venta IS NULL AND c.estado <> 'CANCELADO'`
    );
    const [[cocina]] = await db.query("SELECT COUNT(*) AS cantidad FROM comanda WHERE estado IN ('PENDIENTE','EN_PREPARACION')");
    const [[mesas]] = await db.query("SELECT COUNT(*) AS total, COALESCE(SUM(estado = 'OCUPADA'), 0) AS ocupadas FROM mesas");
    const [masVendidos] = await db.query(
      `SELECT p.nombre, SUM(d.cantidad) AS cantidad
         FROM detalle_comanda d
         JOIN comanda c ON c.id_comanda = d.id_comanda
         JOIN platillos p ON p.id_platillos = d.id_platillos
        WHERE DATE(c.fecha_hora) = CURDATE() AND c.estado <> 'CANCELADO'
        GROUP BY p.id_platillos, p.nombre ORDER BY cantidad DESC LIMIT 5`
    );
    const [ultimasVentas] = await db.query(
      `SELECT v.id_venta, v.fecha, v.monto_total, m.numero_mesa, mp.tipo AS metodo
         FROM venta v
         JOIN comanda c ON c.id_comanda = v.id_comanda
         JOIN mesas m ON m.id_mesas = c.id_mesas
         JOIN metodo_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
        WHERE DATE(v.fecha) = CURDATE() ORDER BY v.fecha DESC LIMIT 10`
    );
    const [[alertas]] = await db.query(
      `SELECT COALESCE(SUM(cantidad_stock <= stock_monimo), 0) AS bajos,
              COALESCE(SUM(fecha_caducidad IS NOT NULL AND fecha_caducidad <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)), 0) AS por_caducar
         FROM insumos`
    );
    res.json({ ventas, porCobrar, cocina: cocina.cantidad, mesas, masVendidos, ultimasVentas, alertas });
  });

  /* ---------- Cobro ---------- */
  app.get("/admin/por-cobrar", admin, async (_req, res) => {
    const [comandas] = await db.query(
      `SELECT c.id_comanda, m.numero_mesa, c.notas, c.fecha_hora, c.estado, c.total, u.nombre AS mesero
         FROM comanda c
         JOIN mesas m ON m.id_mesas = c.id_mesas
         JOIN usuario u ON u.id_usuario = c.id_usuario
         LEFT JOIN venta v ON v.id_comanda = c.id_comanda
        WHERE v.id_venta IS NULL AND c.estado <> 'CANCELADO'
        ORDER BY m.numero_mesa, c.fecha_hora`
    );
    res.json(await conDetalle(comandas));
  });

  app.get("/admin/metodos-pago", admin, async (_req, res) => {
    const [filas] = await db.query("SELECT id_metodo_pago, tipo, detalles FROM metodo_pago ORDER BY id_metodo_pago");
    res.json(filas);
  });

  app.post("/admin/ventas", admin, async (req, res) => {
    const id_comanda = entero(req.body?.id_comanda);
    const id_metodo_pago = entero(req.body?.id_metodo_pago);
    if (!Number.isInteger(id_comanda) || !Number.isInteger(id_metodo_pago)) {
      return res.status(400).json({ error: "Elige una comanda y un método de pago" });
    }

    const con = await db.getConnection();
    const abortar = async (codigo, error) => {
      await con.rollback();
      return res.status(codigo).json({ error });
    };
    try {
      await con.beginTransaction();
      const [[c]] = await con.query("SELECT id_comanda, id_mesas, estado, total FROM comanda WHERE id_comanda = ? FOR UPDATE", [id_comanda]);
      if (!c) return await abortar(404, "La comanda no existe");
      if (c.estado !== "ENTREGADO") return await abortar(409, "La comanda aún no está entregada");
      const [[ya]] = await con.query("SELECT 1 AS si FROM venta WHERE id_comanda = ?", [id_comanda]);
      if (ya) return await abortar(409, "Esa comanda ya fue cobrada");
      const [[metodo]] = await con.query("SELECT id_metodo_pago FROM metodo_pago WHERE id_metodo_pago = ?", [id_metodo_pago]);
      if (!metodo) return await abortar(400, "El método de pago no existe");

      const [r] = await con.query("INSERT INTO venta (id_comanda, id_metodo_pago, monto_total) VALUES (?, ?, ?)", [
        id_comanda,
        id_metodo_pago,
        c.total,
      ]);
      const mesa_liberada = await liberarMesaSiLibre(con, c.id_mesas);
      await con.commit();
      res.status(201).json({ id_venta: r.insertId, mesa_liberada });
    } catch (e) {
      await con.rollback();
      throw e;
    } finally {
      con.release();
    }
  });

  app.patch("/admin/comandas/:id/cancelar", admin, async (req, res) => {
    const [[c]] = await db.query(
      `SELECT c.id_mesas, c.estado, v.id_venta
         FROM comanda c LEFT JOIN venta v ON v.id_comanda = c.id_comanda WHERE c.id_comanda = ?`,
      [req.params.id]
    );
    if (!c) return res.status(404).json({ error: "La comanda no existe" });
    if (c.id_venta) return res.status(409).json({ error: "Esa comanda ya fue cobrada" });
    if (c.estado === "CANCELADO") return res.status(409).json({ error: "Esa comanda ya está cancelada" });
    await db.query("UPDATE comanda SET estado = 'CANCELADO' WHERE id_comanda = ?", [req.params.id]);
    await liberarMesaSiLibre(db, c.id_mesas);
    res.json({ ok: true });
  });

  /* ---------- Mesas ---------- */
  const datosMesa = (b = {}) => ({
    numero_mesa: entero(b.numero_mesa),
    capacidad: entero(b.capacidad),
    ubicacion: texto(b.ubicacion || "INTERIOR", 30).toUpperCase(),
  });
  const mesaValida = (m) => m.numero_mesa > 0 && m.capacidad > 0;

  app.post("/admin/mesas", admin, async (req, res) => {
    const m = datosMesa(req.body);
    if (!mesaValida(m)) return res.status(400).json({ error: "Número y capacidad deben ser enteros mayores a 0" });
    try {
      const [r] = await db.query("INSERT INTO mesas (numero_mesa, capacidad, ubicacion) VALUES (?, ?, ?)", [m.numero_mesa, m.capacidad, m.ubicacion]);
      res.status(201).json({ id_mesas: r.insertId });
    } catch (e) {
      errorBD(e, res, { dup: "Ya existe una mesa con ese número" });
    }
  });

  app.put("/admin/mesas/:id", admin, async (req, res) => {
    const m = datosMesa(req.body);
    if (!mesaValida(m)) return res.status(400).json({ error: "Número y capacidad deben ser enteros mayores a 0" });
    try {
      const [r] = await db.query("UPDATE mesas SET numero_mesa = ?, capacidad = ?, ubicacion = ? WHERE id_mesas = ?", [
        m.numero_mesa,
        m.capacidad,
        m.ubicacion,
        req.params.id,
      ]);
      if (!r.affectedRows) return res.status(404).json({ error: "La mesa no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { dup: "Ya existe una mesa con ese número" });
    }
  });

  app.delete("/admin/mesas/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM mesas WHERE id_mesas = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "La mesa no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: la mesa ya tiene comandas registradas" });
    }
  });

  /* ---------- Menú: categorías ---------- */
  const datosCategoria = (b = {}) => ({ nombre: texto(b.nombre_categoria, 100), descripcion: texto(b.descripcion, 200) });

  app.post("/admin/categorias", admin, async (req, res) => {
    const c = datosCategoria(req.body);
    if (!c.nombre) return res.status(400).json({ error: "Escribe el nombre de la categoría" });
    const [r] = await db.query("INSERT INTO categoria_platillo (nombre_categoria, descripcion) VALUES (?, ?)", [c.nombre, c.descripcion]);
    res.status(201).json({ id_categoria: r.insertId });
  });

  app.put("/admin/categorias/:id", admin, async (req, res) => {
    const c = datosCategoria(req.body);
    if (!c.nombre) return res.status(400).json({ error: "Escribe el nombre de la categoría" });
    const [r] = await db.query("UPDATE categoria_platillo SET nombre_categoria = ?, descripcion = ? WHERE id_categoria = ?", [
      c.nombre,
      c.descripcion,
      req.params.id,
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: "La categoría no existe" });
    res.json({ ok: true });
  });

  app.delete("/admin/categorias/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM categoria_platillo WHERE id_categoria = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "La categoría no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: la categoría tiene platillos" });
    }
  });

  /* ---------- Menú: platillos ---------- */
  const datosPlatillo = (b = {}) => ({
    id_categoria: entero(b.id_categoria),
    nombre: texto(b.nombre, 100),
    descripcion: texto(b.descripcion, 200) || null,
    precio: decimal(b.precio),
    disponible: b.disponible === false || b.disponible === 0 ? 0 : 1,
  });
  const platilloValido = (p) => Number.isInteger(p.id_categoria) && p.nombre && Number.isFinite(p.precio) && p.precio >= 0;

  app.get("/admin/platillos", admin, async (_req, res) => {
    const [filas] = await db.query(
      `SELECT p.id_platillos, p.id_categoria, c.nombre_categoria AS categoria, p.nombre, p.descripcion, p.precio, p.disponible
         FROM platillos p JOIN categoria_platillo c ON c.id_categoria = p.id_categoria
        ORDER BY c.nombre_categoria, p.nombre`
    );
    res.json(filas);
  });

  app.post("/admin/platillos", admin, async (req, res) => {
    const p = datosPlatillo(req.body);
    if (!platilloValido(p)) return res.status(400).json({ error: "Completa nombre, categoría y un precio válido" });
    try {
      const [r] = await db.query(
        "INSERT INTO platillos (id_categoria, nombre, descripcion, precio, disponible) VALUES (?, ?, ?, ?, ?)",
        [p.id_categoria, p.nombre, p.descripcion, p.precio, p.disponible]
      );
      res.status(201).json({ id_platillos: r.insertId });
    } catch (e) {
      errorBD(e, res);
    }
  });

  app.put("/admin/platillos/:id", admin, async (req, res) => {
    const p = datosPlatillo(req.body);
    if (!platilloValido(p)) return res.status(400).json({ error: "Completa nombre, categoría y un precio válido" });
    try {
      const [r] = await db.query(
        "UPDATE platillos SET id_categoria = ?, nombre = ?, descripcion = ?, precio = ?, disponible = ? WHERE id_platillos = ?",
        [p.id_categoria, p.nombre, p.descripcion, p.precio, p.disponible, req.params.id]
      );
      if (!r.affectedRows) return res.status(404).json({ error: "El platillo no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res);
    }
  });

  app.delete("/admin/platillos/:id", admin, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM platillos WHERE id_platillos = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "El platillo no existe" });
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { fk: "No se puede eliminar: el platillo ya aparece en comandas o recetas. Mejor márcalo como no disponible." });
    }
  });

  /* ---------- Usuarios ---------- */
  app.get("/admin/roles", admin, async (_req, res) => {
    const [filas] = await db.query("SELECT id_rol, tipo FROM rol ORDER BY id_rol");
    res.json(filas);
  });

  app.get("/admin/usuarios", admin, async (_req, res) => {
    const [filas] = await db.query(
      `SELECT u.id_usuario, u.nombre, u.usuario, u.activo, r.id_rol, r.tipo AS rol
         FROM usuario u JOIN rol r ON r.id_rol = u.id_rol ORDER BY u.nombre`
    );
    res.json(filas);
  });

  app.post("/admin/usuarios", admin, async (req, res) => {
    const nombre = texto(req.body?.nombre, 100);
    const usuario = texto(req.body?.usuario, 30);
    const contrasena = String(req.body?.contrasena ?? "");
    const id_rol = entero(req.body?.id_rol);
    if (!nombre || !usuario || !Number.isInteger(id_rol)) return res.status(400).json({ error: "Completa nombre, usuario y rol" });
    if (contrasena.length < 4) return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });

    const [[ya]] = await db.query("SELECT 1 AS si FROM usuario WHERE usuario = ?", [usuario]);
    if (ya) return res.status(409).json({ error: "Ese usuario ya existe" });
    try {
      const [r] = await db.query("INSERT INTO usuario (id_rol, nombre, usuario, contrasena) VALUES (?, ?, ?, ?)", [
        id_rol,
        nombre,
        usuario,
        await bcrypt.hash(contrasena, 10),
      ]);
      res.status(201).json({ id_usuario: r.insertId });
    } catch (e) {
      errorBD(e, res, { dup: "Ese usuario ya existe" });
    }
  });

  app.put("/admin/usuarios/:id", admin, async (req, res) => {
    const id = Number(req.params.id);
    const nombre = texto(req.body?.nombre, 100);
    const usuario = texto(req.body?.usuario, 30);
    const contrasena = String(req.body?.contrasena ?? "");
    const id_rol = entero(req.body?.id_rol);
    const activo = req.body?.activo === false || req.body?.activo === 0 ? 0 : 1;
    if (!nombre || !usuario || !Number.isInteger(id_rol)) return res.status(400).json({ error: "Completa nombre, usuario y rol" });
    if (contrasena && contrasena.length < 4) return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });

    const [[actual]] = await db.query("SELECT id_rol FROM usuario WHERE id_usuario = ?", [id]);
    if (!actual) return res.status(404).json({ error: "El usuario no existe" });
    if (id === req.usuario.id_usuario && (!activo || actual.id_rol !== id_rol)) {
      return res.status(400).json({ error: "No puedes desactivarte ni cambiarte el rol a ti mismo" });
    }
    const [[repetido]] = await db.query("SELECT 1 AS si FROM usuario WHERE usuario = ? AND id_usuario <> ?", [usuario, id]);
    if (repetido) return res.status(409).json({ error: "Ese usuario ya existe" });

    const campos = ["nombre = ?", "usuario = ?", "id_rol = ?", "activo = ?"];
    const valores = [nombre, usuario, id_rol, activo];
    if (contrasena) {
      campos.push("contrasena = ?");
      valores.push(await bcrypt.hash(contrasena, 10));
    }
    try {
      await db.query(`UPDATE usuario SET ${campos.join(", ")} WHERE id_usuario = ?`, [...valores, id]);
      res.json({ ok: true });
    } catch (e) {
      errorBD(e, res, { dup: "Ese usuario ya existe" });
    }
  });
}