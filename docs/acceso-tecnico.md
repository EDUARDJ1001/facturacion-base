# Acceso de técnico

Acceso escondido a la conexión de la base de datos de una caja, para quien administra
el sistema. Funciona aunque la base responda y sin iniciar sesión.

## Cómo se usa

1. En la caja, en cualquier pantalla (también en el inicio de sesión): **Ctrl + Shift + F9**.
2. Escribe la clave de técnico y pulsa **Entrar**.
3. Se abre "Conexión a la base de datos" con los datos actuales (sin la contraseña: vacía = conservar).
   Prueba y guarda. El acceso vence a los 15 minutos.

No aparece en ningún menú. Solo funciona en la misma PC (no por la red). Cinco claves
incorrectas seguidas lo bloquean 15 minutos. Cada uso queda en el registro del sistema
(`facturacion.log`).

## Crear o cambiar la clave (en tu PC)

```
npm run tecnico:clave --workspace backend
```

Pide la clave dos veces sin mostrarla (mínimo 10 caracteres) y guarda **solo su huella** en
`C:\Users\<usuario>\.facturacion\clave-tecnico.txt`, fuera del repositorio. La clave no se guarda
en ningún lado: si la olvidas, crea otra.

La huella entra en el programa al compilar. Después de crearla o cambiarla:
- genera el instalador (`npm run build:instaladores`), o
- publica una versión (`npm run publicar:version -- --notas "..."`), y las cajas la reciben al actualizar.

Como la versión va firmada, nadie puede cambiar la huella en una caja. Si el programa se compiló
sin huella, el acceso no existe.

## Archivos

| Archivo | Qué hace |
|---|---|
| `apps/backend/src/modules/system/technician.ts` | Comprueba la clave (scrypt), límite de intentos, permiso de 15 minutos |
| `apps/backend/src/modules/system/setup.routes.ts` | `POST /api/setup/tecnico` y el permiso en `/api/setup/*` (encabezado `x-tecnico`) |
| `apps/backend/scripts/clave-tecnico.ts` | Crea la huella de la clave |
| `apps/frontend/src/components/layout/technician-access.tsx` | Atajo Ctrl + Shift + F9 y ventana de la clave |
| `apps/frontend/src/app/configuracion-inicial/page.tsx` | Pantalla de conexión (inicial, recuperación y técnico) |
