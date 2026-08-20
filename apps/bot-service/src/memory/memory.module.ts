import { Module, Global } from "@nestjs/common";
import { MemoryService } from "./memory.service.js";

@Global()
@Module({
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
