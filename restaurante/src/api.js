
const API = import.meta.env.VITE_API_URL || "/api";
export const MODO_DEMO = false; // modo demo desactivado: el login siempre se valida en la BD

function cabeceras() {
  let token;
  try {
    token = JSON.parse(sessionStorage.getItem("usuario"))?.token;
  } catch {
    
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

/* ---------- Datos de ejemplo (solo modo demo) ---------- */
const DEMO_MESAS = Array.from({ length: 12 }, (_, i) => ({
  id_mesas: i + 1,
  numero_mesa: i + 1,
  capacidad: i < 8 ? 4 : 6,
  ubicacion: i < 8 ? "INTERIOR" : "TERRAZA",
  estado: "LIBRE",
}));
const DEMO_CATEGORIAS = [
  { id_categoria: 1, nombre_categoria: "Mariscos" },
  { id_categoria: 2, nombre_categoria: "Caldos" },
  { id_categoria: 3, nombre_categoria: "Bebidas" },
  { id_categoria: 4, nombre_categoria: "Postres" },
];
const DEMO_PLATILLOS = [
  [1, "Ceviche de camarón", "Limón, pepino y cilantro", 120],
  [1, "Tostada de atún", "Con aguacate y chipotle", 55],
  [1, "Filete empanizado", "Con arroz y ensalada", 140],
  [2, "Caldo de camarón", "", 130],
  [2, "Caldo de pescado", "", 115],
  [3, "Agua de horchata", "", 30],
  [3, "Refresco", "", 28],
  [3, "Cerveza", "", 45],
  [4, "Flan", "", 40],
].map(([id_categoria, nombre, descripcion, precio], i) => ({
  id_platillos: i + 1,
  id_categoria,
  nombre,
  descripcion,
  precio,
}));

const leerLS = (clave, defecto) => {
  try {
    return JSON.parse(localStorage.getItem(clave)) || defecto;
  } catch {
    return defecto;
  }
};

/* ---------- Funciones que usa la interfaz ---------- */
export async function login(usuario, contrasena) {
  if (MODO_DEMO) return { id_usuario: 1, nombre: usuario || "Mesero demo", rol: "MESERO" };
  return http("/login", { method: "POST", body: JSON.stringify({ usuario, contrasena }) });
}

export async function obtenerMesas() {
  if (MODO_DEMO) return leerLS("demo_mesas", DEMO_MESAS);
  return http("/mesas");
}

export async function obtenerMenu() {
  if (MODO_DEMO) return { categorias: DEMO_CATEGORIAS, platillos: DEMO_PLATILLOS };
  const [categorias, platillos] = await Promise.all([http("/categorias"), http("/platillos")]);
  return { categorias, platillos };
}

export async function enviarComanda(comanda) {
  if (!MODO_DEMO) return http("/comandas", { method: "POST", body: JSON.stringify(comanda) });

  // Modo demo: guarda en localStorage con la misma forma que devolvería la API a cocina
  const mesas = leerLS("demo_mesas", DEMO_MESAS).map((m) =>
    m.id_mesas === comanda.id_mesas ? { ...m, estado: "OCUPADA" } : m
  );
  localStorage.setItem("demo_mesas", JSON.stringify(mesas));
  const nueva = {
    id_comanda: Date.now(),
    id_mesas: comanda.id_mesas,
    numero_mesa: comanda.numero_mesa,
    notas: comanda.notas,
    fecha_hora: new Date().toISOString(),
    estado: "PENDIENTE",
    detalle: comanda.detalle,
  };
  localStorage.setItem("demo_comandas", JSON.stringify([...leerLS("demo_comandas", []), nueva]));
  return nueva;
}

export async function liberarMesa(id_mesas) {
  if (!MODO_DEMO) return http(`/mesas/${id_mesas}/liberar`, { method: "PATCH" });
  const mesas = leerLS("demo_mesas", DEMO_MESAS).map((m) => (m.id_mesas === id_mesas ? { ...m, estado: "LIBRE" } : m));
  localStorage.setItem("demo_mesas", JSON.stringify(mesas));
}