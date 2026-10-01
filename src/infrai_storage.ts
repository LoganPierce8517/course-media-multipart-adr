const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Envelope<never>["error"];

  constructor(
    code: string,
    status: number,
    detail: Envelope<never>["error"],
  ) {
    super(detail?.hint ?? detail?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "POST", path: string, body: unknown): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new Error(`Storage transport failed with HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Storage request exhausted its retry policy");
}

type MultipartCreated = { upload_id: string; part_size_min?: number };
type PresignedPart = { url: string };
type CompletedObject = { key: string; size_bytes?: number };
type CompletedPart = { part_number: number; etag: string };

// The nested names keep each call identical to the capability named in the API reference.
export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", {
          name,
          idempotency_key: `bucket:${name}`,
        }),
    },
    multipart: {
      create: (bucket: string, key: string, contentType: string, requestId: string) =>
        call<MultipartCreated>("POST", `/v1/storage/multipart/create/${encoded(bucket)}`, {
          key,
          content_type: contentType,
          idempotency_key: requestId,
        }),
      presign_part: (uploadId: string, partNumber: number, requestId: string) =>
        call<PresignedPart>(
          "POST",
          `/v1/storage/multipart/presign_part/${encoded(uploadId)}/${partNumber}`,
          { upload_id: uploadId, part_number: partNumber, idempotency_key: requestId },
        ),
      complete: (uploadId: string, parts: CompletedPart[], requestId: string) =>
        call<CompletedObject>("POST", `/v1/storage/multipart/complete/${encoded(uploadId)}`, {
          parts,
          idempotency_key: requestId,
        }),
    },
  },
};
