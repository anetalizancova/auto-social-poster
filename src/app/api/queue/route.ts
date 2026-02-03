/**
 * API Route: Queue management
 * 
 * GET /api/queue - Získej frontu postů
 * DELETE /api/queue?id=xxx - Smaž post z fronty
 */

import { NextResponse } from 'next/server';
import { loadQueue, saveQueue, getQueueStats } from '@/lib/queue';

export async function GET() {
  try {
    const queue = await loadQueue();
    const stats = await getQueueStats();
    
    return NextResponse.json({
      success: true,
      stats,
      posts: queue.posts,
      lastGenerated: queue.lastGenerated,
      lastPosted: queue.lastPosted,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('id');
    
    if (!postId) {
      return NextResponse.json({
        success: false,
        error: 'Post ID required',
      }, { status: 400 });
    }
    
    const queue = await loadQueue();
    const originalLength = queue.posts.length;
    
    queue.posts = queue.posts.filter(p => p.id !== postId);
    
    if (queue.posts.length === originalLength) {
      return NextResponse.json({
        success: false,
        error: 'Post not found',
      }, { status: 404 });
    }
    
    await saveQueue(queue);
    
    return NextResponse.json({
      success: true,
      message: 'Post deleted',
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
