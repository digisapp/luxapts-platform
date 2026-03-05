// xAI Collections & Files API client for RAG
// Docs: https://docs.x.ai/developers/files/collections/api

const MANAGEMENT_API_BASE = "https://management-api.x.ai/v1";
const API_BASE = "https://api.x.ai/v1";

function getApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not configured");
  return key;
}

function getManagementApiKey(): string {
  const key = process.env.XAI_MANAGEMENT_API_KEY;
  if (!key) throw new Error("XAI_MANAGEMENT_API_KEY is not configured");
  return key;
}

// ---- Collection Management ----

export interface CollectionMetadataField {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
}

export interface Collection {
  id: string;
  collection_name: string;
  created_at?: string;
}

export async function createCollection(
  name: string,
  metadataFields?: CollectionMetadataField[]
): Promise<Collection> {
  const body: Record<string, unknown> = { collection_name: name };
  if (metadataFields?.length) {
    body.field_definitions = metadataFields;
  }

  const res = await fetch(`${MANAGEMENT_API_BASE}/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getManagementApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create collection: ${res.status} ${text}`);
  }

  return res.json();
}

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch(`${MANAGEMENT_API_BASE}/collections`, {
    headers: { Authorization: `Bearer ${getManagementApiKey()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list collections: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.collections || data;
}

// ---- File Upload ----

export interface UploadedFile {
  id: string;
  filename: string;
  bytes?: number;
  created_at?: number;
}

export async function uploadFile(
  content: string,
  filename: string
): Promise<UploadedFile> {
  const blob = new Blob([content], { type: "text/plain" });
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("purpose", "assistants");

  const res = await fetch(`${API_BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload file: ${res.status} ${text}`);
  }

  return res.json();
}

// ---- Document Management ----

export async function addDocumentToCollection(
  collectionId: string,
  fileId: string,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  const res = await fetch(
    `${MANAGEMENT_API_BASE}/collections/${collectionId}/documents/${fileId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getManagementApiKey()}`,
      },
      body: metadata ? JSON.stringify({ fields: metadata }) : undefined,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to add document to collection: ${res.status} ${text}`
    );
  }
}

export async function removeDocumentFromCollection(
  collectionId: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `${MANAGEMENT_API_BASE}/collections/${collectionId}/documents/${fileId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getManagementApiKey()}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to remove document: ${res.status} ${text}`);
  }
}

// ---- Search ----

export type RetrievalMode = "keyword" | "semantic" | "hybrid";

export interface SearchResult {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  document_id?: string;
  file_id?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export async function searchDocuments(
  query: string,
  collectionIds: string[],
  mode: RetrievalMode = "hybrid"
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/documents/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      query,
      source: { collection_ids: collectionIds },
      retrieval_mode: { type: mode },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to search documents: ${res.status} ${text}`);
  }

  return res.json();
}
