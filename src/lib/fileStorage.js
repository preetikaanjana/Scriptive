/**
 * Privacy-focused Local File Storage using IndexedDB.
 * This ensures that generated PDF and ZIP files stay on the user's device.
 */

const DB_NAME = 'HandwrittenHistoryDB';
const STORE_NAME = 'exports';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveExportedFile(blob, name, type) {
    const db = await openDB();
    const id = crypto.randomUUID();
    const file = {
        id,
        name,
        blob,
        type,
        timestamp: Date.now(),
        size: blob.size,
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(file);

        request.onsuccess = () => resolve(id);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllExportedFiles() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by most recent first
            const results = request.result;
            resolve(results.sort((a, b) => b.timestamp - a.timestamp));
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteExportedFile(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
