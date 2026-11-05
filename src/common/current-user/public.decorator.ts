import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca una ruta que no necesita usuario (por ejemplo /health).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
