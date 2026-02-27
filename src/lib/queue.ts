/**
 * Queue Management with Redis Storage v3
 * 
 * Správa fronty postů s persistentním Redis storage.
 * Nově: updatePost pro inline editing, getRecentPosts pro deduplication.
 */

import { createClient, RedisClientType } from 'redis';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PostsQueue, GeneratedPost, ContentSources } from './types';

// Redis keys
const QUEUE_KEY = 'auto-poster:queue';
const SOURCES_KEY = 'auto-poster:sources';

// JSON file fallback paths (for local dev without Redis)
const DATA_DIR = join(process.cwd(), 'src', 'data');
const QUEUE_FILE = join(DATA_DIR, 'posts-queue.json');
const SOURCES_FILE = join(DATA_DIR, 'content-sources.json');

// Check if Redis is available
const USE_REDIS = !!process.env.REDIS_URL;

// Singleton Redis client
let redis: RedisClientType | null = null;

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

// JSON file helpers for local dev
function readJsonFile<T>(filePath: string, defaultVal: T): T {
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return defaultVal;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

/**
 * Načti frontu postů (Redis nebo JSON file)
 */
export async function loadQueue(): Promise<PostsQueue> {
  const defaultQueue: PostsQueue = { posts: [], lastGenerated: '', lastPosted: '' };
  
  if (!USE_REDIS) {
    return readJsonFile(QUEUE_FILE, defaultQueue);
  }
  
  try {
    const client = await getRedis();
    const data = await client.get(QUEUE_KEY);
    if (data) return JSON.parse(data);
  } catch (error) {
    console.error('Error loading queue from Redis:', error);
  }
  
  return defaultQueue;
}

/**
 * Ulož frontu postů (Redis nebo JSON file)
 */
export async function saveQueue(queue: PostsQueue): Promise<void> {
  if (!USE_REDIS) {
    writeJsonFile(QUEUE_FILE, queue);
    return;
  }
  
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
 * Získej nedávné posty pro deduplication (posledních N dní)
 */
export async function getRecentPosts(days: number = 14): Promise<GeneratedPost[]> {
  const queue = await loadQueue();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return queue.posts.filter(post => 
    new Date(post.createdAt) > cutoff
  );
}

/**
 * Aktualizuj post (pro inline editing v dashboardu)
 */
export async function updatePost(
  postId: string,
  updates: Partial<Pick<GeneratedPost, 'content_x' | 'content_threads' | 'status' | 'edited' | 'postedAt' | 'postUrl' | 'error'>>
): Promise<GeneratedPost | null> {
  const queue = await loadQueue();
  
  const postIndex = queue.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) return null;
  
  const post = queue.posts[postIndex];
  
  // Editovat content lze u všech kromě posted (pending, scheduled, failed)
  if ((updates.content_x || updates.content_threads) && post.status === 'posted') {
    return null;
  }
  
  queue.posts[postIndex] = {
    ...post,
    ...updates,
  };
  
  await saveQueue(queue);
  return queue.posts[postIndex];
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
 * Získej další post k publikaci
 */
export async function getNextPost(): Promise<GeneratedPost | null> {
  const queue = await loadQueue();
  const now = new Date();
  
  const readyPost = queue.posts.find(post => 
    post.status === 'pending' && 
    new Date(post.scheduledFor) <= now
  );
  
  return readyPost || null;
}

/**
 * Získej první pending post (pro manuální publikaci)
 */
export async function getFirstPendingPost(): Promise<GeneratedPost | null> {
  const queue = await loadQueue();
  
  const pendingPosts = queue.posts
    .filter(post => post.status === 'pending')
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  
  return pendingPosts[0] || null;
}

/**
 * Získej statistiky fronty
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  scheduled: number;
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
  
  const upcomingPosts = queue.posts
    .filter(p => p.status === 'pending' || p.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  const nextPost = upcomingPosts[0] || null;
  
  return {
    total: queue.posts.length,
    scheduled: queue.posts.filter(p => p.status === 'scheduled').length,
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
 * Načti content sources (Redis nebo JSON file)
 */
export async function loadSources(): Promise<ContentSources> {
  const defaultSources: ContentSources = {
    webinars: [], products: [], articles: [], quotes: [], scrapedAt: '',
  };
  
  if (!USE_REDIS) {
    return readJsonFile(SOURCES_FILE, defaultSources);
  }
  
  try {
    const client = await getRedis();
    const data = await client.get(SOURCES_KEY);
    if (data) return JSON.parse(data);
  } catch (error) {
    console.error('Error loading sources from Redis:', error);
  }
  
  return defaultSources;
}

/**
 * Ulož content sources (Redis nebo JSON file)
 */
export async function saveSources(sources: ContentSources): Promise<void> {
  if (!USE_REDIS) {
    writeJsonFile(SOURCES_FILE, sources);
    return;
  }
  
  try {
    const client = await getRedis();
    await client.set(SOURCES_KEY, JSON.stringify(sources));
  } catch (error) {
    console.error('Error saving sources to Redis:', error);
    throw error;
  }
}
