/**
 * API Route: Queue management
 * 
 * GET /api/queue - Získej frontu postů
 * PATCH /api/queue - Edituj post (inline editing)
 * PUT /api/queue?fixStatus=true - Fix failed→scheduled for posts that are in Upload Post
 * DELETE /api/queue?id=xxx - Smaž post z fronty
 */

import { NextResponse } from 'next/server';
import { loadQueue, saveQueue, getQueueStats, updatePost } from '@/lib/queue';

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

/**
 * PATCH - Edituj post (inline editing v dashboardu)
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, content_x, content_threads } = body;
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Post ID is required',
      }, { status: 400 });
    }
    
    if (!content_x && !content_threads) {
      return NextResponse.json({
        success: false,
        error: 'At least one of content_x or content_threads is required',
      }, { status: 400 });
    }
    
    const updated = await updatePost(id, {
      ...(content_x !== undefined && { content_x }),
      ...(content_threads !== undefined && { content_threads }),
      edited: true,
    });
    
    if (!updated) {
      return NextResponse.json({
        success: false,
        error: 'Post not found or already posted (posted posts cannot be edited)',
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Post updated',
      post: updated,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Create a manual post and add to queue
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content_x, content_threads, platform, scheduledFor, type, sourceUrl } = body;

    if (!content_x || !content_threads || !platform || !scheduledFor) {
      return NextResponse.json({
        success: false,
        error: 'Required: content_x, content_threads, platform, scheduledFor',
      }, { status: 400 });
    }

    const { v4: uuid } = await import('uuid');
    const newPost = {
      id: uuid(),
      type: type || 'brand_mission',
      content_x,
      content_threads,
      platform,
      scheduledFor,
      status: 'pending' as const,
      sourceUrl,
      angle: 'manual',
      edited: false,
      createdAt: new Date().toISOString(),
    };

    const queue = await loadQueue();
    queue.posts.push(newPost);
    await saveQueue(queue);

    return NextResponse.json({
      success: true,
      message: 'Post created',
      post: newPost,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * PUT - Bulk fix: update status of failed posts to scheduled
 * Use: PUT /api/queue?fixStatus=true
 */
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fixStatus = searchParams.get('fixStatus');
    
    if (fixStatus === 'true') {
      const queue = await loadQueue();
      let fixed = 0;
      
      for (const post of queue.posts) {
        if (post.status === 'failed' && post.error === 'Unknown error') {
          post.status = 'scheduled';
          delete post.error;
          fixed++;
        }
      }
      
      await saveQueue(queue);
      
      return NextResponse.json({
        success: true,
        message: `Fixed ${fixed} posts from 'failed' to 'scheduled'`,
        fixed,
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Use ?fixStatus=true',
    }, { status: 400 });
    
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
    const clearAll = searchParams.get('clearAll');
    
    const queue = await loadQueue();
    
    // Clear all posts
    if (clearAll === 'true') {
      const deletedCount = queue.posts.length;
      queue.posts = [];
      await saveQueue(queue);
      
      return NextResponse.json({
        success: true,
        message: 'Queue cleared completely',
        deleted: deletedCount,
      });
    }
    
    // Delete single post
    if (!postId) {
      return NextResponse.json({
        success: false,
        error: 'Post ID required',
      }, { status: 400 });
    }
    
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
