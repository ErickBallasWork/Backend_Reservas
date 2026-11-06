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
npm run db:seed           # roles + SUPERADMIN inicial (INITIAL_SUPERADMIN_EMAIL)
npm run db:seed:demo      # datos demo: edificios, salas, laboratorio, laptops y usuarios
npm run start:dev         # API en http://localhost:3001/api/v1
```

- Swagger: http://localhost:3001/api/docs → `POST /auth/demo` con un correo demo → **Authorize** → pega el `accessToken`.
- Peticiones listas para probar: `tools/pruebas.http` (extensión REST Client de VS Code).
- Ver las tablas y los datos: `npm run db:studio`.

## Variables de entorno

La API valida todas las variables al arrancar y se niega a iniciar si alguna falta o es inválida. El
mensaje lista cada problema.

| Variable                   | Obligatoria   | Por defecto          | Secreta | Descripción                                                                                                                         |
| -------------------------- | ------------- | -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | no            | `development`        | no      | `development`, `test` o `production`                                                                                                |
| `PORT`                     | no            | `3001`               | no      | Puerto HTTP                                                                                                                         |
| `CORS_ORIGINS`             | sí            | —                    | no      | Orígenes del frontend separados por coma, con protocolo                                                                             |
| `SWAGGER_ENABLED`          | no            | `true` fuera de prod | no      | `true` o `false`. En producción está apagado salvo que se ponga `true`                                                              |
| `TRUST_PROXY_HOPS`         | no            | `0`                  | no      | Proxies delante de la API (en Azure App Service, `1`) para limitar por la IP real del cliente                                       |
| `APP_TIME_ZONE`            | no            | `America/Guayaquil`  | no      | Zona IANA para los textos de los avisos                                                                                             |
| `DATABASE_URL`             | sí            | —                    | **sí**  | Cadena de conexión de Prisma a SQL Server                                                                                           |
| `JWT_SECRET`               | sí            | —                    | **sí**  | Mínimo 32 caracteres. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`                                    |
| `JWT_EXPIRES_MINUTES`      | no            | `15`                 | no      | Duración del access token, de 5 a 120                                                                                               |
| `DEVICE_IDLE_DAYS`         | no            | `30`                 | no      | Días sin uso tras los que un dispositivo aprobado vuelve a pedir acceso, de 1 a 90                                                  |
| `ALLOWED_EMAIL_DOMAINS`    | sí            | —                    | no      | Dominios permitidos separados por coma, por ejemplo `tcs.com,pichincha.com`                                                         |
| `DEMO_LOGIN_ENABLED`       | no            | `false`              | no      | `true` habilita `POST /auth/demo` (solo desarrollo). La API no arranca así en producción                                            |
| `JOB_KEY`                  | en producción | —                    | **sí**  | Mínimo 32. Las tareas programadas exigen la cabecera `x-job-key`. Debe ser igual al secret `JOB_KEY` del workflow `no-show-job.yml` |
| `SCHEDULER_ENABLED`        | no            | `true`               | no      | Ejecuta en la API los recordatorios y la purga de avisos. Requiere Always On en App Service                                         |
| `NO_SHOW_ENFORCED_FROM`    | no            | —                    | no      | Fecha ISO 8601. El job de inasistencia ignora las reservas que empezaron antes                                                      |
| `INITIAL_SUPERADMIN_EMAIL` | solo seed     | —                    | no      | SUPERADMIN que crea `npm run db:seed`                                                                                               |
| `INITIAL_SUPERADMIN_NAME`  | solo seed     | el correo            | no      | Nombre del SUPERADMIN inicial                                                                                                       |

Las reglas de reserva (franjas de 30 min, 24 h de anticipación, 48 h máximo, ventana de check-in) ya no
van en el entorno: viven en `src/config/reservation-rules.service.ts` y más adelante se administrarán
desde el panel del ADMIN.

### Cambios frente al `.env` anterior

Al configurar Azure (App Settings), actualiza estos nombres:

| Antes                                                                                                                    | Ahora                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `FRONTEND_URL`                                                                                                           | `CORS_ORIGINS`                                              |
| `ENABLE_SWAGGER`                                                                                                         | `SWAGGER_ENABLED`                                           |
| `JWT_EXPIRES_HOURS`                                                                                                      | se reemplaza por `JWT_EXPIRES_MINUTES` y `DEVICE_IDLE_DAYS` |
| `DEFAULT_DEMO_USER`, `AUTH_MODE`, `DEMO_DEFAULT_USER`, `AUTO_CREATE_USERS`, `GOOGLE_CLIENT_ID`, `GOOGLE_REQUIRE_HD`      | se eliminan (ADR-023). Nuevo: `DEMO_LOGIN_ENABLED`          |
| `SLOT_MINUTES`, `MIN_ADVANCE_HOURS`, `MAX_DURATION_HOURS`, `CANCEL_MIN_HOURS`, `CHECKIN_BEFORE_MIN`, `CHECKIN_AFTER_MIN` | se eliminan                                                 |
| `DB_SA_PASSWORD`                                                                                                         | se elimina (pertenece al compose del workspace)             |
| —                                                                                                                        | `WEBSITES_PORT=3001` en App Service                         |

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

## Usuarios demo (`DEMO_LOGIN_ENABLED=true`)

| Correo                   | Roles                                          |
| ------------------------ | ---------------------------------------------- |
| ana.asociado@demo.com    | ASOCIADO                                       |
| luis.lider@demo.com      | ASOCIADO, LIDER                                |
| sofia.spocadmin@demo.com | ASOCIADO, SPOC_ADMIN                           |
| carlos.spoc@demo.com     | ASOCIADO, SPOC_EDIFICIO (Edificio Quito Norte) |
| admin@demo.com           | ADMIN                                          |
| superadmin@demo.com      | SUPERADMIN                                     |

## Inicio de sesión

- Desarrollo (`DEMO_LOGIN_ENABLED=true`): `POST /auth/demo` con el correo de un usuario del seed devuelve el token. La API no arranca así en producción.
- Acceso real (ADR-023): la persona pide acceso con su correo (`POST /access-requests`), el SUPERADMIN lo aprueba o rechaza, y el navegador aprobado canjea la solicitud una sola vez (`POST /auth/device-session`) por un access token de 15 minutos y un refresh token que rota en cada uso (`POST /auth/refresh`). Cada navegador es un dispositivo: el SUPERADMIN puede ver y revocar los de un usuario, y un dispositivo sin uso por `DEVICE_IDLE_DAYS` días vuelve a pedir acceso.

- Límites de peticiones por IP: 120 por minuto en general y más estrictos en los endpoints públicos de acceso (por ejemplo, 5 solicitudes de acceso por hora). Los contadores viven en memoria de cada instancia. Detrás de App Service pon `TRUST_PROXY_HOPS=1`.

### Primer SUPERADMIN

El seed crea al SUPERADMIN (`INITIAL_SUPERADMIN_EMAIL`), pero ningún navegador suyo está aprobado todavía. Para entrar la primera vez:

1. Abre `/request-access` desde ese navegador y pide acceso con el correo del SUPERADMIN.
2. Con acceso a la base, ejecuta `npm run access:approve -- <correo>`. Solo aprueba solicitudes pendientes de usuarios que ya son SUPERADMIN, y deja el registro en la auditoría.
3. La pantalla `/login` de ese navegador entra sola.

Los demás dispositivos y usuarios se aprueban desde la bandeja de solicitudes.

## Docker y despliegue

```bash
docker build -t backend-reservas .
docker run -p 3001:3001 -e DATABASE_URL="..." -e JWT_SECRET="..." ... backend-reservas
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
