export type ApiMemory = {
  id: string;
  claimant: string;
  type: "message" | "photo" | "song" | "link";
  text?: string;
  link?: string;
  media_url?: string;
  name?: string;
  created_at: string;
};

export type ApiStar = {
  id: string;
  street: string;
  lat: number;
  lon: number;
  status: "available" | "claimed" | "resting";
  claim_id?: string;
  claimant?: string;
  claim_status?: "pending_verification" | "verified";
  verification_expires_at?: string;
  available_at?: string;
  history: ApiMemory[];
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `API request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  listStars: () => request<ApiStar[]>("/api/stars"),
  claim: (starId: string, payload: { display_name: string; lat: number; lon: number }) =>
    request<{ id: string; star_id: string; status: string; display_name: string; verification_expires_at: string }>(
      `/api/stars/${starId}/claims`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  saveMemory: (claimId: string, form: FormData) =>
    request<{ status: string }>(`/api/claims/${claimId}/memory`, { method: "POST", body: form }),
  sendVerification: (claimId: string, email: string) =>
    request<{ status: string; verification_link?: string }>(
      `/api/claims/${claimId}/verification`,
      { method: "POST", body: JSON.stringify({ email }) }
    ),
  release: (claimId: string) =>
    request<{ status: "resting"; available_at: string }>(`/api/claims/${claimId}/release`, { method: "POST" }),
};
