import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const configuredOrigin = process.env.FRONTEND_URL;
  app.enableCors({
    origin: configuredOrigin ? configuredOrigin.split(',').map((origin) => origin.trim()) : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WDP Storage API')
    .setDescription('API currently implemented for WDP Storage. Guest endpoints are public; protected endpoints require a Bearer token obtained from POST /api/auth/login or /api/auth/register. Prices can remain unknown and are never represented as zero.')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Bearer', description: 'Paste only the token value returned by login or register.' }, 'bearerAuth')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, { deepScanRoutes: true });
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'WDP Storage API',
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
