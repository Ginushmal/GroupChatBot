import { Controller, Get, Post, Body, Param, Query, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { WhatsAppService } from "../whatsapp/whatsapp.service.js";
import { MemoryService } from "../memory/memory.service.js";

@Controller("api")
export class AdminController {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
  ) {}

  @Get("health")
  getHealth() {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("status")
  getStatus() {
    const waStatus = this.whatsAppService.getStatus();
    const config = this.dbService.getConfig();
    const groups = this.dbService.getAllGroups();

    return {
      whatsapp: waStatus,
      config,
      totalGroups: groups.length,
      activeGroups: groups.filter((g) => g.is_active === 1).length,
    };
  }

  @Get("config")
  getConfig() {
    return this.dbService.getConfig();
  }

  @Post("config")
  updateConfig(
    @Body()
    body: { system_prompt: string; trigger_key: string; is_active_globally?: number },
  ) {
    this.dbService.updateConfig(body.system_prompt, body.trigger_key, body.is_active_globally ?? 1);
    return { success: true, config: this.dbService.getConfig() };
  }

  @Get("groups")
  getGroups() {
    return this.dbService.getAllGroups();
  }

  @Post("groups/:id/toggle")
  toggleGroup(@Param("id") id: string, @Body() body: { is_active: boolean }) {
    this.dbService.setGroupActive(id, body.is_active);
    return { success: true, group: this.dbService.getGroup(id) };
  }

  @Post("groups/:id/prompt")
  updateGroupPrompt(@Param("id") id: string, @Body() body: { custom_prompt: string | null }) {
    this.dbService.setGroupPrompt(id, body.custom_prompt);
    return { success: true, group: this.dbService.getGroup(id) };
  }

  @Get("messages/:groupId")
  getMessages(@Param("groupId") groupId: string, @Query("limit") limit?: string) {
    const count = limit ? parseInt(limit, 10) : 50;
    return this.memoryService.getRecentContext(groupId, count);
  }

  @Get("facts")
  async getFacts(@Query("groupId") groupId: string, @Query("senderId") senderId: string) {
    if (!groupId || !senderId) {
      return { error: "groupId and senderId query parameters are required" };
    }
    const facts = await this.memoryService.getFacts(groupId, senderId);
    return { facts };
  }
}
