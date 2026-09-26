import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const configuredOrigin = process.env.FRONTEND_URL;
  app.enableCors({
    origin: configuredOrigin ? configuredOrigin.split(',').map((origin) => origin.trim()) : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
