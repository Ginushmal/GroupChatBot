import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "path";
import configuration from "./config/configuration.js";
import { DatabaseModule } from "./database/database.module.js";
import { MemoryModule } from "./memory/memory.module.js";
import { LlmModule } from "./llm/llm.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { OrchestratorModule } from "./orchestrator/orchestrator.module.js";
import { AdminModule } from "./admin/admin.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
    }),
    DatabaseModule,
    MemoryModule,
    LlmModule,
    WhatsAppModule,
    OrchestratorModule,
    AdminModule,
  ],
})
export class AppModule {}
