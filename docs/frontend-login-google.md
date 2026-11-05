# Login con Google: lo que necesita el frontend (Next.js)

El backend ya valida el inicio de sesión. El frontend solo muestra el botón de Google, manda el
`credential` al backend y guarda el `accessToken` que recibe.

## 1. Instalar

```bash
npm install @react-oauth/google
```

`.env.local` del frontend:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=EL_MISMO_CLIENT_ID_DEL_BACKEND.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

## 2. Botón de inicio de sesión

```tsx
'use client';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

export default function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      <GoogleLogin
        onSuccess={async ({ credential }) => {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data.message); // por ejemplo: "Solo se permiten correos de: tcs.com"
            return;
          }
          sessionStorage.setItem('accessToken', data.accessToken);
          // data.user trae nombre, correo y roles: úsalos para armar el menú
        }}
        onError={() => alert('No se pudo iniciar sesión con Google')}
      />
    </GoogleOAuthProvider>
  );
}
```

## 3. Llamar a la API con el token

```ts
export async function api(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem('accessToken');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('accessToken');
    window.location.href = '/login'; // la sesión expiró
  }
  return res;
}
```

## Notas

- En Google Auth Platform, la dirección del frontend debe estar en **Authorized JavaScript origins**
  (`http://localhost:3000` y la URL de Static Web Apps).
- El backend debe tener esa misma dirección en `FRONTEND_URL` (CORS).
- La sesión dura `JWT_EXPIRES_HOURS` (8 horas por defecto); al vencer, la API responde 401.
