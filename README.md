# Refrigeración 360

Aplicación de gestión de servicios con API propia desplegable en Vercel y PostgreSQL compartido.

## Stack
- React + Vite
- Vercel Functions en `/api`
- PostgreSQL mediante `DATABASE_URL`
- Sesiones JWT en cookie HttpOnly y contraseñas con bcrypt

## Configuración para Vercel
1. Importa este repositorio en Vercel.
2. Añade una base PostgreSQL compatible y copia su cadena de conexión en `DATABASE_URL`.
3. Define `JWT_SECRET` con una cadena aleatoria de al menos 32 caracteres.
4. Ejecuta el contenido de `database/schema.sql` una sola vez en la base PostgreSQL.
5. Despliega el proyecto.

## Primer acceso
En la pantalla de acceso selecciona "Primera vez: crear empresa". La primera cuenta crea la empresa y recibe el rol propietario. Luego el propietario puede crear administradores, trabajadores y clientes.

## Variables obligatorias
- `DATABASE_URL`: conexión PostgreSQL con SSL.
- `JWT_SECRET`: secreto aleatorio privado, solo en variables de entorno de Vercel.

No uses claves privadas en variables `VITE_*` ni las subas al repositorio.

## Estado
La API inicial incluye creación de propietario, inicio/cierre de sesión, consulta y creación de usuarios, órdenes y cambios de estado. Los módulos avanzados (edición de perfil/contraseña, asignación automática, inventario, finanzas completas y eventos push en tiempo real) quedan para las siguientes iteraciones.
