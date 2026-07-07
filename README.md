# Caudal

App de finanzas personales construida con Next.js, PostgreSQL (Docker) y Prisma.

## Requisitos

- Node.js 20+
- Docker Desktop

## Configuración inicial

1. Crea el archivo `.env` en la raíz (está en `.gitignore`):

```env
DATABASE_URL="postgresql://caudal:caudal_dev_2026@localhost:5435/caudal?schema=public"
AUTH_SECRET="cambia-este-secreto"
```

2. Levanta la base de datos, aplica migraciones y el seed:

```bash
npm install
npm run db:up        # inicia PostgreSQL en Docker (puerto 5435)
npm run db:migrate   # aplica migraciones de Prisma
npm run db:seed      # crea las categorías de sistema
```

3. Inicia la app:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), regístrate y empieza a usarla.

## Scripts útiles

| Script | Descripción |
|---|---|
| `npm run db:up` | Inicia el contenedor de PostgreSQL |
| `npm run db:migrate` | Aplica migraciones (`prisma migrate dev`) |
| `npm run db:seed` | Inserta categorías de sistema |
| `npm run db:studio` | Abre Prisma Studio para inspeccionar datos |

## Arquitectura

- **Base de datos**: PostgreSQL 16 en Docker (`docker-compose.yml`), datos persistidos en el volumen `caudal_pgdata`.
- **ORM**: Prisma (`prisma/schema.prisma`).
- **Autenticación**: propia, con bcrypt + JWT en cookie httpOnly (`app/api/auth/*`).
- **Capa de datos**: las páginas usan el cliente de `app/lib/supabase.ts`, que conserva la interfaz de supabase-js pero llama al endpoint `app/api/db/route.ts`, el cual ejecuta las consultas con Prisma y aísla los datos por usuario.
