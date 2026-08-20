import "./style.css";

interface WhatsAppStatus {
  state: "connecting" | "open" | "close" | "qr_ready";
  qrCode: string | null;
  user: { id?: string; name?: string } | null;
  lastConnected: string | null;
}

interface SettingsRecord {
  llm_api_key: string | null;
  mem0_api_key: string | null;
  system_prompt: string;
  trigger_key: string;
  is_active_globally: number;
  cache_ttl_mins: number;
  trigger_length_threshold: number;
  frustration_keywords: string;
  mem0_top_k: number;
  mem0_threshold: number;
  mem0_rerank: number;
  mem0_latest_only: number;
  short_term_msg_limit: number;
}

interface ChatRecord {
  id: string;
  name: string;
  is_active: number;
  allow_mentions: number;
  custom_trigger: string | null;
  custom_prompt: string | null;
  updated_at: string;
}

interface MessageRecord {
  id: number;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  source: "human" | "bot";
  timestamp: number;
}

interface BotInvocationRecord {
  id: number;
  chat_id: string;
  sender_id: string;
  trigger_text: string;
  system_prompt: string;
  context_messages: string;
  mem0_facts: string;
  model_used: string;
  response_text: string;
  latency_ms: number;
  timestamp: string;
}

const API_BASE =
  window.location.port === "5173" || window.location.port === "8080"
    ? "http://localhost:3000/api"
    : "/api";

class AdminApp {
  private activeTab: "dashboard" | "config" | "logs" = "dashboard";
  private settings: SettingsRecord | null = null;
  private chats: ChatRecord[] = [];
  private invocations: BotInvocationRecord[] = [];
  private waStatus: WhatsAppStatus | null = null;

  private selectedChatForHistory: ChatRecord | null = null;
  private selectedChatForPrompt: ChatRecord | null = null;
  private selectedInvocation: BotInvocationRecord | null = null;

  async init() {
    this.render();
    await this.fetchData();
    // Poll status every 4 seconds
    setInterval(() => this.fetchStatusOnly(), 4000);
  }

  async fetchData() {
    try {
      const [statusRes, settingsRes, chatsRes] = await Promise.all([
        fetch(`${API_BASE}/status`).then((r) => r.json()),
        fetch(`${API_BASE}/settings`).then((r) => r.json()),
        fetch(`${API_BASE}/chats`).then((r) => r.json()),
      ]);

      this.waStatus = statusRes.whatsapp;
      this.settings = settingsRes;
      this.chats = chatsRes;

      if (this.activeTab === "logs") {
        await this.fetchInvocations();
      }

      this.render();
    } catch (err) {
      console.error("Failed to fetch data from backend:", err);
    }
  }

  async fetchInvocations() {
    try {
      const res = await fetch(`${API_BASE}/invocations?limit=100`);
      if (res.ok) {
        this.invocations = await res.json();
      }
    } catch (err) {
      console.error("Failed to fetch invocations:", err);
    }
  }

  async fetchStatusOnly() {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        const prevQr = this.waStatus?.qrCode;
        const prevState = this.waStatus?.state;
        this.waStatus = data.whatsapp;

        if (prevQr !== this.waStatus?.qrCode || prevState !== this.waStatus?.state) {
          this.render();
        }
      }
    } catch {
      // Ignored
    }
  }

  showToast(message: string) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  async saveSettings(data: Partial<SettingsRecord>) {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        this.showToast("✅ Settings updated successfully!");
        await this.fetchData();
      }
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    }
  }

  async toggleChat(chatId: string, isActive: boolean) {
    try {
      await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      this.showToast(`Chat ${isActive ? "enabled" : "disabled"}`);
      await this.fetchData();
    } catch (err: any) {
      alert(`Error toggling chat: ${err.message}`);
    }
  }

  async toggleMentions(chatId: string, allowMentions: boolean) {
    try {
      await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/mentions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_mentions: allowMentions }),
      });
      this.showToast(`Mentions ${allowMentions ? "enabled" : "disabled"}`);
      await this.fetchData();
    } catch (err: any) {
      alert(`Error updating mentions: ${err.message}`);
    }
  }

  async saveChatPrompt(chatId: string, customPrompt: string | null) {
    try {
      await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_prompt: customPrompt || null }),
      });
      this.showToast("Chat prompt updated");
      this.selectedChatForPrompt = null;
      await this.fetchData();
    } catch (err: any) {
      alert(`Error saving prompt: ${err.message}`);
    }
  }

  async saveChatTrigger(chatId: string, customTrigger: string | null) {
    try {
      await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_trigger: customTrigger || null }),
      });
      this.showToast("Custom trigger updated");
      await this.fetchData();
    } catch (err: any) {
      alert(`Error saving trigger: ${err.message}`);
    }
  }

  async logoutWhatsApp() {
    if (!confirm("Are you sure you want to log out of WhatsApp? This will clear the session and generate a new QR code.")) {
      return;
    }
    try {
      await fetch(`${API_BASE}/logout`, { method: "POST" });
      this.showToast("Logged out. Waiting for new QR code...");
      await this.fetchData();
    } catch (err: any) {
      alert(`Logout error: ${err.message}`);
    }
  }

  async openHistoryModal(chat: ChatRecord) {
    this.selectedChatForHistory = chat;
    this.render();
    const modalBody = document.getElementById("history-modal-body");
    if (modalBody) {
      modalBody.innerHTML = '<p class="text-secondary">Loading message history...</p>';
      try {
        const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(chat.id)}?limit=50`);
        const messages: MessageRecord[] = await res.json();

        if (messages.length === 0) {
          modalBody.innerHTML =
            '<p class="text-secondary">No message history recorded yet for this chat.</p>';
          return;
        }

        modalBody.innerHTML = messages
          .map((m) => {
            const time = new Date(m.timestamp).toLocaleTimeString();
            const isBot = m.source === "bot";
            return `
              <div class="chat-bubble ${isBot ? "chat-bubble-bot" : "chat-bubble-user"}">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                  <strong>${m.sender_name || (isBot ? "AI Assistant" : "User")}</strong> • ${time}
                </div>
                <div>${escapeHtml(m.content)}</div>
              </div>
            `;
          })
          .join("");
      } catch (err: any) {
        modalBody.innerHTML = `<p style="color: var(--accent-danger)">Error loading history: ${err.message}</p>`;
      }
    }
  }

  render() {
    const app = document.getElementById("app");
    if (!app) return;

    let waBadge =
      '<span class="status-pill status-connecting"><span class="status-dot"></span> Connecting...</span>';
    if (this.waStatus?.state === "open") {
      waBadge = `<span class="status-pill status-connected"><span class="status-dot"></span> Connected (${this.waStatus.user?.name || this.waStatus.user?.id || "Active"})</span>`;
    } else if (this.waStatus?.state === "qr_ready") {
      waBadge =
        '<span class="status-pill status-connecting"><span class="status-dot"></span> Scan QR Code</span>';
    } else if (this.waStatus?.state === "close") {
      waBadge =
        '<span class="status-pill status-disconnected"><span class="status-dot"></span> Disconnected</span>';
    }

    app.innerHTML = `
      <div class="app-container">
        <header class="header">
          <div class="brand">
            <div class="brand-icon">🤖</div>
            <div>
              <h1 class="brand-title">GroupChatBot Admin</h1>
              <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;">
                <span class="brand-badge">NestJS + Baileys v7</span>
                <span class="brand-badge">Mem0 + SQLite Hybrid Memory</span>
              </div>
            </div>
          </div>
          <div>${waBadge}</div>
        </header>

        <!-- Navigation Tabs -->
        <nav class="nav-tabs">
          <button class="nav-tab ${this.activeTab === "dashboard" ? "active" : ""}" data-tab="dashboard">
            📊 Dashboard & Chats
          </button>
          <button class="nav-tab ${this.activeTab === "config" ? "active" : ""}" data-tab="config">
            ⚙️ Configuration & APIs
          </button>
          <button class="nav-tab ${this.activeTab === "logs" ? "active" : ""}" data-tab="logs">
            📜 Observability Logs
          </button>
        </nav>

        <main>
          ${this.activeTab === "dashboard" ? this.renderDashboardTab() : ""}
          ${this.activeTab === "config" ? this.renderConfigTab() : ""}
          ${this.activeTab === "logs" ? this.renderLogsTab() : ""}
        </main>
      </div>

      <!-- History Modal -->
      ${
        this.selectedChatForHistory
          ? `
        <div class="modal-overlay" id="history-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3 style="font-size: 1.1rem; font-weight: 600;">📜 Last ${this.settings?.short_term_msg_limit ?? 50} Messages: ${escapeHtml(this.selectedChatForHistory.name || this.selectedChatForHistory.id)}</h3>
              <button class="btn btn-secondary btn-sm" id="close-history-modal">✕</button>
            </div>
            <div class="modal-body" id="history-modal-body"></div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Custom Prompt Modal -->
      ${
        this.selectedChatForPrompt
          ? `
        <div class="modal-overlay" id="prompt-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3 style="font-size: 1.1rem; font-weight: 600;">✏️ Custom Chat Prompt: ${escapeHtml(this.selectedChatForPrompt.name || this.selectedChatForPrompt.id)}</h3>
              <button class="btn btn-secondary btn-sm" id="close-prompt-modal">✕</button>
            </div>
            <div class="modal-body">
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
                Add specific persona rules or instructions for this chat (appends to global prompt).
              </p>
              <textarea class="form-textarea" id="chat-custom-prompt" rows="6" placeholder="e.g. In this chat, reply concisely and focus on tech topics...">${this.selectedChatForPrompt.custom_prompt || ""}</textarea>
              <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                <button class="btn btn-secondary" id="clear-chat-prompt">Reset to Default</button>
                <button class="btn btn-primary" id="save-chat-prompt">Save Prompt</button>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Invocation Details Modal -->
      ${
        this.selectedInvocation
          ? `
        <div class="modal-overlay" id="invocation-modal">
          <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
              <h3 style="font-size: 1.1rem; font-weight: 600;">🔍 Invocation Details (#${this.selectedInvocation.id})</h3>
              <button class="btn btn-secondary btn-sm" id="close-invocation-modal">✕</button>
            </div>
            <div class="modal-body">
              <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                <span class="badge badge-model">Model: ${escapeHtml(this.selectedInvocation.model_used)}</span>
                <span class="badge badge-group">Latency: ${this.selectedInvocation.latency_ms}ms</span>
                <span class="badge badge-dm">${new Date(this.selectedInvocation.timestamp).toLocaleString()}</span>
              </div>

              <div class="form-group">
                <label class="form-label">🎯 Trigger Message</label>
                <div class="code-box">${escapeHtml(this.selectedInvocation.trigger_text)}</div>
              </div>

              <div class="form-group">
                <label class="form-label">🤖 Generated Response</label>
                <div class="code-box" style="border-color: rgba(99, 102, 241, 0.4);">${escapeHtml(this.selectedInvocation.response_text)}</div>
              </div>

              <div class="form-group">
                <label class="form-label">🧠 Injected Mem0 Long-Term Facts</label>
                <div class="code-box">${escapeHtml(this.selectedInvocation.mem0_facts || "[]")}</div>
              </div>

              <div class="form-group">
                <label class="form-label">⚙️ System Prompt Used</label>
                <div class="code-box">${escapeHtml(this.selectedInvocation.system_prompt)}</div>
              </div>

              <div class="form-group">
                <label class="form-label">💬 Short-Term Context</label>
                <div class="code-box">${escapeHtml(this.selectedInvocation.context_messages)}</div>
              </div>

              <div class="form-group">
                <label class="form-label">🔥 Final LLM Payload (As sent to LangChain)</label>
                <div class="code-box" style="white-space: pre-wrap; font-family: monospace; background: rgba(0, 0, 0, 0.2); color: #e2e8f0; font-size: 0.8rem;">${this.buildFinalLLMPayload(this.selectedInvocation)}</div>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }
    `;

    this.attachEvents();
  }

  buildFinalLLMPayload(inv: any): string {
    let output = "";
    
    // 1. System Prompt construction
    let finalSystem = inv.system_prompt || "";
    let facts: string[] = [];
    try {
      facts = JSON.parse(inv.mem0_facts || "[]");
    } catch (e) {}

    if (facts && facts.length > 0) {
      finalSystem += "\n\n[Known Memory & Facts about Chat Participants]:\n" + facts.map((f: string) => `- ${f}`).join("\n");
    }
    
    finalSystem += "\n\nInstructions:\n- You are participating in a group or direct chat.\n- Always be aware of who is speaking based on the prefix 'Name: Message'.\n- Address members naturally by name when appropriate.\n- Keep your tone conversational, concise, and engaging unless requested otherwise.";
    
    output += `[SYSTEM MESSAGE]\n${finalSystem}\n\n`;
    
    // 2. Short term context
    let context: any[] = [];
    try {
      context = JSON.parse(inv.context_messages || "[]");
    } catch (e) {}

    for (const msg of context) {
      if (msg.role === "assistant") {
        output += `[ASSISTANT]\n${msg.content}\n\n`;
      } else {
        const nameLabel = msg.name ? `${msg.name}: ` : "Member: ";
        output += `[USER]\n${nameLabel}${msg.content}\n\n`;
      }
    }

    return escapeHtml(output.trim());
  }

  renderDashboardTab(): string {
    return `
      <div class="dashboard-grid">
        <!-- Left Column: WhatsApp Status -->
        <div class="col-4">
          <div class="card" style="margin-bottom: 1.5rem;">
            <div class="card-header">
              <h2 class="card-title">📱 WhatsApp Connection</h2>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
              Powered by Baileys WebSockets.
            </p>

            ${
              this.waStatus?.state === "qr_ready" && this.waStatus.qrCode
                ? `
              <div class="qr-container">
                <p style="font-weight: 600; margin-bottom: 0.75rem;">Scan with Personal WhatsApp</p>
                <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.waStatus.qrCode)}" alt="WhatsApp QR Code" />
                <p style="font-size: 0.8rem; color: var(--text-muted);">
                  WhatsApp &gt; Linked Devices &gt; Link a Device
                </p>
              </div>
            `
                : this.waStatus?.state === "open"
                  ? `
              <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1rem;">
                <div style="font-weight: 600; color: #34d399;">✅ Connected & Active</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                  Account: ${this.waStatus.user?.name || this.waStatus.user?.id || "Connected"}
                </div>
              </div>
              <button id="logout-btn" class="btn btn-danger btn-sm" style="width: 100%;">
                🔴 Log Out WhatsApp
              </button>
            `
                  : `
              <div style="color: var(--text-muted); font-size: 0.9rem;">
                Waiting for WhatsApp connection state...
              </div>
            `
            }
          </div>

          <!-- Quick Stats -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">📊 Quick Summary</h2>
            </div>
            <ul style="list-style: none; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.75rem;">
              <li style="display: flex; justify-content: space-between;">
                <span>Total Discovered Chats:</span>
                <strong>${this.chats.length}</strong>
              </li>
              <li style="display: flex; justify-content: space-between;">
                <span>Active Bot Chats:</span>
                <strong style="color: #34d399;">${this.chats.filter((c) => c.is_active === 1).length}</strong>
              </li>
              <li style="display: flex; justify-content: space-between;">
                <span>Global Bot Status:</span>
                <strong>${this.settings?.is_active_globally ? "🟢 Enabled" : "🔴 Disabled"}</strong>
              </li>
            </ul>
          </div>
        </div>

        <!-- Right Column: Discovered Chats Table -->
        <div class="col-8">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">👥 Discovered Chats & Groups (${this.chats.length})</h2>
              <button id="refresh-chats" class="btn btn-secondary btn-sm">Refresh</button>
            </div>

            ${
              this.chats.length === 0
                ? `
              <p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem 0;">
                No chats discovered yet. Send a message in any WhatsApp group or DM with the bot to see it appear here!
              </p>
            `
                : `
              <div class="table-container">
                <table class="custom-table">
                  <thead>
                    <tr>
                      <th>Chat Name & ID</th>
                      <th>Type</th>
                      <th>Bot Active</th>
                      <th>Mentions</th>
                      <th>Trigger</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.chats
                      .map((c) => {
                        const isGroup = c.id.endsWith("@g.us");
                        return `
                      <tr>
                        <td>
                          <div style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(c.name || c.id)}</div>
                          <div class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${c.id}</div>
                        </td>
                        <td>
                          <span class="badge ${isGroup ? "badge-group" : "badge-dm"}">
                            ${isGroup ? "Group" : "1-on-1"}
                          </span>
                        </td>
                        <td>
                          <label class="switch">
                            <input type="checkbox" data-chat-toggle="${c.id}" ${c.is_active ? "checked" : ""}>
                            <span class="slider"></span>
                          </label>
                        </td>
                        <td>
                          <label class="switch" title="Allow @mention trigger">
                            <input type="checkbox" data-mention-toggle="${c.id}" ${c.allow_mentions ? "checked" : ""}>
                            <span class="slider"></span>
                          </label>
                        </td>
                        <td>
                          <input
                            type="text"
                            class="form-input mono"
                            style="padding: 0.25rem 0.5rem; font-size: 0.8rem; width: 80px;"
                            placeholder="${this.settings?.trigger_key || "!bot"}"
                            value="${c.custom_trigger || ""}"
                            data-chat-trigger="${c.id}"
                          />
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.4rem;">
                            <button class="btn btn-secondary btn-sm" data-edit-prompt="${c.id}">Prompt</button>
                            <button class="btn btn-secondary btn-sm" data-view-history="${c.id}">History</button>
                          </div>
                        </td>
                      </tr>
                    `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;
  }

  renderConfigTab(): string {
    return `
      <div class="dashboard-grid">
        <div class="col-8">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">⚙️ API & System Prompt Configuration</h2>
              <label class="switch" title="Global Bot Active Toggle">
                <input type="checkbox" id="global-toggle" ${this.settings?.is_active_globally ? "checked" : ""}>
                <span class="slider"></span>
              </label>
            </div>

            <form id="settings-form">
              <div class="form-group">
                <label class="form-label">LLM Router API Key (Manifest / OpenAI)</label>
                <input class="form-input mono" type="password" id="llm-api-key" value="${this.settings?.llm_api_key || ""}" placeholder="sk-..." />
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
                  API key used to route inference requests via Manifest Router or OpenAI.
                </p>
              </div>

              <div class="form-group">
                <label class="form-label">Mem0 Cloud API Key</label>
                <input class="form-input mono" type="password" id="mem0-api-key" value="${this.settings?.mem0_api_key || ""}" placeholder="m0-..." />
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
                  API key for Mem0 persistent long-term memory extraction and retrieval.
                </p>
              </div>

              <div class="form-group">
                <label class="form-label">Default Global Trigger Key</label>
                <input class="form-input mono" type="text" id="trigger-key" value="${this.settings?.trigger_key || "!bot"}" placeholder="!bot" />
              </div>

              <div class="form-group">
                <label class="form-label">Global System Prompt & Persona</label>
                <textarea class="form-textarea" id="system-prompt" rows="5">${this.settings?.system_prompt || ""}</textarea>
              </div>

              <div style="border-top: 1px solid var(--border-color); padding-top: 1.25rem; margin-top: 1.5rem;">
                <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem;">⚡ Smart Cache & Quota Limits</h3>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                  <div class="form-group">
                    <label class="form-label">Cache TTL (Minutes)</label>
                    <input class="form-input mono" type="number" id="cache-ttl" value="${this.settings?.cache_ttl_mins || 60}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Trigger Length Threshold (Chars)</label>
                    <input class="form-input mono" type="number" id="length-threshold" value="${this.settings?.trigger_length_threshold || 80}" />
                  </div>
                </div>
                
                <div class="form-group" style="margin-top: 1rem;">
                  <label class="form-label">Short-Term Context Limit</label>
                  <input class="form-input mono" type="number" id="short-term-limit" value="${this.settings?.short_term_msg_limit ?? 50}" />
                  <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Number of recent messages from SQLite to send as immediate context to the LLM.</p>
                </div>

                <div style="border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 1.25rem; margin-top: 1.25rem;">
                  <h3 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; color: #a78bfa;">🧠 Mem0 Retrieval Tuning</h3>
                  
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                      <label class="form-label">Number of Results (Top K)</label>
                      <input class="form-input mono" type="number" id="mem0-top-k" value="${this.settings?.mem0_top_k ?? 10}" />
                      <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">How many memories to return at most.</p>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Relevance Threshold</label>
                      <input class="form-input mono" type="number" step="0.01" min="0" max="1" id="mem0-threshold" value="${this.settings?.mem0_threshold ?? 0.3}" />
                      <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">How close a match has to be to count (0.00 to 1.00).</p>
                    </div>
                  </div>
                  
                  <div style="display: flex; gap: 2rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
                      <input type="checkbox" id="mem0-rerank" ${this.settings?.mem0_rerank ? "checked" : ""}>
                      <span><strong>Rerank:</strong> Extra pass that reorders top matches. Slower but more accurate.</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
                      <input type="checkbox" id="mem0-latest-only" ${this.settings?.mem0_latest_only ? "checked" : ""}>
                      <span><strong>Latest Only:</strong> Only current version of each memory.</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Frustration / Cache-Bust Keywords (Comma-separated)</label>
                  <input class="form-input" type="text" id="frustration-keywords" value="${escapeHtml(this.settings?.frustration_keywords || "wrong,forget,bad,stupid,old context,ignore,update,actually,fuck you,wtf,remember,don't you,dont you,what,idiot,incorrect,not true,false,lies,mistake,changed,recall,remind,earlier,before,previously,did i tell,do you know,who said,refresh,new info")}" />
                  <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
                    When any of these keywords appear in a trigger message, the local cache will be bypassed to fetch fresh context from Mem0.
                  </p>
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
                <button type="submit" class="btn btn-primary">Save All Configuration</button>
              </div>
            </form>
          </div>
        </div>

        <div class="col-4">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">💡 How Caching Works</h2>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
              To protect your <strong>1,000 Mem0 retrieval limit</strong> on the free tier:
            </p>
            <ul style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.75rem; padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;">
              <li>Organic messages are stored in SQLite and only uploaded in bulk right before a bot trigger.</li>
              <li>Mem0 facts are cached locally for ${this.settings?.cache_ttl_mins || 60} minutes.</li>
              <li>The cache is automatically bypassed if a message is &gt; ${this.settings?.trigger_length_threshold || 80} chars, mentions another user, or contains correction keywords.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  renderLogsTab(): string {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">📜 Bot Invocations Observability (${this.invocations.length})</h2>
          <button id="refresh-invocations" class="btn btn-secondary btn-sm">Refresh Logs</button>
        </div>

        ${
          this.invocations.length === 0
            ? `
          <p style="color: var(--text-muted); font-size: 0.9rem; padding: 1.5rem 0; text-align: center;">
            No bot invocations recorded yet. Trigger the bot in any chat to view full observability telemetry!
          </p>
        `
            : `
          <div class="table-container">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Chat</th>
                  <th>Trigger Message</th>
                  <th>Model Used</th>
                  <th>Latency</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                ${this.invocations
                  .map(
                    (inv) => `
                  <tr>
                    <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                      ${new Date(inv.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <div class="mono" style="font-size: 0.8rem;">${inv.chat_id.split("@")[0]}</div>
                    </td>
                    <td>
                      <div style="font-weight: 500; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(inv.trigger_text)}
                      </div>
                    </td>
                    <td>
                      <span class="badge badge-model">${escapeHtml(inv.model_used)}</span>
                    </td>
                    <td class="mono" style="font-size: 0.85rem; color: ${inv.latency_ms > 3000 ? "#fbbf24" : "#34d399"};">
                      ${inv.latency_ms}ms
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm" data-inspect-invocation="${inv.id}">
                        🔍 View Context
                      </button>
                    </td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        }
      </div>
    `;
  }

  attachEvents() {
    // Navigation Tabs
    document.querySelectorAll("[data-tab]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute("data-tab") as any;
        if (tab) {
          this.activeTab = tab;
          if (tab === "logs") {
            void this.fetchInvocations().then(() => this.render());
          } else {
            this.render();
          }
        }
      });
    });

    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        void this.logoutWhatsApp();
      });
    }

    // Refresh chats
    const refreshChats = document.getElementById("refresh-chats");
    if (refreshChats) {
      refreshChats.addEventListener("click", () => {
        void this.fetchData();
      });
    }

    // Refresh invocations
    const refreshInvocations = document.getElementById("refresh-invocations");
    if (refreshInvocations) {
      refreshInvocations.addEventListener("click", () => {
        void this.fetchInvocations().then(() => this.render());
      });
    }

    // Settings form
    const settingsForm = document.getElementById("settings-form");
    if (settingsForm) {
      settingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const llm_api_key =
          (document.getElementById("llm-api-key") as HTMLInputElement)?.value || null;
        const mem0_api_key =
          (document.getElementById("mem0-api-key") as HTMLInputElement)?.value || null;
        const trigger_key =
          (document.getElementById("trigger-key") as HTMLInputElement)?.value || "!bot";
        const system_prompt =
          (document.getElementById("system-prompt") as HTMLTextAreaElement)?.value || "";
        const is_active_globally = (
          document.getElementById("global-toggle") as HTMLInputElement
        )?.checked
          ? 1
          : 0;
        const cache_ttl_mins =
          parseInt((document.getElementById("cache-ttl") as HTMLInputElement)?.value, 10) || 60;
        const trigger_length_threshold =
          parseInt((document.getElementById("length-threshold") as HTMLInputElement)?.value, 10) ||
          80;
        const frustration_keywords =
          (document.getElementById("frustration-keywords") as HTMLInputElement)?.value || "";

        const mem0_top_k =
          parseInt((document.getElementById("mem0-top-k") as HTMLInputElement)?.value, 10) || 10;
        const mem0_threshold =
          parseFloat((document.getElementById("mem0-threshold") as HTMLInputElement)?.value) ?? 0.3;
        const mem0_rerank = (document.getElementById("mem0-rerank") as HTMLInputElement)?.checked
          ? 1
          : 0;
        const mem0_latest_only = (document.getElementById("mem0-latest-only") as HTMLInputElement)?.checked
          ? 1
          : 0;
        const short_term_msg_limit =
          parseInt((document.getElementById("short-term-limit") as HTMLInputElement)?.value, 10) || 50;

        void this.saveSettings({
          llm_api_key,
          mem0_api_key,
          trigger_key,
          system_prompt,
          is_active_globally,
          cache_ttl_mins,
          trigger_length_threshold,
          frustration_keywords,
          mem0_top_k,
          mem0_threshold,
          mem0_rerank,
          mem0_latest_only,
          short_term_msg_limit,
        });
      });
    }

    // Global toggle switch in config tab
    const globalToggle = document.getElementById("global-toggle");
    if (globalToggle) {
      globalToggle.addEventListener("change", (e) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        void this.saveSettings({ is_active_globally: isChecked ? 1 : 0 });
      });
    }

    // Chat toggles
    document.querySelectorAll("[data-chat-toggle]").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const chatId = target.getAttribute("data-chat-toggle");
        if (chatId) {
          void this.toggleChat(chatId, target.checked);
        }
      });
    });

    // Mention toggles
    document.querySelectorAll("[data-mention-toggle]").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const chatId = target.getAttribute("data-mention-toggle");
        if (chatId) {
          void this.toggleMentions(chatId, target.checked);
        }
      });
    });

    // Custom trigger inputs
    document.querySelectorAll("[data-chat-trigger]").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const chatId = target.getAttribute("data-chat-trigger");
        if (chatId) {
          void this.saveChatTrigger(chatId, target.value.trim() || null);
        }
      });
    });

    // Edit prompt buttons
    document.querySelectorAll("[data-edit-prompt]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const chatId = (e.currentTarget as HTMLElement).getAttribute("data-edit-prompt");
        const chat = this.chats.find((c) => c.id === chatId);
        if (chat) {
          this.selectedChatForPrompt = chat;
          this.render();
        }
      });
    });

    // View history buttons
    document.querySelectorAll("[data-view-history]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const chatId = (e.currentTarget as HTMLElement).getAttribute("data-view-history");
        const chat = this.chats.find((c) => c.id === chatId);
        if (chat) {
          void this.openHistoryModal(chat);
        }
      });
    });

    // Inspect invocation buttons
    document.querySelectorAll("[data-inspect-invocation]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const id = parseInt(
          (e.currentTarget as HTMLElement).getAttribute("data-inspect-invocation") || "0",
          10,
        );
        const inv = this.invocations.find((i) => i.id === id);
        if (inv) {
          this.selectedInvocation = inv;
          this.render();
        }
      });
    });

    // Close modals
    const closeHistory = document.getElementById("close-history-modal");
    if (closeHistory) {
      closeHistory.addEventListener("click", () => {
        this.selectedChatForHistory = null;
        this.render();
      });
    }

    const closePrompt = document.getElementById("close-prompt-modal");
    if (closePrompt) {
      closePrompt.addEventListener("click", () => {
        this.selectedChatForPrompt = null;
        this.render();
      });
    }

    const closeInvocation = document.getElementById("close-invocation-modal");
    if (closeInvocation) {
      closeInvocation.addEventListener("click", () => {
        this.selectedInvocation = null;
        this.render();
      });
    }

    const savePromptBtn = document.getElementById("save-chat-prompt");
    if (savePromptBtn && this.selectedChatForPrompt) {
      savePromptBtn.addEventListener("click", () => {
        const prompt = (document.getElementById("chat-custom-prompt") as HTMLTextAreaElement)
          ?.value;
        void this.saveChatPrompt(this.selectedChatForPrompt!.id, prompt);
      });
    }

    const clearPromptBtn = document.getElementById("clear-chat-prompt");
    if (clearPromptBtn && this.selectedChatForPrompt) {
      clearPromptBtn.addEventListener("click", () => {
        void this.saveChatPrompt(this.selectedChatForPrompt!.id, null);
      });
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const app = new AdminApp();
void app.init();
