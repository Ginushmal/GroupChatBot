import { Module } from "@nestjs/common";
import { OrchestratorService } from "./orchestrator.service.js";
import { WhatsAppModule } from "../whatsapp/whatsapp.module.js";

@Module({
  imports: [WhatsAppModule],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
