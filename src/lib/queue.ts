/**
 * Queue Management
 * 
 * Správa fronty postů
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { PostsQueue, GeneratedPost, ContentSources } from './types';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'posts-queue.json');
const SOURCES_FILE = path.join(DATA_DIR, 'content-sources.json');

/**
 * Zajisti že data složka existuje
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Složka už existuje
  }
}

/**
 * Načti frontu postů
 */
export async function loadQueue(): Promise<PostsQueue> {
  await ensureDataDir();
  
  try {
    const data = await fs.readFile(QUEUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Soubor neexistuje, vrať prázdnou frontu
    return {
      posts: [],
      lastGenerated: '',
      lastPosted: '',
    };
  }
}

/**
 * Ulož frontu postů
 */
export async function saveQueue(queue: PostsQueue): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
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
 * Načti content sources
 */
export async function loadSources(): Promise<ContentSources> {
  await ensureDataDir();
  
  try {
    const data = await fs.readFile(SOURCES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      webinars: [],
      products: [],
      quotes: [],
      scrapedAt: '',
    };
  }
}

/**
 * Ulož content sources
 */
export async function saveSources(sources: ContentSources): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2));
}
