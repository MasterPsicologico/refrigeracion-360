# Refrigeración 360

Aplicación web de gestión de servicios de refrigeración.

## Despliegue en GitHub Pages

El flujo de GitHub Actions publica automáticamente la aplicación cuando hay cambios en `main`.

## Configuración de Supabase

En **Settings → Secrets and variables → Actions → Variables**, configura estas variables de repositorio:

- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_ANON_KEY`: clave pública (publishable/anon) de Supabase.

Después de guardar o cambiar estas variables, ejecuta de nuevo el flujo **Deploy Refrigeracion 360 to GitHub Pages** para que la compilación incorpore la configuración. No coloques claves `service_role` ni claves secretas en variables expuestas al navegador.
