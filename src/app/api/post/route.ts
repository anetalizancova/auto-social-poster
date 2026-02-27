/**
 * API Route: Post to social media
 * 
 * POST /api/post - Publikuj další post z fronty
 * POST /api/post?scheduleId=xxx - Naplánuj konkrétní post z fronty do Upload Post
 * GET /api/post - Získej status Upload Post API
 */

import { NextResponse } from 'next/server';
import { publishPost, checkApiStatus } from '@/lib/poster';
import { getNextPost, getFirstPendingPost, updatePostStatus, getQueueStats, loadQueue } from '@/lib/queue';

export async function POST(request: Request) {
  // Ověř CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('Warning: Missing or invalid CRON_SECRET');
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const scheduleId = searchParams.get('scheduleId');
    
    // Schedule specific post by ID (naplánovat do Upload Post)
    if (scheduleId) {
      console.log(`📅 Scheduling specific post: ${scheduleId}`);
      const queue = await loadQueue();
      const targetPost = queue.posts.find(p => p.id === scheduleId);
      
      if (!targetPost) {
        return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
      }
      
      const result = await publishPost(targetPost, true); // schedule for later
      
      if (result.success) {
        await updatePostStatus(targetPost.id, 'scheduled');
        return NextResponse.json({
          success: true,
          message: 'Post scheduled in Upload Post',
          post: { id: targetPost.id, platform: targetPost.platform, scheduledFor: targetPost.scheduledFor },
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.error,
        }, { status: 500 });
      }
    }
    
    console.log(`📤 Looking for post to publish... (force: ${force})`);
    
    // Získej další post k publikaci
    const post = force ? await getFirstPendingPost() : await getNextPost();
    
    if (!post) {
      return NextResponse.json({
        success: true,
        message: 'No posts ready to publish',
        published: false,
      });
    }
    
    console.log(`📤 Publishing to ${post.platform}: ${post.content_x.substring(0, 50)}...`);
    
    // Publikuj
    const result = await publishPost(post);
    
    if (result.success) {
      // Aktualizuj status na posted
      await updatePostStatus(post.id, 'posted', {
        postedAt: new Date().toISOString(),
        postUrl: result.postUrl,
      });
      
      return NextResponse.json({
        success: true,
        message: 'Post published successfully',
        published: true,
        post: {
          id: post.id,
          platform: post.platform,
          type: post.type,
          url: result.postUrl,
        },
      });
    } else {
      // Aktualizuj status na failed
      await updatePostStatus(post.id, 'failed', {
        error: result.error,
      });
      
      return NextResponse.json({
        success: false,
        message: 'Failed to publish post',
        error: result.error,
        post: {
          id: post.id,
          platform: post.platform,
          type: post.type,
        },
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Post error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Zkontroluj API status
    const apiStatus = await checkApiStatus();
    const queueStats = await getQueueStats();
    
    return NextResponse.json({
      success: true,
      api: apiStatus,
      queue: queueStats,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
