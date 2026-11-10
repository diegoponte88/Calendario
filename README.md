# Mi tablón

`index.html` es la web (GitHub Pages). `worker/` es el servidor con cuentas, contraseñas y MCP (Cloudflare Workers).

## 1. Web en GitHub Pages
1. Crea un repositorio nuevo en GitHub y sube todo el contenido de esta carpeta (Add file, Upload files).
2. Settings, Pages, Source: Deploy from a branch, rama `main`, carpeta `/ (root)`.
3. Tu web quedará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## 2. Servidor en Cloudflare (gratis)
Necesitas Node.js y una cuenta de Cloudflare. En una terminal:

    npm i -g wrangler
    wrangler login
    cd worker
    wrangler kv namespace create KV      # copia el id y pégalo en wrangler.toml
    wrangler secret put INVITE           # inventa un código para poder crear cuentas
    wrangler deploy

Al terminar te da una dirección tipo `https://tablon-api.TU-SUBDOMINIO.workers.dev`.

## 3. Primer uso
Abre la web, pega la dirección del servidor, escribe usuario y contraseña y el código de invitación, y pulsa Crear cuenta.

## 4. Conectar tu IA (MCP)
En la web, botón ✦: copia la dirección MCP. En Claude: Personalizar, Conectores, Añadir conector personalizado, y pégala. Herramientas: `add_note`, `list_pending`, `complete_note`, `add_event`, `set_shift`, `list_calendar`.
Quien tenga esa dirección puede leer y escribir tus notas; «Generar otra» anula la anterior.

## Notas
- Las contraseñas se guardan con PBKDF2 y sal. Cambiarla cierra las sesiones de los demás aparatos.
- Las notas están en Cloudflare KV, que a veces tarda unos segundos en reflejar un cambio en otra ubicación.
