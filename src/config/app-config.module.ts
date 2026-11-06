import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadAppConfig } from './app-config';
import { AppConfigService } from './app-config.service';
import { ReservationRulesService } from './reservation-rules.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ cache: true, validate: loadAppConfig })],
  providers: [AppConfigService, ReservationRulesService],
  exports: [AppConfigService, ReservationRulesService],
})
export class AppConfigModule {}
