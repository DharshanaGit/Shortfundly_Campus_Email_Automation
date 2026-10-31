'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import styles from './CollegeDataIngestionView.module.css';
import {
  UploadCloudIcon,
  DownloadIcon,
  CheckIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CloseIcon,
  SendIcon,
} from './Icons';
import { DEFAULT_TEMPLATES } from '@/lib/templates.js';

// Strict Email Validator:
// - Case insensitive (capital/small letters allowed)
// - Must have '@'
// - Domain must have extension (.com, .in, .edu, etc.)
// - Must not be purely numeric before '@'
export function validateEmailString(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, reason: 'Email is required' };
  const email = raw.trim();
  if (!email) return { valid: false, reason: 'Email is required' };

  if (!email.includes('@')) {
    return { valid: false, reason: 'Missing @ symbol' };
  }

  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'Invalid @ structure' };
  }

  const [username, domain] = parts;

  // Purely numeric username restriction
  if (/^\d+$/.test(username)) {
    return { valid: false, reason: 'Email cannot be only numbers' };
  }

  // Domain must contain dot and valid extension
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return { valid: false, reason: 'Invalid domain (missing .com/.in)' };
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Malformed email format' };
  }

  return { valid: true, normalized: email.toLowerCase() };
}

const DEFAULT_TEMPLATE_COLUMNS = [
  'College Name',
  'Official Website',
  'Recipient Email',
  'Contact Person',
  'Designation',
  'Department',
  'Country',
  'State',
  'District',
  'City',
  'Phone',
];

// FAKE / SYNTHETIC TEST EMAILS ONLY (Strictly not real emails)
const SAMPLE_TEMPLATE_ROWS = [
  {
    'College Name': 'Apex Institute of Technology & Science',
    'Official Website': 'https://www.apex-sample-tech.edu.in',
    'Recipient Email': 'principal.demo@institution-sample.edu.in',
    'Contact Person': 'Dr. K. S. Ramanathan',
    'Designation': 'Principal',
    'Department': 'Mechanical & Production',
    'Country': 'India',
    'State': 'Tamil Nadu',
    'District': 'Coimbatore',
    'City': 'Coimbatore',
    'Phone': '+91 422 2570000',
  },
  {
    'College Name': 'Coastal University College of Engineering',
    'Official Website': 'https://www.coastal-sample-univ.edu.in',
    'Recipient Email': 'dean.academic@sample-university.edu.in',
    'Contact Person': 'Prof. P. S. Rao',
    'Designation': 'Dean & Faculty Coordinator',
    'Department': 'Computer Science & Engineering',
    'Country': 'India',
    'State': 'Andhra Pradesh',
    'District': 'Visakhapatnam',
    'City': 'Visakhapatnam',
    'Phone': '+91 891 2840000',
  },
  {
    'College Name': 'National Institute of Science & Technology',
    'Official Website': 'https://www.nist-sample.edu.in',
    'Recipient Email': 'tpo.placement@demo-college.edu.in',
    'Contact Person': 'Dr. Suresh Kumar',
    'Designation': 'Training & Placement Officer',
    'Department': 'Training and Placement Cell',
    'Country': 'India',
    'State': 'Telangana',
    'District': 'Warangal',
    'City': 'Warangal',
    'Phone': '+91 870 2450000',
  },
];

export default function CollegeDataIngestionView({ session, templates = [], onNavigateTab }) {
  const [feedback, setFeedback] = useState(null);

  // Template Selection State
  const allTemplates = templates && templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    allTemplates[0]?.id || 'campus-collaboration-proposal'
  );

  // Geo Scoping Defaults
  const [geoScope, setGeoScope] = useState({
    countryCode: 'IN',
    countryName: 'India',
    stateOrRegion: 'Andhra Pradesh',
    district: '',
  });

  // Spreadsheet Rows State
  const [parsedRows, setParsedRows] = useState([]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [simulationModeActive, setSimulationModeActive] = useState(true);
  const fileInputRef = useRef(null);

  // Load effective simulation setting
  useEffect(() => {
    async function loadSmtpSettings() {
      try {
        const res = await fetch('/api/admin/smtp');
        if (res.ok) {
          const data = await res.json();
          setSimulationModeActive(Boolean(data.simulation_mode));
        }
      } catch {}
    }
    loadSmtpSettings();
  }, []);

  const selectedTemplate = allTemplates.find((t) => t.id === selectedTemplateId) || allTemplates[0];

  // Trigger file download helper
  const downloadTemplate = (format = 'xlsx') => {
    try {
      const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS, {
        header: DEFAULT_TEMPLATE_COLUMNS,
      });

      // Set column widths for readability
      ws['!cols'] = [
        { wch: 36 }, // College Name
        { wch: 32 }, // Official Website
        { wch: 36 }, // Recipient Email (fake demo emails)
        { wch: 24 }, // Contact Person
        { wch: 24 }, // Designation
        { wch: 26 }, // Department
        { wch: 14 }, // Country
        { wch: 18 }, // State
        { wch: 18 }, // District
        { wch: 16 }, // City
        { wch: 18 }, // Phone
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Colleges_Template');

      if (format === 'csv') {
        XLSX.writeFile(wb, 'college_data_ingestion_template.csv', { bookType: 'csv' });
      } else {
        XLSX.writeFile(wb, 'college_data_ingestion_template.xlsx', { bookType: 'xlsx' });
      }

      setFeedback({
        type: 'success',
        message: `College data template (${format.toUpperCase()}) with fake demo emails downloaded. Fill and upload below!`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to generate template: ' + err.message });
    }
  };

  // Auto-detect column headers flexibly (capital / small letters no issues)
  const mapRowFields = (rawRow) => {
    const keys = Object.keys(rawRow);
    const getVal = (aliases) => {
      for (const k of keys) {
        const cleanKey = k.trim().toLowerCase().replace(/[_\-\s]+/g, '');
        for (const alias of aliases) {
          if (cleanKey === alias.toLowerCase().replace(/[_\-\s]+/g, '')) {
            return String(rawRow[k] || '').trim();
          }
        }
      }
      return '';
    };

    const college_name = getVal(['collegename', 'college', 'institution', 'name', 'university']);
    const website_url = getVal(['officialwebsite', 'website', 'websiteurl', 'url', 'webpage']);
    const email = getVal(['recipientemail', 'email', 'emailaddress', 'mail', 'mailid', 'officialemail']);
    const contact_person = getVal(['contactperson', 'contact', 'person', 'facultyname', 'faculty', 'coordinator', 'dean']);
    const designation = getVal(['designation', 'role', 'title', 'position']);
    const department = getVal(['department', 'dept', 'branch', 'stream', 'club']);
    const country = getVal(['country', 'countryname']) || geoScope.countryName;
    const state = getVal(['state', 'stateorregion', 'region', 'province']) || geoScope.stateOrRegion;
    const district = getVal(['district', 'dist']) || geoScope.district;
    const city = getVal(['city', 'place', 'location', 'town']);
    const phone = getVal(['phone', 'mobile', 'contactno', 'tel']);

    return {
      college_name,
      website_url,
      email,
      contact_person,
      designation,
      department,
      country,
      state,
      district,
      city,
      phone,
    };
  };

  // Validate single row and calculate cell errors
  const evaluateRow = (row, rowIndex, allEmails) => {
    const errors = {};

    // 1. Validate College Name
    if (!row.college_name || !row.college_name.trim()) {
      errors.college_name = 'College Name is required';
    }

    // 2. Validate Email (strictly syntax verified, case-insensitive)
    const emailCheck = validateEmailString(row.email);
    if (!emailCheck.valid) {
      errors.email = emailCheck.reason;
    } else {
      // Duplicate check within batch
      const emailLower = emailCheck.normalized;
      const count = allEmails.filter((e) => e === emailLower).length;
      if (count > 1) {
        errors.email_dup = 'Duplicate email found in this upload batch';
      }
    }

    return {
      ...row,
      id: row.id || `row_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 6)}`,
      errors,
      isValid: Object.keys(errors).length === 0,
      isApproved: Object.keys(errors).length === 0,
    };
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setFeedback({ type: 'error', message: 'The uploaded file is empty or has no readable rows.' });
          return;
        }

        // Map columns
        const mapped = rawJson.map(mapRowFields);

        // Pre-gather emails for duplicate calculation
        const allEmails = mapped
          .map((r) => (r.email ? r.email.trim().toLowerCase() : ''))
          .filter(Boolean);

        // Evaluate validation status
        const evaluated = mapped.map((r, i) => evaluateRow(r, i, allEmails));

        setParsedRows(evaluated);

        const errorCount = evaluated.filter((r) => !r.isValid).length;
        if (errorCount > 0) {
          setFeedback({
            type: 'error',
            message: `Uploaded ${evaluated.length} records. ${errorCount} record(s) contain validation errors (highlighted in red). Please edit invalid cells and click the tick (✓) button to approve.`,
          });
        } else {
          setFeedback({
            type: 'success',
            message: `Uploaded ${evaluated.length} records! All rows passed validation checks and are ready for import or simulation dispatch.`,
          });
        }
      } catch (err) {
        setFeedback({ type: 'error', message: 'Failed to parse file: ' + err.message });
      }
    };

    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Inline cell edit handler
  const handleCellChange = (rowIndex, field, value) => {
    setParsedRows((prev) => {
      const next = [...prev];
      const target = { ...next[rowIndex], [field]: value };

      const allEmails = next
        .map((r, i) => (i === rowIndex ? value.trim().toLowerCase() : r.email?.trim().toLowerCase()))
        .filter(Boolean);

      next[rowIndex] = evaluateRow(target, rowIndex, allEmails);
      return next;
    });
  };

  // Row Tick Button Handler (Approve / Re-validate row)
  const handleTickRow = (rowIndex) => {
    setParsedRows((prev) => {
      const next = [...prev];
      const r = next[rowIndex];

      const allEmails = next.map((x) => x.email?.trim().toLowerCase()).filter(Boolean);
      const evaluated = evaluateRow(r, rowIndex, allEmails);

      if (evaluated.isValid) {
        evaluated.isApproved = true;
        setFeedback({
          type: 'success',
          message: `Row #${rowIndex + 1} (${r.college_name || 'Record'}) validated & approved successfully!`,
        });
      } else {
        const errorMsgs = Object.values(evaluated.errors).join(', ');
        setFeedback({
          type: 'error',
          message: `Row #${rowIndex + 1} still has errors: ${errorMsgs}`,
        });
      }

      next[rowIndex] = evaluated;
      return next;
    });
  };

  // Delete row from batch
  const handleDeleteRow = (rowIndex) => {
    setParsedRows((prev) => {
      const next = prev.filter((_, i) => i !== rowIndex);
      const allEmails = next.map((x) => x.email?.trim().toLowerCase()).filter(Boolean);
      return next.map((r, i) => evaluateRow(r, i, allEmails));
    });
  };

  // Save all validated rows into the institutional database
  const handleImportOnly = async () => {
    const validRows = parsedRows.filter((r) => r.isValid || r.isApproved);
    if (validRows.length === 0) {
      setFeedback({ type: 'error', message: 'No valid records to import. Please resolve red cells first.' });
      return;
    }

    try {
      setIsImporting(true);
      const res = await fetch('/api/outreach/geo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: geoScope.countryCode,
          countryName: geoScope.countryName,
          stateOrRegion: geoScope.stateOrRegion,
          rows: validRows,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Successfully imported ${data.collegesImported} colleges and ${data.contactsImported} contacts into the directory!`,
        });
        setParsedRows((prev) => prev.filter((r) => !r.isValid && !r.isApproved));
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to import records.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Network error during ingestion: ' + err.message });
    } finally {
      setIsImporting(false);
    }
  };

  // Send & Track Emails (Dispatches campaign through worker with simulation support)
  const handleDispatchCampaign = async () => {
    const validRows = parsedRows.filter((r) => r.isValid || r.isApproved);
    if (validRows.length === 0) {
      setFeedback({ type: 'error', message: 'No valid records to dispatch. Please resolve red cells first.' });
      return;
    }

    try {
      setIsDispatching(true);
      const campaignName = `Spreadsheet Batch: ${uploadFileName || 'Custom Ingestion'} (${new Date().toLocaleDateString()})`;
      const subject = selectedTemplate?.subject_template || selectedTemplate?.subjectTemplate || 'Campus Outreach Proposal';
      const bodyHtml = selectedTemplate?.body_template || selectedTemplate?.bodyTemplate || '<p>Outreach content</p>';

      // First ensure contacts are in DB
      await fetch('/api/outreach/geo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: geoScope.countryCode,
          countryName: geoScope.countryName,
          stateOrRegion: geoScope.stateOrRegion,
          rows: validRows,
        }),
      }).catch(() => {});

      // Dispatch campaign
      const res = await fetch('/api/outreach/campaigns/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          subject,
          bodyHtml,
          bodyText: subject,
          templateId: selectedTemplateId,
          targetCountries: [geoScope.countryName],
          targetStates: [geoScope.stateOrRegion],
          recipients: validRows,
          overrideDuplicate: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Also persist simulated entries to local single dispatches ledger so they appear instantly in tracker
        try {
          const raw = localStorage.getItem('sf_single_dispatches_ledger');
          const existingLedger = raw ? JSON.parse(raw) : [];
          const nowStr = new Date().toISOString();

          const simulatedEntries = validRows.map((r, i) => ({
            id: `sim_${Date.now()}_${i}`,
            college_name: r.college_name,
            email: r.email,
            department: r.department || 'Training & Placement',
            contact_person: r.contact_person || 'Faculty Representative',
            designation: r.designation || 'Principal',
            country: r.country || geoScope.countryName,
            state: r.state || geoScope.stateOrRegion,
            status: 'ACCEPTED',
            delivery_status: 'SMTP_ACCEPTED',
            failure_type: 'NONE',
            smtp_response: '250 OK Message Simulated (Test Mode Active - No real email dispatched)',
            smtp_message_id: `<simulated_${Date.now()}_${i}@simulation.local>`,
            created_at: nowStr,
            sent_at: nowStr,
            campaign_id: data.campaignId || 'SPREADSHEET_INGESTION_SIMULATION',
            is_simulated: true,
          }));

          const updated = [...simulatedEntries, ...existingLedger].slice(0, 500);
          localStorage.setItem('sf_single_dispatches_ledger', JSON.stringify(updated));
        } catch {}

        setFeedback({
          type: 'success',
          showTrackerButton: true,
          message: `Campaign dispatched for ${data.recipientsCount || validRows.length} institutions (${data.simulation ? 'Simulation Mode Active - No real email sent' : 'Live Delivery'}). All details are now tracked in Mails tracker!`,
        });

        // Clear approved rows
        setParsedRows((prev) => prev.filter((r) => !r.isValid && !r.isApproved));
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to dispatch campaign.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Dispatch error: ' + err.message });
    } finally {
      setIsDispatching(false);
    }
  };

  // Statistics
  const validCount = parsedRows.filter((r) => r.isValid || r.isApproved).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid && !r.isApproved).length;
  const dupCount = parsedRows.filter((r) => r.errors?.email_dup).length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>College Data Ingestion & Spreadsheet Review</h2>
        <p className={styles.description}>
          Upload and review institutional datasets (.xlsx / .csv), automatically validate contact emails, fix errors in-place with row approval, and safely dispatch simulated test emails to track in Mails tracker.
        </p>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`${styles.feedbackBanner} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          {feedback.type === 'success' ? <CheckCircleIcon size={16} /> : <AlertCircleIcon size={16} />}
          <span>{feedback.message}</span>

          {feedback.showTrackerButton && onNavigateTab && (
            <button
              type="button"
              className={styles.btnTrackerLink}
              onClick={() => onNavigateTab('campaigns')}
            >
              <span>View in Mails Tracker →</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Main Card: Batch Spreadsheet Ingestion */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Batch Spreadsheet Ingestion</div>
            <div className={styles.cardSubtitle}>
              Standard template verification with case-insensitive column detection, template selection, and interactive inline correction.
            </div>
          </div>
          {simulationModeActive && (
            <span className={styles.statPillSim}>
              Simulation Mode: ON (Testing - No Real Emails)
            </span>
          )}
        </div>

        {/* Configuration Panel: Template Selection + Geo Scoping */}
        <div className={styles.configPanel}>
          {/* Template Selection Dropdown */}
          <div className={styles.configGroup} style={{ gridColumn: 'span 2' }}>
            <label className={styles.label}>Select Outreach Proposal Template *</label>
            <select
              className={styles.select}
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || t.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Subject: {selectedTemplate?.subject_template || selectedTemplate?.subjectTemplate || 'Campus Outreach Proposal'}
            </span>
          </div>

          {/* Geo Scope: Country */}
          <div className={styles.configGroup}>
            <label className={styles.label}>Default Country</label>
            <select
              className={styles.select}
              value={geoScope.countryName}
              onChange={(e) => setGeoScope({ ...geoScope, countryName: e.target.value })}
            >
              <option value="India">India (50,000+ Colleges)</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
            </select>
          </div>

          {/* Geo Scope: State */}
          <div className={styles.configGroup}>
            <label className={styles.label}>Default State / Region</label>
            <select
              className={styles.select}
              value={geoScope.stateOrRegion}
              onChange={(e) => setGeoScope({ ...geoScope, stateOrRegion: e.target.value })}
            >
              <option value="Andhra Pradesh">Andhra Pradesh (3,420 Colleges)</option>
              <option value="Tamil Nadu">Tamil Nadu (3,850 Colleges)</option>
              <option value="Telangana">Telangana (2,650 Colleges)</option>
              <option value="Karnataka">Karnataka (3,920 Colleges)</option>
              <option value="Maharashtra">Maharashtra (4,650 Colleges)</option>
              <option value="Uttar Pradesh">Uttar Pradesh (4,820 Colleges)</option>
              <option value="Rajasthan">Rajasthan (3,250 Colleges)</option>
              <option value="Gujarat">Gujarat (2,540 Colleges)</option>
              <option value="West Bengal">West Bengal (2,450 Colleges)</option>
              <option value="Kerala">Kerala (1,840 Colleges)</option>
              <option value="Delhi">Delhi (1,350 Colleges)</option>
            </select>
          </div>

          {/* Geo Scope: District */}
          <div className={styles.configGroup}>
            <label className={styles.label}>Default District (Optional)</label>
            <input
              type="text"
              className={styles.input}
              value={geoScope.district}
              onChange={(e) => setGeoScope({ ...geoScope, district: e.target.value })}
              placeholder="e.g. Visakhapatnam / Guntur"
            />
          </div>
        </div>

        {/* Upload Dropzone & Standard Template Download Box */}
        <div className={styles.uploadSection}>
          <div
            className={styles.dropzone}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <UploadCloudIcon size={34} style={{ color: '#0d9488' }} />
            <div className={styles.dropzoneText}>
              {uploadFileName ? `Loaded: ${uploadFileName}` : 'Click or Drag & Drop Excel / CSV file here'}
            </div>
            <div className={styles.dropzoneSub}>
              Supported formats: Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
            </div>
          </div>

          <div className={styles.templateBox}>
            <div className={styles.templateTitle}>Standard Ingestion Templates (Fake Emails)</div>
            <div className={styles.templateDesc}>
              Download our pre-formatted spreadsheet template with standard columns and strictly synthetic test emails for safe simulation.
            </div>
            <div className={styles.templateButtons}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => downloadTemplate('xlsx')}
              >
                <DownloadIcon size={14} />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => downloadTemplate('csv')}
              >
                <DownloadIcon size={14} />
                <span>CSV (.csv)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Spreadsheet Table & Verification Results */}
        {parsedRows.length > 0 && (
          <>
            {/* Stats Bar with Send & Track Button */}
            <div className={styles.statsBar}>
              <div className={styles.statItem}>
                <span>Total Rows:</span>
                <span className={styles.statNumber}>{parsedRows.length}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statPillGreen}>Ready / Approved: {validCount}</span>
              </div>
              {invalidCount > 0 && (
                <div className={styles.statItem}>
                  <span className={styles.statPillRed}>Errors (Red Cells): {invalidCount}</span>
                </div>
              )}
              {dupCount > 0 && (
                <div className={styles.statItem}>
                  <span className={styles.statPillOrange}>Batch Duplicates: {dupCount}</span>
                </div>
              )}

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* Primary Button: Dispatch & Track in Mails Tracker */}
                <button
                  type="button"
                  className={simulationModeActive ? styles.btnSimulate : styles.btnPrimary}
                  onClick={handleDispatchCampaign}
                  disabled={isDispatching || validCount === 0}
                  title="Dispatch with selected template and track in Mails tracker"
                >
                  <SendIcon size={14} />
                  <span>
                    {isDispatching
                      ? 'Dispatching...'
                      : simulationModeActive
                      ? `Send & Track in Mails Tracker (${validCount} Simulated)`
                      : `Dispatch Outreach (${validCount})`}
                  </span>
                </button>

                {/* Secondary Button: Import to directory only */}
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleImportOnly}
                  disabled={isImporting || validCount === 0}
                >
                  <CheckCircleIcon size={14} />
                  <span>{isImporting ? 'Saving...' : 'Import to Directory'}</span>
                </button>

                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setParsedRows([]);
                    setUploadFileName('');
                  }}
                >
                  Clear Table
                </button>
              </div>
            </div>

            {/* Interactive Spreadsheet Table */}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th style={{ minWidth: '180px' }}>College / University Name *</th>
                    <th style={{ minWidth: '180px' }}>Recipient Email Address *</th>
                    <th style={{ minWidth: '160px' }}>Official Website URL</th>
                    <th style={{ minWidth: '140px' }}>Contact Person</th>
                    <th style={{ minWidth: '130px' }}>Designation</th>
                    <th style={{ minWidth: '130px' }}>Department</th>
                    <th style={{ minWidth: '120px' }}>State / Region</th>
                    <th style={{ minWidth: '110px' }}>District</th>
                    <th style={{ minWidth: '90px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => {
                    const hasCollegeError = Boolean(row.errors?.college_name);
                    const hasEmailError = Boolean(row.errors?.email || row.errors?.email_dup);

                    return (
                      <tr key={row.id || idx}>
                        <td style={{ color: '#64748b', fontWeight: 650, textAlign: 'center' }}>
                          {idx + 1}
                        </td>

                        {/* College Name Cell */}
                        <td className={hasCollegeError ? styles.cellError : ''}>
                          <input
                            type="text"
                            className={`${styles.cellInput} ${hasCollegeError ? styles.cellInputError : ''}`}
                            value={row.college_name || ''}
                            onChange={(e) => handleCellChange(idx, 'college_name', e.target.value)}
                            placeholder="College Name"
                          />
                          {hasCollegeError && (
                            <span className={styles.errorTooltip}>{row.errors.college_name}</span>
                          )}
                        </td>

                        {/* Email Cell */}
                        <td className={hasEmailError ? styles.cellError : ''}>
                          <input
                            type="text"
                            className={`${styles.cellInput} ${hasEmailError ? styles.cellInputError : ''}`}
                            value={row.email || ''}
                            onChange={(e) => handleCellChange(idx, 'email', e.target.value)}
                            placeholder="email@college.edu.in"
                          />
                          {hasEmailError && (
                            <span className={styles.errorTooltip}>
                              {row.errors.email || row.errors.email_dup}
                            </span>
                          )}
                        </td>

                        {/* Website Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.website_url || ''}
                            onChange={(e) => handleCellChange(idx, 'website_url', e.target.value)}
                            placeholder="https://..."
                          />
                        </td>

                        {/* Contact Person Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.contact_person || ''}
                            onChange={(e) => handleCellChange(idx, 'contact_person', e.target.value)}
                            placeholder="Contact Person"
                          />
                        </td>

                        {/* Designation Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.designation || ''}
                            onChange={(e) => handleCellChange(idx, 'designation', e.target.value)}
                            placeholder="Designation"
                          />
                        </td>

                        {/* Department Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.department || ''}
                            onChange={(e) => handleCellChange(idx, 'department', e.target.value)}
                            placeholder="Department"
                          />
                        </td>

                        {/* State Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.state || ''}
                            onChange={(e) => handleCellChange(idx, 'state', e.target.value)}
                            placeholder="State"
                          />
                        </td>

                        {/* District Cell */}
                        <td>
                          <input
                            type="text"
                            className={styles.cellInput}
                            value={row.district || ''}
                            onChange={(e) => handleCellChange(idx, 'district', e.target.value)}
                            placeholder="District"
                          />
                        </td>

                        {/* Action Cell: Tick Button (✓) + Delete */}
                        <td>
                          <div className={styles.actionCell}>
                            <button
                              type="button"
                              className={styles.btnTick}
                              onClick={() => handleTickRow(idx)}
                              title="Validate & Approve Row"
                            >
                              <CheckIcon size={14} />
                            </button>
                            <button
                              type="button"
                              className={styles.btnDelete}
                              onClick={() => handleDeleteRow(idx)}
                              title="Delete Row"
                            >
                              <CloseIcon size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
