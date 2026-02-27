/**
 * Types pro Auto Social Poster v3
 * 
 * Rozšířené typy: deep blog scraping, testimonials jako enrichment, product+testimonial combos
 */

// Typy obsahu pro generování
export type ContentType = 
  | 'webinar_invite'        // Pozvánka na webinář
  | 'webinar_reminder'      // Reminder na webinář (jiný úhel)
  | 'product_benefit'       // Benefit produktu
  | 'product_promo'         // Obecné promo produktu
  | 'product_cta'           // CTA s linkem
  | 'product_testimonial'   // Produkt + testimonial jako social proof
  | 'blog_tip'              // Praktický tip z článku
  | 'blog_insight'          // Hlavní insight/takeaway
  | 'blog_quote'            // Punchy citát z článku
  | 'blog_highlight'        // Shrnutí sekce + CTA
  | 'brand_mission'         // O Aibility obecně
  | 'ai_tip'                // Praktický AI tip
  | 'ai_insight'            // Zajímavost o AI
  | 'thought_leadership';   // Expert insight

// Platformy
export type Platform = 'x' | 'threads';

// Status postu
export type PostStatus = 'pending' | 'scheduled' | 'posted' | 'failed';

// Testimonial (embedded v produktech)
export interface Testimonial {
  text: string;
  role: string;             // "HR manažer", "Developer" - bez plného jména
  context?: string;         // K jakému produktu se vztahuje
}

// Scrapnutý webinář
export interface ScrapedWebinar {
  id: string;
  title: string;
  description: string;
  date: string;             // ISO date s timezone offset
  time: string;             // "17:00"
  duration?: string;        // "90 minut"
  speaker?: string;
  url: string;
  price?: string;           // "zdarma" nebo "1 490 Kč"
  type: 'live' | 'recorded';
}

// Scrapnutý produkt (s testimonials)
export interface ScrapedProduct {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: string;
  url: string;
  features: string[];
  cta: string;
  testimonials: Testimonial[];  // Embedded testimonials pro social proof
}

// Blog článek (s full text pro deep content mining)
export interface ScrapedArticle {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  category?: string;
  publishedAt?: string;
  fullText: string;           // Plný text článku (truncated ~2000 chars)
  keyInsights: string[];      // Extrahované z H2/H3 sekcí
  pullQuotes: string[];       // Punchy standalone věty
  tips: string[];             // Praktické tipy z článku
}

// Scrapnutý quote/insight (pro brand posty)
export interface ScrapedQuote {
  id: string;
  text: string;
  source: string;
  category: string;
}

// Celý scrapnutý obsah
export interface ContentSources {
  webinars: ScrapedWebinar[];
  products: ScrapedProduct[];
  articles: ScrapedArticle[];
  quotes: ScrapedQuote[];
  scrapedAt: string;
}

// Vygenerovaný post
export interface GeneratedPost {
  id: string;
  type: ContentType;
  content_x: string;         // Text pro X (max 280)
  content_threads: string;   // Text pro Threads (max 500)
  platform: Platform;        // Kam se postne
  scheduledFor: string;      // ISO datetime s timezone
  status: PostStatus;
  sourceId?: string;         // ID zdroje
  sourceType?: 'webinar' | 'product' | 'article' | 'quote';
  sourceUrl?: string;        // URL pro CTA
  angle?: string;            // Úhel použitý při generování (pro deduplication)
  edited?: boolean;          // Ručně editováno v dashboardu
  createdAt: string;
  postedAt?: string;
  postUrl?: string;
  error?: string;
}

// Fronta postů
export interface PostsQueue {
  posts: GeneratedPost[];
  lastGenerated: string;
  lastPosted: string;
}

// Konfigurace generování
export interface GenerateConfig {
  totalPosts: number;
  daysAhead: number;
  postsPerDay: number;
  postTimes: string[];        // ["09:00", "14:00"]
  startDate?: string;
}

// Post template pro generování
export interface PostTemplate {
  type: ContentType;
  source: ScrapedWebinar | ScrapedProduct | ScrapedArticle | ScrapedQuote | null;
  testimonial?: Testimonial;  // Pro product_testimonial typ
  angle: string;
  includeLink: boolean;
  linkUrl?: string;
  deadline?: string;  // ISO date -- post MUSÍ být naplánován PŘED tímto datem (pro webináře = datum akce)
}
