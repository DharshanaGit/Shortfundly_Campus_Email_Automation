'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './CampaignTrackingView.module.css';
import {
  BarChartIcon,
  SendIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  DownloadIcon,
  RefreshCwIcon,
  EyeIcon,
  MousePointerIcon,
  GlobeIcon,
  BuildingIcon,
  HelpCircleIcon,
  UserIcon,
  MailIcon,
  CloseIcon
} from './Icons.jsx';

function formatIST(isoStr) {
  if (!isoStr) return '—';
  try {
    return (
      new Date(isoStr).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return isoStr;
  }
}

export default function CampaignTrackingView({ session }) {
  // Top-level Navigation View: 'campaigns' (Bulk Campaigns) | 'single' (Single Mail Dispatcher)
  const [activeReportTab, setActiveReportTab] = useState('campaigns');

  // Campaigns State
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null);

  // Recipient table state
  const [recipients, setRecipients] = useState([]);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Actions state
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');

  // Single Dispatcher State
  const [singleRecords, setSingleRecords] = useState([]);
  const [singleSummary, setSingleSummary] = useState({ total: 0, accepted: 0, opened: 0, clicked: 0, failed: 0 });
  const [singleTotal, setSingleTotal] = useState(0);
  const [singlePage, setSinglePage] = useState(1);
  const [singleSearch, setSingleSearch] = useState('');
  const [singleStatusFilter, setSingleStatusFilter] = useState('all');
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [selectedSingleRecord, setSelectedSingleRecord] = useState(null);
  const [retryingSingleId, setRetryingSingleId] = useState(null);

  // 1. Fetch campaigns list
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/tracking/campaigns?limit=50');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        if (data.campaigns && data.campaigns.length > 0 && !activeCampaignId) {
          setActiveCampaignId(data.campaigns[0].id);
        }
      }
    } catch (err) {
      console.error('[CampaignTracking] Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // 2. Fetch Single Dispatches list
  const fetchSingleDispatches = useCallback(async () => {
    setLoadingSingle(true);
    try {
      const params = new URLSearchParams();
      if (singleSearch.trim()) params.set('q', singleSearch.trim());
      if (singleStatusFilter !== 'all') params.set('status', singleStatusFilter);
      params.set('page', String(singlePage));
      params.set('limit', '25');

      const res = await fetch(`/api/tracking/single-dispatches?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSingleRecords(data.records || []);
        setSingleSummary(data.summary || { total: 0, accepted: 0, opened: 0, clicked: 0, failed: 0 });
        setSingleTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[CampaignTracking] Error fetching single dispatches:', err);
    } finally {
      setLoadingSingle(false);
    }
  }, [singleSearch, singleStatusFilter, singlePage]);

  useEffect(() => {
    fetchSingleDispatches();
  }, [fetchSingleDispatches]);

  // 3. Fetch active campaign details and recipients
  const fetchCampaignDetails = useCallback(async (campaignId) => {
    if (!campaignId) return;
    setLoadingRecipients(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`/api/tracking/campaigns/${campaignId}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActiveCampaign(data.campaign);
        setRecipients(data.recipients?.records || []);
        setTotalRecipients(data.recipients?.total || 0);
      }
    } catch (err) {
      console.error('[CampaignTracking] Error fetching details:', err);
    } finally {
      setLoadingRecipients(false);
    }
  }, [searchQuery, statusFilter, page]);

  useEffect(() => {
    if (activeCampaignId) {
      fetchCampaignDetails(activeCampaignId);
    }
  }, [activeCampaignId, fetchCampaignDetails]);

  // Overall totals across campaigns
  const aggregateTotals = campaigns.reduce(
    (acc, c) => {
      acc.totalRecipients += c.total_recipients || 0;
      acc.accepted += c.accepted_count || 0;
      acc.failed += c.failed_count || 0;
      acc.opened += c.opened_count || 0;
      acc.clicked += c.clicked_count || 0;
      return acc;
    },
    { totalRecipients: 0, accepted: 0, failed: 0, opened: 0, clicked: 0 }
  );

  // Export report for active campaign
  const handleExportReport = () => {
    if (!activeCampaignId) return;
    window.open(`/api/tracking/campaigns/${activeCampaignId}/export`, '_blank');
  };

  // Export report for single dispatches
  const handleExportSingleReport = () => {
    window.open('/api/tracking/single-dispatches/export', '_blank');
  };

  // Retry single dispatch
  const handleRetrySingle = async (recordId) => {
    if (!confirm('Re-dispatch this email to the recipient via Google SMTP?')) return;
    setRetryingSingleId(recordId);
    try {
      const res = await fetch('/api/tracking/single-dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', id: recordId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || 'Email successfully re-dispatched!');
        fetchSingleDispatches();
      } else {
        alert(data.error || 'Failed to re-dispatch email.');
      }
    } catch {
      alert('Network error while retrying email.');
    } finally {
      setRetryingSingleId(null);
    }
  };

  // Retry failed emails in active campaign
  const handleRetryFailed = async () => {
    if (!activeCampaignId) return;
    if (!confirm('Retry dispatching all eligible failed recipients in this campaign?')) return;

    setRetrying(true);
    setRetryMessage('');
    try {
      const res = await fetch(`/api/tracking/campaigns/${activeCampaignId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setRetryMessage(data.message || 'Retry completed successfully.');
        fetchCampaigns();
        fetchCampaignDetails(activeCampaignId);
      } else {
        alert(data.error || 'Failed to retry campaign recipients.');
      }
    } catch {
      alert('Network error while retrying campaign recipients.');
    } finally {
      setRetrying(false);
    }
  };

  // Status pill formatter
  const getStatusClass = (status) => {
    switch (status) {
      case 'COMPLETED': return styles.statusCompleted;
      case 'ACCEPTED': return styles.badgeAccepted;
      case 'PROCESSING': return styles.statusProcessing;
      case 'PARTIAL': return styles.statusPartial;
      case 'FAILED': return styles.statusFailed;
      default: return styles.statusQueued;
    }
  };

  if (loading) {
    return (
      <div className={styles.emptyState}>
        <RefreshCwIcon size={28} className={styles.loadingSpinner} />
        <p>Loading campaign reports and tracking telemetry...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Intro Header */}
      <div className={styles.introSection}>
        <h1 className={styles.headline}>Mails Tracker &amp; Delivery Telemetry</h1>
        <p className={styles.subheadline}>
          End-to-end delivery auditability and tracking for campus outreach dispatches: track bulk campaigns and single mail dispatcher status, Google SMTP relay acceptance, pixel-based open rates, and engagement link clicks.
        </p>

        {/* View Switcher: Bulk Campaigns vs Single Mail Dispatcher */}
        <div className={styles.topTabNav}>
          <button
            type="button"
            className={`${styles.topTabBtn} ${activeReportTab === 'campaigns' ? styles.topTabBtnActive : ''}`}
            onClick={() => setActiveReportTab('campaigns')}
          >
            <BarChartIcon size={16} />
            <span>Bulk Outreach Campaigns ({campaigns.length})</span>
          </button>
          <button
            type="button"
            className={`${styles.topTabBtn} ${activeReportTab === 'single' ? styles.topTabBtnActive : ''}`}
            onClick={() => {
              setActiveReportTab('single');
              fetchSingleDispatches();
            }}
          >
            <UserIcon size={16} />
            <span>Single Dispatcher Mails ({singleSummary.total || 0})</span>
          </button>
        </div>
      </div>

      {activeReportTab === 'single' ? (
        <>
          {/* Single Dispatcher Telemetry Disclosure */}
          <div className={styles.disclosureBanner}>
            <HelpCircleIcon size={20} className={styles.disclosureIcon} />
            <div className={styles.disclosureText}>
              <strong>Single Mail Dispatcher Tracking:</strong> Detailed delivery and engagement audit log for individual proposals dispatched to specific institutional leaders. Tracks upstream Google SMTP 250 OK relay acceptance, unique recipient opens, and delivery error diagnostics.
            </div>
          </div>

          {/* Single Dispatcher KPI Cards */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span>Total Single Mails</span>
                <div className={styles.statIconWrap} style={{ background: '#f1f5f9', color: '#475569' }}>
                  <SendIcon size={16} />
                </div>
              </div>
              <div className={styles.statValue}>{singleSummary.total.toLocaleString()}</div>
              <div className={styles.statFootnote}>Individual dispatches</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span>SMTP Accepted</span>
                <div className={styles.statIconWrap} style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <CheckCircleIcon size={16} />
                </div>
              </div>
              <div className={styles.statValue} style={{ color: '#15803d' }}>
                {singleSummary.accepted.toLocaleString()}
              </div>
              <div className={styles.statFootnote}>Upstream 250 OK relay</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span>Recipient Opens</span>
                <div className={styles.statIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <EyeIcon size={16} />
                </div>
              </div>
              <div className={styles.statValue} style={{ color: '#1d4ed8' }}>
                {singleSummary.opened.toLocaleString()}
              </div>
              <div className={styles.statFootnote}>
                {singleSummary.accepted > 0
                  ? `${Math.round((singleSummary.opened / singleSummary.accepted) * 100)}% detection rate`
                  : 'Tracked opens'}
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span>Link Clicks</span>
                <div className={styles.statIconWrap} style={{ background: '#fdf4ff', color: '#c026d3' }}>
                  <MousePointerIcon size={16} />
                </div>
              </div>
              <div className={styles.statValue} style={{ color: '#a21caf' }}>
                {singleSummary.clicked.toLocaleString()}
              </div>
              <div className={styles.statFootnote}>Engagement clicks</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span>Failed Dispatches</span>
                <div className={styles.statIconWrap} style={{ background: '#fee2e2', color: '#dc2626' }}>
                  <AlertCircleIcon size={16} />
                </div>
              </div>
              <div className={styles.statValue} style={{ color: '#b91c1c' }}>
                {singleSummary.failed.toLocaleString()}
              </div>
              <div className={styles.statFootnote}>Eligible for 1-click retry</div>
            </div>
          </div>

          {/* Single Dispatcher Records Table */}
          <div className={styles.singleTableContainer}>
            <div className={styles.singleTableHeader}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Single Mail Dispatches ({singleTotal})
                </h3>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Live delivery telemetry for emails dispatched directly to a single person
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={styles.singleActionBtn}
                  onClick={fetchSingleDispatches}
                  title="Refresh single mail telemetry"
                >
                  <RefreshCwIcon size={13} className={loadingSingle ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  className={`${styles.singleActionBtn} ${styles.singleActionBtnPrimary}`}
                  onClick={handleExportSingleReport}
                  title="Export single mail dispatch logs to CSV"
                >
                  <DownloadIcon size={13} />
                  <span>Export CSV Report</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className={styles.singleTableFilters}>
              <input
                type="text"
                className={styles.singleSearchInput}
                placeholder="Search single mail recipient by name, email, college, or subject..."
                value={singleSearch}
                onChange={(e) => {
                  setSingleSearch(e.target.value);
                  setSinglePage(1);
                }}
              />

              <select
                className={styles.singleFilterSelect}
                value={singleStatusFilter}
                onChange={(e) => {
                  setSingleStatusFilter(e.target.value);
                  setSinglePage(1);
                }}
              >
                <option value="all">All Dispatch Statuses</option>
                <option value="ACCEPTED">SMTP Accepted (Delivered)</option>
                <option value="OPENED">Opened by Recipient</option>
                <option value="CLICKED">Clicked Link</option>
                <option value="FAILED">Failed / Rejected</option>
                <option value="PENDING">Pending / Processing</option>
              </select>
            </div>

            {/* Table */}
            <div className={styles.tableWrapper}>
              <table className={styles.recipientsTable}>
                <thead>
                  <tr>
                    <th>Target College &amp; State</th>
                    <th>Recipient Person &amp; Email</th>
                    <th>Subject Line</th>
                    <th>Status</th>
                    <th>Engagement</th>
                    <th>Sent At (IST)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSingle ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px' }}>
                        <RefreshCwIcon size={20} className={styles.loadingSpinner} />
                        <div style={{ marginTop: '8px', color: '#64748b' }}>Loading single dispatcher records...</div>
                      </td>
                    </tr>
                  ) : singleRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                        No single mail dispatches match the selected search or filters.
                      </td>
                    </tr>
                  ) : (
                    singleRecords.map((rec) => {
                      const isAccepted = rec.status === 'ACCEPTED' || rec.delivery_status === 'SMTP_ACCEPTED';
                      const isFailed = rec.status === 'FAILED';
                      const isPending = rec.status === 'PENDING' || rec.status === 'PROCESSING';

                      return (
                        <tr key={rec.id}>
                          <td>
                            <div className={styles.collegeCol} title={rec.college_name}>
                              {rec.college_name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {rec.state || 'India'} &bull; {rec.department || 'Outreach'}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                              {rec.contact_person || 'Academic Leadership'}
                            </div>
                            <div className={styles.emailCol}>{rec.email}</div>
                            {rec.designation && (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>{rec.designation}</div>
                            )}
                          </td>

                          <td>
                            <div style={{ maxWidth: '240px', fontSize: '12.5px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.subject}>
                              {rec.subject}
                            </div>
                          </td>

                          <td>
                            {isAccepted && (
                              <span className={`${styles.statusBadge} ${styles.badgeAccepted}`} title={rec.smtp_response || '250 OK'}>
                                <CheckCircleIcon size={12} />
                                <span>SMTP Accepted</span>
                              </span>
                            )}
                            {isFailed && (
                              <div>
                                <span className={`${styles.statusBadge} ${styles.badgeFailed}`}>
                                  <AlertCircleIcon size={12} />
                                  <span>Failed</span>
                                </span>
                                <div className={styles.errorText} title={rec.error_message}>
                                  {rec.error_message || 'Delivery error'}
                                </div>
                              </div>
                            )}
                            {isPending && (
                              <span className={`${styles.statusBadge} ${styles.badgePending}`}>
                                <ClockIcon size={12} />
                                <span>{rec.status}</span>
                              </span>
                            )}
                          </td>

                          <td>
                            {rec.open_count > 0 ? (
                              <span className={`${styles.trackingIndicator} ${styles.trackedYes}`} title={`Opened at ${formatIST(rec.first_opened_at)}`}>
                                <EyeIcon size={12} />
                                <span>Opened ({rec.open_count}x)</span>
                              </span>
                            ) : (
                              <span className={`${styles.trackingIndicator} ${styles.trackedNo}`}>
                                <span>Unopened</span>
                              </span>
                            )}
                          </td>

                          <td>
                            <div style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                              {formatIST(rec.sent_at || rec.created_at)}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                className={styles.singleActionBtn}
                                onClick={() => setSelectedSingleRecord(rec)}
                                title="View sent email details and content"
                              >
                                <EyeIcon size={12} />
                                <span>View Mail</span>
                              </button>

                              {isFailed && (
                                <button
                                  type="button"
                                  className={styles.retryBtnSmall}
                                  onClick={() => handleRetrySingle(rec.id)}
                                  disabled={retryingSingleId === rec.id}
                                  title="Retry dispatching this email"
                                >
                                  <RefreshCwIcon size={11} className={retryingSingleId === rec.id ? 'spin' : ''} />
                                  <span>{retryingSingleId === rec.id ? 'Retrying...' : 'Retry'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className={styles.paginationRow}>
              <span>
                Showing {singleRecords.length} of {singleTotal} single dispatches
              </span>
              <div className={styles.pageButtons}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={singlePage <= 1}
                  onClick={() => setSinglePage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ padding: '6px 10px', fontWeight: 600 }}>Page {singlePage}</span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={singlePage * 25 >= singleTotal}
                  onClick={() => setSinglePage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Deliverability & Open Tracking Disclosure */}
          <div className={styles.disclosureBanner}>
            <HelpCircleIcon size={20} className={styles.disclosureIcon} />
            <div className={styles.disclosureText}>
              <strong>Deliverability &amp; Tracking Disclosure:</strong> Emails marked <strong>&ldquo;SMTP ACCEPTED&rdquo;</strong> confirm that Google SMTP (upstream relay) validated credentials and accepted the message for transmission. Final mailbox placement is determined by the recipient&apos;s mail server antispam policies. Open tracking uses an invisible 1&times;1 pixel; open statistics may be underreported if recipient email clients enforce image blocking, Google image proxying, or Apple Mail Privacy Protection.
            </div>
          </div>

      {/* Aggregate KPI Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Total Campaigns</span>
            <div className={styles.statIconWrap} style={{ background: '#f1f5f9', color: '#475569' }}>
              <BarChartIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue}>{campaigns.length}</div>
          <div className={styles.statFootnote}>Recorded in database</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Total Recipients</span>
            <div className={styles.statIconWrap} style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <SendIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue}>{aggregateTotals.totalRecipients.toLocaleString()}</div>
          <div className={styles.statFootnote}>Campus targets contacted</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>SMTP Accepted</span>
            <div className={styles.statIconWrap} style={{ background: '#dcfce7', color: '#16a34a' }}>
              <CheckCircleIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue} style={{ color: '#15803d' }}>
            {aggregateTotals.accepted.toLocaleString()}
          </div>
          <div className={styles.statFootnote}>Relay 250 OK handshake</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Failed / Bounces</span>
            <div className={styles.statIconWrap} style={{ background: '#fee2e2', color: '#dc2626' }}>
              <AlertCircleIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue} style={{ color: '#b91c1c' }}>
            {aggregateTotals.failed.toLocaleString()}
          </div>
          <div className={styles.statFootnote}>Eligible for safe retry</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Tracked Opens</span>
            <div className={styles.statIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <EyeIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue} style={{ color: '#1d4ed8' }}>
            {aggregateTotals.opened.toLocaleString()}
          </div>
          <div className={styles.statFootnote}>
            {aggregateTotals.accepted > 0
              ? `${Math.round((aggregateTotals.opened / aggregateTotals.accepted) * 100)}% pixel detection rate`
              : 'Pixel tracking'}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Link Clicks</span>
            <div className={styles.statIconWrap} style={{ background: '#fdf4ff', color: '#c026d3' }}>
              <MousePointerIcon size={16} />
            </div>
          </div>
          <div className={styles.statValue} style={{ color: '#a21caf' }}>
            {aggregateTotals.clicked.toLocaleString()}
          </div>
          <div className={styles.statFootnote}>Portal &amp; festival clicks</div>
        </div>
      </div>

      {/* Main Master-Detail View */}
      {campaigns.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>No campaigns dispatched yet</div>
          <p>Launch your first outreach campaign using the Campus Dispatcher to view real-time delivery telemetry and reports.</p>
        </div>
      ) : (
        <div className={styles.layoutGrid}>
          {/* Left: Campaign List */}
          <div className={styles.campaignListPanel}>
            <div className={styles.panelTitle}>
              <span>All Campaigns ({campaigns.length})</span>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={fetchCampaigns}
                title="Refresh campaigns list"
              >
                <RefreshCwIcon size={13} />
              </button>
            </div>

            {campaigns.map((camp) => {
              const isActive = camp.id === activeCampaignId;
              let targetCountries = [];
              let targetStates = [];
              try {
                targetCountries = JSON.parse(camp.target_countries || '[]');
                targetStates = JSON.parse(camp.target_states || '[]');
              } catch {}

              return (
                <div
                  key={camp.id}
                  className={`${styles.campaignItem} ${isActive ? styles.campaignItemActive : ''}`}
                  onClick={() => {
                    setActiveCampaignId(camp.id);
                    setPage(1);
                  }}
                >
                  <div className={styles.campaignItemHeader}>
                    <span className={styles.campaignItemName} title={camp.name}>
                      {camp.name}
                    </span>
                    <span className={`${styles.statusPill} ${getStatusClass(camp.status)}`}>
                      {camp.status}
                    </span>
                  </div>

                  <div className={styles.campaignItemMeta}>
                    <span>
                      <strong>{camp.total_recipients || 0}</strong> recipients &bull;{' '}
                      <span style={{ color: '#16a34a' }}>{camp.accepted_count || 0} ok</span>
                      {camp.failed_count > 0 && <span style={{ color: '#dc2626' }}> &bull; {camp.failed_count} failed</span>}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                      {targetCountries.join(', ') || 'India'} &bull; {targetStates.slice(0, 2).join(', ')}
                      {targetStates.length > 2 ? ` +${targetStates.length - 2}` : ''}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                      {new Date(camp.created_at).toLocaleDateString()} {new Date(camp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Campaign Details & Recipient Telemetry */}
          <div className={styles.detailPanel}>
            {activeCampaign ? (
              <>
                <div className={styles.detailHeader}>
                  <div className={styles.detailTitleArea}>
                    <h2 className={styles.detailTitle}>{activeCampaign.name}</h2>
                    <div className={styles.detailSubject}>Subject: &ldquo;{activeCampaign.subject}&rdquo;</div>
                    <div className={styles.detailBadges}>
                      <span className={styles.badge}>
                        <GlobeIcon size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        {(() => {
                          try {
                            const c = JSON.parse(activeCampaign.target_countries || '[]');
                            return c.length > 0 ? c.join(', ') : 'India';
                          } catch { return 'India'; }
                        })()}
                      </span>
                      <span className={styles.badge}>
                        Regions:{' '}
                        {(() => {
                          try {
                            const s = JSON.parse(activeCampaign.target_states || '[]');
                            return s.length > 0 ? s.join(', ') : 'Andhra Pradesh';
                          } catch { return 'Andhra Pradesh'; }
                        })()}
                      </span>
                      <span className={styles.badge}>
                        <BuildingIcon size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        {activeCampaign.selected_colleges_count || 0} Colleges Targeted
                      </span>
                    </div>
                  </div>

                  <div className={styles.actionButtons}>
                    <button
                      type="button"
                      className={styles.exportBtn}
                      onClick={handleExportReport}
                      title="Download full campaign telemetry as CSV"
                    >
                      <DownloadIcon size={14} />
                      <span>Export CSV Report</span>
                    </button>

                    {activeCampaign.failed_count > 0 && (
                      <button
                        type="button"
                        className={styles.retryBtn}
                        onClick={handleRetryFailed}
                        disabled={retrying}
                        title="Safely retry all eligible failed recipients"
                      >
                        <RefreshCwIcon size={14} className={retrying ? styles.loadingSpinner : ''} />
                        <span>{retrying ? 'Retrying...' : `Retry ${activeCampaign.failed_count} Failed`}</span>
                      </button>
                    )}
                  </div>
                </div>

                {retryMessage && (
                  <div className={styles.disclosureBanner} style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                    <CheckCircleIcon size={18} style={{ color: '#16a34a' }} />
                    <span>{retryMessage}</span>
                  </div>
                )}

                {/* Progress Breakdown Bar */}
                <div className={styles.progressSection}>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={styles.barAccepted}
                      style={{
                        width: `${activeCampaign.total_recipients > 0 ? (activeCampaign.accepted_count / activeCampaign.total_recipients) * 100 : 0}%`
                      }}
                      title={`Accepted: ${activeCampaign.accepted_count}`}
                    />
                    <div
                      className={styles.barFailed}
                      style={{
                        width: `${activeCampaign.total_recipients > 0 ? (activeCampaign.failed_count / activeCampaign.total_recipients) * 100 : 0}%`
                      }}
                      title={`Failed: ${activeCampaign.failed_count}`}
                    />
                    <div
                      className={styles.barPending}
                      style={{
                        width: `${activeCampaign.total_recipients > 0 ? (activeCampaign.queued_count / activeCampaign.total_recipients) * 100 : 0}%`
                      }}
                      title={`Queued/Pending: ${activeCampaign.queued_count}`}
                    />
                  </div>

                  <div className={styles.progressStatsRow}>
                    <div className={styles.progressStatItem}>
                      <span className={styles.progressStatLabel}>Total Dispatched</span>
                      <span className={styles.progressStatValue}>{activeCampaign.total_recipients}</span>
                    </div>
                    <div className={styles.progressStatItem}>
                      <span className={styles.progressStatLabel} style={{ color: '#16a34a' }}>SMTP Accepted</span>
                      <span className={styles.progressStatValue} style={{ color: '#16a34a' }}>{activeCampaign.accepted_count}</span>
                    </div>
                    <div className={styles.progressStatItem}>
                      <span className={styles.progressStatLabel} style={{ color: '#dc2626' }}>Failed Relay</span>
                      <span className={styles.progressStatValue} style={{ color: '#dc2626' }}>{activeCampaign.failed_count}</span>
                    </div>
                    <div className={styles.progressStatItem}>
                      <span className={styles.progressStatLabel} style={{ color: '#2563eb' }}>Tracked Opens</span>
                      <span className={styles.progressStatValue} style={{ color: '#2563eb' }}>{activeCampaign.opened_count || 0}</span>
                    </div>
                    <div className={styles.progressStatItem}>
                      <span className={styles.progressStatLabel} style={{ color: '#a21caf' }}>Link Clicks</span>
                      <span className={styles.progressStatValue} style={{ color: '#a21caf' }}>{activeCampaign.clicked_count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Filter and Search Bar for Recipients */}
                <div className={styles.filterBar}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by college, recipient email, or contact..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />

                  <select
                    className={styles.statusSelect}
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="ACCEPTED">SMTP Accepted</option>
                    <option value="FAILED">Failed Only</option>
                    <option value="opened">Opened (Pixel Tracked)</option>
                    <option value="clicked">Clicked Links</option>
                    <option value="PENDING">Pending / Queued</option>
                  </select>
                </div>

                {/* Recipients Telemetry Table */}
                <div className={styles.tableWrapper}>
                  <table className={styles.recipientsTable}>
                    <thead>
                      <tr>
                        <th>College &amp; Department</th>
                        <th>Recipient Email</th>
                        <th>Location</th>
                        <th>SMTP Status</th>
                        <th>Open Tracking</th>
                        <th>Click Tracking</th>
                        <th>Sent / Attempt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRecipients ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>
                            <RefreshCwIcon size={20} className={styles.loadingSpinner} />
                            <div style={{ marginTop: '8px', color: '#64748b' }}>Loading recipient records...</div>
                          </td>
                        </tr>
                      ) : recipients.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                            No recipient records match the selected search or filters.
                          </td>
                        </tr>
                      ) : (
                        recipients.map((rec) => {
                          const isAccepted = rec.status === 'ACCEPTED';
                          const isFailed = rec.status === 'FAILED';
                          const isPending = rec.status === 'PENDING' || rec.status === 'PROCESSING';

                          return (
                            <tr key={rec.id}>
                              <td>
                                <div className={styles.collegeCol} title={rec.college_name}>
                                  {rec.college_name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  {rec.contact_person || 'Official Rep'} &bull; {rec.department || 'Outreach'}
                                </div>
                              </td>

                              <td>
                                <div className={styles.emailCol}>{rec.email}</div>
                              </td>

                              <td>
                                <div className={styles.locationCol}>
                                  {rec.state || 'Andhra Pradesh'}, {rec.country || 'India'}
                                </div>
                              </td>

                              <td>
                                {isAccepted && (
                                  <span className={`${styles.statusBadge} ${styles.badgeAccepted}`} title={rec.smtp_response || '250 OK'}>
                                    <CheckCircleIcon size={12} />
                                    <span>SMTP Accepted</span>
                                  </span>
                                )}
                                {isFailed && (
                                  <div>
                                    <span className={`${styles.statusBadge} ${styles.badgeFailed}`}>
                                      <AlertCircleIcon size={12} />
                                      <span>Failed</span>
                                    </span>
                                    <div className={styles.errorText} title={rec.error_message}>
                                      {rec.error_message || 'Delivery error'}
                                    </div>
                                  </div>
                                )}
                                {isPending && (
                                  <span className={`${styles.statusBadge} ${styles.badgePending}`}>
                                    <ClockIcon size={12} />
                                    <span>{rec.status}</span>
                                  </span>
                                )}
                              </td>

                              <td>
                                {rec.opened_at ? (
                                  <span className={`${styles.trackingIndicator} ${styles.trackedYes}`} title={`Opened at ${rec.opened_at}`}>
                                    <EyeIcon size={12} />
                                    <span>Opened ({rec.open_count || 1}x)</span>
                                  </span>
                                ) : (
                                  <span className={`${styles.trackingIndicator} ${styles.trackedNo}`}>
                                    <span>Unopened</span>
                                  </span>
                                )}
                              </td>

                              <td>
                                {rec.clicked_at ? (
                                  <span className={`${styles.trackingIndicator} ${styles.trackedYes}`} title={`Clicked URL: ${rec.last_clicked_url || 'Target Link'}`}>
                                    <MousePointerIcon size={12} />
                                    <span>Clicked ({rec.click_count || 1}x)</span>
                                  </span>
                                ) : (
                                  <span className={`${styles.trackingIndicator} ${styles.trackedNo}`}>
                                    <span>No Clicks</span>
                                  </span>
                                )}
                              </td>

                              <td>
                                <div style={{ fontSize: '11px', color: '#475569' }}>
                                  {rec.sent_at ? new Date(rec.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Queued'}
                                </div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  Attempts: {rec.attempts || 1}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className={styles.paginationRow}>
                  <span>
                    Showing {recipients.length} of {totalRecipients} recipients
                  </span>
                  <div className={styles.pageButtons}>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '6px 10px', fontWeight: 600 }}>Page {page}</span>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={page * 50 >= totalRecipients}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>Select a campaign to view telemetry</div>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* Selected Single Dispatch Inspection Modal */}
      {selectedSingleRecord && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedSingleRecord(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <MailIcon size={16} />
                <span>Single Dispatch Details — {selectedSingleRecord.email}</span>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedSingleRecord(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <strong>Target College</strong>
                  <span>{selectedSingleRecord.college_name}</span>
                </div>
                <div className={styles.metaItem}>
                  <strong>Recipient Person</strong>
                  <span>{selectedSingleRecord.contact_person || 'Academic Leadership'} ({selectedSingleRecord.designation || 'Representative'})</span>
                </div>
                <div className={styles.metaItem}>
                  <strong>Department &amp; Location</strong>
                  <span>{selectedSingleRecord.department || 'Outreach'} &bull; {selectedSingleRecord.state || 'India'}</span>
                </div>
                <div className={styles.metaItem}>
                  <strong>Dispatched At (IST)</strong>
                  <span>{formatIST(selectedSingleRecord.sent_at || selectedSingleRecord.created_at)}</span>
                </div>
                <div className={styles.metaItem}>
                  <strong>Google SMTP Status</strong>
                  <span style={{ color: selectedSingleRecord.status === 'ACCEPTED' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {selectedSingleRecord.status === 'ACCEPTED' ? '250 OK Message Accepted' : selectedSingleRecord.status}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <strong>Upstream Message-ID</strong>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                    {selectedSingleRecord.smtp_message_id || '—'}
                  </span>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Subject Line</strong>
                <div style={{ marginTop: '4px', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', fontWeight: 600, color: '#0f172a', border: '1px solid #e2e8f0' }}>
                  {selectedSingleRecord.subject}
                </div>
              </div>

              <div>
                <strong style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Email Content Dispatched</strong>
                <div
                  className={styles.emailPreviewFrame}
                  dangerouslySetInnerHTML={{ __html: selectedSingleRecord.body_html }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
