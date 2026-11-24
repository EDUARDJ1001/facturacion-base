# Validaciones vigentes

Revisión del 2026-09-30 (fase 0 del [plan de optimización](plan-optimizacion.md)).

Las reglas del backend quedan fijadas en `apps/backend/scripts/validation-test.ts`
(105 casos; corre dentro de `npm run verificar`). Las reglas que necesitan la base
(crédito, fechas de abono, existencia...) están en el flujo completo (`flow-test.ts`, 58 pasos). Si una regla cambia a propósito,
se actualiza su caso.

## 1. Dónde se valida

| Capa | Qué valida | Dónde |
|---|---|---|
| Pantallas | Formato y obligatorios antes de enviar (aviso inmediato) | esquemas zod en cada página |
| Backend: esquemas | Tipos, largos, rangos, 2 decimales, fechas, reglas entre campos | `src/modules/*/*.schemas.ts` |
| Backend: servicios | Reglas que necesitan la base: existencia, cliente/bodega activos, CAI vigente y con números, unidad por pieza, descuento ≤ importe, desactivar con relaciones | `*.service.ts`, `deactivation-rules.ts` |
| Base de datos | Únicos (códigos, números de factura), llaves foráneas, CHECK | instalación y migraciones |

El backend es la autoridad: todo lo que valida la pantalla se vuelve a validar en el backend.

## 2. Reglas principales

| Área | Reglas |
|---|---|
| Empresa | RTN de 14 dígitos (los guiones se quitan); colores `#RRGGBB`; logo hasta 800 KB, favicon y marcas hasta 300 KB; marcas solo PNG/JPG, máximo 8 |
| Usuarios | Usuario de 3 a 50 caracteres (letras, números, `.`, `_`, `-`); contraseña de 8 a 72 caracteres con letra y número; correo válido |
| Clientes y proveedores | Nombre de 2 a 180 caracteres; correo válido o vacío; RTN vacío o de 14 dígitos (13 si es DNI), se aceptan guiones y se guarda solo con dígitos |
| Productos | Precio y costo de 0 a 99.999.999 con 2 decimales; existencia mínima con 2 decimales; ISV de 0 a 100; existencia inicial solo en productos con control de existencias, con bodega y costo |
| Factura | **Fecha de emisión = hoy en Honduras** (la pone el backend; la pantalla solo la muestra); cliente del catálogo o escrito, con RTN válido si se escribe; **crédito solo a un cliente identificado, nunca a Consumidor final**; de 1 a 60 líneas; cantidad > 0, hasta 1.000.000, 2 decimales; entera si la unidad es por pieza (UND, CAJA...); descuento ≥ 0 y ≤ importe; crédito con vencimiento no anterior a hoy; fecha ≤ fecha límite del CAI; CAI vigente y con números; existencia suficiente |
| Proforma y cotización | Iguales a la factura en líneas y RTN escrito; máximo 60 líneas; validez no anterior a la fecha. Al convertirlas, la factura sale con la fecha de hoy |
| Inventario | Entrada: costo > 0, sin productos repetidos, máximo 200 líneas, fecha no futura. Ajuste: motivo de 5 caracteres o más; stock inicial con costo |
| Caja | Apertura ≥ 0; cierre con monto o denominaciones; movimientos > 0; una sola sesión abierta por caja |
| CAI (SAR) | Formato `XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX` (se pasa a mayúsculas); establecimiento y punto de 3 dígitos, tipo de 2; rango válido; correlativo dentro del rango (o fin + 1 si está agotado) |
| Cobros y pagos | Monto > 0 con 2 decimales; fecha no futura y no anterior a la factura o documento. Documento por pagar: fecha no futura, vencimiento no anterior a la fecha |
| Listas y reportes | "Desde" no puede ser mayor que "hasta" (en pantalla, la otra fecha se ajusta sola) |

## 3. Huecos corregidos (2026-09-30)

| # | Hueco | Corrección |
|---|---|---|
| 1 | Fecha de la factura libre (futura o atrasada) | El backend emite siempre con la fecha de hoy en Honduras; si se envía otra fecha, se rechaza. La pantalla muestra la fecha y ya no deja cambiarla. La conversión de proforma y cotización usaba la fecha UTC (después de las 6 p. m. salía con fecha de mañana): ahora también usa la de hoy |
| 2 | Crédito a Consumidor final | Backend y pantalla lo rechazan, escrito a mano o elegido del catálogo |
| 3 | RTN de clientes sin formato en el backend; RTN escrito en la venta sin validar | Backend: 14 o 13 dígitos o vacío en clientes, proveedores y cliente escrito en factura, proforma y cotización. Pantallas de venta: mismo aviso |
| 4 | Fechas de cobro y pago libres | No futuras (backend y tope en el calendario) y no anteriores a la factura o documento |
| 5 | Factura sin límite de líneas | Máximo 60, igual que proforma y cotización (`MAX_SALE_LINES`) |
| 6 | Precio, costo y existencia mínima sin tope | Tope 99.999.999 y 2 decimales |
| 7 | RTN de proveedores sin formato | Mismo formato que clientes, en pantalla y backend |
| 8 | Diferencias pantalla y backend | Proveedores con largos máximos y avisos por campo; cambio de contraseña exige letra y número antes de enviar; la pantalla de CAI acepta la serie agotada (fin + 1) |
| 9 | Rango de fechas invertido | Backend lo rechaza con aviso claro; en pantalla, al mover una fecha la otra se ajusta |

Clientes guardados antes con un RTN mal escrito: siguen funcionando, pero al editarlos hay
que corregir el RTN para poder guardar.
