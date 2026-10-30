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
  MailIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon
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

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

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
    setAttachments([]);
    setAttachmentError('');
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

  // Upload image or document attachment
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentError('');

    // Check size limit (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError(`File size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      e.target.value = '';
      return;
    }

    // Limit to 5 attachments max
    if (attachments.length >= 5) {
      setAttachmentError('Maximum of 5 attachments allowed per email dispatch.');
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

      if (!res.ok) {
        setAttachmentError(data.error || 'Failed to upload attachment.');
      } else if (data.success && uploadedItem) {
        setAttachments((prev) => [...prev, uploadedItem]);
        setAttachmentError('');
      }
    } catch {
      setAttachmentError('Network failure during file upload.');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (indexToRemove) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
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
          state: initialData.state || 'Andhra Pradesh',
          country: initialData.country || 'India',
          subject: finalSubject,
          body_html: finalBodyHtml,
          campaign_id: 'SINGLE_DISPATCH',
          attachments: attachments,
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
          outreachId: data.outreachId,
          status: data.status || '250 OK',
        });

        // Store dispatched record into persistent client ledger for immediate Mails Tracker visibility
        try {
          const sentRecord = {
            id: data.outreachId || ('out_' + Date.now()),
            college_name: initialData.college_name,
            email: initialData.email,
            department: initialData.department,
            contact_person: initialData.contact_person || '',
            designation: initialData.designation || '',
            state: initialData.state || 'Andhra Pradesh',
            country: initialData.country || 'India',
            subject: finalSubject,
            body_html: finalBodyHtml,
            body_text: bodyText,
            status: data.status || 'ACCEPTED',
            delivery_status: 'SMTP_ACCEPTED',
            smtp_response: data.response || '250 OK Message Accepted',
            smtp_message_id: data.messageId || null,
            created_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            sent_by: user?.email || 'admin',
            open_count: 0,
            click_count: 0,
            attachments: attachments,
          };
          const raw = localStorage.getItem('sf_single_dispatches_ledger');
          const existingList = raw ? JSON.parse(raw) : [];
          const updated = [sentRecord, ...existingList.filter((r) => r.id !== sentRecord.id)].slice(0, 500);
          localStorage.setItem('sf_single_dispatches_ledger', JSON.stringify(updated));
        } catch (storageErr) {
          console.warn('[EmailReviewModal] Local storage ledger write note:', storageErr?.message);
        }

        if (onSuccess) onSuccess();
      } else {
        // Record failed attempt into client ledger as well for complete tracking history
        try {
          const failedRecord = {
            id: data.outreachId || ('out_' + Date.now()),
            college_name: initialData.college_name,
            email: initialData.email,
            department: initialData.department,
            contact_person: initialData.contact_person || '',
            designation: initialData.designation || '',
            state: initialData.state || 'Andhra Pradesh',
            country: initialData.country || 'India',
            subject: finalSubject,
            body_html: finalBodyHtml,
            body_text: bodyText,
            status: 'FAILED',
            delivery_status: 'FAILED',
            error_message: data.error || 'Dispatch error',
            smtp_response: data.error || 'Failed to dispatch email',
            smtp_message_id: null,
            created_at: new Date().toISOString(),
            sent_at: null,
            sent_by: user?.email || 'admin',
            open_count: 0,
            click_count: 0,
            attachments: attachments,
          };
          const raw = localStorage.getItem('sf_single_dispatches_ledger');
          const existingList = raw ? JSON.parse(raw) : [];
          const updated = [failedRecord, ...existingList.filter((r) => r.id !== failedRecord.id)].slice(0, 500);
          localStorage.setItem('sf_single_dispatches_ledger', JSON.stringify(updated));
        } catch {}

        setSendResult({
          type: 'ERROR',
          message: data.error || 'Failed to dispatch email.',
          classification: data.classification?.category || null,
        });
      }
    } catch (err) {
      try {
        const errorRecord = {
          id: 'out_' + Date.now(),
          college_name: initialData.college_name,
          email: initialData.email,
          department: initialData.department,
          contact_person: initialData.contact_person || '',
          designation: initialData.designation || '',
          state: initialData.state || 'Andhra Pradesh',
          country: initialData.country || 'India',
          subject: finalSubject,
          body_html: finalBodyHtml,
          body_text: bodyText,
          status: 'FAILED',
          delivery_status: 'FAILED',
          error_message: 'Network communication failure during dispatch.',
          smtp_response: 'Network error',
          smtp_message_id: null,
          created_at: new Date().toISOString(),
          sent_at: null,
          sent_by: user?.email || 'admin',
          open_count: 0,
          click_count: 0,
          attachments: attachments,
        };
        const raw = localStorage.getItem('sf_single_dispatches_ledger');
        const existingList = raw ? JSON.parse(raw) : [];
        const updated = [errorRecord, ...existingList.filter((r) => r.id !== errorRecord.id)].slice(0, 500);
        localStorage.setItem('sf_single_dispatches_ledger', JSON.stringify(updated));
      } catch {}

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
            <span>State: <strong>{initialData.state || 'Andhra Pradesh'}, {initialData.country || 'India'}</strong></span>
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
          {/* Success State Banner: Explicit Notification */}
          {sendResult && sendResult.type === 'SUCCESS' && (
            <div className={styles.successNotificationCard}>
              <div className={styles.successIconBox}>
                <CheckCircleIcon size={24} />
              </div>
              <div className={styles.successContent}>
                <div className={styles.successTitle}>
                  ✓ Mail Sent Successfully!
                </div>
                <div className={styles.successMessage}>
                  Dispatched and validated by Google SMTP (Status: <strong>{sendResult.status}</strong>) to{' '}
                  <strong>{initialData.email}</strong> for <strong>{initialData.college_name}</strong>.
                </div>
                <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#166534', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span>📊 <strong>Tracked in:</strong> Mails tracker &bull; Single Mail Dispatcher</span>
                  {sendResult.messageId && <span><strong>Message ID:</strong> {sendResult.messageId.substring(0, 24)}...</span>}
                </div>
              </div>
              <button type="button" className={styles.successDoneBtn} onClick={onClose}>
                Done &amp; Close
              </button>
            </div>
          )}

          {/* Failure Notification Banner */}
          {sendResult && sendResult.type === 'ERROR' && (
            <div className={styles.errorNotificationCard}>
              <div style={{ color: '#dc2626', flexShrink: 0 }}>
                <AlertCircleIcon size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 750, color: '#991b1b', marginBottom: '2px' }}>
                  ⚠️ Mail Not Sent
                </div>
                <div className={styles.errorMessage}>{sendResult.message}</div>
                <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#b91c1c' }}>
                  This attempt has been logged in Mails tracker as <strong>Failed</strong>. You can retry with Google SMTP.
                </div>
              </div>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={handleSend}
                disabled={isSending}
              >
                {isSending ? 'Retrying...' : 'Retry Dispatch'}
              </button>
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
              {/* Email Subject Line */}
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
                    <button
                      type="button"
                      className={styles.jinjaPill}
                      style={{ background: '#ecfdf5', color: '#047857', borderColor: '#10b981', fontWeight: 700 }}
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingAttachment || attachments.length >= 5}
                      title="Upload and insert flyer or institutional image banner"
                    >
                      🖼️ {uploadingAttachment ? 'Uploading...' : '+ Add Image / Flyer'}
                    </button>
                    <button
                      type="button"
                      className={styles.jinjaPill}
                      style={{ background: '#f0fdfa', color: '#0f766e', borderColor: '#14b8a6', fontWeight: 700 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAttachment || attachments.length >= 5}
                      title="Attach document (PDF, Word, Excel, CSV)"
                    >
                      📎 + Attach File
                    </button>
                  </div>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                />

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

          {/* Provision to add images & files */}
          <div className={styles.attachmentPanel}>
            <div className={styles.attachmentHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>📎</span>
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                  Attachments &amp; Media ({attachments.length}/5)
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Attach PDFs, Docs, Presentations, or Images (Max 10 MB each)
                </span>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.png,.jpg,.jpeg,.gif,.webp"
                />
                <button
                  type="button"
                  className={styles.addAttachmentBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAttachment || attachments.length >= 5}
                >
                  {uploadingAttachment ? (
                    <>
                      <RefreshCwIcon size={13} className="spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon size={13} />
                      <span>Add File / Image</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {attachmentError && (
              <div className={styles.attachmentErrorAlert}>
                <AlertCircleIcon size={13} />
                <span>{attachmentError}</span>
              </div>
            )}

            {attachments.length > 0 && (
              <div className={styles.attachmentPillsRow}>
                {attachments.map((att, idx) => (
                  <div key={idx} className={styles.attachmentPill}>
                    <span style={{ fontSize: '13px' }}>
                      {att.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                    </span>
                    <span className={styles.attachmentFileName} title={att.filename}>
                      {att.filename}
                    </span>
                    {att.size && (
                      <span className={styles.attachmentFileSize}>
                        ({formatFileSize(att.size)})
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.removeAttachmentBtn}
                      onClick={() => handleRemoveAttachment(idx)}
                      title="Remove attachment"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
