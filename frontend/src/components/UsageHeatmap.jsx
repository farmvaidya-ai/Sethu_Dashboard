import React, { useEffect, useState, useMemo } from 'react';
import { paymentAPI } from '../services/api';
import { Info } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Color scale: white → light green → medium green → dark green (site brand colors)
// Also yellow for high usage days
function getColor(value, max) {
    if (!value || value === 0) return { bg: '#eef2f0', label: 'none' };
    const pct = max > 0 ? value / max : 0;
    if (pct <= 0) return { bg: '#eef2f0', label: 'none' };
    if (pct < 0.15) return { bg: '#c6e9d8', label: 'low' };
    if (pct < 0.35) return { bg: '#7ec8a1', label: 'moderate' };
    if (pct < 0.6) return { bg: '#FFC107', label: 'high' }; // site yellow
    if (pct < 0.85) return { bg: '#00a857', label: 'very high' };
    return { bg: '#006830', label: 'peak' };  // site dark green
}

export default function UsageHeatmap({ userId, compact = false }) {
    const [heatmapData, setHeatmapData] = useState({});
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState(null);

    useEffect(() => {
        const fetchHeatmap = async () => {
            try {
                setLoading(true);
                const res = await paymentAPI.getHeatmap(userId);
                if (res.data?.success) {
                    setHeatmapData(res.data.data || {});
                }
            } catch (e) {
                console.error('Heatmap fetch failed:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchHeatmap();
    }, [userId]);

    // Build 52-week grid (364 days back from today)
    const { weeks, maxVal, totalCredits } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = [];

        // Go back 52 weeks (364 days) from end of current week
        const endDate = new Date(today);
        const dayOfWeek = endDate.getDay(); // 0=Sun
        endDate.setDate(endDate.getDate() - dayOfWeek + 6); // end of this week (Sat)

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 364);

        let cur = new Date(startDate);
        let max = 10; // Baseline max, so small testing values don't render as 'peak' dark green
        let total = 0;

        while (cur <= endDate) {
            // Get YYYY-MM-DD in local time
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${d}`;

            const val = parseFloat(heatmapData[key] || 0);
            if (val > max) max = val;
            total += val;
            days.push({ date: new Date(cur), key, val });
            cur.setDate(cur.getDate() + 1);
        }

        // Group into weeks of 7 days (Sunday start)
        const weekGroups = [];
        for (let i = 0; i < days.length; i += 7) {
            weekGroups.push(days.slice(i, i + 7));
        }

        return { weeks: weekGroups, maxVal: max, totalCredits: total };
    }, [heatmapData]);

    // Find month labels - first week of each new month
    const monthLabels = useMemo(() => {
        const labels = [];
        let lastMonth = -1;
        weeks.forEach((week, wi) => {
            const firstDay = week[0];
            if (firstDay && firstDay.date.getMonth() !== lastMonth) {
                labels.push({ wi, month: MONTHS[firstDay.date.getMonth()] });
                lastMonth = firstDay.date.getMonth();
            }
        });
        return labels;
    }, [weeks]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                <div className="spinner-small" style={{ marginRight: '8px' }} />
                Loading usage heatmap...
            </div>
        );
    }

    const cellSize = compact ? 10 : 13;
    const cellGap = compact ? 2 : 3;

    return (
        <div style={{ position: 'relative' }}>
            {/* Total Credits Used */}
            {!compact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--text)', fontSize: '1rem' }}>
                            {totalCredits.toFixed(2)}
                        </strong> minutes used in the last year
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <Info size={12} />
                        <span>Less</span>
                        {['#eef2f0', '#c6e9d8', '#7ec8a1', '#FFC107', '#00a857', '#006830'].map(c => (
                            <div key={c} style={{ width: cellSize, height: cellSize, borderRadius: 2, background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
                        ))}
                        <span>More</span>
                    </div>
                </div>
            )}

            {/* Grid Container */}
            <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 0, minWidth: 'max-content' }}>
                    {/* Month labels row */}
                    <div style={{ display: 'flex', marginBottom: 4, marginLeft: compact ? 0 : 28 }}>
                        {weeks.map((_, wi) => {
                            const label = monthLabels.find(l => l.wi === wi);
                            return (
                                <div key={wi} style={{ width: cellSize + cellGap, fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'left', overflow: 'visible', whiteSpace: 'nowrap' }}>
                                    {label ? label.month : ''}
                                </div>
                            );
                        })}
                    </div>

                    {/* Day rows */}
                    <div style={{ display: 'flex', gap: 0 }}>
                        {/* Day labels */}
                        {!compact && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: cellGap, marginRight: 4, flexShrink: 0 }}>
                                {DAYS.map((d, i) => (
                                    <div key={d} style={{ height: cellSize, display: 'flex', alignItems: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', width: 24, textAlign: 'right', justifyContent: 'flex-end' }}>
                                        {/* Only show Mon, Wed, Fri */}
                                        {(i === 1 || i === 3 || i === 5) ? d : ''}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Weeks */}
                        <div style={{ display: 'flex', gap: cellGap }}>
                            {weeks.map((week, wi) => (
                                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: cellGap }}>
                                    {week.map((day, di) => {
                                        const color = getColor(day.val, maxVal);
                                        const isFuture = day.date > new Date();
                                        return (
                                            <div
                                                key={di}
                                                title={`${day.key}: ${day.val.toFixed(2)} minutes`}
                                                onMouseEnter={(e) => {
                                                    const rect = e.target.getBoundingClientRect();
                                                    setTooltip({ x: rect.left, y: rect.top - 36, day });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                                style={{
                                                    width: cellSize,
                                                    height: cellSize,
                                                    borderRadius: 2,
                                                    background: isFuture ? 'transparent' : color.bg,
                                                    border: isFuture ? 'none' : '1px solid rgba(0,0,0,0.06)',
                                                    cursor: day.val > 0 ? 'pointer' : 'default',
                                                    transition: 'transform 0.1s',
                                                }}
                                                onMouseOver={(e) => { if (!isFuture) e.target.style.transform = 'scale(1.3)'; }}
                                                onMouseOut={(e) => { e.target.style.transform = 'scale(1)'; }}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Tooltip */}
            {tooltip && (
                <div style={{
                    position: 'fixed',
                    left: tooltip.x,
                    top: tooltip.y,
                    background: '#1f2937',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                    <strong>{tooltip.day.val.toFixed(2)} minutes</strong> · {tooltip.day.key}
                </div>
            )}
        </div>
    );
}
