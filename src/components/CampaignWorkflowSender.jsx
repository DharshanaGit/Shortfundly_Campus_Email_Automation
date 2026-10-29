'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './CampaignWorkflowSender.module.css';
import {
  SendIcon,
  GlobeIcon,
  BuildingIcon,
  MailIcon,
  TemplateIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ImageIcon,
  EyeIcon,
  CloseIcon,
  CheckIcon,
  PlusIcon
} from './Icons.jsx';
import EmailImageManagerModal from './EmailImageManagerModal.jsx';
import { renderTemplate, validateTemplatePlaceholders } from '@/lib/templates.js';

export default function CampaignWorkflowSender({ templates = [], session, onCampaignFinished, onNavigateTracking }) {
  const canSend = true; // Full sending permissions for all users
  const isTemplateManager = true; // Full template management for all users

  // Active Step (1 to 10)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Campaign Name
  const [campaignName, setCampaignName] = useState('Campus Film Festival & Creator Outreach 2026');

  // Step 2 & 3: Multi-Country and Multi-State Target Selection
  const [countriesList, setCountriesList] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState(['India']);
  const [countrySearch, setCountrySearch] = useState('');

  const [regionsList, setRegionsList] = useState([]);
  const [selectedStates, setSelectedStates] = useState(['Andhra Pradesh']);
  const [stateSearch, setStateSearch] = useState('');
  const [loadingRegions, setLoadingRegions] = useState(false);

  // Step 4: College & Contact Selection
  const [colleges, setColleges] = useState([]);
  const [totalColleges, setTotalColleges] = useState(0);
  const [loadingColleges, setLoadingColleges] = useState(false);
  const [collegeSearch, setCollegeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [availableDistricts, setAvailableDistricts] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [targetRoleMode, setTargetRoleMode] = useState('smart'); // 'smart' | 'principal' | 'tpo' | 'all'

  // Selected College IDs & Contact IDs
  const [selectedCollegeIds, setSelectedCollegeIds] = useState(new Set());
  const [selectedContactMap, setSelectedContactMap] = useState({}); // collegeId -> email

  // Step 5 & 6: Template Selection, Editor, Images
  const [availableTemplates, setAvailableTemplates] = useState(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || 'campus-collaboration-proposal');
  const [subjectTemplate, setSubjectTemplate] = useState('Proposal for Institutional Collaboration — Academic & Skill Development at {{college_name}}');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [isTemporaryEdit, setIsTemporaryEdit] = useState(false);

  // Modals & Image Insertion
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Step 7: Preview Simulation
  const [previewContactIndex, setPreviewContactIndex] = useState(0);
  const [previewDevice, setPreviewDevice] = useState('desktop'); // 'desktop' | 'mobile'

  // Step 8 & 9: Validation, Tracking & Review
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [overrideDuplicates, setOverrideDuplicates] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Step 10: Dispatching & Progress
  const [dispatching, setDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState(null);
  const [dispatchSummary, setDispatchSummary] = useState(null);

  const textareaRef = useRef(null);

  // 1. Fetch countries on mount
  useEffect(() => {
    async function loadCountries() {
      try {
        const res = await fetch('/api/outreach/geo/countries');
        if (res.ok) {
          const data = await res.json();
          setCountriesList(data.countries || []);
        }
      } catch (err) {
        console.error('Error loading countries:', err);
      }
    }
    loadCountries();
  }, []);

  // 2. Fetch states whenever selected countries change
  useEffect(() => {
    async function loadStates() {
      if (selectedCountries.length === 0) {
        setRegionsList([]);
        return;
      }
      setLoadingRegions(true);
      try {
        const allRegions = [];
        for (const countryName of selectedCountries) {
          const countryObj = countriesList.find(c => c.name === countryName || c.code === countryName);
          const countryCode = countryObj?.code || 'IN';
          const res = await fetch(`/api/outreach/geo/regions?country=${countryCode}`);
          if (res.ok) {
            const data = await res.json();
            (data.regions || []).forEach(r => {
              allRegions.push({ ...r, country_name: countryName });
            });
          }
        }
        setRegionsList(allRegions);
      } catch (err) {
        console.error('Error loading regions:', err);
      } finally {
        setLoadingRegions(false);
      }
    }
    loadStates();
  }, [selectedCountries, countriesList]);

  // 3. Fetch colleges whenever selected countries or states change
  useEffect(() => {
    async function loadColleges() {
      if (selectedCountries.length === 0 || selectedStates.length === 0) {
        setColleges([]);
        setTotalColleges(0);
        return;
      }
      setLoadingColleges(true);
      try {
        const params = new URLSearchParams();
        selectedCountries.forEach(c => params.append('countries', c));
        selectedStates.forEach(s => params.append('states', s));
        if (collegeSearch.trim()) params.set('q', collegeSearch.trim());
        if (categoryFilter !== 'all') params.set('category', categoryFilter);
        if (districtFilter !== 'all') params.set('district', districtFilter);
        params.set('limit', '100');

        const res = await fetch(`/api/outreach/geo/colleges?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setColleges(data.colleges || []);
          setTotalColleges(data.total || 0);
          setAvailableDistricts(data.districts || []);
          setAvailableCategories(data.categories || []);

          // Auto-select all matching colleges initially if none selected
          if (selectedCollegeIds.size === 0 && data.colleges?.length > 0) {
            const newSet = new Set(data.colleges.map(c => c.id));
            setSelectedCollegeIds(newSet);
          }
        }
      } catch (err) {
        console.error('Error loading colleges:', err);
      } finally {
        setLoadingColleges(false);
      }
    }
    loadColleges();
  }, [selectedCountries, selectedStates, collegeSearch, categoryFilter, districtFilter]);

  // Set initial template body
  useEffect(() => {
    if (templates.length > 0 && !bodyTemplate) {
      const initialTpl = templates.find(t => t.id === selectedTemplateId) || templates[0];
      setSelectedTemplateId(initialTpl.id);
      setSubjectTemplate(initialTpl.subjectTemplate || initialTpl.subject_template || '');
      setBodyTemplate(initialTpl.bodyTemplate || initialTpl.body_template || '');
      setIsTemporaryEdit(false);
    }
  }, [templates]);

  // Change active template
  const handleTemplateChange = (tplId) => {
    const tpl = availableTemplates.find(t => t.id === tplId);
    if (!tpl) return;
    setSelectedTemplateId(tplId);
    setSubjectTemplate(tpl.subjectTemplate || tpl.subject_template || '');
    setBodyTemplate(tpl.bodyTemplate || tpl.body_template || '');
    setIsTemporaryEdit(false);
  };

  // Toggle country selection
  const handleToggleCountry = (countryName) => {
    setSelectedCountries(prev => {
      if (prev.includes(countryName)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(c => c !== countryName);
      }
      return [...prev, countryName];
    });
  };

  // Toggle state selection
  const handleToggleState = (stateName) => {
    setSelectedStates(prev => {
      if (prev.includes(stateName)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(s => s !== stateName);
      }
      return [...prev, stateName];
    });
  };

  // Toggle college selection
  const handleToggleCollege = (collegeId) => {
    setSelectedCollegeIds(prev => {
      const next = new Set(prev);
      if (next.has(collegeId)) next.delete(collegeId);
      else next.add(collegeId);
      return next;
    });
  };

  const handleSelectAllColleges = () => {
    setSelectedCollegeIds(new Set(colleges.map(c => c.id)));
  };

  const handleDeselectAllColleges = () => {
    setSelectedCollegeIds(new Set());
  };

  // Compute selected recipients list with contact resolution
  const resolvedRecipients = useMemo(() => {
    const list = [];
    colleges.forEach(clg => {
      if (!selectedCollegeIds.has(clg.id)) return;

      const contacts = clg.contacts || [];
      if (contacts.length === 0) {
        if (clg.phone) {
          // No email contact available
        }
        return;
      }

      // Pick contact based on targetRoleMode
      let contact = null;
      if (targetRoleMode === 'principal') {
        contact = contacts.find(c => c.role_type === 'principal') || contacts[0];
      } else if (targetRoleMode === 'tpo') {
        contact = contacts.find(c => c.role_type === 'tpo') || contacts[0];
      } else {
        contact = contacts[0];
      }

      if (contact && contact.email) {
        list.push({
          college_id: clg.id,
          college_name: clg.college_name,
          country: clg.country_name || 'India',
          state: clg.state_or_region || 'Andhra Pradesh',
          district: clg.district || clg.city || '',
          email: contact.email,
          contact_person: contact.contact_person || 'Official Representative',
          designation: contact.designation || 'Campus Partnerships Lead',
          department: contact.department || 'Outreach',
          website_url: clg.website_url || '',
          phone: clg.phone || contact.phone || '',
          institution: clg.college_name,
        });
      }
    });
    return list;
  }, [colleges, selectedCollegeIds, targetRoleMode]);

  // Insert image HTML snippet into cursor position of body template
  const handleInsertImage = (htmlSnippet) => {
    if (!textareaRef.current) {
      setBodyTemplate(prev => prev + '\n' + htmlSnippet);
      setIsTemporaryEdit(true);
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = bodyTemplate;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const updated = before + htmlSnippet + after;
    setBodyTemplate(updated);
    setIsTemporaryEdit(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + htmlSnippet.length, start + htmlSnippet.length);
    }, 50);
  };

  // Insert placeholder token into cursor position
  const handleInsertPlaceholder = (token) => {
    if (!textareaRef.current) {
      setBodyTemplate(prev => prev + ' ' + token);
      setIsTemporaryEdit(true);
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = bodyTemplate;
    const updated = text.substring(0, start) + token + text.substring(end);

    setBodyTemplate(updated);
    setIsTemporaryEdit(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 50);
  };

  // Save as new template
  const handleSaveAsNewTemplate = async () => {
    if (!newTemplateTitle.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTemplateTitle.trim(),
          subject_template: subjectTemplate.trim(),
          body_template: bodyTemplate.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAvailableTemplates(prev => [
          ...prev,
          {
            id: data.id,
            title: newTemplateTitle.trim(),
            subject_template: subjectTemplate.trim(),
            body_template: bodyTemplate.trim(),
          }
        ]);
        setSelectedTemplateId(data.id);
        setIsTemporaryEdit(false);
        setSaveTemplateModalOpen(false);
        setNewTemplateTitle('');
        alert('New template saved successfully into library!');
      } else {
        alert(data.error || 'Failed to save template.');
      }
    } catch {
      alert('Network error saving template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Update existing template
  const handleUpdateMasterTemplate = async () => {
    if (!confirm('Permanently overwrite this master template in the company library?')) return;
    setSavingTemplate(true);
    try {
      const activeTpl = availableTemplates.find(t => t.id === selectedTemplateId);
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTemplateId,
          title: activeTpl?.title || 'Updated Template',
          subject_template: subjectTemplate.trim(),
          body_template: bodyTemplate.trim(),
        }),
      });

      if (res.ok) {
        setIsTemporaryEdit(false);
        alert('Master template successfully updated in database!');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update master template.');
      }
    } catch {
      alert('Network error updating master template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Validation Checks for Step 8
  const validationResults = useMemo(() => {
    const sampleRecipient = resolvedRecipients[0] || {
      college_name: 'Sample College',
      contact_salutation: 'Principal',
      institution: 'Sample College',
      state: selectedStates[0] || 'Andhra Pradesh',
      country: selectedCountries[0] || 'India',
      department: 'Campus Partnerships',
      sender_name: 'Campus Outreach Coordinator'
    };

    const subjectVal = validateTemplatePlaceholders(subjectTemplate, sampleRecipient);
    const bodyVal = validateTemplatePlaceholders(bodyTemplate, sampleRecipient);

    const hasName = Boolean(campaignName.trim());
    const hasRecipients = resolvedRecipients.length > 0;
    const hasSubject = Boolean(subjectTemplate.trim());
    const hasBody = Boolean(bodyTemplate.trim());
    const placeholdersOk = subjectVal.isValid && bodyVal.isValid;
    const unresolved = [...subjectVal.unresolvedTokens, ...bodyVal.unresolvedTokens];

    return {
      isValid: hasName && hasRecipients && hasSubject && hasBody && placeholdersOk,
      hasName,
      hasRecipients,
      hasSubject,
      hasBody,
      placeholdersOk,
      unresolved,
      count: resolvedRecipients.length,
    };
  }, [campaignName, resolvedRecipients, subjectTemplate, bodyTemplate, selectedStates, selectedCountries]);

  // Step 10: Dispatch Campaign Execution
  const handleConfirmAndDispatch = async () => {
    if (!canSend) {
      alert('Access restricted: sending permissions required.');
      return;
    }

    setDispatching(true);
    setDispatchProgress({
      total: resolvedRecipients.length,
      current: 0,
      status: 'Initializing campaign dispatch...',
    });

    try {
      const res = await fetch('/api/outreach/campaigns/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          subject: subjectTemplate.trim(),
          bodyHtml: bodyTemplate.trim(),
          templateId: selectedTemplateId,
          targetCountries: selectedCountries,
          targetStates: selectedStates,
          recipients: resolvedRecipients,
          trackOpens,
          trackClicks,
          overrideDuplicate: overrideDuplicates,
          overrideReason,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setDispatchSummary(data);
        if (onCampaignFinished) onCampaignFinished();
      } else {
        alert(data.error || 'Failed to dispatch campaign.');
        setDispatching(false);
      }
    } catch {
      alert('Network error while dispatching campaign.');
      setDispatching(false);
    }
  };

  const samplePreviewRecipient = resolvedRecipients[previewContactIndex] || resolvedRecipients[0] || {
    college_name: 'Walchand College of Engineering',
    contact_person: 'Dr. Suresh Kumar',
    contact_salutation: 'Dr. Suresh Kumar (Principal)',
    institution: 'Walchand College of Engineering',
    state: selectedStates[0] || 'Andhra Pradesh',
    country: selectedCountries[0] || 'India',
    department: 'Computer Science & Engineering',
    sender_name: session?.email?.split('@')[0] || 'Campus Outreach Coordinator',
    email: 'principal@wce.edu.in',
    website_url: 'https://wce.edu.in',
  };

  const previewSubject = renderTemplate(subjectTemplate, samplePreviewRecipient);
  const previewBodyHtml = renderTemplate(bodyTemplate, samplePreviewRecipient);

  return (
    <div className={styles.workflowContainer}>
      {/* 10-Step Interactive Workflow Header Stepper */}
      <div className={styles.stepperBar}>
        {[
          { num: 1, label: 'Campaign' },
          { num: 2, label: 'Countries' },
          { num: 3, label: 'States' },
          { num: 4, label: 'Colleges' },
          { num: 5, label: 'Template' },
          { num: 6, label: 'Composer' },
          { num: 7, label: 'Preview' },
          { num: 8, label: 'Validate' },
          { num: 9, label: 'Review' },
          { num: 10, label: 'Dispatch' },
        ].map((step) => {
          const isActive = currentStep === step.num;
          const isDone = currentStep > step.num;
          return (
            <button
              key={step.num}
              type="button"
              className={`${styles.stepItem} ${isActive ? styles.stepItemActive : ''} ${isDone ? styles.stepItemCompleted : ''}`}
              onClick={() => setCurrentStep(step.num)}
            >
              <span className={styles.stepBadge}>
                {isDone ? <CheckIcon size={12} /> : step.num}
              </span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* STEP 1: Campaign Name */}
      {currentStep === 1 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 1 of 10</span>
              <h2 className={styles.stepTitle}>Create Outreach Campaign</h2>
              <p className={styles.stepDesc}>Enter an identifiable campaign name to organize delivery metrics, tracking, and reports.</p>
            </div>
          </div>

          <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>Campaign Name *</label>
            <input
              type="text"
              className={styles.searchBox}
              style={{ fontSize: '15px', padding: '12px 14px' }}
              placeholder="e.g. South India Engineering Colleges - Film Festival 2026"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>

          <div className={styles.stepNavigation}>
            <div />
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={!campaignName.trim()}
              onClick={() => setCurrentStep(2)}
            >
              <span>Next: Select Countries &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Country Selection */}
      {currentStep === 2 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 2 of 10</span>
              <h2 className={styles.stepTitle}>Target Countries</h2>
              <p className={styles.stepDesc}>Select one or more countries for this campaign. College directories and contacts will dynamically adapt.</p>
            </div>
          </div>

          <div style={{ maxWidth: '400px' }}>
            <input
              type="text"
              className={styles.searchBox}
              placeholder="Search countries..."
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
            />
          </div>

          <div className={styles.chipList}>
            {countriesList
              .filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
              .map(c => {
                const isSelected = selectedCountries.includes(c.name) || selectedCountries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    className={`${styles.chipItem} ${isSelected ? styles.chipItemActive : ''}`}
                    onClick={() => handleToggleCountry(c.name)}
                  >
                    <span>{c.name}</span>
                    <span className={styles.chipCountBadge}>
                      {c.college_count > 0 ? `${c.college_count} colleges` : '0 populated'}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(1)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={selectedCountries.length === 0}
              onClick={() => setCurrentStep(3)}
            >
              <span>Next: Select States &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: State / Administrative Region Selection */}
      {currentStep === 3 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 3 of 10</span>
              <h2 className={styles.stepTitle}>Select States &amp; Regions</h2>
              <p className={styles.stepDesc}>
                Available administrative regions dynamically loaded for {selectedCountries.join(', ')}. Select multiple states across countries.
              </p>
            </div>
          </div>

          <div style={{ maxWidth: '400px' }}>
            <input
              type="text"
              className={styles.searchBox}
              placeholder="Search states/provinces..."
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
            />
          </div>

          {loadingRegions ? (
            <div className={styles.emptyStateNotice}>Loading available regions...</div>
          ) : (
            <div className={styles.chipList}>
              {regionsList
                .filter(r => r.name.toLowerCase().includes(stateSearch.toLowerCase()))
                .map(r => {
                  const isSelected = selectedStates.includes(r.name);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`${styles.chipItem} ${isSelected ? styles.chipItemActive : ''}`}
                      onClick={() => handleToggleState(r.name)}
                    >
                      <span>{r.name} ({r.country_name || 'India'})</span>
                      <span className={styles.chipCountBadge}>
                        {r.college_count > 0 ? `${r.college_count} colleges` : '0 in DB'}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(2)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={selectedStates.length === 0}
              onClick={() => setCurrentStep(4)}
            >
              <span>Next: Target Colleges ({selectedStates.length} states) &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: College & Contact Selection */}
      {currentStep === 4 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 4 of 10</span>
              <h2 className={styles.stepTitle}>Colleges &amp; Verified Contacts</h2>
              <p className={styles.stepDesc}>
                Target colleges in {selectedStates.join(', ')} ({selectedCountries.join(', ')}). Search, filter by category or district, and choose recipients.
              </p>
            </div>
          </div>

          {/* Toolbar */}
          <div className={styles.collegeToolbar}>
            <div className={styles.selectionSummary}>
              <span>Selected: <strong>{selectedCollegeIds.size}</strong> colleges &bull; <strong>{resolvedRecipients.length}</strong> eligible email addresses</span>
            </div>

            <div className={styles.toolbarActions}>
              <button type="button" className={styles.actionBtnSmall} onClick={handleSelectAllColleges}>
                Select All ({colleges.length})
              </button>
              <button type="button" className={styles.actionBtnSmall} onClick={handleDeselectAllColleges}>
                Deselect All
              </button>

              <select
                className={styles.searchBox}
                style={{ padding: '6px 10px', fontSize: '12px' }}
                value={targetRoleMode}
                onChange={(e) => setTargetRoleMode(e.target.value)}
              >
                <option value="smart">Smart Role (Principal &gt; TPO &gt; Dean)</option>
                <option value="principal">Principal / Director Priority</option>
                <option value="tpo">Placement / TPO Priority</option>
              </select>
            </div>
          </div>

          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className={styles.searchBox}
              style={{ flex: 1, minWidth: '220px' }}
              placeholder="Search college name, city, website..."
              value={collegeSearch}
              onChange={(e) => setCollegeSearch(e.target.value)}
            />

            {availableCategories.length > 0 && (
              <select
                className={styles.searchBox}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Streams / Categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            {availableDistricts.length > 0 && (
              <select
                className={styles.searchBox}
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
              >
                <option value="all">All Districts</option>
                {availableDistricts.map(dist => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            )}
          </div>

          {/* Table */}
          {loadingColleges ? (
            <div className={styles.emptyStateNotice}>Loading targeted colleges...</div>
          ) : colleges.length === 0 ? (
            <div className={styles.emptyStateNotice}>
              <strong>No colleges populated for {selectedStates.join(', ')} yet.</strong>
              <p style={{ marginTop: '4px' }}>
                Per guidelines, fake college records are never fabricated. You can import contacts via CSV or select a populated region like Andhra Pradesh.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.collegesTable}>
                <thead>
                  <tr>
                    <th className={styles.checkboxCol}>
                      <input
                        type="checkbox"
                        checked={selectedCollegeIds.size === colleges.length && colleges.length > 0}
                        onChange={(e) => (e.target.checked ? handleSelectAllColleges() : handleDeselectAllColleges())}
                      />
                    </th>
                    <th>College Name</th>
                    <th>State / Country</th>
                    <th>District / City</th>
                    <th>Verified Contact Email</th>
                    <th>Website</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map(clg => {
                    const isSelected = selectedCollegeIds.has(clg.id);
                    const primaryEmail = clg.primary_email || clg.contacts?.[0]?.email || '';
                    return (
                      <tr key={clg.id} className={isSelected ? styles.rowSelected : ''}>
                        <td className={styles.checkboxCol}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCollege(clg.id)}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{clg.college_name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{clg.category || 'Higher Education'}</div>
                        </td>
                        <td>{clg.state_or_region}, {clg.country_name || 'India'}</td>
                        <td>{clg.district || clg.city || '-'}</td>
                        <td>
                          {primaryEmail ? (
                            <span style={{ color: '#2563eb', fontFamily: 'monospace' }}>{primaryEmail}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No verified email</span>
                          )}
                        </td>
                        <td>
                          {clg.website_url ? (
                            <a href={clg.website_url} target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', fontSize: '12px' }}>
                              Visit &rarr;
                            </a>
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(3)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={resolvedRecipients.length === 0}
              onClick={() => setCurrentStep(5)}
            >
              <span>Next: Choose Template ({resolvedRecipients.length} recipients) &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Template Selection */}
      {currentStep === 5 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 5 of 10</span>
              <h2 className={styles.stepTitle}>Select Email Template</h2>
              <p className={styles.stepDesc}>Choose an official proposal template or start with a custom announcement layout.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {availableTemplates.map(tpl => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  style={{
                    border: isSelected ? '2px solid #e11d48' : '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '18px',
                    background: isSelected ? '#fff1f2' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: isSelected ? '0 4px 12px rgba(225, 29, 72, 0.08)' : 'none',
                  }}
                  onClick={() => handleTemplateChange(tpl.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{tpl.title}</span>
                    {isSelected && <CheckCircleIcon size={18} style={{ color: '#e11d48' }} />}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    Subject: &ldquo;{tpl.subjectTemplate || tpl.subject_template}&rdquo;
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {tpl.is_default ? '★ Official Default System Template' : 'Custom Company Template'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(4)}>
              &larr; Back
            </button>
            <button type="button" className={styles.navBtnPrimary} onClick={() => setCurrentStep(6)}>
              <span>Next: Edit Subject &amp; Content &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Email Composer, Images & Personalization */}
      {currentStep === 6 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 6 of 10</span>
              <h2 className={styles.stepTitle}>Email Composition &amp; Image Studio</h2>
              <p className={styles.stepDesc}>
                Personalize formatted text, insert promotional posters, banners, and logos. Edits apply to this campaign without altering master templates unless saved.
              </p>
            </div>
          </div>

          {/* In-Sender Template Bar */}
          <div className={styles.templateSelectionBar}>
            <div className={styles.templateSelectGroup}>
              <label>Template:</label>
              <select
                className={styles.templateDropdown}
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                {availableTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            {isTemporaryEdit && (
              <span className={styles.templateEditAlert}>
                <span>Campaign Edits Active (Unsaved to Master)</span>
              </span>
            )}

            <div className={styles.templateActionsRow}>
              {isTemplateManager && isTemporaryEdit && (
                <button
                  type="button"
                  className={styles.actionBtnSmall}
                  onClick={handleUpdateMasterTemplate}
                  disabled={savingTemplate}
                  title="Overwrite the master template in the library"
                >
                  Save to Master Template
                </button>
              )}
              {isTemplateManager && (
                <button
                  type="button"
                  className={styles.actionBtnSmall}
                  onClick={() => setSaveTemplateModalOpen(true)}
                  title="Save current content as a new template"
                >
                  <PlusIcon size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Save as New Template...
                </button>
              )}
            </div>
          </div>

          {/* Placeholders Helper Chips */}
          <div className={styles.placeholdersBar}>
            <span className={styles.placeholdersLabel}>Insert Placeholders:</span>
            {[
              { token: '{{college_name}}', desc: 'College Name' },
              { token: '{{contact_salutation}}', desc: 'Contact Salutation' },
              { token: '{{institution}}', desc: 'Institution' },
              { token: '{{state}}', desc: 'State' },
              { token: '{{country}}', desc: 'Country' },
              { token: '{{department}}', desc: 'Department' },
              { token: '{{sender_name}}', desc: 'Your Name' },
            ].map(p => (
              <button
                key={p.token}
                type="button"
                className={styles.placeholderChip}
                onClick={() => handleInsertPlaceholder(p.token)}
                title={`Click to insert ${p.desc}`}
              >
                {p.token}
              </button>
            ))}
          </div>

          {/* Subject Line */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>Subject Line *</label>
            <input
              type="text"
              className={styles.searchBox}
              value={subjectTemplate}
              onChange={(e) => {
                setSubjectTemplate(e.target.value);
                setIsTemporaryEdit(true);
              }}
            />
          </div>

          {/* Visual Editor Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className={styles.composerToolbar}>
              <div className={styles.toolbarGroup}>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => handleInsertPlaceholder('<strong>Bold Text</strong>')}
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => handleInsertPlaceholder('<em>Italic Text</em>')}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => handleInsertPlaceholder('<a href="https://example.com/details" target="_blank">Link Text</a>')}
                >
                  Link
                </button>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => handleInsertPlaceholder('<ul style="padding-left: 20px;">\n  <li>List item 1</li>\n  <li>List item 2</li>\n</ul>')}
                >
                  &bull; Bullet List
                </button>
              </div>

              <div className={styles.toolbarGroup}>
                <button
                  type="button"
                  className={`${styles.toolBtn} ${styles.toolBtnPrimary}`}
                  onClick={() => setImageModalOpen(true)}
                  title="Upload promotional posters, banners, or insert images"
                >
                  <ImageIcon size={14} />
                  <span>Insert / Upload Image...</span>
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              className={styles.editorTextarea}
              value={bodyTemplate}
              onChange={(e) => {
                setBodyTemplate(e.target.value);
                setIsTemporaryEdit(true);
              }}
              rows={14}
            />
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(5)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={!subjectTemplate.trim() || !bodyTemplate.trim()}
              onClick={() => setCurrentStep(7)}
            >
              <span>Next: Live Email Preview &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: Preview Simulation */}
      {currentStep === 7 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 7 of 10</span>
              <h2 className={styles.stepTitle}>Email Client Preview &amp; Verification</h2>
              <p className={styles.stepDesc}>
                Preview how personalized emails render for targeted colleges ({resolvedRecipients.length} recipients).
              </p>
            </div>

            {/* Desktop / Mobile view toggle */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`${styles.actionBtnSmall} ${previewDevice === 'desktop' ? styles.toolBtnPrimary : ''}`}
                onClick={() => setPreviewDevice('desktop')}
              >
                Desktop View
              </button>
              <button
                type="button"
                className={`${styles.actionBtnSmall} ${previewDevice === 'mobile' ? styles.toolBtnPrimary : ''}`}
                onClick={() => setPreviewDevice('mobile')}
              >
                Mobile View
              </button>
            </div>
          </div>

          {/* Sample Recipient Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>Previewing Contact:</span>
            <select
              className={styles.searchBox}
              value={previewContactIndex}
              onChange={(e) => setPreviewContactIndex(Number(e.target.value))}
              style={{ flex: 1 }}
            >
              {resolvedRecipients.slice(0, 30).map((r, idx) => (
                <option key={idx} value={idx}>
                  {r.college_name} &bull; {r.contact_person} ({r.email}) &bull; {r.state}, {r.country}
                </option>
              ))}
            </select>
          </div>

          {/* Preview Box */}
          <div
            className={styles.previewFrame}
            style={{ maxWidth: previewDevice === 'mobile' ? '380px' : '100%', margin: '0 auto' }}
          >
            <div className={styles.previewTopBar}>
              <div className={styles.previewMeta}>
                <div><strong>To:</strong> {samplePreviewRecipient.email} ({samplePreviewRecipient.college_name})</div>
                <div><strong>Subject:</strong> {previewSubject}</div>
              </div>
            </div>
            <div
              className={styles.previewBody}
              dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
            />
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(6)}>
              &larr; Back to Editor
            </button>
            <button type="button" className={styles.navBtnPrimary} onClick={() => setCurrentStep(8)}>
              <span>Next: Validate Placeholders &amp; Addresses &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 8: Validation Checklist */}
      {currentStep === 8 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 8 of 10</span>
              <h2 className={styles.stepTitle}>Campaign Validation &amp; Safety Checks</h2>
              <p className={styles.stepDesc}>Verifying recipient syntax, duplicate rules, placeholder resolution, and mandatory headers before submission.</p>
            </div>
          </div>

          <div className={styles.validationCard}>
            <div className={styles.validationItem}>
              {validationResults.hasName ? (
                <CheckCircleIcon size={18} className={styles.valPassed} />
              ) : (
                <AlertCircleIcon size={18} className={styles.valFailed} />
              )}
              <div>
                <strong>Campaign Name:</strong> {campaignName || 'Missing campaign name'}
              </div>
            </div>

            <div className={styles.validationItem}>
              {validationResults.hasRecipients ? (
                <CheckCircleIcon size={18} className={styles.valPassed} />
              ) : (
                <AlertCircleIcon size={18} className={styles.valFailed} />
              )}
              <div>
                <strong>Target Recipients:</strong> {resolvedRecipients.length} verified email addresses selected across {selectedStates.length} states ({selectedCountries.join(', ')}).
              </div>
            </div>

            <div className={styles.validationItem}>
              {validationResults.placeholdersOk ? (
                <CheckCircleIcon size={18} className={styles.valPassed} />
              ) : (
                <AlertCircleIcon size={18} className={styles.valWarning} />
              )}
              <div>
                <strong>Template Placeholder Resolution:</strong>{' '}
                {validationResults.placeholdersOk ? (
                  <span>All placeholders successfully resolved with recipient data.</span>
                ) : (
                  <span style={{ color: '#d97706' }}>
                    Warning: Unresolved placeholder tokens detected: {validationResults.unresolved.join(', ')}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.validationItem}>
              <CheckCircleIcon size={18} className={styles.valPassed} />
              <div>
                <strong>Duplicate Prevention Policy:</strong> 30-day cooldown enforcement active. Contacts contacted within the past 30 days are automatically filtered out.
              </div>
            </div>
          </div>

          {/* Optional Duplicate Override */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overrideDuplicates}
                onChange={(e) => setOverrideDuplicates(e.target.checked)}
              />
              <span>Override 30-day outreach cooldown window (requires justification reason)</span>
            </label>

            {overrideDuplicates && (
              <input
                type="text"
                className={styles.searchBox}
                style={{ marginTop: '8px', width: '100%' }}
                placeholder="Enter authorized business reason for duplicate override..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            )}
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(7)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              disabled={!validationResults.isValid}
              onClick={() => setCurrentStep(9)}
            >
              <span>Next: Review &amp; Confirm &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 9: Final Review & Tracking Configuration */}
      {currentStep === 9 && (
        <div className={styles.stepCard}>
          <div className={styles.stepHeader}>
            <div className={styles.stepTitleArea}>
              <span className={styles.stepNumberTag}>Step 9 of 10</span>
              <h2 className={styles.stepTitle}>Review &amp; Confirm Submission</h2>
              <p className={styles.stepDesc}>Verify final campaign parameters and configure telemetry tracking options.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Campaign Name</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>{campaignName}</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Target Geographic Coverage</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>
                {selectedCountries.join(', ')} &bull; {selectedStates.join(', ')}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Recipients</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#e11d48', marginTop: '4px' }}>
                {resolvedRecipients.length} Colleges / Contacts
              </div>
            </div>
          </div>

          {/* Tracking Options */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0369a1' }}>Email Telemetry &amp; Privacy Configuration</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0c4a6e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={trackOpens}
                onChange={(e) => setTrackOpens(e.target.checked)}
              />
              <span><strong>Enable Pixel Open Tracking:</strong> Embeds an invisible 1&times;1 telemetry pixel to detect email opens. (Subject to client privacy protections).</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0c4a6e', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={trackClicks}
                onChange={(e) => setTrackClicks(e.target.checked)}
              />
              <span><strong>Enable Link Engagement Tracking:</strong> Tracks clicks on portal, festival, and registration URLs.</span>
            </label>
          </div>

          <div className={styles.stepNavigation}>
            <button type="button" className={styles.navBtnSecondary} onClick={() => setCurrentStep(8)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.navBtnPrimary}
              style={{ background: '#16a34a' }}
              onClick={handleConfirmAndDispatch}
              disabled={dispatching || !canSend}
            >
              <SendIcon size={16} />
              <span>Confirm &amp; Dispatch Campaign ({resolvedRecipients.length} Emails)</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 10: Dispatch Progress / Completion */}
      {(currentStep === 10 || dispatching || dispatchSummary) && (
        <div className={styles.progressModalOverlay}>
          <div className={styles.progressModalContent}>
            {dispatching && !dispatchSummary && (
              <>
                <RefreshCwIcon size={44} className={styles.spinnerLarge} />
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                  Dispatching Campaign Emails...
                </h3>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                  Connecting to Google SMTP (smtp.gmail.com), signing headers with DKIM/SPF, injecting telemetry tokens, and relaying messages.
                </p>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#e11d48' }}>
                  {dispatchProgress?.status || 'Processing batch...'}
                </div>
              </>
            )}

            {dispatchSummary && (
              <>
                <CheckCircleIcon size={48} style={{ color: '#16a34a', margin: '0 auto' }} />
                <h3 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>
                  Campaign Dispatched Successfully!
                </h3>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                  {dispatchSummary.message}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>SUBMITTED</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{dispatchSummary.totalSubmitted}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '700' }}>SMTP ACCEPTED</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a' }}>{dispatchSummary.acceptedCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700' }}>FAILED</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#dc2626' }}>{dispatchSummary.failedCount}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    className={styles.navBtnPrimary}
                    onClick={() => {
                      setDispatchSummary(null);
                      setDispatching(false);
                      if (onNavigateTracking) onNavigateTracking();
                    }}
                  >
                    <span>View Campaign Telemetry &amp; Reports &rarr;</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image Manager & Uploader Modal */}
      <EmailImageManagerModal
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onInsertImage={handleInsertImage}
      />

      {/* Save Template Modal */}
      {saveTemplateModalOpen && (
        <div className={styles.progressModalOverlay} onClick={() => setSaveTemplateModalOpen(false)}>
          <div
            className={styles.progressModalContent}
            style={{ maxWidth: '480px', textAlign: 'left' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Save as New Template</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              Save this customized layout and body into the library for future campaigns.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>Template Title *</label>
              <input
                type="text"
                className={styles.searchBox}
                placeholder="e.g. Campus Ambassador Invitation 2026"
                value={newTemplateTitle}
                onChange={(e) => setNewTemplateTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className={styles.navBtnSecondary}
                onClick={() => setSaveTemplateModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.navBtnPrimary}
                onClick={handleSaveAsNewTemplate}
                disabled={savingTemplate || !newTemplateTitle.trim()}
              >
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
