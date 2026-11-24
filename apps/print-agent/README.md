# Agente local de impresión

Programa pequeño que corre en **cada PC de caja**. Lee las impresoras instaladas en Windows de ese equipo (USB, red/IP, compartidas, serial con driver) e imprime sin diálogo los tickets y documentos carta que le envía el navegador del sistema.

- Escucha solo en `http://127.0.0.1:17777` (no es accesible desde otras PCs).
- Acepta peticiones de `localhost` y de la LAN privada (`192.168.x.x`, `10.x.x.x`). Para un sistema publicado en internet, agrega su origen en `allowedOrigins` del archivo de configuración o en `PRINT_AGENT_ALLOWED_ORIGINS`.
- La asignación de impresoras (tickets / carta) se guarda en `%APPDATA%\FacturacionPrintAgent\config.json`, no en el navegador.
- Imprime PDF con SumatraPDF (incluido en `pdf-to-printer`): tickets a tamaño real (80 mm), carta ajustada a la página.

## Instalar en una PC

Requisito: Node.js 18+.

```bash
npm install
npm run install:print-agent
```

Lo copia a `%LOCALAPPDATA%\FacturacionPrintAgent\app`, lo deja iniciando oculto con Windows y lo arranca. Después, en el sistema: **Caja → Impresoras** (o **Registro de cajas → Este equipo**) y elige la impresora de tickets y la de carta.

Desinstalar: `powershell -ExecutionPolicy Bypass -File scripts/install-print-agent.ps1 -Uninstall`

## Desarrollo

```bash
npm run dev:print-agent
```

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/status` | Versión, nombre del equipo e impresoras asignadas |
| GET | `/printers` | Impresoras instaladas en Windows |
| PUT | `/config` | `{ ticketPrinter, letterPrinter }` (nombre o `null`) |
| POST | `/print?kind=ticket\|letter[&printer=Nombre]` | Cuerpo: el PDF (`application/pdf`) |
