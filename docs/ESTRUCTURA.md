# Qué es cada archivo y carpeta

Guía rápida del proyecto. Si solo vas a leer una parte, lee **"Cómo viaja una petición"** al final.

## Archivos de la raíz

| Archivo                  | Para qué sirve                                                                                                  | ¿Lo tocas?                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `package.json`           | Librerías, **comandos** (`npm run ...`), `engines` (Node 22) y la configuración de `lint-staged`.               | Solo para añadir librerías o comandos |
| `package-lock.json`      | Versión exacta de cada librería. Se genera con npm 10 (el de Node 22). **Se sube al repo.**                     | No a mano                             |
| `.nvmrc`                 | Versión de Node del proyecto (22). `nvm use` la activa.                                                         | No                                    |
| `tsconfig.json`          | Configuración de TypeScript en modo `strict`.                                                                   | No                                    |
| `tsconfig.build.json`    | Igual, pero para `npm run build`: deja fuera pruebas y la carpeta `prisma`.                                     | No                                    |
| `nest-cli.json`          | Configuración de la CLI de Nest. Activa el plugin de Swagger que documenta los DTO.                             | No                                    |
| `eslint.config.mjs`      | Reglas de ESLint (TypeScript con tipos, sin `any`, imports de tipos, sin `console` fuera de `prisma/`).         | Rara vez                              |
| `.prettierrc`            | Formato: comillas simples, coma final, 100 columnas, fin de línea LF. Igual que en el frontend.                 | No                                    |
| `.prettierignore`        | Lo que Prettier no formatea (migraciones, `dist`, lockfile).                                                    | Rara vez                              |
| `.editorconfig`          | Indentación y fin de línea para cualquier editor.                                                               | No                                    |
| `.gitattributes`         | Fuerza fin de línea LF en el repo, también en Windows.                                                          | No                                    |
| `.git-blame-ignore-revs` | Commits de solo formato que `git blame` debe saltar (`git config blame.ignoreRevsFile .git-blame-ignore-revs`). | Al hacer un commit de formato masivo  |
| `commitlint.config.mjs`  | Exige Conventional Commits en cada mensaje.                                                                     | No                                    |
| `.husky/`                | Hooks de git: `pre-commit` corre `lint-staged` y `commit-msg` corre `commitlint`.                               | No                                    |
| `.env.example`           | Plantilla de variables de entorno, **sin secretos reales**. Se sube al repo.                                    | Cuando añades una variable nueva      |
| `.env`                   | Tu copia real con contraseñas y secretos. **Nunca se sube** (está en `.gitignore`).                             | Sí, es tu configuración local         |
| `.gitignore`             | Lo que Git ignora: `node_modules`, `dist`, `.env`, archivos de Claude...                                        | Rara vez                              |
| `README.md`              | Arranque, variables de entorno, comandos y despliegue.                                                          | Cuando cambie algo importante         |

## Docker y CI

| Archivo                        | Para qué sirve                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                   | **Imagen de la API** para Azure App Service. Etapa 1: instala, genera Prisma y compila. Etapa 2: copia solo lo necesario, corre como usuario sin privilegios y escucha en el puerto 3001. |
| `docker/start.sh`              | Comando de arranque del contenedor: `prisma migrate deploy` con reintentos y luego la API.                                                                                                |
| `.dockerignore`                | Lo que no se copia a la imagen (`node_modules`, `.env`, `.git`, docs...). Evita meter secretos en la imagen.                                                                              |
| `.github/workflows/ci.yml`     | Quality gate: lint, formato, typecheck, tests, build y construcción de la imagen. Corre en PR a `develop` y `main` y en push a `develop`.                                                 |
| `.github/workflows/deploy.yml` | En push a `main`: repite el quality gate, publica la imagen en GHCR (etiqueta del commit y `latest`) y la despliega en App Service.                                                       |

La base de datos local no está en este repo: el `docker-compose.yml` vive en el workspace
(`reservation_system/`) y solo levanta SQL Server.

## `prisma/` — la base de datos

| Archivo               | Para qué sirve                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma`       | **El modelo de datos**: cada `model` es una tabla (`Reservation` → `RESERVATION`). De aquí Prisma genera las migraciones y el cliente tipado. |
| `migrations/`         | Cada subcarpeta tiene un `migration.sql` con los cambios exactos de la base. **Se sube al repo** y no se editan las ya aplicadas.             |
| `seed.ts`             | Datos obligatorios (también en producción): los 6 roles y el SUPERADMIN inicial (`INITIAL_SUPERADMIN_EMAIL`).                                 |
| `seed-demo.ts`        | Datos demo: 2 edificios, 4 salas, 1 laboratorio con 5 laptops y 5 usuarios. Se puede repetir y no corre en producción.                        |
| `seed-environment.ts` | Lee y valida las variables que usan los seeds.                                                                                                |

## `src/` — el código

### Arranque

| Archivo         | Para qué sirve                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`       | Enciende la API: prefijo `/api/v1`, cabeceras de seguridad (helmet), CORS de `CORS_ORIGINS`, validación de datos, formato único de errores y Swagger. |
| `swagger.ts`    | Arma la documentación en `/api/docs`, con la versión de `package.json`.                                                                               |
| `app.module.ts` | Une todos los módulos. Si creas un módulo nuevo, se registra aquí.                                                                                    |

### Carpetas transversales

| Carpeta          | Para qué sirve                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`        | `environment.ts` valida las variables al arrancar, `app-config.ts` las agrupa en `server`, `auth`, `notifications` y `jobs`, y `AppConfigService` las expone tipadas (es global). `ReservationRulesService` entrega las reglas de reserva. **Nunca se lee `process.env` fuera de aquí.**                                                            |
| `common/`        | Piezas compartidas: `constants.ts` (roles, tipos y estados válidos), `filters/` (convierte cualquier error en `{statusCode, code, message}`), `current-user/` (decoradores `@CurrentUser()` y `@Public()`), `guards/` (`@JobEndpoint()` protege las tareas programadas con `x-job-key`), `pagination.dto.ts`, `db.types.ts` y `format.ts` (fechas). |
| `prisma/`        | `PrismaService`: la conexión a la base. Reintenta si la base de Azure está despertando.                                                                                                                                                                                                                                                             |
| `auth/`          | Inicio de sesión. `auth.controller.ts` (`POST /auth/demo`, solo desarrollo), `auth.service.ts` (firma el JWT), `auth.guard.ts` (**guard global** de token y roles) y `roles.decorator.ts` (`@Roles('ADMIN')`; el SUPERADMIN pasa cualquier `@Roles`).                                                                                               |
| `health/`        | `GET /health`: dice si la API y la base responden.                                                                                                                                                                                                                                                                                                  |
| `audit/`         | Registro de auditoría (`AUDIT_LOG`): quién hizo qué y cuándo. `GET /audit` solo para ADMIN.                                                                                                                                                                                                                                                         |
| `notifications/` | Bandeja de avisos (`NOTIFICATION`). Hoy el canal es la app (IN_APP); push y e-mail quedan pendientes y se procesan con una tarea.                                                                                                                                                                                                                   |

### Módulos de negocio

Cada módulo tiene casi siempre los mismos archivos:

- `*.module.ts`: declara qué controladores y servicios tiene el módulo.
- `*.controller.ts`: las **rutas** (URL + método) y quién puede llamarlas. No tiene lógica.
- `*.service.ts`: la **lógica**: validaciones, transacciones, consultas con Prisma.
- `dto/`: la **forma de los datos que llegan** (qué campos, de qué tipo, cuáles son obligatorios).

| Carpeta          | Rutas principales                                                                                                | Historias                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `users/`         | `GET /me`, `GET /roles`, `GET/POST /users`, `PATCH /users/:id`                                                   | Perfil, alta de usuarios y roles                        |
| `catalog/`       | `/buildings`, `/resources`, `GET /catalog/tree`                                                                  | HU-01 a HU-05: edificios, salas, laboratorios y laptops |
| `availability/`  | `GET /availability/search`, `GET /availability/resources/:id`                                                    | HU-06: qué está libre                                   |
| `reservations/`  | `POST /reservations`, `GET /reservations/mine`, `GET /reservations/:id`, `PATCH .../cancel`, `POST .../check-in` | HU-07 a HU-14, HU-20                                    |
| `approvals/`     | `GET /approvals/pending`, `POST /approvals/:reservationId`                                                       | HU-15: el Líder aprueba entrenamientos                  |
| `reallocations/` | `POST /reservations/:id/reallocate`                                                                              | HU-17, HU-18: el SPOC mueve reservas de sala            |
| `sanctions/`     | `GET /sanctions`, `PATCH /sanctions/:id/resolve`, `POST /sanctions/no-show/run`                                  | HU-21, HU-22: No-Show y sanciones                       |
| `dashboard/`     | `GET /dashboard/reservations`, `GET /dashboard/metrics`                                                          | HU-16: panel del SPOC Administrativo y Líder            |
| `reports/`       | `GET /reports/occupancy`, `GET /reports/usage-by-department` (+ `/export` en CSV)                                | HU-23: reportes                                         |

Archivos especiales de `reservations/`:

- `time-rules.ts`: reglas de tiempo como funciones puras (sin base): franjas, anticipación, duración, cancelación, check-in.
- `time-rules.spec.ts`: sus pruebas (`npm test`).
- `slots.ts`: guarda las franjas en `RESERVATION_SLOT`. La clave única `(ResourceId, SlotStart)` hace que la base rechace una doble reserva aunque dos personas reserven en el mismo milisegundo.

## `docs/` y `tools/`

| Archivo                           | Para qué sirve                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ESTRUCTURA.md`              | Este archivo.                                                                                                                                                           |
| `docs/sql/permisos-auditoria.sql` | Para Azure (no local): crea el usuario de la app sin permiso de editar ni borrar la auditoría, y un usuario aparte para migraciones. Lo corre quien administra la base. |
| `tools/pruebas.http`              | Peticiones listas para la extensión REST Client: haz clic en "Send Request".                                                                                            |
| `.vscode/extensions.json`         | VS Code te sugiere instalar las extensiones del proyecto al abrirlo.                                                                                                    |

## Carpetas que aparecen solas (no se suben)

| Carpeta         | Qué es                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| `node_modules/` | Las librerías descargadas por `npm install`. Pesada; se regenera cuando quieras. |
| `dist/`         | El JavaScript compilado por `npm run build`. Es lo que corre en Azure.           |
| `coverage/`     | Informe de `npm run test:cov`.                                                   |

## Cómo viaja una petición

Ejemplo: Ana reserva la Sala Pichincha.

1. El frontend llama `POST /api/v1/reservations` con el token.
2. `main.ts` aplica seguridad y valida el cuerpo contra `CreateReservationDto`. Si falta un campo → 400.
3. `auth.guard.ts` revisa quién es y si su rol puede usar esa ruta. Si no → 401 o 403.
4. `reservations.controller.ts` recibe la petición y llama a `ReservationsService.create()`.
5. El servicio revisa sanciones, reglas de tiempo y el recurso; luego, **en una sola transacción**, crea la
   reserva, guarda sus franjas, crea el aviso y escribe la auditoría. Si la franja ya estaba tomada, la base
   lo rechaza y el usuario recibe 409 `SLOT_TAKEN`.
6. Cualquier error pasa por `common/filters` y sale con el mismo formato para el frontend.
