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
- Eventos actuales, próximos y anteriores con imágenes y vídeo.
- Información del negocio, horarios, dirección, Google Maps y WhatsApp.
- Centro de notificaciones dentro de la aplicación y aviso al detectar cambios del catálogo.

### BC Admin
- Gestión de productos, fotografías, precios, ingredientes, disponibilidad y destacados.
- Crear, editar y organizar categorías por sección.
- Administrar promociones, novedades, eventos y avisos para clientes.
- Configurar información del local, horarios y cierres extraordinarios.
- Panel de métricas del catálogo (no son estadísticas de ventas).
- Vista previa navegable del borrador de cliente antes de publicar.
- Publicación con confirmación al repositorio.

> Los avisos publicados desde BC Admin aparecen en el centro de notificaciones cuando la aplicación cliente sincroniza el catálogo. Las notificaciones push en segundo plano requieren configurar un proveedor push y credenciales adicionales; no están activadas.

## Cómo se actualiza

La aplicación de clientes consulta `data/catalog.json` periódicamente y también al regresar a primer plano. BC Admin permite modificar el catálogo y publicar los cambios en este repositorio.

Para publicar desde Admin se necesita un **Fine-grained Personal Access Token** limitado a este repositorio y con permiso **Contents: Read and write**. En la versión Android, el token se guarda mediante el plugin nativo de almacenamiento seguro; en navegador web se mantiene en la sesión de administración. Nunca se escribe en el catálogo ni se incluye en el código fuente.

## Identificadores de aplicación

- Cliente: `com.butterflycafe.app`
- Administración: `com.butterflycafe.admin`

Los proyectos utilizan Capacitor para conservar estos identificadores al preparar los paquetes Android.

## Ejecución web

Abre `apps/customer/index.html` o `apps/admin/index.html` desde un servidor estático HTTPS para probar las interfaces.

Para publicar ambas carpetas con GitHub Pages, entra en **Settings → Pages** del repositorio y selecciona **GitHub Actions** como fuente de despliegue. Si Pages todavía no está habilitado, el workflow conserva igualmente un artefacto descargable llamado `butterfly-cafe-web-apps`.

## Datos iniciales

Los precios y productos iniciales son datos de demostración y deben confirmarse con la cafetería antes de publicar el menú real. No se deben interpretar las cifras de precio de prueba como precios aprobados.
