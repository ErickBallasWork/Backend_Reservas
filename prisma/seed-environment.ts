import { isEmail } from 'class-validator';

export interface InitialAdmin {
  email: string;
  fullName: string;
}

export interface SeedEnvironment {
  isProduction: boolean;
  initialAdmin: InitialAdmin | null;
}

function loadEnvFileIfPresent(): void {
  try {
    process.loadEnvFile();
  } catch {
    return;
  }
}

function readInitialAdmin(): InitialAdmin | null {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  if (!isEmail(email)) throw new Error('INITIAL_ADMIN_EMAIL must be a valid email');
  return { email, fullName: process.env.INITIAL_ADMIN_NAME?.trim() || email };
}

export function readSeedEnvironment(): SeedEnvironment {
  loadEnvFileIfPresent();
  return {
    isProduction: process.env.NODE_ENV === 'production',
    initialAdmin: readInitialAdmin(),
  };
}
