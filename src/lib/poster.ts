/**
 * Upload Post API Wrapper
 * 
 * Publikuje posty na X a Threads
 */

import type { GeneratedPost, Platform } from './types';

const API_URL = 'https://api.upload-post.com/api';
const API_KEY = process.env.UPLOAD_POST_API_KEY;
const USER = process.env.UPLOAD_POST_USER || 'Aibility';

interface UploadResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

/**
 * Publikuj post na platformu
 */
export async function publishPost(post: GeneratedPost): Promise<UploadResult> {
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
    
    const response = await fetch(`${API_URL}/upload_text`, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${API_KEY}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Získej URL postu z odpovědi
      const platformResult = data.results?.[post.platform];
      
      if (platformResult?.success) {
        return {
          success: true,
          postUrl: platformResult.url,
        };
      }
      
      return {
        success: false,
        error: platformResult?.error || 'Unknown error',
      };
    }
    
    return {
      success: false,
      error: data.message || 'Upload failed',
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
