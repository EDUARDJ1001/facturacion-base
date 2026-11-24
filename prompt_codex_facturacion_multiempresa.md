Quiero que desarrolles un sistema web completo de facturación sin inventario, multiempresa, con frontend y backend separados, usando esta base de datos MySQL ya creada previamente.

Stack preferido:
- Frontend: Next.js 15 + TypeScript + App Router + Tailwind CSS + shadcn/ui
- Backend/API: Node.js + Express + TypeScript
- Base de datos: MySQL 8 usando mysql2/promise
- Autenticación: JWT con refresh simple o sesión segura
- Validación: zod
- Estado del frontend: React Query + Context para auth y empresa activa
- PDF / impresión: vista HTML imprimible + endpoint para descargar PDF
- Formularios: react-hook-form + zod

No quiero inventario.
No quiero POS complejo.
Quiero un sistema administrativo simple, claro y profesional.

Contexto funcional del sistema:
1. El usuario inicia sesión.
2. Después del login debe seleccionar con cuál empresa trabajará.
3. Habrá 2 empresas iniciales:
   - Empresa Demo 1
   - Empresa Demo 2
4. Según la empresa seleccionada, debe cambiar:
   - logo
   - colores
   - nombre mostrado
   - layout branding básico
   - configuración fiscal utilizada para facturar
5. Cada empresa tiene sus propios:
   - datos fiscales
   - CAI
   - fecha límite de emisión
   - rango autorizado
   - correlativo
   - clientes
   - facturas
6. La factura no maneja inventario.
7. El detalle de factura se agrega manualmente.
8. Una factura emitida no se edita libremente.
9. Solo se permite corrección posterior controlada de:
   - nombre del cliente
   - fecha de factura
10. Estas correcciones no deben sobrescribir la factura original.
11. Debe quedar trazabilidad completa del cambio.

Base de datos:
Debes usar la base MySQL ya existente tal como está definida en el script.
Tablas principales:
- roles
- users
- companies
- user_company_access
- billing_settings
- billing_series
- clients
- invoices
- invoice_items
- invoice_corrections
- audit_logs
- vista vw_invoice_print_projection
- procedimiento sp_take_next_invoice_number

Restricciones importantes:
- No crear otra base distinta.
- No cambiar el modelo sin necesidad.
- Si detectas mejoras, proponlas antes de alterar el esquema.
- Mantener el sistema listo para crecimiento, pero enfocarlo en MVP funcional.

Requerimientos del backend:
1. Crear estructura limpia por capas:
   - src/config
   - src/modules/auth
   - src/modules/companies
   - src/modules/clients
   - src/modules/invoices
   - src/modules/settings
   - src/modules/audit
   - src/middlewares
   - src/utils
2. Implementar:
   - login
   - perfil actual
   - empresas permitidas por usuario
   - selección de empresa activa
   - CRUD de clientes por empresa
   - obtener configuración fiscal de empresa activa
   - actualizar configuración fiscal
   - listar series de facturación
   - emitir factura
   - listar facturas
   - ver factura por id
   - aplicar corrección de factura
   - historial de correcciones
   - vista de impresión / PDF
3. El backend debe:
   - validar que el usuario tenga acceso a la empresa
   - trabajar siempre filtrando por empresa_id
   - usar el procedimiento sp_take_next_invoice_number al emitir factura
   - guardar snapshot fiscal y snapshot del cliente al emitir
   - calcular montos correctamente
   - impedir editar montos, detalle, CAI y correlativo después de emitir
   - registrar auditoría importante en audit_logs
4. Crear endpoints REST claros y consistentes.
5. Incluir manejo de errores limpio y mensajes entendibles.
6. Incluir archivo .env.example.

Endpoints sugeridos:
- POST /api/auth/login
- GET /api/auth/me
- GET /api/companies/my
- POST /api/companies/select
- GET /api/settings/billing
- PUT /api/settings/billing
- GET /api/clients
- POST /api/clients
- GET /api/clients/:id
- PUT /api/clients/:id
- PATCH /api/clients/:id/status
- GET /api/invoices
- POST /api/invoices
- GET /api/invoices/:id
- GET /api/invoices/:id/print
- GET /api/invoices/:id/pdf
- POST /api/invoices/:id/corrections
- GET /api/invoices/:id/corrections

Requerimientos del frontend:
1. Crear app Next.js organizada, limpia y responsive.
2. Pantallas mínimas:
   - Login
   - Selección de empresa
   - Dashboard
   - Clientes
   - Nueva factura
   - Historial de facturas
   - Detalle / impresión de factura
   - Configuración
3. El layout debe cambiar según la empresa activa:
   - usar CompanyContext
   - branding dinámico por layout_key y colores de company
4. Sidebar y header reutilizables.
5. Debe existir un botón para cambiar empresa.
6. La vista “Nueva factura” debe permitir:
   - buscar o registrar cliente
   - editar fecha de factura
   - agregar líneas manuales
   - calcular subtotal, ISV y total
   - mostrar total en letras
   - emitir factura
7. La vista de historial debe permitir:
   - buscar por número
   - filtrar por fecha
   - filtrar por cliente
   - ver detalle
   - imprimir
   - descargar PDF
   - aplicar corrección controlada
8. La vista de factura debe verse parecida a la plantilla actual:
   - encabezado fiscal
   - datos del cliente
   - tabla de detalle
   - subtotal
   - descuentos
   - importe gravado
   - importe exento
   - importe exonerado
   - ISV 15%
   - total a pagar
   - valor en letras
   - rango autorizado
   - CAI
   - pie de factura
9. La corrección de factura debe ser un flujo separado:
   - botón “Corregir nombre del cliente”
   - botón “Reexpedir con nueva fecha”
   - modal con motivo obligatorio
   - registro visible del historial de correcciones
10. No usar estilos genéricos feos.
11. Quiero interfaz profesional tipo sistema administrativo moderno.

Requerimientos técnicos de frontend:
- Usar TypeScript estricto
- Componentes reutilizables
- hooks personalizados
- servicios API separados
- guards de autenticación
- manejo de loading y error states
- tablas limpias
- formularios con validación
- print stylesheet para factura
- buen manejo de estados vacíos

Requerimientos de seguridad:
- Hash de contraseñas con bcrypt
- JWT o sesión segura
- proteger rutas backend
- validar acceso por empresa
- sanitizar inputs
- evitar SQL injection
- no confiar en datos del frontend para montos finales
- recalcular totales en backend

Lógica de facturación:
- usar billing_settings.default_tax_rate
- total por línea = cantidad * precio_unitario - descuento_línea
- subtotal = suma de líneas
- impuesto según tasa
- total final = subtotal - descuentos + impuesto
- guardar total_in_words
- guardar snapshots fiscales y del cliente
- si la fecha actual supera issue_deadline, impedir emisión
- si no hay correlativos disponibles, impedir emisión con mensaje claro

Correcciones:
- La factura original permanece intacta
- invoice_corrections registra:
  - tipo de corrección
  - valor anterior
  - valor nuevo
  - motivo
  - usuario
  - fecha
- Para reimpresión usar la vista vw_invoice_print_projection
- No permitir cambiar detalle, montos ni correlativo mediante corrección

Entregables que quiero:
1. Proyecto backend funcional
2. Proyecto frontend funcional
3. README claro con:
   - instalación
   - variables de entorno
   - cómo correr backend
   - cómo correr frontend
   - credenciales seed si creas datos de prueba
4. Código limpio y modular
5. Comentarios útiles solo donde aporten
6. Scripts SQL opcionales solo si realmente hacen falta
7. No dejes TODOs innecesarios

Forma de trabajo:
- Primero crea la estructura del proyecto
- Luego implementa backend básico y conexión MySQL
- Luego auth y selección de empresa
- Luego clientes
- Luego facturación
- Luego correcciones
- Luego vistas frontend
- Luego impresión/PDF
- Luego README final

Quiero que tomes decisiones razonables sin estar preguntando cada paso.
Si algo es ambiguo, elige la opción más simple y mantenible para un MVP profesional.
No me entregues pseudocódigo.
Quiero archivos reales, funcionales y conectados entre sí.
