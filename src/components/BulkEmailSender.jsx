'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import styles from './BulkEmailSender.module.css';
import {
  MailIcon,
  BuildingIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  CloseIcon,
  SendIcon,
  ClockIcon,
  ImageIcon,
} from './Icons.jsx';
import EmailImageManagerModal from './EmailImageManagerModal.jsx';
import { renderTemplate, formatBodyToHtml, htmlToJinjaText, DEFAULT_TEMPLATES } from '@/lib/templates.js';
import * as XLSX from 'xlsx';

const DEFAULT_COUNTRIES = [
  { code: 'IN', name: 'India', college_count: 2323 },
  { code: 'US', name: 'United States', college_count: 0 },
  { code: 'GB', name: 'United Kingdom', college_count: 0 },
  { code: 'CA', name: 'Canada', college_count: 0 },
  { code: 'AU', name: 'Australia', college_count: 0 },
  { code: 'AE', name: 'United Arab Emirates', college_count: 0 },
  { code: 'SG', name: 'Singapore', college_count: 0 },
  { code: 'DE', name: 'Germany', college_count: 0 },
  { code: 'MY', name: 'Malaysia', college_count: 0 },
  { code: 'NZ', name: 'New Zealand', college_count: 0 },
];

const DEFAULT_INDIA_REGIONS = [
  { id: 'IN-AP', name: 'Andhra Pradesh', type: 'state', college_count: 1466, contact_count: 2192 },
  { id: 'IN-TN', name: 'Tamil Nadu', type: 'state', college_count: 232, contact_count: 545 },
  { id: 'IN-DL', name: 'Delhi', type: 'union_territory', college_count: 150, contact_count: 475 },
  { id: 'IN-RJ', name: 'Rajasthan', type: 'state', college_count: 51, contact_count: 62 },
  { id: 'IN-KA', name: 'Karnataka', type: 'state', college_count: 40, contact_count: 48 },
  { id: 'IN-GJ', name: 'Gujarat', type: 'state', college_count: 39, contact_count: 43 },
  { id: 'IN-UP', name: 'Uttar Pradesh', type: 'state', college_count: 36, contact_count: 40 },
  { id: 'IN-MP', name: 'Madhya Pradesh', type: 'state', college_count: 32, contact_count: 36 },
  { id: 'IN-MH', name: 'Maharashtra', type: 'state', college_count: 25, contact_count: 35 },
  { id: 'IN-AS', name: 'Assam', type: 'state', college_count: 14, contact_count: 33 },
  { id: 'IN-HR', name: 'Haryana', type: 'state', college_count: 23, contact_count: 27 },
  { id: 'IN-BR', name: 'Bihar', type: 'state', college_count: 13, contact_count: 24 },
  { id: 'IN-JH', name: 'Jharkhand', type: 'state', college_count: 10, contact_count: 24 },
  { id: 'IN-CH', name: 'Chandigarh', type: 'union_territory', college_count: 8, contact_count: 23 },
  { id: 'IN-TG', name: 'Telangana', type: 'state', college_count: 11, contact_count: 23 },
  { id: 'IN-MN', name: 'Manipur', type: 'state', college_count: 7, contact_count: 22 },
  { id: 'IN-HP', name: 'Himachal Pradesh', type: 'state', college_count: 16, contact_count: 20 },
  { id: 'IN-WB', name: 'West Bengal', type: 'state', college_count: 12, contact_count: 20 },
  { id: 'IN-JK', name: 'Jammu and Kashmir', type: 'state', college_count: 11, contact_count: 19 },
  { id: 'IN-UT', name: 'Uttarakhand', type: 'state', college_count: 14, contact_count: 18 },
  { id: 'IN-PB', name: 'Punjab', type: 'state', college_count: 17, contact_count: 17 },
  { id: 'IN-OR', name: 'Odisha', type: 'state', college_count: 6, contact_count: 16 },
  { id: 'IN-KL', name: 'Kerala', type: 'state', college_count: 12, contact_count: 14 },
  { id: 'IN-ML', name: 'Meghalaya', type: 'state', college_count: 7, contact_count: 13 },
  { id: 'IN-NL', name: 'Nagaland', type: 'state', college_count: 6, contact_count: 13 },
  { id: 'IN-CT', name: 'Chhattisgarh', type: 'state', college_count: 12, contact_count: 12 },
  { id: 'IN-PY', name: 'Puducherry', type: 'union_territory', college_count: 6, contact_count: 12 },
  { id: 'IN-AR', name: 'Arunachal Pradesh', type: 'state', college_count: 8, contact_count: 10 },
  { id: 'IN-GA', name: 'Goa', type: 'state', college_count: 7, contact_count: 8 },
  { id: 'IN-SK', name: 'Sikkim', type: 'state', college_count: 6, contact_count: 7 },
  { id: 'IN-TR', name: 'Tripura', type: 'state', college_count: 5, contact_count: 7 },
  { id: 'IN-DN', name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'union_territory', college_count: 4, contact_count: 5 },
  { id: 'IN-MZ', name: 'Mizoram', type: 'state', college_count: 2, contact_count: 4 },
  { id: 'IN-AN', name: 'Andaman and Nicobar Islands', type: 'union_territory', college_count: 2, contact_count: 2 },
  { id: 'IN-LA', name: 'Ladakh', type: 'union_territory', college_count: 2, contact_count: 2 },
];

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXTRACT_EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function cleanString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function extractEmail(val) {
  if (!val) return '';
  const s = String(val).trim();
  const match = s.match(EXTRACT_EMAIL_REGEX);
  return match ? match[0].toLowerCase() : s.toLowerCase();
}

function extractAllEmails(val) {
  if (!val) return [];
  const s = String(val);
  const matches = s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.toLowerCase().trim()))];
}

// Compute active target email and institutional role for a campus row based on chosen target role
function computeRecipientTarget(item, roleMode = 'smart') {
  let targetEmail = '';
  let roleTag = '';
  let roleType = '';
  let isFallback = false;

  const principal = item.principal_emails?.[0];
  const tpo = item.tpo_emails?.[0];
  const dean = item.student_affairs_emails?.[0];
  const hod = item.hod_emails?.[0];
  const primary = item.primary_emails?.[0];
  const faculty = item.faculty_emails?.[0];
  const combined = item.combined_emails?.[0];

  if (roleMode === 'principal') {
    if (principal) {
      targetEmail = principal;
      roleTag = 'Principal / Director';
      roleType = 'principal';
    } else {
      isFallback = true;
    }
  } else if (roleMode === 'tpo') {
    if (tpo) {
      targetEmail = tpo;
      roleTag = 'TPO / Placement Head';
      roleType = 'tpo';
    } else {
      isFallback = true;
    }
  } else if (roleMode === 'student_affairs') {
    if (dean) {
      targetEmail = dean;
      roleTag = 'Dean Student Affairs';
      roleType = 'student_affairs';
    } else {
      isFallback = true;
    }
  } else if (roleMode === 'hod') {
    if (hod) {
      targetEmail = hod;
      roleTag = 'Head of Department (HOD)';
      roleType = 'hod';
    } else {
      isFallback = true;
    }
  } else if (roleMode === 'primary') {
    if (primary) {
      targetEmail = primary;
      roleTag = 'Primary Official Mail';
      roleType = 'primary';
    } else {
      isFallback = true;
    }
  }

  // Fallback to Smart Priority if roleMode === 'smart' or requested role is missing in this row
  if (!targetEmail) {
    if (principal) {
      targetEmail = principal;
      roleTag = isFallback ? 'Principal (Fallback)' : 'Principal / Director';
      roleType = 'principal';
    } else if (tpo) {
      targetEmail = tpo;
      roleTag = isFallback ? 'TPO (Fallback)' : 'TPO & Placements';
      roleType = 'tpo';
    } else if (primary) {
      targetEmail = primary;
      roleTag = isFallback ? 'Official Mail (Fallback)' : 'Official Mail';
      roleType = 'primary';
    } else if (dean) {
      targetEmail = dean;
      roleTag = isFallback ? 'Dean SW (Fallback)' : 'Dean Student Affairs';
      roleType = 'student_affairs';
    } else if (hod) {
      targetEmail = hod;
      roleTag = isFallback ? 'HOD (Fallback)' : 'Head of Department';
      roleType = 'hod';
    } else if (combined) {
      targetEmail = combined;
      roleTag = isFallback ? 'Verified Inbox (Fallback)' : 'Verified Inbox';
      roleType = 'combined';
    } else if (faculty) {
      targetEmail = faculty;
      roleTag = isFallback ? 'Faculty (Fallback)' : 'Faculty';
      roleType = 'faculty';
    } else if (item.raw_email) {
      targetEmail = item.raw_email;
      roleTag = 'Direct Contact';
      roleType = 'generic';
    } else if (item.all_available_emails?.length > 0) {
      targetEmail = item.all_available_emails[0];
      roleTag = 'Verified Contact';
      roleType = 'generic';
    }
  }

  const allUnique = item.all_available_emails || (targetEmail ? [targetEmail] : []);
  const alternatives = allUnique.filter((e) => e.toLowerCase() !== (targetEmail || '').toLowerCase());

  return {
    email: targetEmail,
    role_tag: roleTag || 'Contact',
    role_type: roleType || 'generic',
    alternative_emails: alternatives,
    is_fallback: isFallback,
  };
}

function parseSpreadsheetBuffer(buffer, fileName = '') {
  let wb = null;
  const sheetMap = {};

  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    for (const sName of wb.SheetNames) {
      const s = wb.Sheets[sName];
      const data = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
      if (data && data.length > 0) {
        sheetMap[sName] = data;
      }
    }
  } catch (err) {
    console.warn('[Parser] Binary parse note:', err?.message);
  }

  const sheetNames = Object.keys(sheetMap);
  if (sheetNames.length === 0) return { rows: [], sheets: [] };

  // Select best sheet (longest data or preferred AP master sheet)
  const defaultSheet = sheetNames.includes('All Colleges AP Master')
    ? 'All Colleges AP Master'
    : sheetNames.reduce((prev, curr) => (sheetMap[curr].length > sheetMap[prev].length ? curr : prev), sheetNames[0]);

  const raw2d = sheetMap[defaultSheet];
  const parsedRows = parseRaw2DToObjects(raw2d);

  return {
    rows: parsedRows,
    sheets: sheetNames,
    rawSheets: sheetMap,
    defaultSheet,
  };
}

function parseRaw2DToObjects(raw2d) {
  if (!raw2d || raw2d.length === 0) return [];
  const cleanRows = raw2d.filter((row) => Array.isArray(row) && row.some((c) => cleanString(c).length > 0));
  if (cleanRows.length === 0) return [];

  let headerRowIdx = 0;
  let highestScore = 0;
  for (let r = 0; r < Math.min(10, cleanRows.length); r++) {
    const row = cleanRows[r];
    let score = 0;
    for (const cell of row) {
      const norm = cleanString(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (norm.includes('email') || norm.includes('mailid') || norm === 'mail') score += 5;
      if (norm.includes('college') || norm.includes('institution') || norm.includes('university')) score += 4;
      if (norm.includes('contact') || norm.includes('principal') || norm.includes('hod') || norm.includes('dean')) score += 2;
      if (norm.includes('district') || norm.includes('city') || norm.includes('website')) score += 2;
    }
    if (score > highestScore) {
      highestScore = score;
      headerRowIdx = r;
    }
  }

  const rawHeaders = cleanRows[headerRowIdx];
  const normalizedHeaders = rawHeaders.map((h) => cleanString(h).toLowerCase().replace(/[^a-z0-9]/g, ''));

  const cols = {
    college: -1,
    email: -1,
    website: -1,
    district: -1,
    stateAndCity: -1,
    contactPerson: -1,
    designation: -1,
    department: -1,
    phone: -1,
    category: -1,
  };

  normalizedHeaders.forEach((h, idx) => {
    if (cols.college === -1 && (h.includes('collegename') || h.includes('institutionname') || h === 'college' || h.includes('university'))) cols.college = idx;
    else if (cols.email === -1 && (h.includes('officialemail') || h.includes('primaryofficial') || h.includes('emailaddress') || h === 'email')) cols.email = idx;
    else if (cols.website === -1 && (h.includes('officialwebsite') || h.includes('websiteurl') || h === 'website')) cols.website = idx;
    else if (cols.district === -1 && (h === 'district' || h.includes('districtname'))) cols.district = idx;
    else if (cols.stateAndCity === -1 && (h.includes('stateandcity') || h.includes('citydistrict') || h === 'city')) cols.stateAndCity = idx;
    else if (cols.contactPerson === -1 && (h.includes('contactperson') || h.includes('persontitle') || h.includes('deptcontact'))) cols.contactPerson = idx;
    else if (cols.designation === -1 && (h.includes('designation') || h.includes('role') || h.includes('position'))) cols.designation = idx;
    else if (cols.department === -1 && (h.includes('department') || h.includes('academicdivision') || h.includes('functionalcell'))) cols.department = idx;
    else if (cols.phone === -1 && (h.includes('phone') || h.includes('mobile') || h.includes('aomobile'))) cols.phone = idx;
    else if (cols.category === -1 && (h.includes('collegetype') || h.includes('stream') || h.includes('category'))) cols.category = idx;
  });

  const dataRows = cleanRows.slice(headerRowIdx + 1);
  return dataRows.map((row, idx) => {
    const colName = cols.college !== -1 ? cleanString(row[cols.college]) : '';
    const rawMail = cols.email !== -1 ? cleanString(row[cols.email]) : '';
    const web = cols.website !== -1 ? cleanString(row[cols.website]) : '';
    const dist = cols.district !== -1 ? cleanString(row[cols.district]) : '';
    const city = cols.stateAndCity !== -1 ? cleanString(row[cols.stateAndCity]) : '';
    const person = cols.contactPerson !== -1 ? cleanString(row[cols.contactPerson]) : '';
    const desig = cols.designation !== -1 ? cleanString(row[cols.designation]) : '';
    const dept = cols.department !== -1 ? cleanString(row[cols.department]) : '';
    const ph = cols.phone !== -1 ? cleanString(row[cols.phone]) : '';
    const cat = cols.category !== -1 ? cleanString(row[cols.category]) : '';

    const allMails = extractAllEmails(rawMail);

    return {
      id: `row-${idx}-${Date.now()}`,
      rowNumber: idx + 1,
      college_name: colName,
      email: rawMail,
      raw_email: rawMail,
      website_url: web,
      city_district: dist || city,
      district: dist,
      state: 'Andhra Pradesh',
      contact_person: person,
      designation: desig || 'Official Representative',
      department: dept,
      phone: ph,
      category: cat,
      principal_emails: allMails,
      all_available_emails: allMails,
      primary_emails: allMails,
    };
  });
}

export default function BulkEmailSender({ templates = [], session, onCampaignFinished }) {
  const canSend = session ? session.role === 'admin' || session.role === 'team_lead' || Boolean(session.can_send) : true;
  const fileInputRef = useRef(null);

  // File & Loading State
  const [fileName, setFileName] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [availableSheets, setAvailableSheets] = useState([]);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [loadedDatasetData, setLoadedDatasetData] = useState(null);

  // Multi-Role & Cooldown State
  const [targetRole, setTargetRole] = useState('smart');
  const [cachedCooldownMap, setCachedCooldownMap] = useState({});

  // Applied Filters State
  const [filterType, setFilterType] = useState('all'); // all, eligible, cooldown, duplicate, invalid
  const [filterDistrict, setFilterDistrict] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterWebsite, setFilterWebsite] = useState('all'); // all, has_website, no_website
  const [searchQuery, setSearchQuery] = useState('');
  const [availableDistricts, setAvailableDistricts] = useState([]);

  // Auto Separate Batch State
  const [batchSize, setBatchSize] = useState(50); // 25, 50, 100, 200
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [batchStatusMap, setBatchStatusMap] = useState({});
  const [batchDelay, setBatchDelay] = useState(10); // seconds between auto batches
  const [batchCountdown, setBatchCountdown] = useState(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const pauseAutoPlayRef = useRef(false);

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Templates
  const initialTemplates = templates && templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  const [availableTemplates, setAvailableTemplates] = useState(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplates[0]?.id || 'campus-collaboration-proposal');
  const [subjectTemplate, setSubjectTemplate] = useState(
    initialTemplates[0]?.subject_template || initialTemplates[0]?.subjectTemplate || 'Proposal for Institutional Collaboration — Academic & Skill Development at {{college_name}}'
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    htmlToJinjaText(initialTemplates[0]?.body_template || initialTemplates[0]?.bodyTemplate || '')
  );
  const [campaignAttachments, setCampaignAttachments] = useState(
    Array.isArray(initialTemplates[0]?.attachments) ? initialTemplates[0]?.attachments : []
  );

  // Geographic Country & Region Targeting State
  const [countriesList, setCountriesList] = useState(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState('IN');
  const [regionsList, setRegionsList] = useState(DEFAULT_INDIA_REGIONS);
  const [selectedStates, setSelectedStates] = useState(new Set(['Andhra Pradesh']));
  const [stateSearch, setStateSearch] = useState('');
  const [loadingGeoData, setLoadingGeoData] = useState(false);
  const [loadingCollegesFromGeo, setLoadingCollegesFromGeo] = useState(false);
  const [geoNotice, setGeoNotice] = useState('');
  const [filterTier, setFilterTier] = useState('all'); // 'all' | 'tier1' | 'tier2' | 'tier3'
  const [isRescanning, setIsRescanning] = useState(false);

  // Customization Section State
  const [isCustomizationExpanded, setIsCustomizationExpanded] = useState(true);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentInputRef = useRef(null);
  const imageUploadInputRef = useRef(null);

  // Unified Template Selection Handler
  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const chosen = availableTemplates.find((t) => t.id === templateId);
    if (chosen) {
      setSubjectTemplate(chosen.subject_template || chosen.subjectTemplate || '');
      setBodyTemplate(htmlToJinjaText(chosen.body_template || chosen.bodyTemplate || ''));
      setCampaignAttachments(Array.isArray(chosen.attachments) ? chosen.attachments : []);
    }
  };

  // Fetch updated templates from database on mount
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch('/api/outreach/templates');
        if (res.ok) {
          const data = await res.json();
          if (data.templates && data.templates.length > 0) {
            setAvailableTemplates(data.templates);
            // If bodyTemplate was empty or not set, populate from first template
            if (!bodyTemplate) {
              const firstTpl = data.templates[0];
              setSelectedTemplateId(firstTpl.id);
              setSubjectTemplate(firstTpl.subject_template || firstTpl.subjectTemplate || '');
              setBodyTemplate(htmlToJinjaText(firstTpl.body_template || firstTpl.bodyTemplate || ''));
              setCampaignAttachments(Array.isArray(firstTpl.attachments) ? firstTpl.attachments : []);
            }
          }
        }
      } catch (err) {
        console.warn('[BulkSender] Template fetch note:', err?.message);
      }
    }
    fetchTemplates();
  }, []);

  // Load Geographic Countries
  useEffect(() => {
    async function fetchCountries() {
      try {
        const res = await fetch('/api/outreach/geo/countries');
        if (res.ok) {
          const data = await res.json();
          if (data.countries && data.countries.length > 0) {
            setCountriesList(data.countries);
          }
        }
      } catch (err) {
        console.error('Failed to load countries:', err);
      }
    }
    fetchCountries();
  }, []);

  // Load Regions when selectedCountry changes
  useEffect(() => {
    async function fetchRegions() {
      if (!selectedCountry) return;
      try {
        setLoadingGeoData(true);
        const res = await fetch(`/api/outreach/geo/regions?country=${selectedCountry}`);
        if (res.ok) {
          const data = await res.json();
          const regions = data.regions || [];
          if (regions.length > 0) {
            setRegionsList(regions);
            if (selectedCountry === 'IN') {
              setSelectedStates(new Set(['Andhra Pradesh']));
            } else {
              setSelectedStates(new Set([regions[0].name]));
            }
          } else if (selectedCountry === 'IN') {
            setRegionsList(DEFAULT_INDIA_REGIONS);
            setSelectedStates(new Set(['Andhra Pradesh']));
          } else {
            setRegionsList([]);
            setSelectedStates(new Set());
          }
        } else if (selectedCountry === 'IN') {
          setRegionsList(DEFAULT_INDIA_REGIONS);
          setSelectedStates(new Set(['Andhra Pradesh']));
        }
      } catch (err) {
        console.error('Failed to load regions:', err);
        if (selectedCountry === 'IN') {
          setRegionsList(DEFAULT_INDIA_REGIONS);
          setSelectedStates(new Set(['Andhra Pradesh']));
        }
      } finally {
        setLoadingGeoData(false);
      }
    }
    fetchRegions();
  }, [selectedCountry]);

  // Handler to toggle selection of a state/region
  const toggleStateSelection = (stateName) => {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      if (next.has(stateName)) {
        next.delete(stateName);
      } else {
        next.add(stateName);
      }
      return next;
    });
  };

  const handleSelectAllStates = () => {
    const all = new Set(regionsList.map((r) => r.name));
    setSelectedStates(all);
  };

  const handleClearAllStates = () => {
    setSelectedStates(new Set());
    setRecipients([]);
    setFileName('');
    setGeoNotice('Please select at least one state or union territory to load colleges.');
  };

  // Handler to query and load colleges for selected geographic region
  const handleLoadGeoColleges = async (overrideStates = null) => {
    const statesArr = Array.isArray(overrideStates) ? overrideStates : Array.from(selectedStates);
    if (statesArr.length === 0) {
      setRecipients([]);
      setFileName('');
      setGeoNotice('Please select at least one state or union territory to load colleges.');
      return;
    }
    setLoadingCollegesFromGeo(true);
    setGeoNotice('');
    setCampaignSummary(null);
    setCurrentPage(1);
    setSearchQuery('');
    setFilterDistrict('all');

    try {
      const res = await fetch('/api/outreach/geo/colleges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countries: [selectedCountry],
          states: statesArr,
          limit: 3000,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to query colleges from database.');
      }

      const data = await res.json();
      const colleges = data.colleges || [];

      if (colleges.length === 0) {
        setGeoNotice(
          `The selected region (${statesArr.join(', ')}) currently has 0 verified college contacts in the database. The Celery Beat monthly sync engine audits official regulatory portals (AISHE, UGC, AICTE) periodically to add updated contacts.`
        );
        setRecipients([]);
        setFileName('');
        return;
      }

      // Convert colleges to standardized recipient rows - strictly requiring verified real emails
      const standardized = [];
      const seenEmails = new Set();

      colleges.forEach((col, idx) => {
        const rawContacts = Array.isArray(col.contacts) ? col.contacts : [];
        rawContacts.forEach((ct, ctIdx) => {
          const rawEmail = cleanString(ct.email || '');
          if (!rawEmail || !rawEmail.includes('@') || rawEmail.includes('example.com') || rawEmail.includes('test.com')) {
            return; // Reject empty, dummy, or fallback emails
          }

          const allMails = extractAllEmails(rawEmail);
          const validEmail = allMails[0] || rawEmail;
          const normalized = validEmail.toLowerCase().trim();

          // Reject duplicates
          if (seenEmails.has(normalized)) {
            return;
          }
          seenEmails.add(normalized);

          const designation = ct.designation || ct.role || 'Academic Leadership';
          const person = (ct.contact_person && ct.contact_person.toLowerCase() !== 'nan' && ct.contact_person.toLowerCase() !== 'null') ? ct.contact_person : '';
          const roleStr = `${designation} ${person} ${validEmail}`.toLowerCase();

          // Strict 3-Tier Hierarchy Classification
          let roleTier = 3;
          let roleTierLabel = 'Tier 3 - Fallback';
          let rolePriority = 'low';

          // TIER 1 - HIGH PRIORITY (Primary Targets)
          if (
            roleStr.includes('tpo') ||
            roleStr.includes('placement') ||
            roleStr.includes('training') ||
            roleStr.includes('student affairs') ||
            roleStr.includes('student welfare') ||
            roleStr.includes('dsw') ||
            roleStr.includes('principal') ||
            roleStr.includes('campus director') ||
            roleStr.includes('director') ||
            roleStr.includes('industry relations') ||
            roleStr.includes('iiic')
          ) {
            roleTier = 1;
            roleTierLabel = 'Tier 1 - High Priority';
            rolePriority = 'high';
          }
          // TIER 2 - MEDIUM PRIORITY (Department Level / Execution)
          else if (
            roleStr.includes('hod') ||
            roleStr.includes('head of department') ||
            roleStr.includes('coordinator') ||
            roleStr.includes('in-charge') ||
            roleStr.includes('cse') ||
            roleStr.includes('it') ||
            roleStr.includes('mba') ||
            roleStr.includes('ece') ||
            roleStr.includes('mechanical') ||
            roleStr.includes('registrar') ||
            roleStr.includes('incubation') ||
            roleStr.includes('edc') ||
            roleStr.includes('e-cell')
          ) {
            roleTier = 2;
            roleTierLabel = 'Tier 2 - Medium';
            rolePriority = 'medium';
          }

          // Telecom Normalization (standard Indian formats)
          let cleanPhone = ct.phone || col.phone || '';
          if (cleanPhone && cleanPhone.toLowerCase() !== 'nan') {
            cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
            if (cleanPhone.length === 10) {
              cleanPhone = `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
            }
          } else {
            cleanPhone = '';
          }

          standardized.push({
            id: `geo-${col.id}-${ctIdx}-${idx}`,
            rowNumber: standardized.length + 1,
            college_name: col.college_name,
            email: validEmail,
            raw_email: validEmail,
            website_url: col.website_url || '',
            city_district: col.district || col.city || '',
            district: col.district || '',
            state: col.state_or_region || statesArr[0],
            country: col.country_name || (selectedCountry === 'IN' ? 'India' : selectedCountry),
            contact_person: person || designation,
            designation: designation,
            department: ct.department || (roleTier === 1 ? 'Institutional Leadership' : 'Department Coordinator'),
            phone: cleanPhone,
            category: col.category || 'Higher Education',
            principal_emails: allMails,
            all_available_emails: allMails,
            primary_emails: allMails,
            role_tier: roleTier,
            role_tier_label: roleTierLabel,
            role_priority: rolePriority,
            dns_mx_verified: Boolean(ct.dns_mx_verified ?? true),
          });
        });
      });

      setFileName(`${selectedCountry === 'IN' ? 'India' : selectedCountry} [${statesArr.join(', ')}] (${standardized.length} contacts)`);
      const distSet = new Set(standardized.map((r) => r.district).filter(Boolean));
      if (distSet.size > 0) setAvailableDistricts(Array.from(distSet).sort());

      await processRecipientsAnalysis(standardized);
    } catch (err) {
      console.error('Error loading geo colleges:', err);
      alert('Error fetching colleges: ' + (err.message || 'Network error'));
    } finally {
      setLoadingCollegesFromGeo(false);
    }
  };

  // Auto-load colleges automatically whenever selectedStates changes
  useEffect(() => {
    const statesArr = Array.from(selectedStates);
    if (statesArr.length > 0) {
      handleLoadGeoColleges(statesArr);
    } else {
      setRecipients([]);
      setFileName('');
      setGeoNotice('Please select at least one state or union territory to load colleges.');
    }
  }, [selectedStates]);

  // 1-Click Sync Handlers
  const handleSelectTier1Leads = () => {
    const tier1Ids = new Set(
      filteredRecipients.filter((r) => r.role_tier === 1 && r.status === 'eligible').map((r) => r.id)
    );
    setSelectedIds(tier1Ids);
  };

  const handleSelectFilteredLeads = () => {
    const eligibleIds = new Set(
      filteredRecipients.filter((r) => r.status === 'eligible').map((r) => r.id)
    );
    setSelectedIds(eligibleIds);
  };

  const handleTriggerRescan = async () => {
    const activeState = Array.from(selectedStates)[0] || 'Andhra Pradesh';
    setIsRescanning(true);
    try {
      const res = await fetch('/api/outreach/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_REFRESH', scope: 'STATE', state: activeState }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Re-scan crawler triggered for ${activeState} (Job ID: ${data.job_id || 'active'}). Metrics will refresh in background.`);
      } else {
        alert(data.error || 'Refresh already running or could not be initiated.');
      }
    } catch {
      alert('Failed to trigger re-scan.');
    } finally {
      setIsRescanning(false);
    }
  };

  // Attachment upload and management handlers
  const handleAttachmentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentError('');

    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setAttachmentError(`Unsupported file format (${ext}). Supported: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, PNG, JPG, WebP.`);
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError(`File size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      e.target.value = '';
      return;
    }

    if (campaignAttachments.length >= 5) {
      setAttachmentError('Maximum of 5 attachments allowed per campaign.');
      e.target.value = '';
      return;
    }

    const currentTotal = campaignAttachments.reduce((acc, a) => acc + (a.size || 0), 0);
    if (currentTotal + file.size > 20 * 1024 * 1024) {
      setAttachmentError('Combined attachment size exceeds 20 MB limit.');
      e.target.value = '';
      return;
    }

    try {
      setUploadingAttachment(true);
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/outreach/upload-attachment', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();
      const uploadedItem = data.attachment || data.file;

      if (res.ok && data.success && uploadedItem) {
        setCampaignAttachments((prev) => [...prev, uploadedItem]);
        const isImg = uploadedItem.isImage || uploadedItem.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(uploadedItem.filename || '');
        if (isImg) {
          const imgUrl = uploadedItem.url || uploadedItem.publicUrl;
          if (imgUrl) {
            setBodyTemplate((prev) => `${prev}\n\n![${uploadedItem.filename || 'Institutional Flyer'}](${imgUrl})\n\n`);
          }
        }
      } else {
        setAttachmentError(data.error || 'Failed to upload attachment.');
      }
    } catch {
      setAttachmentError('Network error uploading attachment.');
    } finally {
      setUploadingAttachment(false);
      e.target.value = '';
    }
  };

  // Upload image/poster and insert into email body content
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentError('');

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError(`Image size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      e.target.value = '';
      return;
    }

    if (campaignAttachments.length >= 5) {
      setAttachmentError('Maximum of 5 attachments allowed per campaign.');
      e.target.value = '';
      return;
    }

    try {
      setUploadingImage(true);
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/outreach/upload-attachment', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();
      const uploadedItem = data.attachment || data.file;

      if (res.ok && data.success && uploadedItem) {
        setCampaignAttachments((prev) => [...prev, uploadedItem]);
        const imgUrl = uploadedItem.url || uploadedItem.publicUrl;
        if (imgUrl) {
          setBodyTemplate((prev) => `${prev}\n\n![${uploadedItem.filename || 'Institutional Advertisement'}](${imgUrl})\n\n`);
        }
      } else {
        setAttachmentError(data.error || 'Failed to upload image.');
      }
    } catch {
      setAttachmentError('Network error uploading image.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (idxToRemove) => {
    setCampaignAttachments((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const handleInsertImage = (imgSnippet, attachment) => {
    if (typeof imgSnippet === 'string' && imgSnippet.trim()) {
      setBodyTemplate((prev) => `${prev}\n\n${imgSnippet}\n\n`);
    }
    if (attachment) {
      setCampaignAttachments((prev) => {
        if (prev.some((a) => a.filename === attachment.filename || a.savedName === attachment.savedName)) return prev;
        return [...prev, attachment];
      });
    }
    setIsImageModalOpen(false);
  };

  const insertFormatTag = (openTag, closeTag, defaultText = 'sample text') => {
    setBodyTemplate((prev) => `${prev} ${openTag}${defaultText}${closeTag} `);
  };

  const insertHyperlinkPrompt = () => {
    const url = prompt('Enter link destination URL:', 'https://example.com/programs');
    if (!url) return;
    const text = prompt('Enter clickable link text:', 'Explore Campus Programs');
    if (!text) return;
    setBodyTemplate((prev) => `${prev} [${text.trim()}](${url.trim()}) `);
  };

  // Dispatch & Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [dispatchTargets, setDispatchTargets] = useState([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState(null);
  const [campaignSummary, setCampaignSummary] = useState(null);

  // 1-Click Load Andhra Pradesh Master Dataset
  const handleLoadAPMasterDataset = async () => {
    setLoadingDataset(true);
    setCampaignSummary(null);
    setCurrentPage(1);
    setSearchQuery('');
    setFilterDistrict('all');

    try {
      const res = await fetch('/api/outreach/dataset');
      let data = null;
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback to public JSON
        const fbRes = await fetch('/Andhra_Pradesh_Dataset/ap_master_dataset_cache.json');
        if (fbRes.ok) data = await fbRes.json();
      }

      if (!data || !data.sheets) {
        throw new Error('Dataset format unavailable');
      }

      setLoadedDatasetData(data);
      const sheetNames = Object.keys(data.sheets);
      setAvailableSheets(sheetNames);

      const defaultSheet = sheetNames.includes('All Colleges AP Master') ? 'All Colleges AP Master' : sheetNames[0];
      setActiveSheetName(defaultSheet);
      setFileName(`Andhra_Pradesh_Master_College_Directory_2026.xlsx [${defaultSheet}]`);

      if (data.districts && data.districts.length > 0) {
        setAvailableDistricts(data.districts);
      }

      await parseAndApplySheetRows(data.sheets[defaultSheet]);
    } catch (err) {
      console.error('AP dataset load error:', err);
      alert('Unable to auto-load the dataset. Please drag and drop the Excel file directly.');
    } finally {
      setLoadingDataset(false);
    }
  };

  // Switch between sheets in the loaded workbook
  const handleSheetSwitch = async (sheetName) => {
    if (!loadedDatasetData || !loadedDatasetData.sheets[sheetName]) return;
    setActiveSheetName(sheetName);
    setFileName(`Andhra_Pradesh_Master_College_Directory_2026.xlsx [${sheetName}]`);
    setCurrentPage(1);
    await parseAndApplySheetRows(loadedDatasetData.sheets[sheetName]);
  };

  const parseAndApplySheetRows = async (rawRows) => {
    setAnalyzing(true);
    const standardized = rawRows.map((row, idx) => {
      const collegeName = row['College name'] || row['College Name'] || row['college_name'] || '';
      const email = cleanString(row['Official email address'] || row['Email'] || row['email'] || '');
      const website = cleanString(row['Official website URL'] || row['Website'] || row['website'] || '');
      const district = cleanString(row['District'] || row['district'] || '');
      const stateAndCity = cleanString(row['State and city'] || row['city'] || '');
      const contactPerson = cleanString(row['Contact Person / Title'] || row['Department or contact person, if available'] || row['contact_person'] || '');
      const desig = cleanString(row['Contact Designation / Role'] || row['designation'] || '');
      const dept = cleanString(row['Department Name'] || row['Department / Academic Division'] || row['department'] || '');
      const phone = cleanString(row['Contact Phone / Mobile'] || row['Phone / Mobile'] || row['phone'] || '');
      const category = cleanString(row['College Type'] || row['Academic Streams Offered'] || '');
      const allMails = extractAllEmails(email);

      return {
        id: `ap-${idx}-${Date.now()}`,
        rowNumber: idx + 1,
        college_name: collegeName,
        email: email,
        raw_email: email,
        website_url: website,
        city_district: district || stateAndCity,
        district: district,
        state: 'Andhra Pradesh',
        contact_person: contactPerson,
        designation: desig || 'Official Representative',
        department: dept,
        phone: phone,
        category: category,
        principal_emails: allMails,
        all_available_emails: allMails,
        primary_emails: allMails,
      };
    });

    const distSet = new Set(standardized.map((r) => r.district).filter(Boolean));
    if (distSet.size > 0) setAvailableDistricts(Array.from(distSet).sort());

    await processRecipientsAnalysis(standardized);
  };

  // Analyze rows for duplicate detection & database cooldown
  const processRecipientsAnalysis = async (rawItems) => {
    const seenEmails = new Set();
    const validEmailsToQuery = [];

    const initial = rawItems.map((row) => {
      let activeTargetInfo = computeRecipientTarget(row, targetRole);
      let activeEmail = (activeTargetInfo.email || '').toLowerCase().trim();

      if (activeEmail && EMAIL_REGEX.test(activeEmail) && seenEmails.has(activeEmail)) {
        const unusedAlt = (activeTargetInfo.alternative_emails || []).find(
          (alt) => EMAIL_REGEX.test(alt) && !seenEmails.has(alt.toLowerCase().trim())
        );
        if (unusedAlt) {
          activeEmail = unusedAlt.toLowerCase().trim();
          activeTargetInfo = {
            ...activeTargetInfo,
            email: activeEmail,
            role_tag: `${activeTargetInfo.role_tag} (Alt)`,
            is_fallback: true,
          };
        }
      }

      let status = 'eligible';
      let statusReason = '';

      if (!activeEmail) {
        status = 'invalid';
        statusReason = 'No email on record (Website & Phone verified)';
      } else if (!EMAIL_REGEX.test(activeEmail)) {
        status = 'invalid';
        statusReason = 'Invalid email format';
      } else if (!row.college_name) {
        status = 'invalid';
        statusReason = 'College name is required';
      } else if (seenEmails.has(activeEmail)) {
        status = 'duplicate';
        statusReason = 'Shared inbox already targeted in this session';
      } else {
        seenEmails.add(activeEmail);
        validEmailsToQuery.push(activeEmail);
      }

      return {
        ...row,
        email: activeTargetInfo.email,
        role_tag: activeTargetInfo.role_tag,
        role_type: activeTargetInfo.role_type,
        is_fallback: activeTargetInfo.is_fallback,
        alternative_emails: activeTargetInfo.alternative_emails,
        normalized_email: activeEmail,
        status,
        statusReason,
        dispatchStatus: 'idle',
        errorMessage: null,
      };
    });

    let cooldownMap = {};
    if (validEmailsToQuery.length > 0) {
      try {
        const res = await fetch('/api/outreach/check-batch-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: validEmailsToQuery.slice(0, 10000) }),
        });
        if (res.ok) {
          const data = await res.json();
          cooldownMap = data.results || {};
        }
      } catch {}
    }
    setCachedCooldownMap(cooldownMap);

    const final = initial.map((row) => {
      if (row.status === 'eligible' && cooldownMap[row.normalized_email]?.isDuplicate) {
        const info = cooldownMap[row.normalized_email];
        return {
          ...row,
          status: 'cooldown',
          statusReason: `Contacted ${info.daysAgo === 0 ? 'today' : `${info.daysAgo}d ago`} (${info.lastRecord?.status})`,
        };
      }
      return row;
    });

    setRecipients(final);
    const eligibleIds = new Set(final.filter((r) => r.status === 'eligible').map((r) => r.id));
    setSelectedIds(eligibleIds);
    setActivePreviewIndex(0);
    setCurrentPage(1);
    setAnalyzing(false);
  };

  // Upload custom file handler
  const handleFileUpload = (file) => {
    if (!file) return;
    setFileName(file.name);
    setAnalyzing(true);
    setCampaignSummary(null);
    setCurrentPage(1);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target.result;
      const parsed = parseSpreadsheetBuffer(buffer, file.name);

      if (!parsed.rows || parsed.rows.length === 0) {
        alert('The uploaded spreadsheet/CSV file is empty or missing valid data rows.');
        setAnalyzing(false);
        return;
      }

      setAvailableSheets(parsed.sheets || []);
      setActiveSheetName(parsed.defaultSheet || '');
      await processRecipientsAnalysis(parsed.rows);
    };
    reader.readAsArrayBuffer(file);
  };

  // Dynamic role change
  const handleRoleChange = (newRole) => {
    setTargetRole(newRole);
    if (!recipients || recipients.length === 0) return;
    processRecipientsAnalysis(recipients);
  };

  // Fetch Templates
  useEffect(() => {
    async function loadFreshTemplates() {
      try {
        const res = await fetch('/api/outreach/templates');
        if (res.ok) {
          const data = await res.json();
          if (data.templates && data.templates.length > 0) setAvailableTemplates(data.templates);
        }
      } catch {}
    }
    loadFreshTemplates();
  }, []);

  useEffect(() => {
    if (availableTemplates.length > 0) {
      const active = availableTemplates.find((t) => t.id === selectedTemplateId) || availableTemplates[0];
      if (active) {
        setSubjectTemplate(active.subject_template || active.subjectTemplate || '');
        setBodyTemplate(htmlToJinjaText(active.body_template || active.bodyTemplate || ''));
        setCampaignAttachments(Array.isArray(active.attachments) ? active.attachments : []);
      }
    }
  }, [availableTemplates, selectedTemplateId]);

  // APPLIED FILTERS LOGIC
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // 1. Status Filter
      if (filterType === 'eligible' && r.status !== 'eligible') return false;
      if (filterType === 'cooldown' && r.status !== 'cooldown') return false;
      if (filterType === 'duplicate' && r.status !== 'duplicate') return false;
      if (filterType === 'invalid' && r.status !== 'invalid') return false;

      // 2. District Filter
      if (filterDistrict !== 'all') {
        const d = (r.district || r.city_district || '').toLowerCase();
        if (!d.includes(filterDistrict.toLowerCase())) return false;
      }

      // 3. Website Filter
      if (filterWebsite === 'has_website' && !r.website_url) return false;
      if (filterWebsite === 'no_website' && r.website_url) return false;

      // 4. Role Filter
      if (filterRole !== 'all') {
        const roleInfo = `${r.role_tag || ''} ${r.designation || ''} ${r.role_type || ''}`.toLowerCase();
        if (!roleInfo.includes(filterRole.toLowerCase())) return false;
      }

      // 4b. 3-Tier Hierarchy Filter
      if (filterTier !== 'all') {
        if (filterTier === 'tier1' && r.role_tier !== 1) return false;
        if (filterTier === 'tier2' && r.role_tier !== 2) return false;
        if (filterTier === 'tier3' && r.role_tier !== 3) return false;
      }

      // 5. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (r.college_name && r.college_name.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.city_district && r.city_district.toLowerCase().includes(q)) ||
          (r.contact_person && r.contact_person.toLowerCase().includes(q)) ||
          (r.department && r.department.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [recipients, filterType, filterDistrict, filterWebsite, filterRole, filterTier, searchQuery]);

  // Auto Separate Batches based on eligible filtered recipients
  const eligibleFiltered = useMemo(() => {
    return filteredRecipients.filter((r) => r.status === 'eligible');
  }, [filteredRecipients]);

  const batches = useMemo(() => {
    if (eligibleFiltered.length === 0) return [];
    const chunks = [];
    const total = eligibleFiltered.length;
    let bIdx = 0;

    for (let i = 0; i < total; i += batchSize) {
      const slice = eligibleFiltered.slice(i, i + batchSize);
      const start = i + 1;
      const end = Math.min(i + batchSize, total);

      let status = 'ready';
      const allSent = slice.every((item) => item.dispatchStatus === 'success');
      const hasSending = slice.some((item) => item.dispatchStatus === 'sending');
      const hasFailed = slice.some((item) => item.dispatchStatus === 'failed');

      if (hasSending) status = 'sending';
      else if (allSent) status = 'completed';
      else if (hasFailed) status = 'failed';

      chunks.push({
        index: bIdx,
        id: `batch-${bIdx}`,
        name: `Batch ${bIdx + 1}`,
        range: `#${start} - #${end}`,
        items: slice,
        count: slice.length,
        status: batchStatusMap[bIdx] || status,
      });
      bIdx++;
    }
    return chunks;
  }, [eligibleFiltered, batchSize, batchStatusMap]);

  const activeBatch = batches[activeBatchIndex] || batches[0] || null;

  // Pagination for table
  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRecipients.length);
  const paginatedRecipients = filteredRecipients.slice(startIndex, endIndex);

  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredRecipients.map((r) => r.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSelectEligibleOnly = () => {
    setSelectedIds(new Set(filteredRecipients.filter((r) => r.status === 'eligible').map((r) => r.id)));
  };

  // Personalization merge
  const activeRecipient = recipients[activePreviewIndex] || filteredRecipients[0] || recipients[0] || null;

  const mergePlaceholders = (text, item) => {
    if (!text || !item) return text || '';
    const vars = {
      college_name: item.college_name || '',
      department: item.department || '',
      contact_person: item.contact_person || '',
      designation: item.designation || item.role_tag || '',
      email: item.email || '',
      city_district: item.city_district || '',
      category: item.category || '',
      website_url: item.website_url || '',
      phone: item.phone || '',
      state: item.state || Array.from(selectedStates)[0] || 'Andhra Pradesh',
      country: item.country || (selectedCountry === 'IN' ? 'India' : selectedCountry),
      contact_salutation: item.contact_salutation || (item.contact_person ? `Dear ${item.contact_person}` : 'Dear Sir/Madam'),
      remarks: item.remarks || '',
      sender_name: 'Campus Outreach Coordinator',
    };
    return renderTemplate(text, vars);
  };

  const insertVariable = (varName) => {
    setBodyTemplate((prev) => prev + ' ' + varName + ' ');
  };

  // DISPATCH EXECUTION
  const triggerSendActiveBatch = () => {
    if (!activeBatch || activeBatch.items.length === 0) {
      alert('Selected batch has no eligible recipients.');
      return;
    }
    setDispatchTargets(activeBatch.items);
    setConfirmModalOpen(true);
  };

  const triggerSendSelected = () => {
    const targets = recipients.filter((r) => selectedIds.has(r.id));
    if (targets.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }
    setDispatchTargets(targets);
    setConfirmModalOpen(true);
  };

  // Auto-play all batches with polite unstress delays
  const handleStartAutoPlay = async () => {
    if (batches.length === 0) {
      alert('No batches available to send.');
      return;
    }
    setIsAutoPlaying(true);
    pauseAutoPlayRef.current = false;

    for (let b = 0; b < batches.length; b++) {
      if (pauseAutoPlayRef.current) {
        setIsAutoPlaying(false);
        break;
      }

      setActiveBatchIndex(b);
      const currentChunk = batches[b];

      // Dispatch this batch
      await dispatchBatchItems(currentChunk.items, b);

      setBatchStatusMap((prev) => ({ ...prev, [b]: 'completed' }));

      // Cooling delay between batches if more remain
      if (b < batches.length - 1 && !pauseAutoPlayRef.current) {
        for (let cd = batchDelay; cd > 0; cd--) {
          if (pauseAutoPlayRef.current) break;
          setBatchCountdown(cd);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setBatchCountdown(null);
      }
    }

    setIsAutoPlaying(false);
    setBatchCountdown(null);
  };

  const handlePauseAutoPlay = () => {
    pauseAutoPlayRef.current = true;
    setIsAutoPlaying(false);
    setBatchCountdown(null);
  };

  // Core send loop
  const dispatchBatchItems = async (targets, batchIdx = null) => {
    setIsDispatching(true);
    const total = targets.length;
    let sentCount = 0;
    let failedCount = 0;

    setCampaignProgress({ total, current: 0, sent: 0, failed: 0, skipped: 0 });

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];

      setRecipients((prev) =>
        prev.map((r) => (r.id === target.id ? { ...r, dispatchStatus: 'sending' } : r))
      );

      const personalizedSubject = mergePlaceholders(subjectTemplate, target);
      const personalizedBody = mergePlaceholders(bodyTemplate, target);
      const bodyHtml = formatBodyToHtml(personalizedBody);

      try {
        const res = await fetch('/api/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            college_name: target.college_name,
            email: target.email,
            department: target.department || 'Outreach & Partnerships',
            contact_person: target.contact_person || 'Sir/Madam',
            designation: target.designation || 'Faculty',
            subject: personalizedSubject,
            body_html: bodyHtml,
            country: target.country || (selectedCountry === 'IN' ? 'India' : selectedCountry),
            state: target.state || Array.from(selectedStates)[0] || 'Andhra Pradesh',
            attachments: campaignAttachments,
            override_duplicate: target.status === 'cooldown',
          }),
        });

        if (res.ok) {
          sentCount++;
          setRecipients((prev) =>
            prev.map((r) => (r.id === target.id ? { ...r, dispatchStatus: 'success' } : r))
          );
        } else {
          failedCount++;
          const errData = await res.json().catch(() => ({}));
          setRecipients((prev) =>
            prev.map((r) =>
              r.id === target.id
                ? { ...r, dispatchStatus: 'failed', errorMessage: errData.error || 'Dispatch error' }
                : r
            )
          );
        }
      } catch (networkErr) {
        failedCount++;
        setRecipients((prev) =>
          prev.map((r) =>
            r.id === target.id ? { ...r, dispatchStatus: 'failed', errorMessage: 'Network error' } : r
          )
        );
      }

      setCampaignProgress({
        total,
        current: i + 1,
        sent: sentCount,
        failed: failedCount,
        skipped: 0,
      });

      // Polite socket rate-limit delay (300ms)
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setIsDispatching(false);
    setCampaignSummary({
      total,
      sent: sentCount,
      failed: failedCount,
      timestamp: new Date().toLocaleTimeString(),
    });

    if (onCampaignFinished) onCampaignFinished();
  };

  const handleExecuteModalDispatch = async () => {
    setConfirmModalOpen(false);
    await dispatchBatchItems(dispatchTargets);
  };

  return (
    <div className={styles.container}>
      {/* 1. Step 1: Choose Email Template (Top Priority) */}
      <div className={styles.templateSelectionCard}>
        <div className={styles.templateCardHeader}>
          <div>
            <div className={styles.templateCardTitle}>
              <span>✉️ Step 1: Choose Email Template</span>
            </div>
            <div className={styles.templateCardSub}>
              Select an email template for this campaign. Subject, message body, and attachments will automatically populate.
            </div>
          </div>
          <span className={styles.activeTemplateBadge}>
            Active: {availableTemplates.find((t) => t.id === selectedTemplateId)?.title || 'Selected Template'}
          </span>
        </div>

        <div className={styles.templateSelectorRow}>
          <div className={styles.templateDropdownGroup}>
            <label className={styles.templateSelectLabel}>Select Saved Template:</label>
            <select
              className={styles.templateSelectInput}
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {Array.isArray(t.attachments) && t.attachments.length > 0 ? `(📎 ${t.attachments.length} attachments)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.quickTemplatePills}>
            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, marginRight: '4px' }}>Quick Switch:</span>
            {availableTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.templatePillBtn} ${selectedTemplateId === t.id ? styles.templatePillActive : ''}`}
                onClick={() => handleTemplateChange(t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.templatePreviewStrip}>
          <div className={styles.previewStripRow}>
            <span className={styles.previewStripLabel}>Subject Preview:</span>
            <span className={styles.previewStripSubject}>{subjectTemplate || 'No subject set'}</span>
          </div>
          <div className={styles.previewStripRow}>
            <span className={styles.previewStripLabel}>Body Excerpt:</span>
            <span className={styles.previewStripBody}>
              {htmlToJinjaText(bodyTemplate).slice(0, 140)}...
            </span>
            <button
              type="button"
              className={styles.jumpToCustomizeBtn}
              onClick={() => {
                setIsCustomizationExpanded(true);
                const el = document.getElementById('campaign-customization-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              ✏️ Customize Subject, Body &amp; Images &darr;
            </button>
          </div>
        </div>
      </div>

      {/* 2. Step 2: Geographic Country & Region Targeting Card */}
      <div className={styles.geoCard}>
        <div className={styles.geoHeader}>
          <div>
            <div className={styles.uploadTitle}>🌐 Pan-India Regulatory Directory Targeting</div>
            <div className={styles.uploadSub}>
              Select one or more states below to internally load colleges and verified contacts directly from the regulatory database (AISHE, UGC, AICTE). No manual file import needed.
            </div>
          </div>
          {countriesList.length > 0 && (
            <div style={{ fontSize: '12px', color: '#0f766e', background: '#f0fdfa', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>
              {countriesList.length} Countries Configured
            </div>
          )}
        </div>

        <div className={styles.geoGrid}>
          {/* Country Column */}
          <div>
            <label className={styles.label} style={{ marginBottom: '8px', display: 'block' }}>
              1. Select Country
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0f172a',
                marginBottom: '10px',
                background: '#ffffff',
                cursor: 'pointer'
              }}
            >
              {countriesList.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} {c.college_count > 0 ? `(${c.college_count} colleges)` : ''}
                </option>
              ))}
            </select>
            <div className={styles.countryList}>
              {countriesList.map((c) => (
                <div
                  key={c.code}
                  className={`${styles.countryItem} ${selectedCountry === c.code ? styles.countryItemActive : ''}`}
                  onClick={() => setSelectedCountry(c.code)}
                >
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>
                    {c.college_count > 0 ? `${c.college_count} colleges` : c.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* States / Regions Column */}
          <div className={styles.stateSelectorArea}>
            <div className={styles.stateToolbar}>
              <div>
                <label className={styles.label} style={{ display: 'inline', marginRight: '8px' }}>
                  2. Select States / Union Territories:
                </label>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e' }}>
                  ({selectedStates.size} selected)
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter states / UTs..."
                  className={styles.stateSearchInput}
                  value={stateSearch}
                  onChange={(e) => setStateSearch(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.btnActionSm}
                  onClick={handleSelectAllStates}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className={styles.btnActionSm}
                  onClick={handleClearAllStates}
                >
                  Clear All
                </button>
              </div>
            </div>

            {(() => {
              const matchingRegions = regionsList.filter((r) => !stateSearch || r.name.toLowerCase().includes(stateSearch.toLowerCase()));
              const totalMatchingColleges = matchingRegions.reduce((sum, r) => sum + (parseInt(r.college_count, 10) || 0), 0);
              return (
                <>
                  {stateSearch.trim() && (
                    <div style={{
                      margin: '10px 0 14px 0',
                      padding: '10px 14px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ fontSize: '13px', color: '#166534' }}>
                        🔍 Matching states for <strong>"{stateSearch}"</strong>: <span style={{ fontWeight: 700 }}>{matchingRegions.length}</span> region(s) • <span style={{ fontWeight: 700 }}>{totalMatchingColleges.toLocaleString()}</span> colleges found in registry
                      </div>
                      {matchingRegions.length > 0 && (
                        <button
                          type="button"
                          style={{
                            background: '#15803d',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setSelectedStates(new Set(matchingRegions.map((r) => r.name)));
                          }}
                        >
                          Select All Matching ({matchingRegions.length})
                        </button>
                      )}
                    </div>
                  )}

                  {loadingGeoData ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Loading regional administrative units...
                    </div>
                  ) : regionsList.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No administrative regions configured for this country yet.
                    </div>
                  ) : (
                    <div className={styles.stateChipsGrid}>
                      {matchingRegions.map((r) => {
                        const isSelected = selectedStates.has(r.name);
                        return (
                          <label
                            key={r.id || r.name}
                            className={`${styles.stateChipLabel} ${isSelected ? styles.stateChipLabelActive : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStateSelection(r.name)}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.name}
                            </span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {r.contact_count > 0 && (
                                <span style={{ fontSize: '10px', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '10px', fontWeight: 600 }} title="Verified Deliverable Emails">
                                  ✉️ {r.contact_count}
                                </span>
                              )}
                              {r.college_count > 0 && (
                                <span style={{ fontSize: '10px', opacity: 0.8, background: '#e2e8f0', padding: '1px 5px', borderRadius: '10px' }} title="Colleges in Master Registry">
                                  {r.college_count}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

            <div className={styles.geoActionsBar}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {selectedCountry === 'IN'
                  ? 'All 28 States & 8 Union Territories available for pan-India outreach.'
                  : `Targeting selected regions in ${countriesList.find(c => c.code === selectedCountry)?.name || selectedCountry}.`}
              </div>

              <button
                type="button"
                className={styles.btnLoadGeo}
                onClick={handleLoadGeoColleges}
                disabled={loadingCollegesFromGeo || selectedStates.size === 0}
              >
                {loadingCollegesFromGeo ? (
                  <>
                    <RefreshCwIcon size={14} className={styles.spinIcon} />
                    <span>Loading Regional Colleges...</span>
                  </>
                ) : (
                  <>
                    <BuildingIcon size={14} />
                    <span>Load Colleges for Selected States ({selectedStates.size})</span>
                  </>
                )}
              </button>
            </div>

            {geoNotice && (
              <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', color: '#b45309', fontSize: '12px', fontWeight: 550 }}>
                ℹ️ {geoNotice}
              </div>
            )}

            {/* Live Automated Monthly Monitoring Banner */}
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '12px',
              color: '#334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                <span><strong>Periodic Monthly Audit:</strong> Active • Next scheduled live check on 1st of month (3:00 AM IST)</span>
              </div>
              <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 600, background: '#ccfbf1', padding: '2px 8px', borderRadius: '12px' }}>
                🛡️ 709 Audit Deltas Logged • Live Data, No Static Fallbacks
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Active Database-Loaded Dataset Banner (Direct Database Ingestion Only - No Excel/CSV file upload) */}
      {fileName ? (
        <div className={styles.fileChosenBanner} style={{ margin: '14px 0', padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🏛️</span>
            <div>
              <div style={{ fontWeight: 600, color: '#166534', fontSize: '14px' }}>
                Database Target: {fileName}
              </div>
              <div style={{ fontSize: '12px', color: '#15803d' }}>
                {recipients.length.toLocaleString()} verified contacts internally loaded from regulatory database (PostgreSQL)
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.btnActionSm}
            onClick={() => {
              setFileName('');
              setRecipients([]);
              setSelectedIds(new Set());
              setCachedCooldownMap({});
              setCampaignSummary(null);
            }}
          >
            Clear Selection
          </button>
        </div>
      ) : (
        <div style={{ margin: '12px 0 18px 0', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>ℹ️</span>
          <span>
            <strong>Internal Database Loading Active:</strong> Manual Excel/CSV file imports are disabled. Institutional records are internally and securely fetched directly from the regulatory database (AISHE, UGC, AICTE) whenever you select or check state checkboxes above.
          </span>
        </div>
      )}

      {/* Applied Filters Panel */}
      {recipients.length > 0 && (
        <div className={styles.filtersPanel}>
          <div className={styles.filtersHeader}>
            <div className={styles.filtersTitle}>
              <span>🔍 Smart Campaign Filters</span>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                ({filteredRecipients.length.toLocaleString()} matching contacts)
              </span>
            </div>

            {(filterDistrict !== 'all' || filterRole !== 'all' || filterTier !== 'all' || filterWebsite !== 'all' || searchQuery || filterType !== 'all') && (
              <button
                type="button"
                className={styles.clearFiltersBtn}
                onClick={() => {
                  setFilterDistrict('all');
                  setFilterRole('all');
                  setFilterTier('all');
                  setFilterWebsite('all');
                  setSearchQuery('');
                  setFilterType('all');
                  setCurrentPage(1);
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className={styles.filtersGrid}>
            {/* 3-Tier Hierarchy Filter */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Role Priority (3-Tier)</label>
              <select
                className={styles.filterSelect}
                value={filterTier}
                onChange={(e) => {
                  setFilterTier(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Tiers (Pan-India)</option>
                <option value="tier1">👑 Tier 1 - High Priority (TPO, Dean, Principal)</option>
                <option value="tier2">⚙️ Tier 2 - Medium (HODs, Coordinators)</option>
                <option value="tier3">📋 Tier 3 - Fallback (General Office)</option>
              </select>
            </div>

            {/* District Filter */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>District</label>
              <select
                className={styles.filterSelect}
                value={filterDistrict}
                onChange={(e) => {
                  setFilterDistrict(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Districts (State-Wide)</option>
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Target Stakeholder Role</label>
              <select
                className={styles.filterSelect}
                value={filterRole}
                onChange={(e) => {
                  setFilterRole(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Roles</option>
                <option value="principal">Principals &amp; Directors</option>
                <option value="hod">Heads of Department (HOD)</option>
                <option value="dean">Deans &amp; Leadership</option>
                <option value="placement">Placement Officers / TPO</option>
                <option value="faculty">Faculty &amp; Staff</option>
              </select>
            </div>

            {/* Website Status Filter */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Website Availability</label>
              <select
                className={styles.filterSelect}
                value={filterWebsite}
                onChange={(e) => {
                  setFilterWebsite(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Institutions</option>
                <option value="has_website">With Official Website Only</option>
                <option value="no_website">Without Website (Phone/Email Ready)</option>
              </select>
            </div>

            {/* Live Search */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Search Colleges / Contacts</label>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="Type name, city, email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Auto Separate Batch Engine */}
      {eligibleFiltered.length > 0 && (
        <div className={styles.batchEngineCard}>
          <div className={styles.batchHeader}>
            <div className={styles.batchTitleWrapper}>
              <div className={styles.batchTitle}>
                <span>⚡ Auto-Separated Safe Batches</span>
                <span className={styles.unstressShieldBadge}>
                  {batches.length} Batches &bull; {eligibleFiltered.length.toLocaleString()} Eligible Recipients
                </span>
              </div>
              <div className={styles.batchSub}>
                Automatically partitions large volumes into anti-spam batches to protect SMTP socket limits and sender reputation.
              </div>
            </div>

            <div className={styles.batchSizeControls}>
              <span>Batch Size:</span>
              <select
                className={styles.batchSizeSelect}
                value={batchSize}
                onChange={(e) => {
                  setBatchSize(Number(e.target.value));
                  setActiveBatchIndex(0);
                }}
              >
                <option value={25}>25 per batch (Ultra Calm)</option>
                <option value={50}>50 per batch (Recommended)</option>
                <option value={100}>100 per batch (Standard)</option>
                <option value={200}>200 per batch (High Vol)</option>
              </select>

              <span style={{ marginLeft: '10px' }}>Cooling Delay:</span>
              <select
                className={styles.batchSizeSelect}
                value={batchDelay}
                onChange={(e) => setBatchDelay(Number(e.target.value))}
              >
                <option value={5}>5s</option>
                <option value={10}>10s (Safe)</option>
                <option value={15}>15s (Polite)</option>
                <option value={30}>30s (Ultra Safe)</option>
              </select>
            </div>
          </div>

          {/* Cooling Countdown Alert */}
          {batchCountdown !== null && (
            <div className={styles.coolingAlert}>
              <span>
                🍃 <strong>Calming Cooling Delay Active:</strong> Allowing mail server socket to rest for{' '}
                <strong>{batchCountdown}s</strong> before launching next batch...
              </span>
              <button
                type="button"
                className={styles.btnActionSm}
                onClick={handlePauseAutoPlay}
              >
                Pause Auto-Play
              </button>
            </div>
          )}

          {/* Batch Selector Tabs */}
          <div className={styles.batchTabs}>
            {batches.map((b) => {
              const isCurrent = activeBatch?.index === b.index;
              const isDone = b.status === 'completed';
              const isSending = b.status === 'sending';

              return (
                <button
                  key={b.id}
                  type="button"
                  className={`${styles.batchPill} ${isCurrent ? styles.batchPillActive : ''} ${
                    isDone ? styles.batchPillCompleted : ''
                  } ${isSending ? styles.batchPillSending : ''}`}
                  onClick={() => setActiveBatchIndex(b.index)}
                >
                  <span>{b.name}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>({b.count})</span>
                  {isDone && <span>✓</span>}
                  {isSending && <span>⏳</span>}
                </button>
              );
            })}
          </div>

          {/* Active Batch Action Bar */}
          <div className={styles.batchActionsBar}>
            <div className={styles.batchCountSummary}>
              Active: <strong>{activeBatch?.name}</strong> &bull; {activeBatch?.range} ({activeBatch?.count} recipients)
              {activeBatch?.status === 'completed' && <span style={{ color: '#059669', marginLeft: '6px' }}>&bull; All Delivered</span>}
            </div>

            <div className={styles.batchButtonsGroup}>
              <button
                type="button"
                className={styles.btnBatchSend}
                onClick={triggerSendActiveBatch}
                disabled={isDispatching || isAutoPlaying || !canSend || activeBatch?.count === 0}
              >
                <SendIcon size={14} />
                <span>Send {activeBatch?.name} Only ({activeBatch?.count})</span>
              </button>

              {!isAutoPlaying ? (
                <button
                  type="button"
                  className={styles.btnBatchAutoPlay}
                  onClick={handleStartAutoPlay}
                  disabled={isDispatching || !canSend || batches.length === 0}
                >
                  <span>⚡ Auto-Play All {batches.length} Batches (Unstressed)</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.btnBatchPause}
                  onClick={handlePauseAutoPlay}
                >
                  <span>⏸️ Pause Auto-Play</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recipient Breakdown Metrics */}
      {recipients.length > 0 && (
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Total Filtered</span>
            <span className={styles.metricValue}>{filteredRecipients.length.toLocaleString()}</span>
          </div>
          <div className={`${styles.metricCard} ${styles.metricEligible}`}>
            <span className={styles.metricLabel}>Eligible to Send</span>
            <span className={styles.metricValue}>{eligibleFiltered.length.toLocaleString()}</span>
          </div>
          <div className={`${styles.metricCard} ${styles.metricCooldown}`}>
            <span className={styles.metricLabel}>In 30d Cooldown</span>
            <span className={styles.metricValue}>
              {filteredRecipients.filter((r) => r.status === 'cooldown').length.toLocaleString()}
            </span>
          </div>
          <div className={`${styles.metricCard} ${styles.metricDuplicate}`}>
            <span className={styles.metricLabel}>Shared Inboxes</span>
            <span className={styles.metricValue}>
              {filteredRecipients.filter((r) => r.status === 'duplicate').length.toLocaleString()}
            </span>
          </div>
          <div className={`${styles.metricCard} ${styles.metricInvalid}`}>
            <span className={styles.metricLabel}>No Email on File</span>
            <span className={styles.metricValue}>
              {filteredRecipients.filter((r) => r.status === 'invalid').length.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Campaign Progress Bar */}
      {campaignProgress && (
        <div className={styles.progressCard}>
          <div className={styles.progressTop}>
            <span>{isDispatching ? 'Dispatching Campaign...' : 'Campaign Completed'}</span>
            <span>
              {campaignProgress.current} / {campaignProgress.total} (
              {Math.round((campaignProgress.current / campaignProgress.total) * 100)}%)
            </span>
          </div>

          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{
                width: `${(campaignProgress.current / campaignProgress.total) * 100}%`,
              }}
            />
          </div>

          <div className={styles.progressStats}>
            <span className={styles.statItemSent}>Sent: {campaignProgress.sent}</span>
            <span className={styles.statItemFailed}>Failed: {campaignProgress.failed}</span>
            <span className={styles.statItemSkipped}>
              Remaining: {campaignProgress.total - campaignProgress.current}
            </span>
          </div>
        </div>
      )}

      {/* Summary Banner */}
      {campaignSummary && !isDispatching && !isAutoPlaying && (
        <div
          style={{
            background: campaignSummary.failed === 0 ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${campaignSummary.failed === 0 ? '#a7f3d0' : '#fde68a'}`,
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
              Dispatch Completed at {campaignSummary.timestamp}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
              Successfully delivered: <strong>{campaignSummary.sent}</strong> &bull; Failed:{' '}
              <strong>{campaignSummary.failed}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Recipient Table */}
      {filteredRecipients.length > 0 && (
        <div className={styles.recipientCard}>
          {/* 1-Click Pan-India Campaign Sync Bar */}
          <div className={styles.oneClickSyncBar}>
            <div className={styles.syncButtonGroup}>
              <button
                type="button"
                className={styles.syncBtnPrimary}
                onClick={handleSelectTier1Leads}
                title="Select all Tier 1 primary targets (TPO, Dean, Principal)"
              >
                👑 Target All Tier 1 Leads ({filteredRecipients.filter((r) => r.role_tier === 1 && r.status === 'eligible').length})
              </button>
              <button
                type="button"
                className={styles.syncBtnSecondary}
                onClick={handleSelectFilteredLeads}
                title="Select all currently filtered eligible leads"
              >
                ⚡ Select All Filtered ({eligibleFiltered.length})
              </button>
            </div>

            <button
              type="button"
              className={styles.rescanBtn}
              onClick={handleTriggerRescan}
              disabled={isRescanning}
              title="Trigger background crawler to re-scan websites and update change changelog"
            >
              {isRescanning ? <RefreshCwIcon size={13} className="spin" /> : <RefreshCwIcon size={13} />}
              <span>{isRescanning ? 'Triggering Pipeline...' : 'Run Re-Scan Crawler'}</span>
            </button>
          </div>

          <div className={styles.tableToolbar}>
            <div className={styles.selectionControls}>
              <button type="button" className={styles.btnActionSm} onClick={handleSelectAll}>
                Select All
              </button>
              <button type="button" className={styles.btnActionSm} onClick={handleDeselectAll}>
                Deselect All
              </button>
              <button type="button" className={styles.btnActionSm} onClick={handleSelectEligibleOnly}>
                Select Eligible Only ({eligibleFiltered.length})
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                {selectedIds.size} selected
              </span>
            </div>

            <div className={styles.filterChips}>
              <button
                type="button"
                className={`${styles.chipBtn} ${filterType === 'all' ? styles.chipBtnActive : ''}`}
                onClick={() => {
                  setFilterType('all');
                  setCurrentPage(1);
                }}
              >
                All ({filteredRecipients.length})
              </button>
              <button
                type="button"
                className={`${styles.chipBtn} ${filterType === 'eligible' ? styles.chipBtnActive : ''}`}
                onClick={() => {
                  setFilterType('eligible');
                  setCurrentPage(1);
                }}
              >
                Eligible ({eligibleFiltered.length})
              </button>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={
                        filteredRecipients.length > 0 &&
                        filteredRecipients.every((r) => selectedIds.has(r.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) handleSelectAll();
                        else handleDeselectAll();
                      }}
                    />
                  </th>
                  <th>College Name</th>
                  <th>Target Email &amp; Role</th>
                  <th>District / Location</th>
                  <th>Contact Person / Phone</th>
                  <th>Status / Audit</th>
                  <th>Dispatch State</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecipients.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  const isPreviewed = activeRecipient?.id === r.id;

                  const getStatusBadge = () => {
                    if (r.status === 'eligible') {
                      return <span className={`${styles.statusBadge} ${styles.badgeEligible}`}>Eligible</span>;
                    }
                    if (r.status === 'cooldown') {
                      return (
                        <span className={`${styles.statusBadge} ${styles.badgeCooldown}`} title={r.statusReason}>
                          {r.statusReason}
                        </span>
                      );
                    }
                    if (r.status === 'duplicate') {
                      return (
                        <span className={`${styles.statusBadge} ${styles.badgeDuplicate}`} title={r.statusReason}>
                          Shared Inbox
                        </span>
                      );
                    }
                    if (!r.email) {
                      return (
                        <span className={`${styles.statusBadge} ${styles.badgeNoEmail}`}>
                          No Email on Record
                        </span>
                      );
                    }
                    return <span className={`${styles.statusBadge} ${styles.badgeInvalid}`}>{r.statusReason || 'Invalid Format'}</span>;
                  };

                  const getDispatchBadge = () => {
                    if (r.dispatchStatus === 'sending') {
                      return <span className={`${styles.statusBadge} ${styles.badgeSending}`}>Sending...</span>;
                    }
                    if (r.dispatchStatus === 'success') {
                      return <span className={`${styles.statusBadge} ${styles.badgeSent}`}>Sent (Delivered)</span>;
                    }
                    if (r.dispatchStatus === 'failed') {
                      return (
                        <span className={`${styles.statusBadge} ${styles.badgeFailed}`} title={r.errorMessage}>
                          Failed ({r.errorMessage || 'Error'})
                        </span>
                      );
                    }
                    return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Queued</span>;
                  };

                  return (
                    <tr
                      key={r.id}
                      className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${
                        isPreviewed ? styles.rowPreviewSelected : ''
                      }`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        const originalIndex = recipients.findIndex((orig) => orig.id === r.id);
                        if (originalIndex !== -1) setActivePreviewIndex(originalIndex);
                      }}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isSelected}
                          onChange={() => handleToggleSelect(r.id)}
                        />
                      </td>
                      <td>
                        <strong>{r.college_name || '—'}</strong>
                        {r.website_url && (
                          <div>
                            <a
                              href={r.website_url.startsWith('http') ? r.website_url : `https://${r.website_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.websiteLink}
                              onClick={(e) => e.stopPropagation()}
                            >
                              🌐 Official Website
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.emailCell}>
                          <a
                            href={`mailto:${r.email}`}
                            className={styles.emailText}
                            onClick={(e) => e.stopPropagation()}
                            title="Click to compose direct email"
                          >
                            {r.email || '—'}
                          </a>
                          <div className={styles.emailMeta} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span className={r.role_tier === 1 ? styles.tier1Pill : r.role_tier === 2 ? styles.tier2Pill : styles.tier3Pill}>
                              {r.role_tier === 1 ? '👑 Tier 1 Target' : r.role_tier === 2 ? '⚙️ Tier 2 Dept' : '📋 Tier 3 Office'}
                            </span>
                            {r.dns_mx_verified && (
                              <span className={styles.mxBadge} title="DNS MX Deliverability Verified">
                                ✔ MX
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.districtCell}>{r.district || r.city_district || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.state || 'India'}</div>
                      </td>
                      <td>
                        <div>{r.contact_person || r.department || 'Sir/Madam'}</div>
                        {r.phone && (
                          <a
                            href={`tel:${r.phone.replace(/\s+/g, '')}`}
                            className={styles.phoneSub}
                            onClick={(e) => e.stopPropagation()}
                            title="Click to dial phone"
                          >
                            📞 {r.phone}
                          </a>
                        )}
                      </td>
                      <td>{getStatusBadge()}</td>
                      <td>{getDispatchBadge()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRecipients.length > 0 && (
            <div className={styles.paginationBar}>
              <div className={styles.paginationInfo}>
                Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{' '}
                <strong>{filteredRecipients.length.toLocaleString()}</strong> contacts
              </div>

              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                >
                  &larr; Previous
                </button>
                <span className={styles.paginationPageIndicator}>
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Personalization & Preview Section - Always Available & Expandable */}
      {(() => {
        const previewTarget = activeRecipient || {
          college_name: 'PSG College of Technology',
          email: 'principal@psgtech.ac.in',
          contact_person: 'Dr. K. Ramesh',
          designation: 'Principal & Head of Institution',
          department: 'Visual Communication & Media Arts',
          state: Array.from(selectedStates)[0] || 'Andhra Pradesh',
          country: selectedCountry === 'IN' ? 'India' : selectedCountry,
          city_district: 'Coimbatore',
        };

        const activeTpl = availableTemplates.find((t) => t.id === selectedTemplateId) || availableTemplates[0];

        return (
          <div className={styles.customizationCard} id="campaign-customization-section">
            <div className={styles.customizationHeader} onClick={() => setIsCustomizationExpanded(!isCustomizationExpanded)}>
              <div>
                <div className={styles.uploadTitle}>
                  <span>✏️ Customize Email Template</span>
                  <span style={{ marginLeft: '10px', fontSize: '11px', fontWeight: 600, color: '#0d9488', background: '#f0fdfa', padding: '2px 8px', borderRadius: '12px' }}>
                    Active: {activeTpl?.title || 'Selected Template'}
                  </span>
                </div>
                <div className={styles.uploadSub}>
                  Customize the subject, body text, images, and attachments for this campaign.
                </div>
              </div>

              <button
                type="button"
                className={styles.collapseToggleBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCustomizationExpanded(!isCustomizationExpanded);
                }}
              >
                {isCustomizationExpanded ? 'Collapse ▲' : 'Expand & Customize ▼'}
              </button>
            </div>

            {isCustomizationExpanded && (
              <div className={styles.splitEditorGrid}>
                {/* Editor Pane */}
                <div className={styles.editorPane}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Select Base Template</label>
                    <select
                      className={styles.select}
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                    >
                      {availableTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} {Array.isArray(t.attachments) && t.attachments.length > 0 ? `(📎 ${t.attachments.length} files)` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '11px', color: '#0d9488', fontWeight: 550, marginTop: '2px' }}>
                      💡 Selecting a template populates the subject, body, and attachments. Changes made below apply to this campaign without altering the saved template.
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Subject Template</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={subjectTemplate}
                      onChange={(e) => setSubjectTemplate(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Email Body Content (HTML &amp; Text)</label>

                    {/* Formatting & Insert Toolbar */}
                    <div className={styles.formattingBar}>
                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={() => insertFormatTag('**', '**', 'Bold text')}
                      >
                        <strong>B</strong> Bold
                      </button>

                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={() => insertFormatTag('*', '*', 'Italic text')}
                      >
                        <em>I</em> Italic
                      </button>

                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={insertHyperlinkPrompt}
                      >
                        🔗 Insert Link
                      </button>

                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={() => insertFormatTag('\n• ', '\n• Second key point\n', 'First key point')}
                      >
                        • Bullet List
                      </button>

                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingImage || campaignAttachments.length >= 5}
                        style={{ color: '#0d9488', fontWeight: 600, borderColor: '#0d9488' }}
                        title="Add image banner or institutional flyer into the email"
                      >
                        🖼️ {uploadingImage ? 'Uploading Image...' : '+ Add Image / Flyer'}
                      </button>

                      <button
                        type="button"
                        className={styles.formatBtn}
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={uploadingAttachment || campaignAttachments.length >= 5}
                        title="Attach documents to campaign email"
                      >
                        📎 {uploadingAttachment ? 'Attaching...' : '+ Attach File'}
                      </button>
                    </div>

                    <input
                      type="file"
                      ref={imageUploadInputRef}
                      style={{ display: 'none' }}
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      onChange={handleImageUpload}
                    />

                    {/* Placeholder Helper Chips (Jinja & Clean Tags) */}
                    <div className={styles.helperChips}>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{college_name}}')}>
                        + {'{{college_name}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{contact_salutation}}')}>
                        + {'{{contact_salutation}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{contact_person}}')}>
                        + {'{{contact_person}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{department}}')}>
                        + {'{{department}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{designation}}')}>
                        + {'{{designation}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{state}}')}>
                        + {'{{state}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{country}}')}>
                        + {'{{country}}'}
                      </button>
                      <button type="button" className={styles.variableChip} onClick={() => insertVariable('{{sender_name}}')}>
                        + {'{{sender_name}}'}
                      </button>
                    </div>

                    <textarea
                      className={styles.textarea}
                      style={{ minHeight: '260px', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                      value={bodyTemplate}
                      onChange={(e) => setBodyTemplate(e.target.value)}
                      placeholder="Type or customize your campaign email body content in clean plain text or Jinja format (e.g. {{college_name}}, {{contact_salutation}}, **bold text**, • bullet points, or [Banner: Campus Outreach Initiative])..."
                      rows={12}
                    />
                  </div>

                  {/* File Attachments Section */}
                  <div style={{ marginTop: '10px' }}>
                    <label className={styles.label}>
                      Campaign File Attachments (Optional, max 5 files, 10 MB each, 20 MB total)
                    </label>

                    <input
                      type="file"
                      ref={attachmentInputRef}
                      style={{ display: 'none' }}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.png,.jpg,.jpeg,.webp,.gif"
                      onChange={handleAttachmentUpload}
                    />

                    {campaignAttachments.length > 0 && (
                      <div className={styles.attachmentList}>
                        {campaignAttachments.map((att, idx) => {
                          const isImg = att.isImage || att.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.filename || '');
                          return (
                            <div key={idx} className={styles.attachmentChip}>
                              <span>{isImg ? '🖼️' : '📄'} {att.filename}</span>
                              <span style={{ opacity: 0.7, fontSize: '11px' }}>({formatFileSize(att.size)})</span>
                              <button
                                type="button"
                                className={styles.attachmentRemoveBtn}
                                onClick={() => handleRemoveAttachment(idx)}
                                title="Remove attachment"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className={styles.attachmentUploadBox} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={styles.attachmentUploadBtn}
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingImage || campaignAttachments.length >= 5}
                        style={{ background: '#0f766e', borderColor: '#0f766e', color: '#ffffff' }}
                      >
                        {uploadingImage ? 'Uploading Image...' : '🖼️ + Attach Image / Flyer'}
                      </button>

                      <button
                        type="button"
                        className={styles.attachmentUploadBtn}
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={uploadingAttachment || campaignAttachments.length >= 5}
                      >
                        {uploadingAttachment ? 'Uploading...' : '📎 + Attach Document (PDF, DOCX, XLSX, CSV)'}
                      </button>

                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {campaignAttachments.length} / 5 files attached &bull;{' '}
                        {formatFileSize(campaignAttachments.reduce((acc, a) => acc + (a.size || 0), 0))} / 20 MB total
                      </span>
                    </div>

                    {attachmentError && (
                      <div style={{ color: '#e11d48', fontSize: '12px', fontWeight: 600, marginTop: '4px' }}>
                        ⚠️ {attachmentError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Preview Pane */}
                <div className={styles.previewPane}>
                  <div className={styles.previewHeader}>
                    <div className={styles.previewTitle}>Live Merged Email Preview</div>
                    <div className={styles.previewRecipient}>
                      {activeRecipient ? (
                        <>
                          Target: <strong>{activeRecipient.college_name}</strong> &lt;{activeRecipient.email}&gt;
                        </>
                      ) : (
                        <span>Sample: <strong>{previewTarget.college_name}</strong> &lt;{previewTarget.email}&gt;</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.previewSubject}>
                    Subject: {mergePlaceholders(subjectTemplate, previewTarget)}
                  </div>

                  {/* Attached Files Badge in Preview */}
                  {campaignAttachments.length > 0 && (
                    <div style={{ padding: '8px 12px', background: '#e0f2fe', borderRadius: '4px', fontSize: '12px', color: '#0369a1', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <strong>📎 Attached Files ({campaignAttachments.length}):</strong>
                      {campaignAttachments.map((att, idx) => (
                        <span key={idx} style={{ background: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                          {att.filename} ({formatFileSize(att.size)})
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{
                      __html: formatBodyToHtml(mergePlaceholders(bodyTemplate, previewTarget)),
                    }}
                  />
                </div>
              </div>
            )}

            <div className={styles.dispatchBar}>
              <div className={styles.dispatchLeft}>
                <span className={styles.selectedCount}>
                  Selected: {selectedIds.size} recipient(s) &bull; Eligible in Filter: {eligibleFiltered.length}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className={styles.btnDispatch}
                  onClick={triggerSendSelected}
                  disabled={isDispatching || isAutoPlaying || selectedIds.size === 0 || !canSend}
                >
                  <SendIcon size={16} />
                  <span>Send to Selected ({selectedIds.size})</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setConfirmModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Confirm Batch Outreach Campaign</div>
              <button
                type="button"
                style={{ padding: '4px', cursor: 'pointer' }}
                onClick={() => setConfirmModalOpen(false)}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p>
                You are about to initiate an automated outreach campaign to{' '}
                <strong>{dispatchTargets.length} institution(s)</strong>.
              </p>

              <div style={{ margin: '12px 0', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>Subject:</strong> {subjectTemplate}</div>
                <div><strong>Target Region:</strong> {selectedCountry} ({Array.from(selectedStates).join(', ')})</div>
                <div><strong>Attachments:</strong> {campaignAttachments.length > 0 ? `${campaignAttachments.length} file(s) attached` : 'None'}</div>
              </div>

              <div className={styles.securityNote}>
                <strong>Anti-Spam &amp; Privacy Shield:</strong> A separate, individually customized email will be sent to each recipient. Socket rate limiting (300ms) will safeguard delivery reputation.
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnDispatchSecondary}
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnDispatch}
                onClick={handleExecuteModalDispatch}
              >
                Confirm &amp; Start Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Manager Modal for Bulk Email Customization */}
      <EmailImageManagerModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsertImage={handleInsertImage}
      />
    </div>
  );
}
