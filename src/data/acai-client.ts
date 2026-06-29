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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err) {
    const maybeStatus = "status" in err ? `status ${String((err as { status?: unknown }).status)}` : "";
    const maybeMessage = "message" in err ? String((err as { message?: unknown }).message) : "";
    return [maybeStatus, maybeMessage].filter(Boolean).join(" ");
  }
  return String(err);
}

async function requestAcaiData<T>(url: string, token: string, endpoint: string): Promise<T | null> {
  try {
    const result = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
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
