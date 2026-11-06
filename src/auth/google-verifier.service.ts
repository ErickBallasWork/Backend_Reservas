import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AppConfigService } from '../config/app-config.service';

export interface GoogleProfile {
  email: string;
  name: string;
  /** Dominio de Google Workspace, si la cuenta es corporativa */
  hostedDomain: string | null;
}

/**
 * Verifica el "credential" (ID token) que entrega el botón de Google en el frontend.
 * Google firma ese token; aquí se comprueba la firma, que sea para nuestra app (Client ID),
 * que no haya expirado, que el correo esté verificado y que sea de un dominio permitido.
 * Solo se usa el servicio de identidad de Google: nada queda alojado en Google Cloud.
 */
@Injectable()
export class GoogleVerifierService {
  private readonly client = new OAuth2Client();

  constructor(private readonly appConfig: AppConfigService) {}

  async verify(credential: string): Promise<GoogleProfile> {
    const {
      googleClientId: clientId,
      allowedEmailDomains,
      requireGoogleWorkspace,
    } = this.appConfig.auth;
    if (!clientId) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Falta GOOGLE_CLIENT_ID en el .env del servidor',
      });
    }

    const payload = await this.readPayload(credential, clientId).catch(() => {
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'El inicio de sesión con Google no es válido o expiró. Intenta de nuevo.',
      });
    });

    if (!payload?.email || payload.email_verified !== true) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Tu correo de Google no está verificado',
      });
    }

    const email = payload.email.toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (!allowedEmailDomains.includes(domain)) {
      throw new ForbiddenException({
        code: 'DOMAIN_NOT_ALLOWED',
        message: `Solo se permiten correos de: ${allowedEmailDomains.join(', ')}`,
      });
    }

    const hostedDomain = payload.hd ? payload.hd.toLowerCase() : null;
    if (requireGoogleWorkspace && hostedDomain !== domain) {
      throw new ForbiddenException({
        code: 'NOT_CORPORATE_ACCOUNT',
        message: 'Debes entrar con la cuenta corporativa de Google Workspace de tu empresa',
      });
    }

    return { email, name: payload.name || email, hostedDomain };
  }

  private async readPayload(credential: string, clientId: string) {
    const ticket = await this.client.verifyIdToken({ idToken: credential, audience: clientId });
    return ticket.getPayload();
  }
}
