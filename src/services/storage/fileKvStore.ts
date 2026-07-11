/**
 * AsyncStorage 대체 — 이미 네이티브 링크된 expo-file-system 기반 KV.
 * Dev Client 재빌드 없이 persist 가능.
 */

import { Directory, File, Paths } from 'expo-file-system';

function safeFileName(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`;
}

function kvDir(): Directory {
  return new Directory(Paths.document, 'swingcare-kv');
}

function fileForKey(key: string): File {
  return new File(kvDir(), safeFileName(key));
}

function ensureKvDir(): void {
  const dir = kvDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

export const fileKvStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const file = fileForKey(key);
      if (!file.exists) {
        return null;
      }
      return await file.text();
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    ensureKvDir();
    const file = fileForKey(key);
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }
    file.write(value);
  },

  async removeItem(key: string): Promise<void> {
    try {
      const file = fileForKey(key);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // ignore
    }
  },
};
