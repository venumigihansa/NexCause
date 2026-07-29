import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import databaseConfig from "../config/database.config";
import { DatabaseModule } from "../database/database.module";
import { PrismaService } from "../database/prisma.service";
import authConfig from "./auth.config";
import { CryptoService } from "./crypto.service";
import { SessionService } from "./session.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, databaseConfig],
    }),
    DatabaseModule,
  ],
  providers: [CryptoService, SessionService],
})
class SessionCleanupModule {}

async function cleanup(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SessionCleanupModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const count = await app.get(SessionService).cleanup();
    await app.get(PrismaService).auditEvent.create({
      data: {
        action: "auth.session_cleanup",
        outcome: "success",
        metadata: { removedRecords: count },
      },
    });
    console.log(`Removed ${count} expired authentication records`);
  } finally {
    await app.close();
  }
}

void cleanup();
