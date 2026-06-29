import { Plugin, WorkspaceLeaf } from "obsidian";
import { DashboardView, VIEW_TYPE } from "./view";
import "./styles.css";

// ── Plugin Settings ────────────────────────────────────────
export interface ThirdSpaceSettings {
  acaiBaseUrl: string;
  acaiApiToken: string;
  // Comma-separated product names; implementations are auto-discovered
  acaiProducts: string;
}

const DEFAULT_SETTINGS: ThirdSpaceSettings = {
  acaiBaseUrl: "http://localhost:4000",
  acaiApiToken: "",
  acaiProducts: "",
};

/** Parse comma-separated product names */
export function parseProductNames(raw: string): string[] {
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export default class ThirdSpaceDashboard extends Plugin {
  settings: ThirdSpaceSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "ThirdSpace Dashboard", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-dashboard",
      name: "Open ThirdSpace Dashboard",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new ThirdSpaceSettingTab(this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);

    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }
}

// ── Settings Tab ───────────────────────────────────────────
import { App, PluginSettingTab, Setting } from "obsidian";

class ThirdSpaceSettingTab extends PluginSettingTab {
  plugin: ThirdSpaceDashboard;

  constructor(plugin: ThirdSpaceDashboard) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "ThirdSpace Dashboard Settings" });

    new Setting(containerEl)
      .setName("Acai Server URL")
      .setDesc("Base URL of your self-hosted Acai server")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:4000")
          .setValue(this.plugin.settings.acaiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.acaiBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Acai API Token")
      .setDesc("Bearer token for the Acai API (team-scoped)")
      .addText((text) =>
        text
          .setPlaceholder("at_xxxxx...")
          .setValue(this.plugin.settings.acaiApiToken)
          .onChange(async (value) => {
            this.plugin.settings.acaiApiToken = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Products to Track")
      .setDesc(
        "Comma-separated product names. All implementations (branches/envs) for each product are auto-discovered and shown.\n\n" +
        "Example: site, api, my-cli"
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("site, api")
          .setValue(this.plugin.settings.acaiProducts)
          .onChange(async (value) => {
            this.plugin.settings.acaiProducts = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
