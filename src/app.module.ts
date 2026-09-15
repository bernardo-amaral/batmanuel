/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyzeModule } from './analyze/analyze.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...(process.env.APP_MODE !== 'cli'
      ? [
          TypeOrmModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
              type: 'postgres',
              host: config.get('DB_HOST'),
            }),
            inject: [ConfigService],
          }),
        ]
      : []),
    AnalyzeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
