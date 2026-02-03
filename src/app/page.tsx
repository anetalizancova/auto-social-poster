'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Post {
  id: string;
  type: string;
  content_x: string;
  content_threads: string;
  platform: 'x' | 'threads';
  scheduledFor: string;
  status: 'pending' | 'scheduled' | 'posted' | 'failed';
  sourceUrl?: string;   // Link v postu (CTA)
  postUrl?: string;     // URL publikovaného postu
  error?: string;
  createdAt: string;
}

interface QueueStats {
  total: number;
  pending: number;
  scheduled: number;
  posted: number;
  failed: number;
  nextPost: Post | null;
  todayPosts: Post[];
  tomorrowPosts: Post[];
}

interface QueueData {
  success: boolean;
  stats: QueueStats;
  posts: Post[];
  lastGenerated: string;
  lastPosted: string;
}

const TYPE_LABELS: Record<string, string> = {
  webinar_invite: '📅 Webinář',
  webinar_reminder: '⏰ Reminder',
  product_benefit: '💎 Benefit',
  product_promo: '🛍️ Promo',
  product_cta: '🎯 CTA',
  blog_insight: '📝 Blog',
  blog_quote: '📖 Článek',
  blog_tip: '💡 Blog tip',
  testimonial: '💬 Recenze',
  brand_mission: '🚀 Brand',
  ai_tip: '🤖 AI Tip',
  ai_insight: '🧠 AI Insight',
  thought_leadership: '✨ Expert',
  quote: '💬 Quote',
  tip: '💡 Tip',
  highlight: '✨ Highlight',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  posted: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const PLATFORM_ICONS: Record<string, string> = {
  x: '𝕏',
  threads: '🧵',
};

export default function Dashboard() {
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setQueue(data);
      setError(null);
    } catch (err) {
      setError('Nepodařilo se načíst frontu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleScrape = async () => {
    setActionLoading('scrape');
    try {
      const res = await fetch('/api/scrape');
      const data = await res.json();
      if (data.success) {
        alert(`✅ Scrape hotový!\n\nWebináře: ${data.stats.webinars}\nProdukty: ${data.stats.products}\nČlánky: ${data.stats.articles || 0}\nTestimonials: ${data.stats.testimonials || 0}\nQuotes: ${data.stats.quotes}`);
      } else {
        alert(`❌ Chyba: ${data.error}`);
      }
    } catch {
      alert('❌ Chyba při scrape');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerate = async () => {
    setActionLoading('generate');
    try {
      const res = await fetch('/api/generate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Vygenerováno ${data.stats.generated} postů!`);
        fetchQueue();
      } else {
        alert(`❌ Chyba: ${data.error}`);
      }
    } catch {
      alert('❌ Chyba při generování');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePostNow = async () => {
    setActionLoading('post');
    try {
      const res = await fetch('/api/post', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.published) {
        alert(`✅ Publikováno na ${data.post.platform}!\n\n${data.post.url || ''}`);
        fetchQueue();
      } else if (data.success && !data.published) {
        alert('ℹ️ Žádný post k publikaci');
      } else {
        alert(`❌ Chyba: ${data.error}`);
      }
    } catch {
      alert('❌ Chyba při publikování');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Opravdu smazat tento post?')) return;
    
    try {
      const res = await fetch(`/api/queue?id=${postId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchQueue();
      } else {
        alert(`❌ Chyba: ${data.error}`);
      }
    } catch {
      alert('❌ Chyba při mazání');
    }
  };

  const handleClearQueue = async () => {
    if (!confirm('Opravdu smazat VŠECHNY pending posty?')) return;
    
    try {
      const res = await fetch('/api/queue?clearAll=true', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Smazáno ${data.deleted} postů`);
        fetchQueue();
      } else {
        alert(`❌ Chyba: ${data.error}`);
      }
    } catch {
      alert('❌ Chyba při mazání');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEEE d. MMMM HH:mm', { locale: cs });
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'HH:mm', { locale: cs });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Načítám...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Auto Social Poster</h1>
          <p className="text-gray-500">Aibility X & Threads</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-yellow-600">{queue?.stats.pending || 0}</div>
            <div className="text-sm text-gray-500">Čekající</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-blue-600">{queue?.stats.scheduled || 0}</div>
            <div className="text-sm text-gray-500">Naplánováno</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{queue?.stats.posted || 0}</div>
            <div className="text-sm text-gray-500">Publikováno</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-red-600">{queue?.stats.failed || 0}</div>
            <div className="text-sm text-gray-500">Chyby</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-3xl font-bold text-gray-900">{queue?.stats.total || 0}</div>
            <div className="text-sm text-gray-500">Celkem</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={handleScrape}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === 'scrape' ? 'Scrapuji...' : '🔍 Scrape web'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {actionLoading === 'generate' ? 'Generuji...' : '🤖 Generovat posty'}
          </button>
          <button
            onClick={handlePostNow}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading === 'post' ? 'Publikuji...' : '📤 Publikovat teď'}
          </button>
          <button
            onClick={fetchQueue}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            🔄 Obnovit
          </button>
          {((queue?.stats.pending || 0) + (queue?.stats.scheduled || 0)) > 0 && (
            <button
              onClick={handleClearQueue}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
            >
              🗑️ Vymazat frontu
            </button>
          )}
        </div>

        {/* Next Post */}
        {queue?.stats.nextPost && (
          <div className="bg-white rounded-lg p-4 shadow-sm mb-8 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500 mb-1">Příští post</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{PLATFORM_ICONS[queue.stats.nextPost.platform]}</span>
              <span className="font-medium">{formatDate(queue.stats.nextPost.scheduledFor)}</span>
            </div>
            <p className="text-gray-700">
              {queue.stats.nextPost.platform === 'x' 
                ? queue.stats.nextPost.content_x 
                : queue.stats.nextPost.content_threads}
            </p>
          </div>
        )}

        {/* Today */}
        {queue?.stats.todayPosts && queue.stats.todayPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">📅 Dnes</h2>
            <div className="space-y-3">
              {queue.stats.todayPosts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Tomorrow */}
        {queue?.stats.tomorrowPosts && queue.stats.tomorrowPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">📆 Zítra</h2>
            <div className="space-y-3">
              {queue.stats.tomorrowPosts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* All Posts */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📋 Všechny posty ({queue?.posts.length || 0})</h2>
          <div className="space-y-3">
            {queue?.posts.slice(0, 20).map(post => (
              <PostCard key={post.id} post={post} onDelete={handleDelete} showDate />
            ))}
            {(queue?.posts.length || 0) > 20 && (
              <p className="text-gray-500 text-center py-4">
                ... a dalších {(queue?.posts.length || 0) - 20} postů
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-8 border-t text-center text-gray-400 text-sm">
          <p>Naposledy generováno: {queue?.lastGenerated ? formatDate(queue.lastGenerated) : 'nikdy'}</p>
          <p>Naposledy publikováno: {queue?.lastPosted ? formatDate(queue.lastPosted) : 'nikdy'}</p>
        </div>
      </div>
    </div>
  );
}

function PostCard({ 
  post, 
  onDelete,
  showDate = false 
}: { 
  post: Post; 
  onDelete: (id: string) => void;
  showDate?: boolean;
}) {
  const content = post.platform === 'x' ? post.content_x : post.content_threads;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{PLATFORM_ICONS[post.platform]}</span>
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[post.status]}`}>
            {post.status}
          </span>
          <span className="text-xs text-gray-400">
            {TYPE_LABELS[post.type] || post.type}
          </span>
          {showDate && (
            <span className="text-xs text-gray-400">
              {format(new Date(post.scheduledFor), 'd.M. HH:mm')}
            </span>
          )}
          {!showDate && (
            <span className="text-xs text-gray-400">
              {format(new Date(post.scheduledFor), 'HH:mm')}
            </span>
          )}
        </div>
        {post.status === 'pending' && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-gray-400 hover:text-red-500 text-sm"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-gray-700 text-sm whitespace-pre-wrap">{content}</p>
      {post.sourceUrl && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-gray-400 text-xs">🔗</span>
          <a 
            href={post.sourceUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 text-xs hover:underline truncate max-w-[200px]"
          >
            {post.sourceUrl.replace('https://aibility.cz', '')}
          </a>
        </div>
      )}
      {post.postUrl && (
        <a 
          href={post.postUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-green-500 text-xs hover:underline mt-2 inline-block"
        >
          ✅ Zobrazit publikovaný post →
        </a>
      )}
      {post.error && (
        <p className="text-red-500 text-xs mt-2">Chyba: {post.error}</p>
      )}
    </div>
  );
}
// Trigger deploy Tue Feb  3 18:50:51 CET 2026
