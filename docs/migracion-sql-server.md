# Migración a SQL Server (local y nube)

Objetivo: que el sistema use **un solo motor, SQL Server**, tanto en una PC/servidor local
(SQL Server Express o superior) como en la nube (**Azure SQL Database**), y que instalarlo en
una PC nueva sea: crear la base, ejecutar un script y configurar la conexión.

> Estado: **Fase 1 lista** (script de base de datos probado en SQL Server 2019).
> El programa **todavía usa MySQL**: no funcionará contra SQL Server hasta terminar la Fase 2.

---

## Decisiones que evitan conflictos futuros

1. **Un solo motor.** Local y nube usan SQL Server. No se mantienen MySQL y SQL Server a la vez
   más allá de la transición (duplicaría pruebas y errores).
2. **Versión mínima: SQL Server 2019 (nivel de compatibilidad 150)** en local y en Azure.
   No usar funciones solo de 2022/Azure: `GREATEST`, `LEAST`, `IS [NOT] DISTINCT FROM`,
   `DATE_BUCKET`, `JSON_OBJECT`, `JSON_ARRAY`, `GENERATE_SERIES`.
3. **Fechas en UTC.** Azure SQL siempre trabaja en UTC y no se puede cambiar. Todas las columnas
   de fecha/hora se guardan en UTC (`SYSUTCDATETIME()`); el programa convierte a hora de Honduras
   (UTC−6, sin horario de verano) para mostrar e imprimir. "Hoy" en Honduras se calcula como
   `CAST(DATEADD(HOUR, -6, SYSUTCDATETIME()) AS date)`.
4. **Intercalación `Modern_Spanish_CI_AI`** (no distingue mayúsculas ni acentos, igual que hoy
   en MySQL). Se fija al crear la base.
5. **`READ_COMMITTED_SNAPSHOT ON`** (en Azure ya viene así). Las lecturas normales no se bloquean
   con las escrituras, igual que en MySQL/InnoDB.
6. **Todas las restricciones con nombre fijo** (`PK_`, `FK`, `UQ`, `CK_`, `DF_`), para poder
   modificarlas en migraciones futuras sin buscar nombres autogenerados.
7. **Migraciones con el mismo nombre de archivo** en `migrations/` (MySQL) y `migrations-mssql/`
   (SQL Server) mientras dure la transición; la tabla `_migrations` registra el mismo nombre en
   ambos motores. Al terminar, solo queda `migrations-mssql/`.
8. **La instalación completa se genera, no se escribe a mano**
   (`npm run db:mssql-sql --workspace backend`), así no se desfasa del esquema real.

---

## Fase 1: base de datos (lista)

Archivo: [`migrations-mssql/base/instalacion_sqlserver.sql`](../migrations-mssql/base/instalacion_sqlserver.sql)

- 39 tablas, 93 relaciones, índices, vista de impresión de facturas, roles, 62 permisos por
  rol, versiones y el usuario inicial `superadmin` / `Admin123!` (cambiarla al entrar).
- Un solo lote (sin `GO`) dentro de una transacción: si algo falla, no queda nada a medias.
  Se niega a ejecutarse en `master` o en una base que ya tenga tablas.
- Probado en SQL Server 2019: mismas columnas, índices y relaciones que la base MySQL actual
  (única diferencia intencional: `cash_sessions.open_guard`, ver abajo).

Conversiones aplicadas:

| MySQL | SQL Server | Nota |
|---|---|---|
| `BIGINT UNSIGNED`, `INT UNSIGNED` | `BIGINT` | SQL Server no tiene "unsigned" |
| `TINYINT(1)` | `TINYINT` | Sigue devolviendo 0/1 (no `BIT`/booleano), menos cambios en el programa |
| `VARCHAR(n)` / `TEXT` / `LONGTEXT` | `NVARCHAR(n)` / `NVARCHAR(MAX)` | Unicode (tildes, ñ) |
| `TIMESTAMP` / `DATETIME` | `DATETIME2(0)` | En UTC |
| `ENUM(...)` | `NVARCHAR` + `CHECK (... IN (...))` | |
| JSON (`json_valid`) | `NVARCHAR(MAX)` + `CHECK (ISJSON(col) = 1)` | |
| `AUTO_INCREMENT` | `IDENTITY(1,1)` | |
| `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT SYSUTCDATETIME()` | |
| `ON UPDATE CURRENT_TIMESTAMP` | *(no existe)* | El programa pone `updated_at` en cada `UPDATE` |
| Único sobre columna que admite NULL | Índice único **filtrado** (`WHERE col IS NOT NULL`) | SQL Server solo permite un NULL en un único normal |
| `open_guard` (columna calculada) | Índice único filtrado `WHERE status = 'ABIERTA'` | Una sola sesión abierta por caja |
| `ON UPDATE CASCADE` | `ON UPDATE NO ACTION` | Los id nunca cambian |
| `ON DELETE CASCADE / SET NULL` | Solo donde el programa borra el padre (6 relaciones); el resto `NO ACTION` | SQL Server no permite varios caminos de cascada |
| Procedimiento `sp_take_next_invoice_number` | *(no se migra)* | El programa ya no lo usa |

---

## Qué debes crear tú

### Opción A: SQL Server local (una PC o servidor de la tienda)

1. Instalar **SQL Server 2019 o superior** (Express es gratis, límite 10 GB por base).
2. En *SQL Server Configuration Manager*: habilitar **TCP/IP**, puerto **1433** y reiniciar el servicio.
   Autenticación **mixta** (SQL Server y Windows).
3. Firewall de Windows: permitir el puerto 1433 **solo desde la red de las cajas**.
4. Ejecutar (conectado a `master`):

```sql
CREATE DATABASE facturacion COLLATE Modern_Spanish_CI_AI;
ALTER DATABASE facturacion SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
ALTER DATABASE facturacion SET COMPATIBILITY_LEVEL = 150;

CREATE LOGIN facturacion_app WITH PASSWORD = 'UnaClaveLargaYSegura!2026', CHECK_POLICY = ON;
USE facturacion;
CREATE USER facturacion_app FOR LOGIN facturacion_app;
ALTER ROLE db_owner ADD MEMBER facturacion_app;  -- necesario para aplicar migraciones
```

5. Conectado a la base `facturacion`, ejecutar `migrations-mssql/base/instalacion_sqlserver.sql`
   (SSMS, Azure Data Studio o `sqlcmd -S servidor -d facturacion -U facturacion_app -P ... -f 65001 -i instalacion_sqlserver.sql`).

### Opción B: Azure SQL Database (nube)

1. Crear un *servidor lógico* de Azure SQL y, en la base, intercalación `Modern_Spanish_CI_AI`
   (en el portal: *Configuración adicional → Intercalación*; **no se puede cambiar después**).
2. Firewall del servidor: agregar **solo las IP públicas de las tiendas**.
3. Conectado a la base (no a `master`), crear un usuario contenido:

```sql
CREATE USER facturacion_app WITH PASSWORD = 'UnaClaveLargaYSegura!2026';
ALTER ROLE db_owner ADD MEMBER facturacion_app;
ALTER DATABASE CURRENT SET COMPATIBILITY_LEVEL = 150;
```

4. Ejecutar `instalacion_sqlserver.sql` conectado a esa base.

### Credenciales

No uses `sa` ni el administrador del servidor. Cuando la Fase 2 esté lista, pon los datos en el
`.env` de la PC (`DB_CLIENT=mssql`, `DB_HOST`, `DB_PORT=1433`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`DB_SSL_MODE=REQUIRED` para Azure) en lugar de enviarlos por chat o correo.

---

## Fase 2: adaptar el programa (pendiente, la más grande)

Driver: `mssql` (tedious, JavaScript puro: sirve para el `.exe`/escritorio sin instalar nada).

| Cambio | Cantidad aprox. | Cómo |
|---|---|---|
| Capa de conexión | 1 | `config/db.ts` con `mssql`; misma forma `query(sql, params)` y `withTransaction`; parámetros `?` → `@p1..@pn` automático |
| ID del registro nuevo (`insertId`) | 45 | `INSERT ... OUTPUT INSERTED.id` |
| `LIMIT`/`OFFSET` | 64 | `ORDER BY ... OFFSET n ROWS FETCH NEXT m ROWS ONLY` o `TOP (n)` |
| Bloqueos `FOR UPDATE` | 10 | `WITH (UPDLOCK, ROWLOCK)` |
| `LOCK IN SHARE MODE` (caja) | 3 | `WITH (HOLDLOCK, ROWLOCK)` |
| `GET_LOCK` / `RELEASE_LOCK` | 4 | `sp_getapplock` / `sp_releaseapplock` |
| `ON DUPLICATE KEY UPDATE`, `INSERT IGNORE` | 6 | `MERGE ... WITH (HOLDLOCK)` o `UPDATE` + `INSERT` |
| Error de duplicado `ER_DUP_ENTRY` | 10 | Números de error 2627 y 2601 |
| `GREATEST` | 2 | `IIF`/`CASE` (2019 no tiene `GREATEST`) |
| `REGEXP` | 1 | `LIKE 'REC-[0-9]%'` + validación en el programa |
| `CURDATE()`, `NOW()`, `INTERVAL` | ~10 | Fechas UTC + `DATEADD` |
| `<=>` (igual incluyendo NULL) | 1 | `(a = b OR (a IS NULL AND b IS NULL))` |
| Nombres entre comillas invertidas | varios | `[nombre]` |
| `information_schema` (migraciones, sistema) | ~5 | `sys.tables`, `sys.columns` |
| Pantalla Sistema → Base de datos | 1 | Puerto 1433, instancia, conexión cifrada |
| Reintento por bloqueo mutuo | nuevo | Error 1205: reintentar la transacción una vez |

---

## Fase 3: pasar los datos actuales (pendiente)

Script `MySQL → SQL Server` que copie tabla por tabla en orden de dependencias con
`SET IDENTITY_INSERT ON` (conserva los id), **sume 6 horas** a las fechas/horas (hoy están en hora
de Honduras; en SQL Server van en UTC; las columnas solo-fecha no cambian), y al final compare
cantidad de filas y totales (suma de facturas, saldos, existencias) entre ambas bases.

## Fase 4: pruebas (pendiente)

Facturar (contado/crédito, con y sin inventario), anular, corregir; proformas y cotizaciones y su
conversión; cobros y pagos (recibos); apertura, movimientos y cierre de caja; entradas y ajustes
de inventario; PDF y tickets; permisos y usuarios. Prueba de concurrencia: 15 facturas simultáneas
desde varias cajas sin números repetidos ni saltos.

## Fase 5: cambio definitivo (pendiente)

1. Respaldo de MySQL. 2. Cerrar cajas y detener el sistema. 3. Pasar los datos (Fase 3) y verificar.
4. Cambiar el `.env` de cada caja a SQL Server. 5. Prueba rápida en cada caja.
6. Mantener MySQL intacto y en solo lectura 30 días como respaldo (plan de regreso).
7. Después, quitar el código y las migraciones de MySQL.

---

## Posibles problemas

| Problema | Dónde | Prevención |
|---|---|---|
| Hora corrida 6 horas | Azure (siempre UTC) | Todo en UTC y conversión en el programa (decisión 3) |
| Búsquedas que dejan de encontrar "José" con "jose" | Intercalación distinta | `Modern_Spanish_CI_AI` al crear la base |
| No conecta a SQL Server local | TCP/IP deshabilitado, instancia con nombre (`SQLEXPRESS`) sin puerto fijo, firewall, solo autenticación de Windows | Pasos de la Opción A; usar puerto fijo 1433 |
| No conecta a Azure | IP de la tienda no autorizada, conexión sin cifrar | Firewall de Azure; `encrypt=true` |
| IP pública de la tienda cambia | Azure | IP fija con el proveedor de internet, o VPN |
| Base llena | Express: 10 GB; Azure Basic: 2 GB | Logos e imágenes pesan (se guardan en la base); vigilar tamaño; subir de plan |
| Lentitud en la nube | Latencia por internet; Azure Basic tiene poca capacidad | Región cercana (East US/South Central US); plan Standard S1 o superior para varias cajas |
| Bloqueos mutuos entre cajas (error 1205) | Ventas simultáneas | Mismo orden de bloqueo en todo el programa + reintento automático |
| Error "SET options have incorrect settings" | Índices filtrados con `QUOTED_IDENTIFIER OFF` (p. ej. `sqlcmd`) | El script y el programa activan esas opciones |
| Funciones que existen en Azure pero no en la PC local | Azure va por delante de 2019 | Nivel de compatibilidad 150 y lista de funciones prohibidas (decisión 2) |
| Varios NULL en un campo único | Índices únicos | Índices filtrados (ya aplicado) |
| "Caminos múltiples de cascada" al crear relaciones | SQL Server | Cascadas solo donde hacen falta (ya aplicado) |
| Costo | Azure | Presupuesto mensual y alertas en Azure |
| Sin internet no se factura | Nube | Igual que hoy con base en la nube; si es crítico, servidor local |
