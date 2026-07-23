/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  Settings, 
  RefreshCw, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle,
  Loader2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ExternalLink,
  WifiOff,
  Globe,
  ShieldCheck
} from 'lucide-react';
import { storage } from '../lib/storage';
import { User, SyncVerificationResult } from '../types';

interface ExternalDatabaseProps {
  user: User;
}

const EXTERNAL_DB_CONFIG_KEY = 'hysam_external_db_config';
const EXTERNAL_DB_AUTOSYNC_KEY = 'hysam_external_db_autosync';

export default function ExternalDatabase({ user }: ExternalDatabaseProps) {
  const [dbType, setDbType] = useState<'mysql' | 'postgres'>('postgres');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(5432);
  const [dbUser, setDbUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [rememberConfig, setRememberConfig] = useState(true);

  const [connected, setConnected] = useState(false);
  const [autosync, setAutosync] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'loading'; message: string }>({ type: 'idle', message: '' });
  const [syncing, setSyncing] = useState<'push' | 'pull' | 'schema' | 'test' | 'none'>('none');

  const [isGlobal, setIsGlobal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<SyncVerificationResult | null>(storage.getVerificationResult());

  useEffect(() => {
    const handleVerif = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setVerificationResult(customEvent.detail);
      }
    };
    window.addEventListener('hysam-sync-verification', handleVerif);
    return () => window.removeEventListener('hysam-sync-verification', handleVerif);
  }, []);

  // Load configuration from local storage if available
  useEffect(() => {
    const checkGlobalStatus = async () => {
      try {
        const res = await fetch('/api/external-db/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // Send empty, let server use env vars
        });
        const data = await res.json();
        if (data.isGlobal) {
          setIsGlobal(true);
          setConnected(data.success);
          if (data.success) {
            setStatus({ type: 'success', message: 'System-wide Database Connection Active! Your staff in all locations are connected to the Hostinger/Central database.' });
          }
        }
      } catch (e) {
        // Ignore errors for global check
      }
    };
    
    checkGlobalStatus();

    const saved = localStorage.getItem(EXTERNAL_DB_CONFIG_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setDbType(config.type || 'postgres');
        setHost(config.host || '');
        setPort(Number(config.port) || (config.type === 'mysql' ? 3306 : 5432));
        setDbUser(config.user || '');
        setPassword(config.password || '');
        setDatabase(config.database || '');
        setConnected(true);
      } catch (e) {
        console.error('Failed to parse saved DB config', e);
      }
    }

    const savedAutosync = localStorage.getItem(EXTERNAL_DB_AUTOSYNC_KEY);
    if (savedAutosync !== 'false') {
      setAutosync(true);
      localStorage.setItem(EXTERNAL_DB_AUTOSYNC_KEY, 'true');
    }
  }, []);

  // Update default port when DB type changes
  const handleDbTypeChange = (type: 'mysql' | 'postgres') => {
    setDbType(type);
    setPort(type === 'postgres' ? 5432 : 3306);
  };

  const getActiveConfig = () => {
    return {
      type: dbType,
      host: host.trim(),
      port,
      user: dbUser.trim(),
      password,
      database: database.trim()
    };
  };

  const handleTestConnection = async () => {
    const activeConfig = getActiveConfig();
    if (!activeConfig.host || !activeConfig.user || !activeConfig.database) {
      setStatus({ type: 'error', message: 'Please prefill connection details: Host, Username and Database Name.' });
      return;
    }

    if (activeConfig.host === 'localhost' || activeConfig.host === '127.0.0.1') {
      setStatus({ 
        type: 'error', 
        message: 'Invalid Host: "localhost" or "127.0.0.1" refers to this development container itself, not your external hosting server! You must use your hosting provider (Hostinger, Whogohost, etc.) external server domain name or IP address and make sure Remote Access is enabled in your control panel.' 
      });
      return;
    }

    setSyncing('test');
    setStatus({ type: 'loading', message: `Contacting external server and opening a ${activeConfig.type.toUpperCase()} socket...` });

    try {
      const response = await fetch('/api/external-db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeConfig)
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setConnected(true);
        setStatus({ type: 'success', message: 'Database Connection Successful! External database is online and reachable.' });
        
        if (rememberConfig) {
          localStorage.setItem(EXTERNAL_DB_CONFIG_KEY, JSON.stringify(activeConfig));
        } else {
          localStorage.removeItem(EXTERNAL_DB_CONFIG_KEY);
        }
      } else {
        throw new Error(result.error || 'Unknown error occurred.');
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ 
        type: 'error', 
        message: `Database Connection Failed: ${err.message || err}. Tip: Check if Host Firewall permits incoming connections, or enable "Remote Database Access" in your hosting dashboard (e.g. Hostinger hPanel or cPanel).` 
      });
      setConnected(false);
    } finally {
      setSyncing('none');
    }
  };

  const handleInitSchema = async () => {
    const activeConfig = getActiveConfig();
    if (!connected) {
      setStatus({ type: 'error', message: 'Please test and confirm the connection successfully before initializing the schemas.' });
      return;
    }

    setSyncing('schema');
    setStatus({ type: 'loading', message: 'Generating and executing SQL queries to setup HYSAM Ventures database schemas on your instance...' });

    try {
      const response = await fetch('/api/external-db/init-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: activeConfig })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setStatus({ type: 'success', message: 'Database initialized! All schema tables have been generated on the external server.' });
      } else {
        throw new Error(result.error || 'Failed to build table schemas.');
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Schema Initialization Failed: ${err.message || err}` });
    } finally {
      setSyncing('none');
    }
  };

  const handlePushData = async () => {
    const activeConfig = getActiveConfig();
    if (!connected) {
      setStatus({ type: 'error', message: 'Please verify database connection first.' });
      return;
    }

    if (!window.confirm('This will upload all current system data and overwrite/update matching ID rows on the external DB. Proceed?')) {
      return;
    }

    setSyncing('push');
    setStatus({ type: 'loading', message: 'Streaming values to your external database tables...' });

    try {
      const localData = {
        users: storage.getUsers(),
        products: storage.getProducts(),
        sales: storage.getSales(),
        payments: storage.getPayments(),
        returns: storage.getReturns(),
        logs: storage.getLogs(),
        activities: storage.getActivities()
      };

      const response = await fetch('/api/external-db/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: activeConfig, data: localData })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        storage.logActivity({
          type: 'stock-update',
          description: `Synchronized and pushed active database records to External DB`,
          userId: user.id,
          userName: user.name,
        });
        setStatus({ type: 'success', message: 'Success! Active database records were written directly to external tables.' });
      } else {
        throw new Error(result.error || 'Failed to stream records.');
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Pulsing Database Failed: ${err.message || err}` });
    } finally {
      setSyncing('none');
    }
  };

  const handlePullData = async () => {
    const activeConfig = getActiveConfig();
    if (!connected) {
      setStatus({ type: 'error', message: 'Please verify database connection first.' });
      return;
    }

    if (!window.confirm('CRITICAL: This will read all data rows directly from external database and OVERWRITE your active dashboard data. Proceed?')) {
      return;
    }

    setSyncing('pull');
    setStatus({ type: 'loading', message: 'Downloading records from external tables...' });

    try {
      const response = await fetch('/api/external-db/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: activeConfig })
      });

      const result = await response.json();
      if (response.ok && result.success && result.data) {
        const importedData = result.data;

        // Save imported records to client state
        if (importedData.users && importedData.users.length > 0) {
          localStorage.setItem('hysam_users', JSON.stringify(importedData.users));
        }
        if (importedData.products) {
          localStorage.setItem('hysam_products', JSON.stringify(importedData.products));
        }
        if (importedData.sales) {
          localStorage.setItem('hysam_sales', JSON.stringify(importedData.sales));
        }
        if (importedData.payments) {
          localStorage.setItem('hysam_payments', JSON.stringify(importedData.payments));
        }
        if (importedData.returns) {
          localStorage.setItem('hysam_returns', JSON.stringify(importedData.returns));
        }
        if (importedData.logs) {
          localStorage.setItem('hysam_logs', JSON.stringify(importedData.logs));
        }
        if (importedData.activities) {
          localStorage.setItem('hysam_activities', JSON.stringify(importedData.activities));
        }

        // Trigger synchronization
        await storage.sync();

        storage.logActivity({
          type: 'stock-update',
          description: `Downloaded database records and synchronized state from External DB`,
          userId: user.id,
          userName: user.name,
        });

        setStatus({ type: 'success', message: 'Success! Active database was overwritten and updated with live rows pulled from external server.' });
      } else {
        throw new Error(result.error || 'Failed to download rows.');
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Pulling Database Failed: ${err.message || err}` });
    } finally {
      setSyncing('none');
    }
  };

  const handleToggleAutosync = () => {
    const nextVal = !autosync;
    setAutosync(nextVal);
    localStorage.setItem(EXTERNAL_DB_AUTOSYNC_KEY, String(nextVal));
    setStatus({ 
      type: 'success', 
      message: nextVal 
        ? 'Real-Time Auto-Sync Enabled! Every transaction will write back to your external database.'
        : 'Real-time Auto-Sync Disabled.' 
    });
  };

  const handleClearConfig = () => {
    if (window.confirm('Are you sure you want to delete external database connection settings from your browser session?')) {
      localStorage.removeItem(EXTERNAL_DB_CONFIG_KEY);
      localStorage.removeItem(EXTERNAL_DB_AUTOSYNC_KEY);
      setHost('');
      setDbUser('');
      setPassword('');
      setDatabase('');
      setConnected(false);
      setAutosync(false);
      setStatus({ type: 'idle', message: '' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Server className="text-indigo-600 animate-pulse" />
            External Database Integration (Hostinger, etc.)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Connect the app directly to any external database (hosted with Hostinger, Whogohost, AWS, or any cPanel host) to store and synchronize records.
          </p>
        </div>
      </div>

      {status.type !== 'idle' && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
          status.type === 'success' ? 'bg-accent-theme-light border-accent-theme-light text-accent-theme-dark' :
          status.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-indigo-50 border-indigo-200 text-indigo-800'
        }`}>
          {status.type === 'success' && <CheckCircle className="text-accent-theme shrink-0 mt-0.5" size={18} />}
          {status.type === 'error' && <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />}
          {status.type === 'loading' && <Loader2 className="text-indigo-600 animate-spin shrink-0 mt-0.5" size={18} />}
          <div className="text-sm font-medium leading-relaxed">
            {status.message}
          </div>
        </div>
      )}

      {/* Connection Panel Layout */}
      {isGlobal && (
        <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Globe size={20} />
          </div>
          <div>
            <h3 className="font-bold text-indigo-900 text-sm">System-Wide Connection Active</h3>
            <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
              This app is configured with a <strong>Central Database</strong>. Staff in any location will automatically connect to this server when they log in. You do not need to enter credentials on every device.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card-theme-bg border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Settings className="text-slate-500 w-5 h-5" />
                Connection Credentials
              </h3>
              {connected && (
                <button
                  onClick={handleClearConfig}
                  className="p-1.5 hover:bg-rose-50 hover:text-rose-600 border border-transparent rounded-lg text-slate-400 transition-colors"
                  title="Clear Connection State"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="space-y-5">
              {/* DB Type Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wide">Database Engine Dialect</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDbTypeChange('postgres')}
                    className={`py-3 px-4 border rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                      dbType === 'postgres' 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50' 
                        : 'bg-card-theme-bg border-slate-200 text-slate-600 hover:bg-layout-theme-bg'
                    }`}
                  >
                    <Database size={16} />
                    PostgreSQL Server (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDbTypeChange('mysql')}
                    className={`py-3 px-4 border rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                      dbType === 'mysql' 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50' 
                        : 'bg-card-theme-bg border-slate-200 text-slate-600 hover:bg-layout-theme-bg'
                    }`}
                  >
                    <Database size={16} />
                    MySQL / MariaDB
                  </button>
                </div>
              </div>

              {/* Host and Port */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Database Host</label>
                  <input
                    type="text"
                    placeholder="e.g. sql123.hostinger.com or IP"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    className="w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Db User & Db Password */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Database User</label>
                  <input
                    type="text"
                    placeholder="Database user username"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Database Password</label>
                  <input
                    type="password"
                    placeholder="Database user password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Database Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Database Name</label>
                <input
                  type="text"
                  placeholder="e.g. u123456789_hysam_db"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {/* Remember connection settings */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="rememberConfig"
                  checked={rememberConfig}
                  onChange={(e) => setRememberConfig(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="rememberConfig" className="text-xs text-slate-500 font-medium select-none">
                  Remember connection details securely in browser local storage
                </label>
              </div>

              {/* Test Connection Button */}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={syncing !== 'none'}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 shadow-sm transition-all disabled:opacity-50 mt-4"
              >
                {syncing === 'test' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Server size={18} />
                    Test Connection & Save State
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sync Operations Dashboard */}
          {connected && (
            <div className="bg-card-theme-bg border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-lg">Sync & Operations Menu</h3>
                <span className="px-2.5 py-1 bg-accent-theme-light text-accent-theme-hover text-xs font-semibold rounded-lg border border-accent-theme-light flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-accent-theme rounded-full animate-ping" />
                  Connection Live
                </span>
              </div>

              {/* Setup Tables Card */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Sparkles className="text-indigo-600 w-4 h-4" />
                    Initialize External Database Schema
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md">
                    First-time setup? This runs SQL scripts to automatically construct your HYSAM Ventures tables inside the instance cleanly.
                  </p>
                </div>
                <button
                  onClick={handleInitSchema}
                  disabled={syncing !== 'none'}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {syncing === 'schema' ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Init DB Tables
                </button>
              </div>

              {/* Sync Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <ArrowUp className="text-slate-600" size={16} />
                      Push to External DB
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Sync your current local data up to the external database. Overwrites outdated remote keys.
                    </p>
                  </div>
                  <button
                    onClick={handlePushData}
                    disabled={syncing !== 'none'}
                    className="w-full mt-4 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {syncing === 'push' ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
                    Sync UP to External DB
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <ArrowDown className="text-slate-600" size={16} />
                      Pull from External DB
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Download all transactional tables from your external database and synchronize them with this dashboard.
                    </p>
                  </div>
                  <button
                    onClick={handlePullData}
                    disabled={syncing !== 'none'}
                    className="w-full mt-4 py-2 px-3 bg-accent-theme hover:bg-accent-theme-hover text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {syncing === 'pull' ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />}
                    Sync DOWN from External DB
                  </button>
                </div>
              </div>

              {/* Auto Sync Toggle Row */}
              <div className="p-4 bg-layout-theme-bg rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Real-Time Auto-Syncing</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically stream updates to the external database on every local transaction.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAutosync}
                  className="text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {autosync ? <ToggleRight size={36} /> : <ToggleLeft size={36} className="text-slate-300" />}
                </button>
              </div>

              {/* Record Count Verification Audit Card */}
              {verificationResult && (
                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <ShieldCheck className={verificationResult.hasDiscrepancy ? 'text-amber-500' : 'text-emerald-500'} size={18} />
                        Database Sync Record Count Audit
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Verified at: {new Date(verificationResult.timestamp).toLocaleTimeString()} ({new Date(verificationResult.timestamp).toLocaleDateString()})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border flex items-center gap-1.5 ${
                        verificationResult.hasDiscrepancy 
                          ? 'bg-amber-50 text-amber-800 border-amber-200' 
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {verificationResult.hasDiscrepancy ? (
                          <>
                            <AlertTriangle size={12} className="text-amber-600" /> Discrepancy Flagged
                          </>
                        ) : (
                          <>
                            <CheckCircle size={12} className="text-emerald-600" /> Fully Verified
                          </>
                        )}
                      </span>
                      <button
                        onClick={async () => {
                          setSyncing('push');
                          await storage.forceSync();
                          setSyncing('none');
                        }}
                        disabled={syncing !== 'none'}
                        className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RefreshCw size={12} className={syncing === 'push' ? 'animate-spin' : ''} />
                        Re-Verify
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 bg-layout-theme-bg p-2.5 rounded-xl border border-slate-100">
                    {verificationResult.message}
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                          <th className="px-3 py-2 rounded-l-lg">Table / Collection</th>
                          <th className="px-3 py-2 text-center">App State</th>
                          <th className="px-3 py-2 text-center">External DB</th>
                          <th className="px-3 py-2 text-center">Diff</th>
                          <th className="px-3 py-2 text-right rounded-r-lg">Parity Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { key: 'sales', label: 'Sales Records', ...verificationResult.tables.sales },
                          { key: 'returns', label: 'Sales Returns', ...verificationResult.tables.returns },
                          { key: 'products', label: 'Inventory / Products', ...verificationResult.tables.products },
                          { key: 'payments', label: 'Payments Log', ...verificationResult.tables.payments },
                          { key: 'users', label: 'User Accounts', ...verificationResult.tables.users },
                          { key: 'logs', label: 'Stock Movement Logs', ...verificationResult.tables.logs },
                        ].map((tbl) => (
                          <tr key={tbl.key} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-semibold text-slate-800">{tbl.label}</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-700">{tbl.localCount}</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-700">{tbl.serverCount}</td>
                            <td className="px-3 py-2 text-center">
                              {tbl.diff === 0 ? (
                                <span className="text-slate-400 font-mono">0</span>
                              ) : (
                                <span className="text-rose-600 font-bold font-mono">{tbl.diff > 0 ? `+${tbl.diff}` : tbl.diff}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {tbl.match ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <CheckCircle size={10} /> 1:1 Match
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                                  <AlertTriangle size={10} /> Discrepancy
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Host connection manual */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-sm border border-slate-800">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
              <HelpCircle className="text-indigo-400 w-4 h-4" />
              Universal DB Connection Guide
            </h3>

            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <p>
                You can host your database <strong>anywhere in the world</strong> (Hostinger, Whogohost, AWS, DigitalOcean, Google Cloud, etc.).
              </p>
              
              <p>
                If using Hostinger or other shared hosting, follow these quick steps:
              </p>

              <ol className="list-decimal pl-4 space-y-2 text-slate-400">
                <li>
                  Log into your hosting provider dashboard and open your control panel (e.g., <strong className="text-white">Hostinger hPanel</strong>).
                </li>
                <li>
                  Find the <strong className="text-white">"Remote MySQL"</strong> or <strong className="text-white">"Remote Database"</strong> settings.
                </li>
                <li>
                  Add a wildcard entry <code className="text-amber-400 select-all font-mono font-bold">%</code> or use this app's IP to allow secure connections.
                </li>
                <li>
                  Create a <strong className="text-white">Database User</strong>, grant them full privileges, and input those credentials here.
                </li>
              </ol>

              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-[11px]">
                <span className="text-amber-400 font-bold block mb-1">💡 Port tip:</span>
                MySQL databases use port <strong className="text-white">3306</strong>. Postgres databases use port <strong className="text-white">5432</strong>.
              </div>
            </div>
          </div>

          <div className="bg-card-theme-bg border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-3 text-sm flex items-center gap-2">
              <WifiOff size={16} className="text-rose-500" />
              Offline Capability
            </h3>
            <p className="text-xs text-slate-500 leading-normal">
              This app is designed to work <strong>100% offline</strong>. If your internet goes down, you can still record sales, manage inventory, and track installments.
            </p>
            <p className="text-xs text-slate-500 leading-normal mt-2">
              All data is saved securely in your browser's local storage. When you come back online, the app will automatically synchronize your changes with the cloud.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
