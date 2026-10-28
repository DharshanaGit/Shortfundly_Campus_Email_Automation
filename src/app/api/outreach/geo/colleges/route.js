import { NextResponse } from 'next/server';
import { getGeoColleges } from '@/lib/db.js';
import { applySecurityHeaders } from '@/lib/security.js';
import pg from 'pg';
import masterRegistry from '@/data/pan_india_master_registry.json';

const { Pool } = pg;

// PostgreSQL Connection Pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'college_directory',
  user: process.env.POSTGRES_USER || 'college_bot',
  password: process.env.POSTGRES_PASSWORD || 'MySecurePass123!',
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 2000,
  options: '-c search_path=college_data,public',
});

function queryMasterRegistry({ states = [], search = '', category = '', district = '', page = 1, limit = 3000 }) {
  let list = masterRegistry.colleges || [];

  if (states.length > 0 && !states.includes('All India')) {
    const lowerStates = states.map((s) => s.toLowerCase().trim());
    list = list.filter((c) => lowerStates.some((st) => (c.state_or_region || '').toLowerCase().includes(st)));
  }

  if (search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (c) =>
        (c.college_name && c.college_name.toLowerCase().includes(q)) ||
        (c.district && c.district.toLowerCase().includes(q)) ||
        (c.website_url && c.website_url.toLowerCase().includes(q)) ||
        (c.contacts && c.contacts.some((ct) => ct.email.toLowerCase().includes(q) || ct.contact_person.toLowerCase().includes(q)))
    );
  }

  if (category && category !== 'all') {
    const cat = category.toLowerCase();
    list = list.filter((c) => (c.category || '').toLowerCase().includes(cat));
  }

  if (district && district !== 'all') {
    const d = district.toLowerCase();
    list = list.filter((c) => (c.district || '').toLowerCase().includes(d));
  }

  const total = list.length;
  const offset = (page - 1) * limit;
  const sliced = list.slice(offset, offset + limit);

  return {
    colleges: sliced,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    source: 'Pan-India Master Registry',
  };
}

async function queryPostgresColleges({ states = [], search = '', category = '', district = '', page = 1, limit = 50 }) {
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (states.length > 0 && !states.includes('All India')) {
      const stateConditions = states.map((_, i) => `c.state ILIKE $${params.length + i + 1}`).join(' OR ');
      whereClause += ` AND (${stateConditions})`;
      params.push(...states.map(s => `%${s.trim()}%`));
    }

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClause += ` AND (c.college_name ILIKE $${params.length} OR c.district ILIKE $${params.length} OR c.website_url ILIKE $${params.length})`;
    }

    if (category && category !== 'all') {
      params.push(`%${category}%`);
      whereClause += ` AND c.category ILIKE $${params.length}`;
    }

    if (district && district !== 'all') {
      params.push(`%${district}%`);
      whereClause += ` AND c.district ILIKE $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*) AS total FROM colleges c ${whereClause};`;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    if (total === 0) {
      return null;
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const collegesQuery = `
      SELECT 
        c.id, c.college_name, c.state AS state_or_region, c.district,
        c.category, c.website_url, c.phone, c.address, c.source
      FROM colleges c
      ${whereClause}
      ORDER BY 
        (CASE WHEN EXISTS (SELECT 1 FROM college_contacts ct WHERE ct.college_id = c.id) THEN 0 ELSE 1 END),
        c.college_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const collegesRes = await pool.query(collegesQuery, params);
    const collegeRows = collegesRes.rows;

    if (collegeRows.length > 0) {
      const collegeIds = collegeRows.map(c => c.id);
      const placeholders = collegeIds.map((_, i) => `$${i + 1}`).join(',');
      const contactsRes = await pool.query(`
        SELECT 
          id, college_id, college_name, target_email AS email,
          role AS designation, role AS role_type, contact_person,
          phone, verification_status, dns_mx_verified
        FROM college_contacts
        WHERE college_id IN (${placeholders})
        ORDER BY verification_status ASC;
      `, collegeIds);

      const contactMap = {};
      for (const ct of contactsRes.rows) {
        if (!contactMap[ct.college_id]) contactMap[ct.college_id] = [];
        let person = (ct.contact_person || '').trim();
        if (!person || person.toLowerCase() === 'nan' || person.toLowerCase() === 'null') {
          person = ct.designation || 'Leadership Office';
        }
        contactMap[ct.college_id].push({
          id: ct.id,
          college_id: ct.college_id,
          contact_person: person,
          designation: ct.designation || 'Academic Leadership',
          email: ct.email,
          phone: (ct.phone && ct.phone.toLowerCase() !== 'nan') ? ct.phone : '',
          role_type: ct.role_type || 'Leadership',
          is_primary: 1,
          dns_mx_verified: ct.dns_mx_verified
        });
      }

      for (const clg of collegeRows) {
        clg.country_code = 'IN';
        clg.country_name = 'India';
        clg.contacts = contactMap[clg.id] || [];
        clg.all_available_emails = clg.contacts.map(c => c.email);
        clg.primary_email = clg.contacts[0]?.email || '';
      }
    }

    return {
      colleges: collegeRows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      source: 'PostgreSQL'
    };
  } catch (err) {
    console.error('[PostgreSQL Colleges Query] Fallback to SQLite:', err.message);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const countries = searchParams.getAll('countries').flatMap(c => c.split(',')).map(c => c.trim()).filter(Boolean);
  const states = searchParams.getAll('states').flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean);
  const singleState = searchParams.get('state');
  if (singleState && !states.includes(singleState)) {
    states.push(...singleState.split(',').map(s => s.trim()).filter(Boolean));
  }

  const search = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const district = searchParams.get('district') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

  try {
    // 1. Try PostgreSQL First
    let result = await queryPostgresColleges({ states, search, category, district, page, limit });

    // 2. Fallback to Pan-India Master Registry if PostgreSQL is unreachable or has no records
    if (!result || !result.colleges || result.colleges.length === 0) {
      result = queryMasterRegistry({ states, search, category, district, page, limit });
    }

    const response = NextResponse.json({
      success: true,
      countries,
      states,
      ...result,
      hasRecords: result.total > 0
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Geo Colleges GET] error:', err);
    return NextResponse.json({ error: 'Failed to query colleges' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const countries = Array.isArray(body.countries) ? body.countries : (body.country ? [body.country] : []);
    const states = Array.isArray(body.states) ? body.states : (body.state ? [body.state] : []);
    const search = body.search || body.q || '';
    const category = body.category || '';
    const district = body.district || '';
    const page = Math.max(1, parseInt(body.page || '1', 10));
    const limit = Math.min(5000, Math.max(1, parseInt(body.limit || '3000', 10)));

    // 1. Try PostgreSQL First
    let result = await queryPostgresColleges({ states, search, category, district, page, limit });

    // 2. Fallback to Pan-India Master Registry if PostgreSQL is unreachable or has no records
    if (!result || !result.colleges || result.colleges.length === 0) {
      result = queryMasterRegistry({ states, search, category, district, page, limit });
    }

    if (!result) {
      result = { colleges: [], total: 0, page, limit, totalPages: 0 };
    }

    const response = NextResponse.json({
      success: true,
      countries,
      states,
      ...result,
      hasRecords: (result.total || 0) > 0,
      emptyStateMessage: (result.total || 0) === 0
        ? 'No college records or contacts found for the selected geographic targeting. You can import records for this region using the CSV Import tool.'
        : null
    });

    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Geo Colleges POST] error:', err);
    return NextResponse.json({ error: 'Failed to query colleges' }, { status: 500 });
  }
}
