/**
 * Scraper pro aibility.cz v3
 * 
 * - Auto-scraping webinářů z /webinare/nejblizsi-akce
 * - Deep blog scraping (plný text článků)
 * - Kompletní produktový katalog s testimonials
 * - Fallback na lokální data pokud scraping selže
 */

import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';
import { createPragueDate, parsePragueDate } from './timezone';
import type { 
  ContentSources, 
  ScrapedWebinar, 
  ScrapedProduct, 
  ScrapedQuote,
  ScrapedArticle,
  Testimonial,
} from './types';

const BASE_URL = 'https://aibility.cz';

// ============================================================
// Helpers
// ============================================================

/**
 * Normalizuj URL -- oprav relativní cesty ze scrapeného HTML
 */
function normalizeUrl(href: string): string {
  // "./blog/abc" → "/blog/abc"
  if (href.startsWith('./')) {
    href = href.substring(1);
  }
  // Relativní cesty → absolutní
  if (href.startsWith('/')) {
    return `${BASE_URL}${href}`;
  }
  // Už je absolutní
  if (href.startsWith('http')) {
    return href;
  }
  return `${BASE_URL}/${href}`;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs,en;q=0.9',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  
  return response.text();
}

/**
 * Parsuj český datum "11. února 2026" nebo "4. 2. 2026" do komponent
 */
function parseCzechDate(text: string): { year: number; month: number; day: number } | null {
  const monthNames: Record<string, number> = {
    'ledna': 1, 'února': 2, 'března': 3, 'dubna': 4,
    'května': 5, 'června': 6, 'července': 7, 'srpna': 8,
    'září': 9, 'října': 10, 'listopadu': 11, 'prosince': 12,
    'leden': 1, 'únor': 2, 'březen': 3, 'duben': 4,
    'květen': 5, 'červen': 6, 'červenec': 7, 'srpen': 8,
    'říjen': 10, 'listopad': 11, 'prosinec': 12,
  };
  
  // Try "11. února 2026" format
  const namedMonth = text.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})/);
  if (namedMonth) {
    const day = parseInt(namedMonth[1]);
    const monthStr = namedMonth[2].toLowerCase();
    const year = parseInt(namedMonth[3]);
    const month = monthNames[monthStr];
    if (month) return { year, month, day };
  }
  
  // Try "4. 2. 2026" or "4.2.2026" format
  const numericMonth = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (numericMonth) {
    return {
      day: parseInt(numericMonth[1]),
      month: parseInt(numericMonth[2]),
      year: parseInt(numericMonth[3]),
    };
  }
  
  return null;
}

/**
 * Parsuj čas "08:00" z textu
 */
function parseTime(text: string): string {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return '10:00';
}

/**
 * Extrahuj punchy věty z textu (pro pull quotes)
 */
function extractPullQuotes(text: string): string[] {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 150);
  
  // Preferuj věty s silným jazykem
  const strongPatterns = [
    /za \d+ minut/, /ušetří/, /zvládnete/, /naučíte/,
    /místo/, /proč/, /jak/, /nejlepší/, /změn/i,
    /jednoduch/, /prax/, /konkrétní/, /výsledk/,
  ];
  
  const scored = sentences.map(s => ({
    text: s,
    score: strongPatterns.filter(p => p.test(s)).length,
  }));
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.text);
}

/**
 * Extrahuj tipy z textu (věty s akčním jazykem)
 */
function extractTips(text: string): string[] {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 200);
  
  const tipPatterns = [
    /^(Zkuste|Použijte|Nastavte|Začněte|Přidejte|Otevřete|Napište|Vytvořte)/i,
    /tip[: ]/i,
    /doporučujeme/i,
    /stačí/i,
    /místo.*použijte/i,
    /nejdřív/i,
    /klíčov/i,
  ];
  
  return sentences
    .filter(s => tipPatterns.some(p => p.test(s)))
    .slice(0, 5);
}

// ============================================================
// Webináře -- auto-scraping z /webinare/nejblizsi-akce
// ============================================================

async function scrapeWebinars(): Promise<ScrapedWebinar[]> {
  const webinars: ScrapedWebinar[] = [];
  
  try {
    console.log('📅 Scraping webinars from /webinare/nejblizsi-akce...');
    const html = await fetchPage(`${BASE_URL}/webinare/nejblizsi-akce`);
    const $ = cheerio.load(html);
    
    // Framer web - hledáme karty webinářů
    // Zkoušíme různé selektory pro Framer layout
    const selectors = [
      '[class*="webinar"]',
      '[class*="event"]',
      '[class*="card"]',
      'article',
      '[class*="Card"]',
      '[class*="item"]',
    ];
    
    let cards: ReturnType<typeof $> | null = null;
    for (const selector of selectors) {
      const found = $(selector);
      if (found.length >= 2) {
        cards = found;
        console.log(`  Found ${found.length} elements with selector: ${selector}`);
        break;
      }
    }
    
    if (cards && cards.length > 0) {
      cards.each((_, el) => {
        const $el = $(el);
        const allText = $el.text();
        
        // Extrahuj title (H2 nebo H3)
        const title = $el.find('h2, h3, [class*="title"], [class*="Title"]').first().text().trim();
        if (!title || title.length < 5) return;
        
        // Extrahuj datum
        const dateText = allText;
        const dateParsed = parseCzechDate(dateText);
        if (!dateParsed) return;
        
        // Extrahuj čas
        const time = parseTime(allText);
        const [hours, minutes] = time.split(':').map(Number);
        
        // ISO datum s Prague timezone
        const isoDate = createPragueDate(dateParsed.year, dateParsed.month, dateParsed.day, hours, minutes);
        
        // Extrahuj popis
        const desc = $el.find('p, [class*="desc"], [class*="Desc"]').first().text().trim();
        
        // Extrahuj cenu
        const priceMatch = allText.match(/(\d[\d\s]*\s*Kč|[Zz]darma)/);
        const price = priceMatch ? priceMatch[1].trim() : '';
        
        // Extrahuj link
        const link = $el.find('a[href*="webinar"]').first().attr('href') || 
                     $el.find('a').first().attr('href');
        const url = link ? normalizeUrl(link) : `${BASE_URL}/webinare/nejblizsi-akce`;
        
        // Extrahuj duraci
        const durationMatch = allText.match(/(\d+)\s*min/);
        const duration = durationMatch ? `${durationMatch[1]} minut` : undefined;
        
        webinars.push({
          id: uuid(),
          title,
          description: desc || '',
          date: isoDate,
          time,
          duration,
          url,
          price: price || undefined,
          type: 'live',
        });
      });
    }
    
    console.log(`  Scraped ${webinars.length} webinars from live page`);
    
  } catch (error) {
    console.error('⚠️ Live webinar scraping failed:', error);
  }
  
  // Fallback na hardcoded data pokud scraping vrátí málo výsledků
  if (webinars.length < 3) {
    console.log('⚠️ Using fallback webinar data (scraping returned < 3 results)');
    const fallback = getFallbackWebinars();
    // Merge: přidej fallback webináře které ještě nemáme (podle title)
    const existingTitles = new Set(webinars.map(w => w.title.toLowerCase()));
    for (const w of fallback) {
      if (!existingTitles.has(w.title.toLowerCase())) {
        webinars.push(w);
      }
    }
  }
  
  // Filtruj pouze budoucí webináře
  const now = new Date();
  const futureWebinars = webinars.filter(w => {
    try {
      return parsePragueDate(w.date) > now;
    } catch {
      return false;
    }
  });
  
  console.log(`📅 Final webinars: ${futureWebinars.length} upcoming`);
  return futureWebinars;
}

/**
 * Fallback webináře - aktualizovat ručně když scraping nefunguje
 */
function getFallbackWebinars(): ScrapedWebinar[] {
  const fallbackData: Omit<ScrapedWebinar, 'id'>[] = [
    {
      title: 'Midjourney Masterclass: Tvořte vizuály jako profík',
      description: 'Naučte se, jak z Midjourney dostat vizuály, které drží styl, sedí na brand a dají se zopakovat.',
      date: createPragueDate(2026, 2, 11, 11, 0),
      time: '11:00',
      duration: '180 minut',
      url: `${BASE_URL}/webinare/midjourney-masterclass-tvorte-vizualy-jako-profik`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'Klíč k adopci AI: Revoluční metodika Superpowered Professional',
      description: 'AI adopci nerozjedou nástroje. Rozjedou ji lidé se správným mindsetem. Najděte ty své.',
      date: createPragueDate(2026, 2, 19, 10, 0),
      time: '10:00',
      duration: '60 minut',
      url: `${BASE_URL}/webinare/klic-k-adopci-ai-revolucni-metodika-superpowered-professional`,
      price: 'Zdarma',
      type: 'live',
    },
    {
      title: 'Cursor od základů: 90 minut, které změní způsob, jak pracujete',
      description: 'Cursor je nástroj, který dává znalostním pracovníkům superschopnosti. Naučte se ho využívat naplno.',
      date: createPragueDate(2026, 2, 24, 10, 0),
      time: '10:00',
      duration: '90 minut',
      url: `${BASE_URL}/webinare/cursor-od-zakladu-90-minut-ktere-zmeni-zpusob-jak-pracujete`,
      price: '990 Kč',
      type: 'live',
    },
    {
      title: 'Vibe coding v praxi: Od prototypu k živé appce',
      description: 'Naučíme vás workflow, se kterým z každého nápadu uděláte funkční appku s odkazem, který můžete poslat dál.',
      date: createPragueDate(2026, 3, 10, 10, 0),
      time: '10:00',
      duration: '90 minut',
      url: `${BASE_URL}/webinare/vibe-coding-v-praxi-od-prototypu-k-zive-appce`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'AI agent, který sbírá data za vás: Cursor + Apify v praxi',
      description: 'Ruční sběr dat je brzda. Ukážeme vám workflow, se kterým váš AI agent projde weby, posbírá data a připraví výstup.',
      date: createPragueDate(2026, 3, 24, 11, 0),
      time: '11:00',
      duration: '90 minut',
      url: `${BASE_URL}/webinare/ai-agent-ktery-sbira-data-za-vas-cursor-apify-v-praxi`,
      price: '1 490 Kč',
      type: 'live',
    },
    {
      title: 'Intro do Claude Code',
      description: 'Claude Code je jeden z nejsilnějších AI nástrojů současnosti. Zjistěte, jak funguje a jak ho začít používat.',
      date: createPragueDate(2026, 4, 2, 10, 0),
      time: '10:00',
      duration: '90 minut',
      url: `${BASE_URL}/webinare/intro-do-claude-code`,
      price: '990 Kč',
      type: 'live',
    },
  ];
  
  return fallbackData.map(w => ({ id: uuid(), ...w }));
}

// ============================================================
// Produkty -- kompletní katalog s testimonials
// ============================================================

async function scrapeProducts(): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [
    {
      id: uuid(),
      name: 'Aimee',
      tagline: 'Jste jednu konverzaci od prvního WOW momentu',
      description: 'AI coaching app, která vás provede světem AI. 24/7 podpora, personalizované učení, více než 30 připravených skills. Aimee se přizpůsobí vašim potřebám a provede vás od nuly k reálným výsledkům.',
      price: 'Prémiové',
      url: `${BASE_URL}/aimee`,
      features: [
        '24/7 AI partner pro učení',
        'Personalizované na vaše potřeby',
        'Více než 30 připravených skills',
        'Měřitelná změna mindset',
        'Reálné příklady z Aibility praxe',
      ],
      cta: 'Vyzkoušet Aimee',
      testimonials: [
        { text: 'Díky Aimee jsem za týden pochopila víc než za měsíce googlování.', role: 'Marketingová specialistka', context: 'Aimee' },
        { text: 'Myslela jsem, že AI není pro mě. Teď ji používám každý den.', role: 'Account manager', context: 'Aimee' },
        { text: 'Za pár dní jsem napsal 15 skriptů. Předtím jsem neuměl programovat.', role: 'Business konzultant', context: 'Aimee' },
      ],
    },
    {
      id: uuid(),
      name: 'Test AI Dovedností',
      tagline: 'Patříte mezi TOP 3%?',
      description: '15minutový test, který zjistí váš AI profil. Konverzační formát s Aimee, ne zaškrtávačky. Dostanete personalizovaný report s vaším AI typem, skóre v 5 oblastech a 3 prioritní kroky.',
      price: 'Prémiové',
      url: `${BASE_URL}/aidovednosti`,
      features: [
        '15 minut, konverzační formát',
        '5 AI profesních typů (Architekt, Tinkerer, Vizionář, Generalista, Průzkumník)',
        'Personalizovaný report se skóre',
        '3 prioritní kroky co dělat dál',
        '30 dní přístupu k Aimee v ceně',
      ],
      cta: 'Spustit test',
      testimonials: [
        { text: 'Test mi ukázal, kde mám mezery. Teď vím, na čem pracovat.', role: 'HR manažer', context: 'AI test' },
        { text: 'Konečně jsem pochopil, kde jsem oproti ostatním. Překvapivý výsledek.', role: 'Product manager', context: 'AI test' },
      ],
    },
    {
      id: uuid(),
      name: 'AI Edu Stream',
      tagline: 'Non-stop AI inspirace',
      description: 'Přístup ke všem live webinářům, kompletní archiv záznamů, exkluzivní Circle komunita a přímý kontakt s experty. 2-3 prémiové webináře měsíčně.',
      price: 'Prémiové',
      url: `${BASE_URL}/ai-edu-stream`,
      features: [
        '2-3 prémiové webináře měsíčně',
        'Kompletní archiv všech záznamů',
        'Exkluzivní Circle komunita',
        'Přímý kontakt s AI experty',
        'Pozvánky na exkluzivní offline akce',
      ],
      cta: 'Získat přístup',
      testimonials: [
        { text: 'AI Edu Stream je nejlepší investice do vzdělání, kterou jsem udělala.', role: 'Freelancerka', context: 'AI Edu Stream' },
        { text: 'Webináře jsou naprosto praktické. Hned druhý den jsem použila to, co jsem se naučila.', role: 'Projektová manažerka', context: 'AI Edu Stream' },
        { text: 'Konečně někdo, kdo učí AI srozumitelně a bez buzzwords.', role: 'Podnikatel', context: 'AI Edu Stream' },
      ],
    },
    {
      id: uuid(),
      name: 'Cursor Masterclass',
      tagline: '90 minut, které změní způsob, jak pracujete',
      description: 'Cursor je nástroj, který dává znalostním pracovníkům superschopnosti. Naučte se ho využívat naplno -- od základů až po pokročilé workflow.',
      price: 'Prémiové',
      url: `${BASE_URL}/cursor`,
      features: [
        'Od nuly k produktivnímu workflow',
        'Praktické ukázky na reálných příkladech',
        'Automatizace opakujících se úkolů',
        'Tipy od lidí, kteří Cursor používají denně',
      ],
      cta: 'Zjistit více',
      testimonials: [
        { text: 'Za hodinu práce s Cursorem udělám to, co mi dřív trvalo celý den.', role: 'Developer', context: 'Cursor' },
        { text: 'Nahradil jsem 4 spreadsheets jednou appkou, kterou jsem postavil sám.', role: 'Finanční analytik', context: 'Cursor' },
      ],
    },
    {
      id: uuid(),
      name: 'Claude Code Masterclass',
      tagline: 'Nejsilnější AI nástroj současnosti',
      description: 'Claude Code je terminalový AI asistent, který rozumí celému vašemu projektu. Zjistěte, jak funguje a jak ho začít používat pro reálnou práci.',
      price: 'Prémiové',
      url: `${BASE_URL}/claudecode`,
      features: [
        'Pochopení celého projektu najednou',
        'Práce přímo v terminálu',
        'Refactoring, debugging, nové features',
        'Integrace s existujícím workflow',
      ],
      cta: 'Zjistit více',
      testimonials: [
        { text: 'Claude Code mi za den udělal to, co bych programoval týden.', role: 'Startup founder', context: 'Claude Code' },
      ],
    },
    {
      id: uuid(),
      name: 'Aibility',
      tagline: 'Získejte superschopnosti díky AI',
      description: 'Jsme AI-first firma, která učí lidi i firmy používat umělou inteligenci prakticky a efektivně. To, co ostatní teprve slibují, my už děláme.',
      price: '',
      url: `${BASE_URL}`,
      features: [
        'AI transformace pro firmy',
        'Vzdělávací programy pro všechny úrovně',
        'Live workshopy a webináře',
        'Praktické AI nástroje a metodiky',
      ],
      cta: 'Zjistit více',
      testimonials: [
        { text: 'Díky Aibility jsem přestala mít z AI strach a začala ji používat denně.', role: 'Marketing manager', context: 'Aibility' },
        { text: 'Konečně někdo, kdo učí AI srozumitelně a bez buzzwords.', role: 'Podnikatel', context: 'Aibility' },
      ],
    },
  ];
  
  // Zkus doscrapovat Cursor a Claude Code pages pro čerstvější data
  const pagesForEnrichment = [
    { url: '/cursor', productName: 'Cursor Masterclass' },
    { url: '/claudecode', productName: 'Claude Code Masterclass' },
  ];
  
  for (const page of pagesForEnrichment) {
    try {
      const html = await fetchPage(`${BASE_URL}${page.url}`);
      const $ = cheerio.load(html);
      
      const metaDesc = $('meta[name="description"]').attr('content');
      const product = products.find(p => p.name === page.productName);
      
      if (product && metaDesc && metaDesc.length > 20) {
        product.description = metaDesc;
      }
    } catch (error) {
      console.log(`  Note: Could not enrich ${page.productName} from web`);
    }
  }
  
  return products;
}

// ============================================================
// Blog články -- deep scraping s plným textem
// ============================================================

async function scrapeArticles(): Promise<ScrapedArticle[]> {
  const articles: ScrapedArticle[] = [];
  
  try {
    console.log('📝 Scraping blog articles...');
    const html = await fetchPage(`${BASE_URL}/blog`);
    const $ = cheerio.load(html);
    
    // Sbírej odkazy na články
    const articleLinks: { title: string; url: string }[] = [];
    
    // Hledej blog karty nebo linky
    $('a[href*="/blog/"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      
      if (href && text.length > 10 && !text.includes('Blog') && !href.endsWith('/blog') && !href.endsWith('/blog/')) {
        const url = normalizeUrl(href);
        // Deduplicate by URL
        if (!articleLinks.find(a => a.url === url)) {
          articleLinks.push({ title: text.split('\n')[0].trim(), url });
        }
      }
    });
    
    console.log(`  Found ${articleLinks.length} article links`);
    
    // Deep scrape každého článku
    for (const link of articleLinks.slice(0, 10)) { // Max 10 článků
      try {
        const articleHtml = await fetchPage(link.url);
        const $article = cheerio.load(articleHtml);
        
        // Extrahuj title (preferuj H1 ze stránky)
        const title = $article('h1').first().text().trim() || link.title;
        
        // Extrahuj meta description jako excerpt
        const excerpt = $article('meta[name="description"]').attr('content') || 
                       $article('p').first().text().trim().substring(0, 300);
        
        // Extrahuj plný text článku
        let fullText = '';
        $article('article p, [class*="content"] p, [class*="body"] p, main p').each((_, el) => {
          const text = $article(el).text().trim();
          if (text.length > 20) {
            fullText += text + ' ';
          }
        });
        
        // Fallback: všechny paragrafy
        if (fullText.length < 200) {
          $article('p').each((_, el) => {
            const text = $article(el).text().trim();
            if (text.length > 30 && text.length < 1000) {
              fullText += text + ' ';
            }
          });
        }
        
        fullText = fullText.trim().substring(0, 2000);
        
        // Extrahuj key insights z nadpisů
        const keyInsights: string[] = [];
        $article('h2, h3').each((_, el) => {
          const text = $article(el).text().trim();
          if (text.length > 5 && text.length < 200) {
            keyInsights.push(text);
          }
        });
        
        // Extrahuj pull quotes a tipy
        const pullQuotes = extractPullQuotes(fullText);
        const tips = extractTips(fullText);
        
        // Extrahuj publish date
        let publishedAt: string | undefined;
        const dateEl = $article('time, [class*="date"], [class*="Date"]').first();
        const dateText = dateEl.attr('datetime') || dateEl.text().trim();
        if (dateText) {
          const parsed = parseCzechDate(dateText);
          if (parsed) {
            publishedAt = createPragueDate(parsed.year, parsed.month, parsed.day, 12, 0);
          }
        }
        
        if (title && (fullText.length > 100 || excerpt)) {
          articles.push({
            id: uuid(),
            title,
            excerpt: excerpt || '',
            url: link.url,
            category: 'AI',
            publishedAt,
            fullText,
            keyInsights,
            pullQuotes,
            tips,
          });
          console.log(`  ✅ ${title} (${fullText.length} chars, ${pullQuotes.length} quotes, ${tips.length} tips)`);
        }
        
        // Pauza mezi requesty
        await new Promise(r => setTimeout(r, 300));
        
      } catch (error) {
        console.error(`  ❌ Failed to scrape: ${link.url}`, error);
      }
    }
    
  } catch (error) {
    console.error('Error scraping blog:', error);
  }
  
  console.log(`📝 Final articles: ${articles.length}`);
  return articles;
}

// ============================================================
// Quotes a insights (pro brand posty)
// ============================================================

async function scrapeQuotes(): Promise<ScrapedQuote[]> {
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
    
    // AI Insights
    { text: 'AI není hrozba. Je to nástroj, který zesiluje vaše schopnosti.', source: 'insight', category: 'ai' },
    { text: 'Budoucnost patří těm, kteří umí s AI spolupracovat, ne těm, kteří se jí bojí.', source: 'insight', category: 'ai' },
    { text: 'Nejlepší prompt je ten, který dává AI kontext a jasný cíl.', source: 'insight', category: 'ai' },
    { text: 'AI nenahradí lidi, ale lidé s AI nahradí lidi bez AI.', source: 'insight', category: 'ai' },
    
    // Productivity
    { text: 'Automatizujte nudné úkoly. Zaměřte se na to, co vás baví.', source: 'insight', category: 'productivity' },
    { text: 'AI vám neušetří čas, pokud nevíte, co s ním chcete dělat.', source: 'insight', category: 'productivity' },
  ];
  
  return predefinedQuotes.map(q => ({ id: uuid(), ...q }));
}

// ============================================================
// Hlavní scrape funkce
// ============================================================

export async function scrapeAll(): Promise<ContentSources> {
  console.log('🔍 Starting full scrape of aibility.cz...');
  
  const [webinars, products, articles, quotes] = await Promise.all([
    scrapeWebinars(),
    scrapeProducts(),
    scrapeArticles(),
    scrapeQuotes(),
  ]);
  
  console.log(`✅ Scrape complete: ${webinars.length} webinars, ${products.length} products, ${articles.length} articles, ${quotes.length} quotes`);
  
  return {
    webinars,
    products,
    articles,
    quotes,
    scrapedAt: new Date().toISOString(),
  };
}

export { scrapeWebinars, scrapeProducts, scrapeArticles, scrapeQuotes };
