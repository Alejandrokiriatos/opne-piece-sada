# Butterfly Café

Repositorio de las dos aplicaciones Android y el backend:

- `apps/customer`: Butterfly Café para clientes.
- `apps/admin`: BC Admin para administración.
- `data/catalog.json`: catálogo remoto compartido.
- `backend/cloudflare-worker`: API de notificaciones y servicios heredados.
- `backend/cloudflare-worker/migrations`: esquema SQLite para Cloudflare D1.

## Butterfly Café — clientes

- Inicio con favoritos, más pedidos, promociones y novedades.
- Secciones de Café y Dulces con buscador y filtros.
- Fichas de producto con fotografía, ingredientes, precio y disponibilidad.
- Eventos actuales, futuros y anteriores con fotografías y vídeos.
- Información del negocio, horarios, dirección, Google Maps y WhatsApp.
- Centro de avisos dentro de la aplicación, con actualizaciones automáticas de productos y horarios.
- Pantalla de ajustes para preferencias de avisos y comprobación manual de actualizaciones.
- Promociones interactivas con ficha ampliada, fotografía, descripción y vigencia.
- La APK funciona como catálogo informativo: no ofrece carrito, pedidos ni pagos.

## BC Admin — administración

- Gestión de productos, categorías, fotografías, ingredientes, disponibilidad y destacados.
- Gestión de promociones, novedades, eventos, galerías y avisos.
- Subida y compresión de fotografías antes de guardarlas en el repositorio.
- Panel de resumen del contenido, vista previa y registro de publicaciones.
- Protección contra publicaciones concurrentes mediante el SHA del catálogo.
- Generación automática de avisos al publicar cambios en productos o horarios.
- Configuración de la API y envío de notificaciones.

## Backend — Cloudflare Workers + D1

La API se encuentra en `backend/cloudflare-worker`.

Rutas principales:

| Ruta | Uso | Protección |
|---|---|---|
| `GET /health` | Estado del servicio | Pública |
| `GET /api/push/config` | Clave pública y capacidades push | Pública |
| `POST /api/orders` | Ruta heredada, no utilizada por las APK informativas | Pública, validación de catálogo, límite de solicitudes e idempotencia |
| `POST /api/push/web/subscribe` | Registrar suscripción Web Push | Pública para clientes; requiere token si el destino es Admin |
| `POST /api/push/native/register` | Registrar token de Android | Pública para clientes; requiere token si el destino es Admin |
| Rutas `/api/admin/orders` y `/api/admin/stats` | Compatibilidad con datos anteriores; ya no aparecen en BC Admin | Token administrativo |
| `POST /api/admin/push/send` | Enviar notificación | Token administrativo |

### Pedidos y ventas

La interfaz actual de Butterfly Café es exclusivamente informativa. Los módulos de pedidos y ventas se retiraron de las APK; las rutas y tablas antiguas del Worker se conservan temporalmente por compatibilidad, pero la aplicación cliente no crea pedidos ni pagos.

### Controles de seguridad

- Los precios y la disponibilidad se comprueban en el servidor contra `data/catalog.json`; el total enviado por el cliente no se acepta como fuente de verdad.
- Los pedidos utilizan claves de idempotencia para impedir duplicados por reintentos.
- Las rutas administrativas requieren un token privado.
- Los tokens de los administradores se cifran con Android Keystore dentro de la APK. En navegador web se guardan solamente en la sesión.
- Las claves VAPID privadas y la cuenta de servicio de Firebase se guardan como secretos del Worker, nunca dentro del catálogo ni en los APK.
- Las solicitudes públicas tienen límites por IP; los registros antiguos de límite se purgan mediante el evento programado del Worker.
- Las notificaciones de pedido al personal no incluyen el teléfono ni las notas privadas del cliente.

## Desplegar el backend en Cloudflare

La primera configuración necesita una cuenta Cloudflare y una base de datos D1:

1. Crea una base de datos D1 llamada `butterfly-cafe-db` y copia su ID.
2. En GitHub → Settings → Secrets and variables → Actions, configura estos secretos:
   - `CLOUDFLARE_API_TOKEN` — permiso para desplegar Workers y administrar D1.
   - `CLOUDFLARE_ACCOUNT_ID`.
   - `CLOUDFLARE_D1_DATABASE_ID`.
   - `BUTTERFLY_ADMIN_API_TOKEN` — genera una cadena aleatoria de al menos 32 caracteres.
3. Ejecuta manualmente el workflow **Deploy Butterfly Café API (Cloudflare Workers + D1)** desde Actions. También se ejecuta cuando cambian los archivos del backend en `main`.
4. El workflow aplica las migraciones D1, configura los secretos del Worker y despliega la API. El resumen del workflow muestra la URL `workers.dev`.
5. Abre BC Admin → Push. Pega la URL HTTPS del Worker y el mismo token administrativo. Pulsa **Guardar conexión segura** y después **Publicar todos los cambios** para que la URL se incluya en el catálogo que descarga Butterfly Café.

No compartas el token administrativo. La URL de la API puede ser pública; el token no.

## Notificaciones push

### Web Push

Para que funcionen los avisos web, configura en GitHub Actions:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (por ejemplo, un `mailto:` de contacto)

La clave privada solo se almacena como secreto de Cloudflare Worker. El cliente pide permiso, registra su suscripción y el Worker envía las notificaciones.

### Android / Firebase Cloud Messaging

Para habilitar FCM en los APK:

1. Crea o utiliza un proyecto de Firebase y registra dos aplicaciones Android con estos identificadores exactos:
   - `com.butterflycafe.app`
   - `com.butterflycafe.admin`
2. Descarga el `google-services.json` de cada aplicación.
3. Convierte cada archivo a Base64 y añade estos secretos de GitHub:
   - `FIREBASE_CUSTOMER_GOOGLE_SERVICES_JSON_BASE64`
   - `FIREBASE_ADMIN_GOOGLE_SERVICES_JSON_BASE64`
4. Añade `FCM_SERVICE_ACCOUNT_JSON` como secreto del Worker, con el JSON de la cuenta de servicio Firebase que tenga permiso para enviar mensajes.
5. Vuelve a compilar las aplicaciones. El workflow valida el package ID del archivo Firebase y solo activa FCM en la APK que tiene su configuración.

La app conserva una activación explícita de avisos. Después de instalar una APK configurada con Firebase, abre BC Admin → Push y registra el teléfono administrativo. Los clientes pueden activar los avisos push desde Notificaciones o Ajustes. Los avisos generados automáticamente por cambios de catálogo se muestran dentro de la aplicación en cuanto se descarga la versión publicada.

Sin estos archivos y secretos reales, la interfaz y el código quedan preparados, pero no se puede enviar una notificación push real. Nunca se suben los JSON de Firebase ni las claves privadas al repositorio.

## Ejecutar pruebas

- API: el workflow **Butterfly Café API tests** instala dependencias, comprueba sintaxis y ejecuta pruebas de salud, CORS, autenticación y validación de pedidos.
- Interfaz: el workflow **Capturas reales de Butterfly Cafe** usa Playwright para comprobar cliente, carrito, BC Admin, vista previa, formularios, historial, gestión de pedidos, ventas y notificaciones simuladas.
- Android: **Build and release Butterfly Café Android apps** compila ambos APK. En los Pull Requests sube los APK como artefactos de prueba; al fusionar a `main` publica una release conjunta.

## Datos comerciales que deben revisarse

Los datos actuales del catálogo todavía contienen información de demostración. En concreto, el Cappuccino tiene un precio de `500000` USD. No se ha cambiado automáticamente. Antes de aceptar pedidos reales, corrige ese precio y confirma los precios, imágenes, ingredientes, horarios, teléfonos y demás datos comerciales desde BC Admin.

## Identificadores de aplicación

- Cliente: `com.butterflycafe.app`
- Administración: `com.butterflycafe.admin`

Las aplicaciones usan Capacitor 7 y conservan sus identificadores entre compilaciones.
