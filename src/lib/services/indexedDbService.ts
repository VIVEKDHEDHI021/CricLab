import { BallEventData } from './matchEngine';

const DB_NAME = 'criclab_offline_db';
const DB_VERSION = 2;

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

export interface LocalSyncQueueItem {
  id: string;
  event_uuid: string;
  match_id: string;
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
  last_error?: string | null;
  payload: BallEventData;
}

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
        if (!db.objectStoreNames.contains('ball_events')) {
          db.createObjectStore('ball_events', { keyPath: 'event_uuid' });
        }
        if (!db.objectStoreNames.contains('match_snapshots')) {
          db.createObjectStore('match_snapshots', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('audit_logs')) {
          db.createObjectStore('audit_logs', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // BallEvents (CricEngine v2)
  async saveBallEvent(event: BallEventData): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ball_events', 'readwrite');
      const store = tx.objectStore('ball_events');
      const request = store.put(event);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBallEvents(matchId: string): Promise<BallEventData[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ball_events', 'readonly');
      const store = tx.objectStore('ball_events');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as BallEventData[];
        const filtered = all.filter((e) => e.match_id === matchId)
          .sort((a, b) => a.sequence_number - b.sequence_number);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBallEvent(eventUuid: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ball_events', 'readwrite');
      const store = tx.objectStore('ball_events');
      const request = store.delete(eventUuid);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Snapshots
  async saveMatchSnapshot(snapshot: any): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('match_snapshots', 'readwrite');
      const store = tx.objectStore('match_snapshots');
      const request = store.put(snapshot);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMatchSnapshots(matchId: string): Promise<any[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('match_snapshots', 'readonly');
      const store = tx.objectStore('match_snapshots');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as any[];
        const filtered = all.filter((s) => s.match_id === matchId);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // SyncQueue
  async addToSyncQueue(item: LocalSyncQueueItem): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(matchId?: string): Promise<LocalSyncQueueItem[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as LocalSyncQueueItem[];
        if (matchId) {
          resolve(all.filter((q) => q.match_id === matchId));
        } else {
          resolve(all);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Audit Logs
  async saveAuditLog(log: any): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audit_logs', 'readwrite');
      const store = tx.objectStore('audit_logs');
      const request = store.put(log);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAuditLogs(matchId: string): Promise<any[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audit_logs', 'readonly');
      const store = tx.objectStore('audit_logs');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as any[];
        resolve(all.filter((l) => l.match_id === matchId));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedAuditLogs(matchId: string): Promise<any[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audit_logs', 'readonly');
      const store = tx.objectStore('audit_logs');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as any[];
        resolve(all.filter((l) => l.match_id === matchId && !l.synced));
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Deliveries Operations (Legacy - for compatibility)
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
    
    // Clear ball events
    const ballEventsTx = db.transaction('ball_events', 'readwrite');
    const ballEventsStore = ballEventsTx.objectStore('ball_events');
    const ballEventsReq = ballEventsStore.getAll();
    ballEventsReq.onsuccess = () => {
      const items = (ballEventsReq.result as BallEventData[]).filter((e) => e.match_id === matchId);
      items.forEach((item) => ballEventsStore.delete(item.event_uuid));
    };

    // Clear match snapshots
    const snapshotsTx = db.transaction('match_snapshots', 'readwrite');
    const snapshotsStore = snapshotsTx.objectStore('match_snapshots');
    const snapshotsReq = snapshotsStore.getAll();
    snapshotsReq.onsuccess = () => {
      const items = (snapshotsReq.result as any[]).filter((s) => s.match_id === matchId);
      items.forEach((item) => snapshotsStore.delete(item.id));
    };

    // Clear sync queue
    const syncTx = db.transaction('sync_queue', 'readwrite');
    const syncStore = syncTx.objectStore('sync_queue');
    const syncReq = syncStore.getAll();
    syncReq.onsuccess = () => {
      const items = (syncReq.result as LocalSyncQueueItem[]).filter((q) => q.match_id === matchId);
      items.forEach((item) => syncStore.delete(item.id));
    };

    // Clear audit logs
    const auditTx = db.transaction('audit_logs', 'readwrite');
    const auditStore = auditTx.objectStore('audit_logs');
    const auditReq = auditStore.getAll();
    auditReq.onsuccess = () => {
      const items = (auditReq.result as any[]).filter((l) => l.match_id === matchId);
      items.forEach((item) => auditStore.delete(item.id));
    };

    // Clear legacy deliveries
    const deliveriesTx = db.transaction('deliveries', 'readwrite');
    const deliveriesStore = deliveriesTx.objectStore('deliveries');
    const deliveriesReq = deliveriesStore.getAll();
    deliveriesReq.onsuccess = () => {
      const items = (deliveriesReq.result as BallEvent[]).filter((d) => d.matchId === matchId);
      items.forEach((item) => deliveriesStore.delete(item.id));
    };

    // Clear legacy overs
    const oversTx = db.transaction('overs', 'readwrite');
    const oversStore = oversTx.objectStore('overs');
    const oversReq = oversStore.getAll();
    oversReq.onsuccess = () => {
      const items = (oversReq.result as LocalOver[]).filter((o) => o.matchId === matchId);
      items.forEach((item) => oversStore.delete(item.id));
    };

    // Clear legacy pending_deletions
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
