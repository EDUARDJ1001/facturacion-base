# facturacion-base: memoria del proyecto

Notas para retomar el trabajo en otra sesión. Claude Code carga este archivo solo al abrir el proyecto.

## Qué es

Plantilla en blanco del sistema de facturación multiempresa (Honduras: CAI, RTN, ISV 15/18 %).
Se creó el 2026-11-23 a partir de `C:\facturacion\facturacion` (sistema original, v1.4.2, de un tercero).
- **Sin control de licencias:** se quitó todo (código, pantallas, tablas, gestor de licencias).
- **Sin marcas:** no quedan EKKO, Vi Studio, logos de marcas del pie de factura ni la URL de actualizaciones del original.
  Los datos de prueba usan "Empresa Demo 1 / 2" (códigos `DEMO1` / `DEMO2`).
- Versión `1.0.0`, paquete `facturacion-base`. **Todavía no es repositorio git** (no hay commits).
- No se copiaron `.env`, `ca.pem`, logs ni instaladores. Las dependencias ya están instaladas (`npm ci`).

## Stack y estructura

Monorepo con npm workspaces (`apps/*`), todo en TypeScript, comentarios y mensajes en español.
- `apps/backend`: API Express por módulos (`src/modules/<módulo>/{routes,controller,service}`), zod, JWT.
  Base MySQL/MariaDB (`mysql2`) **o** SQL Server (`mssql`); `DB_CLIENT` elige el motor.
  `src/app.ts` monta las rutas; `src/desktop.ts` y `src/launcher.ts` son la versión de escritorio (`Facturacion.exe`).
  `src/updates/` firma y verifica versiones (actualizaciones sin reinstalar).
- `apps/frontend`: Next.js 15 (App Router) + Tailwind + React Query. Las pantallas están en `src/app/(protected)/`
  y las llamadas a la API en `src/services/`. Capacitor para Android en `android/`.
  Se exporta estático (`out/`) y el backend lo sirve en la versión de escritorio.
- `apps/print-agent`: agente de impresión de caja (Windows) y su instalador Inno Setup (`installer/caja.iss`).
- `migrations/` (MySQL) y `migrations-mssql/` (SQL Server): migraciones incrementales con fecha.
  `*/base/` contiene la instalación completa, `esquema.json` y el script del usuario limitado de caja. **Se generan con scripts:
  no se editan a mano** (salvo emergencias, como al quitar las licencias).
- `facturacion_multiempresa_mysql.sql`: esquema original antiguo con datos demo (solo referencia).
- `docs/`: actualizaciones, acceso técnico, migración a SQL Server, validaciones, plan de optimización.

Módulos de la API: auth, companies, clients, products, warehouses, inventory, settings, invoices, proformas,
quotes, suppliers, receivables, payables, caja, banks, reports, print, users, roles (permissions), system, audit.

## Comandos (desde la raíz)

| Para qué | Comando |
|---|---|
| Desarrollo | `npm run dev:backend` (puerto 4000) y `npm run dev:frontend` (puerto 3000) |
| Revisar tipos | `npx tsc --noEmit -p apps/backend/tsconfig.json` (incluye `scripts/`), igual con `apps/frontend` y `apps/print-agent` |
| Pruebas de validación (sin base) | `cd apps/backend && npx tsx scripts/validation-test.ts` |
| Verificación completa | `npm run verificar` (necesita `.env.verificar` y crea bases temporales) |
| Datos demo | `npm run seed` (usuarios) y `npm run seed:test` (datos de prueba) |
| Migraciones | `npm run db:actualizar -- --aplicar` |
| Después de agregar una migración | `npm run db:esquema` y luego `npm run db:regenerar` |
| Producción en red local | `npm run build:prod` y luego `npm run start:prod` |
| Clave para firmar versiones | `npm run clave:actualizaciones` (`-- --cambiar` cambia la contraseña) |
| `.exe` / publicar versión | `npm run build:exe` / `npm run publicar:version -- --notas "..."` |
| Instalador de caja | `npm run build:instaladores` |

Usuarios demo (después de `npm run seed`): `superadmin`, `admin.demo1` y `admin.demo2` (contraseña `Admin123!`);
`cajero.demo1` (contraseña `Caja123!`).

## Configuración

- `.env` en la raíz o `apps/backend/.env` (ver `apps/backend/.env.example`). Sin `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`
  el backend no arranca. Sin datos de base, arranca en modo "Conectar base de datos" (lo resuelve la pantalla del sistema).
- Frontend: `apps/frontend/.env.local` con `NEXT_PUBLIC_API_URL`.
- SSL (Aiven, etc.): `DB_SSL_MODE=REQUIRED`, `DB_SSL_CA_PATH=ca.pem`.

## Reglas importantes

- **Migraciones:** solo hacia adelante y solo estructura; nunca DROP, TRUNCATE ni cambios a datos existentes.
  Metadatos en el encabezado: `-- @actualiza-datos:`, `-- @funcion:`, `-- @rutas:`, `-- @pantallas:`.
  Las reglas completas están en el README (sección Instalación) y se revisan con `npm run verificar`.
  Cada migración necesita su par MySQL y SQL Server con el mismo nombre de archivo.
- Los datos de cada empresa se filtran por la empresa activa (`x-company-id`, middleware `requireActiveCompany`).
- El logo, los colores y las marcas del pie de cada empresa se guardan en la base (data URIs), no en archivos.
  No hay reglas por nombre de empresa (`invoice-assets.ts`).
- **Actualizaciones:** `src/updates/public-key.ts` está vacío y `package.json > facturacion.updatesUrl` también.
  Hasta crear la clave, `build:exe` y `publicar:version` fallan con un aviso. La clave privada queda en `%USERPROFILE%\.facturacion\`.

## Pendientes / ideas

- Inicializar git y hacer el primer commit (el usuario lo dejó para después).
- El README conserva partes del original: dice "sin inventario" (sí tiene) y usa la IP `192.168.1.125` para la red local.
- Aún no se probó contra una base real después de quitar las licencias. Lo primero sería instalar
  `migrations/base/instalacion_completa.sql` en una base vacía y correr `npm run db:flow-test -- --confirm`.
- Si se quiere marca propia: favicon/íconos en `apps/frontend/public`, `apps/backend/installer/facturacion.ico`,
  la app Android (`capacitor.config.ts`, `com.facturacionsis.app`) y el publicador del instalador (`caja.iss`, `installer.ts`).
