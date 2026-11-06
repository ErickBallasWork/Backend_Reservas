# Backend de Reservas de Salas, Laboratorios de IA y Laptops

API REST en **NestJS 11 + Prisma 6 + SQL Server** (local en Docker, Azure SQL en producción).
Incluye catálogo, disponibilidad, reservas con tabla de franjas (sin dobles reservas), aprobación de
entrenamientos, reasignaciones del SPOC de Edificio, No-Show y sanciones, avisos en el sistema, panel,
reportes con CSV y auditoría.

> **Qué es cada archivo y carpeta:** [docs/ESTRUCTURA.md](docs/ESTRUCTURA.md)

## Requisitos

- Node.js 22 LTS (`.nvmrc`). Con nvm: `nvm use`. Otra versión de npm puede desincronizar el `package-lock.json`.
- Git y Docker Desktop. Docker solo se usa para la base de datos local.

## Primer arranque

La base local se levanta desde el workspace (`reservation_system/`) con `docker compose up -d`. Este repo
no trae compose.

```bash
npm ci                    # dependencias, cliente de Prisma y hooks de git
cp .env.example .env      # completa JWT_SECRET (ver tabla de variables)
npm run db:deploy         # aplica las migraciones
npm run db:seed           # roles + administrador inicial (INITIAL_ADMIN_EMAIL)
npm run db:seed:demo      # datos demo: edificios, salas, laboratorio, laptops y usuarios
npm run start:dev         # API en http://localhost:3001/api/v1
```

- Swagger: http://localhost:3001/api/docs → **Authorize** → `demo-user` → escribe un correo demo.
- Peticiones listas para probar: `tools/pruebas.http` (extensión REST Client de VS Code).
- Ver las tablas y los datos: `npm run db:studio`.

## Variables de entorno

La API valida todas las variables al arrancar y se niega a iniciar si alguna falta o es inválida. El
mensaje lista cada problema.

| Variable                | Obligatoria  | Por defecto          | Secreta | Descripción                                                                                      |
| ----------------------- | ------------ | -------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `NODE_ENV`              | no           | `development`        | no      | `development`, `test` o `production`                                                             |
| `PORT`                  | no           | `3001`               | no      | Puerto HTTP                                                                                      |
| `CORS_ORIGINS`          | sí           | —                    | no      | Orígenes del frontend separados por coma, con protocolo                                          |
| `SWAGGER_ENABLED`       | no           | `true` fuera de prod | no      | `true` o `false`. En producción está apagado salvo que se ponga `true`                           |
| `APP_TIME_ZONE`         | no           | `America/Guayaquil`  | no      | Zona IANA para los textos de los avisos                                                          |
| `DATABASE_URL`          | sí           | —                    | **sí**  | Cadena de conexión de Prisma a SQL Server                                                        |
| `AUTH_MODE`             | sí           | —                    | no      | `demo` (solo desarrollo) o `google`. En producción debe ser `google`                             |
| `JWT_SECRET`            | sí           | —                    | **sí**  | Mínimo 32 caracteres. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_HOURS`     | no           | `8`                  | no      | Duración de la sesión, de 1 a 24                                                                 |
| `GOOGLE_CLIENT_ID`      | con `google` | —                    | no      | Client ID de OAuth "Web application"                                                             |
| `GOOGLE_REQUIRE_HD`     | no           | `false`              | no      | `true` exige cuenta de Google Workspace del dominio                                              |
| `ALLOWED_EMAIL_DOMAINS` | sí           | —                    | no      | Dominios permitidos separados por coma, por ejemplo `tcs.com,pichincha.com`                      |
| `AUTO_CREATE_USERS`     | no           | `true`               | no      | `false`: solo entran usuarios dados de alta por un ADMIN                                         |
| `DEMO_DEFAULT_USER`     | no           | —                    | no      | Solo con `AUTH_MODE=demo`: usuario para peticiones sin credenciales                              |
| `NOTIFY_CHANNELS`       | no           | vacío                | no      | Canales extra a la bandeja: `PUSH`, `EMAIL` o ambos                                              |
| `JOB_KEY`               | no           | —                    | **sí**  | Si se define (mínimo 32), las tareas programadas exigen la cabecera `x-job-key`                  |
| `INITIAL_ADMIN_EMAIL`   | solo seed    | —                    | no      | Administrador que crea `npm run db:seed`                                                         |
| `INITIAL_ADMIN_NAME`    | solo seed    | el correo            | no      | Nombre del administrador inicial                                                                 |

Las reglas de reserva (franjas de 30 min, 24 h de anticipación, 48 h máximo, ventana de check-in) ya no
van en el entorno: viven en `src/config/reservation-rules.service.ts` y más adelante se administrarán
desde el panel del ADMIN.

### Cambios frente al `.env` anterior

Al configurar Azure (App Settings), actualiza estos nombres:

| Antes                                                                                                                    | Ahora                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `FRONTEND_URL`                                                                                                           | `CORS_ORIGINS`                                  |
| `ENABLE_SWAGGER`                                                                                                         | `SWAGGER_ENABLED`                               |
| `DEFAULT_DEMO_USER`                                                                                                      | `DEMO_DEFAULT_USER`                             |
| `SLOT_MINUTES`, `MIN_ADVANCE_HOURS`, `MAX_DURATION_HOURS`, `CANCEL_MIN_HOURS`, `CHECKIN_BEFORE_MIN`, `CHECKIN_AFTER_MIN` | se eliminan                                     |
| `DB_SA_PASSWORD`                                                                                                         | se elimina (pertenece al compose del workspace) |
| —                                                                                                                        | `WEBSITES_PORT=3001` en App Service             |

## Comandos

| Comando                | Para qué                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run start:dev`    | Levanta la API y se reinicia al guardar                          |
| `npm run lint`         | ESLint (`lint:fix` corrige lo automático)                        |
| `npm run format`       | Prettier sobre todo el repo (`format:check` solo revisa)         |
| `npm run typecheck`    | TypeScript sin compilar                                          |
| `npm test`             | Pruebas unitarias (Jest)                                         |
| `npm run build`        | Compila a `dist/`                                                |
| `npm run db:migrate`   | Crea una migración nueva desde `schema.prisma` (solo base local) |
| `npm run db:deploy`    | Aplica migraciones ya creadas                                    |
| `npm run db:seed`      | Roles y administrador inicial                                    |
| `npm run db:seed:demo` | Datos demo (bloqueado en producción)                             |
| `npm run db:studio`    | Ver y editar datos en el navegador                               |

Cada commit pasa por husky: `lint-staged` formatea y corrige los archivos en stage y `commitlint` exige
[Conventional Commits](https://www.conventionalcommits.org/) (`feat(reservations): ...`).

Si cambias `prisma/schema.prisma`: `npm run db:migrate -- --name <cambio_en_ingles>` y sube la carpeta
nueva de `prisma/migrations`. Las migraciones ya aplicadas no se editan.

## Usuarios demo (`AUTH_MODE=demo`)

| Correo                   | Roles                                          |
| ------------------------ | ---------------------------------------------- |
| ana.asociado@demo.com    | ASOCIADO                                       |
| luis.lider@demo.com      | ASOCIADO, LIDER                                |
| sofia.spocadmin@demo.com | ASOCIADO, SPOC_ADMIN                           |
| carlos.spoc@demo.com     | ASOCIADO, SPOC_EDIFICIO (Edificio Quito Norte) |
| admin@demo.com           | ADMIN                                          |

## Inicio de sesión

- `AUTH_MODE=demo` (desarrollo): cabecera `x-demo-user` o `POST /auth/demo`. La API no arranca así en
  producción.
- `AUTH_MODE=google`: botón de Google en el frontend → `POST /auth/google` → la API verifica el token de
  Google, revisa que el correo sea de `ALLOWED_EMAIL_DOMAINS` y entrega su propio token (JWT). Detalle en
  `docs/frontend-login-google.md`.

## Docker y despliegue

```bash
docker build -t backend-reservas .
docker run -p 3001:3001 -e DATABASE_URL="..." -e JWT_SECRET="..." -e AUTH_MODE=google ... backend-reservas
```

- La imagen escucha en el puerto **3001**.
- Al arrancar, el contenedor ejecuta `prisma migrate deploy` (con 4 intentos, por si Azure SQL está
  pausada) y luego inicia la API. El usuario de `DATABASE_URL` necesita permisos para migrar.
- CI (`.github/workflows/ci.yml`): en cada PR a `develop` o `main` y en cada push a `develop` corre lint,
  formato, typecheck, tests, build y la construcción de la imagen.
- Deploy (`.github/workflows/deploy.yml`): en cada push a `main` repite el quality gate, publica la
  imagen en GHCR con la etiqueta del commit y `latest`, y despliega la del commit en el App Service
  `reservas-backend`.
- Contra Azure SQL solo se aplica `prisma migrate deploy`. Nunca `db:migrate` ni `db:reset`.
