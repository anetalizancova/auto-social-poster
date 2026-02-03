/**
 * Scraper pro aibility.cz
 * 
 * Stahuje webináře, produkty a quotes z webu
 */

import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';
import type { ContentSources, ScrapedWebinar, ScrapedProduct, ScrapedQuote } from './types';

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
    // Hlavní stránka s webináři
    const html = await fetchPage(`${BASE_URL}/webinare/nejblizsi-akce`);
    const $ = cheerio.load(html);
    
    // Najdi všechny webinářové karty/sekce
    // Poznámka: Struktura se může lišit, upravit podle reálného HTML
    $('[class*="webinar"], [class*="event"], [data-webinar]').each((_, el) => {
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
    
    // Pokud se nenašly žádné webináře přes selektory, zkus alternativní přístup
    if (webinars.length === 0) {
      // Fallback: projdi všechny odkazy na webináře
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
 * Scrape produkty (AI Maturity Test, Aimee, AI Edu Stream)
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
      
      // Extrahuj hlavní info
      const title = $('h1').first().text().trim() || page.name;
      const tagline = $('h2, [class*="tagline"], [class*="subtitle"]').first().text().trim();
      const description = $('meta[name="description"]').attr('content') || 
                         $('[class*="description"]').first().text().trim();
      const priceText = $('[class*="price"]').first().text().trim();
      
      // Extrahuj features/benefity
      const features: string[] = [];
      $('li, [class*="feature"], [class*="benefit"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 10 && text.length < 200) {
          features.push(text);
        }
      });
      
      // CTA text
      const cta = $('a[class*="button"], button').first().text().trim() || 'Zjistit více';
      
      products.push({
        id: uuid(),
        name: title,
        tagline: tagline || '',
        description: description || '',
        price: priceText || '',
        url: `${BASE_URL}${page.url}`,
        features: features.slice(0, 5), // Max 5 features
        cta,
      });
      
    } catch (error) {
      console.error(`Error scraping ${page.name}:`, error);
    }
  }
  
  return products;
}

/**
 * Quotes a insights z metodiky a webu
 */
async function scrapeQuotes(): Promise<ScrapedQuote[]> {
  const quotes: ScrapedQuote[] = [];
  
  // Předdefinované quotes z brand voice a metodiky
  const predefinedQuotes = [
    { text: 'Aibility dělá AI lidskou. Pomáhá lidem získat superschopnosti díky AI.', source: 'brand', category: 'mission' },
    { text: 'To, co ostatní teprve slibují, my už děláme. To, co učíme, sami žijeme.', source: 'brand', category: 'mission' },
    { text: 'Jsme AI first. Děláme to jinak a děláme to nejlépe.', source: 'brand', category: 'mission' },
    { text: 'Získejte superschopnosti díky AI.', source: 'brand', category: 'tagline' },
    { text: 'Za 3 hodiny zvládnete to, co by vám dřív trvalo celý týden.', source: 'brand', category: 'benefit' },
    { text: 'Odnesete si funkční prompty a hotovou šablonu. Zítra ušetříte první hodinu.', source: 'brand', category: 'benefit' },
    { text: 'Učte se od nejlepších AI expertů. Získejte přístup ke všem webinářům.', source: 'brand', category: 'benefit' },
    { text: 'Nepřekládáme články o budoucnosti práce, ale rovnou ji tvoříme.', source: 'brand', category: 'mission' },
  ];
  
  for (const q of predefinedQuotes) {
    quotes.push({
      id: uuid(),
      text: q.text,
      source: q.source,
      category: q.category,
    });
  }
  
  // Zkus scrape další quotes z webu
  try {
    const html = await fetchPage(`${BASE_URL}/metodika`);
    const $ = cheerio.load(html);
    
    // Hledej blockquotes nebo zvýrazněné texty
    $('blockquote, [class*="quote"], [class*="highlight"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 300) {
        quotes.push({
          id: uuid(),
          text,
          source: 'metodika',
          category: 'insight',
        });
      }
    });
    
  } catch (error) {
    console.error('Error scraping quotes:', error);
  }
  
  return quotes;
}

/**
 * Parsování datumu z textu
 */
function parseDate(text: string): string {
  // Zkus najít datum ve formátu DD.MM.YYYY nebo DD. M. YYYY
  const dateMatch = text.match(/(\d{1,2})\.?\s*(\d{1,2})\.?\s*(\d{4})?/);
  
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
    
    const date = new Date(year, month, day);
    return date.toISOString();
  }
  
  // Fallback na dnešek + 7 dní
  const future = new Date();
  future.setDate(future.getDate() + 7);
  return future.toISOString();
}

/**
 * Parsování času z textu
 */
function parseTime(text: string): string {
  // Najdi čas ve formátu HH:MM nebo H:MM
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }
  
  return '17:00'; // Default čas
}

/**
 * Hlavní scrape funkce
 */
export async function scrapeAll(): Promise<ContentSources> {
  console.log('🔍 Starting scrape of aibility.cz...');
  
  const [webinars, products, quotes] = await Promise.all([
    scrapeWebinars(),
    scrapeProducts(),
    scrapeQuotes(),
  ]);
  
  console.log(`✅ Scraped: ${webinars.length} webinars, ${products.length} products, ${quotes.length} quotes`);
  
  return {
    webinars,
    products,
    quotes,
    scrapedAt: new Date().toISOString(),
  };
}

export { scrapeWebinars, scrapeProducts, scrapeQuotes };
