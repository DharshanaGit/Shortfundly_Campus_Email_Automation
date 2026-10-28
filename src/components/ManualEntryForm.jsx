'use client';

import React, { useState, useEffect } from 'react';
import styles from './ManualEntryForm.module.css';
import {
  BuildingIcon,
  MailIcon,
  UserIcon,
  EyeIcon,
  ShieldAlertIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshCwIcon
} from './Icons.jsx';

export default function ManualEntryForm({ templates = [], onOpenReview, duplicateNotice = null, user = null }) {
  const canSend = user ? (user.role === 'admin' || user.role === 'team_lead' || Boolean(user.can_send)) : true;
  const [availableTemplates, setAvailableTemplates] = useState(templates);
  const [formData, setFormData] = useState({
    college_name: '',
    email: '',
    department: '',
    contact_person: '',
    designation: '',
    state: 'Andhra Pradesh',
    country: 'India',
    template_id: templates[0]?.id || 'campus-collaboration-proposal',
  });

  const [errors, setErrors] = useState({});
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Synchronize available templates when props update
  useEffect(() => {
    if (templates && templates.length > 0) {
      setAvailableTemplates(templates);
      if (!formData.template_id) {
        setFormData((prev) => ({ ...prev, template_id: templates[0].id }));
      }
    }
  }, [templates]);

  // Always fetch fresh templates directly from API on mount
  useEffect(() => {
    async function loadFreshTemplates() {
      try {
        const res = await fetch('/api/outreach/templates');
        if (res.ok) {
          const data = await res.json();
          if (data.templates && data.templates.length > 0) {
            setAvailableTemplates(data.templates);
            setFormData((prev) => {
              const exists = data.templates.some((t) => t.id === prev.template_id);
              return { ...prev, template_id: exists ? prev.template_id : data.templates[0].id };
            });
          }
        }
      } catch {
        // Fallback to props
      }
    }
    loadFreshTemplates();
  }, []);

  // Check duplicate when email loses focus
  const handleEmailBlur = async () => {
    const email = formData.email.trim();
    if (!email || !email.includes('@')) {
      setDuplicateWarning(null);
      return;
    }

    setCheckingDuplicate(true);
    try {
      const res = await fetch('/api/outreach/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.isDuplicate) {
        setDuplicateWarning(data);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Real-time strict validation while typing
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    const updatedErrors = { ...errors };

    // 1. College Name: NO numbers allowed
    if (name === 'college_name') {
      if (/[0-9]/.test(value)) {
        updatedErrors.college_name = 'Numbers are not allowed in college name. Please enter letters only.';
      } else {
        delete updatedErrors.college_name;
      }
    }

    // 2. Recipient Email: NO capital letters allowed while typing
    if (name === 'email') {
      setDuplicateWarning(null);
      if (/[A-Z]/.test(value)) {
        updatedErrors.email = 'Capital letters are not allowed in email. Use only lowercase letters and numbers.';
      } else {
        delete updatedErrors.email;
      }
    }

    // 3. Department: NO numbers allowed
    if (name === 'department') {
      if (/[0-9]/.test(value)) {
        updatedErrors.department = 'Numbers are not allowed in department name. Please enter letters only.';
      } else {
        delete updatedErrors.department;
      }
    }

    // 4. Contact Person: NO numbers allowed
    if (name === 'contact_person') {
      if (/[0-9]/.test(value)) {
        updatedErrors.contact_person = 'Numbers are not allowed in contact person name. Please enter letters only.';
      } else {
        delete updatedErrors.contact_person;
      }
    }

    // 5. Designation: NO numbers allowed
    if (name === 'designation') {
      if (/[0-9]/.test(value)) {
        updatedErrors.designation = 'Numbers are not allowed in designation. Please enter letters only.';
      } else {
        delete updatedErrors.designation;
      }
    }

    setErrors(updatedErrors);
  };

  const handleReset = () => {
    setFormData({
      college_name: '',
      email: '',
      department: '',
      contact_person: '',
      designation: '',
      state: 'Andhra Pradesh',
      country: 'India',
      template_id: templates[0]?.id || 'campus-collaboration-proposal',
    });
    setErrors({});
    setDuplicateWarning(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};

    // College Name Validation
    if (!formData.college_name.trim()) {
      newErrors.college_name = 'College name is required';
    } else if (/[0-9]/.test(formData.college_name)) {
      newErrors.college_name = 'Numbers are not allowed in college name. Please enter letters only.';
    }

    // Email Validation
    if (!formData.email.trim()) {
      newErrors.email = 'Recipient college email is required';
    } else if (/[A-Z]/.test(formData.email)) {
      newErrors.email = 'Capital letters are not allowed in email. Use only lowercase letters and numbers.';
    } else if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(formData.email.trim().toLowerCase())) {
      newErrors.email = 'Please provide a valid recipient email address format';
    }

    // Department Validation
    if (!formData.department.trim()) {
      newErrors.department = 'Department / faculty name is required';
    } else if (/[0-9]/.test(formData.department)) {
      newErrors.department = 'Numbers are not allowed in department name. Please enter letters only.';
    }

    // Contact Person Validation (Optional but strict)
    if (formData.contact_person && /[0-9]/.test(formData.contact_person)) {
      newErrors.contact_person = 'Numbers are not allowed in contact person name. Please enter letters only.';
    }

    // Designation Validation (Optional but strict)
    if (formData.designation && /[0-9]/.test(formData.designation)) {
      newErrors.designation = 'Numbers are not allowed in designation. Please enter letters only.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Launch email review & edit modal with populated template
    onOpenReview({
      ...formData,
      email: formData.email.trim().toLowerCase(),
      duplicateWarning,
    });
  };

  const hasValidationErrors = Object.keys(errors).length > 0;
  const isFormIncomplete = !formData.college_name.trim() || !formData.email.trim() || !formData.department.trim();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.iconBadge}>
            <BuildingIcon size={18} />
          </div>
          <div>
            <h2 className={styles.title}>Send Single Email</h2>
            <p className={styles.subtitle}>Enter college details to compose and send a personalized email</p>
          </div>
        </div>
        <div className={styles.stepIndicator}>Single Email</div>
      </div>

      {!canSend && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 16px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fbbf24',
          fontSize: '12px',
        }}>
          <AlertCircleIcon size={16} />
          <span>
            <strong>Read-Only Access:</strong> Your account is configured as Manager with view-only permissions. You can review template previews, but email dispatch requires Administrator authorization.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          {/* College Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="college_name">
              <span>College / University Name <span className={styles.required}>*</span></span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}><BuildingIcon size={16} /></span>
              <input
                id="college_name"
                name="college_name"
                type="text"
                className={`${styles.input} ${errors.college_name ? styles.inputError : ''}`}
                placeholder="e.g. PSG College of Technology"
                value={formData.college_name}
                onChange={handleChange}
                required
              />
            </div>
            {errors.college_name && (
              <div className={styles.errorText}>
                <AlertCircleIcon size={12} />
                <span>{errors.college_name}</span>
              </div>
            )}
          </div>

          {/* Recipient Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="email">
              <span>Recipient Email Address <span className={styles.required}>*</span></span>
              {checkingDuplicate && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Checking duplicate...
                </span>
              )}
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}><MailIcon size={16} /></span>
              <input
                id="email"
                name="email"
                type="email"
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                placeholder="e.g. dachudharshana17@gmail.com / placement@college.edu"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleEmailBlur}
                required
              />
            </div>
            {errors.email && (
              <div className={styles.errorText}>
                <AlertCircleIcon size={12} />
                <span>{errors.email}</span>
              </div>
            )}

            {duplicateWarning && (
              <div className={styles.duplicateBanner}>
                <ShieldAlertIcon size={16} />
                <span>
                  <strong>Duplicate Safeguard:</strong> Outreach was already initiated for this email{' '}
                  {duplicateWarning.daysAgo === 0 ? 'today' : `${duplicateWarning.daysAgo} day(s) ago`}{' '}
                  (Status: {duplicateWarning.lastRecord?.status}). You can review before sending with an override reason.
                </span>
              </div>
            )}
          </div>

          {/* Department / Division */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="department">
              <span>Department / Student Club <span className={styles.required}>*</span></span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}><BuildingIcon size={16} /></span>
              <input
                id="department"
                name="department"
                type="text"
                className={`${styles.input} ${errors.department ? styles.inputError : ''}`}
                placeholder="e.g. Information Technology with Data Science"
                value={formData.department}
                onChange={handleChange}
                required
              />
            </div>
            {errors.department && (
              <div className={styles.errorText}>
                <AlertCircleIcon size={12} />
                <span>{errors.department}</span>
              </div>
            )}
          </div>

          {/* Contact Person */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="contact_person">
              <span>Contact Person / Faculty Name</span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}><UserIcon size={16} /></span>
              <input
                id="contact_person"
                name="contact_person"
                type="text"
                className={`${styles.input} ${errors.contact_person ? styles.inputError : ''}`}
                placeholder="e.g. Dr. R. Sundaram (Letters only)"
                value={formData.contact_person}
                onChange={handleChange}
              />
            </div>
            {errors.contact_person && (
              <div className={styles.errorText}>
                <AlertCircleIcon size={12} />
                <span>{errors.contact_person}</span>
              </div>
            )}
          </div>

          {/* Designation */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="designation">
              <span>Designation</span>
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}><UserIcon size={16} /></span>
              <input
                id="designation"
                name="designation"
                type="text"
                className={`${styles.input} ${errors.designation ? styles.inputError : ''}`}
                placeholder="e.g. Principal / Faculty Coordinator (Letters only)"
                value={formData.designation}
                onChange={handleChange}
              />
            </div>
            {errors.designation && (
              <div className={styles.errorText}>
                <AlertCircleIcon size={12} />
                <span>{errors.designation}</span>
              </div>
            )}
          </div>

          {/* Template Selection */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="template_id">
              <span>Outreach Template</span>
            </label>
            <select
              id="template_id"
              name="template_id"
              className={styles.select}
              value={formData.template_id}
              onChange={handleChange}
            >
              {availableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleReset}
          >
            Clear Fields
          </button>

          <button
            type="submit"
            className={styles.reviewBtn}
            disabled={hasValidationErrors || isFormIncomplete}
            title={hasValidationErrors ? 'Please fix validation errors before proceeding' : 'Preview and send proposal'}
          >
            <EyeIcon size={16} />
            <span>Preview &amp; Send Email</span>
          </button>
        </div>
      </form>
    </div>
  );
}
