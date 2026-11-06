import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadAppConfig } from './app-config';
import { AppConfigService } from './app-config.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ cache: true, validate: loadAppConfig })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
