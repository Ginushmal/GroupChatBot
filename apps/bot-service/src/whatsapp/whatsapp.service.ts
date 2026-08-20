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

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private sock: WASocket | null = null;
  private currentQr: string | null = null;
  private connectionState: "connecting" | "open" | "close" | "qr_ready" = "connecting";
  private connectedUser: { id?: string; name?: string } | null = null;
  private lastConnected: Date | null = null;

  private incomingMessageHandler?: (payload: any) => Promise<void>;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  setIncomingMessageHandler(handler: (payload: any) => Promise<void>) {
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
          this.logger.error("WhatsApp logged out. Please restart the app and scan a new QR code.");
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
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) continue;

        // Check if group message (remoteJid ends with @g.us)
        const isGroup = remoteJid.endsWith("@g.us");
        if (!isGroup) continue;

        const senderId = msg.key.participant || remoteJid;
        const senderName = msg.pushName || senderId.split("@")[0];

        // Extract message content
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          "";

        if (!text) continue;

        if (this.incomingMessageHandler) {
          await this.incomingMessageHandler({
            groupId: remoteJid,
            senderId,
            senderName,
            text,
            rawMessage: msg,
          });
        }
      }
    });
  }

  async sendMessage(groupId: string, text: string) {
    if (!this.sock || this.connectionState !== "open") {
      this.logger.warn(`Cannot send message to ${groupId}: WhatsApp socket is not connected.`);
      return;
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sock.sendMessage(groupId, { text });
        this.logger.log(`💬 Sent reply to group ${groupId}`);
        return;
      } catch (err: any) {
        this.logger.error(
          `Failed to send message to ${groupId} (attempt ${attempt}/${maxRetries}): ${err.message}`,
          err.data ? JSON.stringify(err.data) : "",
        );
        if (attempt < maxRetries) {
          const delay = attempt * 5000;
          this.logger.log(`⏳ Retrying in ${delay / 1000}s...`);

          // If it's a group and we get a 406 not-acceptable, force fetch group metadata
          if (groupId.endsWith("@g.us")) {
            try {
              this.logger.log(`Fetching group metadata for ${groupId} to resolve 406...`);
              await this.sock.groupMetadata(groupId);
            } catch (metaErr) {
              this.logger.warn(`Could not fetch group metadata: ${metaErr}`);
            }
          }

          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
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
