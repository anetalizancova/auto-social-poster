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
 * Webináře - Framer web je JS-rendered, tak použijeme aktuální data
 * Aktualizovat ručně nebo přes API když bude dostupné
 */
async function scrapeWebinars(): Promise<ScrapedWebinar[]> {
  // Aktuální webináře z aibility.cz/webinare/nejblizsi-akce
  // Poslední update: 3.2.2026
  const upcomingWebinars: Omit<ScrapedWebinar, 'id'>[] = [
    {
      title: 'AI Morning Show',
      description: 'Reálné ukázky z AI-first firmy, praktické tipy i novinky ze světa AI.',
      date: '2026-02-04T08:00:00',
      time: '08:00',
      url: `${BASE_URL}/webinare/ai-morning-show-2`,
      price: 'Zdarma',
      type: 'live',
    },
    {
      title: 'Midjourney Masterclass: Tvořte vizuály jako profík',
      description: 'Naučte se, jak z Midjourney dostat vizuály, které drží styl, sedí na brand a dají se zopakovat.',
      date: '2026-02-11T11:00:00',
      time: '11:00',
      url: `${BASE_URL}/webinare/midjourney-masterclass-tvorte-vizualy-jako-profik`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'Klíč k adopci AI: Revoluční metodika Superpowered Professional',
      description: 'AI adopci nerozjedou nástroje. Rozjedou ji lidé se správným mindsetem. Najděte ty své.',
      date: '2026-02-19T10:00:00',
      time: '10:00',
      url: `${BASE_URL}/webinare/klic-k-adopci-ai-revolucni-metodika-superpowered-professional`,
      price: 'Zdarma',
      type: 'live',
    },
    {
      title: 'Cursor od základů: 90 minut, které změní způsob, jak pracujete',
      description: 'Cursor je nástroj, který dává znalostním pracovníkům superschopnosti. Naučte se ho využívat naplno.',
      date: '2026-02-24T10:00:00',
      time: '10:00',
      url: `${BASE_URL}/webinare/cursor-od-zakladu-90-minut-ktere-zmeni-zpusob-jak-pracujete`,
      price: '990 Kč',
      type: 'live',
    },
    {
      title: 'Vibe coding v praxi: Od prototypu k živé appce',
      description: 'Naučíme vás workflow, se kterým z každého nápadu uděláte funkční appku s odkazem, který můžete poslat dál.',
      date: '2026-03-10T10:00:00',
      time: '10:00',
      url: `${BASE_URL}/webinare/vibe-coding-v-praxi-od-prototypu-k-zive-appce`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'AI agent, který sbírá data za vás: Cursor + Apify v praxi',
      description: 'Ruční sběr dat je brzda. Ukážeme vám workflow, se kterým váš AI agent projde weby, posbírá data a připraví výstup.',
      date: '2026-03-24T11:00:00',
      time: '11:00',
      url: `${BASE_URL}/webinare/ai-agent-ktery-sbira-data-za-vas-cursor-apify-v-praxi`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'Intro do Claude Code',
      description: 'Claude Code je jeden z nejsilnějších AI nástrojů současnosti. Zjistěte, jak funguje a jak ho začít používat.',
      date: '2026-04-02T10:00:00',
      time: '10:00',
      url: `${BASE_URL}/webinare/intro-do-claude-code`,
      price: '990 Kč',
      type: 'live',
    },
  ];
  
  // Filtruj pouze budoucí webináře
  const now = new Date();
  const futureWebinars = upcomingWebinars.filter(w => new Date(w.date) > now);
  
  return futureWebinars.map(w => ({ id: uuid(), ...w }));
}

/**
 * Scrape produkty
 */
async function scrapeProducts(): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  
  // Hardcoded produkty pro spolehlivost (Framer je JS-rendered)
  const predefinedProducts: Omit<ScrapedProduct, 'id'>[] = [
    {
      name: 'Test AI Dovedností',
      tagline: 'Zjistěte, jak jste na tom s AI za 5 minut',
      description: 'Bezplatný test, který vám ukáže vaši aktuální úroveň AI dovedností. Dostanete personalizované doporučení, co se naučit dál.',
      price: 'Zdarma',
      url: `${BASE_URL}/aidovednosti`,
      features: [
        'Otestujte se za 5 minut',
        'Personalizované výsledky',
        'Doporučení dalších kroků',
        'Srovnání s ostatními',
      ],
      cta: 'Spustit test',
    },
    {
      name: 'Aimee',
      tagline: 'Váš AI buddy, který vás naučí používat AI',
      description: 'Aimee je AI asistent, který vás provede světem umělé inteligence. Denní tipy, praktické úkoly a zpětná vazba přímo ve vašem pracovním prostředí.',
      price: 'Prémiové',
      url: `${BASE_URL}/aimee`,
      features: [
        'Denní AI tipy a úkoly',
        'Personalizované učení',
        'Praktické promptování',
        'Zpětná vazba na vaše výstupy',
      ],
      cta: 'Vyzkoušet Aimee',
    },
    {
      name: 'AI Edu Stream',
      tagline: 'Všechny webináře a komunita na jednom místě',
      description: 'Přístup ke všem live webinářům, záznamům a exkluzivní AI komunitě. Učte se od těch nejlepších AI expertů.',
      price: 'Prémiové',
      url: `${BASE_URL}/ai-edu-stream`,
      features: [
        'Všechny webináře zdarma',
        'Přístup k záznamům',
        'Exkluzivní AI komunita',
        'Q&A s experty',
      ],
      cta: 'Získat přístup',
    },
    {
      name: 'Aibility',
      tagline: 'Pomáháme lidem získat superschopnosti díky AI',
      description: 'Jsme AI-first firma, která učí lidi i firmy používat umělou inteligenci prakticky a efektivně. Žádná teorie, jen výsledky.',
      price: '',
      url: `${BASE_URL}`,
      features: [
        'AI transformace pro firmy',
        'Vzdělávací programy',
        'Live workshopy a webináře',
        'Praktické AI nástroje',
      ],
      cta: 'Zjistit více',
    },
  ];
  
  // Vrať predefinované produkty
  for (const product of predefinedProducts) {
    products.push({ id: uuid(), ...product });
  }
  
  // Zkus doscrapovat další z webu
  const productPages = [
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
