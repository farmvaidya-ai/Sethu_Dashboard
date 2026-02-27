import React, { useState, useEffect, useRef } from 'react';
import { paymentAPI, adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import Header from '../components/Header';
import UsageHeatmap from '../components/UsageHeatmap';
import { Link } from 'react-router-dom';
import {
    CreditCard, Clock, CheckCircle, AlertCircle, Zap, Shield,
    PhoneCall, Download, ChevronLeft, ChevronRight,
    TrendingUp, Activity, Calendar, ArrowUpRight, ArrowDownLeft,
    Users, Link as LinkIcon, RefreshCw
} from 'lucide-react';

const Billing = () => {
    const { user: authUser, refreshUser } = useAuth();
    const [balances, setBalances] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [rechargeAmount, setRechargeAmount] = useState(1000);
    const [transactions, setTransactions] = useState([]);
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [transactionsPagination, setTransactionsPagination] = useState({ total: 0, totalPages: 1 });
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('overview'); // overview | history | admin
    const [filterTarget, setFilterTarget] = useState(authUser?.id || '');
    const [adjAmount, setAdjAmount] = useState('');
    const [adjTarget, setAdjTarget] = useState('');

    const transactionsLimit = 10;

    useEffect(() => { fetchBalances(); }, []);
    useEffect(() => { fetchTransactions(); }, [transactionsPage]);
    useEffect(() => {
        if (authUser?.role === 'super_admin' || authUser?.isMaster) {
            fetchUsers();
            setAdjTarget(authUser?.id);
        }
    }, [authUser]);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers({ limit: 100 });
            if (response.data?.users) setUsers(response.data.users);
        } catch (e) { console.error('Failed to fetch users:', e); }
    };

    const fetchTransactions = async () => {
        setProcessing(true);
        try {
            const response = await paymentAPI.getTransactionHistory('payments', transactionsPage, transactionsLimit);
            if (response.data.success) {
                setTransactions(response.data.data);
                if (response.data.pagination) setTransactionsPagination(response.data.pagination);
            }
        } catch (e) {
            toast.error('Could not load billing history');
        } finally { setProcessing(false); }
    };

    const fetchBalances = async () => {
        try {
            setLoading(true);
            const response = await paymentAPI.getBalances();
            if (response.data.success) setBalances(response.data.data);
        } catch (e) {
            toast.error('Failed to load billing details');
        } finally { setLoading(false); }
    };

    const handlePayment = async (type) => {
        try {
            setProcessing(true);
            let orderResponse;
            if (type === 'subscription') {
                orderResponse = await paymentAPI.createSubscription();
            } else {
                if (rechargeAmount < 1000) { toast.error('Minimum recharge amount is ₹1,000'); setProcessing(false); return; }
                orderResponse = await paymentAPI.createRecharge(rechargeAmount);
            }
            const { order_id, amount, key_id } = orderResponse.data;
            const options = {
                key: key_id, amount, currency: 'INR',
                name: 'FarmVaidya Admin',
                description: type === 'subscription' ? 'Monthly Platform Subscription' : `${amount / 100} Credits Recharge`,
                order_id,
                handler: async function (response) {
                    try {
                        const v = await paymentAPI.verifyPayment({ order_id: response.razorpay_order_id, payment_id: response.razorpay_payment_id, signature: response.razorpay_signature });
                        if (v.data.success) { toast.success('Payment successful! 🎉'); fetchBalances(); fetchTransactions(); if (refreshUser) refreshUser(); }
                        else toast.error('Payment verification failed');
                    } catch { toast.error('Payment verification failed'); }
                },
                prefill: { name: authUser?.name, contact: authUser?.phone_number, email: authUser?.email },
                theme: { color: '#008F4B' },
                modal: { ondismiss: () => setProcessing(false) }
            };
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (r) => { toast.error(r.error.description || 'Payment failed'); });
            rzp.open();
        } catch (e) {
            toast.error('Failed to initiate payment');
            setProcessing(false);
        }
    };

    const handleAdjustCredits = async () => {
        const amount = parseInt(adjAmount);
        if (isNaN(amount) || amount === 0) { toast.error('Enter a valid non-zero amount'); return; }
        try {
            const res = await paymentAPI.adjustCredits(amount, adjTarget || authUser?.id);
            if (res.data.success) {
                toast.success('Credits updated successfully ✓');
                setAdjAmount('');
                fetchBalances(); fetchTransactions(); fetchUsers();
                if (refreshUser) refreshUser();
            } else toast.error(res.data.message || 'Failed');
        } catch { toast.error('Error updating credits'); }
    };

    if (loading) return (
        <React.Fragment>
            <Header />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="spinner-small" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3, borderColor: 'var(--primary)' }} />
                    Loading billing details...
                </div>
            </div>
        </React.Fragment>
    );

    const isSubscriptionActive = balances?.subscription_expiry && new Date(balances.subscription_expiry) > new Date();
    const expiryDate = balances?.subscription_expiry ? new Date(balances.subscription_expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
    const balance = parseFloat(balances?.minutes_balance || 0);
    const isLowBalance = balance < 100;

    const tabs = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'history', label: '📋 Payment History' },
        ...(authUser?.role === 'super_admin' || authUser?.isMaster ? [{ id: 'admin', label: '⚙️ Admin Tools' }] : []),
    ];

    return (
        <React.Fragment>
            <Header />
            <div className="page-container" style={{ maxWidth: 1300 }}>
                {/* Page Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text)', marginBottom: '4px' }}>
                        Billing & Credits
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        Manage your subscription, call credits, and usage analytics
                    </p>
                </div>

                {/* Balance Summary Strip */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    {[
                        {
                            icon: <PhoneCall size={20} color="white" />,
                            bg: isLowBalance ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #008F4B, #006830)',
                            label: 'Available Credits',
                            value: balance.toFixed(2),
                            sub: isLowBalance ? '⚠️ Low balance' : 'Ready to use'
                        },
                        {
                            icon: <Shield size={20} color="white" />,
                            bg: isSubscriptionActive ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                            label: 'Subscription',
                            value: isSubscriptionActive ? 'Active' : 'Expired',
                            sub: isSubscriptionActive ? `Expires ${expiryDate}` : 'Renew required'
                        },
                        {
                            icon: <TrendingUp size={20} color="white" />,
                            bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            label: 'Credit Rate',
                            value: '3.5×',
                            sub: 'Credits per minute'
                        },
                        {
                            icon: <Activity size={20} color="white" />,
                            bg: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            label: 'Total Transactions',
                            value: transactionsPagination.total || '–',
                            sub: 'All time'
                        }
                    ].map((card, i) => (
                        <div key={i} style={{ background: card.bg, borderRadius: '16px', padding: '1.25rem', color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {card.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '800', lineHeight: 1 }}>{card.value}</div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '4px' }}>{card.label}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '2px' }}>{card.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: '#f3f4f6', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                            background: activeTab === tab.id ? 'white' : 'transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                            boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                        }}>{tab.label}</button>
                    ))}
                </div>

                {/* ==================== OVERVIEW TAB ==================== */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                        {/* Subscription Card */}
                        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #0284c7, #0ea5e9)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Shield size={20} color="#0284c7" /> Platform Access
                                    </h2>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Monthly Subscription Plan</p>
                                </div>
                                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', background: isSubscriptionActive ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)', color: isSubscriptionActive ? '#059669' : '#ef4444' }}>
                                    {isSubscriptionActive ? '✓ ACTIVE' : '✗ EXPIRED'}
                                </span>
                            </div>

                            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Current Plan</span>
                                    <span style={{ fontWeight: '700' }}>Admin Premium</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Expiry Date</span>
                                    <span style={{ fontWeight: '600', color: isSubscriptionActive ? 'var(--primary)' : '#ef4444' }}>{expiryDate}</span>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text)' }}>₹6,500</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/ month</span>
                                </div>
                            </div>

                            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {['Full Dashboard Access', '2 Concurrent Active Lines', 'Unlimited Agents & Users'].map(f => (
                                    <li key={f} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.875rem' }}>
                                        <CheckCircle size={16} color="var(--primary)" /> {f}
                                    </li>
                                ))}
                            </ul>

                            <button onClick={() => handlePayment('subscription')} disabled={processing || isSubscriptionActive}
                                style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: isSubscriptionActive ? 'var(--primary)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', fontWeight: '700', cursor: processing || isSubscriptionActive ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.95rem', transition: 'all 0.2s' }}>
                                {processing ? <div className="spinner-small" /> : <Zap size={18} />}
                                {processing ? 'Processing...' : isSubscriptionActive ? '✓ Plan Active' : 'Renew Subscription'}
                            </button>
                        </div>

                        {/* Call Credits Card */}
                        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <PhoneCall size={20} color="#d97706" /> Call Credits
                                    </h2>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Prepaid Credits Wallet</p>
                                </div>
                                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', background: isLowBalance ? 'rgba(239,68,68,0.1)' : 'rgba(5,150,105,0.1)', color: isLowBalance ? '#ef4444' : '#059669' }}>
                                    {isLowBalance ? '⚠️ LOW' : '✓ OK'}
                                </span>
                            </div>

                            {/* Big Balance Display */}
                            <Link to="/admin/usage-history" style={{ textDecoration: 'none', display: 'block', marginBottom: '1.5rem' }}>
                                <div style={{ background: isLowBalance ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'transform 0.2s', border: `1px solid ${isLowBalance ? '#fca5a5' : '#86efac'}` }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                                    <p style={{ color: isLowBalance ? '#dc2626' : 'var(--primary)', fontSize: '0.8rem', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Balance</p>
                                    <div style={{ fontSize: '3rem', fontWeight: '900', color: isLowBalance ? '#dc2626' : 'var(--text)', lineHeight: 1 }}>
                                        {balance.toFixed(2)}
                                        <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)', marginLeft: '8px' }}>credits</span>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Click to view usage ledger →</p>
                                </div>
                            </Link>

                            {isLowBalance && (
                                <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '10px', padding: '10px 14px', marginBottom: '1.25rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.4 }}>
                                        <strong>Low Balance!</strong> Calls will be blocked when balance reaches zero. Recharge now.
                                    </p>
                                </div>
                            )}

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Recharge Amount (₹)</label>
                                <div style={{ display: 'flex', alignItems: 'center', background: '#f9fafb', border: '2px solid var(--border)', borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.2s' }}
                                    onFocus={() => { }} >
                                    <span style={{ padding: '12px 14px', background: '#e5e7eb', color: 'var(--text-muted)', fontWeight: '700', borderRight: '1px solid var(--border)' }}>₹</span>
                                    <input type="number" min="1000" value={rechargeAmount || ''} onChange={(e) => setRechargeAmount(Number(e.target.value))}
                                        style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', outline: 'none', fontSize: '1rem', fontWeight: '600', color: 'var(--text)' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min: ₹1,000</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '700' }}>= {rechargeAmount || 0} Credits</span>
                                </div>
                                {/* Quick select buttons */}
                                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                    {[1000, 2000, 5000, 10000].map(v => (
                                        <button key={v} onClick={() => setRechargeAmount(v)}
                                            style={{ flex: 1, padding: '5px 0', fontSize: '0.75rem', fontWeight: '600', borderRadius: '6px', border: `1px solid ${rechargeAmount === v ? 'var(--primary)' : 'var(--border)'}`, background: rechargeAmount === v ? 'rgba(0,143,75,0.08)' : 'white', color: rechargeAmount === v ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
                                            ₹{v >= 1000 ? `${v / 1000}K` : v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button onClick={() => handlePayment('minutes')} disabled={processing}
                                style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #d97706, #b45309)', color: 'white', fontWeight: '700', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                {processing ? <div className="spinner-small" /> : <CreditCard size={18} />}
                                {processing ? 'Processing...' : `Recharge ₹${(rechargeAmount || 0).toLocaleString()}`}
                            </button>
                            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Rate: 3.5 credits / minute</p>
                        </div>

                        {/* Usage Heatmap Card */}
                        <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: '20px', padding: '2rem', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '8px' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Calendar size={20} color="var(--primary)" /> Usage Activity
                                    </h2>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Daily minute consumption over the past year</p>
                                </div>
                                <Link to="/admin/usage-history" style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    View Full Ledger <ArrowUpRight size={14} />
                                </Link>
                            </div>
                            <UsageHeatmap userId={authUser?.id} />
                        </div>
                    </div>
                )}

                {/* ==================== HISTORY TAB ==================== */}
                {activeTab === 'history' && (
                    <div style={{ background: 'white', borderRadius: '20px', padding: '1.5rem', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '8px' }}>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CreditCard size={20} color="var(--primary)" /> Payment History
                            </h2>
                            <button onClick={fetchTransactions} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                        </div>

                        {transactions.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <CreditCard size={48} style={{ opacity: 0.2, display: 'block', margin: '0 auto 16px' }} />
                                No payment transactions found
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table */}
                                <div className="table-container desktop-only">
                                    <table className="session-table">
                                        <thead>
                                            <tr>
                                                <th>Date & Time</th>
                                                <th>Description</th>
                                                <th>Type</th>
                                                <th style={{ textAlign: 'right' }}>Credit / Debit</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transactions.map((txn) => {
                                                const isCredit = txn.transaction_type === 'credit';
                                                const isCall = txn.type === 'call';
                                                const details = txn.details || {};
                                                const amount = isCredit ? txn.credit_amount : txn.debit_amount;
                                                const amountLabel = `${parseFloat(amount || 0).toFixed(2)} Credits`;
                                                const statusOk = ['captured', 'completed', 'Completed'].includes(details.status || txn.status);
                                                return (
                                                    <tr key={txn.id} className="session-row">
                                                        <td>
                                                            <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>{new Date(txn.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(txn.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: '600', color: 'var(--text)' }}>{txn.description}</div>
                                                            {isCall && (
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                    {details.from && details.to ? `${details.from} → ${details.to}` : details.from || details.to || ''}
                                                                    {details.session_id && (
                                                                        <Link to={`/admin/session/${details.session_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--primary)', textDecoration: 'none', fontWeight: '600', marginLeft: '8px' }}>
                                                                            <LinkIcon size={11} /> View Session
                                                                        </Link>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {!isCall && details.order_id && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>{details.order_id}</div>}
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', background: isCall ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: isCall ? '#6366f1' : '#10b981' }}>
                                                                {isCall ? <PhoneCall size={12} /> : isCredit ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                                                                {txn.type}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: '700', color: isCredit ? 'var(--primary)' : '#ef4444', fontSize: '1rem' }}>
                                                            {isCredit ? '+' : '-'}{amountLabel}
                                                        </td>
                                                        <td>
                                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', background: statusOk ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)', color: statusOk ? '#059669' : '#ef4444' }}>
                                                                {details.status || txn.status || 'completed'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Cards */}
                                <div className="mobile-only sessions-cards">
                                    {transactions.map((txn) => {
                                        const isCredit = txn.transaction_type === 'credit';
                                        const isCall = txn.type === 'call';
                                        const details = txn.details || {};
                                        const amount = isCredit ? txn.credit_amount : txn.debit_amount;
                                        return (
                                            <div key={txn.id} className="session-card">
                                                <div className="session-card-header">
                                                    <div style={{ fontWeight: '700', color: 'var(--text)' }}>{txn.description}</div>
                                                    <div style={{ fontWeight: '800', color: isCredit ? 'var(--primary)' : '#ef4444', fontSize: '1rem' }}>
                                                        {isCredit ? '+' : '-'}{parseFloat(amount || 0).toFixed(2)} C
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {new Date(txn.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                {isCall && details.session_id && (
                                                    <Link to={`/admin/session/${details.session_id}`} style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '600', marginTop: '4px', display: 'block' }}>
                                                        → View Session
                                                    </Link>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                    <button className="pagination-btn" disabled={transactionsPage === 1} onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}>
                                        <ChevronLeft size={16} /> Previous
                                    </button>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Page {transactionsPage} of {transactionsPagination.totalPages || 1}
                                    </span>
                                    <button className="pagination-btn" disabled={transactionsPage >= transactionsPagination.totalPages} onClick={() => setTransactionsPage(p => Math.min(transactionsPagination.totalPages, p + 1))}>
                                        Next <ChevronRight size={16} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ==================== ADMIN TOOLS TAB ==================== */}
                {activeTab === 'admin' && (authUser?.role === 'super_admin' || authUser?.isMaster) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Credit Adjustment */}
                        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', border: '2px solid #6366f1', boxShadow: '0 2px 12px rgba(99,102,241,0.08)' }}>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                                <Shield size={20} color="#6366f1" /> Credit Adjustment Tool
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                                        <Users size={14} style={{ display: 'inline', marginRight: '4px' }} />Target User
                                    </label>
                                    <select value={adjTarget} onChange={e => setAdjTarget(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '2px solid var(--border)', fontSize: '0.875rem', color: 'var(--text)', background: 'white' }}>
                                        <option value={authUser?.id}>My Account (Self)</option>
                                        {users.filter(u => u.user_id !== authUser?.id).map(u => (
                                            <option key={u.user_id} value={u.user_id}>
                                                {u.name || u.email} — {(u.minutes_balance || 0).toFixed(0)} credits
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Adjustment Amount</label>
                                    <input type="number" placeholder="+500 to add, -100 to deduct" value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '2px solid var(--border)', fontSize: '0.875rem', color: 'var(--text)', background: 'white' }} />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Positive = add, Negative = deduct</p>
                                </div>
                                <div>
                                    <button onClick={handleAdjustCredits}
                                        style={{ width: '100%', padding: '11px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '0.95rem' }}>
                                        ⚡ Update Balance
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Users Balance Overview */}
                        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                                <Users size={20} color="var(--primary)" /> All Users Credit Balances
                            </h2>
                            <div className="table-container">
                                <table className="session-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Role</th>
                                            <th style={{ textAlign: 'right' }}>Credits Balance</th>
                                            <th>Subscription</th>
                                            <th>Usage Heatmap</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => {
                                            const bal = parseFloat(u.minutes_balance || 0);
                                            const subActive = u.subscription_expiry && new Date(u.subscription_expiry) > new Date();
                                            return (
                                                <tr key={u.user_id} className="session-row">
                                                    <td>
                                                        <div style={{ fontWeight: '600' }}>{u.name || '—'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                                    </td>
                                                    <td><span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: u.role === 'super_admin' ? 'rgba(99,102,241,0.1)' : 'rgba(0,143,75,0.1)', color: u.role === 'super_admin' ? '#6366f1' : 'var(--primary)', fontWeight: '600' }}>{u.role}</span></td>
                                                    <td style={{ textAlign: 'right', fontWeight: '700', color: bal < 100 ? '#ef4444' : 'var(--text)' }}>
                                                        {bal.toFixed(2)}
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: subActive ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)', color: subActive ? '#059669' : '#ef4444', fontWeight: '600' }}>
                                                            {subActive ? '✓ Active' : '✗ Expired'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <UsageHeatmap userId={u.user_id} compact={true} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .spinner-small {
                    width: 18px; height: 18px;
                    border: 2px solid rgba(255,255,255,0.4);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                    display: inline-block;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 768px) {
                    .billing-tab-bar { overflow-x: auto; }
                }
            `}</style>
        </React.Fragment>
    );
};

export default Billing;
