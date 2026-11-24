# Plan de optimización del sistema

Fecha: 2026-09-30. Basado en mediciones del código y de la base de la nube (Aiven).

## 1. Situación actual (medida)

| Qué | Dato |
|---|---|
| Código propio | ~37.800 líneas: backend 19.600 (120 archivos), pantallas 17.600 (99), agente 700 |
| Archivos más grandes | caja.service 1.382 · pantalla nueva factura 1.208 · invoices.service 1.018 · inventory-screen 977 · registro-cajas 917 · proforma nueva 917 · inventory.service 905 · types/api 889 · cotización nueva 887 · caja 817 |
| Duplicación: pantallas "nueva" factura/proforma/cotización | 85–91 % iguales entre sí (~3.000 líneas, ~1.900 repetidas) |
| Duplicación: servicios de proformas y cotizaciones | 71 % iguales; ambos comparten 50 % con facturas |
| Duplicación: formato de impresión factura vs proforma | 83 % iguales; PDF factura vs proforma 70 % |
| Base en la nube | ~90 ms por consulta (ida y vuelta). Cada consulta en serie suma 0,1 s |
| Factura de 10 líneas | **98 viajes a la base ≈ 6,2 s en la nube** (medido; ver línea base) |
| Tabla más pesada | audit_logs: 1,7 MB con 739 registros (~1,1 KB c/u: guarda el registro completo antes y después) |
| Instalador de caja | 2 ejecutables de ~95 MB cada uno (Facturacion.exe y AgenteImpresion.exe llevan cada uno su propio Node) |
| Pantallas (versión escritorio) | 3,9 MB en total; el trozo más grande 190 KB. **No es un problema.** |
| Pruebas automáticas | `npm run verificar` (fase 0): tipos, 105 validaciones, migraciones y flujo de 58 pasos en los 3 motores |

**Conclusión:** lo que el usuario nota es la **cantidad de consultas en serie contra la nube**, no el tamaño de las pantallas. Lo que más cuesta mantener es la **triple copia** de facturas, proformas y cotizaciones.

## 2. Reglas para todo el plan

1. **Sin cambios visibles de funcionamiento** salvo que sea más rápido. Cada fase se entrega sola y el sistema queda usable.
2. **Red de seguridad primero** (fase 0): nada se optimiza sin poder comprobar que sigue igual.
3. **Tres motores siempre**: MariaDB (local), SQL Server y MySQL 8.4 (Aiven). MariaDB acepta cosas que MySQL 8 rechaza (ya pasó 3 veces).
4. **Medir antes y después** (tiempo y número de consultas) en la base de la nube.
5. Sin migraciones de estructura salvo que la fase lo diga; si hacen falta, en ambos motores y regenerando las instalaciones.
6. Reglas de pantalla vigentes: sin datos técnicos, avisos propios, sin "—", campos obligatorios con `*`.

## 3. Fases

### Fase 0 — Red de seguridad y línea base (1–2 días) · riesgo bajo · **HECHA 2026-09-30**

- Comando único `npm run verificar`: tipos del backend y pantallas + `flow-test` en MariaDB, SQL Server y MySQL 8.4 (bases temporales que se crean y se borran solas).
- Contador de consultas y tiempo por operación (solo en pruebas) para: crear factura de 1 y 10 líneas, listar facturas, abrir caja, cierre de caja, entrada de inventario.
- Guardar la línea base en este documento.
- Limpieza de repositorio: `tsconfig.tsbuildinfo` fuera de git.

**Terminado cuando:** `verificar` pasa en los 3 motores y hay números de referencia.

Resultado:
- `npm run verificar` (raíz): tipos de backend, pantallas y agente; `test:validaciones` (105 casos, ver [validaciones.md](validaciones.md)); migraciones con su par en ambos motores; por cada motor de `.env.verificar` crea `tmp_verificar_<n>`, la prepara como el programa (instalación + migraciones), corre `flow-test` (58 pasos) y la borra. `-- --medir` agrega la medición; `-- --motor=mariadb` limita motores; `-- --sin-tipos` salta tsc; `-- --detalle` muestra cada paso. Unos 3 minutos con la nube.
- `.env.verificar.example` explica la configuración; `.env.verificar` queda fuera de git.
- Contador de viajes en `config/db.ts` (`observeQueries`), apagado salvo en `scripts/medir.ts`.
- `tsconfig.tsbuildinfo` fuera de git.

#### Línea base (2026-09-30)

Viajes a la base (consultas + inicio y fin de transacción) y tiempo, mediana de 3 vueltas.

| Operación | Viajes | MariaDB local | SQL Server local | MySQL 8 nube |
|---|---|---|---|---|
| Factura de 1 línea | 26 | 18 ms | 175 ms | **2.064 ms** |
| Factura de 10 líneas | 98 | 59 ms | 316 ms | **6.244 ms** |
| Proforma de 10 líneas | 40 | 24 ms | 121 ms | 1.440 ms |
| Cotización de 10 líneas | 40 | 25 ms | 132 ms | 1.433 ms |
| Entrada de inventario de 10 líneas | 76 | 37 ms | 100 ms | **7.383 ms** |
| Detalle de factura | 3 | 4 ms | 3 ms | 163 ms |
| Lista de facturas | 2 | 4 ms | 5 ms | 135 ms |
| Lista de productos | 3 | 3 ms | 6 ms | 193 ms |
| Existencias | 3 | 3 ms | 12 ms | 196 ms |
| Caja (resumen) | 6 | 4 ms | 45 ms | 395 ms |
| Reporte de ventas | 5 | 5 ms | 9 ms | 329 ms |
| Cierre de caja | 7 | 9 ms | 31 ms | 513 ms |

Lectura: en la nube cada viaje cuesta ~65–95 ms; el tiempo depende casi solo del número
de viajes. Factura y entrada crecen ~8 viajes por línea. Listas y pantallas ya están bien.

### Fase 1 — Velocidad en la nube (3–5 días) · riesgo medio · **mayor impacto para el usuario**

Menos viajes a la base en las operaciones frecuentes:

| Operación | Hoy | Cambio | Meta |
|---|---|---|---|
| Factura | 26 viajes + ~8 por línea (98 con 10 líneas, 6,2 s) | Traer todos los productos y códigos en 1 consulta; insertar todas las líneas en 1 sentencia; movimientos y existencias en lote | Factura de 10 líneas ≤ 25 viajes y < 2 s en la nube |
| Entrada de inventario | 76 viajes con 10 líneas (7,4 s) | Mismo tratamiento en lote | ≤ 20 viajes y < 2 s |
| Proforma y cotización | 40 viajes con 10 líneas (1,4 s) | Productos en 1 consulta, líneas en 1 sentencia | ≤ 12 viajes |
| Listados con paginación | conteo + página por separado | una sola consulta (conteo con función de ventana; los 3 motores la soportan) | −1 viaje por listado |
| Auditoría | registro completo antes/después | guardar solo los campos que cambiaron | −70 % de espacio, escritura más rápida |
| Arranque de pantallas | varias consultas pequeñas por separado | agrupar las que se piden juntas (resumen de caja, catálogos) | pantallas principales < 1 s |

**Terminado cuando:** metas cumplidas, `verificar` en verde, totales de facturas idénticos antes y después.

### Fase 2 — Documentos de venta unificados en el backend (4–6 días) · riesgo medio

- Módulo común para factura, proforma y cotización: cálculo de líneas e ISV, datos del cliente (incluido Consumidor final), validaciones, lectura de productos, guardado de líneas.
- Cada tipo conserva solo lo propio (CAI y numeración fiscal en factura; estados y conversión en proforma/cotización).
- Base común para formato de impresión y PDF (hoy 83 % y 70 % iguales).

**Ahorro estimado:** ~1.200 líneas. **Beneficio:** un arreglo se hace una vez, no tres (como pasó con Consumidor final).

### Fase 3 — Pantallas unificadas y archivos grandes divididos (4–6 días) · riesgo medio

- Un solo editor de documento de venta usado por las 3 pantallas "nueva" (−~1.900 líneas).
- Partes comunes de detalle y listado de los 3 documentos.
- Dividir en componentes: caja (817), registro de cajas (917), inventario (977), formulario de producto (769), configuración (562).

**Terminado cuando:** las 3 pantallas funcionan igual (revisión manual con lista de comprobación + `verificar`).

### Fase 4 — Tipos compartidos backend ↔ pantallas (2–3 días) · riesgo bajo

- Paquete compartido con tipos y validaciones (zod) que hoy están copiados a mano (`types/api.ts`, 889 líneas, + esquemas del backend).
- Un cambio de campo se detecta al compilar en ambos lados.

### Fase 5 — Base de datos (2–3 días) · riesgo bajo–medio

- Revisar con EXPLAIN las 10 consultas más usadas en los 3 motores y ajustar índices (migración si hace falta).
- Política para la auditoría: consulta por fechas y, opcionalmente, archivo de registros antiguos.
- Revisar búsquedas con texto parcial (`LIKE '%x%'`) solo si crecen los datos; hoy no son problema.

### Fase 6 — Empaquetado y limpieza (2–3 días) · riesgo bajo

- Agente de impresión dentro de `Facturacion.exe`: un solo ejecutable (≈ −95 MB instalados, un proceso menos, instalador más pequeño).
- Quitar código sin uso (herramienta de detección de exportaciones y archivos no usados).
- Revisar scripts de prueba grandes (`seed-test-data.ts`, 1.352 líneas).

## 4. Orden recomendado y esfuerzo

| Orden | Fase | Días | Impacto |
|---|---|---|---|
| 1 | 0 Red de seguridad | 1–2 | Habilita todo lo demás |
| 2 | 1 Velocidad en la nube | 3–5 | El usuario lo nota de inmediato |
| 3 | 2 Documentos de venta (backend) | 4–6 | Mantenimiento |
| 4 | 3 Pantallas unificadas | 4–6 | Mantenimiento |
| 5 | 4 Tipos compartidos | 2–3 | Menos errores |
| 6 | 6 Empaquetado | 2–3 | Instalación más liviana |
| 7 | 5 Base de datos | 2–3 | Preparación para crecer |

Total estimado: **18–28 días de trabajo**, entregable por fases. Reducción esperada: ~3.500 líneas (~9 %) y ventas 2–3 veces más rápidas en la nube.

## 5. Riesgos

| Riesgo | Cómo se controla |
|---|---|
| Cambiar cálculos de ISV o totales | Fase 0 compara totales antes/después; los cálculos se mueven sin reescribirse |
| Diferencias entre motores | `verificar` corre en los 3 siempre |
| Numeración fiscal (CAI) | No se toca la lógica de correlativos; solo se reubica |
| Cajas con versiones distintas | Cada fase sale en un instalador nuevo; el bloqueo por versión ya existe |
