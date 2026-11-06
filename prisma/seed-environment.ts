import { isEmail } from 'class-validator';

export interface InitialSuperadmin {
  email: string;
  fullName: string;
}

export interface SeedEnvironment {
  isProduction: boolean;
  initialSuperadmin: InitialSuperadmin | null;
}

export function loadEnvFileIfPresent(): void {
  try {
    process.loadEnvFile();
  } catch {
    return;
  }
}

function readInitialSuperadmin(): InitialSuperadmin | null {
  const email = process.env.INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  if (!isEmail(email)) throw new Error('INITIAL_SUPERADMIN_EMAIL must be a valid email');
  return { email, fullName: process.env.INITIAL_SUPERADMIN_NAME?.trim() || email };
}

export function readSeedEnvironment(): SeedEnvironment {
  loadEnvFileIfPresent();
  return {
    isProduction: process.env.NODE_ENV === 'production',
    initialSuperadmin: readInitialSuperadmin(),
  };
}
