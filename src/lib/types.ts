/**
 * Types pro Auto Social Poster v2
 * 
 * Rozšířené typy pro rozmanitější content
 */

// Typy obsahu pro generování - rozšířené
export type ContentType = 
  | 'webinar_invite'    // Pozvánka na webinář
  | 'webinar_reminder'  // Reminder na webinář (jiný úhel)
  | 'product_benefit'   // Benefit produktu (jeden konkrétní)
  | 'product_promo'     // Obecné promo produktu
  | 'product_cta'       // CTA s linkem
  | 'blog_insight'      // Insight z článku
  | 'blog_quote'        // Quote z článku
  | 'blog_tip'          // Tip z článku
  | 'testimonial'       // Testimonial (bez jména)
  | 'brand_mission'     // O Aibility obecně
  | 'ai_tip'            // Praktický AI tip
  | 'ai_insight'        // Zajímavost o AI
  | 'thought_leadership'; // Expert insight

// Platformy
export type Platform = 'x' | 'threads';

// Status postu
export type PostStatus = 'pending' | 'scheduled' | 'posted' | 'failed';

// Scrapnutý webinář
export interface ScrapedWebinar {
  id: string;
  title: string;
  description: string;
  date: string;           // ISO date
  time: string;           // "17:00"
  duration?: string;      // "90 minut"
  speaker?: string;
  url: string;
  price?: string;         // "zdarma" nebo "1190 Kč"
  type: 'live' | 'recorded';
}

// Scrapnutý produkt
export interface ScrapedProduct {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: string;
  url: string;
  features: string[];
  cta: string;
}

// Blog článek
export interface ScrapedArticle {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  category?: string;
  publishedAt?: string;
  keyInsights: string[];  // Klíčové myšlenky z článku
}

// Testimonial
export interface ScrapedTestimonial {
  id: string;
  text: string;
  role?: string;          // "HR manažer", "Projektový manažer" - bez jména
  context?: string;       // K jakému produktu/webináři se vztahuje
}

// Scrapnutý quote/insight
export interface ScrapedQuote {
  id: string;
  text: string;
  source: string;         // Odkud pochází (metodika, web, atd.)
  category: string;       // AI, productivity, mindset
}

// Celý scrapnutý obsah - rozšířený
export interface ContentSources {
  webinars: ScrapedWebinar[];
  products: ScrapedProduct[];
  articles: ScrapedArticle[];
  testimonials: ScrapedTestimonial[];
  quotes: ScrapedQuote[];
  scrapedAt: string;      // ISO date kdy bylo scrapnuto
}

// Vygenerovaný post - s podporou linků
export interface GeneratedPost {
  id: string;
  type: ContentType;
  content_x: string;       // Text pro X (max 280)
  content_threads: string; // Text pro Threads (max 500)
  platform: Platform;      // Kam se postne
  scheduledFor: string;    // ISO datetime
  status: PostStatus;
  sourceId?: string;       // ID zdroje (webinář, produkt, článek)
  sourceType?: 'webinar' | 'product' | 'article' | 'quote' | 'testimonial';
  sourceUrl?: string;      // URL pro CTA
  createdAt: string;
  postedAt?: string;
  postUrl?: string;        // URL postu po publikaci
  error?: string;          // Chyba pokud failed
}

// Fronta postů
export interface PostsQueue {
  posts: GeneratedPost[];
  lastGenerated: string;   // Kdy bylo naposledy generováno
  lastPosted: string;      // Kdy bylo naposledy postnuto
}

// Konfigurace generování - vylepšená
export interface GenerateConfig {
  totalPosts: number;      // Celkový počet postů k vygenerování
  daysAhead: number;       // Na kolik dní dopředu plánovat
  postsPerDay: number;     // Kolik postů denně
  postTimes: string[];     // Časy postování ["09:00", "14:00"]
  startDate?: string;      // Od kdy plánovat (default: teď)
}

// Post template pro generování
export interface PostTemplate {
  type: ContentType;
  source: ScrapedWebinar | ScrapedProduct | ScrapedArticle | ScrapedQuote | ScrapedTestimonial | null;
  angle: string;           // Konkrétní úhel/přístup
  includeLink: boolean;    // Zda přidat odkaz
  linkUrl?: string;        // URL pro CTA
}
