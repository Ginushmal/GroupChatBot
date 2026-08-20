import { Controller, Get, Post, Body, Param, Query, Inject } from "@nestjs/common";
import { DatabaseService, SettingsRecord } from "../database/database.service.js";
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
    const settings = this.dbService.getSettings();
    const chats = this.dbService.getAllChats();

    return {
      whatsapp: waStatus,
      settings,
      config: settings, // backwards compatibility
      totalChats: chats.length,
      activeChats: chats.filter((c) => c.is_active === 1).length,
      totalGroups: chats.length,
      activeGroups: chats.filter((c) => c.is_active === 1).length,
    };
  }

  @Get("settings")
  getSettings() {
    return this.dbService.getSettings();
  }

  @Get("config")
  getConfig() {
    return this.dbService.getSettings();
  }

  @Post("settings")
  updateSettings(@Body() body: Partial<SettingsRecord>) {
    this.dbService.updateSettings(body);
    return { success: true, settings: this.dbService.getSettings() };
  }

  @Post("config")
  updateConfig(@Body() body: Partial<SettingsRecord>) {
    this.dbService.updateSettings(body);
    return { success: true, config: this.dbService.getSettings() };
  }

  @Get("chats")
  getChats() {
    return this.dbService.getAllChats();
  }

  @Get("groups")
  getGroups() {
    return this.dbService.getAllChats();
  }

  @Post("chats/:id/toggle")
  toggleChat(@Param("id") id: string, @Body() body: { is_active: boolean }) {
    this.dbService.setChatActive(id, body.is_active);
    return { success: true, chat: this.dbService.getChat(id) };
  }

  @Post("groups/:id/toggle")
  toggleGroup(@Param("id") id: string, @Body() body: { is_active: boolean }) {
    this.dbService.setChatActive(id, body.is_active);
    return { success: true, group: this.dbService.getChat(id) };
  }

  @Post("chats/:id/prompt")
  updateChatPrompt(@Param("id") id: string, @Body() body: { custom_prompt: string | null }) {
    this.dbService.setChatPrompt(id, body.custom_prompt);
    return { success: true, chat: this.dbService.getChat(id) };
  }

  @Post("groups/:id/prompt")
  updateGroupPrompt(@Param("id") id: string, @Body() body: { custom_prompt: string | null }) {
    this.dbService.setChatPrompt(id, body.custom_prompt);
    return { success: true, group: this.dbService.getChat(id) };
  }

  @Post("chats/:id/trigger")
  updateChatTrigger(@Param("id") id: string, @Body() body: { custom_trigger: string | null }) {
    this.dbService.setChatTrigger(id, body.custom_trigger);
    return { success: true, chat: this.dbService.getChat(id) };
  }

  @Post("chats/:id/mentions")
  updateChatMentions(@Param("id") id: string, @Body() body: { allow_mentions: boolean }) {
    this.dbService.setChatMentions(id, body.allow_mentions);
    return { success: true, chat: this.dbService.getChat(id) };
  }

  @Get("messages/:chatId")
  getMessages(@Param("chatId") chatId: string, @Query("limit") limit?: string) {
    const defaultLimit = this.dbService.getSettings().short_term_msg_limit || 50;
    const count = limit ? parseInt(limit, 10) : defaultLimit;
    return this.memoryService.getRecentContext(chatId, count);
  }

  @Get("invocations")
  getInvocations(@Query("limit") limit?: string) {
    const count = limit ? parseInt(limit, 10) : 100;
    return this.dbService.getInvocations(count);
  }

  @Post("logout")
  async logout() {
    await this.whatsAppService.logout();
    return { success: true, message: "Logged out. Scan new QR code to reconnect." };
  }
}
