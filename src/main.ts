import { Plugin, WorkspaceLeaf } from "obsidian";
import { DashboardView, VIEW_TYPE } from "./view";
import "./styles.css";

export default class ThirdSpaceDashboard extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "ThirdSpace Dashboard", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-dashboard",
      name: "Open ThirdSpace Dashboard",
      callback: () => this.activateView(),
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);

    if (existing.length > 0) {
      // Already open → just reveal it, never close
      workspace.revealLeaf(existing[0]);
      return;
    }

    // Open in right sidebar
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }
}
