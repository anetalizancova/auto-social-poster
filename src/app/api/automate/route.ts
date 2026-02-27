/**
 * API Route: Full Automation
 * 
 * GET/POST /api/automate - Kompletní automatizace: scrape → generate → schedule
 * 
 * Cron endpoint (1× týdně, Monday 6 AM):
 * 1. Duplicate guard -- skip if already ran in last 12h
 * 2. Scrape webu (webináře, produkty, články s plným textem)
 * 3. Generování postů s deduplication
 * 4. Naplánování přes Upload Post API
 */

import { NextResponse } from 'next/server';
import { scrapeAll } from '@/lib/scraper';
import { generatePosts } from '@/lib/generator';
import { scheduleAllPosts } from '@/lib/poster';
import { saveSources, loadQueue, saveQueue, getRecentPosts } from '@/lib/queue';

export const maxDuration = 300; // 5 minut

// Minimum hours between automation runs (prevents duplicate scheduling)
const MIN_HOURS_BETWEEN_RUNS = 12;

// Shared automation logic -- used by both GET (Vercel cron) and POST (manual trigger)
async function runAutomation(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('Warning: Missing or invalid CRON_SECRET');
  }
  
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '14');
  const force = searchParams.get('force') === 'true'; // ?force=true skips guard
  const postsPerDay = Math.min(count, 2);
  const daysAhead = Math.ceil(count / postsPerDay);
  
  const startTime = Date.now();
  const results: {
    scrape?: { webinars: number; products: number; articles: number };
    generate?: { posts: number };
    schedule?: { scheduled: number; failed: number };
    error?: string;
    skipped?: boolean;
  } = {};
  
  try {
    // ========== DUPLICATE GUARD ==========
    // Check if automation already ran recently
    if (!force) {
      const queue = await loadQueue();
      
      if (queue.lastGenerated) {
        const lastRun = new Date(queue.lastGenerated);
        const hoursSinceLastRun = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastRun < MIN_HOURS_BETWEEN_RUNS) {
          console.log(`⏭️ Skipping automation -- last run was ${hoursSinceLastRun.toFixed(1)}h ago (min ${MIN_HOURS_BETWEEN_RUNS}h). Use ?force=true to override.`);
          return NextResponse.json({
            success: true,
            message: `Skipped -- automation already ran ${hoursSinceLastRun.toFixed(1)}h ago`,
            lastGenerated: queue.lastGenerated,
            hoursSinceLastRun: Math.round(hoursSinceLastRun * 10) / 10,
            minHours: MIN_HOURS_BETWEEN_RUNS,
            hint: 'Use ?force=true to override this check',
            results: { skipped: true },
          });
        }
      }
      
      // Also check if there are already pending/scheduled posts for the future
      const now = new Date();
      const futurePosts = queue.posts.filter(p => 
        (p.status === 'pending' || p.status === 'scheduled') &&
        new Date(p.scheduledFor) > now
      );
      if (futurePosts.length >= count) {
        console.log(`⏭️ Skipping -- already ${futurePosts.length} future pending/scheduled posts in queue (requested ${count}). Use ?force=true to override.`);
        return NextResponse.json({
          success: true,
          message: `Skipped -- already ${futurePosts.length} future pending/scheduled posts in queue`,
          futurePosts: futurePosts.length,
          hint: 'Use ?force=true to override this check',
          results: { skipped: true },
        });
      }

      // Auto-transition: mark past "scheduled" posts as "posted"
      let transitioned = 0;
      for (const post of queue.posts) {
        if (post.status === 'scheduled' && new Date(post.scheduledFor) < now) {
          post.status = 'posted';
          post.postedAt = post.scheduledFor;
          transitioned++;
        }
      }
      if (transitioned > 0) {
        await saveQueue(queue);
        console.log(`🔄 Auto-transitioned ${transitioned} past scheduled posts to posted`);
      }
    }
    
    console.log(`🚀 Starting automation (count=${count}, force=${force})...`);
    
    // 1. SCRAPE
    console.log('📥 Step 1: Scraping website...');
    const sources = await scrapeAll();
    await saveSources(sources);
    
    results.scrape = {
      webinars: sources.webinars.length,
      products: sources.products.length,
      articles: sources.articles?.length || 0,
    };
    console.log(`✅ Scraped: ${sources.webinars.length} webinars, ${sources.products.length} products, ${sources.articles?.length || 0} articles`);
    
    // 2. GENERATE (s deduplication)
    console.log(`🤖 Step 2: Generating ${count} posts...`);
    const recentPosts = await getRecentPosts(14);
    
    const posts = await generatePosts(sources, { 
      totalPosts: count,
      daysAhead,
      postsPerDay,
    }, recentPosts);
    
    results.generate = { posts: posts.length };
    console.log(`✅ Generated ${posts.length} posts`);
    
    if (posts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No posts generated',
        results,
        duration: Date.now() - startTime,
      });
    }
    
    // 3. SCHEDULE přes Upload Post API
    console.log('📅 Step 3: Scheduling posts via Upload Post...');
    const scheduleResult = await scheduleAllPosts(posts);
    
    results.schedule = {
      scheduled: scheduleResult.scheduled,
      failed: scheduleResult.failed,
    };
    console.log(`✅ Scheduled ${scheduleResult.scheduled} posts, ${scheduleResult.failed} failed`);
    
    // 4. Ulož do queue
    const queue = await loadQueue();
    for (const post of posts) {
      const scheduleResultItem = scheduleResult.results.find(r => r.postId === post.id);
      post.status = scheduleResultItem?.success ? 'scheduled' : 'failed';
      if (scheduleResultItem?.error) {
        post.error = scheduleResultItem.error;
      }
    }
    queue.posts.push(...posts);
    queue.lastGenerated = new Date().toISOString();
    await saveQueue(queue);
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      message: 'Full automation completed',
      results,
      duration,
    });
    
  } catch (error) {
    console.error('Automation error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
      duration: Date.now() - startTime,
    }, { status: 500 });
  }
}

// GET -- Vercel cron calls this every Monday at 6:00 AM
export async function GET(request: Request) {
  return runAutomation(request);
}

// POST -- manual trigger from dashboard or curl
export async function POST(request: Request) {
  return runAutomation(request);
}
