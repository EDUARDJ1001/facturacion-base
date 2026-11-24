# Facturación Multiempresa (base)

Plantilla en blanco del sistema: sin marcas de empresas y sin control de licencias.
Las empresas, logos y colores se configuran desde el propio sistema. Para publicar
actualizaciones firmadas: `npm run clave:actualizaciones` y configurar `facturacion.updatesUrl`
en `package.json` (ver `docs/actualizaciones.md`).

Sistema web de facturación sin inventario, multiempresa, con frontend y backend separados.

## Stack

- Frontend: Next.js 15 + TypeScript + App Router + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Base de datos: MySQL 8 con `mysql2/promise`
- Auth: JWT con refresh simple
- Validación: zod
- Estado del frontend: React Query + Context
- PDF / impresión: HTML imprimible + PDF por backend

## Estructura

- `apps/backend`: API Express por módulos
- `apps/frontend`: app Next.js con panel administrativo
- `migrations/base/instalacion_completa.sql`: instalación completa de la base (todo el esquema actual + catálogos + usuario inicial)
- `migrations/*.sql`: migraciones incrementales para bases ya instaladas
- `prompt_codex_facturacion_multiempresa.md`: prompt funcional base del proyecto

## Flujo principal

1. El usuario inicia sesión.
2. Selecciona la empresa activa.
3. El sistema ajusta branding, colores y layout base según `layout_key` y colores de la empresa.
4. Clientes, configuración fiscal, series y facturas se filtran por empresa activa.
5. La emisión toma el correlativo de `billing_series` dentro de la transacción y guarda snapshots fiscales y del cliente.
6. Las correcciones posteriores se registran en `invoice_corrections` sin tocar el original.

## Importante sobre el modelo

El proyecto usa el esquema MySQL existente sin crear otra base adicional.

Se asumió un MVP conservador respecto a montos fiscales:
- Las líneas se emiten como gravadas al porcentaje configurado en `billing_settings.default_tax_rate`.
- `exempt_amount` y `exonerated_amount` se mantienen en `0` en esta versión.
- No se alteró el esquema porque el modelo actual no guarda clasificación fiscal por línea.

## Instalación

### 1. Importar la base de datos

Base nueva: crea una base vacía (utf8mb4) e importa [instalacion_completa.sql](./migrations/base/instalacion_completa.sql)
(MySQL 8 o MariaDB 10.4+; mysql, phpMyAdmin, HeidiSQL). Crea todas las tablas, roles, permisos y el usuario
inicial `superadmin` / `Admin123!` (cámbiala al entrar). No trae empresas.

También se puede dejar que el sistema la prepare: en **Sistema → Base de datos**, al conectar una base vacía,
o al iniciar con `DB_AUTO_MIGRATE=true` apuntando a una base vacía.

Base existente: las migraciones pendientes se aplican desde **Sistema → Base de datos** (Aplicar actualizaciones),
con `npm run db:actualizar -- --aplicar` o solas al iniciar con `DB_AUTO_MIGRATE=true`. En los tres casos se revisan
antes y no se aplica ninguna si alguna no cumple estas reglas (las revisa también `npm run verificar`):

- Solo estructura: crear tablas, agregar columnas, índices, llaves, ampliar tipos.
- Nunca borrar (`DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE`) ni modificar datos que ya existen (`MERGE`, `REPLACE`,
  `UPDATE` de columnas existentes, `INSERT` en tablas existentes salvo `role_permissions`).
- Sí se puede llenar lo nuevo de la misma migración (columna agregada o tabla creada), declarándolo en el
  encabezado: `-- @actualiza-datos: qué completa`.
- Si una columna cambia de tipo, los datos actuales deben caber; si no, la actualización se detiene.
- Si la migración agrega una función nueva que el resto del programa no necesita (por ejemplo Bancos), declárala
  en el encabezado para que, mientras falte, solo esa función quede desactivada y el resto siga funcionando:
  `-- @funcion: Bancos`, `-- @rutas: /banks` (rutas de la API) y `-- @pantallas: /banks`. Sin `@funcion`, la
  migración es central y su falta bloquea el sistema hasta aplicarla.
- Después de agregar una migración (sin tocar ninguna base real; usan bases temporales de `.env.verificar`):
  `npm run db:esquema` (estructura de referencia) y `npm run db:regenerar` (instalaciones completas,
  script de SQL Server, usuario de caja y scripts de base nueva en `instaladores/base-de-datos`).

### 2. Variables de entorno

Backend:
- Puedes usar un `.env` en la raíz del proyecto o `apps/backend/.env`
- Si usas Aiven o un proveedor con SSL obligatorio, configura `DB_SSL_MODE=REQUIRED`
- Define `DB_SSL_CA_PATH=ca.pem` y coloca ese archivo en la raíz del proyecto
- Ajusta host, usuario, contraseña, base de datos y secretos JWT

Frontend:
- Copia `apps/frontend/.env.example` a `apps/frontend/.env.local`
- Ajusta `NEXT_PUBLIC_API_URL`

### 3. Instalar dependencias

Desde la raíz:

```bash
npm install
```

### 4. Crear usuarios demo

Con la base ya importada:

```bash
npm run seed
```

Credenciales demo:
- `superadmin / Admin123!`
- `admin.demo1 / Admin123!`
- `admin.demo2 / Admin123!`
- `cajero.demo1 / Caja123!`

### 5. Correr backend

```bash
npm run dev:backend
```

API por defecto:
- `http://localhost:4000`

### 6. Correr frontend

```bash
npm run dev:frontend
```

Frontend por defecto:
- `http://localhost:3000`

## Despliegue en red local

Configuración preparada para el servidor con IP `192.168.1.125`.

En el servidor, desde la raíz del proyecto:

```powershell
npm run build:prod
npm run start:prod
```

Luego abre la app desde cualquier dispositivo de la red en:

- Frontend: `http://192.168.1.125:3000`
- Backend health check: `http://192.168.1.125:4000/health`

Notas:
- El backend escucha en `0.0.0.0:4000`.
- El frontend publica la API como `NEXT_PUBLIC_API_URL=http://192.168.1.125:4000`.
- Si Windows Firewall pregunta permisos para Node.js, permite acceso en red privada.
- Los logs de producción quedan en `logs/`.

## Endpoints principales

### Auth
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Empresas
- `GET /api/companies/my`
- `POST /api/companies/select`

### Configuración
- `GET /api/settings/billing`
- `PUT /api/settings/billing`
- `GET /api/settings/billing/series`

### Clientes
- `GET /api/clients`
- `POST /api/clients`
- `GET /api/clients/:id`
- `PUT /api/clients/:id`
- `PATCH /api/clients/:id/status`

### Facturas
- `GET /api/invoices`
- `POST /api/invoices`
- `GET /api/invoices/:id`
- `GET /api/invoices/:id/print`
- `GET /api/invoices/:id/pdf`
- `POST /api/invoices/:id/corrections`
- `GET /api/invoices/:id/corrections`

## Lo que ya incluye

- Login con JWT y refresh simple
- Selección de empresa activa
- Branding dinámico por empresa
- CRUD de clientes
- Configuración fiscal editable
- Listado de series de facturación
- Emisión de facturas con correlativo por stored procedure
- Snapshots fiscales y del cliente
- Reimpresión HTML
- Descarga PDF
- Corrección controlada de nombre y fecha
- Auditoría de acciones importantes

## Notas operativas

- Para que el backend conecte a Aiven con SSL, el archivo `ca.pem` debe existir realmente en la raíz del proyecto.
- El logo, colores y marcas del pie de cada empresa se cargan desde el sistema (Empresa) y se guardan en la base.
- La seguridad real de datos críticos está en el backend: validación por empresa, recálculo de montos y control de correcciones.
- Si deseas soportar líneas exentas o exoneradas por separado, conviene proponer primero una mejora del esquema antes de implementarla.

