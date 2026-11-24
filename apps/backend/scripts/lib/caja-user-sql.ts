/**
 * Scripts para crear el usuario de base de datos de las cajas, con permisos limitados:
 * datos del sistema sí; estructura no; control de actualizaciones solo lectura. Así,
 * aunque alguien saque la contraseña de config.env, no puede cambiar la estructura.
 * El administrador de la base (otro usuario) aplica las actualizaciones.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
export const CAJA_USER_FILES = {
  mysql: path.join(ROOT, "migrations", "base", "usuario_caja_mysql.sql"),
  mssql: path.join(ROOT, "migrations-mssql", "base", "usuario_caja_sqlserver.sql")
};

/** Control de actualizaciones de la base: la caja solo lee. */
const READ_ONLY = ["_migrations"];
const VIEWS = ["vw_invoice_print_projection"];

function schemaTables() {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "migrations", "base", "esquema.json"), "utf8")) as { tables: Record<string, unknown> };
  return Object.keys(schema.tables).sort();
}

export function buildMysqlCajaUser() {
  const tables = schemaTables();
  const lines = [
    "-- ============================================================",
    "-- Usuario de base de datos para las cajas (MySQL / MariaDB), con permisos limitados.",
    "-- Generado con: npm run db:usuario-caja --workspace backend (no editar a mano).",
    "--",
    "-- Antes de ejecutar (como administrador), reemplaza en todo el archivo:",
    "--   NOMBRE_BASE      -> nombre de la base (por ejemplo facturacion)",
    "--   USUARIO_CAJA     -> usuario para las cajas (por ejemplo caja)",
    "--   CONTRASENA_CAJA  -> contraseña de ese usuario",
    "-- Después pon ese usuario y contraseña en config.env de cada caja (DB_USER, DB_PASSWORD).",
    "-- Vuelve a ejecutarlo después de cada actualización de la base que agregue tablas.",
    "-- ============================================================",
    "",
    "CREATE USER IF NOT EXISTS 'USUARIO_CAJA'@'%' IDENTIFIED BY 'CONTRASENA_CAJA';",
    "",
    "-- Datos del sistema: leer, agregar, cambiar y borrar (sin cambiar la estructura).",
    ...tables.filter((table) => !READ_ONLY.includes(table)).map((table) => `GRANT SELECT, INSERT, UPDATE, DELETE ON \`NOMBRE_BASE\`.\`${table}\` TO 'USUARIO_CAJA'@'%';`),
    ...VIEWS.map((view) => `GRANT SELECT ON \`NOMBRE_BASE\`.\`${view}\` TO 'USUARIO_CAJA'@'%';`),
    "",
    "-- Control de actualizaciones: solo leer.",
    ...READ_ONLY.map((table) => `GRANT SELECT ON \`NOMBRE_BASE\`.\`${table}\` TO 'USUARIO_CAJA'@'%';`),
    ""
  ];
  return lines.join("\n");
}

export function buildMssqlCajaUser() {
  const lines = [
    "/* ============================================================",
    "   Usuario de base de datos para las cajas (SQL Server / Azure SQL), con permisos limitados.",
    "   Generado con: npm run db:usuario-caja --workspace backend (no editar a mano).",
    "",
    "   Antes de ejecutar (como administrador, conectado a la base del sistema), reemplaza:",
    "     USUARIO_CAJA     -> usuario para las cajas (por ejemplo caja)",
    "     CONTRASENA_CAJA  -> contraseña de ese usuario",
    "   Después pon ese usuario y contraseña en config.env de cada caja (DB_USER, DB_PASSWORD).",
    "   Las tablas nuevas de futuras actualizaciones quedan incluidas solas (roles de la base).",
    "   ============================================================ */",
    "",
    "/* SQL Server: inicio de sesión del servidor + usuario en esta base. En Azure SQL Database,",
    "   usa en su lugar: CREATE USER [USUARIO_CAJA] WITH PASSWORD = 'CONTRASENA_CAJA'; */",
    "IF SUSER_ID(N'USUARIO_CAJA') IS NULL EXEC(N'CREATE LOGIN [USUARIO_CAJA] WITH PASSWORD = N''CONTRASENA_CAJA'', CHECK_POLICY = OFF');",
    "IF USER_ID(N'USUARIO_CAJA') IS NULL EXEC(N'CREATE USER [USUARIO_CAJA] FOR LOGIN [USUARIO_CAJA]');",
    "",
    "/* Datos del sistema: leer, agregar, cambiar y borrar (sin cambiar la estructura). */",
    "ALTER ROLE db_datareader ADD MEMBER [USUARIO_CAJA];",
    "ALTER ROLE db_datawriter ADD MEMBER [USUARIO_CAJA];",
    "",
    "/* Control de actualizaciones: solo leer. */",
    ...READ_ONLY.map((table) => `DENY INSERT, UPDATE, DELETE ON [dbo].[${table}] TO [USUARIO_CAJA];`),
    ""
  ];
  return lines.join("\n");
}
