# Butterfly Café

Dos aplicaciones conectadas mediante este repositorio:

- `apps/customer`: aplicación para clientes.
- `apps/admin`: panel privado de administración.
- `data/catalog.json`: catálogo remoto único (productos, precios, categorías, promociones e imágenes).

## Cómo se actualiza
La aplicación de clientes consulta `data/catalog.json` en GitHub y detecta cambios automáticamente. El panel administrador permite editar el catálogo y publicar los cambios en este repositorio.

Para publicar desde Admin se necesita un **Fine-grained Personal Access Token** de GitHub limitado a este repositorio y con permiso **Contents: Read and write**. El token se introduce en el panel y se mantiene solo en el navegador del administrador; nunca se guarda en el código ni en el catálogo.

## Identificadores de aplicación
- Cliente: `com.butterflycafe.app`
- Administración: `com.butterflycafe.admin`

Los proyectos incluyen configuración de Capacitor para conservar estos identificadores al preparar los paquetes Android.

## Ejecución
Abre `apps/customer/index.html` o `apps/admin/index.html` desde un servidor estático (GitHub Pages, por ejemplo). Para instalar como PWA, sirve cada carpeta por HTTPS.

> Los precios y productos iniciales son datos de demostración: deben confirmarse con la cafetería antes de publicar el menú real.
