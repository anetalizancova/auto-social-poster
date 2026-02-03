/**
 * Types pro Auto Social Poster
 */

// Typy obsahu pro generování
export type ContentType = 
  | 'webinar_invite'    // Pozvánka na webinář
  | 'product_promo'     // Promo produktu
  | 'quote'             // Citát/insight
  | 'tip'               // Praktický tip
  | 'highlight';        // Zajímavost z obsahu

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

// Scrapnutý quote/insight
export interface ScrapedQuote {
  id: string;
  text: string;
  source: string;         // Odkud pochází (metodika, web, atd.)
  category: string;       // AI, productivity, mindset
}

// Celý scrapnutý obsah
export interface ContentSources {
  webinars: ScrapedWebinar[];
  products: ScrapedProduct[];
  quotes: ScrapedQuote[];
  scrapedAt: string;      // ISO date kdy bylo scrapnuto
}

// Vygenerovaný post
export interface GeneratedPost {
  id: string;
  type: ContentType;
  content_x: string;       // Text pro X (max 280)
  content_threads: string; // Text pro Threads (max 500)
  platform: Platform;      // Kam se postne
  scheduledFor: string;    // ISO datetime
  status: PostStatus;
  sourceId?: string;       // ID zdroje (webinář, produkt)
  sourceType?: 'webinar' | 'product' | 'quote';
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

// Konfigurace generování
export interface GenerateConfig {
  postsPerType: number;    // Kolik postů každého typu
  startDate: string;       // Od kdy plánovat
  postsPerDay: number;     // Kolik postů denně
  postTimes: string[];     // Časy postování ["09:00", "14:00"]
}
