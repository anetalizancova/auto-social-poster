/**
 * Queue Management with Redis Storage
 * 
 * Správa fronty postů s persistentním Redis storage
 */

import { createClient, RedisClientType } from 'redis';
import type { PostsQueue, GeneratedPost, ContentSources } from './types';

// Redis keys
const QUEUE_KEY = 'auto-poster:queue';
const SOURCES_KEY = 'auto-poster:sources';

// Singleton Redis client
let redis: RedisClientType | null = null;

/**
 * Get Redis client (singleton pattern)
 */
async function getRedis(): Promise<RedisClientType> {
  if (redis && redis.isOpen) {
    return redis;
  }

  const url = process.env.REDIS_URL;
  
  if (!url) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  redis = createClient({ url });
  
  redis.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  await redis.connect();
  return redis;
}

/**
 * Načti frontu postů z Redis
 */
export async function loadQueue(): Promise<PostsQueue> {
  try {
    const client = await getRedis();
    const data = await client.get(QUEUE_KEY);
    
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading queue from Redis:', error);
  }
  
  // Vrať prázdnou frontu jako fallback
  return {
    posts: [],
    lastGenerated: '',
    lastPosted: '',
  };
}

/**
 * Ulož frontu postů do Redis
 */
export async function saveQueue(queue: PostsQueue): Promise<void> {
  try {
    const client = await getRedis();
    await client.set(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Error saving queue to Redis:', error);
    throw error;
  }
}

/**
 * Přidej posty do fronty
 */
export async function addToQueue(posts: GeneratedPost[]): Promise<PostsQueue> {
  const queue = await loadQueue();
  
  // Přidej nové posty
  queue.posts.push(...posts);
  
  // Seřaď podle scheduled time
  queue.posts.sort((a, b) => 
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
  
  queue.lastGenerated = new Date().toISOString();
  
  await saveQueue(queue);
  return queue;
}

/**
 * Získej další post k publikaci
 */
export async function getNextPost(): Promise<GeneratedPost | null> {
  const queue = await loadQueue();
  const now = new Date();
  
  // Najdi první pending post, jehož čas už nastal
  const readyPost = queue.posts.find(post => 
    post.status === 'pending' && 
    new Date(post.scheduledFor) <= now
  );
  
  return readyPost || null;
}

/**
 * Aktualizuj status postu
 */
export async function updatePostStatus(
  postId: string,
  status: GeneratedPost['status'],
  updates?: Partial<GeneratedPost>
): Promise<void> {
  const queue = await loadQueue();
  
  const postIndex = queue.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) return;
  
  queue.posts[postIndex] = {
    ...queue.posts[postIndex],
    ...updates,
    status,
  };
  
  if (status === 'posted') {
    queue.lastPosted = new Date().toISOString();
  }
  
  await saveQueue(queue);
}

/**
 * Získej statistiky fronty
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  posted: number;
  failed: number;
  nextPost: GeneratedPost | null;
  todayPosts: GeneratedPost[];
  tomorrowPosts: GeneratedPost[];
}> {
  const queue = await loadQueue();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  
  const todayPosts = queue.posts.filter(post => {
    const postDate = new Date(post.scheduledFor);
    return postDate >= today && postDate < tomorrow;
  });
  
  const tomorrowPosts = queue.posts.filter(post => {
    const postDate = new Date(post.scheduledFor);
    return postDate >= tomorrow && postDate < dayAfter;
  });
  
  const nextPost = queue.posts.find(p => p.status === 'pending') || null;
  
  return {
    total: queue.posts.length,
    pending: queue.posts.filter(p => p.status === 'pending').length,
    posted: queue.posts.filter(p => p.status === 'posted').length,
    failed: queue.posts.filter(p => p.status === 'failed').length,
    nextPost,
    todayPosts,
    tomorrowPosts,
  };
}

/**
 * Vyčisti staré posty (starší než 30 dní)
 */
export async function cleanOldPosts(): Promise<number> {
  const queue = await loadQueue();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const originalCount = queue.posts.length;
  
  queue.posts = queue.posts.filter(post => 
    post.status === 'pending' || 
    new Date(post.scheduledFor) > thirtyDaysAgo
  );
  
  const removedCount = originalCount - queue.posts.length;
  
  if (removedCount > 0) {
    await saveQueue(queue);
  }
  
  return removedCount;
}

/**
 * Načti content sources z Redis
 */
export async function loadSources(): Promise<ContentSources> {
  try {
    const client = await getRedis();
    const data = await client.get(SOURCES_KEY);
    
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading sources from Redis:', error);
  }
  
  return {
    webinars: [],
    products: [],
    quotes: [],
    scrapedAt: '',
  };
}

/**
 * Ulož content sources do Redis
 */
export async function saveSources(sources: ContentSources): Promise<void> {
  try {
    const client = await getRedis();
    await client.set(SOURCES_KEY, JSON.stringify(sources));
  } catch (error) {
    console.error('Error saving sources to Redis:', error);
    throw error;
  }
}
