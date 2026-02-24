import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import toast from 'react-hot-toast';
import { Save, RefreshCw, Phone, Megaphone, Gauge, ArrowLeft, Info, Lock, Unlock } from 'lucide-react';

export default function Settings() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        total_throttle_cpm: 4,
        campaign_throttle_cpm: 2,
        calls_throttle_cpm: 2,
    });
    const [lastUpdated, setLastUpdated] = useState(null);
    const [totalLocked, setTotalLocked] = useState(true); // Total lines locked by default (purchased from Exotel)

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await settingsAPI.getSettings();
            if (res.data?.settings) {
                const s = res.data.settings;
                setSettings({
                    total_throttle_cpm: parseInt(s.total_throttle_cpm?.value) || 4,
                    campaign_throttle_cpm: parseInt(s.campaign_throttle_cpm?.value) || 2,
                    calls_throttle_cpm: parseInt(s.calls_throttle_cpm?.value) || 2,
                });
                const times = Object.values(s).map(v => v.updatedAt).filter(Boolean);
                if (times.length > 0) {
                    setLastUpdated(new Date(Math.max(...times.map(t => new Date(t)))).toLocaleString());
                }
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    // Auto-equalize: when total changes, split equally
    const handleTotalChange = (newTotal) => {
        const val = parseInt(newTotal) || 0;
        const half = Math.floor(val / 2);
        const remainder = val - half * 2;
        setSettings({
            total_throttle_cpm: val,
            campaign_throttle_cpm: half,
            calls_throttle_cpm: half + remainder,
        });
    };

    const handleSave = async () => {
        const total = parseInt(settings.total_throttle_cpm);
        const campaign = parseInt(settings.campaign_throttle_cpm);
        const calls = parseInt(settings.calls_throttle_cpm);

        if (isNaN(total) || total < 1) {
            toast.error('Total lines must be at least 1');
            return;
        }
        if (isNaN(campaign) || campaign < 0) {
            toast.error('Campaign lines cannot be negative');
            return;
        }
        if (isNaN(calls) || calls < 0) {
            toast.error('Normal call lines cannot be negative');
            return;
        }
        if (campaign + calls > total) {
            toast.error(`Campaign (${campaign}) + Normal Calls (${calls}) cannot exceed Total (${total}) lines`);
            return;
        }

        try {
            setSaving(true);
            await settingsAPI.updateSettings(settings);
            toast.success('Settings saved successfully!');
            fetchSettings();
        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            toast.error('Failed to save: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    const remaining = settings.total_throttle_cpm - settings.campaign_throttle_cpm - settings.calls_throttle_cpm;

    return (
        <div>
            <Header />
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px',
                            padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            color: '#64748b'
                        }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1a1a1a' }}>System Settings</h1>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                            Configure active call lines for campaigns and normal calls
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        <RefreshCw size={24} className="spin" />
                        <p>Loading settings...</p>
                    </div>
                ) : (
                    <>
                        {/* Line Configuration Card */}
                        <div style={{
                            background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0',
                            padding: '2rem', marginBottom: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                                <Gauge size={22} color="#008F4B" />
                                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1f2937' }}>Active Call Lines Configuration</h2>
                            </div>

                            {/* Info banner */}
                            <div style={{
                                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
                                padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', gap: '10px',
                                alignItems: 'flex-start'
                            }}>
                                <Info size={18} color="#16a34a" style={{ marginTop: '2px', flexShrink: 0 }} />
                                <div style={{ fontSize: '0.85rem', color: '#166534', lineHeight: '1.5' }}>
                                    <strong>How it works:</strong> Your Exotel account has a fixed number of active call lines.
                                    Split these lines between campaigns and normal (direct) calls. Each line can handle
                                    one concurrent call at a time.
                                    <br /><br />
                                    <strong>Sequential processing:</strong> If a campaign has more contacts than available lines,
                                    calls are queued automatically. For example, with 2 campaign lines and 6 contacts,
                                    2 calls go out first; as each call ends, the next one begins until all contacts are reached.
                                    The same applies to normal calls.
                                    <br /><br />
                                    <strong>Default split:</strong> When total lines change, they are split equally between
                                    campaigns and normal calls. You can adjust the split manually.
                                </div>
                            </div>

                            {/* Total Lines - Locked by default (purchased from Exotel) */}
                            <div style={{
                                background: totalLocked ? '#f1f5f9' : '#f8fafc', borderRadius: '12px', padding: '1.25rem',
                                marginBottom: '1rem', border: `1px solid ${totalLocked ? '#cbd5e1' : '#e2e8f0'}`,
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Gauge size={18} color="#475569" />
                                        <label style={{ fontWeight: '600', fontSize: '0.95rem', color: '#1f2937' }}>
                                            Total Active Lines (Purchased)
                                        </label>
                                    </div>
                                    <button
                                        onClick={() => setTotalLocked(!totalLocked)}
                                        title={totalLocked ? 'Unlock to edit (only when you purchase more lines)' : 'Lock total lines'}
                                        style={{
                                            background: totalLocked ? '#e2e8f0' : '#fef3c7', border: 'none',
                                            borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            fontSize: '0.75rem', color: totalLocked ? '#64748b' : '#d97706',
                                            fontWeight: '500', transition: 'all 0.2s'
                                        }}
                                    >
                                        {totalLocked ? <><Lock size={14} /> Locked</> : <><Unlock size={14} /> Unlocked</>}
                                    </button>
                                </div>
                                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#64748b' }}>
                                    Lines purchased from your Exotel plan. Only change this when you buy more lines.
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={settings.total_throttle_cpm}
                                        onChange={e => handleTotalChange(e.target.value)}
                                        disabled={totalLocked}
                                        style={{
                                            width: '120px', padding: '10px 14px', borderRadius: '8px',
                                            border: `2px solid ${totalLocked ? '#cbd5e1' : '#e2e8f0'}`, fontSize: '1.1rem', fontWeight: '600',
                                            textAlign: 'center', outline: 'none',
                                            background: totalLocked ? '#e2e8f0' : '#fff',
                                            color: totalLocked ? '#475569' : '#1f2937',
                                            cursor: totalLocked ? 'not-allowed' : 'text'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#64748b' }}>lines</span>
                                    {totalLocked && (
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            Click unlock to change
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Split section */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem',
                                marginBottom: '1rem'
                            }}>
                                {/* Campaign Lines */}
                                <div style={{
                                    background: '#fffbeb', borderRadius: '12px', padding: '1.25rem',
                                    border: '1px solid #fde68a'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <Megaphone size={18} color="#d97706" />
                                        <label style={{ fontWeight: '600', fontSize: '0.9rem', color: '#92400e' }}>
                                            Campaign Lines
                                        </label>
                                    </div>
                                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#a16207' }}>
                                        Lines reserved for campaign outbound calls.
                                    </p>
                                    <input
                                        type="number"
                                        min="0"
                                        max={settings.total_throttle_cpm}
                                        value={settings.campaign_throttle_cpm}
                                        onChange={e => setSettings({ ...settings, campaign_throttle_cpm: parseInt(e.target.value) || 0 })}
                                        style={{
                                            width: '100px', padding: '10px 14px', borderRadius: '8px',
                                            border: '2px solid #fde68a', fontSize: '1.1rem', fontWeight: '600',
                                            textAlign: 'center', outline: 'none', background: '#fff'
                                        }}
                                    />
                                    <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#a16207' }}>lines</span>
                                </div>

                                {/* Normal Calls Lines */}
                                <div style={{
                                    background: '#eff6ff', borderRadius: '12px', padding: '1.25rem',
                                    border: '1px solid #bfdbfe'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <Phone size={18} color="#2563eb" />
                                        <label style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1e40af' }}>
                                            Normal Calls Lines
                                        </label>
                                    </div>
                                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#3b82f6' }}>
                                        Lines reserved for direct/normal calls.
                                    </p>
                                    <input
                                        type="number"
                                        min="0"
                                        max={settings.total_throttle_cpm}
                                        value={settings.calls_throttle_cpm}
                                        onChange={e => setSettings({ ...settings, calls_throttle_cpm: parseInt(e.target.value) || 0 })}
                                        style={{
                                            width: '100px', padding: '10px 14px', borderRadius: '8px',
                                            border: '2px solid #bfdbfe', fontSize: '1.1rem', fontWeight: '600',
                                            textAlign: 'center', outline: 'none', background: '#fff'
                                        }}
                                    />
                                    <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#3b82f6' }}>lines</span>
                                </div>
                            </div>

                            {/* Summary bar */}
                            <div style={{
                                background: remaining < 0 ? '#fef2f2' : '#f0fdf4',
                                border: `1px solid ${remaining < 0 ? '#fecaca' : '#bbf7d0'}`,
                                borderRadius: '10px', padding: '12px 16px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexWrap: 'wrap', gap: '8px'
                            }}>
                                <div style={{ fontSize: '0.85rem', color: remaining < 0 ? '#dc2626' : '#166534' }}>
                                    <strong>Allocation:</strong>{' '}
                                    Campaign ({settings.campaign_throttle_cpm}) + Normal Calls ({settings.calls_throttle_cpm}) = {settings.campaign_throttle_cpm + settings.calls_throttle_cpm} / {settings.total_throttle_cpm} lines
                                </div>
                                {remaining < 0 && (
                                    <div style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: '600' }}>
                                        Exceeds total by {Math.abs(remaining)} lines!
                                    </div>
                                )}
                                {remaining > 0 && (
                                    <div style={{ fontSize: '0.82rem', color: '#16a34a' }}>
                                        {remaining} lines unallocated (available as buffer)
                                    </div>
                                )}
                                {remaining === 0 && (
                                    <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: '600' }}>
                                        Fully allocated
                                    </div>
                                )}
                            </div>

                            {/* Visual line bar */}
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Line Allocation</div>
                                <div style={{
                                    display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden',
                                    border: '1px solid #e2e8f0', background: '#f1f5f9'
                                }}>
                                    {settings.campaign_throttle_cpm > 0 && (
                                        <div style={{
                                            width: `${(settings.campaign_throttle_cpm / settings.total_throttle_cpm) * 100}%`,
                                            background: '#f59e0b', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', color: '#fff', fontSize: '0.72rem',
                                            fontWeight: '700', minWidth: '30px'
                                        }}>
                                            {settings.campaign_throttle_cpm}
                                        </div>
                                    )}
                                    {settings.calls_throttle_cpm > 0 && (
                                        <div style={{
                                            width: `${(settings.calls_throttle_cpm / settings.total_throttle_cpm) * 100}%`,
                                            background: '#3b82f6', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', color: '#fff', fontSize: '0.72rem',
                                            fontWeight: '700', minWidth: '30px'
                                        }}>
                                            {settings.calls_throttle_cpm}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.75rem' }}>
                                    <span style={{ color: '#d97706' }}>■ Campaign Lines</span>
                                    <span style={{ color: '#3b82f6' }}>■ Normal Call Lines</span>
                                    <span style={{ color: '#94a3b8' }}>■ Unallocated</span>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {lastUpdated && (
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Last updated: {lastUpdated}
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={saving || remaining < 0}
                                style={{
                                    padding: '12px 28px',
                                    background: saving || remaining < 0 ? '#94a3b8' : '#008F4B',
                                    color: 'white', border: 'none', borderRadius: '10px',
                                    fontWeight: '600', fontSize: '0.95rem',
                                    cursor: saving || remaining < 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 2px 6px rgba(0,143,75,0.2)',
                                    transition: 'all 0.2s', marginLeft: 'auto'
                                }}
                            >
                                {saving ? <><RefreshCw size={18} className="spin" /> Saving...</> : <><Save size={18} /> Save Settings</>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
