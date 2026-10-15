import { Directory, File, Paths } from "expo-file-system";
import type { NanobotSession } from "../core/session";

export type Project = {
  id: string;
  name: string;
  description?: string;
  path: string;
  created_at: number;
  updated_at: number;
  file_count: number;
  size_bytes: number;
};

export type FileEntry = {
  path: string;
  size: number;
  modified_at: number;
};

export type ProjectDetail = {
  project: Project;
  instructions: string;
  files: FileEntry[];
  truncated: boolean;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  instructions?: string;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string;
  instructions?: string;
};

async function parseError(res: Response): Promise<string> {
  let code = `http_${res.status}`;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (typeof j?.error === "string") code = j.error;
    } catch {
      // Do not use raw text if it cannot be parsed as JSON, to avoid leaking paths/URLs
    }
  } catch {}
  return code;
}

async function postJson<T>(session: NanobotSession, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.apiToken()}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${session.baseUrl}${path}`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const code = await parseError(res);
    throw new Error(code);
  }
  return (await res.json()) as T;
}

export async function listProjects(session: NanobotSession): Promise<{ projects: Project[] }> {
  return session.get<{ projects: Project[] }>("/api/ext/projects");
}

export async function getProject(session: NanobotSession, id: string): Promise<ProjectDetail> {
  return session.get<ProjectDetail>(`/api/ext/projects/${encodeURIComponent(id)}`);
}

export async function createProject(
  session: NanobotSession,
  input: CreateProjectInput
): Promise<{ project: Project }> {
  return postJson<{ project: Project }>(session, "/api/ext/projects", input);
}

export async function updateProject(
  session: NanobotSession,
  id: string,
  patch: UpdateProjectInput
): Promise<{ project: Project; instructions: string }> {
  return postJson<{ project: Project; instructions: string }>(
    session,
    `/api/ext/projects/${encodeURIComponent(id)}/update`,
    patch
  );
}

export async function archiveProject(session: NanobotSession, id: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(session, `/api/ext/projects/${encodeURIComponent(id)}/archive`);
}

export async function deleteProjectFile(
  session: NanobotSession,
  id: string,
  path: string
): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(session, `/api/ext/projects/${encodeURIComponent(id)}/files/delete`, { path });
}

export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export async function uploadProjectFile(
  session: NanobotSession,
  id: string,
  relPath: string,
  localFile: { uri: string; name: string; mime?: string },
  overwrite?: boolean
): Promise<{ file: FileEntry }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": localFile.mime || "application/octet-stream",
    };
    if (overwrite) {
      headers["X-Overwrite"] = "1";
    }

    const query = `?path=${encodeURIComponent(relPath)}`;
    const url = `${session.baseUrl}/api/ext/projects/${encodeURIComponent(id)}/files${query}`;

    const res = await fetch(url, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers,
      body: new File(localFile.uri) as unknown as Blob,
      signal: controller.signal,
    });

    if (!res.ok) {
      const code = await parseError(res);
      throw new Error(code);
    }

    return (await res.json()) as { file: FileEntry };
  } catch (e: any) {
    if (e?.name === "AbortError" || controller.signal.aborted) {
      throw new Error("upload_timed_out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;

function safeSegment(seg: string): string {
  const s = seg.replace(/[\\/]/g, "_").trim();
  return /^\.*$/.test(s) ? "file" : s;
}

export async function downloadProjectFile(
  session: NanobotSession,
  id: string,
  file: FileEntry
): Promise<string> {
  if (file.size > MAX_DOWNLOAD_BYTES) {
    throw new Error("too_large");
  }

  const dir = new Directory(Paths.cache, "projects", id);
  dir.create({ intermediates: true, idempotent: true });

  const fileName = safeSegment(file.path.split("/").pop() || "file");
  const dest = new File(dir, fileName);

  const query = `?path=${encodeURIComponent(file.path)}`;
  const url = `${session.baseUrl}/api/ext/projects/${encodeURIComponent(id)}/file${query}`;

  await File.downloadFileAsync(url, dest, {
    headers: { Authorization: `Bearer ${session.apiToken()}` },
    idempotent: true,
  });

  return dest.uri;
}
