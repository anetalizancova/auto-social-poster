/**
 * AI Content Generator v3
 * 
 * - Blog-heavy mix (35%) s multi-angle per článek
 * - Product+testimonial combos (15%)
 * - Deduplication přes queue history
 * - Link enforcement
 * - Slop detection + retry
 */

import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import { SYSTEM_PROMPT, containsSlop } from './brand-voice';
import { createScheduleDate, formatCzechDatePrague, parsePragueDate } from './timezone';
import type { 
  ContentSources, 
  GeneratedPost, 
  ContentType, 
  Platform,
  GenerateConfig,
  PostTemplate,
  ScrapedWebinar,
  ScrapedProduct,
  ScrapedArticle,
  ScrapedQuote,
  Testimonial,
} from './types';

// OpenRouter API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://auto-social-poster.vercel.app',
    'X-Title': 'Aibility Auto Social Poster',
  },
});

// Model -- konfigurovatelný přes env var
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

/**
 * Default konfigurace
 */
const DEFAULT_CONFIG: GenerateConfig = {
  totalPosts: 14,
  daysAhead: 7,
  postsPerDay: 2,
  postTimes: ['10:00', '15:00'],
};

// ============================================================
// Content Angles
// ============================================================

const BLOG_ANGLES = [
  'practical_tip',        // Jeden konkrétní tip z článku
  'key_insight',          // Hlavní takeaway
  'contrarian_hook',      // "Většina lidí si myslí X, ale..."
  'pull_quote',           // Punchy citát z článku
  'problem_agitation',    // Problém popsaný v článku + link
  'did_you_know',         // Zajímavý fakt/stat
];

const WEBINAR_ANGLES = [
  'what_youll_learn',     // Co se naučíte
  'who_its_for',          // Pro koho je
  'practical_outcome',    // Co si odnesete
  'fomo',                 // Nenechte si ujít
  'speaker_expertise',    // Kdo to vede
];

const PRODUCT_ANGLES = [
  'benefit_focused',      // Jeden konkrétní benefit
  'problem_solution',     // Problém → řešení
  'curiosity',            // Otázka/zvědavost
  'how_it_works',         // Jak to funguje
  'social_proof',         // Kdo to používá
];

const BRAND_ANGLES = [
  'inspirational',
  'thought_provoking',
  'practical',
  'contrarian',
];

// ============================================================
// Template Creation -- nový blog-heavy mix
// ============================================================

interface RecentUsage {
  sourceIds: Set<string>;
  sourceAnglePairs: Set<string>; // "sourceId:angle"
}

function getRecentUsage(recentPosts: GeneratedPost[]): RecentUsage {
  const sourceIds = new Set<string>();
  const sourceAnglePairs = new Set<string>();
  
  for (const post of recentPosts) {
    if (post.sourceId) {
      sourceIds.add(post.sourceId);
      if (post.angle) {
        sourceAnglePairs.add(`${post.sourceId}:${post.angle}`);
      }
    }
  }
  
  return { sourceIds, sourceAnglePairs };
}

function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Vytvoř templates s novým mixem:
 * 35% blog, 20% webináře, 15% produkty, 15% brand, 15% produkt+testimonial
 */
function createPostTemplates(
  sources: ContentSources, 
  totalPosts: number,
  recentPosts: GeneratedPost[] = []
): PostTemplate[] {
  const templates: PostTemplate[] = [];
  const recent = getRecentUsage(recentPosts);
  
  // Helper: je tento source+angle čerstvý?
  const isFresh = (sourceId: string, angle: string) => 
    !recent.sourceAnglePairs.has(`${sourceId}:${angle}`);
  
  // Filtruj budoucí webináře (i při generování, ne jen scrapingu)
  const now = new Date();
  const futureWebinars = (sources.webinars || []).filter(w => {
    try { return parsePragueDate(w.date) > now; } catch { return false; }
  });
  
  console.log(`📊 Content sources: ${futureWebinars.length} webinars, ${sources.products?.length || 0} products, ${sources.articles?.length || 0} articles, ${sources.quotes?.length || 0} quotes`);
  
  // ---- 1. BLOG ČLÁNKY (35%) ----
  const blogSlots = Math.round(totalPosts * 0.35);
  const articles = sources.articles || [];
  
  if (articles.length > 0) {
    // Z každého článku vyrob 2-3 posty s různými úhly
    const shuffledArticles = shuffle(articles);
    let blogCount = 0;
    
    for (const article of shuffledArticles) {
      if (blogCount >= blogSlots) break;
      
      // Kolik postů z tohoto článku? 2-3, záleží na bohatosti obsahu
      const postsPerArticle = (article.pullQuotes.length > 2 || article.tips.length > 2) ? 3 : 2;
      const availableAngles = shuffle(BLOG_ANGLES);
      
      for (let i = 0; i < Math.min(postsPerArticle, availableAngles.length); i++) {
        if (blogCount >= blogSlots) break;
        
        const angle = availableAngles[i];
        // Preferuj čerstvé kombinace
        if (!isFresh(article.id, angle) && i < availableAngles.length - 1) continue;
        
        const blogType: ContentType = angle === 'practical_tip' ? 'blog_tip' :
                                       angle === 'pull_quote' ? 'blog_quote' :
                                       angle === 'key_insight' ? 'blog_insight' :
                                       'blog_highlight';
        
        templates.push({
          type: blogType,
          source: article,
          angle,
          includeLink: true,
          linkUrl: article.url,
        });
        blogCount++;
      }
    }
    console.log(`  📝 Blog templates: ${blogCount}`);
  }
  
  // ---- 2. WEBINÁŘE (20%) ----
  const webinarSlots = Math.round(totalPosts * 0.20);
  
  if (futureWebinars.length > 0) {
    // Seřaď podle data -- nejbližší první
    const sortedWebinars = [...futureWebinars].sort((a, b) => 
      parsePragueDate(a.date).getTime() - parsePragueDate(b.date).getTime()
    );
    
    let webinarCount = 0;
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    for (const webinar of sortedWebinars) {
      if (webinarCount >= webinarSlots) break;
      
      const webinarDate = parsePragueDate(webinar.date);
      const isSoon = webinarDate <= twoWeeksLater;
      
      // Blízké webináře dostanou 2 posty, vzdálenější 1
      const postsForThis = isSoon ? 2 : 1;
      const availableAngles = shuffle(WEBINAR_ANGLES);
      
      for (let i = 0; i < Math.min(postsForThis, availableAngles.length); i++) {
        if (webinarCount >= webinarSlots) break;
        
        templates.push({
          type: i === 0 ? 'webinar_invite' : 'webinar_reminder',
          source: webinar,
          angle: availableAngles[i],
          includeLink: true,
          linkUrl: webinar.url,
          deadline: webinar.date, // Post MUSÍ být naplánován PŘED tímto datem!
        });
        webinarCount++;
      }
    }
    console.log(`  📅 Webinar templates: ${webinarCount}`);
  }
  
  // ---- 3. PRODUKTY (15%) ----
  const productSlots = Math.round(totalPosts * 0.15);
  const products = (sources.products || []).filter(p => p.name !== 'Aibility'); // Brand zvlášť
  
  if (products.length > 0) {
    const shuffledProducts = shuffle(products);
    let productCount = 0;
    
    for (const product of shuffledProducts) {
      if (productCount >= productSlots) break;
      
      const angle = pickRandom(PRODUCT_ANGLES.filter(a => isFresh(product.id, a)));
      templates.push({
        type: 'product_benefit',
        source: product,
        angle: angle || pickRandom(PRODUCT_ANGLES),
        includeLink: true,
        linkUrl: product.url,
      });
      productCount++;
    }
    console.log(`  🛍️ Product templates: ${productCount}`);
  }
  
  // ---- 4. BRAND POSTY (15%) ----
  const brandSlots = Math.round(totalPosts * 0.15);
  const quotes = sources.quotes || [];
  
  if (quotes.length > 0) {
    const shuffledQuotes = shuffle(quotes);
    let brandCount = 0;
    
    for (const quote of shuffledQuotes) {
      if (brandCount >= brandSlots) break;
      
      const angle = pickRandom(BRAND_ANGLES);
      templates.push({
        type: quote.category === 'mission' || quote.category === 'tagline' ? 'brand_mission' : 'ai_insight',
        source: quote,
        angle,
        includeLink: true,
        linkUrl: 'https://aibility.cz',
      });
      brandCount++;
    }
    console.log(`  🚀 Brand templates: ${brandCount}`);
  }
  
  // ---- 5. PRODUKT + TESTIMONIAL COMBOS (15%) ----
  const comboSlots = Math.round(totalPosts * 0.15);
  const productsWithTestimonials = (sources.products || []).filter(p => p.testimonials.length > 0);
  
  if (productsWithTestimonials.length > 0) {
    let comboCount = 0;
    const shuffledComboProducts = shuffle(productsWithTestimonials);
    
    for (const product of shuffledComboProducts) {
      if (comboCount >= comboSlots) break;
      
      const testimonial = pickRandom(product.testimonials);
      templates.push({
        type: 'product_testimonial',
        source: product,
        testimonial,
        angle: 'social_proof',
        includeLink: true,
        linkUrl: product.url,
      });
      comboCount++;
    }
    console.log(`  💬 Product+testimonial templates: ${comboCount}`);
  }
  
  // Log celkový mix
  const typeCounts = templates.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`📊 Template mix:`, typeCounts);
  
  // Shuffle finální pořadí a ořízni na požadovaný počet
  const shuffled = shuffle(templates);
  const selected = shuffled.slice(0, totalPosts);
  
  // Zajisti že nejsou 2 stejné typy za sebou
  for (let i = 1; i < selected.length; i++) {
    if (selected[i].type === selected[i-1].type) {
      // Najdi jiný typ dál v poli a prohoď
      for (let j = i + 1; j < selected.length; j++) {
        if (selected[j].type !== selected[i-1].type) {
          [selected[i], selected[j]] = [selected[j], selected[i]];
          break;
        }
      }
    }
  }
  
  console.log(`✅ Selected ${selected.length} templates from ${templates.length} total`);
  return selected;
}

// ============================================================
// Prompt Building
// ============================================================

function buildPrompt(template: PostTemplate, platform: Platform): string {
  const urlLength = template.linkUrl?.length || 0;
  const maxLength = platform === 'x' ? Math.max(200, 260 - urlLength) : Math.max(350, 460 - urlLength);
  const { type, source, angle, includeLink, linkUrl } = template;
  
  let prompt = `Vygeneruj ${platform === 'x' ? 'tweet' : 'Threads post'} pro Aibility.
Max ${maxLength} znaků (BEZ linku). Vykej v celém postu. Žádné ceny.\n\n`;
  
  switch (type) {
    case 'product_benefit':
    case 'product_promo':
    case 'product_cta': {
      const product = source as ScrapedProduct;
      prompt += `PRODUKT: ${product.name}
Tagline: ${product.tagline}
Popis: ${product.description}
Features: ${product.features.slice(0, 3).join(', ')}

ÚHEL: ${angle.replace(/_/g, ' ')}
- benefit_focused: Jeden konkrétní benefit, proč ho potřebují
- problem_solution: Problém → řešení
- curiosity: Otázka, vzbuď zvědavost
- how_it_works: Jak to funguje v praxi
- social_proof: Pro koho je, kdo ho používá

⚠️ NEZMIŇUJ CENU!`;
      break;
    }
      
    case 'product_testimonial': {
      const product = source as ScrapedProduct;
      const testimonial = template.testimonial!;
      prompt += `PRODUKT + TESTIMONIAL:
Produkt: ${product.name}
Popis: ${product.description}

Testimonial: "${testimonial.text}" – ${testimonial.role}

Napiš post, který začne testimonialem (parafrázuj nebo cituj) a pak přidej krátkou zmínku o produktu jako řešení. Zakonči CTA.

Příklad struktury:
"[Citát/parafráze testimonial]" – ${testimonial.role}

[1-2 věty o produktu]
[CTA]

⚠️ NEZMIŇUJ CENU! Nepoužívej jméno, jen roli.`;
      break;
    }
      
    case 'webinar_invite':
    case 'webinar_reminder': {
      const webinar = source as ScrapedWebinar;
      const date = parsePragueDate(webinar.date);
      const formattedDate = formatCzechDatePrague(date);
      prompt += `WEBINÁŘ: ${webinar.title}
Datum: ${formattedDate}
Popis: ${webinar.description}
${webinar.duration ? `Délka: ${webinar.duration}` : ''}

ÚHEL: ${angle.replace(/_/g, ' ')}
${type === 'webinar_reminder' ? 'Tón: urgentní, "už brzy", "nenechte si ujít"' : ''}

Zahrň datum v textu postu! (${formattedDate})
⚠️ NEZMIŇUJ CENU!`;
      break;
    }
      
    case 'blog_tip': {
      const article = source as ScrapedArticle;
      prompt += `BLOG ČLÁNEK: ${article.title}
${article.tips.length > 0 ? `Tipy z článku: ${article.tips.slice(0, 3).join('; ')}` : ''}
${article.fullText ? `Kontext: ${article.fullText.substring(0, 500)}` : `Excerpt: ${article.excerpt}`}

Vytáhni JEDEN praktický tip z článku. Buď specifický – čtenář musí získat hodnotu i bez kliknutí. Ale CTA na celý článek přidej.`;
      break;
    }
      
    case 'blog_insight': {
      const article = source as ScrapedArticle;
      prompt += `BLOG ČLÁNEK: ${article.title}
Klíčové myšlenky: ${article.keyInsights.slice(0, 4).join('; ')}
${article.fullText ? `Kontext: ${article.fullText.substring(0, 500)}` : `Excerpt: ${article.excerpt}`}

Napiš hlavní insight/takeaway z článku. Něco překvapivého nebo hodnotného. Zakonči CTA na celý článek.`;
      break;
    }
      
    case 'blog_quote': {
      const article = source as ScrapedArticle;
      const quotes = article.pullQuotes.length > 0 ? article.pullQuotes : [article.title];
      prompt += `BLOG ČLÁNEK: ${article.title}
Silné věty z článku: ${quotes.slice(0, 3).join(' | ')}
${article.fullText ? `Kontext: ${article.fullText.substring(0, 300)}` : ''}

Použij jednu z těch silných vět jako hook. Můžeš ji mírně upravit. Přidej 1-2 věty kontextu a CTA na článek.`;
      break;
    }
      
    case 'blog_highlight': {
      const article = source as ScrapedArticle;
      prompt += `BLOG ČLÁNEK: ${article.title}
${article.fullText ? `Text: ${article.fullText.substring(0, 600)}` : `Excerpt: ${article.excerpt}`}
Sekce: ${article.keyInsights.slice(0, 3).join(', ')}

Shrň jednu zajímavou sekci článku. Dej čtenáři důvod kliknout a přečíst si celý článek.`;
      break;
    }
      
    case 'brand_mission':
    case 'ai_insight': {
      const quote = source as ScrapedQuote;
      prompt += `QUOTE/INSIGHT:
"${quote.text}"
Kategorie: ${quote.category}

Rozviň tuto myšlenku do postu. Buď autentický, ne salesy. Můžeš přidat vlastní kontext.`;
      break;
    }
      
    case 'ai_tip': {
      const quote = source as ScrapedQuote;
      prompt += `AI TIP:
Nástroj: ${quote.source}
Tip: ${quote.text}

Praktický tip, který čtenář může hned použít. Buď konkrétní.`;
      break;
    }
      
    case 'thought_leadership': {
      prompt += `Napiš zajímavý insight o AI a práci. Něco originálního, ne klišé.`;
      break;
    }
  }
  
  // CTA info
  if (includeLink && linkUrl) {
    prompt += `\n\n📎 Na konec přidej CTA s linkem: ${linkUrl}
Příklady CTA: "Víc na:", "Celý článek:", "Vyzkoušejte:", "Přihlaste se:"`;
  }
  
  return prompt;
}

// ============================================================
// Post Generation
// ============================================================

async function generateSinglePost(template: PostTemplate, platform: Platform, retryCount: number = 0): Promise<string> {
  const prompt = buildPrompt(template, platform);
  const urlLength = template.linkUrl?.length || 0;
  const maxLength = platform === 'x' ? 280 : 500;
  
  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.7,  // Sníženo z 0.85 pro konzistentnější output
    });
    
    let content = response.choices[0]?.message?.content?.trim() || '';
    
    // ---- POST-PROCESSING ----
    
    // 1. Odstraň uvozovky kolem celého postu
    content = content.replace(/^["„"]|["„"]$/g, '').trim();
    
    // 2. Odstraň "Zde je post:" a podobné prefixy
    content = content.replace(/^(Zde je|Tady je|Návrh|Post)[^:]*:\s*/i, '').trim();
    
    // 3. Odstraň ceny
    content = content.replace(/\s*Cena( je)?:?\s*\d[\d\s]*\s*Kč\.?/gi, '');
    content = content.replace(/\s*[Zz]a\s+\d[\d\s]*\s*Kč/gi, '');
    content = content.replace(/\s*\d[\d\s]*\s*Kč/gi, '');
    
    // 4. Převeď tykání na vykání
    const tykaníToVykání: [RegExp, string][] = [
      [/\bChceš\b/g, 'Chcete'], [/\bchceš\b/g, 'chcete'],
      [/\bMáš\b/g, 'Máte'], [/\bmáš\b/g, 'máte'],
      [/\bVíš\b/g, 'Víte'], [/\bvíš\b/g, 'víte'],
      [/\bZnáš\b/g, 'Znáte'], [/\bznáš\b/g, 'znáte'],
      [/\bPotřebuješ\b/g, 'Potřebujete'], [/\bpotřebuješ\b/g, 'potřebujete'],
      [/\bMůžeš\b/g, 'Můžete'], [/\bmůžeš\b/g, 'můžete'],
      [/\bUmíš\b/g, 'Umíte'], [/\bumíš\b/g, 'umíte'],
      [/\bZajímá tě\b/g, 'Zajímá vás'], [/\bzajímá tě\b/g, 'zajímá vás'],
      [/\bZkoušíš\b/g, 'Zkoušíte'], [/\bzkoušíš\b/g, 'zkoušíte'],
      [/\bPoužíváš\b/g, 'Používáte'], [/\bpoužíváš\b/g, 'používáte'],
      [/\bPracuješ\b/g, 'Pracujete'], [/\bpracuješ\b/g, 'pracujete'],
      [/\bTrávíš\b/g, 'Trávíte'], [/\btrávíš\b/g, 'trávíte'],
      [/\bHledáš\b/g, 'Hledáte'], [/\bhledáš\b/g, 'hledáte'],
      [/\bNauč se\b/g, 'Naučte se'], [/\bnauč se\b/g, 'naučte se'],
      [/\bPřihlas se\b/g, 'Přihlaste se'], [/\bpřihlas se\b/g, 'přihlaste se'],
      [/\bVyzkoušej\b/g, 'Vyzkoušejte'], [/\bvyzkoušej\b/g, 'vyzkoušejte'],
      [/\bZkus\b/g, 'Zkuste'], [/\bzkus\b/g, 'zkuste'],
      [/\bPodívej se\b/g, 'Podívejte se'], [/\bpodívej se\b/g, 'podívejte se'],
      [/\bZjisti\b(?!\s*víc)/g, 'Zjistěte'], [/\bzjisti\b(?!\s*víc)/g, 'zjistěte'],
      [/\bPřemýšlel jsi\b/gi, 'Přemýšleli jste'],
      [/\bSlyšel jsi\b/gi, 'Slyšeli jste'],
      [/\bVěděl jsi\b/gi, 'Věděli jste'],
      [/\bZkoušel jsi\b/gi, 'Zkoušeli jste'],
      [/\bChtěl jsi\b/gi, 'Chtěli jste'],
      [/\bChtěl bys\b/gi, 'Chtěli byste'],
      [/\bMohl bys\b/gi, 'Mohli byste'],
      [/\btobě\b/g, 'vám'],
      [/\btvůj\b/g, 'váš'], [/\btvá\b/g, 'vaše'], [/\btvé\b/g, 'vaše'],
      [/\btvojí\b/g, 'vaší'],
      [/\b ti \b/g, ' vám '], [/\b tě \b/g, ' vás '],
    ];
    
    for (const [pattern, replacement] of tykaníToVykání) {
      content = content.replace(pattern, replacement);
    }
    
    // 5. Lowercase vykání -- "Váš" → "váš", "Vám" → "vám" (NE formální velké V)
    const formalToInformal: [RegExp, string][] = [
      [/\bVáš\b/g, 'váš'], [/\bVaše\b/g, 'vaše'], [/\bVašeho\b/g, 'vašeho'],
      [/\bVaší\b/g, 'vaší'], [/\bVašich\b/g, 'vašich'], [/\bVašem\b/g, 'vašem'],
      [/\bVám\b/g, 'vám'], [/\bVás\b/g, 'vás'], [/\bVy\b/g, 'vy'],
    ];
    for (const [pattern, replacement] of formalToInformal) {
      content = content.replace(pattern, replacement);
    }
    // Ale zachovej velké V na začátku věty: "vám" na začátku → necháme malé (je to přirozené)
    
    // 6. Slop detection + retry
    if (containsSlop(content) && retryCount < 1) {
      console.log(`  ⚠️ Slop detected, retrying... ("${content.substring(0, 50)}...")`);
      return generateSinglePost(template, platform, retryCount + 1);
    }
    
    // 7. Link enforcement -- zajisti že link je v textu
    if (template.includeLink && template.linkUrl) {
      if (!content.includes(template.linkUrl)) {
        // Odstraň trailing tečku/mezeru a přidej link
        content = content.trimEnd().replace(/[.\s]+$/, '');
        content += `\n${template.linkUrl}`;
      }
    }
    
    // 8. Vyčisti dvojité mezery a řádky
    content = content.replace(/[ \t]+/g, ' ');
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.trim();
    
    // 9. Ořízni pokud je moc dlouhé (ale zachovej link)
    if (content.length > maxLength) {
      const linkPart = template.linkUrl ? `\n${template.linkUrl}` : '';
      const textMaxLen = maxLength - linkPart.length;
      
      // Najdi text bez linku
      const textWithoutLink = content.replace(template.linkUrl || '', '').trim();
      
      if (textWithoutLink.length > textMaxLen) {
        const lastSentence = textWithoutLink.substring(0, textMaxLen - 3).lastIndexOf('. ');
        const truncated = lastSentence > textMaxLen * 0.5
          ? textWithoutLink.substring(0, lastSentence + 1)
          : textWithoutLink.substring(0, textMaxLen - 3) + '...';
        
        content = truncated + linkPart;
      }
    }
    
    return content;
    
  } catch (error) {
    console.error('Error generating post:', error);
    throw error;
  }
}

// ============================================================
// Scheduling
// ============================================================

function schedulePostsWithVariety(
  posts: { template: PostTemplate; content_x: string; content_threads: string }[],
  config: GenerateConfig
): GeneratedPost[] {
  const now = new Date();
  const startDate = config.startDate ? new Date(config.startDate) : now;
  
  // ---- DEADLINE-AWARE SCHEDULING ----
  // 1. Rozděl posty na ty s deadline (webináře) a bez
  const withDeadline = posts.filter(p => p.template.deadline);
  const withoutDeadline = posts.filter(p => !p.template.deadline);
  
  // 2. Seřaď deadline posty podle deadline (nejbližší první)
  withDeadline.sort((a, b) => {
    const dateA = parsePragueDate(a.template.deadline!).getTime();
    const dateB = parsePragueDate(b.template.deadline!).getTime();
    return dateA - dateB;
  });
  
  // 3. Vypočti všechny dostupné sloty
  type Slot = { dayIndex: number; timeIndex: number; dateISO: string; date: Date };
  const slots: Slot[] = [];
  const totalSlots = Math.max(posts.length, config.totalPosts);
  let di = 1; // Začni od zítřka
  let ti = 0;
  
  for (let i = 0; i < totalSlots + 4; i++) { // +4 buffer
    const time = config.postTimes[ti];
    const dateISO = createScheduleDate(startDate, di, time);
    const date = parsePragueDate(dateISO);
    slots.push({ dayIndex: di, timeIndex: ti, dateISO, date });
    
    ti++;
    if (ti >= config.postsPerDay) {
      di++;
      ti = 0;
    }
  }
  
  // 4. Přiřaď deadline posty do nejbližších volných slotů PŘED jejich deadline
  const usedSlots = new Set<number>();
  const slotAssignments: Map<number, typeof posts[0]> = new Map(); // slotIndex → post
  
  for (const post of withDeadline) {
    const deadline = parsePragueDate(post.template.deadline!);
    
    // Najdi nejlepší slot: co nejblíže deadline, ale PŘED ním (ideálně 1-3 dny před)
    let bestSlot = -1;
    let bestScore = -Infinity;
    
    for (let si = 0; si < slots.length; si++) {
      if (usedSlots.has(si)) continue;
      
      const slot = slots[si];
      const daysBeforeDeadline = (deadline.getTime() - slot.date.getTime()) / (1000 * 60 * 60 * 24);
      
      // MUSÍ být před deadline (min 0.5 dne = 12h buffer)
      if (daysBeforeDeadline < 0.5) continue;
      
      // Score: preferuj 1-3 dny před deadline
      // Invite: ideálně 3-5 dní před
      // Reminder: ideálně 1-2 dny před
      const isReminder = post.template.type === 'webinar_reminder';
      const idealDays = isReminder ? 1.5 : 4;
      const score = -Math.abs(daysBeforeDeadline - idealDays); // Čím blíže ideálu, tím lepší
      
      if (score > bestScore) {
        bestScore = score;
        bestSlot = si;
      }
    }
    
    if (bestSlot >= 0) {
      usedSlots.add(bestSlot);
      slotAssignments.set(bestSlot, post);
      const slot = slots[bestSlot];
      const daysLeft = ((deadline.getTime() - slot.date.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1);
      console.log(`  📅 Webinar "${(post.template.source as ScrapedWebinar)?.title?.substring(0, 30)}..." → slot ${slot.dateISO.substring(0, 10)} (${daysLeft}d before event)`);
    } else {
      console.log(`  ⚠️ Skipping webinar post -- no slot available before deadline ${post.template.deadline}`);
    }
  }
  
  // 5. Zbytek postů bez deadline přiřaď do volných slotů
  let nonDeadlineIdx = 0;
  for (let si = 0; si < slots.length && nonDeadlineIdx < withoutDeadline.length; si++) {
    if (usedSlots.has(si)) continue;
    
    slotAssignments.set(si, withoutDeadline[nonDeadlineIdx]);
    usedSlots.add(si);
    nonDeadlineIdx++;
  }
  
  // 6. Sestav výsledný schedule (seřazený podle slotů)
  const scheduled: GeneratedPost[] = [];
  const sortedSlotIndices = [...slotAssignments.keys()].sort((a, b) => a - b);
  
  // Zajisti variety: ne 2 stejné typy za sebou
  let lastType: ContentType | null = null;
  
  for (const si of sortedSlotIndices) {
    const post = slotAssignments.get(si)!;
    const slot = slots[si];
    
    // Střídej platformy
    const platform: Platform = scheduled.length % 2 === 0 ? 'x' : 'threads';
    
    scheduled.push({
      id: uuid(),
      type: post.template.type,
      content_x: post.content_x,
      content_threads: post.content_threads,
      platform,
      scheduledFor: slot.dateISO,
      status: 'pending',
      sourceId: (post.template.source as { id?: string })?.id,
      sourceType: getSourceType(post.template.type),
      sourceUrl: post.template.linkUrl,
      angle: post.template.angle,
      createdAt: new Date().toISOString(),
    });
    
    lastType = post.template.type;
  }
  
  return scheduled;
}

function getSourceType(type: ContentType): GeneratedPost['sourceType'] {
  if (type.startsWith('webinar')) return 'webinar';
  if (type.startsWith('product')) return 'product';
  if (type.startsWith('blog')) return 'article';
  return 'quote';
}

// ============================================================
// Main Export
// ============================================================

export async function generatePosts(
  sources: ContentSources,
  config: Partial<GenerateConfig> = {},
  recentPosts: GeneratedPost[] = []
): Promise<GeneratedPost[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  console.log(`🤖 Generating ${cfg.totalPosts} posts (model: ${AI_MODEL})...`);
  
  // Vytvoř templates s deduplication
  const templates = createPostTemplates(sources, cfg.totalPosts, recentPosts);
  
  if (templates.length === 0) {
    console.log('❌ No templates created. Check content sources.');
    return [];
  }
  
  // Generuj content pro každý template -- s hook diversity
  const posts: { template: PostTemplate; content_x: string; content_threads: string }[] = [];
  const usedHooks: string[] = []; // Prvních 3-5 slov každého postu
  
  for (const template of templates) {
    try {
      console.log(`  ✍️ ${template.type} (${template.angle})`);
      
      // Přidej anti-repeat instrukci pokud máme předchozí hooky
      const hookAvoidance = usedHooks.length > 0 
        ? `\n\n⚠️ NEZAČÍNEJ POST těmito slovy/frázemi (už byly použity): ${usedHooks.join(', ')}\nZačni ÚPLNĚ JINAK -- jiným typem hooku (otázka/tvrzení/číslo/příběh/výzva).`
        : '';
      
      const templateWithHookHint = {
        ...template,
        // Inject hook avoidance do angle
        angle: template.angle + hookAvoidance,
      };
      
      const [content_x, content_threads] = await Promise.all([
        generateSinglePost(templateWithHookHint, 'x'),
        generateSinglePost(templateWithHookHint, 'threads'),
      ]);
      
      // Track opening hook (první 3 slova)
      const hookX = content_x.split(/\s+/).slice(0, 3).join(' ').toLowerCase().replace(/[^\wáčďéěíňóřšťúůýž\s]/gi, '');
      const hookT = content_threads.split(/\s+/).slice(0, 3).join(' ').toLowerCase().replace(/[^\wáčďéěíňóřšťúůýž\s]/gi, '');
      usedHooks.push(`"${hookX}"`);
      if (hookT !== hookX) usedHooks.push(`"${hookT}"`);
      
      posts.push({ template, content_x, content_threads });
      
      // Pauza mezi requesty
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`  ❌ Failed: ${template.type}`, error);
    }
  }
  
  console.log(`✅ Generated content for ${posts.length} posts`);
  
  // Naplánuj s variety
  const scheduled = schedulePostsWithVariety(posts, cfg);
  
  console.log(`🎉 Scheduled ${scheduled.length} posts`);
  return scheduled;
}

export { generateSinglePost };
