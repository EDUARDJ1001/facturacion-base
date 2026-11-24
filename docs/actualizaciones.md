# Actualizaciones de las cajas sin instalador

Desde la versión 1.0.2, cada caja se actualiza desde el sistema: **Sistema > Actualizaciones**.
Actualizar es opcional y lo hace un administrador (ADMIN o SUPERADMIN) en cada caja,
cuando le convenga.

## 1. Cómo funciona

```
C:\Facturacion\
  Facturacion.exe        lanzador: solo trae Node; abre la versión en uso
  config.env             conexión a la base (no cambia al actualizar)
  versiones\
    actual.txt           versión en uso
    1.0.2\               programa, pantallas, migraciones (firmados)
    1.0.3\               ...
  agente\                agente de impresión
```

1. Publicas una versión nueva en internet (un `manifest.json` y un paquete de unos 4 MB).
2. Cada caja revisa al iniciar y cada 6 horas. Si hay versión nueva:
   - los administradores ven un aviso con "Ver novedades";
   - en Sistema > Actualizaciones aparecen las novedades y el botón **Actualizar**.
3. Al actualizar: se descarga, se comprueba la firma y cada archivo, se instala en
   `versiones\<versión>` y el sistema se reinicia en unos segundos. Las pantallas se recargan solas.
4. Si la versión nueva no arranca, la caja vuelve sola a la anterior.
5. Si arranca bien, las versiones anteriores se borran: **no se puede volver a una versión
   anterior**. Facturacion.exe tampoco abre versiones más
   viejas que la de su instalador.

**Versiones con cambios en la base de datos:** la primera caja que actualiza aplica los
cambios. Las demás quedan bloqueadas (su programa es más viejo que la base) y ven el aviso
"Esta caja necesita actualizarse" con el botón **Actualizar ahora**, que funciona sin iniciar sesión.

**Seguridad:** cada versión va firmada con una clave que solo existe en la PC que publica.
Las cajas rechazan paquetes sin firma válida o alterados, y Facturacion.exe vuelve a comprobar
todos los archivos cada vez que abre el programa.

**Lo que NO se actualiza así** (necesita el instalador): `Facturacion.exe` (el lanzador) y
el agente de impresión. Si una versión necesita un lanzador nuevo, la pantalla lo indica.

## 2. Preparación (una sola vez)

1. **Clave de firma** (ya creada el 2026-09-30):
   `C:\Users\<usuario>\.facturacion\clave-actualizaciones.pem`, cifrada con una contraseña tipo
   tarjeta (número de 16 caracteres + vencimiento MM/AA) que se pide al generar el instalador o
   publicar una versión. Cambiarla (también vencida, o para pasar una clave anterior a este
   formato): `npm run clave:actualizaciones -- --cambiar`. La clave no cambia:
   las cajas no notan nada.
   **Guarda una copia del archivo (USB) y el número con su vencimiento en tu gestor de contraseñas.** Si se pierde cualquiera de las
   dos, no se pueden publicar versiones y hay que crear otra clave (`npm run clave:actualizaciones`,
   con el archivo borrado) y reinstalar todas las cajas. Nunca la subas al repositorio ni la compartas.
2. **Repositorio público de versiones** en GitHub: `<usuario>/<repositorio-de-versiones>`, público y vacío.
   Solo guarda los paquetes publicados (no el código fuente). Configura la dirección en
   `package.json` (`facturacion.updatesUrl`), por ejemplo:
   `https://github.com/<usuario>/<repositorio-de-versiones>/releases/latest/download/manifest.json`
3. **Instalar InstalarCaja-1.0.2 en cada caja** (la última vez con instalador).

Para usar otra dirección en una caja: `UPDATES_URL=...` en su `config.env`.

## 3. Publicar una versión

1. Sube `version` en el `package.json` de la raíz (por ejemplo 1.0.3).
2. `npm run verificar` (todo debe pasar).
3. Genera el paquete:
   ```
   npm run publicar:version -- --notas "Qué cambió en esta versión"
   ```
   Queda en `instaladores/actualizaciones/<versión>/`: `manifest.json` y `facturacion-<versión>.paquete`.
4. En GitHub, repositorio `facturacion-versiones` > **Releases** > **Draft a new release**:
   - Tag: `v1.0.3` (crear el tag nuevo).
   - Adjunta los dos archivos.
   - **Publish release** (queda como "Latest").
5. Las cajas la ven en las próximas horas, o al pulsar **Buscar actualizaciones**.

Las novedades (`--notas`) se muestran tal cual en las cajas: escríbelas para el usuario
(sin términos técnicos). Para varias líneas, usa saltos de línea dentro de las comillas.

## 4. Archivos del código

| Archivo | Qué hace |
|---|---|
| `apps/backend/src/launcher.ts` | Facturacion.exe: comprueba y abre la versión; cambio de versión con vuelta automática |
| `apps/backend/src/updates/version-files.ts` | Firma, comprobación y paquete de versiones |
| `apps/backend/src/modules/system/updates.service.ts` | Revisar, descargar e instalar versiones nuevas |
| `apps/backend/src/modules/system/updates.routes.ts` | `/api/system/updates` (administradores) y `/required` (caja bloqueada, sin sesión, solo desde la misma PC) |
| `apps/backend/scripts/build-exe.ts` | Carpeta para el instalador (lanzador + versión firmada) |
| `apps/backend/scripts/publicar-version.ts` | Paquete y manifiesto para publicar |
| `apps/frontend/src/app/(protected)/actualizaciones/page.tsx` | Pantalla Sistema > Actualizaciones |
| `apps/frontend/src/components/layout/connection-monitor.tsx` | Avisos de versión nueva y de caja desactualizada |
