import React, { useState, useEffect } from 'react';
import { paymentAPI, adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import Header from '../components/Header';
import { Link } from 'react-router-dom';
import { CreditCard, Clock, CheckCircle, AlertCircle, Zap, Shield, PhoneCall, PlayCircle, Link as LinkIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const Billing = () => {
    const { user: authUser, refreshUser } = useAuth();
    const [balances, setBalances] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const [transactions, setTransactions] = useState([]);
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchBalances();
        if (authUser?.role === 'super_admin' || authUser?.isMaster) {
            fetchUsers();
        }
    }, [authUser]);

    useEffect(() => {
        fetchTransactions();
    }, [transactionsPage]);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers({ limit: 100 }); // Fetch generous limit
            if (response.data && response.data.users) {
                setUsers(response.data.users);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };


    const [transactionsPagination, setTransactionsPagination] = useState({ total: 0, totalPages: 1 });
    const transactionsLimit = 10;

    const fetchTransactions = async () => {
        try {
            const response = await paymentAPI.getTransactionHistory('payments', transactionsPage, transactionsLimit);
            if (response.data.success) {
                setTransactions(response.data.data);
                if (response.data.pagination) setTransactionsPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
        }
    };

    const fetchBalances = async () => {
        try {
            setLoading(true);
            const response = await paymentAPI.getBalances();
            if (response.data.success) {
                setBalances(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch balances:', error);
            toast.error('Failed to load billing details');
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (type) => {
        try {
            setProcessing(true);
            let orderResponse;

            if (type === 'subscription') {
                orderResponse = await paymentAPI.createSubscription();
            } else {
                orderResponse = await paymentAPI.createRecharge();
            }

            const { order_id, amount, key_id, currency } = orderResponse.data;

            const options = {
                key: key_id,
                amount: amount,
                currency: "INR",
                name: "FarmVaidya Admin",
                description: type === 'subscription' ? "Monthly Platform Subscription" : "1000 Minutes Recharge",
                order_id: order_id,
                handler: async function (response) {
                    try {
                        const verifyResponse = await paymentAPI.verifyPayment({
                            order_id: response.razorpay_order_id,
                            payment_id: response.razorpay_payment_id,
                            signature: response.razorpay_signature
                        });

                        if (verifyResponse.data.success) {
                            toast.success('Payment successful!');
                            fetchBalances();
                            fetchTransactions();
                            if (refreshUser) refreshUser();
                        } else {
                            toast.error('Payment verification failed');
                        }
                    } catch (err) {
                        console.error("Verification error", err);
                        toast.error('Payment verification failed');
                    }
                },
                prefill: {
                    name: authUser?.name,
                    contact: authUser?.phone_number,
                    email: authUser?.email
                },
                retry: {
                    enabled: true
                },
                theme: {
                    color: "#008F4B"
                },
                modal: {
                    ondismiss: function () {
                        setProcessing(false);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                console.error('Razorpay Error:', response.error);
                toast.error(response.error.description || "Payment failed");
                if (response.error.code === 'BAD_REQUEST_ERROR') {
                    toast('Test Mode: Try the Admin Tools below to manually add credits if payment fails repeatedly.', {
                        icon: 'ℹ️',
                        duration: 6000
                    });
                }
            });
            rzp.open();

        } catch (error) {
            console.error('Payment initiation failed:', error);
            toast.error('Failed to initiate payment');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <React.Fragment>
                <Header />
                <div className="page-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
                    <div className="loading">Loading billing details...</div>
                </div>
            </React.Fragment>
        );
    }

    const isSubscriptionActive = balances?.subscription_expiry && new Date(balances.subscription_expiry) > new Date();
    const expiryDate = balances?.subscription_expiry ? new Date(balances.subscription_expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

    return (
        <React.Fragment>
            <Header />
            <div className="page-container">
                <div className="page-header">
                    <div className="header-center" style={{ justifyContent: 'flex-start' }}>
                        <h1>Billing & Subscription</h1>
                    </div>
                </div>

                <div className="billing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>

                    {/* Subscription Card */}
                    <div className="card" style={{ borderTop: '4px solid var(--primary)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Shield size={24} color="var(--primary)" />
                                    Platform Access
                                </h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '5px' }}>Monthly Subscription</p>
                            </div>
                            <div style={{
                                padding: '6px 12px',
                                borderRadius: '20px',
                                background: isSubscriptionActive ? 'rgba(0, 143, 75, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: isSubscriptionActive ? 'var(--primary)' : '#ef4444',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                {isSubscriptionActive ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {isSubscriptionActive ? 'ACTIVE' : 'EXPIRED'}
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Current Plan</span>
                                <span style={{ fontWeight: '600' }}>Admin Premium</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Expiry Date</span>
                                <span style={{ fontWeight: '600' }}>{expiryDate}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)' }}>₹6,500</span>
                                <span style={{ color: 'var(--text-muted)' }}>/ month</span>
                            </div>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <li style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text)' }}>
                                <CheckCircle size={16} color="var(--primary)" /> Full Dashboard Access
                            </li>
                            <li style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text)' }}>
                                <CheckCircle size={16} color="var(--primary)" /> 2 Concurrent Active Lines
                            </li>
                            <li style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text)' }}>
                                <CheckCircle size={16} color="var(--primary)" /> Unlimited Agents & Users
                            </li>
                        </ul>

                        <button
                            onClick={() => handlePayment('subscription')}
                            disabled={processing || isSubscriptionActive}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isSubscriptionActive ? 'var(--primary)' : '#2563eb', // Blue if inactive/expired
                                color: 'white',
                                fontWeight: '600',
                                cursor: processing || isSubscriptionActive ? 'not-allowed' : 'pointer',
                                opacity: processing ? 0.7 : 1,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {processing ? <div className="spinner-small"></div> : <Zap size={18} />}
                            {processing ? 'Processing...' : isSubscriptionActive ? 'Plan Active' : 'Renew Subscription'}
                        </button>
                    </div>

                    {/* Minutes Wallet Card */}
                    <div className="card" style={{ borderTop: '4px solid var(--secondary)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <PhoneCall size={24} color="#d97706" /> {/* Amber color */}
                                    Call Credits
                                </h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '5px' }}>Prepaid Minutes Wallet</p>
                            </div>
                            <div style={{
                                padding: '6px 12px',
                                borderRadius: '20px',
                                background: (balances?.minutes_balance || 0) > 100 ? 'rgba(0, 143, 75, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: (balances?.minutes_balance || 0) > 100 ? 'var(--primary)' : '#ef4444',
                                fontWeight: '700',
                                fontSize: '0.85rem'
                            }}>
                                {(balances?.minutes_balance || 0) > 0 ? 'AVAILABLE' : 'LOW BALANCE'}
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg)', borderRadius: '12px', textAlign: 'center' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Available Balance</p>
                            <Link to="/admin/usage-history" style={{ textDecoration: 'none', display: 'block' }}>
                                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: (balances?.minutes_balance || 0) <= 0 ? '#ef4444' : 'var(--text)', cursor: 'pointer' }} title="View Usage Ledger">
                                    {balances?.minutes_balance || 0}
                                    <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)', marginLeft: '6px' }}>mins</span>
                                </div>
                            </Link>
                        </div>

                        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px', marginBottom: '2rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: '1.4' }}>
                                <strong>Important:</strong> Outbound and Inbound calls will be blocked if your balance reaches zero. Please recharge to ensure uninterrupted service.
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', padding: '0 0.5rem' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Top-up Pack</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>1000 Minutes</span>
                        </div>

                        <button
                            onClick={() => handlePayment('minutes')}
                            disabled={processing}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#d97706', // Amber-600
                                color: 'white',
                                fontWeight: '600',
                                cursor: processing ? 'not-allowed' : 'pointer',
                                opacity: processing ? 0.7 : 1,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {processing ? <div className="spinner-small"></div> : <CreditCard size={18} />}
                            {processing ? 'Processing...' : 'Recharge ₹3,500'}
                        </button>
                        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                            Rate: ₹3.5 / minute
                        </p>
                        <Link to="/admin/usage-history" style={{
                            marginTop: '1rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.9rem',
                            color: 'var(--primary)',
                            textDecoration: 'none',
                            fontWeight: '600',
                            padding: '8px',
                            borderRadius: '6px',
                            background: 'rgba(0, 143, 75, 0.05)'
                        }}>
                            View Minutes Ledger <CreditCard size={14} />
                        </Link>
                    </div>

                    {/* Transaction History Card */}
                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                            <CreditCard size={20} color="var(--primary)" /> Payment History
                        </h3>

                        {!transactions ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading history...</div>
                        ) : transactions.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found</div>
                        ) : (
                            <div>
                                <div className="table-container">
                                    <table className="session-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Details</th>
                                                <th>Type</th>
                                                <th>Credit / Debit</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transactions.map((txn) => {
                                                const isCredit = txn.transaction_type === 'credit';
                                                const isCall = txn.type === 'call';
                                                const details = txn.details || {};

                                                // Determine Amount Display
                                                const amount = isCredit ? txn.credit_amount : txn.debit_amount;
                                                const amountLabel = isCall ? `${amount} mins` : (txn.type === 'subscription' ? 'Plan' : `${amount} mins`);

                                                return (
                                                    <tr key={txn.id} className="session-row">
                                                        <td>
                                                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                                                                {new Date(txn.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {new Date(txn.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: '500', color: 'var(--text)' }}>
                                                                {txn.description}
                                                            </div>
                                                            {isCall && (
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                    <div>
                                                                        {details.from && details.to ? (
                                                                            <>{`From: ${details.from} → To: ${details.to}`}</>
                                                                        ) : details.from ? (
                                                                            <>{`From: ${details.from}`} <span style={{ color: '#64748b' }}>({details.direction === 'inbound' ? 'Incoming' : 'Outgoing'})</span></>
                                                                        ) : details.to ? (
                                                                            <>{`To: ${details.to}`} <span style={{ color: '#64748b' }}>({details.direction === 'inbound' ? 'Incoming' : 'Outgoing'})</span></>
                                                                        ) : (
                                                                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>{details.direction === 'inbound' ? '📞 Incoming Call' : '📞 Outgoing Call'}</span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                                        {details.session_id && (
                                                                            <Link
                                                                                to={`/admin/session/${details.session_id}`}
                                                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}
                                                                            >
                                                                                <LinkIcon size={12} /> View Session
                                                                            </Link>
                                                                        )}
                                                                        {details.recording_url && (
                                                                            <a
                                                                                href={details.recording_url}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none' }}
                                                                            >
                                                                                <PlayCircle size={12} /> Listen
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!isCall && details.order_id && (
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                                    ID: {details.order_id}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {isCall ? (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                                                    {(details.status === 'Completed' || details.status === 'completed') ? (
                                                                        <PhoneCall size={14} color="var(--primary)" />
                                                                    ) : (
                                                                        <AlertCircle size={14} color="#f59e0b" />
                                                                    )}
                                                                    {details.status || 'Completed'}
                                                                </span>
                                                            ) : (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                                                    {txn.type === 'subscription' ? <Shield size={14} /> : <Zap size={14} />}
                                                                    {txn.type}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{
                                                            fontWeight: '700',
                                                            color: isCredit ? 'var(--primary)' : '#ef4444',
                                                            textAlign: 'right'
                                                        }}>
                                                            {isCredit ? '+' : '-'}{amountLabel}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '12px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '600',
                                                                background: (['captured', 'completed', 'Completed'].includes(details.status || txn.status)) ? 'rgba(0, 143, 75, 0.1)' : (['Attempted', 'failed'].includes(details.status || txn.status)) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 143, 75, 0.1)',
                                                                color: (['captured', 'completed', 'Completed'].includes(details.status || txn.status)) ? 'var(--primary)' : (['Attempted', 'failed'].includes(details.status || txn.status)) ? '#ef4444' : 'var(--primary)',
                                                                textTransform: 'capitalize'
                                                            }}>
                                                                {details.status || txn.status || 'Completed'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                    <button
                                        className="btn-secondary"
                                        disabled={transactionsPage === 1}
                                        onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                                        style={{
                                            opacity: transactionsPage === 1 ? 0.5 : 1,
                                            cursor: transactionsPage === 1 ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '6px 12px', fontSize: '0.85rem'
                                        }}
                                    >
                                        <ChevronLeft size={16} /> Previous
                                    </button>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        Page {transactionsPage} of {transactionsPagination.totalPages || 1}
                                    </span>
                                    <button
                                        className="btn-secondary"
                                        disabled={transactionsPage >= transactionsPagination.totalPages}
                                        onClick={() => setTransactionsPage(p => Math.min(transactionsPagination.totalPages, p + 1))}
                                        style={{
                                            opacity: transactionsPage >= transactionsPagination.totalPages ? 0.5 : 1,
                                            cursor: transactionsPage >= transactionsPagination.totalPages ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '6px 12px', fontSize: '0.85rem'
                                        }}
                                    >
                                        Next <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Admin Tools (Super Admin / Master Only) */}
                    {(authUser?.role === 'super_admin' || authUser?.isMaster) && (
                        <div className="card" style={{ gridColumn: '1 / -1', borderTop: '4px solid #6366f1' }}>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                                <Shield size={20} color="#6366f1" /> Admin Tools
                            </h3>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Target User
                                    </label>
                                    <select
                                        id="admin-target-user"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-card)',
                                            color: 'var(--text)'
                                        }}
                                        defaultValue={authUser?.id}
                                    >
                                        <option value={authUser?.id}>My Account (Self)</option>
                                        {users.filter(u => u.user_id !== authUser?.id).map(u => (
                                            <option key={u.user_id} value={u.user_id}>
                                                {u.name || u.email} ({u.role}) - Bal: {u.minutes_balance || 0}m
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Credit Adjustment (Add/Deduct Minutes)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="Enter minutes (e.g. 500 or -100)"
                                        id="admin-credit-input"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-card)',
                                            color: 'var(--text)'
                                        }}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        Use positive values to add, negative to deduct.
                                    </small>
                                </div>
                                <button
                                    onClick={async () => {
                                        const input = document.getElementById('admin-credit-input');
                                        const userSelect = document.getElementById('admin-target-user');
                                        const amount = parseInt(input.value);
                                        const targetUserId = userSelect ? userSelect.value : authUser?.id;

                                        if (isNaN(amount) || amount === 0) {
                                            toast.error('Please enter a valid non-zero amount');
                                            return;
                                        }

                                        try {
                                            const response = await paymentAPI.adjustCredits(amount, targetUserId);
                                            if (response.data.success) {
                                                toast.success('Credits updated successfully');
                                                input.value = '';

                                                if (targetUserId === authUser.id) {
                                                    fetchBalances();
                                                    fetchTransactions();
                                                    if (refreshUser) refreshUser();
                                                }
                                                fetchUsers();
                                            } else {
                                                toast.error(response.data.message || 'Failed to update credits');
                                            }
                                        } catch (err) {
                                            console.error(err);
                                            toast.error('Error updating credits');
                                        }
                                    }}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#6366f1',
                                        color: 'white',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        marginBottom: '6px'
                                    }}
                                >
                                    Update Balance
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            <style>{`
                .spinner-small {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #ffffff;
                    border-top: 2px solid transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </React.Fragment >
    );
};

export default Billing;
