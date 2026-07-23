/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart3, 
  ShoppingBag, 
  Boxes, 
  Shield, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  UserCheck, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { User, UserRole } from '../types';
import { storage } from '../lib/storage';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  settings: any;
}

export default function Login({ onLoginSuccess, settings }: LoginProps) {
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Check local storage / DB users first
      const allUsers = storage.getUsers();
      const existingUser = allUsers.find(u => u.email.trim().toLowerCase() === cleanEmail);

      if (existingUser && existingUser.disabled) {
        setError('Your account has been disabled by the administrator. Please contact support.');
        setLoading(false);
        return;
      }

      // Try Firebase Auth if configured
      let firebaseUser = null;
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        firebaseUser = cred.user;
      } catch (fbErr: any) {
        console.warn('Firebase email login attempt failed/skipped:', fbErr?.message);
      }

      if (existingUser) {
        // Verify local password if present or allow if match
        if (existingUser.password && existingUser.password !== password && !firebaseUser) {
          setError('Incorrect password. Please verify your password and try again.');
          setLoading(false);
          return;
        }

        // Successfully authenticated existing user
        storage.setAuth(existingUser);
        await storage.init();
        onLoginSuccess(existingUser);
        return;
      }

      // If user came via Firebase but not in local DB
      if (firebaseUser) {
        const isFirstUser = allUsers.length === 0;
        const newUserRole: UserRole = isFirstUser ? 'admin' : 'sales';
        const newDbUser: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || cleanEmail.split('@')[0],
          email: cleanEmail,
          password: password,
          role: newUserRole,
          permissions: newUserRole === 'admin'
            ? { create: true, edit: true, delete: true, stockIn: true, stockOut: true }
            : { create: true, edit: false, delete: false, stockIn: false, stockOut: false },
          createdAt: new Date().toISOString()
        };

        const updated = [...allUsers, newDbUser];
        storage.saveUsers(updated);
        storage.setAuth(newDbUser);
        await storage.init();
        onLoginSuccess(newDbUser);
        return;
      }

      // User not found anywhere
      setError('No registered account found with this email. Please contact your system administrator to obtain access.');
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err?.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      const googleUser = res.user;
      if (!googleUser || !googleUser.email) {
        throw new Error('Google sign in did not return a valid email.');
      }

      const cleanEmail = googleUser.email.trim().toLowerCase();
      const allUsers = storage.getUsers();
      const existingUser = allUsers.find(u => u.email.trim().toLowerCase() === cleanEmail);

      if (existingUser) {
        if (existingUser.disabled) {
          setError('Your account has been disabled by the administrator.');
          setLoading(false);
          return;
        }
        storage.setAuth(existingUser);
        await storage.init();
        onLoginSuccess(existingUser);
        return;
      }

      // Create new user for Google login
      const isFirstUser = allUsers.length === 0;
      const newUserRole: UserRole = isFirstUser ? 'admin' : 'sales';
      const newGoogleUser: User = {
        id: googleUser.uid,
        name: googleUser.displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: newUserRole,
        permissions: newUserRole === 'admin'
          ? { create: true, edit: true, delete: true, stockIn: true, stockOut: true }
          : { create: true, edit: false, delete: false, stockIn: false, stockOut: false },
        createdAt: new Date().toISOString()
      };

      storage.saveUsers([...allUsers, newGoogleUser]);
      storage.setAuth(newGoogleUser);
      await storage.init();
      onLoginSuccess(newGoogleUser);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        console.log('Google login popup closed by user.');
        // User intentionally closed the popup, no action needed
      } else if (err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-blocked') {
        setError('Google login popup was closed or blocked. Please enter your email and password above.');
      } else {
        console.error('Google login error:', err);
        setError('Google login failed: ' + (err?.message || 'Please use email and password sign in.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200/80 overflow-hidden flex flex-col md:flex-row"
      >
        {/* Left Visual Sidebar */}
        <div 
          className="p-8 md:w-5/12 flex flex-col justify-between relative overflow-hidden text-white"
          style={{ backgroundColor: settings?.sidebarColor || '#1e293b' }}
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <BarChart3 className="text-white w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white leading-tight">HYSAM VENTURES</h1>
                <p className="text-indigo-200 text-[11px] font-medium tracking-wide">Enterprise Operations Suite</p>
              </div>
            </div>

            <div className="space-y-3.5 my-6">
              <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-start gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl shrink-0 mt-0.5">
                  <ShoppingBag size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Point of Sale & Payments</div>
                  <p className="text-[11px] text-slate-300 leading-tight mt-0.5">Instant checkout, installment recording, receipts & sales returns.</p>
                </div>
              </div>

              <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-300 rounded-xl shrink-0 mt-0.5">
                  <Boxes size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Central Inventory</div>
                  <p className="text-[11px] text-slate-300 leading-tight mt-0.5">Real-time stock level updates & auto low-stock warnings.</p>
                </div>
              </div>

              <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-start gap-3">
                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl shrink-0 mt-0.5">
                  <Shield size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Single-Email Verification</div>
                  <p className="text-[11px] text-slate-300 leading-tight mt-0.5">Unique user identity linked securely to your account email.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Database Sync Connected
            </span>
            <span>v1.3.0</span>
          </div>
        </div>

        {/* Right Auth Area */}
        <div className="p-8 md:w-7/12 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Sign in with your registered email address and password.
            </p>
          </div>

          {/* Feedback Messages */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl font-medium leading-relaxed flex items-start gap-2.5"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-medium leading-relaxed flex items-start gap-2.5"
            >
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>{successMsg}</div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In to Account
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-5">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-white">
              Alternative Options
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Social / Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserCheck size={16} className="text-indigo-600" />
            Sign In with Google SSO
          </button>
        </div>
      </motion.div>
    </div>
  );
}

