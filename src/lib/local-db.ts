// A small local database for session results, replacing the old "export
// session JSON" dev affordance. Everything lives in this browser via
// IndexedDB — nothing is sent anywhere. The API is deliberately thin
// (save / update / list / get) so it can later point at a real database
// service (e.g. Tiger) without changing any caller.

const DB_NAME = "spotter";
const DB_VERSION = 1;
const STORE = "sessions";

export type LocalSessionRecord = {
  id: string;
  loggedAt: string;
  exercise: string;
  source: "video" | "synthetic" | "live";
  duration: number;
  repCount: number;
  movementScore: number | null;
  cues: string[];
  coachingSummary: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Best-effort: a session result that can't be saved locally is not worth
 * interrupting the person's flow over, so failures are swallowed here and
 * only logged for debugging. */
export async function saveSessionRecord(
  record: LocalSessionRecord,
): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.put(record));
  } catch (error) {
    console.error("Could not save session locally.", error);
  }
}

export async function updateSessionCoaching(
  id: string,
  coachingSummary: string,
): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result as LocalSessionRecord | undefined;
          if (!existing) {
            resolve();
            return;
          }
          const putRequest = store.put({ ...existing, coachingSummary });
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("Could not update the saved session locally.", error);
  }
}

export async function listSessionRecords(): Promise<LocalSessionRecord[]> {
  try {
    return await withStore("readonly", (store) => store.getAll());
  } catch (error) {
    console.error("Could not read local sessions.", error);
    return [];
  }
}
