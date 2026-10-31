import { NextResponse } from 'next/server';
import { getGeoCountries } from '@/lib/db.js';
import { applySecurityHeaders } from '@/lib/security.js';
import masterRegistry from '@/data/pan_india_master_registry.json';

export async function GET(request) {
  try {
    let countries = getGeoCountries();
    if (!countries || countries.length === 0 || !countries.some(c => c.code === 'IN' && c.college_count >= 50000)) {
      const indiaColleges = masterRegistry.total_india_colleges || 66010;
      const indiaContacts = masterRegistry.total_india_contacts || 78810;
      countries = [
        { code: 'IN', name: 'India', phone_code: '+91', college_count: indiaColleges, contact_count: indiaContacts },
        { code: 'US', name: 'United States', phone_code: '+1', college_count: 0, contact_count: 0 },
        { code: 'GB', name: 'United Kingdom', phone_code: '+44', college_count: 0, contact_count: 0 },
        { code: 'CA', name: 'Canada', phone_code: '+1', college_count: 0, contact_count: 0 },
        { code: 'AU', name: 'Australia', phone_code: '+61', college_count: 0, contact_count: 0 },
        { code: 'AE', name: 'United Arab Emirates', phone_code: '+971', college_count: 0, contact_count: 0 },
        { code: 'SG', name: 'Singapore', phone_code: '+65', college_count: 0, contact_count: 0 },
        { code: 'DE', name: 'Germany', phone_code: '+49', college_count: 0, contact_count: 0 },
        { code: 'MY', name: 'Malaysia', phone_code: '+60', college_count: 0, contact_count: 0 },
        { code: 'NZ', name: 'New Zealand', phone_code: '+64', college_count: 0, contact_count: 0 },
      ];
    }
    const response = NextResponse.json({ success: true, countries });
    applySecurityHeaders(response.headers);
    return response;
  } catch (err) {
    console.error('[API Geo Countries] error:', err);
    return NextResponse.json({ error: 'Failed to load countries' }, { status: 500 });
  }
}
