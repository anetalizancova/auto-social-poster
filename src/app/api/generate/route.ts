/**
 * API Route: Generate posts
 * 
 * POST /api/generate - Vygeneruj posty do fronty (s deduplication)
 */

import { NextResponse } from 'next/server';
import { generatePosts } from '@/lib/generator';
import { loadSources, addToQueue, loadQueue, getRecentPosts } from '@/lib/queue';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '14');
    
    let config: Record<string, unknown> = {
      totalPosts: count,
      postsPerDay: Math.min(count, 2),
      daysAhead: Math.ceil(count / 2),
    };
    
    try {
      const body = await request.json();
      config = { ...config, ...body.config };
    } catch {
      // Bez body configu
    }
    
    console.log('🤖 Starting post generation...');
    
    // Načti sources
    const sources = await loadSources();
    
    const totalSources = 
      sources.webinars.length + 
      sources.products.length + 
      (sources.articles?.length || 0) + 
      sources.quotes.length;
    
    if (totalSources === 0) {
      return NextResponse.json({
        success: false,
        error: 'No content sources found. Run /api/scrape first.',
      }, { status: 400 });
    }
    
    // Načti nedávné posty pro deduplication
    const recentPosts = await getRecentPosts(14);
    console.log(`📊 Recent posts for dedup: ${recentPosts.length}`);
    
    // Najdi poslední naplánované datum a navázej
    const queue = await loadQueue();
    const pendingPosts = queue.posts.filter(p => p.status === 'pending');
    
    if (pendingPosts.length > 0) {
      const lastScheduled = pendingPosts
        .map(p => new Date(p.scheduledFor))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      
      const nextDay = new Date(lastScheduled);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      
      config = { ...config, startDate: nextDay.toISOString() };
      console.log(`📅 Continuing from: ${nextDay.toISOString()}`);
    }
    
    // Generuj posty s deduplication
    const posts = await generatePosts(sources, config, recentPosts);
    
    // Přidej do fronty
    const updatedQueue = await addToQueue(posts);
    
    return NextResponse.json({
      success: true,
      message: 'Posts generated',
      stats: {
        generated: posts.length,
        totalInQueue: updatedQueue.posts.filter(p => p.status === 'pending').length,
      },
    });
    
  } catch (error) {
    console.error('Generate error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const queue = await loadQueue();
    const sources = await loadSources();
    
    return NextResponse.json({
      success: true,
      queue: {
        total: queue.posts.length,
        pending: queue.posts.filter(p => p.status === 'pending').length,
        posted: queue.posts.filter(p => p.status === 'posted').length,
        lastGenerated: queue.lastGenerated,
      },
      sources: {
        webinars: sources.webinars.length,
        products: sources.products.length,
        articles: sources.articles?.length || 0,
        quotes: sources.quotes.length,
        scrapedAt: sources.scrapedAt,
      },
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
