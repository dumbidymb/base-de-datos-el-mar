// Uso: node crear-usuario.js <usuario> <contraseña> "<Nombre completo>" [ADMINISTRADOR|MESERO|COCINA]
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const [usuario, contrasena, nombre, rol = "MESERO"] = process.argv.slice(2);
if (!usuario || !contrasena || !nombre) {
  console.log('Uso: node crear-usuario.js <usuario> <contraseña> "<Nombre completo>" [ADMINISTRADOR|MESERO|COCINA]');
  process.exit(1);
}

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  ssl: process.env.DB_SSL
    ? { rejectUnauthorized: process.env.DB_SSL !== "sin-verificar", ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }) }
    : undefined,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "elmar",
});

const [[r]] = await db.query("SELECT id_rol FROM rol WHERE UPPER(tipo) = ?", [rol.toUpperCase()]);
if (!r) {
  console.log(`El rol "${rol}" no existe. Corre primero preparar.sql.`);
  process.exit(1);
}
const [[existe]] = await db.query("SELECT 1 AS si FROM usuario WHERE usuario = ?", [usuario]);
if (existe) {
  console.log(`El usuario "${usuario}" ya existe.`);
  process.exit(1);
}

await db.query("INSERT INTO usuario (id_rol, nombre, usuario, contrasena) VALUES (?, ?, ?, ?)", [
  r.id_rol,
  nombre,
  usuario,
  await bcrypt.hash(contrasena, 10),
]);
console.log(`Usuario "${usuario}" creado con rol ${rol.toUpperCase()}`);
await db.end();