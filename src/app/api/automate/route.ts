/**
 * API Route: Full Automation
 * 
 * POST /api/automate - Kompletní automatizace: scrape → generate → schedule
 * 
 * Toto je hlavní cron endpoint, který se spouští 1× týdně:
 * 1. Scrape webu (webináře, produkty, články)
 * 2. Generování postů na příští týden
 * 3. Naplánování všech postů přes Upload Post API
 */

import { NextResponse } from 'next/server';
import { scrapeAll } from '@/lib/scraper';
import { generatePosts } from '@/lib/generator';
import { scheduleAllPosts } from '@/lib/poster';
import { saveSources, loadQueue, saveQueue } from '@/lib/queue';

export const maxDuration = 300; // 5 minut pro celou automatizaci

export async function POST(request: Request) {
  // Ověř CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('Warning: Missing or invalid CRON_SECRET');
  }
  
  const startTime = Date.now();
  const results: {
    scrape?: { webinars: number; products: number; articles: number };
    generate?: { posts: number };
    schedule?: { scheduled: number; failed: number };
    error?: string;
  } = {};
  
  try {
    console.log('🚀 Starting full automation...');
    
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
    
    // 2. GENERATE - 14 postů na týden (2 denně)
    console.log('🤖 Step 2: Generating posts...');
    const posts = await generatePosts(sources, { 
      totalPosts: 14,
      daysAhead: 7,
      postsPerDay: 2,
    });
    
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
    
    // 3. SCHEDULE - naplánuj všechny přes Upload Post API
    console.log('📅 Step 3: Scheduling posts via Upload Post...');
    const scheduleResult = await scheduleAllPosts(posts);
    
    results.schedule = {
      scheduled: scheduleResult.scheduled,
      failed: scheduleResult.failed,
    };
    console.log(`✅ Scheduled ${scheduleResult.scheduled} posts, ${scheduleResult.failed} failed`);
    
    // 4. Ulož posty do queue (pro přehled v dashboardu)
    const queue = await loadQueue();
    for (const post of posts) {
      const scheduleResultItem = scheduleResult.results.find(r => r.postId === post.id);
      // Označit jako 'scheduled' pokud úspěšně naplánováno, jinak 'failed'
      post.status = scheduleResultItem?.success ? 'scheduled' : 'failed';
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

export async function GET() {
  return NextResponse.json({
    info: 'Full automation endpoint',
    description: 'Scrape → Generate → Schedule all posts',
    usage: 'POST /api/automate',
    schedule: 'Runs weekly via Vercel Cron',
  });
}
