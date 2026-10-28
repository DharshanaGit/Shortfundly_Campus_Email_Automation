'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './EmailReviewModal.module.css';
import {
  SendIcon,
  CloseIcon,
  EyeIcon,
  EditIcon,
  ShieldAlertIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  BuildingIcon,
  MailIcon
} from './Icons.jsx';
import { renderTemplate, formatBodyToHtml, htmlToJinjaText } from '@/lib/templates.js';

const JINJA_VARIABLES = [
  { tag: '{{college_name}}', label: 'College' },
  { tag: '{{contact_salutation}}', label: 'Salutation' },
  { tag: '{{contact_person}}', label: 'Person' },
  { tag: '{{department}}', label: 'Department' },
  { tag: '{{designation}}', label: 'Designation' },
  { tag: '{{state}}', label: 'State' },
  { tag: '{{country}}', label: 'Country' },
  { tag: '{{sender_name}}', label: 'Sender' },
];

export default function EmailReviewModal({
  isOpen,
  initialData,
  templates = [],
  onClose,
  onSuccess,
  canSend = true,
  user,
}) {
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'edit'
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const textareaRef = useRef(null);

  const getInterpolationVars = () => {
    if (!initialData) return {};
    return {
      college_name: initialData.college_name || '',
      department: initialData.department || '',
      contact_person: initialData.contact_person || '',
      designation: initialData.designation || '',
      email: initialData.email || '',
      state: initialData.state || 'Andhra Pradesh',
      country: initialData.country || 'India',
      sender_name: user?.name || 'Campus Relations Lead',
    };
  };

  // Interpolate initial data into selected template
  useEffect(() => {
    if (!initialData) return;

    let allTemplates = [...templates];

    const applyTemplate = (tplList) => {
      const tpl = tplList.find((t) => t.id === initialData.template_id) || tplList[0];
      if (tpl) {
        const rawSubject = tpl.subjectTemplate || tpl.subject_template || '';
        const rawBody = tpl.bodyTemplate || tpl.body_template || '';

        setSubject(rawSubject);
        setBodyText(htmlToJinjaText(rawBody));
      }
    };

    if (allTemplates.length === 0) {
      fetch('/api/outreach/templates')
        .then((res) => res.json())
        .then((data) => {
          if (data.templates && data.templates.length > 0) {
            applyTemplate(data.templates);
          }
        })
        .catch(() => {});
    } else {
      applyTemplate(allTemplates);
    }

    setSendResult(null);
    setOverrideReason('');
    setActiveTab('preview');
  }, [initialData, templates, user]);

  if (!isOpen || !initialData) return null;

  const vars = getInterpolationVars();

  // Helper to insert Jinja placeholder at cursor position
  const handleInsertJinjaTag = (tag) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBodyText((prev) => prev + ' ' + tag);
      return;
    }

    const start = textarea.selectionStart ?? bodyText.length;
    const end = textarea.selectionEnd ?? bodyText.length;
    const nextText = bodyText.substring(0, start) + tag + bodyText.substring(end);
    setBodyText(nextText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 10);
  };

  const handleSend = async () => {
    setIsSending(true);
    setSendResult(null);

    const hasDuplicate = Boolean(initialData.duplicateWarning?.isDuplicate);
    const finalSubject = renderTemplate(subject, vars);
    const finalBodyHtml = formatBodyToHtml(renderTemplate(bodyText, vars));

    try {
      const response = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_name: initialData.college_name,
          email: initialData.email,
          department: initialData.department,
          contact_person: initialData.contact_person || null,
          designation: initialData.designation || null,
          subject: finalSubject,
          body_html: finalBodyHtml,
          override_duplicate: hasDuplicate,
          override_reason: hasDuplicate ? overrideReason || 'Manual user override after review' : null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSendResult({
          type: 'SUCCESS',
          message: `Campus proposal successfully dispatched to ${initialData.email}!`,
          messageId: data.messageId,
          status: data.status || '250 OK',
        });
        if (onSuccess) onSuccess();
      } else {
        setSendResult({
          type: 'ERROR',
          message: data.error || 'Failed to dispatch email.',
          classification: data.classification?.category || null,
        });
      }
    } catch (err) {
      setSendResult({
        type: 'ERROR',
        message: 'Network communication failure during dispatch.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const isDuplicate = Boolean(initialData.duplicateWarning?.isDuplicate);
  const renderedSubject = renderTemplate(subject, vars);
  const renderedBodyHtml = formatBodyToHtml(renderTemplate(bodyText, vars));

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitle}>
            <SendIcon size={18} />
            <span>Review &amp; Edit Proposal Before Dispatch</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Recipient Quick Summary */}
        <div className={styles.recipientBar}>
          <div className={styles.recipientItem}>
            <BuildingIcon size={14} />
            <span>Target: <strong>{initialData.college_name}</strong></span>
          </div>
          <div className={styles.recipientItem}>
            <MailIcon size={14} />
            <span>To: <strong>{initialData.email}</strong></span>
          </div>
          <div className={styles.recipientItem}>
            <span>Dept: <strong>{initialData.department}</strong></span>
          </div>
          {initialData.contact_person && (
            <div className={styles.recipientItem}>
              <span>Contact: <strong>{initialData.contact_person}</strong></span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            <EyeIcon size={14} />
            <span>Live Recipient View</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'edit' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            <EditIcon size={14} />
            <span>Inline Content Editor (Jinja Text)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* Success State Banner (Clean Toast Style outside Email Box) */}
          {sendResult && sendResult.type === 'SUCCESS' && (
            <div className={styles.successNotificationCard}>
              <div className={styles.successIconBox}>
                <CheckCircleIcon size={22} />
              </div>
              <div className={styles.successContent}>
                <div className={styles.successTitle}>Email Successfully Dispatched</div>
                <div className={styles.successMessage}>
                  Delivered to <strong>{initialData.email}</strong> for <strong>{initialData.college_name}</strong>.
                </div>
              </div>
              <button type="button" className={styles.successDoneBtn} onClick={onClose}>
                Done &amp; Close
              </button>
            </div>
          )}

          {/* Failure Banner */}
          {sendResult && sendResult.type === 'ERROR' && (
            <div className={styles.errorNotificationCard}>
              <AlertCircleIcon size={20} />
              <div className={styles.errorMessage}>{sendResult.message}</div>
            </div>
          )}

          {activeTab === 'preview' ? (
            <div className={styles.previewContainer}>
              <div className={styles.previewSubjectBar}>
                <span className={styles.previewSubjectTag}>SUBJECT:</span>
                <span className={styles.previewSubjectValue}>{renderedSubject}</span>
              </div>
              <div
                className={styles.previewHtml}
                dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
              />
            </div>
          ) : (
            <div className={styles.editSection}>
              {/* Email Subject Line with comfortable spacing */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label}>Email Subject Line</label>
                  <span className={styles.labelHint}>Supports Jinja tokens like {"{{college_name}}"}</span>
                </div>
                <input
                  type="text"
                  className={styles.subjectInput}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Collaboration Proposal for {{college_name}}"
                />
              </div>

              {/* Email Body Content - Jinja Simple Text */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label}>Email Body Content</label>
                  <span className={styles.labelHint}>Simple text with Jinja placeholders — no HTML tags required</span>
                </div>

                {/* Jinja Insert Tags Toolbar */}
                <div className={styles.jinjaToolbar}>
                  <span className={styles.toolbarTitle}>Quick Insert:</span>
                  <div className={styles.jinjaPillsRow}>
                    {JINJA_VARIABLES.map((v) => (
                      <button
                        key={v.tag}
                        type="button"
                        className={styles.jinjaPill}
                        onClick={() => handleInsertJinjaTag(v.tag)}
                        title={`Click to insert ${v.tag}`}
                      >
                        {v.tag}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  className={styles.bodyTextarea}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="Write email proposal here in plain text. Use {{college_name}}, {{contact_salutation}}, etc. for variables..."
                  rows={14}
                />
              </div>
            </div>
          )}

          {/* Duplicate Override Panel */}
          {isDuplicate && (
            <div className={styles.duplicateAlertBox}>
              <div className={styles.duplicateHeader}>
                <ShieldAlertIcon size={16} />
                <span>Duplicate Outreach Detected (Within 30-Day Cooldown)</span>
              </div>
              <p>
                An outreach record already exists for <strong>{initialData.email}</strong> from{' '}
                {initialData.duplicateWarning?.daysAgo === 0 ? 'today' : `${initialData.duplicateWarning?.daysAgo} days ago`}.
                To proceed with re-contacting this institution, please provide a documented reason:
              </p>
              <input
                type="text"
                className={styles.overrideInput}
                placeholder="e.g. Follow-up meeting requested / Revised proposal / New department lead"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            {sendResult?.type === 'SUCCESS' ? 'Done' : 'Back to Edit Fields'}
          </button>

          {sendResult?.type !== 'SUCCESS' && (
            canSend ? (
              <button
                type="button"
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={isSending || (isDuplicate && !overrideReason.trim())}
              >
                {isSending ? (
                  <>
                    <RefreshCwIcon size={16} className="spin" />
                    <span>Connecting to Google SMTP...</span>
                  </>
                ) : (
                  <>
                    <SendIcon size={16} />
                    <span>
                      {isDuplicate ? 'Authorize & Dispatch' : 'Finalize & Send Email'}
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div className={styles.restrictedNotice}>
                Sending Restricted (Manager View-Only Mode)
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
