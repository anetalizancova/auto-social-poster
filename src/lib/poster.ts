/**
 * Upload Post API Wrapper
 * 
 * Publikuje posty na X a Threads
 */

import type { GeneratedPost } from './types';

const API_URL = 'https://api.upload-post.com/api';
const API_KEY = process.env.UPLOAD_POST_API_KEY;
const USER = process.env.UPLOAD_POST_USER || 'Aibility';

interface UploadResult {
  success: boolean;
  postUrl?: string;
  error?: string;
  scheduled?: boolean;
}

/**
 * Publikuj nebo naplánuj post na platformu
 * @param post - post k publikaci
 * @param scheduleForLater - true = naplánovat na scheduledFor čas, false = publikovat hned
 */
export async function publishPost(post: GeneratedPost, scheduleForLater: boolean = false): Promise<UploadResult> {
  const content = post.platform === 'x' ? post.content_x : post.content_threads;
  
  if (!API_KEY) {
    return { success: false, error: 'UPLOAD_POST_API_KEY not configured' };
  }
  
  if (!content) {
    return { success: false, error: 'No content for platform' };
  }
  
  try {
    // Vytvoř form data
    const formData = new FormData();
    formData.append('user', USER);
    formData.append('platform[]', post.platform);
    formData.append('title', content);
    
    // Pokud chceme naplánovat na později
    if (scheduleForLater && post.scheduledFor) {
      const scheduledDate = new Date(post.scheduledFor);
      // Upload Post API očekává 'scheduled_date' v ISO formátu + timezone
      formData.append('scheduled_date', scheduledDate.toISOString());
      formData.append('timezone', 'Europe/Prague');
      console.log(`📅 Scheduling for: ${scheduledDate.toISOString()} (Europe/Prague)`);
    }
    
    const response = await fetch(`${API_URL}/upload_text`, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${API_KEY}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    console.log(`📤 Upload Post [${response.status}]:`, JSON.stringify(data).substring(0, 500));
    
    // 202 = scheduled successfully (Upload Post returns 202 for scheduled posts)
    if (response.status === 202) {
      return {
        success: true,
        postUrl: data.results?.[post.platform]?.url || data.url || undefined,
        scheduled: true,
      };
    }
    
    // 200 = published immediately
    if (response.ok && (data.success || data.results)) {
      const platformResult = data.results?.[post.platform];
      
      if (platformResult?.success || data.success) {
        return {
          success: true,
          postUrl: platformResult?.url || data.url || undefined,
          scheduled: scheduleForLater,
        };
      }
      
      return {
        success: false,
        error: platformResult?.error || data.error || 'Platform result not successful',
      };
    }
    
    return {
      success: false,
      error: data.message || data.error || `Upload failed (HTTP ${response.status})`,
    };
    
  } catch (error) {
    console.error('Error publishing post:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Publikuj post na obě platformy najednou
 */
export async function publishToBothPlatforms(post: GeneratedPost): Promise<{
  x: UploadResult;
  threads: UploadResult;
}> {
  if (!API_KEY) {
    const error = { success: false, error: 'UPLOAD_POST_API_KEY not configured' };
    return { x: error, threads: error };
  }
  
  try {
    // Vytvoř form data pro obě platformy
    const formData = new FormData();
    formData.append('user', USER);
    formData.append('platform[]', 'x');
    formData.append('platform[]', 'threads');
    formData.append('title', post.content_x); // Použij X verzi jako default
    formData.append('threads_title', post.content_threads); // Threads specifická verze
    
    const response = await fetch(`${API_URL}/upload_text`, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${API_KEY}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    const xResult = data.results?.x || { success: false, error: 'No result' };
    const threadsResult = data.results?.threads || { success: false, error: 'No result' };
    
    return {
      x: {
        success: xResult.success,
        postUrl: xResult.url,
        error: xResult.error,
      },
      threads: {
        success: threadsResult.success,
        postUrl: threadsResult.url,
        error: threadsResult.error,
      },
    };
    
  } catch (error) {
    const errorResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    return { x: errorResult, threads: errorResult };
  }
}

/**
 * Naplánuj všechny pending posty přes Upload Post API
 */
export async function scheduleAllPosts(posts: GeneratedPost[]): Promise<{
  scheduled: number;
  failed: number;
  results: { postId: string; success: boolean; error?: string }[];
}> {
  const results: { postId: string; success: boolean; error?: string }[] = [];
  let scheduled = 0;
  let failed = 0;
  
  for (const post of posts) {
    try {
      const result = await publishPost(post, true); // true = schedule for later
      
      if (result.success) {
        scheduled++;
        results.push({ postId: post.id, success: true });
      } else {
        failed++;
        results.push({ postId: post.id, success: false, error: result.error });
      }
      
      // Malá pauza mezi requesty
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      failed++;
      results.push({ 
        postId: post.id, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  return { scheduled, failed, results };
}

/**
 * Zkontroluj stav API a zbývající uploady
 */
export async function checkApiStatus(): Promise<{
  valid: boolean;
  email?: string;
  plan?: string;
  uploadsRemaining?: number;
  error?: string;
}> {
  if (!API_KEY) {
    return { valid: false, error: 'UPLOAD_POST_API_KEY not configured' };
  }
  
  try {
    const response = await fetch(`${API_URL}/uploadposts/me`, {
      headers: {
        'Authorization': `Apikey ${API_KEY}`,
      },
    });
    
    const data = await response.json();
    
    if (data.success) {
      return {
        valid: true,
        email: data.email,
        plan: data.plan,
      };
    }
    
    return { valid: false, error: data.message };
    
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
