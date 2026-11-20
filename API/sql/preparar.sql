-- Ejecutar UNA vez sobre la base de datos ya creada con tu script.
USE elmar;

-- Notas para cocina en cada comanda
ALTER TABLE comanda ADD COLUMN notas VARCHAR(200) NULL;

-- Espacio para guardar la contraseña cifrada (antes cabían solo 10 caracteres)
ALTER TABLE usuario MODIFY contrasena VARCHAR(255) NOT NULL;

-- Roles que usa la app
INSERT IGNORE INTO rol (tipo) VALUES ('ADMINISTRADOR'), ('MESERO'), ('COCINA');

-- Evita usuarios repetidos (si marca error por duplicados, borra los repetidos y vuelve a correr solo esta línea)
ALTER TABLE usuario ADD UNIQUE (usuario);