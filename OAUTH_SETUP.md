# OAuth Setup KLAUS

KLAUS ya puede iniciar el flujo OAuth desde la web y guardar la sesion cifrada dentro del ESP.

## Que hace falta para habilitar el boton `Conectar cuenta`

Cada proveedor necesita su propia app OAuth:

- `Google`
  - Necesitas `Client ID`
  - Necesitas `Client Secret`
  - KLAUS usa `Authorization Code` en popup
  - Debes registrar el callback:
    - `https://detector-esp.onrender.com/api/oauth/callback/google`
  - Si haces pruebas en local, el callback debe coincidir exactamente con tu URL local

- `GitHub`
  - Necesitas `Client ID`
  - KLAUS usa `device flow`

- `Microsoft`
  - Necesitas `Client ID`
  - KLAUS usa `device code flow`

- `Spotify`
  - Necesitas `Client ID`
  - KLAUS usa `Authorization Code + PKCE`
  - Debes registrar el callback:
    - `https://detector-esp.onrender.com/api/oauth/callback/spotify`

## Donde se pegan esas credenciales

Ahora puedes cargarlas desde la propia web en el panel:

- `OAuth Setup`

La app las guarda localmente en:

- `data/oauth-providers.json`

Si tambien defines variables de entorno, esas tienen prioridad.

## Flujo final

1. Inicias sesion en la web
2. Configuras el proveedor OAuth
3. Conectas el ESP por USB
4. Desbloqueas el vault
5. Guardas una cuenta en el ESP
6. Pulsas `Conectar cuenta`
7. KLAUS completa OAuth y guarda la sesion cifrada en el ESP
