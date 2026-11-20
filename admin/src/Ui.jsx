import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export const dinero = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
export const hora = (f) => new Date(f).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

// Carga una ruta de la API y, si se pide, la refresca cada cierto tiempo
export function useDatos(ruta, cadaMs = 0) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  const recargar = useCallback(async () => {
    try {
      setDatos(await api.get(ruta));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [ruta]);

  useEffect(() => {
    recargar();
    if (!cadaMs) return;
    const t = setInterval(recargar, cadaMs);
    return () => clearInterval(t);
  }, [recargar, cadaMs]);

  return { datos, error, recargar };
}

// Ejecuta una acción (guardar, borrar…), muestra el error si falla y recarga las listas
export function useAccion(...recargas) {
  const [fallo, setFallo] = useState("");
  const ejecutar = async (accion) => {
    try {
      await accion();
      setFallo("");
      await Promise.all(recargas.map((r) => r()));
      return true;
    } catch (e) {
      setFallo(e.message);
      return false;
    }
  };
  return { fallo, ejecutar };
}

export function Campo({ etiqueta, children }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  );
}

export function Mensaje({ texto, tipo = "error" }) {
  return texto ? <p className={tipo}>{texto}</p> : null;
}

// Fecha en formato AAAA-MM-DD (hoy, o dentro de N días)
export const hoy = (dias = 0) => new Date(Date.now() + dias * 864e5).toLocaleDateString("en-CA");