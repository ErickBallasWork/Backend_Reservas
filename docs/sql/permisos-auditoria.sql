-- RNF-06 / IF-08 / IF-09: auditoría inalterable y mínimo privilegio en Azure SQL.
-- Lo ejecuta quien administra la base (no el backend), conectado a la base de la aplicación.
-- Cambia las contraseñas antes de ejecutar y guárdalas en Key Vault.
-- En la base local de Docker no hace falta: ahí te conectas con el usuario "sa".

-- 1) Usuario de la APLICACIÓN: lee y escribe datos, pero no cambia tablas.
CREATE USER app_reservas WITH PASSWORD = 'Cambia-Esta-Clave-1!';
ALTER ROLE db_datareader ADD MEMBER app_reservas;
ALTER ROLE db_datawriter ADD MEMBER app_reservas;

-- La auditoría es de solo inserción: la aplicación no puede editarla ni borrarla.
DENY UPDATE, DELETE ON dbo.AUDIT_LOG TO app_reservas;

-- 2) Usuario de MIGRACIONES: lo usa solo el pipeline para crear o cambiar tablas.
CREATE USER migraciones_reservas WITH PASSWORD = 'Cambia-Esta-Clave-2!';
ALTER ROLE db_ddladmin ADD MEMBER migraciones_reservas;
ALTER ROLE db_datareader ADD MEMBER migraciones_reservas;
ALTER ROLE db_datawriter ADD MEMBER migraciones_reservas;
