import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { env } from "../env.js";

export interface StorageAdapter {
  save(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

class LocalStorage implements StorageAdapter {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    mkdirSync(baseDir, { recursive: true });
  }

  async save(path: string, data: Buffer): Promise<void> {
    const fullPath = join(this.baseDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, data);
  }

  async read(path: string): Promise<Buffer> {
    const fullPath = join(this.baseDir, path);
    return readFileSync(fullPath);
  }

  async delete(path: string): Promise<void> {
    const fullPath = join(this.baseDir, path);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  async exists(path: string): Promise<boolean> {
    const fullPath = join(this.baseDir, path);
    return existsSync(fullPath);
  }
}

// ── Storage adapter ──────────────────────────────

let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (storageInstance) return storageInstance;

  switch (env.STORAGE_TYPE) {
    case "local":
      storageInstance = new LocalStorage(env.UPLOAD_DIR);
      break;
    case "r2":
      throw new Error("R2 storage not yet implemented");
  }

  return storageInstance;
}
