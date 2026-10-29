import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { networkInterfaces } from 'node:os';
import { corsOrigins } from './cors-origins.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const configuredOrigin = process.env.FRONTEND_URL;
  app.enableCors({
    origin: corsOrigins(configuredOrigin, process.env.NODE_ENV !== 'production', Object.values(networkInterfaces()).flatMap(entries => (entries ?? []).map(entry => entry.address))),
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WDP Storage API')
    .setDescription('API currently implemented for WDP Storage. Guest endpoints are public; protected endpoints require a Bearer token obtained from POST /api/auth/login or /api/auth/register. Prices can remain unknown and are never represented as zero.')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Bearer', description: 'Paste only the token value returned by login or register.' }, 'bearerAuth')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, { deepScanRoutes: true });
  for (const pathItem of Object.values(swaggerDocument.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const) {
      const operation = pathItem?.[method];
      if (!operation?.security?.length) continue;
      operation.responses['401'] ??= { description: 'Thiếu, sai hoặc hết hạn bearer token.' };
      operation.responses['403'] ??= { description: 'Tài khoản đã xác thực nhưng không có role/quyền phù hợp.' };
    }
  }
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'WDP Storage API',
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
