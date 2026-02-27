/**
 * API Route: Scrape aibility.cz
 * 
 * GET /api/scrape - Scrape webináře, produkty, blog články, quotes
 */

import { NextResponse } from 'next/server';
import { scrapeAll } from '@/lib/scraper';
import { saveSources } from '@/lib/queue';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('Warning: Missing or invalid CRON_SECRET');
  }
  
  try {
    console.log('🔍 Starting scrape...');
    
    const sources = await scrapeAll();
    await saveSources(sources);
    
    // Count testimonials across products
    const testimonialCount = sources.products.reduce(
      (sum, p) => sum + (p.testimonials?.length || 0), 0
    );
    
    return NextResponse.json({
      success: true,
      message: 'Scrape completed',
      stats: {
        webinars: sources.webinars.length,
        products: sources.products.length,
        articles: sources.articles.length,
        testimonials: testimonialCount,
        quotes: sources.quotes.length,
        scrapedAt: sources.scrapedAt,
      },
    });
    
  } catch (error) {
    console.error('Scrape error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
