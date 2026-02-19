import React, { useState, useEffect } from 'react';
import { paymentAPI } from '../services/api';
import Header from '../components/Header';
import { ArrowLeft, Clock, PhoneCall, AlertCircle, Zap, Shield, PlayCircle, Link as LinkIcon, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const UsageHistory = () => {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, payments, calls
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
    const limit = 10;

    useEffect(() => {
        setPage(1); // Reset to page 1 on filter change
    }, [filter]);

    useEffect(() => {
        fetchHistory();
    }, [page, filter]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const response = await paymentAPI.getTransactionHistory(filter, page, limit);
            if (response.data.success) {
                setTransactions(response.data.data);
                if (response.data.pagination) {
                    setPagination(response.data.pagination);
                }
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
            toast.error('Failed to load usage history');
        } finally {
            setLoading(false);
        }
    };

    return (
        <React.Fragment>
            <Header />
            <div className="page-container">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={() => navigate('/admin/billing')} className="btn-back">
                            <ArrowLeft size={16} /> Back
                        </button>
                        <h1>Minute Usage Ledger</h1>
                    </div>
                </div>

                <div className="card">
                    <div className="section-header" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <Clock size={20} color="var(--primary)" /> Complete Ledger
                            </h3>
                            <span className="section-count">{pagination.total} Records</span>
                        </div>

                        <div className="section-controls">
                            <div className="dropdown-container">
                                <select
                                    className="btn-sort"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    style={{ paddingRight: '2rem', appearance: 'none' }}
                                >
                                    <option value="all">All Transactions</option>
                                    <option value="calls">Call Usage Only</option>
                                    <option value="payments">Credits & Recharges</option>
                                </select>
                                <Filter size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                            Loading ledger...
                        </div>
                    ) : transactions.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No records found.
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="session-table">
                                <thead>
                                    <tr>
                                        <th>Date & Time</th>
                                        <th>Description</th>
                                        <th>Details</th>
                                        <th style={{ textAlign: 'right' }}>Credit / Debit</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((txn) => {
                                        const isCredit = txn.transaction_type === 'credit';
                                        const isCall = txn.type === 'call';
                                        const details = txn.details || {};

                                        // Determine Amount Logics
                                        const amountRaw = isCredit ? txn.credit_amount : txn.debit_amount;

                                        // Fix: If it's a subscription and amount is 0, show "Plan"
                                        const isPlan = txn.type === 'subscription' && amountRaw === 0;
                                        const finalAmountString = isPlan ? 'Plan' : `${amountRaw} min`;
                                        const sign = (isCredit && !isPlan) ? '+' : (isCredit ? '' : '-'); // No plus sign for Plan
                                        const color = isCredit ? 'var(--primary)' : '#ef4444';

                                        return (
                                            <tr key={txn.id} className="session-row">
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                                                        {new Date(txn.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {new Date(txn.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                                                        {isCall ? (
                                                            (details.status === 'Completed' || details.status === 'completed') ? <PhoneCall size={16} color="var(--primary)" /> : <AlertCircle size={16} color="#f59e0b" />
                                                        ) : (
                                                            txn.type === 'subscription' ? <Shield size={16} color="#8b5cf6" /> : <Zap size={16} color="#f59e0b" />
                                                        )}
                                                        {txn.description}
                                                    </div>
                                                </td>
                                                <td>
                                                    {isCall ? (
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            <div>
                                                                {details.from && details.to ? (
                                                                    <>
                                                                        <span style={{ fontWeight: '500', color: 'var(--text)' }}>From:</span> {details.from} <span style={{ margin: '0 4px' }}>→</span>
                                                                        <span style={{ fontWeight: '500', color: 'var(--text)' }}>To:</span> {details.to}
                                                                    </>
                                                                ) : details.from ? (
                                                                    <>
                                                                        <span style={{ fontWeight: '500', color: 'var(--text)' }}>From:</span> {details.from}
                                                                        <span style={{ color: '#64748b', marginLeft: '8px' }}>({details.direction === 'inbound' ? 'Incoming' : 'Outgoing'})</span>
                                                                    </>
                                                                ) : details.to ? (
                                                                    <>
                                                                        <span style={{ fontWeight: '500', color: 'var(--text)' }}>To:</span> {details.to}
                                                                        <span style={{ color: '#64748b', marginLeft: '8px' }}>({details.direction === 'inbound' ? 'Incoming' : 'Outgoing'})</span>
                                                                    </>
                                                                ) : (
                                                                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>📞 {details.direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call'}</span>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                                                                {details.session_id && (
                                                                    <Link
                                                                        to={`/admin/session/${details.session_id}`}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500', fontSize: '0.8rem' }}
                                                                    >
                                                                        <LinkIcon size={12} /> View Session
                                                                    </Link>
                                                                )}
                                                                {details.recording_url && (
                                                                    <a
                                                                        href={details.recording_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                                                                    >
                                                                        <PlayCircle size={12} /> Recording
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                            ORDER ID: {details.order_id || txn.id}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <span style={{
                                                        fontWeight: '700',
                                                        fontSize: '0.95rem',
                                                        color: color
                                                    }}>
                                                        {sign}{finalAmountString}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        background: (['captured', 'completed', 'Completed'].includes(details.status || txn.status))
                                                            ? 'rgba(0, 143, 75, 0.1)'
                                                            : (['Attempted', 'failed'].includes(details.status || txn.status)) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 143, 75, 0.1)',
                                                        color: (['captured', 'completed', 'Completed'].includes(details.status || txn.status))
                                                            ? 'var(--primary)'
                                                            : (['Attempted', 'failed'].includes(details.status || txn.status)) ? '#ef4444' : 'var(--primary)',
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
                    )}

                    {/* Pagination */}
                    <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                        <button
                            className="btn-secondary"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={{ opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <ChevronLeft size={16} /> Previous
                        </button>
                        <span className="pagination-info" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Page {page} of {pagination.totalPages}
                        </span>
                        <button
                            className="btn-secondary"
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                            style={{ opacity: page >= pagination.totalPages ? 0.5 : 1, cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>

                </div>
            </div>
        </React.Fragment>
    );
};

export default UsageHistory;
