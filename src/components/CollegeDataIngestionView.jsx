'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import styles from './CollegeDataIngestionView.module.css';
import {
  BuildingIcon,
  UploadCloudIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
  CheckIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CloseIcon,
  RefreshCwIcon,
  FilterIcon,
  GlobeIcon,
  UserIcon,
} from './Icons';

// Strict Email Validator:
// - Case insensitive
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

const SAMPLE_TEMPLATE_ROWS = [
  {
    'College Name': 'PSG College of Technology',
    'Official Website': 'https://www.psgtech.edu',
    'Recipient Email': 'principal@psgtech.edu',
    'Contact Person': 'Dr. K. Prakasan',
    'Designation': 'Principal',
    'Department': 'Mechanical & Production',
    'Country': 'India',
    'State': 'Tamil Nadu',
    'District': 'Coimbatore',
    'City': 'Coimbatore',
    'Phone': '+91 422 2572177',
  },
  {
    'College Name': 'Andhra University College of Engineering',
    'Official Website': 'https://www.andhrauniversity.edu.in',
    'Recipient Email': 'dean.engineering@andhrauniversity.edu.in',
    'Contact Person': 'Prof. P. S. Rao',
    'Designation': 'Dean & Faculty Coordinator',
    'Department': 'Computer Science & Engineering',
    'Country': 'India',
    'State': 'Andhra Pradesh',
    'District': 'Visakhapatnam',
    'City': 'Visakhapatnam',
    'Phone': '+91 891 2844000',
  },
  {
    'College Name': 'National Institute of Technology Warangal',
    'Official Website': 'https://www.nitw.ac.in',
    'Recipient Email': 'tpo@nitw.ac.in',
    'Contact Person': 'Dr. Suresh Kumar',
    'Designation': 'Training & Placement Officer',
    'Department': 'Training and Placement Cell',
    'Country': 'India',
    'State': 'Telangana',
    'District': 'Warangal',
    'City': 'Warangal',
    'Phone': '+91 870 2459191',
  },
];

export default function CollegeDataIngestionView({ session }) {
  const [activeTab, setActiveTab] = useState('spreadsheet'); // 'spreadsheet' | 'single' | 'directory'
  const [feedback, setFeedback] = useState(null);

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
  const fileInputRef = useRef(null);

  // Manual Single College Entry State
  const [singleCollege, setSingleCollege] = useState({
    college_name: '',
    website_url: '',
    email: '',
    contact_person: '',
    designation: 'Principal / Faculty Coordinator',
    department: 'Campus Outreach & Training',
    country_name: 'India',
    country_code: 'IN',
    state_or_region: 'Andhra Pradesh',
    district: '',
    city: '',
    phone: '',
  });
  const [savingSingle, setSavingSingle] = useState(false);

  // Directory Browser State
  const [directoryColleges, setDirectoryColleges] = useState([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryStateFilter, setDirectoryStateFilter] = useState('All');

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
        { wch: 32 }, // Recipient Email
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
        message: `College data template (${format.toUpperCase()}) downloaded successfully. Fill and upload below!`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to generate template: ' + err.message });
    }
  };

  // Auto-detect column headers flexibly
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

    // 2. Validate Email
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
            message: `Uploaded ${evaluated.length} records! All rows passed validation checks and are ready for import.`,
          });
        }
      } catch (err) {
        setFeedback({ type: 'error', message: 'Failed to parse file: ' + err.message });
      }
    };

    reader.readAsArrayBuffer(file);
    // Reset file input value so user can re-upload if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Inline cell edit handler
  const handleCellChange = (rowIndex, field, value) => {
    setParsedRows((prev) => {
      const next = [...prev];
      const target = { ...next[rowIndex], [field]: value };

      // Re-evaluate emails for duplicates
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
  const handleImportAllValid = async () => {
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
        // Remove imported rows from preview table
        setParsedRows((prev) => prev.filter((r) => !r.isValid && !r.isApproved));
        fetchDirectory();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to import records.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Network error during ingestion: ' + err.message });
    } finally {
      setIsImporting(false);
    }
  };

  // Save Single College
  const handleSaveSingleCollege = async (e) => {
    e.preventDefault();

    if (!singleCollege.college_name.trim()) {
      setFeedback({ type: 'error', message: 'Please enter the College / University Name.' });
      return;
    }

    const emailCheck = validateEmailString(singleCollege.email);
    if (!emailCheck.valid) {
      setFeedback({ type: 'error', message: `Recipient Email error: ${emailCheck.reason}` });
      return;
    }

    try {
      setSavingSingle(true);
      const res = await fetch('/api/outreach/geo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college: {
            college_name: singleCollege.college_name.trim(),
            website_url: singleCollege.website_url.trim(),
            email: singleCollege.email.trim(),
            contact_person: singleCollege.contact_person.trim() || 'Institutional Coordinator',
            designation: singleCollege.designation.trim() || 'Principal / Faculty Coordinator',
            department: singleCollege.department.trim() || 'Campus Outreach',
            country_name: singleCollege.country_name || 'India',
            country_code: singleCollege.country_code || 'IN',
            state_or_region: singleCollege.state_or_region || 'Andhra Pradesh',
            district: singleCollege.district.trim(),
            city: singleCollege.city.trim(),
            phone: singleCollege.phone.trim(),
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `College "${singleCollege.college_name}" and its official contact added to the directory!`,
        });
        setSingleCollege({
          college_name: '',
          website_url: '',
          email: '',
          contact_person: '',
          designation: 'Principal / Faculty Coordinator',
          department: 'Campus Outreach & Training',
          country_name: 'India',
          country_code: 'IN',
          state_or_region: 'Andhra Pradesh',
          district: '',
          city: '',
          phone: '',
        });
        fetchDirectory();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to save college.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Network error saving college: ' + err.message });
    } finally {
      setSavingSingle(false);
    }
  };

  // Fetch Directory Colleges
  const fetchDirectory = async () => {
    try {
      setDirectoryLoading(true);
      const states = directoryStateFilter === 'All' ? [] : [directoryStateFilter];
      const res = await fetch('/api/outreach/geo/colleges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          states,
          search: directorySearch,
          limit: 100,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDirectoryColleges(data.colleges || []);
        setDirectoryTotal(data.total || 0);
      }
    } catch {
      // directory fetch error fallback
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'directory') {
      fetchDirectory();
    }
  }, [activeTab, directoryStateFilter]);

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
          Upload and review institutional datasets (.xlsx / .csv), automatically validate contact emails, fix errors in-place with row approval, and manage individual college profiles.
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Nav Sub-Tabs */}
      <div className={styles.tabNav}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'spreadsheet' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('spreadsheet')}
        >
          <FileSpreadsheetIcon size={16} />
          <span>CSV / XLSX Ingestion & Review</span>
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'single' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('single')}
        >
          <BuildingIcon size={16} />
          <span>Manual Single College Entry</span>
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'directory' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('directory')}
        >
          <GlobeIcon size={16} />
          <span>Directory Browser ({directoryTotal})</span>
        </button>
      </div>

      {/* TAB 1: CSV / XLSX SPREADSHEET REVIEW */}
      {activeTab === 'spreadsheet' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Batch Spreadsheet Ingestion</div>
              <div className={styles.cardSubtitle}>
                Standard template verification with case-insensitive column detection and interactive error correction.
              </div>
            </div>
          </div>

          {/* Geo Scope Selectors */}
          <div className={styles.geoPanel}>
            <div className={styles.geoGroup}>
              <label className={styles.label}>Default Country</label>
              <select
                className={styles.select}
                value={geoScope.countryName}
                onChange={(e) => setGeoScope({ ...geoScope, countryName: e.target.value })}
              >
                <option value="India">India</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Canada">Canada</option>
                <option value="Australia">Australia</option>
              </select>
            </div>

            <div className={styles.geoGroup}>
              <label className={styles.label}>Default State / Region</label>
              <select
                className={styles.select}
                value={geoScope.stateOrRegion}
                onChange={(e) => setGeoScope({ ...geoScope, stateOrRegion: e.target.value })}
              >
                <option value="Andhra Pradesh">Andhra Pradesh</option>
                <option value="Tamil Nadu">Tamil Nadu</option>
                <option value="Telangana">Telangana</option>
                <option value="Karnataka">Karnataka</option>
                <option value="Maharashtra">Maharashtra</option>
                <option value="Kerala">Kerala</option>
                <option value="Delhi">Delhi</option>
                <option value="Gujarat">Gujarat</option>
              </select>
            </div>

            <div className={styles.geoGroup}>
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

          {/* Upload Dropzone & Template Download Box */}
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
              <div className={styles.templateTitle}>Standard Ingestion Templates</div>
              <div className={styles.templateDesc}>
                Use our pre-formatted spreadsheet template with standard columns and sample institutional rows.
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
              {/* Stats Bar */}
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

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleImportAllValid}
                    disabled={isImporting || validCount === 0}
                  >
                    <CheckCircleIcon size={15} />
                    <span>{isImporting ? 'Importing...' : `Import Valid Records (${validCount})`}</span>
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
      )}

      {/* TAB 2: MANUAL SINGLE COLLEGE ENTRY */}
      {activeTab === 'single' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Manual College & Contact Entry</div>
              <div className={styles.cardSubtitle}>
                Add an individual college with verified website and official faculty contact directly to the institutional registry.
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSingleCollege}>
            <div className={styles.manualFormGrid}>
              <div className={styles.geoGroup}>
                <label className={styles.label}>College / University Name *</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.college_name}
                  onChange={(e) => setSingleCollege({ ...singleCollege, college_name: e.target.value })}
                  placeholder="e.g. PSG College of Technology"
                  required
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Official Website URL</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.website_url}
                  onChange={(e) => setSingleCollege({ ...singleCollege, website_url: e.target.value })}
                  placeholder="e.g. https://www.psgtech.edu"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Recipient Email Address *</label>
                <input
                  type="email"
                  className={styles.input}
                  value={singleCollege.email}
                  onChange={(e) => setSingleCollege({ ...singleCollege, email: e.target.value })}
                  placeholder="e.g. placement@psgtech.edu"
                  required
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Contact Person / Faculty Name</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.contact_person}
                  onChange={(e) => setSingleCollege({ ...singleCollege, contact_person: e.target.value })}
                  placeholder="e.g. Dr. K. Prakasan"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Designation</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.designation}
                  onChange={(e) => setSingleCollege({ ...singleCollege, designation: e.target.value })}
                  placeholder="e.g. Principal / Faculty Coordinator"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Department / Student Club</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.department}
                  onChange={(e) => setSingleCollege({ ...singleCollege, department: e.target.value })}
                  placeholder="e.g. Information Technology & Placement"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Country</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.country_name}
                  onChange={(e) => setSingleCollege({ ...singleCollege, country_name: e.target.value })}
                  placeholder="India"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>State / Region</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.state_or_region}
                  onChange={(e) => setSingleCollege({ ...singleCollege, state_or_region: e.target.value })}
                  placeholder="e.g. Andhra Pradesh / Tamil Nadu"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>District</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.district}
                  onChange={(e) => setSingleCollege({ ...singleCollege, district: e.target.value })}
                  placeholder="e.g. Visakhapatnam / Guntur"
                />
              </div>

              <div className={styles.geoGroup}>
                <label className={styles.label}>Phone / Mobile Number</label>
                <input
                  type="text"
                  className={styles.input}
                  value={singleCollege.phone}
                  onChange={(e) => setSingleCollege({ ...singleCollege, phone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              <div className={styles.manualActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() =>
                    setSingleCollege({
                      college_name: '',
                      website_url: '',
                      email: '',
                      contact_person: '',
                      designation: 'Principal / Faculty Coordinator',
                      department: 'Campus Outreach & Training',
                      country_name: 'India',
                      country_code: 'IN',
                      state_or_region: 'Andhra Pradesh',
                      district: '',
                      city: '',
                      phone: '',
                    })
                  }
                >
                  Clear Fields
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={savingSingle}
                >
                  <BuildingIcon size={14} />
                  <span>{savingSingle ? 'Saving...' : 'Add College to Directory'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: DIRECTORY BROWSER */}
      {activeTab === 'directory' && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Live Institutional Directory</div>
              <div className={styles.cardSubtitle}>
                Browse, search, and verify colleges currently loaded in the database.
              </div>
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={fetchDirectory}
              disabled={directoryLoading}
            >
              <RefreshCwIcon size={14} />
              <span>{directoryLoading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className={styles.input}
              style={{ maxWidth: '320px' }}
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Search college, district, website..."
              onKeyDown={(e) => e.key === 'Enter' && fetchDirectory()}
            />
            <select
              className={styles.select}
              style={{ maxWidth: '200px' }}
              value={directoryStateFilter}
              onChange={(e) => setDirectoryStateFilter(e.target.value)}
            >
              <option value="All">All States</option>
              <option value="Andhra Pradesh">Andhra Pradesh</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="Telangana">Telangana</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Maharashtra">Maharashtra</option>
            </select>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={fetchDirectory}
            >
              Search
            </button>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>College Name</th>
                  <th>Official Website</th>
                  <th>State & District</th>
                  <th>Official Email Contacts</th>
                </tr>
              </thead>
              <tbody>
                {directoryColleges.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      {directoryLoading ? 'Loading directory colleges...' : 'No college records found.'}
                    </td>
                  </tr>
                ) : (
                  directoryColleges.map((c, i) => (
                    <tr key={c.id || i}>
                      <td style={{ color: '#64748b', textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>{c.college_name}</td>
                      <td>
                        {c.website_url ? (
                          <a
                            href={c.website_url.startsWith('http') ? c.website_url : `https://${c.website_url}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#0d9488', textDecoration: 'underline' }}
                          >
                            {c.website_url}
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>N/A</span>
                        )}
                      </td>
                      <td>
                        {c.district ? `${c.district}, ` : ''}{c.state_or_region || c.state}
                      </td>
                      <td>
                        {c.contacts && c.contacts.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {c.contacts.map((ct, idx) => (
                              <div key={idx} style={{ fontSize: '11px', color: '#334155' }}>
                                <span style={{ fontWeight: 600 }}>{ct.email}</span>
                                {ct.contact_person ? ` (${ct.contact_person})` : ''}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>No emails on record</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
