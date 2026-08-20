import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import baileys, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import qrcodeTerminal from "qrcode-terminal";

const makeWASocket = ((baileys as any)?.default || baileys) as any;
import * as fs from "fs";
import pino from "pino";

export interface WhatsAppStatus {
  state: "connecting" | "open" | "close" | "qr_ready";
  qrCode: string | null;
  user: { id?: string; name?: string } | null;
  lastConnected: Date | null;
}

export interface IncomingMessageEvent {
  chatId: string;
  chatName?: string;
  senderId: string;
  senderName: string;
  text: string;
  isGroup: boolean;
  isFromMe: boolean;
  isBotReply: boolean;
  mentionedJid: string[];
  isBotMentioned: boolean;
  botJids?: string[];
  botName?: string;
  rawMessage?: any;
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private sock: WASocket | null = null;
  private currentQr: string | null = null;
  private connectionState: "connecting" | "open" | "close" | "qr_ready" = "connecting";
  private connectedUser: { id?: string; name?: string } | null = null;
  private lastConnected: Date | null = null;

  // Track message IDs sent by bot to distinguish from manual messages sent by user on phone
  private botSentMessageIds = new Set<string>();
  // In-memory cache for group names to prevent spamming groupMetadata
  private groupNameCache = new Map<string, string>();

  private incomingMessageHandler?: (payload: IncomingMessageEvent) => Promise<void>;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  setIncomingMessageHandler(handler: (payload: IncomingMessageEvent) => Promise<void>) {
    this.incomingMessageHandler = handler;
  }

  async onModuleInit() {
    await this.connectToWhatsApp();
  }

  async connectToWhatsApp() {
    const authDir = this.configService.get<string>("baileysAuthDir", "./data/baileys_auth");
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.logger.log(`Starting WhatsApp Baileys client (WA Version: ${version.join(".")})...`);

    this.sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }) as any,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: false,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQr = qr;
        this.connectionState = "qr_ready";
        this.logger.log("📱 QR code received! Scan with your personal WhatsApp:");
        qrcodeTerminal.generate(qr, { small: true });
      }

      if (connection === "close") {
        this.connectionState = "close";
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.logger.warn(
          `WhatsApp connection closed (statusCode: ${statusCode}). Reconnecting: ${shouldReconnect}`,
        );
        if (shouldReconnect) {
          setTimeout(() => this.connectToWhatsApp(), 3000);
        } else {
          this.logger.error("WhatsApp logged out. Please scan a new QR code.");
        }
      } else if (connection === "open") {
        this.connectionState = "open";
        this.currentQr = null;
        this.lastConnected = new Date();
        this.connectedUser = {
          id: this.sock?.user?.id,
          name: this.sock?.user?.name,
        };
        this.logger.log(
          `✅ WhatsApp successfully connected as ${this.sock?.user?.name || this.sock?.user?.id}`,
        );
      }
    });

    this.sock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify") return;

      for (const msg of m.messages) {
        if (!msg.message) continue;

        const msgId = msg.key.id || "";
        const isFromMe = !!msg.key.fromMe;
        const isBotReply = this.botSentMessageIds.has(msgId);
        if (isBotReply) {
          this.botSentMessageIds.delete(msgId);
        }

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") continue;

        const isGroup = remoteJid.endsWith("@g.us");
        let senderId = isGroup ? (msg.key.participant || remoteJid) : remoteJid;
        if (isFromMe && this.sock?.user?.id) {
          senderId = this.sock.user.id.split(":")[0] + "@s.whatsapp.net";
        }

        let senderName = msg.pushName || senderId.split("@")[0];
        if (isFromMe && !isBotReply) {
          senderName = this.sock?.user?.name || "You";
        }

        // Extract message content
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          "";

        if (!text) continue;

        // Extract mentions
        const mentionedJid: string[] =
          msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // Check if bot is mentioned
        const botUserJid = this.sock?.user?.id ? this.sock.user.id.split(":")[0] + "@s.whatsapp.net" : "";
        const botPhone = botUserJid ? botUserJid.split("@")[0] : "";
        
        // Baileys may provide lid in sock.user or sock.authState.creds.me
        const botLidRaw = (this.sock?.user as any)?.lid || (this.sock?.authState?.creds?.me as any)?.lid;
        const botLid = botLidRaw ? botLidRaw.split(":")[0] + "@lid" : "";
        
        if (mentionedJid.length > 0) {
           this.logger.debug(`Mentions detected: ${JSON.stringify(mentionedJid)}. Bot JID: ${botUserJid}, Bot LID: ${botLid}`);
        }

        const isBotMentioned = mentionedJid.some(
          (jid) => jid === botUserJid || (botPhone && jid.includes(botPhone)) || (botLid && jid === botLid),
        );

        // Resolve group name if group
        let chatName: string | undefined = undefined;
        if (isGroup) {
          if (this.groupNameCache.has(remoteJid)) {
            chatName = this.groupNameCache.get(remoteJid);
          } else {
            try {
              const meta = await this.sock?.groupMetadata(remoteJid);
              if (meta?.subject) {
                chatName = meta.subject;
                this.groupNameCache.set(remoteJid, meta.subject);
              }
            } catch {
              chatName = remoteJid.split("@")[0];
            }
          }
        } else {
          chatName = senderName || remoteJid.split("@")[0];
        }

        if (this.incomingMessageHandler) {
          await this.incomingMessageHandler({
            chatId: remoteJid,
            chatName,
            senderId,
            senderName,
            text,
            isGroup,
            isFromMe,
            isBotReply,
            mentionedJid,
            isBotMentioned,
            botJids: [botUserJid, botLid].filter(Boolean),
            botName: this.sock?.user?.name || "You",
            rawMessage: msg,
          });
        }
      }
    });
  }

  async sendMessage(chatId: string, text: string): Promise<string | undefined> {
    if (!this.sock || this.connectionState !== "open") {
      this.logger.warn(`Cannot send message to ${chatId}: WhatsApp socket is not connected.`);
      return;
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.sock.sendMessage(chatId, { text });
        if (res?.key?.id) {
          this.botSentMessageIds.add(res.key.id);
        }
        this.logger.log(`💬 Sent reply to chat ${chatId}`);
        return res?.key?.id;
      } catch (err: any) {
        this.logger.error(
          `Failed to send message to ${chatId} (attempt ${attempt}/${maxRetries}): ${err.message}`,
          err.data ? JSON.stringify(err.data) : "",
        );
        if (attempt < maxRetries) {
          const delay = attempt * 5000;
          this.logger.log(`⏳ Retrying in ${delay / 1000}s...`);

          if (chatId.endsWith("@g.us")) {
            try {
              this.logger.log(`Fetching group metadata for ${chatId} to resolve 406...`);
              const meta = await this.sock.groupMetadata(chatId);
              if (meta?.subject) {
                this.groupNameCache.set(chatId, meta.subject);
              }
            } catch (metaErr) {
              this.logger.warn(`Could not fetch group metadata: ${metaErr}`);
            }
          }

          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  async logout(): Promise<void> {
    this.logger.log("Logging out from WhatsApp session...");
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e: any) {
        this.logger.warn(`Error during socket logout: ${e.message}`);
      }
      try {
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }

    const authDir = this.configService.get<string>("baileysAuthDir", "./data/baileys_auth");
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
        this.logger.log(`Auth directory removed at ${authDir}`);
      } catch (e: any) {
        this.logger.warn(`Error removing auth dir: ${e.message}`);
      }
    }

    this.connectionState = "connecting";
    this.currentQr = null;
    this.connectedUser = null;
    this.lastConnected = null;

    // Reconnect to generate a fresh QR
    setTimeout(() => this.connectToWhatsApp(), 1000);
  }

  getStatus(): WhatsAppStatus {
    return {
      state: this.connectionState,
      qrCode: this.currentQr,
      user: this.connectedUser,
      lastConnected: this.lastConnected,
    };
  }
}
