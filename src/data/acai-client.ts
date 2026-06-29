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

export async function fetchImplementationFeatures(
  baseUrl: string,
  token: string,
  productName: string,
  implementationName: string
): Promise<AcaiImplementationFeatures | null> {
  const url = `${baseUrl}/api/v1/implementation-features?product_name=${encodeURIComponent(productName)}&implementation_name=${encodeURIComponent(implementationName)}`;
  try {
    const result = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const data = result.json as { data: AcaiImplementationFeatures };
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchImplementations(
  baseUrl: string,
  token: string,
  productName: string
): Promise<AcaiImplementationsData | null> {
  const url = `${baseUrl}/api/v1/implementations?product_name=${encodeURIComponent(productName)}`;
  try {
    const result = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const data = result.json as { data: AcaiImplementationsData };
    return data?.data ?? null;
  } catch {
    return null;
  }
}
