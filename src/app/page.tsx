'use client';

import { useState, useEffect, useCallback } from 'react';

interface Post {
  id: string;
  type: string;
  content_x: string;
  content_threads: string;
  platform: 'x' | 'threads';
  scheduledFor: string;
  status: 'pending' | 'scheduled' | 'posted' | 'failed';
  sourceUrl?: string;
  postUrl?: string;
  error?: string;
  angle?: string;
  edited?: boolean;
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
  product_benefit: '💎 Produkt',
  product_promo: '🛍️ Promo',
  product_cta: '🎯 CTA',
  product_testimonial: '💬 Testimonial',
  blog_tip: '💡 Blog tip',
  blog_insight: '🧠 Blog insight',
  blog_quote: '📖 Blog citát',
  blog_highlight: '📝 Blog highlight',
  brand_mission: '🚀 Brand',
  ai_tip: '🤖 AI Tip',
  ai_insight: '🧠 AI Insight',
  thought_leadership: '✨ Expert',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  posted: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Čekající',
  scheduled: 'Naplánováno',
  posted: 'Publikováno',
  failed: 'Chyba',
};

const PLATFORM_ICONS: Record<string, string> = {
  x: '𝕏',
  threads: '🧵',
};

function formatDatePrague(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', {
      timeZone: 'Europe/Prague',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatShortDatePrague(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', {
      timeZone: 'Europe/Prague',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatTimePrague(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', {
      timeZone: 'Europe/Prague',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export default function Dashboard() {
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setQueue(data);
      setError(null);
    } catch {
      setError('Nepodařilo se načíst frontu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleScrape = async () => {
    setActionLoading('scrape');
    try {
      const res = await fetch('/api/scrape');
      const data = await res.json();
      if (data.success) {
        alert(`Scrape hotový!\n\nWebináře: ${data.stats.webinars}\nProdukty: ${data.stats.products}\nČlánky: ${data.stats.articles || 0}\nTestimonials: ${data.stats.testimonials || 0}\nQuotes: ${data.stats.quotes}`);
      } else {
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při scrape');
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
        alert(`Vygenerováno ${data.stats.generated} postů!`);
        fetchQueue();
      } else {
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při generování');
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
        alert(`Publikováno na ${data.post.platform}!\n\n${data.post.url || ''}`);
        fetchQueue();
      } else if (data.success && !data.published) {
        alert('Žádný post k publikaci');
      } else {
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při publikování');
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
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při mazání');
    }
  };

  const handleEdit = async (postId: string, content_x: string, content_threads: string) => {
    try {
      const res = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, content_x, content_threads }),
      });
      const data = await res.json();
      if (data.success) {
        fetchQueue();
      } else {
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při ukládání');
    }
  };

  const handleClearQueue = async () => {
    if (!confirm('Opravdu smazat VŠECHNY posty z fronty?')) return;
    
    try {
      const res = await fetch('/api/queue?clearAll=true', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`Smazáno ${data.deleted} postů`);
        fetchQueue();
      } else {
        alert(`Chyba: ${data.error}`);
      }
    } catch {
      alert('Chyba při mazání');
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
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={handleScrape}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === 'scrape' ? 'Scrapuji...' : 'Scrape web'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === 'generate' ? 'Generuji...' : 'Generovat posty'}
          </button>
          <button
            onClick={handlePostNow}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === 'post' ? 'Publikuji...' : 'Publikovat ted'}
          </button>
          <button
            onClick={fetchQueue}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
          >
            Obnovit
          </button>
          {((queue?.stats.pending || 0) + (queue?.stats.scheduled || 0)) > 0 && (
            <button
              onClick={handleClearQueue}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
            >
              Vymazat frontu
            </button>
          )}
        </div>

        {/* Next Post */}
        {queue?.stats.nextPost && (
          <div className="bg-white rounded-lg p-4 shadow-sm mb-8 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500 mb-1">Pristi post</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{PLATFORM_ICONS[queue.stats.nextPost.platform]}</span>
              <span className="font-medium">{formatDatePrague(queue.stats.nextPost.scheduledFor)}</span>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Dnes</h2>
            <div className="space-y-3">
              {queue.stats.todayPosts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
            </div>
          </div>
        )}

        {/* Tomorrow */}
        {queue?.stats.tomorrowPosts && queue.stats.tomorrowPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Zitra</h2>
            <div className="space-y-3">
              {queue.stats.tomorrowPosts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
            </div>
          </div>
        )}

        {/* All Posts */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vsechny posty ({queue?.posts.length || 0})</h2>
          <div className="space-y-3">
            {queue?.posts.slice(0, 30).map(post => (
              <PostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} showDate />
            ))}
            {(queue?.posts.length || 0) > 30 && (
              <p className="text-gray-500 text-center py-4">
                ... a dalsich {(queue?.posts.length || 0) - 30} postu
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-8 border-t text-center text-gray-400 text-sm">
          <p>Naposledy generovano: {queue?.lastGenerated ? formatDatePrague(queue.lastGenerated) : 'nikdy'}</p>
          <p>Naposledy publikovano: {queue?.lastPosted ? formatDatePrague(queue.lastPosted) : 'nikdy'}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PostCard s inline editing
// ============================================================

function PostCard({ 
  post, 
  onDelete,
  onEdit,
  showDate = false 
}: { 
  post: Post; 
  onDelete: (id: string) => void;
  onEdit: (id: string, content_x: string, content_threads: string) => void;
  showDate?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editX, setEditX] = useState(post.content_x);
  const [editThreads, setEditThreads] = useState(post.content_threads);
  const [saving, setSaving] = useState(false);
  
  const content = post.platform === 'x' ? post.content_x : post.content_threads;
  const canEdit = post.status !== 'posted'; // Can edit pending, scheduled, and failed
  const canDelete = true; // Can always delete from internal queue
  
  const handleSave = async () => {
    setSaving(true);
    await onEdit(post.id, editX, editThreads);
    setEditing(false);
    setSaving(false);
  };
  
  const handleCancel = () => {
    setEditX(post.content_x);
    setEditThreads(post.content_threads);
    setEditing(false);
  };
  
  const xCount = editX.length;
  const threadsCount = editThreads.length;
  const xOver = xCount > 280;
  const threadsOver = threadsCount > 500;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xl">{PLATFORM_ICONS[post.platform]}</span>
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[post.status]}`}>
            {STATUS_LABELS[post.status] || post.status}
          </span>
          <span className="text-xs text-gray-400">
            {TYPE_LABELS[post.type] || post.type}
          </span>
          {post.edited && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
              edited
            </span>
          )}
          {post.angle && (
            <span className="text-xs text-gray-300">
              {post.angle}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {showDate ? formatShortDatePrague(post.scheduledFor) : formatTimePrague(post.scheduledFor)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-blue-500 text-sm px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
              title="Editovat"
            >
              ✏️
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="text-gray-400 hover:text-red-500 text-sm px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
              title="Smazat"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      
      {/* Content -- normal view */}
      {!editing && (
        <p 
          className={`text-gray-700 text-sm whitespace-pre-wrap ${canEdit ? 'cursor-pointer hover:bg-gray-50 rounded p-1 -m-1' : ''}`}
          onClick={() => canEdit && setEditing(true)}
        >
          {content}
        </p>
      )}
      
      {/* Content -- edit mode */}
      {editing && (
        <div className="space-y-3 mt-2">
          {/* X version */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">𝕏 Twitter</label>
              <span className={`text-xs ${xOver ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                {xCount}/280
              </span>
            </div>
            <textarea
              value={editX}
              onChange={(e) => setEditX(e.target.value)}
              className={`w-full p-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 ${
                xOver ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200'
              }`}
              rows={4}
            />
          </div>
          
          {/* Threads version */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">🧵 Threads</label>
              <span className={`text-xs ${threadsOver ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                {threadsCount}/500
              </span>
            </div>
            <textarea
              value={editThreads}
              onChange={(e) => setEditThreads(e.target.value)}
              className={`w-full p-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 ${
                threadsOver ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200'
              }`}
              rows={5}
            />
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || xOver || threadsOver}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Ukládám...' : 'Uložit'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}
      
      {/* Source URL */}
      {!editing && post.sourceUrl && (
        <div className="mt-2 flex items-center gap-1">
          <a 
            href={post.sourceUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 text-xs hover:underline truncate max-w-[250px]"
          >
            {post.sourceUrl.replace('https://aibility.cz', '')}
          </a>
        </div>
      )}
      
      {/* Published URL */}
      {post.postUrl && (
        <a 
          href={post.postUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-green-500 text-xs hover:underline mt-2 inline-block"
        >
          Zobrazit publikovany post
        </a>
      )}
      
      {/* Error -- only show for truly failed posts, not stale status */}
      {post.error && post.status === 'failed' && (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-red-400 text-xs">
            {post.error === 'Unknown error' 
              ? 'Stav nelze ověřit (post může být naplánován v Upload Post)' 
              : `Chyba: ${post.error}`}
          </p>
        </div>
      )}
    </div>
  );
}
