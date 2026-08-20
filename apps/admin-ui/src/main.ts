import "./style.css";

interface WhatsAppStatus {
  state: "connecting" | "open" | "close" | "qr_ready";
  qrCode: string | null;
  user: { id?: string; name?: string } | null;
  lastConnected: string | null;
}

interface BotConfig {
  system_prompt: string;
  trigger_key: string;
  is_active_globally: number;
}

interface GroupRecord {
  id: string;
  name: string;
  is_active: number;
  custom_prompt: string | null;
  updated_at: string;
}

interface MessageRecord {
  id: number;
  group_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_from_bot: number;
  timestamp: number;
}

const API_BASE =
  window.location.port === "5173" || window.location.port === "8080"
    ? "http://localhost:3000/api"
    : "/api";

class AdminApp {
  private config: BotConfig | null = null;
  private groups: GroupRecord[] = [];
  private waStatus: WhatsAppStatus | null = null;
  private selectedGroupForHistory: GroupRecord | null = null;
  private selectedGroupForPrompt: GroupRecord | null = null;

  async init() {
    this.render();
    await this.fetchData();
    // Poll status every 4 seconds for live QR code / connection updates
    setInterval(() => this.fetchStatusOnly(), 4000);
  }

  async fetchData() {
    try {
      const [statusRes, configRes, groupsRes] = await Promise.all([
        fetch(`${API_BASE}/status`).then((r) => r.json()),
        fetch(`${API_BASE}/config`).then((r) => r.json()),
        fetch(`${API_BASE}/groups`).then((r) => r.json()),
      ]);

      this.waStatus = statusRes.whatsapp;
      this.config = configRes;
      this.groups = groupsRes;
      this.render();
    } catch (err) {
      console.error("Failed to fetch data from backend:", err);
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

  async saveConfig(prompt: string, triggerKey: string, isActiveGlobally: number) {
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: prompt,
          trigger_key: triggerKey,
          is_active_globally: isActiveGlobally,
        }),
      });
      if (res.ok) {
        this.showToast("✅ Configuration saved successfully!");
        await this.fetchData();
      }
    } catch (err: any) {
      alert(`Failed to save config: ${err.message}`);
    }
  }

  async toggleGroup(groupId: string, isActive: boolean) {
    try {
      await fetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      this.showToast(`Group ${isActive ? "enabled" : "disabled"}`);
      await this.fetchData();
    } catch (err: any) {
      alert(`Error toggling group: ${err.message}`);
    }
  }

  async saveGroupPrompt(groupId: string, customPrompt: string | null) {
    try {
      await fetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_prompt: customPrompt || null }),
      });
      this.showToast("Group custom prompt updated");
      this.selectedGroupForPrompt = null;
      await this.fetchData();
    } catch (err: any) {
      alert(`Error saving prompt: ${err.message}`);
    }
  }

  async openHistoryModal(group: GroupRecord) {
    this.selectedGroupForHistory = group;
    this.render();
    const modalBody = document.getElementById("history-modal-body");
    if (modalBody) {
      modalBody.innerHTML = '<p class="text-secondary">Loading message history...</p>';
      try {
        const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(group.id)}?limit=50`);
        const messages: MessageRecord[] = await res.json();

        if (messages.length === 0) {
          modalBody.innerHTML =
            '<p class="text-secondary">No message history recorded yet for this group.</p>';
          return;
        }

        modalBody.innerHTML = messages
          .map((m) => {
            const time = new Date(m.timestamp).toLocaleTimeString();
            return `
              <div class="chat-bubble ${m.is_from_bot ? "chat-bubble-bot" : "chat-bubble-user"}">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                  <strong>${m.sender_name || "User"}</strong> • ${time}
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
              <h1 class="brand-title">GroupChatBot</h1>
              <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;">
                <span class="brand-badge">Vite+ NestJS Monorepo</span>
                <span class="brand-badge">Mem0 + SQLite Memory</span>
              </div>
            </div>
          </div>
          <div>${waBadge}</div>
        </header>

        <main class="dashboard-grid">
          <!-- Left Column: WhatsApp Status & Memory Settings -->
          <div class="col-4">
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <h2 class="card-title">📱 WhatsApp Connection</h2>
              </div>
              <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
                Powered by Baileys WebSockets (No headless browser required).
              </p>

              ${
                this.waStatus?.state === "qr_ready" && this.waStatus.qrCode
                  ? `
                <div class="qr-container">
                  <p style="font-weight: 600; margin-bottom: 0.75rem;">Scan with Personal WhatsApp</p>
                  <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.waStatus.qrCode)}" alt="WhatsApp QR Code" />
                  <p style="font-size: 0.8rem; color: var(--text-muted);">
                    Open WhatsApp &gt; Linked Devices &gt; Link a Device
                  </p>
                </div>
              `
                  : this.waStatus?.state === "open"
                    ? `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem; border-radius: var(--radius-sm);">
                  <div style="font-weight: 600; color: #34d399;">✅ Socket Active</div>
                  <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                    Account: ${this.waStatus.user?.name || this.waStatus.user?.id || "Connected"}
                  </div>
                </div>
              `
                    : `
                <div style="color: var(--text-muted); font-size: 0.9rem;">
                  Waiting for WhatsApp connection state...
                </div>
              `
              }
            </div>

            <!-- Architecture Info -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">🧠 Memory Architecture</h2>
              </div>
              <ul style="list-style: none; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.75rem;">
                <li style="display: flex; gap: 0.5rem;">
                  <span>⚡</span>
                  <div><strong>Short-Term:</strong> SQLite stores exact 50-message context per group.</div>
                </li>
                <li style="display: flex; gap: 0.5rem;">
                  <span>🌐</span>
                  <div><strong>Long-Term:</strong> Mem0 Cloud extracts and stores entity/user facts.</div>
                </li>
                <li style="display: flex; gap: 0.5rem;">
                  <span>🔀</span>
                  <div><strong>LLM Gateway:</strong> Manifest single API router with automatic fallbacks.</div>
                </li>
              </ul>
            </div>
          </div>

          <!-- Right Column: Bot Configuration & Group Manager -->
          <div class="col-8">
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <h2 class="card-title">⚙️ Global Bot Configuration</h2>
                <label class="switch" title="Global Bot Toggle">
                  <input type="checkbox" id="global-toggle" ${this.config?.is_active_globally ? "checked" : ""}>
                  <span class="slider"></span>
                </label>
              </div>

              <form id="config-form">
                <div class="form-group">
                  <label class="form-label">Trigger Key / Prefix</label>
                  <input class="form-input mono" type="text" id="trigger-key" value="${this.config?.trigger_key || "!bot"}" placeholder="!bot" />
                  <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
                    The bot will respond when a message starts with this trigger or mentions @bot.
                  </p>
                </div>

                <div class="form-group">
                  <label class="form-label">Global System Prompt & Persona</label>
                  <textarea class="form-textarea" id="system-prompt" rows="4">${this.config?.system_prompt || ""}</textarea>
                </div>

                <div style="display: flex; justify-content: flex-end;">
                  <button type="submit" class="btn btn-primary">Save Settings</button>
                </div>
              </form>
            </div>

            <!-- Groups Table -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">👥 Discovered WhatsApp Groups (${this.groups.length})</h2>
                <button id="refresh-groups" class="btn btn-secondary btn-sm">Refresh</button>
              </div>

              ${
                this.groups.length === 0
                  ? `
                <p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem 0;">
                  No groups discovered yet. Send a message in any group with the bot added to see it appear here!
                </p>
              `
                  : `
                <div class="table-container">
                  <table class="custom-table">
                    <thead>
                      <tr>
                        <th>Group ID / Name</th>
                        <th>Status</th>
                        <th>Custom Prompt</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.groups
                        .map(
                          (g) => `
                        <tr>
                          <td>
                            <div style="font-weight: 600;">${escapeHtml(g.name || g.id)}</div>
                            <div class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${g.id}</div>
                          </td>
                          <td>
                            <label class="switch">
                              <input type="checkbox" data-group-toggle="${g.id}" ${g.is_active ? "checked" : ""}>
                              <span class="slider"></span>
                            </label>
                          </td>
                          <td>
                            ${
                              g.custom_prompt
                                ? `<span style="color: #34d399; font-size: 0.8rem;">Customized</span>`
                                : `<span style="color: var(--text-muted); font-size: 0.8rem;">Default</span>`
                            }
                          </td>
                          <td>
                            <div style="display: flex; gap: 0.5rem;">
                              <button class="btn btn-secondary btn-sm" data-edit-prompt="${g.id}">Edit Prompt</button>
                              <button class="btn btn-secondary btn-sm" data-view-history="${g.id}">History</button>
                            </div>
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
          </div>
        </main>
      </div>

      <!-- History Modal -->
      ${
        this.selectedGroupForHistory
          ? `
        <div class="modal-overlay" id="history-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3 style="font-size: 1.1rem; font-weight: 600;">📜 Last 50 Messages: ${escapeHtml(this.selectedGroupForHistory.name || this.selectedGroupForHistory.id)}</h3>
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
        this.selectedGroupForPrompt
          ? `
        <div class="modal-overlay" id="prompt-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3 style="font-size: 1.1rem; font-weight: 600;">✏️ Custom Group Prompt: ${escapeHtml(this.selectedGroupForPrompt.name || this.selectedGroupForPrompt.id)}</h3>
              <button class="btn btn-secondary btn-sm" id="close-prompt-modal">✕</button>
            </div>
            <div class="modal-body">
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
                Add specific persona rules or instructions for this group (overrides or appends to global prompt).
              </p>
              <textarea class="form-textarea" id="group-custom-prompt" rows="6" placeholder="e.g. In this group, reply in French and focus on tech topics...">${this.selectedGroupForPrompt.custom_prompt || ""}</textarea>
              <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                <button class="btn btn-secondary" id="clear-group-prompt">Reset to Default</button>
                <button class="btn btn-primary" id="save-group-prompt">Save Group Prompt</button>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }
        </main>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Config form
    const configForm = document.getElementById("config-form");
    if (configForm) {
      configForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt =
          (document.getElementById("system-prompt") as HTMLTextAreaElement)?.value || "";
        const trigger =
          (document.getElementById("trigger-key") as HTMLInputElement)?.value || "!bot";
        const isGlobal = (document.getElementById("global-toggle") as HTMLInputElement)?.checked
          ? 1
          : 0;
        void this.saveConfig(prompt, trigger, isGlobal);
      });
    }

    // Refresh groups
    const refreshBtn = document.getElementById("refresh-groups");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        void this.fetchData();
      });
    }

    // Group toggles
    document.querySelectorAll("[data-group-toggle]").forEach((el) => {
      el.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const groupId = target.getAttribute("data-group-toggle");
        if (groupId) {
          void this.toggleGroup(groupId, target.checked);
        }
      });
    });

    // Edit prompt buttons
    document.querySelectorAll("[data-edit-prompt]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const groupId = (e.currentTarget as HTMLElement).getAttribute("data-edit-prompt");
        const group = this.groups.find((g) => g.id === groupId);
        if (group) {
          this.selectedGroupForPrompt = group;
          this.render();
        }
      });
    });

    // View history buttons
    document.querySelectorAll("[data-view-history]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const groupId = (e.currentTarget as HTMLElement).getAttribute("data-view-history");
        const group = this.groups.find((g) => g.id === groupId);
        if (group) {
          void this.openHistoryModal(group);
        }
      });
    });

    // Close modals
    const closeHistory = document.getElementById("close-history-modal");
    if (closeHistory) {
      closeHistory.addEventListener("click", () => {
        this.selectedGroupForHistory = null;
        this.render();
      });
    }

    const closePrompt = document.getElementById("close-prompt-modal");
    if (closePrompt) {
      closePrompt.addEventListener("click", () => {
        this.selectedGroupForPrompt = null;
        this.render();
      });
    }

    const savePromptBtn = document.getElementById("save-group-prompt");
    if (savePromptBtn && this.selectedGroupForPrompt) {
      savePromptBtn.addEventListener("click", () => {
        const prompt = (document.getElementById("group-custom-prompt") as HTMLTextAreaElement)
          ?.value;
        void this.saveGroupPrompt(this.selectedGroupForPrompt!.id, prompt);
      });
    }

    const clearPromptBtn = document.getElementById("clear-group-prompt");
    if (clearPromptBtn && this.selectedGroupForPrompt) {
      clearPromptBtn.addEventListener("click", () => {
        void this.saveGroupPrompt(this.selectedGroupForPrompt!.id, null);
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
