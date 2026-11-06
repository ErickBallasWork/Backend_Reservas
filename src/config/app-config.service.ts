import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig, AuthConfig, JobsConfig, ServerConfig } from './app-config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  get server(): ServerConfig {
    return this.config.get('server', { infer: true });
  }

  get auth(): AuthConfig {
    return this.config.get('auth', { infer: true });
  }

  get jobs(): JobsConfig {
    return this.config.get('jobs', { infer: true });
  }
}
