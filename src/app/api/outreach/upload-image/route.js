import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { getSession, canSendOutreach } from '@/lib/auth.js';
import { saveMediaImage, getMediaImages, deleteMediaImage, logAuditEvent } from '@/lib/db.js';
import { applySecurityHeaders, validateCsrfOrigin } from '@/lib/security.js';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'all';

  try {
    const images = getMediaImages(category);
    const response = NextResponse.json({ success: true, images });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Image] GET error:', err);
    return NextResponse.json({ error: 'Failed to retrieve image assets' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canSendOutreach(session)) {
    return NextResponse.json({ error: 'Access denied: sending/upload permissions required' }, { status: 403 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const category = (formData.get('category') || 'general').trim();
    const customTitle = (formData.get('title') || '').trim();

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Please choose an image file to upload' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image size exceeds maximum limit of 5 MB' }, { status: 400 });
    }

    const mimeType = file.type || '';
    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return NextResponse.json({
        error: `Invalid file type (${mimeType}). Allowed formats: PNG, JPG, JPEG, GIF, WebP, SVG.`
      }, { status: 400 });
    }

    const originalName = file.name || 'image.png';
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Invalid file extension (${ext}).` }, { status: 400 });
    }

    // Generate safe filename
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const cleanBasename = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const safeFilename = `${cleanBasename}_${Date.now()}_${randomSuffix}${ext}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Basic magic number validation for binary images
    if (ext === '.png' && (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47)) {
      return NextResponse.json({ error: 'File header does not match genuine PNG format.' }, { status: 400 });
    }
    if ((ext === '.jpg' || ext === '.jpeg') && (buffer[0] !== 0xff || buffer[1] !== 0xd8)) {
      return NextResponse.json({ error: 'File header does not match genuine JPEG format.' }, { status: 400 });
    }
    if (ext === '.gif' && buffer.toString('ascii', 0, 3) !== 'GIF') {
      return NextResponse.json({ error: 'File header does not match genuine GIF format.' }, { status: 400 });
    }

    let publicUrl = `/uploads/email-images/${safeFilename}`;
    let destinationPath = null;
    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'email-images');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      destinationPath = path.join(uploadsDir, safeFilename);
      fs.writeFileSync(destinationPath, buffer);
    } catch (fsErr) {
      // Vercel / serverless fallback
      try {
        const tmpDir = path.join(os.tmpdir(), 'shortfundly_images');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        destinationPath = path.join(tmpDir, safeFilename);
        fs.writeFileSync(destinationPath, buffer);
      } catch (tmpErr) {
        console.warn('[Image] File writing skipped, using Data URI representation:', tmpErr?.message);
      }
    }

    const imgRecord = saveMediaImage({
      filename: safeFilename,
      originalName: customTitle || originalName,
      mimeType,
      sizeBytes: file.size,
      url: dataUri || publicUrl,
      category,
      uploadedBy: session.email,
    });

    logAuditEvent('IMAGE_UPLOADED', { filename: safeFilename, size: file.size, category }, session.email);

    const attachmentRecord = {
      filename: originalName,
      savedName: safeFilename,
      url: dataUri || publicUrl,
      publicUrl,
      path: destinationPath,
      content: buffer.toString('base64'),
      encoding: 'base64',
      size: file.size,
      mimeType,
      isImage: true,
    };

    const response = NextResponse.json({
      success: true,
      image: {
        id: imgRecord?.id || ('img_' + Date.now()),
        filename: safeFilename,
        originalName: customTitle || originalName,
        url: dataUri || publicUrl,
        publicUrl,
        dataUri,
        size: file.size,
        mimeType,
        category,
      },
      attachment: attachmentRecord,
      file: attachmentRecord,
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Image] POST error:', err);
    return NextResponse.json({ error: 'Failed to process image upload.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canSendOutreach(session)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF security validation failed' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
  }

  try {
    const result = deleteMediaImage(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    // Try deleting file from disk
    if (result.filename) {
      const filePath = path.join(process.cwd(), 'public', 'uploads', 'email-images', result.filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }

    logAuditEvent('IMAGE_DELETED', { id, filename: result.filename }, session.email);
    const response = NextResponse.json({ success: true, message: 'Image deleted successfully' });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Image] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
