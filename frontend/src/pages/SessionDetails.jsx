import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Bot, Download, Copy, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Tag, Edit2, Save, X, AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function SessionDetails() {
    const { sessionId } = useParams();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [downloadOpen, setDownloadOpen] = useState(false);
    const navigate = useNavigate();
    const { isAdmin, user } = useAuth();
    const isMaster = user?.id === 'master_root_0';

    // Navigation state
    const [siblingIds, setSiblingIds] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);

    // Review status state
    const [reviewStatus, setReviewStatus] = useState('pending');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Master edit state
    const [editingTurnIndex, setEditingTurnIndex] = useState(null);
    const [editTurnData, setEditTurnData] = useState({ user_message: '', assistant_message: '' });
    const [savingTurn, setSavingTurn] = useState(false);
    const [editSummaryMode, setEditSummaryMode] = useState(false);
    const [editSummaryText, setEditSummaryText] = useState('');
    const [savingSummary, setSavingSummary] = useState(false);
    const [editSessionMode, setEditSessionMode] = useState(false);
    const [editSessionData, setEditSessionData] = useState({});
    const [savingSession, setSavingSession] = useState(false);

    // Close dropdowns on outside click
    const downloadRef = useRef(null);

    useEffect(() => {
        const handleOutside = (e) => {
            if (downloadRef.current && !downloadRef.current.contains(e.target)) {
                setDownloadOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    useEffect(() => {
        fetchData(true);
        fetchSiblings();
        const interval = setInterval(() => { fetchData(false); }, 5000);
        return () => clearInterval(interval);
    }, [sessionId]);

    const fetchSiblings = async () => {
        try {
            const sessRes = await api.get(`/api/session/${sessionId}`);
            const agentId = sessRes.data?.agent_id;
            if (!agentId) return;
            const params = new URLSearchParams({ agent_id: agentId, page: 1, limit: 200, sortBy: 'started_at', sortOrder: 'desc' });
            const res = await api.get(`/api/sessions?${params}`);
            if (res.data?.data) {
                const ids = res.data.data.map(s => s.session_id);
                setSiblingIds(ids);
                setCurrentIndex(ids.indexOf(sessionId));
            }
        } catch (err) { console.error('Failed to fetch siblings:', err); }
    };

    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            try {
                const sessRes = await api.get(`/api/session/${sessionId}`);
                setSession(prev => {
                    if (prev && prev.recordingUrl === sessRes.data.recordingUrl) {
                        return { ...sessRes.data, recordingUrl: prev.recordingUrl };
                    }
                    return sessRes.data;
                });
            } catch (sessErr) { console.error('Error fetching session:', sessErr); }

            try {
                const convRes = await api.get(`/api/conversation/${sessionId}`);
                setConversation(convRes.data);
                setReviewStatus(convRes.data?.review_status || 'pending');
            } catch {
                setConversation(null);
            }
        } catch (err) {
            console.error('Unexpected error in fetchData:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        setUpdatingStatus(true);
        try {
            await api.patch(`/api/user/conversations/${sessionId}/review-status`, { status: newStatus });
            setReviewStatus(newStatus);
            toast.success(`Status updated`);
        } catch { toast.error('Failed to update status'); }
        finally { setUpdatingStatus(false); }
    };

    const navigateToSession = (direction) => {
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < siblingIds.length) {
            const newId = siblingIds[newIndex];
            navigate(isAdmin ? `/admin/session/${newId}` : `/user/session/${newId}`, { replace: true });
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    };
    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    const formatSecondsToTime = (seconds) => {
        if (!seconds && seconds !== 0) return '-';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };

    const copyConversation = () => {
        if (!conversation?.turns) return;
        let text = '';
        conversation.turns.forEach(t => {
            text += `User: ${t.user_message || ''}\n`;
            text += `Assistant: ${t.assistant_message || ''}\n\n`;
        });
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const downloadConversation = (format) => {
        if (!conversation?.turns) return;
        const data = { session_id: sessionId, agent_name: conversation.agent_name || session?.agent_name, turns: conversation.turns };
        let content, filename, type;
        if (format === 'json') { content = JSON.stringify(data, null, 2); filename = `conversation_${sessionId}.json`; type = 'application/json'; }
        else if (format === 'csv') {
            const headers = 'Turn,Timestamp,User Message,Assistant Message\n';
            const rows = conversation.turns.map(t => `${t.turn_id},"${t.timestamp || ''}","${(t.user_message || '').replace(/"/g, '""')}","${(t.assistant_message || '').replace(/"/g, '""')}"`).join('\n');
            content = headers + rows; filename = `conversation_${sessionId}.csv`; type = 'text/csv';
        } else {
            let text = `Session ID: ${sessionId}\nAgent: ${conversation.agent_name || session?.agent_name || ''}\n\n--- Conversation ---\n\n`;
            conversation.turns.forEach(t => {
                if (t.timestamp) text += `[${formatTime(t.timestamp)}]\n`;
                text += `User: ${t.user_message || ''}\nAssistant: ${t.assistant_message || ''}\n\n`;
            });
            content = text; filename = `conversation_${sessionId}.txt`; type = 'text/plain';
        }
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        setDownloadOpen(false);
    };

    const getStatusStyle = (status) => {
        if (status === 'completed') return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
        if (status === 'needs_review') return { bg: '#fef9c3', color: '#854d0e', border: '#fde047' };
        return { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    };

    // Master: start editing a turn
    const startEditTurn = (index) => {
        const turn = conversation.turns[index];
        setEditTurnData({ user_message: turn.user_message || '', assistant_message: turn.assistant_message || '' });
        setEditingTurnIndex(index);
    };

    const saveTurn = async (index) => {
        setSavingTurn(true);
        try {
            await api.patch(`/api/master/conversations/${sessionId}/turn/${index}`, editTurnData);
            toast.success('Turn updated');
            setEditingTurnIndex(null);
            fetchData(false);
        } catch (e) {
            toast.error('Failed to save turn');
        } finally {
            setSavingTurn(false);
        }
    };

    const saveSummary = async () => {
        setSavingSummary(true);
        try {
            await api.patch(`/api/data-admin/sessions/${sessionId}/summary`, { summary: editSummaryText });
            toast.success('Summary updated');
            setEditSummaryMode(false);
            fetchData(false);
        } catch {
            toast.error('Failed to save summary');
        } finally {
            setSavingSummary(false);
        }
    };

    const saveSessionMeta = async () => {
        setSavingSession(true);
        try {
            await api.patch(`/api/master/sessions/${sessionId}`, editSessionData);
            toast.success('Session updated');
            setEditSessionMode(false);
            fetchData(false);
        } catch {
            toast.error('Failed to save session');
        } finally {
            setSavingSession(false);
        }
    };

    if (loading) return <div className="loading">Loading conversation...</div>;

    const statusStyle = getStatusStyle(reviewStatus);

    return (
        <>
            <Header />
            <div className="dashboard-layout">
                {/* Left Sidebar - Session Info */}
                <aside className="dashboard-sidebar">
                    {/* Mobile Toggle Header */}
                    <div className="sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)' }}>Session Details</h3>
                        {isSidebarOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>

                    <div className={`sidebar-content ${isSidebarOpen ? 'open' : ''}`}>
                        <div className="session-info-sidebar" style={{ flex: 1, overflowY: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h3 className="desktop-header" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>Session Details</h3>
                                {isMaster && (
                                    <button
                                        onClick={() => {
                                            if (!editSessionMode) {
                                                setEditSessionData({
                                                    agent_name: session?.agent_name || '',
                                                    started_at: session?.started_at || '',
                                                    ended_at: session?.ended_at || '',
                                                    duration_seconds: session?.duration_seconds || 0,
                                                    status: session?.status || ''
                                                });
                                            }
                                            setEditSessionMode(!editSessionMode);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: editSessionMode ? '#fef2f2' : 'white', color: editSessionMode ? '#dc2626' : 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        {editSessionMode ? <><X size={12} /> Cancel</> : <><Edit2 size={12} /> Edit</>}
                                    </button>
                                )}
                            </div>

                            {editSessionMode ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {[
                                        { label: 'Agent Name', key: 'agent_name', type: 'text' },
                                        { label: 'Started At', key: 'started_at', type: 'datetime-local' },
                                        { label: 'Ended At', key: 'ended_at', type: 'datetime-local' },
                                        { label: 'Duration (secs)', key: 'duration_seconds', type: 'number' },
                                        { label: 'Status', key: 'status', type: 'text' },
                                    ].map(field => (
                                        <div key={field.key}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>{field.label}</label>
                                            <input
                                                type={field.type}
                                                value={editSessionData[field.key] || ''}
                                                onChange={e => setEditSessionData(p => ({ ...p, [field.key]: e.target.value }))}
                                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', background: 'white' }}
                                            />
                                        </div>
                                    ))}
                                    <button onClick={saveSessionMeta} disabled={savingSession} style={{ padding: '8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <Save size={14} /> {savingSession ? 'Saving…' : 'Save Changes'}
                                    </button>
                                    <div style={{ fontSize: '0.7rem', color: '#ef4444', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <AlertCircle size={10} /> Master Admin change — cannot be undone
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="info-row"><span className="info-label">Agent Name</span><span className="info-value">{conversation?.agent_name || session?.agent_name || '-'}</span></div>
                                    <div className="info-row"><span className="info-label">Session ID</span><span className="info-value font-mono" style={{ fontSize: '0.8rem' }}>{sessionId}</span></div>
                                    <div className="info-row"><span className="info-label">Started</span><span className="info-value">{formatDateTime(session?.started_at || conversation?.first_message_at)}</span></div>
                                    <div className="info-row"><span className="info-label">Ended</span><span className="info-value">{formatDateTime(session?.ended_at || conversation?.last_message_at)}</span></div>
                                    <div className="info-row"><span className="info-label">Duration</span><span className="info-value">{formatSecondsToTime(session?.duration_seconds)}</span></div>
                                    <div className="info-row"><span className="info-label">Startup Time</span><span className="info-value">{formatSecondsToTime(session?.bot_start_seconds)}</span></div>
                                    <div className="info-row"><span className="info-label">Total Turns</span><span className="info-value">{conversation?.total_turns || conversation?.turns?.length || 0}</span></div>
                                    <div className="info-row"><span className="info-label">Last Synced</span><span className="info-value">{formatDateTime(session?.last_synced)}</span></div>
                                </>
                            )}

                            {/* Review Status */}
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                                <h4 style={{ marginBottom: '0.8rem', color: 'var(--primary)', fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Tag size={16} /> Review Status
                                </h4>
                                <select
                                    value={reviewStatus}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    disabled={updatingStatus}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem', border: `2px solid ${statusStyle.border}`, background: statusStyle.bg, color: statusStyle.color, fontWeight: '600', cursor: updatingStatus ? 'not-allowed' : 'pointer', outline: 'none', transition: 'all 0.2s' }}
                                >
                                    <option value="pending">📋 Pending</option>
                                    <option value="needs_review">⚠️ Needs Review</option>
                                    <option value="completed">✅ Completed</option>
                                </select>
                                {conversation?.reviewed_by && (
                                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                        Reviewed by {conversation.reviewer_email || conversation.reviewed_by}
                                        {conversation.reviewed_at && ` on ${formatDate(conversation.reviewed_at)}`}
                                    </div>
                                )}
                            </div>

                            {/* Summary with Master Edit */}
                            {conversation?.summary && (
                                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <h4 style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: '600' }}>Session Summary</h4>
                                        {isMaster && !editSummaryMode && (
                                            <button onClick={() => { setEditSummaryText(conversation.summary); setEditSummaryMode(true); }}
                                                style={{ fontSize: '0.7rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)' }}>
                                                <Edit2 size={10} /> Edit
                                            </button>
                                        )}
                                    </div>
                                    {editSummaryMode ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <textarea
                                                value={editSummaryText}
                                                onChange={e => setEditSummaryText(e.target.value)}
                                                rows={5}
                                                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', resize: 'vertical', lineHeight: 1.4 }}
                                            />
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button onClick={saveSummary} disabled={savingSummary} style={{ flex: 1, padding: '6px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>{savingSummary ? '...' : '✓ Save'}</button>
                                                <button onClick={() => setEditSummaryMode(false)} style={{ padding: '6px 10px', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{conversation.summary}</p>
                                    )}
                                </div>
                            )}

                            {/* Recording */}
                            {session?.recordingUrl && (
                                <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: '1.5rem', gap: '0.8rem' }}>
                                    <span className="info-label" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Call Recording</span>
                                    <audio controls preload="auto" style={{ width: '100%', height: '35px' }} src={`/api/proxy-recording?url=${encodeURIComponent(session.recordingUrl)}`}>
                                        Your browser does not support the audio element.
                                    </audio>
                                    <a href={`/api/proxy-recording?url=${encodeURIComponent(session.recordingUrl)}`} download={`recording-${sessionId}.mp3`} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Download size={14} /> Download Recording
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="sidebar-footer">
                            <button className="btn-logout" onClick={() => navigate(-1)}>
                                <ArrowLeft size={18} style={{ marginRight: '8px' }} /> Back
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'hidden', padding: 0, background: 'white' }}>
                    <div style={{ padding: '2rem 2rem 0 2rem', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b', padding: '5px', borderRadius: '50%', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#e2e8f0'} onMouseOut={(e) => e.currentTarget.style.background = 'none'}>
                                <ArrowLeft size={24} />
                            </button>
                            <h1 style={{ color: 'var(--primary)', fontSize: '1.5rem' }}>Conversation Logs</h1>
                            {isMaster && (
                                <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', border: '1px solid #fcd34d' }}>
                                    👑 Master Edit Mode
                                </span>
                            )}
                        </div>

                        {siblingIds.length > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button onClick={() => navigateToSession(-1)} disabled={currentIndex <= 0} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '500', border: '1px solid #e5e7eb', cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer', background: currentIndex <= 0 ? '#f8fafc' : 'white', color: currentIndex <= 0 ? '#cbd5e1' : '#374151', transition: 'all 0.2s' }}>
                                    <ChevronLeft size={16} /> Newer
                                </button>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', minWidth: '60px', textAlign: 'center' }}>{currentIndex + 1} / {siblingIds.length}</span>
                                <button onClick={() => navigateToSession(1)} disabled={currentIndex >= siblingIds.length - 1} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '500', border: '1px solid #e5e7eb', cursor: currentIndex >= siblingIds.length - 1 ? 'not-allowed' : 'pointer', background: currentIndex >= siblingIds.length - 1 ? '#f8fafc' : 'white', color: currentIndex >= siblingIds.length - 1 ? '#cbd5e1' : '#374151', transition: 'all 0.2s' }}>
                                    Older <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="conversation-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', border: 'none', boxShadow: 'none', borderRadius: 0, padding: '0 2rem 2rem 2rem' }}>
                        <div className="conversation-header">
                            <div className="conversation-actions" style={{ marginLeft: 'auto' }}>
                                <button className="btn-action" onClick={copyConversation} title="Copy conversation">
                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                                <div className="dropdown-container" ref={downloadRef}>
                                    <button className="btn-action" onClick={() => setDownloadOpen(!downloadOpen)}>
                                        <Download size={18} /> Download <ChevronDown size={14} />
                                    </button>
                                    {downloadOpen && (
                                        <div className="dropdown-menu">
                                            <button onClick={() => downloadConversation('json')}>JSON</button>
                                            <button onClick={() => downloadConversation('csv')}>CSV</button>
                                            <button onClick={() => downloadConversation('txt')}>TXT</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {!conversation || !conversation.turns || conversation.turns.length === 0 ? (
                            <div className="no-conversation"><p>No conversation logs found for this session.</p></div>
                        ) : (
                            <div className="chat-container">
                                {conversation.turns.map((turn, index) => (
                                    <div key={turn.turn_id || index} className="turn-block">
                                        {/* Master edit overlay */}
                                        {isMaster && editingTurnIndex === index ? (
                                            <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <Edit2 size={14} color="#d97706" />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#92400e' }}>Editing Turn {index + 1}</span>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', display: 'block' }}>User Message</label>
                                                    <textarea value={editTurnData.user_message} onChange={e => setEditTurnData(p => ({ ...p, user_message: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', display: 'block' }}>Assistant Message</label>
                                                    <textarea value={editTurnData.assistant_message} onChange={e => setEditTurnData(p => ({ ...p, assistant_message: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical' }} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => saveTurn(index)} disabled={savingTurn} style={{ flex: 1, padding: '8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                        <Save size={14} /> {savingTurn ? 'Saving…' : 'Save Turn'}
                                                    </button>
                                                    <button onClick={() => setEditingTurnIndex(null)} style={{ padding: '8px 16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {isMaster && (
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                                                        <button onClick={() => startEditTurn(index)} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fcd34d', background: '#fffbeb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: '#92400e' }}>
                                                            <Edit2 size={10} /> Edit Turn {index + 1}
                                                        </button>
                                                    </div>
                                                )}
                                                {turn.user_message && (
                                                    <div className="message user-message">
                                                        <div className="avatar user-avatar"><User size={20} /></div>
                                                        <div className="content">
                                                            <div className="message-header"><span className="role-label">User</span></div>
                                                            <div className="bubble user-bubble">{turn.user_message}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {turn.assistant_message && (
                                                    <div className="message bot-message">
                                                        <div className="avatar bot-avatar"><Bot size={20} /></div>
                                                        <div className="content">
                                                            <div className="message-header"><span className="role-label">Assistant</span></div>
                                                            <div className="bubble bot-bubble">{turn.assistant_message}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {siblingIds.length > 1 && (
                        <div style={{ padding: '12px 2rem', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button onClick={() => navigateToSession(-1)} disabled={currentIndex <= 0} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '0.9rem', border: 'none', cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer', background: currentIndex <= 0 ? '#e2e8f0' : '#008F4B', color: currentIndex <= 0 ? '#94a3b8' : 'white', transition: 'all 0.2s' }}>
                                <ChevronLeft size={18} /> Previous Session
                            </button>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Session {currentIndex + 1} of {siblingIds.length}</span>
                            <button onClick={() => navigateToSession(1)} disabled={currentIndex >= siblingIds.length - 1} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '0.9rem', border: 'none', cursor: currentIndex >= siblingIds.length - 1 ? 'not-allowed' : 'pointer', background: currentIndex >= siblingIds.length - 1 ? '#e2e8f0' : '#008F4B', color: currentIndex >= siblingIds.length - 1 ? '#94a3b8' : 'white', transition: 'all 0.2s' }}>
                                Next Session <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </main>
            </div>
        </>
    );
}
