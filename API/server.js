import "dotenv/config";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rutasAdmin from "./Admin.js";
import rutasInventario, { descontarInsumos } from "./Inventario.js";
import rutasReportes from "./reportes.js";

const { DB_HOST = "localhost", DB_USER = "root", DB_PASSWORD = "", DB_NAME = "elmar", PORT = 3000, JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error("Falta JWT_SECRET en el archivo .env (copia .env.example a .env y llénalo).");
  process.exit(1);
}

const db = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  decimalNumbers: true, // precios y totales salen como número, no como texto
  waitForConnections: true,
  connectionLimit: 10,
});

try {
  await db.query("SELECT 1");
  console.log(`Conectado a MySQL (base de datos "${DB_NAME}")`);
} catch (e) {
  console.error(`No se pudo conectar a MySQL: ${e.message}`);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

/* ---------- Sesión y permisos ---------- */
function autenticar(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión no válida. Inicia sesión de nuevo." });
  }
}

// El ADMINISTRADOR puede hacer todo; los demás roles solo lo que se les indique
const solo = (...roles) => (req, res, next) =>
  ["ADMINISTRADOR", ...roles].includes(req.usuario.rol)
    ? next()
    : res.status(403).json({ error: "No tienes permiso para esta acción" });

app.post("/login", async (req, res) => {
  const { usuario, contrasena } = req.body || {};
  if (!usuario || !contrasena) return res.status(400).json({ error: "Escribe usuario y contraseña" });

  const [[u]] = await db.query(
    "SELECT u.id_usuario, u.nombre, u.contrasena, r.tipo AS rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.usuario = ? AND u.activo = 1",
    [usuario]
  );
  const guardada = u?.contrasena || "";
  const hasheada = guardada.startsWith("$2");
  // Si la contraseña aún está en texto plano (de antes), se acepta una vez y se convierte a hash
  const ok = u && (hasheada ? await bcrypt.compare(contrasena, guardada) : guardada === contrasena);
  if (!ok) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  if (!hasheada) {
    await db.query("UPDATE usuario SET contrasena = ? WHERE id_usuario = ?", [await bcrypt.hash(contrasena, 10), u.id_usuario]);
  }

  const datos = { id_usuario: u.id_usuario, nombre: u.nombre, rol: String(u.rol).toUpperCase() };
  res.json({ ...datos, token: jwt.sign(datos, JWT_SECRET, { expiresIn: "12h" }) });
});

/* ---------- Mesas y menú ---------- */
app.get("/mesas", autenticar, async (_req, res) => {
  const [filas] = await db.query("SELECT id_mesas, numero_mesa, capacidad, ubicacion, estado FROM mesas ORDER BY numero_mesa");
  res.json(filas);
});

app.patch("/mesas/:id/liberar", autenticar, solo("MESERO"), async (req, res) => {
  const [[activa]] = await db.query(
    "SELECT 1 AS hay FROM comanda WHERE id_mesas = ? AND estado IN ('PENDIENTE','EN_PREPARACION') LIMIT 1",
    [req.params.id]
  );
  if (activa) return res.status(409).json({ error: "Esa mesa aún tiene pedidos en cocina" });
  const [r] = await db.query("UPDATE mesas SET estado = 'LIBRE' WHERE id_mesas = ?", [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "La mesa no existe" });
  res.json({ ok: true });
});

app.get("/categorias", autenticar, async (_req, res) => {
  const [filas] = await db.query("SELECT id_categoria, nombre_categoria FROM categoria_platillo ORDER BY id_categoria");
  res.json(filas);
});

app.get("/platillos", autenticar, async (_req, res) => {
  const [filas] = await db.query("SELECT id_platillos, id_categoria, nombre, descripcion, precio FROM platillos WHERE disponible = 1 ORDER BY nombre");
  res.json(filas);
});

/* ---------- Comandas ---------- */
app.post("/comandas", autenticar, solo("MESERO"), async (req, res) => {
  const { id_mesas, notas, detalle } = req.body || {};
  if (!Number.isInteger(id_mesas) || !Array.isArray(detalle) || !detalle.length) {
    return res.status(400).json({ error: "La comanda está incompleta" });
  }

  // Une platillos repetidos y valida cantidades
  const cantidades = new Map();
  for (const d of detalle) {
    if (!Number.isInteger(d.id_platillos) || !Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > 50) {
      return res.status(400).json({ error: "Platillo o cantidad no válidos" });
    }
    cantidades.set(d.id_platillos, (cantidades.get(d.id_platillos) || 0) + d.cantidad);
  }

  const con = await db.getConnection();
  try {
    await con.beginTransaction();

    // Los precios se toman de la BD, no de lo que mande el celular
    const [platillos] = await con.query("SELECT id_platillos, precio FROM platillos WHERE disponible = 1 AND id_platillos IN (?)", [[...cantidades.keys()]]);
    if (platillos.length !== cantidades.size) {
      await con.rollback();
      return res.status(400).json({ error: "Hay platillos que ya no están disponibles en el menú" });
    }
    const [[mesa]] = await con.query("SELECT id_mesas FROM mesas WHERE id_mesas = ?", [id_mesas]);
    if (!mesa) {
      await con.rollback();
      return res.status(400).json({ error: "La mesa no existe" });
    }

    const total = Math.round(platillos.reduce((s, p) => s + p.precio * cantidades.get(p.id_platillos), 0) * 100) / 100;
    const [r] = await con.query("INSERT INTO comanda (id_mesas, id_usuario, total, notas) VALUES (?, ?, ?, ?)", [
      id_mesas,
      req.usuario.id_usuario,
      total,
      String(notas || "").slice(0, 200) || null,
    ]);
    await con.query("INSERT INTO detalle_comanda (id_comanda, id_platillos, cantidad, precio_unitario) VALUES ?", [
      platillos.map((p) => [r.insertId, p.id_platillos, cantidades.get(p.id_platillos), p.precio]),
    ]);
    await con.query("UPDATE mesas SET estado = 'OCUPADA' WHERE id_mesas = ?", [id_mesas]);

    await con.commit();
    res.status(201).json({ id_comanda: r.insertId, total });
  } catch (e) {
    await con.rollback();
    throw e;
  } finally {
    con.release();
  }
});

app.get("/comandas", autenticar, solo("COCINA"), async (_req, res) => {
  const [comandas] = await db.query(
    `SELECT c.id_comanda, m.numero_mesa, c.notas, c.fecha_hora, c.estado
       FROM comanda c JOIN mesas m ON m.id_mesas = c.id_mesas
      WHERE c.estado IN ('PENDIENTE','EN_PREPARACION')
         OR (c.estado = 'ENTREGADO' AND DATE(c.fecha_hora) = CURDATE())
      ORDER BY c.fecha_hora`
  );
  if (!comandas.length) return res.json([]);

  const [lineas] = await db.query(
    `SELECT d.id_comanda, p.nombre, d.cantidad
       FROM detalle_comanda d JOIN platillos p ON p.id_platillos = d.id_platillos
      WHERE d.id_comanda IN (?)`,
    [comandas.map((c) => c.id_comanda)]
  );
  res.json(
    comandas.map((c) => ({
      ...c,
      detalle: lineas.filter((l) => l.id_comanda === c.id_comanda).map(({ nombre, cantidad }) => ({ nombre, cantidad })),
    }))
  );
});

app.patch("/comandas/:id", autenticar, solo("COCINA"), async (req, res) => {
  const { estado } = req.body || {};
  if (!["EN_PREPARACION", "ENTREGADO"].includes(estado)) return res.status(400).json({ error: "Estado no válido" });
  const id = Number(req.params.id);

  const con = await db.getConnection();
  try {
    await con.beginTransaction();
    const [[c]] = await con.query("SELECT estado FROM comanda WHERE id_comanda = ? FOR UPDATE", [id]);
    if (!c || c.estado === "CANCELADO") {
      await con.rollback();
      return res.status(404).json({ error: "Comanda no encontrada" });
    }
    if (c.estado === estado) {
      await con.rollback(); // ya estaba en ese estado (por ejemplo, doble clic)
      return res.json({ ok: true });
    }
    if (c.estado === "ENTREGADO") {
      await con.rollback();
      return res.status(409).json({ error: "La comanda ya fue entregada" });
    }
    await con.query("UPDATE comanda SET estado = ? WHERE id_comanda = ?", [estado, id]);
    // Al entregar, se descuentan del inventario los insumos de las recetas
    if (estado === "ENTREGADO") await descontarInsumos(con, id, req.usuario.id_usuario);
    await con.commit();
    res.json({ ok: true });
  } catch (e) {
    await con.rollback();
    throw e;
  } finally {
    con.release();
  }
});

rutasAdmin(app, db, autenticar, solo);
rutasInventario(app, db, autenticar, solo);
rutasReportes(app, db, autenticar, solo);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error del servidor" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`API lista en http://localhost:${PORT}`));