import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;

  await app.listen(port);
  Logger.log(`signal-forge listening on port ${port}`, 'Bootstrap');
}
void bootstrap();
