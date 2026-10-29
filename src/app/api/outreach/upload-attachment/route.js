import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { getSession, canSendOutreach } from '@/lib/auth.js';
import { logAuditEvent } from '@/lib/db.js';
import { applySecurityHeaders, validateCsrfOrigin } from '@/lib/security.js';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'email-attachments');
    if (!fs.existsSync(uploadDir)) {
      return NextResponse.json({ success: true, files: [] });
    }

    const fileNames = fs.readdirSync(uploadDir);
    const files = fileNames.map((name) => {
      const fullPath = path.join(uploadDir, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        size: stat.size,
        url: `/uploads/email-attachments/${name}`,
        createdAt: stat.birthtime,
      };
    });

    const response = NextResponse.json({ success: true, files });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Attachment] GET error:', err);
    return NextResponse.json({ error: 'Failed to list attachments.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canSendOutreach(session)) {
    return NextResponse.json({ error: 'Access denied: sending/upload permissions required.' }, { status: 403 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed.' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Please choose an attachment file to upload.' }, { status: 400 });
    }

    // 1. Validate file size (10 MB max)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Attachment exceeds maximum size limit of 10 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded).` },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Cannot upload empty (0 byte) file.' }, { status: 400 });
    }

    const originalName = file.name || 'document.pdf';
    const ext = path.extname(originalName).toLowerCase();

    // 2. Validate extension
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type (${ext}). Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV.` },
        { status: 400 }
      );
    }

    // 3. Validate MIME type
    const mimeType = file.type || 'application/octet-stream';
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase()) || mimeType === 'application/octet-stream';
    if (!isMimeAllowed) {
      return NextResponse.json(
        { error: `Disallowed MIME type (${mimeType}). Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 4. Magic number inspection for genuine file types
    if (ext === '.pdf') {
      // PDF files must start with %PDF
      if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
        return NextResponse.json({ error: 'File header does not match genuine PDF format.' }, { status: 400 });
      }
    } else if (['.docx', '.xlsx', '.pptx'].includes(ext)) {
      // Office OpenXML files are ZIP archives starting with PK (0x50 0x4B 0x03 0x04)
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        return NextResponse.json({ error: 'File header does not match genuine Office document format.' }, { status: 400 });
      }
    } else if (ext === '.csv') {
      // CSV must not contain null bytes (which indicate binary or executable payload)
      if (buffer.includes(0x00)) {
        return NextResponse.json({ error: 'Binary null characters detected in CSV text file.' }, { status: 400 });
      }
    }

    // 5. Generate secure safe filename
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const cleanBasename = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) || 'attachment';
    const safeFilename = `${cleanBasename}_${Date.now()}_${randomSuffix}${ext}`;

    let filePath = null;
    let publicUrl = `/uploads/email-attachments/${safeFilename}`;

    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'email-attachments');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      filePath = path.join(uploadsDir, safeFilename);
      fs.writeFileSync(filePath, buffer);
    } catch (fsErr) {
      // Serverless / Vercel fallback: write to temporary storage
      try {
        const tmpDir = path.join(os.tmpdir(), 'shortfundly_attachments');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        filePath = path.join(tmpDir, safeFilename);
        fs.writeFileSync(filePath, buffer);
      } catch (tmpErr) {
        console.warn('[Attachment] Filesystem write skipped, storing buffer in memory payload:', tmpErr?.message);
      }
    }

    logAuditEvent('ATTACHMENT_UPLOADED', {
      originalName,
      safeFilename,
      size: file.size,
      mimeType,
    }, session.email);

    const base64Content = buffer.toString('base64');
    const isImage = mimeType.startsWith('image/');
    const dataUri = isImage ? `data:${mimeType};base64,${base64Content}` : null;

    const attachmentRecord = {
      filename: originalName,
      savedName: safeFilename,
      url: dataUri || publicUrl,
      publicUrl,
      path: filePath,
      content: base64Content,
      encoding: 'base64',
      size: file.size,
      mimeType: mimeType || 'application/octet-stream',
      isImage,
    };

    const response = NextResponse.json({
      success: true,
      message: 'Attachment uploaded successfully.',
      attachment: attachmentRecord,
      file: attachmentRecord,
    });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Attachment] Upload error:', err);
    return NextResponse.json({ error: 'Failed to process attachment upload.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canSendOutreach(session)) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json({ error: 'Filename parameter required.' }, { status: 400 });
    }

    // Prevent directory traversal attacks
    const safeName = path.basename(filename);
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'email-attachments', safeName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logAuditEvent('ATTACHMENT_DELETED', { filename: safeName }, session.email);
    }

    const response = NextResponse.json({ success: true, message: 'Attachment removed.' });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Attachment] Delete error:', err);
    return NextResponse.json({ error: 'Failed to delete attachment.' }, { status: 500 });
  }
}
