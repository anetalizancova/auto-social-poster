/**
 * API Route: Cleanup duplicate scheduled posts from Upload Post
 * 
 * GET /api/cleanup - List all scheduled posts from Upload Post API
 * POST /api/cleanup - Delete duplicate posts (keep 1 per time slot per platform)
 */

import { NextResponse } from 'next/server';

const API_URL = 'https://api.upload-post.com/api';
const API_KEY = process.env.UPLOAD_POST_API_KEY;

interface ScheduledJob {
  job_id: string;
  scheduled_date: string;
  platform?: string;
  platforms?: string[];
  title?: string;
  status?: string;
  [key: string]: unknown;
}

// List all scheduled posts
export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${API_URL}/uploadposts/schedule`, {
      headers: { 'Authorization': `Apikey ${API_KEY}` },
    });

    const data = await response.json();
    console.log('📋 Scheduled posts response:', JSON.stringify(data).substring(0, 2000));

    // Analyze duplicates
    const jobs: ScheduledJob[] = data.scheduled_posts || data.jobs || data.data || (Array.isArray(data) ? data : []);

    // Group by scheduled_date + platform (e.g. "2026-02-10T09:00:00_x")
    const groups: Record<string, ScheduledJob[]> = {};
    for (const job of jobs) {
      const platforms: string[] = job.platforms || [job.platform || 'unknown'];
      const date = job.scheduled_date || 'unknown';
      for (const plat of platforms) {
        const key = `${date}_${plat}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(job);
      }
    }

    // Find duplicates (groups with > 1 job)
    const duplicateGroups: Record<string, { keep: string; remove: string[] }> = {};
    let totalDuplicates = 0;

    for (const [key, groupJobs] of Object.entries(groups)) {
      if (groupJobs.length > 1) {
        const [keep, ...remove] = groupJobs;
        duplicateGroups[key] = { 
          keep: keep.job_id, 
          remove: remove.map(j => j.job_id) 
        };
        totalDuplicates += remove.length;
      }
    }

    return NextResponse.json({
      success: true,
      totalScheduled: jobs.length,
      totalGroups: Object.keys(groups).length,
      totalDuplicates,
      duplicateGroups,
      allJobs: jobs.map(j => ({
        job_id: j.job_id,
        scheduled_date: j.scheduled_date,
        platforms: j.platforms,
        title: (j.title || '').substring(0, 60),
      })),
    });

  } catch (error) {
    console.error('Cleanup list error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// DELETE - Delete specific job(s) from Upload Post
export async function DELETE(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const jobIds: string[] = body.job_ids || [];

    if (jobIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No job_ids provided' }, { status: 400 });
    }

    const results: { job_id: string; success: boolean; error?: string }[] = [];

    for (const jobId of jobIds) {
      try {
        const res = await fetch(`${API_URL}/uploadposts/schedule/${jobId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Apikey ${API_KEY}` },
        });
        const data = await res.json();
        results.push({ job_id: jobId, success: res.ok && data.success, error: data.error || data.message });
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({ job_id: jobId, success: false, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

// POST - Delete duplicate posts (bulk cleanup)
export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    // First, get all scheduled posts
    const listResponse = await fetch(`${API_URL}/uploadposts/schedule`, {
      headers: { 'Authorization': `Apikey ${API_KEY}` },
    });

    const listData = await listResponse.json();
    const jobs: ScheduledJob[] = listData.scheduled_posts || listData.jobs || listData.data || (Array.isArray(listData) ? listData : []);

    // Group by scheduled_date + platform
    const groups: Record<string, ScheduledJob[]> = {};
    for (const job of jobs) {
      const platforms: string[] = job.platforms || [job.platform || 'unknown'];
      const date = job.scheduled_date || 'unknown';
      for (const plat of platforms) {
        const key = `${date}_${plat}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(job);
      }
    }

    // Collect jobs to delete (keep first, delete rest in each group)
    const toDelete: ScheduledJob[] = [];
    for (const groupJobs of Object.values(groups)) {
      if (groupJobs.length > 1) {
        // Keep the first, delete the rest
        toDelete.push(...groupJobs.slice(1));
      }
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldDelete: toDelete.length,
        jobs: toDelete.map(j => ({ job_id: j.job_id, platform: j.platform, date: j.scheduled_date, title: (j.title || '').substring(0, 60) })),
      });
    }

    // Actually delete
    const results: { job_id: string; success: boolean; error?: string }[] = [];
    let deleted = 0;
    let failed = 0;

    for (const job of toDelete) {
      try {
        const delResponse = await fetch(`${API_URL}/uploadposts/schedule/${job.job_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Apikey ${API_KEY}` },
        });

        const delData = await delResponse.json();
        if (delResponse.ok && delData.success) {
          deleted++;
          results.push({ job_id: job.job_id, success: true });
        } else {
          failed++;
          results.push({ job_id: job.job_id, success: false, error: delData.error || delData.message || 'Delete failed' });
        }

        // Small delay between requests
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        failed++;
        results.push({ job_id: job.job_id, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return NextResponse.json({
      success: true,
      totalScheduled: jobs.length,
      duplicatesFound: toDelete.length,
      deleted,
      failed,
      results,
    });

  } catch (error) {
    console.error('Cleanup delete error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
