# Butterfly Café

Dos aplicaciones Android conectadas mediante este repositorio:

- `apps/customer`: aplicación para clientes.
- `apps/admin`: panel privado BC Admin.
- `data/catalog.json`: catálogo remoto compartido (productos, categorías, promociones, novedades, eventos, avisos e información del establecimiento).

## Funciones principales

### Butterfly Café
- Inicio con favoritos, más pedidos, promociones y novedades.
- Secciones independientes de Café y Dulces, con buscador y filtros.
- Fichas de productos con descripción, ingredientes, precio, fotografía y disponibilidad.
- Eventos actuales, próximos y anteriores con galerías de imágenes y vídeos.
- Información del negocio, horarios, dirección, Google Maps y WhatsApp.
- Centro de notificaciones dentro de la aplicación y avisos al sincronizar el catálogo.
- Registro de un service worker para preparar recepción de notificaciones web push.

### BC Admin
- Gestión de productos, fotografías, precios, ingredientes, disponibilidad y destacados.
- Crear, editar y organizar categorías por sección.
- Administrar promociones, novedades, eventos, galerías y avisos a clientes.
- Subida directa de fotografías para productos, promociones, novedades y eventos. Las imágenes se comprimen en el dispositivo a JPEG antes de subirlas al repositorio.
- Panel de métricas del catálogo (no son estadísticas de ventas).
- Vista previa navegable del borrador de cliente antes de publicar.
- Historial de publicaciones con versión, fecha y resumen de cambios.
- Control de concurrencia: compara el SHA del catálogo que se cargó con el SHA remoto antes de publicar y utiliza la revisión original en la escritura. Si otro administrador publica primero, la escritura se bloquea en lugar de sobrescribir el catálogo.

## Publicación segura y control de conflictos

BC Admin guarda el SHA de `data/catalog.json` que recibió al conectar. Antes de publicar vuelve a consultar ese archivo. Si el SHA cambió, conserva el borrador local y detiene la publicación. Además, el PUT final utiliza el SHA cargado originalmente, de modo que GitHub también rechaza una carrera que ocurra durante las cargas multimedia.

Las fotografías se suben primero a `apps/customer/assets/media/` con nombres únicos y después se publica el catálogo que las referencia. Si una publicación concurrente se bloquea mientras los medios ya se subieron, pueden quedar archivos multimedia sin referencia en el catálogo; no sustituyen datos de otros administradores.

Las últimas 40 publicaciones se guardan en `publicationHistory` dentro del catálogo compartido.

## Preparación de notificaciones push

BC Admin permite guardar:
- Clave pública VAPID.
- Endpoint HTTPS que recibe y registra suscripciones web push.

Butterfly Café registra `apps/customer/service-worker.js`, solicita permiso y envía la suscripción al endpoint configurado. El service worker contiene los manejadores `push` y `notificationclick`.

**La entrega push real todavía necesita un servidor de suscripciones/envío** que almacene las suscripciones y firme mensajes con la clave privada VAPID. La clave privada nunca debe subirse a este repositorio. El endpoint debe aceptar el JSON de suscripción y devolver una respuesta HTTP exitosa. La configuración web push tampoco equivale a notificaciones nativas en la APK: Android requiere integrar un proveedor como Firebase Cloud Messaging y provisionar sus credenciales por separado.

Los avisos de catálogo existentes siguen funcionando aunque no se configure push.

## Cómo se actualiza

La aplicación de clientes consulta `data/catalog.json` periódicamente y también al regresar a primer plano. BC Admin permite modificar el catálogo y publicar los cambios en este repositorio.

Para publicar desde Admin se necesita un **Fine-grained Personal Access Token** limitado a este repositorio y con permiso **Contents: Read and write**. En la versión Android, el token se guarda mediante el plugin nativo de almacenamiento seguro; en navegador web se mantiene en la sesión de administración. Nunca se escribe en el catálogo ni se incluye en el código fuente.

## Identificadores de aplicación

- Cliente: `com.butterflycafe.app`
- Administración: `com.butterflycafe.admin`

Los proyectos utilizan Capacitor para conservar estos identificadores al preparar los paquetes Android.

## Ejecución web

Abre `apps/customer/index.html` o `apps/admin/index.html` desde un servidor estático HTTPS para probar las interfaces. El service worker requiere un contexto seguro (HTTPS o localhost).

Para publicar ambas carpetas con GitHub Pages, entra en **Settings → Pages** del repositorio y selecciona **GitHub Actions** como fuente de despliegue. Si Pages todavía no está habilitado, el workflow conserva igualmente un artefacto descargable llamado `butterfly-cafe-web-apps`.

## Datos iniciales

Los precios y productos iniciales son datos de demostración y deben confirmarse con la cafetería antes de publicar el menú real. No se deben interpretar las cifras de precio de prueba como precios aprobados.
