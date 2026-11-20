
const API = import.meta.env.VITE_API_URL || "/api";
export const MODO_DEMO = false; // modo demo desactivado: el login siempre se valida en la BD

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

const leerLS = () => {
  try {
    return JSON.parse(localStorage.getItem("demo_comandas")) || [];
  } catch {
    return [];
  }
};
const guardarLS = (lista) => localStorage.setItem("demo_comandas", JSON.stringify(lista));

export async function obtenerComandas() {
  if (MODO_DEMO) return leerLS();
  return http("/comandas");
}

export async function cambiarEstado(id_comanda, estado) {
  if (MODO_DEMO) {
    guardarLS(leerLS().map((c) => (c.id_comanda === id_comanda ? { ...c, estado } : c)));
    return;
  }
  await http(`/comandas/${id_comanda}`, { method: "PATCH", body: JSON.stringify({ estado }) });
}

// Solo para probar la pantalla en modo demo, sin la app del mesero.
export async function crearComandaDePrueba() {
  guardarLS([
    ...leerLS(),
    {
      id_comanda: Date.now(),
      numero_mesa: Math.ceil(Math.random() * 12),
      notas: "Sin cebolla",
      fecha_hora: new Date().toISOString(),
      estado: "PENDIENTE",
      detalle: [
        { nombre: "Ceviche de camarón", cantidad: 2 },
        { nombre: "Agua de horchata", cantidad: 1 },
      ],
    },
  ]);
}

export async function login(usuario, contrasena) {
  if (MODO_DEMO) return { id_usuario: 1, nombre: usuario || "Cocina demo", rol: "COCINA" };
  return http("/login", { method: "POST", body: JSON.stringify({ usuario, contrasena }) });
}