# Qué es cada archivo y carpeta

Guía rápida del proyecto. Si solo vas a leer una parte, lee **"Cómo viaja una petición"** al final.

## Archivos de la raíz

| Archivo | Para qué sirve | ¿Lo tocas? |
| --- | --- | --- |
| `package.json` | Lista de librerías (dependencias) y **comandos** (`npm run ...`). También le dice a Prisma cómo correr el seed. | Solo para añadir librerías o comandos |
| `package-lock.json` | Aparece con `npm install`. Fija la versión exacta de cada librería para que todos tengan lo mismo. **Se sube al repo.** | No a mano |
| `tsconfig.json` | Configuración de TypeScript (cómo se compila el código). | No |
| `tsconfig.build.json` | Igual, pero para `npm run build`: deja fuera pruebas y carpeta `prisma`. | No |
| `nest-cli.json` | Configuración de la CLI de Nest. Activa el plugin de Swagger que documenta los DTO solo. | No |
| `.env.example` | Plantilla de variables de entorno, **sin secretos reales**. Se sube al repo. | Cuando añades una variable nueva |
| `.env` | Tu copia real con contraseñas y secretos. **Nunca se sube** (está en `.gitignore`). | Sí, es tu configuración local |
| `.gitignore` | Lo que Git ignora: `node_modules`, `dist`, `.env`... | Rara vez |
| `.prettierrc` | Reglas de formato (comillas, ancho de línea). VS Code formatea al guardar con la extensión Prettier. | No |
| `README.md` | Resumen y comandos para arrancar. | Cuando cambie algo importante |
| `azure-pipelines.yml` | **CI en Azure DevOps**: en cada push a `develop` o `main` instala, corre pruebas, compila y revisa vulnerabilidades. | Cuando DevOps lo pida |

## Archivos de Docker

Docker corre programas dentro de "contenedores": cajas aisladas que traen todo lo que necesitan. Aquí se usa
para tener SQL Server en tu PC sin instalarlo, y para empaquetar la API como se publicará en Azure.

| Archivo | Para qué sirve |
| --- | --- |
| `docker-compose.yml` | **Tu base de datos local.** Define el servicio `db` (SQL Server 2022, puerto 1433) y un volumen `sqldata` donde quedan guardados los datos aunque apagues el contenedor. `npm run db:up` lo enciende. Tiene un segundo servicio opcional, `api`, que solo arranca con `docker compose --profile completo up -d --build` para probar la API dentro de Docker. |
| `Dockerfile` | **Receta de la imagen de la API** para Azure Container Apps. Etapa 1: instala, genera Prisma y compila. Etapa 2: copia solo lo necesario a una imagen limpia y la corre como usuario sin privilegios. Para la base local **no** lo necesitas. |
| `.dockerignore` | Lo que no se copia a la imagen (`node_modules`, `.env`, `.git`...). Evita meter secretos en la imagen. |

Conceptos: **imagen** = la plantilla (por ejemplo `mssql/server:2022-latest`); **contenedor** = una imagen
encendida; **volumen** = disco del contenedor que sobrevive cuando lo apagas o lo borras.

## `prisma/` — la base de datos

| Archivo | Para qué sirve |
| --- | --- |
| `schema.prisma` | **El modelo de datos**: cada `model` es una tabla (`Reservation` → `RESERVATION`). De aquí Prisma genera las tablas y el cliente tipado que usa el código. |
| `seed.ts` | Datos de ejemplo: 5 roles, 2 edificios, 4 salas, 1 laboratorio con 5 laptops y 5 usuarios demo. Se puede correr varias veces. |
| `migrations/` | **Aparece** tras el primer `npm run db:migrate`. Cada subcarpeta tiene un `migration.sql` con los cambios exactos de la base. **Se sube al repo**: así Azure se crea igual que tu base local (`npm run db:deploy`). No edites migraciones ya subidas. |

## `src/` — el código

### Arranque

| Archivo | Para qué sirve |
| --- | --- |
| `main.ts` | Enciende la API: prefijo `/api/v1`, cabeceras de seguridad (helmet), CORS solo para el frontend, validación de datos, formato único de errores y Swagger en `/api/docs`. Se niega a arrancar en producción con modo demo. |
| `app.module.ts` | Une todos los módulos. Si creas un módulo nuevo, se registra aquí. |

### Carpetas transversales

| Carpeta | Para qué sirve |
| --- | --- |
| `config/` | `reservation-rules.ts`: reglas de reserva leídas del `.env` (franjas de 30 min, 24 h de anticipación, 48 h máximo, ventana de check-in). |
| `common/` | Piezas compartidas: `constants.ts` (roles, tipos y estados válidos), `filters/` (convierte cualquier error en `{statusCode, code, message}`), `current-user/` (decoradores `@CurrentUser()` y `@Public()`), `pagination.dto.ts`, `db.types.ts`, `format.ts` (fechas legibles), `job-key.ts` (protege las tareas programadas). |
| `prisma/` | `PrismaService`: la conexión a la base. Reintenta si la base de Azure está despertando. |
| `auth/` | Inicio de sesión. `auth.controller.ts` (`POST /auth/google`, `POST /auth/demo`), `google-verifier.service.ts` (verifica el token de Google), `auth.service.ts` (crea o busca el usuario y firma el JWT), `auth.guard.ts` (**guard global**: revisa el token y los roles en cada petición), `roles.decorator.ts` (`@Roles('ADMIN')`). |
| `health/` | `GET /health`: dice si la API y la base responden. Azure lo usa para saber si el servicio está vivo. |
| `audit/` | Registro de auditoría (`AUDIT_LOG`): quién hizo qué y cuándo. `GET /audit` solo para ADMIN. |
| `notifications/` | Bandeja de avisos (`NOTIFICATION`). Hoy el canal es la app (IN_APP); push y e-mail quedan pendientes y se procesan con una tarea. |

### Módulos de negocio

Cada módulo tiene casi siempre los mismos archivos:

- `*.module.ts`: declara qué controladores y servicios tiene el módulo.
- `*.controller.ts`: las **rutas** (URL + método) y quién puede llamarlas. No tiene lógica.
- `*.service.ts`: la **lógica**: validaciones, transacciones, consultas con Prisma.
- `dto/`: la **forma de los datos que llegan** (qué campos, de qué tipo, cuáles son obligatorios).

| Carpeta | Rutas principales | Historias |
| --- | --- | --- |
| `users/` | `GET /me`, `GET /roles`, `GET/POST /users`, `PATCH /users/:id` | Perfil, alta de usuarios y roles |
| `catalog/` | `/buildings`, `/resources`, `GET /catalog/tree` | HU-01 a HU-05: edificios, salas, laboratorios y laptops |
| `availability/` | `GET /availability/search`, `GET /availability/resources/:id` | HU-06: qué está libre |
| `reservations/` | `POST /reservations`, `GET /reservations/mine`, `GET /reservations/:id`, `PATCH .../cancel`, `POST .../check-in` | HU-07 a HU-14, HU-20 |
| `approvals/` | `GET /approvals/pending`, `POST /approvals/:reservationId` | HU-15: el Líder aprueba entrenamientos |
| `reallocations/` | `POST /reservations/:id/reallocate` | HU-17, HU-18: el SPOC mueve reservas de sala |
| `sanctions/` | `GET /sanctions`, `PATCH /sanctions/:id/resolve`, `POST /sanctions/no-show/run` | HU-21, HU-22: No-Show y sanciones |
| `transfers/` | `POST /reservations/:id/transfer-requests`, `GET /transfer-requests/received`, `GET /transfer-requests/sent`, `POST /transfer-requests/:id/accept`, `POST /transfer-requests/:id/reject`, `PATCH /transfer-requests/:id/cancel` | Cesión entre asociados: alguien pide una reserva ocupada con su justificación y el dueño acepta o rechaza |
| `dashboard/` | `GET /dashboard/reservations`, `GET /dashboard/metrics` | HU-16: panel del SPOC Administrativo y Líder |
| `reports/` | `GET /reports/occupancy`, `GET /reports/usage-by-department` (+ `/export` en CSV) | HU-23: reportes |

Archivos especiales de `reservations/`:

- `time-rules.ts`: reglas de tiempo como funciones puras (sin base): franjas, anticipación, duración, cancelación, check-in.
- `time-rules.spec.ts`: sus pruebas (`npm test`).
- `slots.ts`: guarda las franjas en `RESERVATION_SLOT`. La clave única `(ResourceId, SlotStart)` hace que la base rechace una doble reserva aunque dos personas reserven en el mismo milisegundo.

## `docs/` y `tools/`

| Archivo | Para qué sirve |
| --- | --- |
| `docs/ESTRUCTURA.md` | Este archivo. |
| `docs/frontend-login-google.md` | Lo que necesita el frontend para el botón de Google. |
| `docs/sql/permisos-auditoria.sql` | Para Azure (no local): crea el usuario de la app sin permiso de editar ni borrar la auditoría, y un usuario aparte para migraciones. Lo corre quien administra la base. |
| `tools/pruebas.http` | Peticiones listas para la extensión REST Client: haz clic en "Send Request". |
| `tools/login-google.html` | Página para probar el login con Google sin tener el frontend. |
| `.vscode/extensions.json` | VS Code te sugiere instalar las extensiones del proyecto al abrirlo. |

## Carpetas que aparecen solas (no se suben)

| Carpeta | Qué es |
| --- | --- |
| `node_modules/` | Las librerías descargadas por `npm install`. Pesada; se regenera cuando quieras. |
| `dist/` | El JavaScript compilado por `npm run build`. Es lo que corre en Azure. |
| `coverage/` | Informe de `npm run test:cov`. |

## Cómo viaja una petición

Ejemplo: Ana reserva la Sala Pichincha.

1. El frontend llama `POST /api/v1/reservations` con el token (o `x-demo-user` en modo demo).
2. `main.ts` aplica seguridad y valida el cuerpo contra `CreateReservationDto`. Si falta un campo → 400.
3. `auth.guard.ts` revisa quién es y si su rol puede usar esa ruta. Si no → 401 o 403.
4. `reservations.controller.ts` recibe la petición y llama a `ReservationsService.create()`.
5. El servicio revisa sanciones, reglas de tiempo y el recurso; luego, **en una sola transacción**, crea la
   reserva, guarda sus franjas, crea el aviso y escribe la auditoría. Si la franja ya estaba tomada, la base
   lo rechaza y el usuario recibe 409 `SLOT_TAKEN`.
6. Cualquier error pasa por `common/filters` y sale con el mismo formato para el frontend.
