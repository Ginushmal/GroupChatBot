import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { WhatsAppModule } from "../whatsapp/whatsapp.module.js";

@Module({
  imports: [WhatsAppModule],
  controllers: [AdminController],
})
export class AdminModule {}
