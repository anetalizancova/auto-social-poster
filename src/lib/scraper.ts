/**
 * Scraper pro aibility.cz v2
 * 
 * Rozšířený - stahuje webináře, produkty, blog články, testimonials a quotes
 */

import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';
import type { 
  ContentSources, 
  ScrapedWebinar, 
  ScrapedProduct, 
  ScrapedQuote,
  ScrapedArticle,
  ScrapedTestimonial 
} from './types';

const BASE_URL = 'https://aibility.cz';

/**
 * Fetch HTML stránky
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AibilityScraper/1.0)',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  
  return response.text();
}

/**
 * Scrape webináře z /webinare/nejblizsi-akce
 */
async function scrapeWebinars(): Promise<ScrapedWebinar[]> {
  const webinars: ScrapedWebinar[] = [];
  
  try {
    const html = await fetchPage(`${BASE_URL}/webinare/nejblizsi-akce`);
    const $ = cheerio.load(html);
    
    // Najdi všechny webinářové karty/sekce
    $('[class*="webinar"], [class*="event"], [data-webinar], .card').each((_, el) => {
      const $el = $(el);
      
      const title = $el.find('h2, h3, [class*="title"]').first().text().trim();
      const description = $el.find('p, [class*="description"]').first().text().trim();
      const dateText = $el.find('[class*="date"], time').first().text().trim();
      const link = $el.find('a[href*="/webinare/"]').first().attr('href');
      const priceText = $el.find('[class*="price"]').first().text().trim();
      
      if (title && link) {
        webinars.push({
          id: uuid(),
          title,
          description: description || '',
          date: parseDate(dateText),
          time: parseTime(dateText),
          url: link.startsWith('http') ? link : `${BASE_URL}${link}`,
          price: priceText || 'zdarma',
          type: 'live',
        });
      }
    });
    
    // Fallback
    if (webinars.length === 0) {
      $('a[href*="/webinare/"]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && !href.includes('nejblizsi-akce') && text.length > 5) {
          webinars.push({
            id: uuid(),
            title: text,
            description: '',
            date: new Date().toISOString(),
            time: '17:00',
            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
            price: 'zdarma',
            type: 'live',
          });
        }
      });
    }
    
  } catch (error) {
    console.error('Error scraping webinars:', error);
  }
  
  return webinars;
}

/**
 * Scrape produkty
 */
async function scrapeProducts(): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  
  const productPages = [
    { url: '/aidovednosti', name: 'AI Maturity Test' },
    { url: '/aimee', name: 'Aimee' },
    { url: '/ai-edu-stream', name: 'AI Edu Stream' },
    { url: '/cursor', name: 'Cursor Masterclass' },
    { url: '/claudecode', name: 'Claude Code Masterclass' },
  ];
  
  for (const page of productPages) {
    try {
      const html = await fetchPage(`${BASE_URL}${page.url}`);
      const $ = cheerio.load(html);
      
      const title = $('h1').first().text().trim() || page.name;
      const tagline = $('h2, [class*="tagline"], [class*="subtitle"]').first().text().trim();
      const description = $('meta[name="description"]').attr('content') || 
                         $('[class*="description"]').first().text().trim();
      const priceText = $('[class*="price"]').first().text().trim();
      
      const features: string[] = [];
      $('li, [class*="feature"], [class*="benefit"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 10 && text.length < 200) {
          features.push(text);
        }
      });
      
      const cta = $('a[class*="button"], button').first().text().trim() || 'Zjistit více';
      
      products.push({
        id: uuid(),
        name: title,
        tagline: tagline || '',
        description: description || '',
        price: priceText || '',
        url: `${BASE_URL}${page.url}`,
        features: features.slice(0, 5),
        cta,
      });
      
    } catch (error) {
      console.error(`Error scraping ${page.name}:`, error);
    }
  }
  
  return products;
}

/**
 * Scrape blog články
 */
async function scrapeArticles(): Promise<ScrapedArticle[]> {
  const articles: ScrapedArticle[] = [];
  
  try {
    // Hlavní blog stránka
    const html = await fetchPage(`${BASE_URL}/blog`);
    const $ = cheerio.load(html);
    
    // Najdi články
    $('article, [class*="post"], [class*="blog-item"], .card').each((_, el) => {
      const $el = $(el);
      
      const title = $el.find('h2, h3, [class*="title"]').first().text().trim();
      const excerpt = $el.find('p, [class*="excerpt"], [class*="summary"]').first().text().trim();
      const link = $el.find('a').first().attr('href');
      const category = $el.find('[class*="category"], [class*="tag"]').first().text().trim();
      
      if (title && link && title.length > 5) {
        articles.push({
          id: uuid(),
          title,
          excerpt: excerpt || '',
          url: link.startsWith('http') ? link : `${BASE_URL}${link}`,
          category: category || 'AI',
          keyInsights: extractKeyInsights(title, excerpt),
        });
      }
    });
    
    // Fallback - najdi všechny blog linky
    if (articles.length === 0) {
      $('a[href*="/blog/"]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && text.length > 10 && !text.includes('Blog') && !href.endsWith('/blog')) {
          articles.push({
            id: uuid(),
            title: text,
            excerpt: '',
            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
            keyInsights: [],
          });
        }
      });
    }
    
  } catch (error) {
    console.error('Error scraping articles:', error);
  }
  
  return articles;
}

/**
 * Extrahuj klíčové myšlenky z titulku a excertu
 */
function extractKeyInsights(title: string, excerpt: string): string[] {
  const insights: string[] = [];
  
  // Přidej titulek jako insight
  if (title) insights.push(title);
  
  // Rozděl excerpt na věty a použij jako insights
  if (excerpt) {
    const sentences = excerpt.split(/[.!?]+/).filter(s => s.trim().length > 20);
    insights.push(...sentences.slice(0, 3).map(s => s.trim()));
  }
  
  return insights;
}

/**
 * Testimonials - mix scrapovaných a předdefinovaných
 */
async function scrapeTestimonials(): Promise<ScrapedTestimonial[]> {
  const testimonials: ScrapedTestimonial[] = [];
  
  // Předdefinované testimonials (anonymizované)
  const predefined: Omit<ScrapedTestimonial, 'id'>[] = [
    { text: 'Díky Aimee jsem za týden pochopila víc než za měsíce googlování.', role: 'Marketingová specialistka', context: 'Aimee' },
    { text: 'AI Maturity Test mi ukázal, kde mám mezery. Teď vím, na čem pracovat.', role: 'HR manažer', context: 'AI Maturity Test' },
    { text: 'Webináře jsou naprosto praktické. Hned druhý den jsem použila to, co jsem se naučila.', role: 'Projektová manažerka', context: 'webinar' },
    { text: 'Konečně někdo, kdo učí AI srozumitelně a bez buzzwords.', role: 'Podnikatel', context: 'Aibility' },
    { text: 'Za hodinu práce s Cursorem udělám to, co mi dřív trvalo celý den.', role: 'Developer', context: 'Cursor' },
    { text: 'AI Edu Stream je nejlepší investice do vzdělání, kterou jsem udělala.', role: 'Freelancerka', context: 'AI Edu Stream' },
    { text: 'Myslela jsem, že AI není pro mě. Teď ji používám každý den.', role: 'Account manager', context: 'Aimee' },
    { text: 'Prompt engineering mi přišel jako magie. Teď vím, že je to skill, který se dá naučit.', role: 'Content creator', context: 'webinar' },
  ];
  
  for (const t of predefined) {
    testimonials.push({ id: uuid(), ...t });
  }
  
  // Zkus scrapovat testimonials z webu
  try {
    const pages = ['/', '/aimee', '/ai-edu-stream'];
    
    for (const page of pages) {
      const html = await fetchPage(`${BASE_URL}${page}`);
      const $ = cheerio.load(html);
      
      $('[class*="testimonial"], [class*="review"], blockquote').each((_, el) => {
        const text = $(el).find('p, [class*="text"]').first().text().trim();
        const role = $(el).find('[class*="author"], [class*="name"], cite').first().text().trim();
        
        if (text.length > 20 && text.length < 300) {
          // Anonymizuj - odstraň jména
          const anonymizedRole = role.replace(/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+ [A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+,?\s*/i, '');
          
          testimonials.push({
            id: uuid(),
            text,
            role: anonymizedRole || undefined,
            context: page === '/' ? 'Aibility' : page.replace('/', ''),
          });
        }
      });
    }
  } catch (error) {
    console.error('Error scraping testimonials:', error);
  }
  
  return testimonials;
}

/**
 * Quotes a insights
 */
async function scrapeQuotes(): Promise<ScrapedQuote[]> {
  const quotes: ScrapedQuote[] = [];
  
  // Rozšířené předdefinované quotes
  const predefinedQuotes = [
    // Mission & Brand
    { text: 'Aibility dělá AI lidskou. Pomáhá lidem získat superschopnosti díky AI.', source: 'brand', category: 'mission' },
    { text: 'To, co ostatní teprve slibují, my už děláme. To, co učíme, sami žijeme.', source: 'brand', category: 'mission' },
    { text: 'Jsme AI first. Děláme to jinak a děláme to nejlépe.', source: 'brand', category: 'mission' },
    { text: 'Nepřekládáme články o budoucnosti práce, ale rovnou ji tvoříme.', source: 'brand', category: 'mission' },
    { text: 'Získejte superschopnosti díky AI.', source: 'brand', category: 'tagline' },
    
    // Benefits
    { text: 'Za 3 hodiny zvládnete to, co by vám dřív trvalo celý týden.', source: 'brand', category: 'benefit' },
    { text: 'Odnesete si funkční prompty a hotovou šablonu. Zítra ušetříte první hodinu.', source: 'brand', category: 'benefit' },
    { text: 'Učte se od nejlepších AI expertů. Získejte přístup ke všem webinářům.', source: 'brand', category: 'benefit' },
    
    // AI Insights
    { text: 'AI není hrozba. Je to nástroj, který zesiluje vaše schopnosti.', source: 'insight', category: 'ai' },
    { text: 'Budoucnost patří těm, kteří umí s AI spolupracovat, ne těm, kteří se jí bojí.', source: 'insight', category: 'ai' },
    { text: 'Prompt engineering je nová gramotnost 21. století.', source: 'insight', category: 'ai' },
    { text: 'AI nenahradí lidi, ale lidé s AI nahradí lidi bez AI.', source: 'insight', category: 'ai' },
    { text: 'Nejlepší prompt je ten, který dává AI kontext a jasný cíl.', source: 'insight', category: 'ai' },
    
    // Productivity
    { text: 'Automatizujte nudné úkoly. Zaměřte se na to, co vás baví.', source: 'insight', category: 'productivity' },
    { text: 'Každý meeting, který se dá nahradit AI, by měl být nahrazen AI.', source: 'insight', category: 'productivity' },
    { text: 'AI vám neušetří čas, pokud nevíte, co s ním chcete dělat.', source: 'insight', category: 'productivity' },
  ];
  
  for (const q of predefinedQuotes) {
    quotes.push({ id: uuid(), ...q });
  }
  
  return quotes;
}

/**
 * Parsování datumu
 */
function parseDate(text: string): string {
  const dateMatch = text.match(/(\d{1,2})\.?\s*(\d{1,2})\.?\s*(\d{4})?/);
  
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
    
    const date = new Date(year, month, day);
    return date.toISOString();
  }
  
  const future = new Date();
  future.setDate(future.getDate() + 7);
  return future.toISOString();
}

/**
 * Parsování času
 */
function parseTime(text: string): string {
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }
  
  return '17:00';
}

/**
 * Hlavní scrape funkce
 */
export async function scrapeAll(): Promise<ContentSources> {
  console.log('🔍 Starting scrape of aibility.cz...');
  
  const [webinars, products, articles, testimonials, quotes] = await Promise.all([
    scrapeWebinars(),
    scrapeProducts(),
    scrapeArticles(),
    scrapeTestimonials(),
    scrapeQuotes(),
  ]);
  
  console.log(`✅ Scraped: ${webinars.length} webinars, ${products.length} products, ${articles.length} articles, ${testimonials.length} testimonials, ${quotes.length} quotes`);
  
  return {
    webinars,
    products,
    articles,
    testimonials,
    quotes,
    scrapedAt: new Date().toISOString(),
  };
}

export { scrapeWebinars, scrapeProducts, scrapeArticles, scrapeTestimonials, scrapeQuotes };
