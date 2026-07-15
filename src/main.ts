import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConsoleLogger, Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: 'BATMANUEL',
      colors: true,
    }),
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);

  Logger.verbose(`Application running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
