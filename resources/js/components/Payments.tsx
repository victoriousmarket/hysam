/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { CreditCard, Plus, Search, Calendar, User as UserIcon, CheckCircle2, Printer } from 'lucide-react';
import { storage } from '../lib/storage';
import { Sale, Payment, User } from '../types';
import { hasModulePermission } from '../lib/rbac';
import ReceiptModal from './ReceiptModal';

interface PaymentsProps {
  user: User;
}

export default function Payments({ user }: PaymentsProps) {
  const [settings] = useState(storage.getSettings());
  const [sales, setSales] = useState<Sale[]>(storage.getSales());
  const [payments, setPayments] = useState<Payment[]>(storage.getPayments());

  useEffect(() => {
    const refreshData = () => {
      setSales(storage.getSales());
      setPayments(storage.getPayments());
    };
    window.addEventListener('hysam-data-updated', refreshData);
    window.addEventListener('hysam-sync-end', refreshData);
    return () => {
      window.removeEventListener('hysam-data-updated', refreshData);
      window.removeEventListener('hysam-sync-end', refreshData);
    };
  }, []);
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('Cash');

  const canCreate = hasModulePermission(user, 'payments', 'create');

  const getSaleBalance = (sale: Sale) => {
    const salePayments = payments.filter(p => p.saleId === sale.id);
    const paidFromPayments = salePayments.reduce((acc, p) => acc + p.amount, 0);
    const initialPaid = sale.paidAmount !== undefined 
      ? sale.paidAmount 
      : ((sale.cashAmount || 0) + (sale.posAmount || 0));
    const currentPaid = Math.max(initialPaid, paidFromPayments);
    return Math.max(0, sale.totalAmount - currentPaid);
  };

  const installmentSales = useMemo(() => {
    return sales.filter(s => {
      if (s.status !== 'installment') return false;
      const query = search.toLowerCase().trim();
      if (!query) return true;
      return s.id.toLowerCase().includes(query) || s.customerName.toLowerCase().includes(query);
    });
  }, [sales, search]);

  const handleAddPayment = async () => {
    if (!selectedSale || amount <= 0) return;

    const balance = getSaleBalance(selectedSale);
    if (amount > balance + 0.01) {
      alert(`Amount exceeds remaining balance (${settings.currency}${balance.toLocaleString()})`);
      return;
    }

    if (!window.confirm(`Confirm recording payment of ${settings.currency}${amount.toLocaleString()} via ${method} for ${selectedSale.customerName}?`)) {
      return;
    }

    const currentPaid = selectedSale.totalAmount - balance;
    const newTotalPaid = currentPaid + amount;
    const isFullyPaid = newTotalPaid >= selectedSale.totalAmount - 0.01;
    const newStatus = isFullyPaid ? 'completed' : 'installment';

    const newPayment: Payment = {
      id: 'PAY-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      saleId: selectedSale.id,
      amount,
      method,
      timestamp: new Date().toISOString(),
      recordedBy: user.id
    };

    const allPayments = [newPayment, ...payments];
    storage.savePayments(allPayments);

    // Update sale status in storage
    const allSales = storage.getSales();
    const updatedSales = allSales.map(s => 
      s.id === selectedSale.id ? { ...s, status: newStatus as any, paidAmount: newTotalPaid } : s
    );
    storage.saveSales(updatedSales);
    setSales(updatedSales);

    storage.logActivity({
      type: 'payment',
      description: `Payment of ${settings.currency}${amount.toLocaleString()} received for order #${selectedSale.id} (${selectedSale.customerName}). Status: ${newStatus.toUpperCase()}`,
      userId: user.id,
      userName: user.name
    });

    setPayments(allPayments);
    await storage.sync();

    setSelectedSale(null);
    setAmount(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Installment Payments</h2>
          <p className="text-slate-500">Track and collect payments for pending sales</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search customer..."
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-theme w-full md:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Collections */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="text-primary-theme" size={20} />
            Pending Collections
          </h3>
          <div className="space-y-3">
            {installmentSales.length === 0 ? (
              <p className="text-slate-500 italic p-8 text-center bg-card-theme-bg rounded-2xl border border-slate-100">No pending installments</p>
            ) : (
              installmentSales.map((sale) => {
                const balance = getSaleBalance(sale);
                return (
                  <div key={sale.id} className="bg-card-theme-bg p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-primary-theme-light transition-colors">
                    <div>
                      <div className="font-bold text-slate-900 mb-1">{sale.customerName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-4">
                        <span>Balance: <span className="font-mono font-bold text-rose-600">{settings.currency}{balance.toLocaleString()}</span></span>
                        <span>Total: {settings.currency}{sale.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                    {canCreate && (
                      <button 
                        onClick={() => {
                          setSelectedSale(sale);
                          setAmount(balance);
                        }}
                        className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm group-hover:bg-primary-theme group-hover:text-white transition-all cursor-pointer"
                      >
                        Record Payment
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Payment History */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="text-accent-theme" size={20} />
            Recent History
          </h3>
          <div className="bg-card-theme-bg rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment) => {
                    const linkedSale = sales.find(s => s.id === payment.saleId);
                    return (
                      <tr key={payment.id} className="hover:bg-layout-theme-bg">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-slate-900">{settings.currency}{(payment.amount || 0).toLocaleString()}</div>
                          <div className="text-xs text-slate-600 font-medium">{linkedSale?.customerName || 'General Sale'}</div>
                          <div className="text-[10px] uppercase text-slate-400 font-mono tracking-wider">{payment.method}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-xs text-slate-500 mb-1">{new Date(payment.timestamp).toLocaleString()}</div>
                          {linkedSale && (
                            <button
                              onClick={() => setReceiptSale(linkedSale)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-theme hover:text-primary-theme-dark bg-primary-theme-light hover:bg-primary-theme-light px-2 py-0.5 rounded transition-colors cursor-pointer"
                              title="Print Receipt"
                            >
                              <Printer size={12} />
                              Receipt
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-card-theme-bg rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-primary-theme-light rounded-2xl flex items-center justify-center text-primary-theme">
                <CreditCard size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Record Payment</h3>
                <p className="text-sm text-slate-500">For {selectedSale.customerName}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">{settings.currency}</span>
                  <input 
                    type="number"
                    className="w-full pl-8 pr-4 py-3 bg-layout-theme-bg border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-theme focus:outline-none font-bold text-lg"
                    value={amount || ''}
                    onChange={(e) => setAmount(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Method</label>
                <select 
                  className="w-full px-4 py-3 bg-layout-theme-bg border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-theme focus:outline-none"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>POS</option>
                  <option>Cheque</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setSelectedSale(null)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-layout-theme-bg rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddPayment}
                  className="flex-[2] bg-primary-theme text-white py-3 rounded-xl font-bold shadow-lg shadow-primary-theme-light hover:bg-primary-theme-hover active:scale-95 transition-all"
                >
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal 
        sale={receiptSale} 
        onClose={() => setReceiptSale(null)} 
        settings={settings} 
      />
    </div>
  );
}
