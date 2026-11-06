# Backend de Reservas de Salas, Laboratorios de IA y Laptops

API REST en **NestJS 11 + Prisma 6 + SQL Server** (local en Docker para pruebas; Azure SQL después).
Incluye catálogo, disponibilidad, reservas con tabla de franjas (sin dobles reservas), aprobación de
entrenamientos, reasignaciones del SPOC de Edificio, No-Show y sanciones, avisos en el sistema, panel,
reportes con CSV y auditoría.

> **Qué es cada archivo y carpeta:** [docs/ESTRUCTURA.md](docs/ESTRUCTURA.md)

## Requisitos en tu PC

- Node.js 22 LTS, Git, VS Code
- Docker Desktop (en Windows con WSL 2). Solo se usa para la base de datos local.

## Arrancar con la base local (primera vez)

```bash
npm install                          # dependencias + genera el cliente de Prisma
cp .env.example .env                 # ya viene listo para la base local
npm run db:up                        # enciende SQL Server en Docker (espera ~30 s)
npm run db:migrate -- --name inicial # crea las tablas y guarda la migración en prisma/migrations
npm run db:seed                      # roles, edificios, salas, laboratorio, laptops y usuarios demo
npm run start:dev                    # API en http://localhost:3001/api/v1
```

- Swagger: http://localhost:3001/api/docs → **Authorize** → `demo-user` → escribe un correo demo.
- Peticiones listas para probar: `tools/pruebas.http` (extensión REST Client de VS Code).
- Ver las tablas y los datos: `npm run db:studio`.

## Día a día

```bash
npm run db:up        # encender la base (si apagaste la PC o Docker)
npm run start:dev    # levantar la API; se reinicia al guardar
npm run db:down      # apagar la base al terminar (los datos se conservan)
```

Si cambias `prisma/schema.prisma`: `npm run db:migrate -- --name que-cambiaste` y sube al repositorio
la carpeta nueva de `prisma/migrations`.

## Usuarios demo (AUTH_MODE=demo)

| Correo                   | Roles                                          |
| ------------------------ | ---------------------------------------------- |
| ana.asociado@demo.com    | ASOCIADO                                       |
| luis.lider@demo.com      | ASOCIADO, LIDER                                |
| sofia.spocadmin@demo.com | ASOCIADO, SPOC_ADMIN                           |
| carlos.spoc@demo.com     | ASOCIADO, SPOC_EDIFICIO (Edificio Quito Norte) |
| admin@demo.com           | ADMIN                                          |

## Comandos

| Comando                     | Para qué                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `npm run start:dev`         | Levanta la API y se reinicia al guardar                         |
| `npm test`                  | Pruebas unitarias de reglas de tiempo y franjas                 |
| `npm run build`             | Compila a `dist/`                                               |
| `npm run db:up` / `db:down` | Enciende / apaga SQL Server en Docker                           |
| `npm run db:logs`           | Ver qué está haciendo SQL Server                                |
| `npm run db:migrate`        | Crea o actualiza tablas según `schema.prisma` (solo base local) |
| `npm run db:seed`           | Datos de ejemplo (se puede repetir)                             |
| `npm run db:studio`         | Ver y editar datos en el navegador                              |
| `npm run db:reset`          | **Solo local**: borra todo, recrea tablas y corre el seed       |
| `npm run db:deploy`         | Aplica migraciones ya creadas (lo que se usa en Azure)          |

## Inicio de sesión

- `AUTH_MODE=demo` (desarrollo): cabecera `x-demo-user` o `POST /auth/demo`. **Nunca en producción**
  (la API se niega a arrancar así).
- `AUTH_MODE=google`: botón de Google en el frontend → `POST /auth/google` → la API verifica el token
  de Google, revisa que el correo sea de `ALLOWED_EMAIL_DOMAINS` y entrega su propio token (JWT).
  Nada queda alojado en Google Cloud. Detalle en `docs/frontend-login-google.md`.

## Pasar a Azure SQL (más adelante)

1. En `.env` comenta la `DATABASE_URL` local y pon la de Azure.
2. `npm run db:deploy` (aplica las migraciones de `prisma/migrations`). **Nunca** `db:migrate` ni
   `db:reset` contra Azure.
3. Si quien creó la base en Azure ya hizo las tablas a mano, coordinen antes: o se borran y se usan las
   migraciones, o se marca la migración inicial como aplicada (`npx prisma migrate resolve --applied ...`).
