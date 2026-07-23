/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, Sale, Payment, User, InventoryLog, SalesReturn, Activity, SyncVerificationResult, TableVerification } from '../types';
import { auth } from './firebase';

const STORAGE_KEYS = {
  USERS: 'hysam_users',
  PRODUCTS: 'hysam_products',
  SALES: 'hysam_sales',
  PAYMENTS: 'hysam_payments',
  LOGS: 'hysam_logs',
  ACTIVITIES: 'hysam_activities',
  RETURNS: 'hysam_returns',
  SETTINGS: 'hysam_settings',
  AUTH: 'hysam_auth',
  CUSTOM_ROLES: 'hysam_custom_roles'
};

const getAuthHeaders = async () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('Failed to get Firebase Auth Token:', err);
  }

  try {
    const dbConfig = localStorage.getItem('hysam_external_db_config');
    if (dbConfig) {
      headers['X-Database-Config'] = btoa(unescape(encodeURIComponent(dbConfig)));
    }
  } catch (err) {
    console.error('Failed to encode DB Config:', err);
  }
  return headers;
};

const INITIAL_USERS: User[] = [];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    code: 'GEN-001',
    name: 'Industrial Generator',
    size: '500kVA',
    brand: 'Cummins',
    description: 'High capacity power backup',
    category: 'Power',
    unitPrice: 250000,
    currentStock: 0,
    minStockLevel: 2,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'p2',
    code: 'SOL-400',
    name: 'Solar Panel',
    size: '400W',
    brand: 'Jinko',
    description: 'Monocrystalline solar panel',
    category: 'Solar',
    unitPrice: 45000,
    currentStock: 0,
    minStockLevel: 10,
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_SETTINGS: import('../types').AppSettings = {
  businessName: 'HYSAM VENTURES',
  businessAddress: '123 Main Street, Lagos, Nigeria',
  businessPhone: '+234 800 000 0000',
  businessEmail: 'info@hysam.com',
  currency: '₦',
  categories: ['Power', 'Solar', 'Battery', 'Inverter', 'Accessories', 'General'],
  reportFooter: 'Thank you for your business!',
  lowStockThreshold: 5,
  transactionEditLimitDays: 7,
  fontFamily: 'Inter'
};

const notifyDataUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hysam-data-updated'));
  }
};

let syncTimeout: any = null;
let isSyncing = false;
let hasPendingSyncRequest = false;

const triggerDebouncedSync = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    storage.sync();
    syncTimeout = null;
  }, 250);
};

let autoSyncInterval: any = null;

export const storage = {
  init: async () => {
    // Default auto-sync to enabled
    if (localStorage.getItem('hysam_external_db_autosync') === null) {
      localStorage.setItem('hysam_external_db_autosync', 'true');
    }

    // Initial local setup defaults
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
    }

    // Start background auto-sync timer (syncs every 15 seconds automatically)
    if (!autoSyncInterval && typeof window !== 'undefined') {
      autoSyncInterval = setInterval(() => {
        storage.sync();
      }, 15000);
    }

    // Try to fetch latest from server (database is source of truth)
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/data', { headers });
      if (res.ok) {
        const data = await res.json();

        // Helper to merge: server items take absolute priority as source of truth
        const mergeWithServer = <T extends { id: string }>(localList: T[], serverList: T[] | undefined): T[] => {
          if (!serverList) return localList;
          const mergedMap = new Map<string, T>();
          // Server items take precedence
          for (const item of serverList) {
            if (item && item.id) mergedMap.set(item.id, item);
          }
          // Local items preserved only if not present on server
          for (const item of localList) {
            if (item && item.id && !mergedMap.has(item.id)) {
              mergedMap.set(item.id, item);
            }
          }
          return Array.from(mergedMap.values());
        };

        const localUsers = storage.getUsers();
        const localProducts = storage.getProducts();
        const localSales = storage.getSales();
        const localPayments = storage.getPayments();
        const localLogs = storage.getLogs();
        const localActivities = storage.getActivities();
        const localReturns = storage.getReturns();

        const mergedUsers = mergeWithServer(localUsers, data.users);
        const mergedProducts = mergeWithServer(localProducts, data.products);
        const mergedSales = mergeWithServer(localSales, data.sales);
        const mergedPayments = mergeWithServer(localPayments, data.payments);
        const mergedLogs = mergeWithServer(localLogs, data.logs);
        const mergedActivities = mergeWithServer(localActivities, data.activities);
        const mergedReturns = mergeWithServer(localReturns, data.returns);

        // Update local storage directly with server source of truth
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(mergedProducts));
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(mergedSales));
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(mergedPayments));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(mergedLogs));
        localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(mergedActivities));
        localStorage.setItem(STORAGE_KEYS.RETURNS, JSON.stringify(mergedReturns));
        
        if (data.settings) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
        }

        notifyDataUpdated();
        storage.verifyDataCounts(data);

        // Detect if there are unsynced local items that need to be pushed up
        const hasLocalOnlyItems = 
          localUsers.some(l => l.id && !data.users?.some((s: any) => s.id === l.id)) ||
          localProducts.some(l => l.id && !data.products?.some((s: any) => s.id === l.id)) ||
          localSales.some(l => l.id && !data.sales?.some((s: any) => s.id === l.id)) ||
          localPayments.some(l => l.id && !data.payments?.some((s: any) => s.id === l.id)) ||
          localLogs.some(l => l.id && !data.logs?.some((s: any) => s.id === l.id)) ||
          localActivities.some(l => l.id && !data.activities?.some((s: any) => s.id === l.id)) ||
          localReturns.some(l => l.id && !data.returns?.some((s: any) => s.id === l.id));

        if (hasLocalOnlyItems) {
          console.log('Synchronizing local unsynced items to Cloud SQL database...');
          await storage.sync();
        }
      }
    } catch (e) {
      console.log('Running in offline mode or server unavailable');
    }

    // Set up auto-sync on browser back online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('Browser back online! Running real-time synchronization...');
        storage.sync();
      });
    }
  },

  getVerificationResult: (): SyncVerificationResult | null => {
    try {
      const data = localStorage.getItem('hysam_sync_verification');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  verifyDataCounts: (serverData: any): SyncVerificationResult => {
    const localSales = storage.getSales().length;
    const localReturns = storage.getReturns().length;
    const localProducts = storage.getProducts().length;
    const localPayments = storage.getPayments().length;
    const localUsers = storage.getUsers().length;
    const localLogs = storage.getLogs().length;

    const serverSales = Array.isArray(serverData?.sales) ? serverData.sales.length : 0;
    const serverReturns = Array.isArray(serverData?.returns) ? serverData.returns.length : 0;
    const serverProducts = Array.isArray(serverData?.products) ? serverData.products.length : 0;
    const serverPayments = Array.isArray(serverData?.payments) ? serverData.payments.length : 0;
    const serverUsers = Array.isArray(serverData?.users) ? serverData.users.length : 0;
    const serverLogs = Array.isArray(serverData?.logs) ? serverData.logs.length : 0;

    const makeTable = (local: number, server: number): TableVerification => ({
      localCount: local,
      serverCount: server,
      match: local === server,
      diff: local - server
    });

    const salesTable = makeTable(localSales, serverSales);
    const returnsTable = makeTable(localReturns, serverReturns);
    const productsTable = makeTable(localProducts, serverProducts);
    const paymentsTable = makeTable(localPayments, serverPayments);
    const usersTable = makeTable(localUsers, serverUsers);
    const logsTable = makeTable(localLogs, serverLogs);

    const matchAll = salesTable.match && returnsTable.match && productsTable.match && paymentsTable.match && usersTable.match && logsTable.match;

    const discrepantList: string[] = [];
    if (!salesTable.match) discrepantList.push(`Sales (App: ${localSales} vs DB: ${serverSales})`);
    if (!returnsTable.match) discrepantList.push(`Returns (App: ${localReturns} vs DB: ${serverReturns})`);
    if (!productsTable.match) discrepantList.push(`Inventory (App: ${localProducts} vs DB: ${serverProducts})`);
    if (!paymentsTable.match) discrepantList.push(`Payments (App: ${localPayments} vs DB: ${serverPayments})`);
    if (!usersTable.match) discrepantList.push(`Users (App: ${localUsers} vs DB: ${serverUsers})`);
    if (!logsTable.match) discrepantList.push(`Logs (App: ${localLogs} vs DB: ${serverLogs})`);

    const result: SyncVerificationResult = {
      timestamp: new Date().toISOString(),
      status: matchAll ? 'verified' : 'discrepancy',
      hasDiscrepancy: !matchAll,
      message: matchAll
        ? 'All core database tables (Sales, Returns, Inventory, Payments, Users, Logs) are verified in exact sync.'
        : `Record count discrepancy flagged: ${discrepantList.join('; ')}`,
      tables: {
        sales: salesTable,
        returns: returnsTable,
        products: productsTable,
        payments: paymentsTable,
        users: usersTable,
        logs: logsTable
      }
    };

    try {
      localStorage.setItem('hysam_sync_verification', JSON.stringify(result));
    } catch (e) {
      console.warn('Failed to store sync verification result:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hysam-sync-verification', { detail: result }));
    }

    return result;
  },

  isSyncPending: (): boolean => {
    return localStorage.getItem('hysam_sync_pending') === 'true';
  },

  setSyncPending: (pending: boolean) => {
    localStorage.setItem('hysam_sync_pending', String(pending));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hysam-sync-status', {
        detail: { pending, online: navigator.onLine }
      }));
    }
  },

  sync: async () => {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    if (isSyncing) {
      hasPendingSyncRequest = true;
      return;
    }
    isSyncing = true;
    hasPendingSyncRequest = false;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hysam-sync-start'));
    }

    try {
      const headers = await getAuthHeaders();
      
      // 1. Pull first to merge potential changes from other clients
      const pullRes = await fetch('/api/data', { headers });
      if (pullRes.ok) {
        const serverData = await pullRes.json();
        
        // Helper to safely merge local and server lists by item ID
        const mergeLists = <T extends { id: string }>(localList: T[], serverList: T[] | undefined): T[] => {
          if (!serverList || serverList.length === 0) return localList;
          const mergedMap = new Map<string, T>();
          // Server wins on conflicts for established records, but local keeps its new ones
          for (const item of serverList) {
            mergedMap.set(item.id, item);
          }
          for (const item of localList) {
            if (!mergedMap.has(item.id)) {
              mergedMap.set(item.id, item);
            }
          }
          return Array.from(mergedMap.values());
        };

        const localUsers = storage.getUsers();
        const localProducts = storage.getProducts();
        const localSales = storage.getSales();
        const localPayments = storage.getPayments();
        const localLogs = storage.getLogs();
        const localActivities = storage.getActivities();
        const localReturns = storage.getReturns();

        const mergedUsers = mergeLists(localUsers, serverData.users);
        const mergedProducts = mergeLists(localProducts, serverData.products);
        const mergedSales = mergeLists(localSales, serverData.sales);
        const mergedPayments = mergeLists(localPayments, serverData.payments);
        const mergedLogs = mergeLists(localLogs, serverData.logs);
        const mergedActivities = mergeLists(localActivities, serverData.activities);
        const mergedReturns = mergeLists(localReturns, serverData.returns);

        // Update local storage with merged results
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(mergedProducts));
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(mergedSales));
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(mergedPayments));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(mergedLogs));
        localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(mergedActivities));
        localStorage.setItem(STORAGE_KEYS.RETURNS, JSON.stringify(mergedReturns));
        
        if (serverData.settings) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(serverData.settings));
        }
        notifyDataUpdated();
      }

      // 2. Push merged data back up
      const pushData = {
        users: storage.getUsers(),
        products: storage.getProducts(),
        sales: storage.getSales(),
        payments: storage.getPayments(),
        logs: storage.getLogs(),
        activities: storage.getActivities(),
        returns: storage.getReturns(),
        settings: storage.getSettings()
      };

      const res = await fetch('/api/data', {
        method: 'POST',
        headers,
        body: JSON.stringify(pushData)
      });

      if (!res.ok) {
        throw new Error(`Sync failed with status code ${res.status}`);
      }

      // 3. Post-sync verification: query fresh snapshot from database to compare table record counts
      try {
        const verifyRes = await fetch('/api/data', { headers });
        if (verifyRes.ok) {
          const freshData = await verifyRes.json();
          storage.verifyDataCounts(freshData);
        }
      } catch (verifErr) {
        console.warn('Post-sync verification check error:', verifErr);
      }

      // Optional background External DB auto-sync
      const autosync = localStorage.getItem('hysam_external_db_autosync');
      const savedConfig = localStorage.getItem('hysam_external_db_config');
      if (autosync !== 'false' && savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          const extRes = await fetch('/api/external-db/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, data: pushData })
          });
          if (!extRes.ok) {
            console.warn('External DB auto-push returned error');
          }
        } catch (err) {
          console.warn('Background External DB sync failed:', err);
        }
      }

      storage.setSyncPending(false);
    } catch (e) {
      console.warn('Failed to sync with server, data remains local:', e);
      storage.setSyncPending(true);
    } finally {
      isSyncing = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hysam-sync-end'));
      }
      if (hasPendingSyncRequest) {
        setTimeout(() => storage.sync(), 50);
      }
    }
  },

  getData: <T>(key: string): T[] => {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  saveData: <T>(key: string, data: T[]) => {
    localStorage.setItem(key, JSON.stringify(data));
    storage.setSyncPending(true);
    notifyDataUpdated();
    triggerDebouncedSync(); // Trigger background sync with debounce
  },

  forceSync: async () => {
    storage.setSyncPending(true);
    await storage.sync();
  },

  getProducts: () => storage.getData<Product>(STORAGE_KEYS.PRODUCTS),
  saveProducts: (products: Product[]) => storage.saveData(STORAGE_KEYS.PRODUCTS, products),

  getSales: () => storage.getData<Sale>(STORAGE_KEYS.SALES),
  saveSales: (sales: Sale[]) => storage.saveData(STORAGE_KEYS.SALES, sales),

  getPayments: () => storage.getData<Payment>(STORAGE_KEYS.PAYMENTS),
  savePayments: (payments: Payment[]) => storage.saveData(STORAGE_KEYS.PAYMENTS, payments),

  getUsers: () => storage.getData<User>(STORAGE_KEYS.USERS),
  saveUsers: (users: User[]) => storage.saveData(STORAGE_KEYS.USERS, users),

  getCustomRoles: (): import('../types').RoleConfig[] => {
    return storage.getData<import('../types').RoleConfig>(STORAGE_KEYS.CUSTOM_ROLES);
  },
  saveCustomRoles: (roles: import('../types').RoleConfig[]) => {
    storage.saveData(STORAGE_KEYS.CUSTOM_ROLES, roles);
  },
  
  getLogs: () => storage.getData<InventoryLog>(STORAGE_KEYS.LOGS),
  saveLogs: (logs: InventoryLog[]) => storage.saveData(STORAGE_KEYS.LOGS, logs),

  getActivities: () => storage.getData<Activity>(STORAGE_KEYS.ACTIVITIES),
  saveActivities: (activities: Activity[]) => storage.saveData(STORAGE_KEYS.ACTIVITIES, activities),

  getReturns: () => storage.getData<SalesReturn>(STORAGE_KEYS.RETURNS),
  saveReturns: (returns: SalesReturn[]) => storage.saveData(STORAGE_KEYS.RETURNS, returns),

  getSettings: (): import('../types').AppSettings => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : INITIAL_SETTINGS;
  },
  saveSettings: (settings: import('../types').AppSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    storage.setSyncPending(true);
    triggerDebouncedSync();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hysam-settings-updated', { detail: settings }));
    }
  },

  logActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => {
    const activities = storage.getActivities();
    const newActivity: Activity = {
      ...activity,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString()
    };
    storage.saveActivities([newActivity, ...activities]);
  },

  calculateClosingStock: (productId: string) => {
    const logs = storage.getLogs().filter(l => l.productId === productId);
    const sales = storage.getSales().filter(s => s.items.some(i => i.productId === productId));
    
    const stockIn = logs.filter(l => l.type === 'stock-in').reduce((acc, l) => acc + l.quantity, 0);
    const stockOut = logs.filter(l => l.type === 'stock-out').reduce((acc, l) => acc + l.quantity, 0);
    
    const delivered = sales
      .filter(s => s.deliveryStatus === 'delivered')
      .reduce((acc, s) => {
        const item = s.items.find(i => i.productId === productId);
        return acc + (item?.quantity || 0);
      }, 0);

    const returns = storage.getReturns()
      .filter(r => r.productId === productId)
      .reduce((acc, r) => acc + r.quantity, 0);

    return (stockIn + returns) - (stockOut + delivered);
  },

  getAuth: (): User | null => {
    const auth = localStorage.getItem(STORAGE_KEYS.AUTH);
    return auth ? JSON.parse(auth) : null;
  },
  setAuth: (user: User | null) => {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
    }
  }
};
