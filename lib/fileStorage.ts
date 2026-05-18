// IndexedDB-backed file storage for the document vault.
// Files are stored as Blobs in the browser; no backend involved.

const DB_NAME = 'restaurant-os-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export interface StoredFileRecord {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface FileListEntry {
  id: string;
  name: string;
  type: string;
  size: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error('IndexedDB is not available (SSR environment)'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function saveFile(file: File): Promise<string> {
  if (!isBrowser()) {
    throw new Error('saveFile can only run in the browser');
  }
  const db = await openDB();
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const record: StoredFileRecord = {
    id,
    blob: file,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  return new Promise<string>((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const req = store.put(record);
    req.onsuccess = () => {
      db.close();
      resolve(id);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('Failed to save file'));
    };
  });
}

export async function getFile(fileId: string): Promise<Blob | null> {
  if (!isBrowser()) return null;
  const db = await openDB();
  return new Promise<Blob | null>((resolve, reject) => {
    const store = tx(db, 'readonly');
    const req = store.get(fileId);
    req.onsuccess = () => {
      db.close();
      const rec = req.result as StoredFileRecord | undefined;
      resolve(rec ? rec.blob : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('Failed to read file'));
    };
  });
}

export async function getFileUrl(fileId: string): Promise<string | null> {
  if (!isBrowser()) return null;
  const blob = await getFile(fileId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deleteFile(fileId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const req = store.delete(fileId);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('Failed to delete file'));
    };
  });
}

export async function listFiles(): Promise<FileListEntry[]> {
  if (!isBrowser()) return [];
  const db = await openDB();
  return new Promise<FileListEntry[]>((resolve, reject) => {
    const store = tx(db, 'readonly');
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as StoredFileRecord[]) ?? [];
      resolve(
        rows.map((r) => ({ id: r.id, name: r.name, type: r.type, size: r.size }))
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('Failed to list files'));
    };
  });
}

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function triggerDownload(fileId: string, fileName: string): Promise<void> {
  const blob = await getFile(fileId);
  if (!blob) throw new Error('File not found');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
