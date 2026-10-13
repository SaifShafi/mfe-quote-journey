import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

const PORT = 4000
// The host's origin, named explicitly rather than wildcarded, because this
// server sets credentialed cookies and a wildcard origin cannot be combined
// with credentials: true in any browser.
const HOST_ORIGIN = 'http://localhost:3000'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(cookieParser())
  app.enableCors({ origin: HOST_ORIGIN, credentials: true })
  await app.listen(PORT)
  console.log(`bff on http://localhost:${PORT}`)
}

bootstrap()
