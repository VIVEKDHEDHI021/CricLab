const DB_NAME = 'criclab_offline_db';
const DB_VERSION = 1;

export interface BallEvent {
  id: string;
  matchId: string;
  inningsId: string;
  inningsNo: number; // 1-based innings number
  ballIndex: number;
  overNumber: number;
  ballInOver: number;
  batterId: string;
  nonStrikerId: string | null;
  bowlerId: string;
  runs: number;
  extraRuns: number;
  extraType: "wide" | "no_ball" | "bye" | "leg_bye" | null;
  isWicket: boolean;
  wicketType: string | null;
  isLegal: boolean;
  caughtById: string | null;
  timestamp: number;
  synced: boolean;
}

export type LocalOver = {
  id: string; // `${matchId}_${inningsNo}_${overNo}`
  matchId: string;
  inningsNo: number;
  overNo: number;
  status: 'PENDING' | 'SYNCED' | 'LOCKED';
};

export type PendingDeletion = {
  id: string;
  matchId: string;
};

class IndexedDbService {
  private db: IDBDatabase | null = null;

  private initDb(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains('deliveries')) {
          db.createObjectStore('deliveries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('overs')) {
          db.createObjectStore('overs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_deletions')) {
          db.createObjectStore('pending_deletions', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Deliveries Operations
  async saveDelivery(delivery: BallEvent): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      const store = tx.objectStore('deliveries');
      const request = store.put(delivery);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDeliveries(matchId: string, inningsNo: number): Promise<BallEvent[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readonly');
      const store = tx.objectStore('deliveries');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as BallEvent[];
        const filtered = all.filter(
          (d) => d.matchId === matchId && d.inningsNo === inningsNo
        );
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDelivery(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      const store = tx.objectStore('deliveries');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async markDeliveriesSynced(ids: string[]): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      const store = tx.objectStore('deliveries');
      
      let completed = 0;
      let hasError = false;

      if (ids.length === 0) {
        resolve();
        return;
      }

      ids.forEach((id) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result as BallEvent;
          if (item) {
            item.synced = true;
            const putReq = store.put(item);
            putReq.onsuccess = () => {
              completed++;
              if (completed === ids.length && !hasError) resolve();
            };
            putReq.onerror = () => {
              hasError = true;
              reject(putReq.error);
            };
          } else {
            completed++;
            if (completed === ids.length && !hasError) resolve();
          }
        };
        getReq.onerror = () => {
          hasError = true;
          reject(getReq.error);
        };
      });
    });
  }

  // Overs Operations
  async saveOverStatus(
    matchId: string,
    inningsNo: number,
    overNo: number,
    status: 'PENDING' | 'SYNCED' | 'LOCKED'
  ): Promise<void> {
    const db = await this.initDb();
    const id = `${matchId}_${inningsNo}_${overNo}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('overs', 'readwrite');
      const store = tx.objectStore('overs');
      const request = store.put({
        id,
        matchId,
        inningsNo,
        overNo,
        status,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteOverStatus(matchId: string, inningsNo: number, overNo: number): Promise<void> {
    const db = await this.initDb();
    const id = `${matchId}_${inningsNo}_${overNo}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('overs', 'readwrite');
      const store = tx.objectStore('overs');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOvers(matchId: string, inningsNo: number): Promise<LocalOver[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('overs', 'readonly');
      const store = tx.objectStore('overs');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as LocalOver[];
        const filtered = all.filter(
          (o) => o.matchId === matchId && o.inningsNo === inningsNo
        );
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Pending Deletions
  async addPendingDeletion(id: string, matchId: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_deletions', 'readwrite');
      const store = tx.objectStore('pending_deletions');
      const request = store.put({ id, matchId });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingDeletions(matchId: string): Promise<PendingDeletion[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_deletions', 'readonly');
      const store = tx.objectStore('pending_deletions');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as PendingDeletion[];
        const filtered = all.filter((pd) => pd.matchId === matchId);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingDeletion(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_deletions', 'readwrite');
      const store = tx.objectStore('pending_deletions');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Clear Match Data
  async clearMatchData(matchId: string): Promise<void> {
    const db = await this.initDb();
    
    // Clear deliveries
    const deliveriesTx = db.transaction('deliveries', 'readwrite');
    const deliveriesStore = deliveriesTx.objectStore('deliveries');
    const deliveriesReq = deliveriesStore.getAll();
    deliveriesReq.onsuccess = () => {
      const items = (deliveriesReq.result as BallEvent[]).filter((d) => d.matchId === matchId);
      items.forEach((item) => deliveriesStore.delete(item.id));
    };

    // Clear overs
    const oversTx = db.transaction('overs', 'readwrite');
    const oversStore = oversTx.objectStore('overs');
    const oversReq = oversStore.getAll();
    oversReq.onsuccess = () => {
      const items = (oversReq.result as LocalOver[]).filter((o) => o.matchId === matchId);
      items.forEach((item) => oversStore.delete(item.id));
    };

    // Clear pending_deletions
    const pdTx = db.transaction('pending_deletions', 'readwrite');
    const pdStore = pdTx.objectStore('pending_deletions');
    const pdReq = pdStore.getAll();
    pdReq.onsuccess = () => {
      const items = (pdReq.result as PendingDeletion[]).filter((pd) => pd.matchId === matchId);
      items.forEach((item) => pdStore.delete(item.id));
    };
  }
}

export const indexedDbService = new IndexedDbService();
