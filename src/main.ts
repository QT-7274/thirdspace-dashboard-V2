import { Plugin, WorkspaceLeaf } from "obsidian";
import { DashboardView, VIEW_TYPE } from "./view";
import { fetchAllAcaiProducts } from "./data/acai-client";
import { registerAcaiProduct } from "./data/vault-reader";
import "./styles.css";

// ── Plugin Settings ────────────────────────────────────────
export interface ThirdSpaceSettings {
  acaiBaseUrl: string;
  acaiApiToken: string;
  // Comma-separated product names; implementations are auto-discovered
  acaiProducts: string;
  acaiAvailableProducts: string[];
  acaiProductsLastSyncedAt?: number;
}

const DEFAULT_SETTINGS: ThirdSpaceSettings = {
  acaiBaseUrl: "http://localhost:4000",
  acaiApiToken: "",
  acaiProducts: "",
  acaiAvailableProducts: [],
};

/** Parse comma-separated product names */
export function parseProductNames(raw: string): string[] {
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function serializeProductNames(products: Iterable<string>): string {
  return Array.from(new Set(products))
    .sort((left, right) => left.localeCompare(right))
    .join(", ");
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
    const loaded = await this.loadData() as Partial<ThirdSpaceSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    if (!Array.isArray(this.settings.acaiAvailableProducts)) {
      this.settings.acaiAvailableProducts = [];
    }
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
import { App, Notice, PluginSettingTab, Setting } from "obsidian";

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
      .addText((text) => {
        // acai-tracker-performance.TOKEN_SECURITY.1
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text
          .setPlaceholder("at_xxxxx...")
          .setValue(this.plugin.settings.acaiApiToken)
          .onChange(async (value) => {
            this.plugin.settings.acaiApiToken = value;
            await this.plugin.saveSettings();
          });
      });

    const selectedProducts = new Set(parseProductNames(this.plugin.settings.acaiProducts));
    const availableProducts = Array.from(new Set([
      ...this.plugin.settings.acaiAvailableProducts,
      ...selectedProducts,
    ])).sort((left, right) => left.localeCompare(right));

    // dashboard-experience-refinement.ACAI_SYNC.1 dashboard-experience-refinement.ACAI_SYNC.2
    new Setting(containerEl)
      .setName("同步 ACAI 项目")
      .setDesc(this.plugin.settings.acaiProductsLastSyncedAt
        ? `上次同步：${new Date(this.plugin.settings.acaiProductsLastSyncedAt).toLocaleString()}`
        : "从 ACAI 拉取 Product，再选择需要在看板中启用的项目。")
      .addButton(button => {
        button
          .setButtonText("同步项目")
          .setDisabled(!this.plugin.settings.acaiApiToken.trim())
          .onClick(async () => {
            button.setDisabled(true).setButtonText("同步中…");
            try {
              const products = await fetchAllAcaiProducts(
                this.plugin.settings.acaiBaseUrl.replace(/\/+$/, ""),
                this.plugin.settings.acaiApiToken.trim(),
              );
              if (products.length === 0) {
                new Notice("ACAI 未返回项目，已保留上次同步列表");
                return;
              }
              this.plugin.settings.acaiAvailableProducts = products;
              this.plugin.settings.acaiProductsLastSyncedAt = Date.now();
              await this.plugin.saveSettings();
              this.display();
            } catch (err) {
              new Notice(`ACAI 项目同步失败：${err instanceof Error ? err.message : String(err)}`);
            } finally {
              button.setDisabled(false).setButtonText("同步项目");
            }
          });
      });

    if (availableProducts.length === 0) {
      containerEl.createDiv({ cls: "setting-item-description", text: "尚未同步 ACAI 项目" });
      return;
    }

    // dashboard-experience-refinement.ACAI_SYNC.3
    for (const product of availableProducts) {
      new Setting(containerEl)
        .setName(product)
        .setDesc(selectedProducts.has(product) ? "已启用并登记为正式项目" : "未启用")
        .addToggle(toggle => {
          toggle
            .setValue(selectedProducts.has(product))
            .onChange(async enabled => {
              toggle.setDisabled(true);
              try {
                if (enabled) {
                  await registerAcaiProduct(this.plugin.app, product);
                  selectedProducts.add(product);
                } else {
                  selectedProducts.delete(product);
                }
                this.plugin.settings.acaiProducts = serializeProductNames(selectedProducts);
                await this.plugin.saveSettings();
                this.display();
              } catch (err) {
                toggle.setValue(!enabled);
                new Notice(`ACAI 项目设置保存失败：${err instanceof Error ? err.message : String(err)}`);
              } finally {
                toggle.setDisabled(false);
              }
            });
        });
    }
  }
}
