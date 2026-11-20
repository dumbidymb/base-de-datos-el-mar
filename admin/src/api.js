// Conexión de la app ADMIN con la API (todas las rutas, menos /login, llevan el token).
// Por defecto usa "/api", que el servidor de Vite (vite.config.js) reenvía a la API en el puerto 3000.
// Define VITE_API_URL en .env solo si la API está en OTRA computadora (ej. http://192.168.1.50:3000).
const API = import.meta.env.VITE_API_URL || "/api";

function cabeceras() {
  let token;
  try {
    token = JSON.parse(sessionStorage.getItem("usuario"))?.token;
  } catch {
    /* sin sesión */
  }
  return { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) };
}

async function http(ruta, opciones = {}) {
  let r;
  try {
    r = await fetch(API + ruta, { ...opciones, headers: cabeceras() });
  } catch {
    throw new Error("No hay conexión con el servidor");
  }
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && ruta !== "/login") {
    sessionStorage.removeItem("usuario"); // sesión vencida: vuelve al login
    location.reload();
  }
  if (!r.ok) throw new Error(datos.error || "Error del servidor");
  return datos;
}

const enviar = (metodo) => (ruta, datos) => http(ruta, { method: metodo, body: JSON.stringify(datos ?? {}) });

export const api = {
  get: (ruta) => http(ruta),
  post: enviar("POST"),
  put: enviar("PUT"),
  patch: enviar("PATCH"),
  del: (ruta) => http(ruta, { method: "DELETE" }),
};