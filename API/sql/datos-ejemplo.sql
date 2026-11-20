-- OPCIONAL: solo para probar. Carga mesas, categorías y platillos de ejemplo.
-- Las categorías y los platillos se cargan solo si esas tablas están vacías.
USE elmar;

INSERT IGNORE INTO mesas (numero_mesa, capacidad, ubicacion) VALUES
(1,4,'INTERIOR'),(2,4,'INTERIOR'),(3,4,'INTERIOR'),(4,4,'INTERIOR'),
(5,4,'INTERIOR'),(6,4,'INTERIOR'),(7,4,'INTERIOR'),(8,4,'INTERIOR'),
(9,6,'TERRAZA'),(10,6,'TERRAZA'),(11,6,'TERRAZA'),(12,6,'TERRAZA');

INSERT INTO categoria_platillo (nombre_categoria, descripcion)
SELECT v.n, v.d FROM (
  SELECT 'Mariscos' n, 'Platillos del mar' d
  UNION ALL SELECT 'Caldos', 'Caldos calientes'
  UNION ALL SELECT 'Bebidas', 'Bebidas frías y calientes'
  UNION ALL SELECT 'Postres', 'Postres de la casa'
) v
WHERE NOT EXISTS (SELECT 1 FROM categoria_platillo);

INSERT INTO platillos (id_categoria, nombre, descripcion, precio)
SELECT c.id_categoria, v.nombre, v.descripcion, v.precio FROM (
  SELECT 'Mariscos' cat, 'Ceviche de camarón' nombre, 'Limón, pepino y cilantro' descripcion, 120 precio
  UNION ALL SELECT 'Mariscos', 'Tostada de atún', 'Con aguacate y chipotle', 55
  UNION ALL SELECT 'Mariscos', 'Filete empanizado', 'Con arroz y ensalada', 140
  UNION ALL SELECT 'Caldos', 'Caldo de camarón', NULL, 130
  UNION ALL SELECT 'Caldos', 'Caldo de pescado', NULL, 115
  UNION ALL SELECT 'Bebidas', 'Agua de horchata', NULL, 30
  UNION ALL SELECT 'Bebidas', 'Refresco', NULL, 28
  UNION ALL SELECT 'Bebidas', 'Cerveza', NULL, 45
  UNION ALL SELECT 'Postres', 'Flan', NULL, 40
) v JOIN categoria_platillo c ON c.nombre_categoria = v.cat
WHERE NOT EXISTS (SELECT 1 FROM platillos);