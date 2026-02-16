import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import session = require('express-session');
import passport = require('passport');
import { json, urlencoded } from 'express';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Disable default body parser to use custom ones that preserve raw body
    bodyParser: false,
  });

  // Custom body parsers that preserve raw body for webhook signature verification
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Enable WebSocket adapter for real-time task updates
  app.useWebSocketAdapter(new IoAdapter(app));

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Configure session
  app.use(
    session({
      name: 'ai-pipeline.sid',
      secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
      resave: true,
      saveUninitialized: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
        secure: false, // Must be false for localhost
        sameSite: 'lax',
      },
    }),
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Enable validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // SPA fallback - serve index.html for any non-API route that doesn't match a static file
  // This must be registered AFTER all other middleware and routes
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: any, res: any, next: any) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Skip static files (assets, etc.)
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/)) {
      return next();
    }
    // Serve index.html for SPA routes
    res.sendFile(join(__dirname, '..', 'web', 'dist', 'index.html'));
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
