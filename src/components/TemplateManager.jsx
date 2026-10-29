'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './TemplateManager.module.css';
import {
  TemplateIcon,
  PlusIcon,
  SearchIcon,
  EyeIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ImageIcon,
} from './Icons';
import EmailImageManagerModal from './EmailImageManagerModal.jsx';
import { renderTemplate, formatBodyToHtml, htmlToJinjaText } from '@/lib/templates.js';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function TemplateManager({ session, onTemplatesUpdated }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Preview modal state
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Edit / Create modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    subject_template: '',
    body_template: '',
    attachments: [],
  });
  const [saving, setSaving] = useState(false);

  // Image modal state
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // Attachment upload state
  const attachmentInputRef = useRef(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const canManage = true;
  const isAdmin = true;

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/outreach/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        setFeedback({ type: 'error', message: 'Failed to load templates from database.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error connecting to templates service.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filteredTemplates = templates.filter((tpl) => {
    const q = searchQuery.toLowerCase();
    return (
      tpl.title.toLowerCase().includes(q) ||
      tpl.subject_template.toLowerCase().includes(q) ||
      tpl.body_template.toLowerCase().includes(q)
    );
  });

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setAttachmentError('');
    setFormData({
      title: '',
      subject_template: 'Institutional Collaboration Proposal — Academic Programs at [College Name]',
      body_template: 'Dear [Contact Person],\n\nGreetings!\n\nWe propose an institutional collaboration with [College Name] ([Department]) to support student skill development, workshops, and academic enrichment initiatives.\n\nWarm regards,\n[Your Name]\nCampus Outreach Coordinator',
      attachments: [],
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (tpl) => {
    setEditingTemplate(tpl);
    setAttachmentError('');
    setFormData({
      title: tpl.title,
      subject_template: tpl.subject_template || tpl.subjectTemplate || '',
      body_template: htmlToJinjaText(tpl.body_template || tpl.bodyTemplate || ''),
      attachments: Array.isArray(tpl.attachments) ? tpl.attachments : [],
    });
    setIsEditorOpen(true);
  };

  // Image insertion callback (inserts clean image tag or responsive banner)
  const handleInsertImage = (imgHtml) => {
    if (typeof imgHtml === 'string' && imgHtml.trim()) {
      insertAtCursor('\n' + imgHtml.trim() + '\n');
    }
    setIsImageModalOpen(false);
  };

  // Attachment file selection & upload
  const handleAttachmentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentError('');

    // Client-side validations
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setAttachmentError(`Unsupported file format (${ext}). Supported: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV.`);
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError(`File size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      e.target.value = '';
      return;
    }

    const currentAttachments = formData.attachments || [];
    if (currentAttachments.length >= 5) {
      setAttachmentError('Maximum of 5 attachments allowed per email template.');
      e.target.value = '';
      return;
    }

    const currentTotalSize = currentAttachments.reduce((acc, a) => acc + (a.size || 0), 0);
    if (currentTotalSize + file.size > 20 * 1024 * 1024) {
      setAttachmentError(`Combined attachment size exceeds 20 MB limit.`);
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
      if (res.ok && data.success && data.attachment) {
        setFormData((prev) => ({
          ...prev,
          attachments: [...(prev.attachments || []), data.attachment],
        }));
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

  const handleRemoveAttachment = (indexToRemove) => {
    setFormData((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.subject_template.trim() || !formData.body_template.trim()) {
      setFeedback({ type: 'error', message: 'Title, Subject, and Body template are all required.' });
      return;
    }

    try {
      setSaving(true);
      const finalHtml = formatBodyToHtml(formData.body_template);
      const payload = {
        id: editingTemplate ? editingTemplate.id : undefined,
        title: formData.title.trim(),
        subject_template: formData.subject_template.trim(),
        body_template: finalHtml,
        attachments: formData.attachments || [],
      };

      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setFeedback({ type: 'success', message: 'Template saved successfully.' });
        setIsEditorOpen(false);
        loadTemplates();
        if (onTemplatesUpdated) onTemplatesUpdated();
      } else {
        setFeedback({ type: 'error', message: result.error || 'Failed to save template.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error saving template.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    if (tpl.is_default) {
      alert('System default templates cannot be deleted.');
      return;
    }

    if (!confirm(`Are you sure you want to delete template "${tpl.title}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/outreach/templates?id=${encodeURIComponent(tpl.id)}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setFeedback({ type: 'success', message: 'Template deleted.' });
        loadTemplates();
        if (onTemplatesUpdated) onTemplatesUpdated();
      } else {
        setFeedback({ type: 'error', message: result.error || 'Failed to delete template.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error deleting template.' });
    }
  };

  const sampleVars = {
    college_name: 'PSG College of Technology',
    department: 'Visual Communication & Media Arts',
    contact_person: 'Dr. K. Ramesh',
    designation: 'Head of Department',
    email: 'hod.viscom@psgtech.ac.in',
    sender_name: 'Campus Outreach Coordinator',
    state: 'Tamil Nadu',
    country: 'India',
    institution: 'PSG College of Technology',
  };

  const renderSamplePreview = (text) => {
    if (!text) return '';
    return renderTemplate(text, sampleVars);
  };

  const textareaRef = useRef(null);

  const insertAtCursor = (textToInsert) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? formData.body_template.length;
      const end = textarea.selectionEnd ?? formData.body_template.length;
      const current = formData.body_template || '';
      const updated = current.substring(0, start) + textToInsert + current.substring(end);
      setFormData((prev) => ({ ...prev, body_template: updated }));
      setTimeout(() => {
        textarea.focus();
        const nextPos = start + textToInsert.length;
        textarea.setSelectionRange(nextPos, nextPos);
      }, 10);
    } else {
      setFormData((prev) => ({ ...prev, body_template: (prev.body_template || '') + ' ' + textToInsert }));
    }
  };

  const insertVariable = (varName) => {
    insertAtCursor(` ${varName} `);
  };

  const insertFormatTag = (openTag, closeTag, defaultText = 'sample text') => {
    const textarea = textareaRef.current;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = (formData.body_template || '').substring(start, end);
      insertAtCursor(`${openTag}${selected}${closeTag}`);
    } else {
      insertAtCursor(`${openTag}${defaultText}${closeTag}`);
    }
  };

  const insertHyperlinkPrompt = () => {
    const url = prompt('Enter the link destination URL:', 'https://example.com/programs');
    if (!url) return;
    const text = prompt('Enter clickable link text:', 'Explore Campus Programs');
    if (!text) return;
    insertAtCursor(` [${text.trim()}](${url.trim()}) `);
  };

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>Email Templates</h2>
          <p className={styles.description}>
            Create, customize, and manage reusable email templates. Placeholders like{' '}
            <code>[College Name]</code> and <code>[Contact Person]</code> are automatically filled when sending.
          </p>
        </div>

        {canManage && (
          <button type="button" className={styles.createBtn} onClick={handleOpenCreate}>
            <PlusIcon size={16} />
            <span>Create New Template</span>
          </button>
        )}
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
            style={{ marginLeft: 'auto', color: 'inherit' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search templates by title, subject or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.templateCount}>
          {filteredTemplates.length} {filteredTemplates.length === 1 ? 'Template' : 'Templates'} Available
        </div>
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className={styles.emptyState}>Loading templates from database...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className={styles.emptyState}>No matching templates found.</div>
      ) : (
        <div className={styles.templateGrid}>
          {filteredTemplates.map((tpl) => {
            const tplAttachments = Array.isArray(tpl.attachments) ? tpl.attachments : [];
            return (
              <div key={tpl.id} className={styles.templateCard}>
                <div className={styles.cardTop}>
                  <div className={styles.cardTitle}>{tpl.title}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {tplAttachments.length > 0 && (
                      <span className={styles.cardAttachmentsBadge} title={`${tplAttachments.length} file attachments included`}>
                        📎 {tplAttachments.length}
                      </span>
                    )}
                    {Boolean(tpl.is_default) && <span className={styles.defaultBadge}>Default</span>}
                  </div>
                </div>

                <div className={styles.subjectPreview} title={tpl.subject_template}>
                  <strong>Subject:</strong> {tpl.subject_template}
                </div>

                <div className={styles.bodySnippet}>{tpl.body_template}</div>

                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setPreviewTemplate(tpl)}
                  >
                    <EyeIcon size={14} />
                    <span>Preview</span>
                  </button>

                  <div className={styles.actionGroup}>
                    {canManage && (
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => handleOpenEdit(tpl)}
                        title="Edit template content"
                      >
                        <EditIcon size={14} />
                        <span>Edit</span>
                      </button>
                    )}

                    {isAdmin && !tpl.is_default && (
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => handleDelete(tpl)}
                        title="Delete this template"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className={styles.modalBackdrop} onClick={() => setPreviewTemplate(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Template Preview: {previewTemplate.title}</div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setPreviewTemplate(null)}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.previewEmailView}>
                <div className={styles.previewHeaderItem}>
                  <strong>Subject:</strong> {renderSamplePreview(previewTemplate.subject_template)}
                </div>
                <div className={styles.previewHeaderItem}>
                  <strong>Sample Recipient:</strong> Dr. K. Ramesh &lt;hod.viscom@psgtech.ac.in&gt;
                </div>
                <div className={styles.previewHeaderItem}>
                  <strong>Sample College:</strong> PSG College of Technology (Visual Communication & Media Arts)
                </div>

                {/* Attached files preview */}
                {Array.isArray(previewTemplate.attachments) && previewTemplate.attachments.length > 0 && (
                  <div style={{ margin: '12px 0', padding: '10px 14px', background: '#f1f5f9', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      📎 Attached Files ({previewTemplate.attachments.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {previewTemplate.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.attachmentChip}
                          style={{ textDecoration: 'none' }}
                        >
                          📄 {att.filename} <span style={{ opacity: 0.7, fontSize: '11px' }}>({formatFileSize(att.size)})</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={styles.previewBodyContent}
                  dangerouslySetInnerHTML={{
                    __html: formatBodyToHtml(renderSamplePreview(previewTemplate.body_template)),
                  }}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setPreviewTemplate(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isEditorOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsEditorOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveTemplate} className={styles.modalForm}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  {editingTemplate ? `Edit Template: ${editingTemplate.title}` : 'Create New Email Template'}
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setIsEditorOpen(false)}
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Template Title</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Media & Film Studies Department Collaboration"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Email Subject</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Institutional Collaboration Proposal - [College Name]"
                    value={formData.subject_template}
                    onChange={(e) => setFormData({ ...formData, subject_template: e.target.value })}
                    required
                  />
                </div>

                {/* Formatted Content Editor */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Template Body Content (Jinja Text Format — Plain &amp; Clean)</label>

                  {/* Formatting & Insert Bar (Jinja & Markdown) */}
                  <div className={styles.formattingBar}>
                    <button
                      type="button"
                      className={styles.formatBtn}
                      onClick={() => insertFormatTag('**', '**', 'bold text')}
                    >
                      <strong>B</strong> Bold
                    </button>

                    <button
                      type="button"
                      className={styles.formatBtn}
                      onClick={() => insertFormatTag('*', '*', 'italic text')}
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
                      onClick={() => insertAtCursor('\n• Key deliverable 1\n• Key deliverable 2\n')}
                    >
                      • Bullet List
                    </button>

                    <button
                      type="button"
                      className={styles.formatBtn}
                      onClick={() => setIsImageModalOpen(true)}
                      title="Insert image from library, upload new image, or provide image URL"
                    >
                      🖼️ Add Image
                    </button>
                  </div>

                  {/* Placeholder Variable Helper Chips */}
                  <div className={styles.variablesHelper}>
                    <span className={styles.helperLabel}>Jinja Tokens:</span>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{college_name}}')}
                    >
                      + {"{{college_name}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{contact_salutation}}')}
                    >
                      + {"{{contact_salutation}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{contact_person}}')}
                    >
                      + {"{{contact_person}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{department}}')}
                    >
                      + {"{{department}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{designation}}')}
                    >
                      + {"{{designation}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{state}}')}
                    >
                      + {"{{state}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{country}}')}
                    >
                      + {"{{country}}"}
                    </button>
                    <button
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable('{{sender_name}}')}
                    >
                      + {"{{sender_name}}"}
                    </button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    id="template_body_editor"
                    className={styles.textarea}
                    style={{ minHeight: '260px', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                    value={formData.body_template}
                    onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                    placeholder="Type or customize your email body content here using simple plain text and Jinja variables like {{college_name}}, {{contact_salutation}}, **bold**, • bullets..."
                    rows={12}
                    required
                  />
                </div>

                {/* File Attachments Section */}
                <div className={styles.attachmentsSection}>
                  <label className={styles.label}>
                    Email File Attachments (Optional, max 5 files, 10 MB each, 20 MB total)
                  </label>

                  <input
                    type="file"
                    ref={attachmentInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv"
                    onChange={handleAttachmentUpload}
                  />

                  {/* Attachment chips */}
                  {formData.attachments && formData.attachments.length > 0 && (
                    <div className={styles.attachmentList}>
                      {formData.attachments.map((att, idx) => (
                        <div key={idx} className={styles.attachmentChip}>
                          <span>📄 {att.filename}</span>
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
                      ))}
                    </div>
                  )}

                  <div className={styles.attachmentUploadBox}>
                    <button
                      type="button"
                      className={styles.attachmentUploadBtn}
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={uploadingAttachment || (formData.attachments?.length || 0) >= 5}
                    >
                      {uploadingAttachment ? 'Uploading...' : '+ Attach File (PDF, Word, Excel, PPT, CSV)'}
                    </button>
                    <span>
                      {(formData.attachments?.length || 0)} / 5 files attached &bull;{' '}
                      {formatFileSize((formData.attachments || []).reduce((acc, a) => acc + (a.size || 0), 0))} / 20 MB total
                    </span>
                  </div>

                  {attachmentError && (
                    <div style={{ color: '#e11d48', fontSize: '12px', fontWeight: 600 }}>
                      ⚠️ {attachmentError}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsEditorOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.createBtn}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Manager Modal */}
      <EmailImageManagerModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsertImage={handleInsertImage}
      />
    </div>
  );
}
