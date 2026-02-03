/**
 * API Route: Generate posts
 * 
 * POST /api/generate - Vygeneruj posty do fronty
 */

import { NextResponse } from 'next/server';
import { generatePosts } from '@/lib/generator';
import { loadSources, addToQueue, loadQueue } from '@/lib/queue';

export async function POST(request: Request) {
  try {
    // Volitelně načti config z body
    let config = {};
    try {
      const body = await request.json();
      config = body.config || {};
    } catch {
      // Bez configu, použij default
    }
    
    console.log('🤖 Starting post generation...');
    
    // Načti sources
    const sources = await loadSources();
    
    const totalSources = 
      sources.webinars.length + 
      sources.products.length + 
      (sources.articles?.length || 0) + 
      (sources.testimonials?.length || 0) +
      sources.quotes.length;
    
    if (totalSources === 0) {
      return NextResponse.json({
        success: false,
        error: 'No content sources found. Run /api/scrape first.',
      }, { status: 400 });
    }
    
    // Najdi poslední naplánované datum v queue a navázej
    const queue = await loadQueue();
    const pendingPosts = queue.posts.filter(p => p.status === 'pending');
    
    if (pendingPosts.length > 0) {
      const lastScheduled = pendingPosts
        .map(p => new Date(p.scheduledFor))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      
      // Začni od dalšího dne po posledním naplánovaném
      const nextDay = new Date(lastScheduled);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      
      config = { ...config, startDate: nextDay.toISOString() };
      console.log(`📅 Continuing from: ${nextDay.toISOString()}`);
    }
    
    // Generuj posty
    const posts = await generatePosts(sources, config);
    
    // Přidej do fronty
    const queue = await addToQueue(posts);
    
    return NextResponse.json({
      success: true,
      message: 'Posts generated',
      stats: {
        generated: posts.length,
        totalInQueue: queue.posts.filter(p => p.status === 'pending').length,
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
  // GET vrátí stav fronty
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
        testimonials: sources.testimonials?.length || 0,
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
