// ── Acai API Client ──────────────────────────────────────────
// Fetches implementation feature progress from a self-hosted Acai server.

import { requestUrl } from "obsidian";

export interface AcaiFeatureEntry {
  feature_name: string;
  description: string | null;
  completed_count: number;
  total_count: number;
  refs_count: number;
  test_refs_count: number;
  has_local_spec: boolean;
  has_local_states: boolean;
  spec_last_seen_commit: string | null;
  states_inherited: boolean;
  refs_inherited: boolean;
}

export interface AcaiImplementationFeatures {
  product_name: string;
  implementation_name: string;
  implementation_id: string;
  features: AcaiFeatureEntry[];
}

export interface AcaiImplementationEntry {
  implementation_name: string;
  implementation_id: string;
  product_name: string;
}

export interface AcaiImplementationsData {
  product_name?: string;
  implementations: AcaiImplementationEntry[];
}

export type AcaiStateStatus =
  | "assigned"
  | "blocked"
  | "incomplete"
  | "completed"
  | "rejected"
  | "accepted"
  | null;

export interface AcaiAcidState {
  status: AcaiStateStatus;
  comment?: string;
  updated_at?: string;
}

export interface AcaiAcidRef {
  path: string;
  is_test: boolean;
  repo_uri: string;
  branch_name: string;
}

export interface AcaiAcidEntry {
  acid: string;
  requirement: string;
  deprecated: boolean;
  state: AcaiAcidState;
  refs_count: number;
  test_refs_count: number;
  refs?: AcaiAcidRef[];
  note?: string;
  replaced_by?: string[];
}

export interface AcaiFeatureContext {
  product_name: string;
  feature_name: string;
  implementation_name: string;
  implementation_id: string;
  acids: AcaiAcidEntry[];
  summary: {
    total_acids: number;
    status_counts: Record<string, number>;
  };
}

export interface AcaiFeatureStatePatch {
  status: AcaiStateStatus;
  comment?: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err) {
    const maybeStatus = "status" in err ? `status ${String((err as { status?: unknown }).status)}` : "";
    const maybeMessage = "message" in err ? String((err as { message?: unknown }).message) : "";
    return [maybeStatus, maybeMessage].filter(Boolean).join(" ");
  }
  return String(err);
}

async function requestAcaiData<T>(
  url: string,
  token: string,
  endpoint: string,
  options: { method?: "GET" | "PATCH"; body?: unknown } = {},
): Promise<T | null> {
  const method = options.method ?? "GET";
  try {
    const result = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "PATCH" && options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    const data = result.json as { data?: T };
    return data?.data ?? null;
  } catch (err) {
    throw new Error(`Acai ${endpoint} request failed: ${getErrorMessage(err)} (${url})`);
  }
}

export async function fetchImplementationFeatures(
  baseUrl: string,
  token: string,
  productName: string,
  implementationName: string
): Promise<AcaiImplementationFeatures | null> {
  const url = `${baseUrl}/api/v1/implementation-features?product_name=${encodeURIComponent(productName)}&implementation_name=${encodeURIComponent(implementationName)}`;
  return requestAcaiData<AcaiImplementationFeatures>(url, token, "implementation-features");
}

export async function fetchImplementations(
  baseUrl: string,
  token: string,
  productName: string
): Promise<AcaiImplementationsData | null> {
  const url = `${baseUrl}/api/v1/implementations?product_name=${encodeURIComponent(productName)}`;
  return requestAcaiData<AcaiImplementationsData>(url, token, "implementations");
}

export async function fetchFeatureContext(
  baseUrl: string,
  token: string,
  productName: string,
  implementationName: string,
  featureName: string,
  includeRefs = false,
): Promise<AcaiFeatureContext | null> {
  const params = new URLSearchParams({
    product_name: productName,
    implementation_name: implementationName,
    feature_name: featureName,
  });
  if (includeRefs) params.set("include_refs", "true");
  const url = `${baseUrl}/api/v1/feature-context?${params.toString()}`;
  return requestAcaiData<AcaiFeatureContext>(url, token, "feature-context");
}

export async function patchFeatureStates(
  baseUrl: string,
  token: string,
  productName: string,
  implementationName: string,
  featureName: string,
  states: Record<string, AcaiFeatureStatePatch>,
): Promise<{ states_written: number } | null> {
  const url = `${baseUrl}/api/v1/feature-states`;
  return requestAcaiData<{ states_written: number }>(
    url,
    token,
    "feature-states",
    {
      method: "PATCH",
      body: {
        product_name: productName,
        implementation_name: implementationName,
        feature_name: featureName,
        states,
      },
    },
  );
}

export const ACAI_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "unset" },
  { value: "assigned", label: "assigned" },
  { value: "incomplete", label: "incomplete" },
  { value: "blocked", label: "blocked" },
  { value: "completed", label: "completed" },
  { value: "accepted", label: "accepted" },
  { value: "rejected", label: "rejected" },
];
