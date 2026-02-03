/**
 * AI Content Generator v2
 * 
 * Rozmanitější content s linky a lepším střídáním
 */

import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import { addDays, setHours, setMinutes, format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { SYSTEM_PROMPT } from './brand-voice';
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
  ScrapedTestimonial,
} from './types';

// Use OpenRouter API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://auto-social-poster.vercel.app',
    'X-Title': 'Aibility Auto Social Poster',
  },
});

/**
 * Default konfigurace
 */
const DEFAULT_CONFIG: GenerateConfig = {
  totalPosts: 14,          // 14 postů = týden po 2 denně
  daysAhead: 7,
  postsPerDay: 2,
  postTimes: ['10:00', '15:00'],
};

/**
 * Formátuj datum česky
 */
function formatCzechDate(date: Date): string {
  return format(date, "EEEE d. MMMM", { locale: cs });
}

/**
 * Různé úhly pro každý typ obsahu
 */
const CONTENT_ANGLES: Record<string, string[]> = {
  product: [
    'benefit_focused',      // Zaměř se na jeden konkrétní benefit
    'problem_solution',     // Problém → řešení
    'social_proof',         // Kdo to používá
    'urgency',              // Proč teď
    'curiosity',            // Otázka/zvědavost
    'how_it_works',         // Jak to funguje v praxi
  ],
  webinar: [
    'what_youll_learn',     // Co se naučíte
    'who_its_for',          // Pro koho je
    'speaker_expertise',    // Kdo to vede
    'practical_outcome',    // Co si odnesete
    'fomo',                 // Nenechte si ujít
  ],
  article: [
    'key_insight',          // Hlavní myšlenka
    'contrarian_view',      // Překvapivý pohled
    'actionable_tip',       // Praktický tip
    'question_hook',        // Otázka jako hook
  ],
  quote: [
    'inspirational',        // Motivační
    'thought_provoking',    // K zamyšlení
    'practical',            // Praktické
  ],
  testimonial: [
    'transformation',       // Před/po
    'specific_result',      // Konkrétní výsledek
    'emotional',            // Emocionální
  ],
};

/**
 * Vytvoř rozmanitý mix post templates
 */
function createPostTemplates(sources: ContentSources, totalPosts: number): PostTemplate[] {
  const templates: PostTemplate[] = [];
  const usedCombinations = new Set<string>();
  
  // Helper pro přidání unikátní kombinace
  const addUnique = (
    type: ContentType, 
    source: PostTemplate['source'], 
    angle: string,
    includeLink: boolean,
    linkUrl?: string
  ) => {
    const key = `${type}-${source?.id || 'none'}-${angle}`;
    if (!usedCombinations.has(key)) {
      usedCombinations.add(key);
      templates.push({ type, source, angle, includeLink, linkUrl });
    }
  };
  
  // 1. Produkty - různé úhly, s linky
  for (const product of sources.products) {
    for (const angle of CONTENT_ANGLES.product.slice(0, 3)) { // 3 úhly na produkt
      addUnique('product_benefit', product, angle, true, product.url);
    }
    addUnique('product_cta', product, 'direct_cta', true, product.url);
  }
  
  // 2. Webináře - pokud jsou
  for (const webinar of sources.webinars) {
    for (const angle of CONTENT_ANGLES.webinar.slice(0, 2)) {
      addUnique('webinar_invite', webinar, angle, true, webinar.url);
    }
    addUnique('webinar_reminder', webinar, 'fomo', true, webinar.url);
  }
  
  // 3. Blog články - různé úhly
  for (const article of sources.articles) {
    for (const angle of CONTENT_ANGLES.article) {
      addUnique('blog_insight', article, angle, true, article.url);
    }
  }
  
  // 4. Testimonials - bez linků (autenticita)
  for (const testimonial of sources.testimonials) {
    const angle = CONTENT_ANGLES.testimonial[templates.length % CONTENT_ANGLES.testimonial.length];
    addUnique('testimonial', testimonial, angle, false);
  }
  
  // 5. Quotes - mix s/bez linků
  for (const quote of sources.quotes) {
    const angle = CONTENT_ANGLES.quote[templates.length % CONTENT_ANGLES.quote.length];
    const includeLink = quote.category === 'benefit'; // Benefity s linkem na web
    addUnique('brand_mission', quote, angle, includeLink, includeLink ? 'https://aibility.cz' : undefined);
  }
  
  // 6. AI insights a tipy
  const aiTips = [
    { tip: 'Když používáš ChatGPT, začni "Jednej jako..." a dej AI roli experta.', tool: 'ChatGPT' },
    { tip: 'V Claude používej XML tagy pro strukturování složitějších promptů.', tool: 'Claude' },
    { tip: 'Cursor ti ušetří hodiny kódování. Nauč se ho ovládat za jedno odpoledne.', tool: 'Cursor' },
    { tip: 'Nejlepší prompty obsahují kontext, roli, úkol a formát výstupu.', tool: 'Prompting' },
    { tip: 'AI není věštec. Dej jí konkrétní data a dostaneš konkrétní odpovědi.', tool: 'General' },
    { tip: 'Feedback loop: ptej se AI, co by potřebovala vědět, aby ti lépe pomohla.', tool: 'Prompting' },
  ];
  
  for (const tip of aiTips) {
    addUnique('ai_tip', { id: uuid(), text: tip.tip, source: tip.tool, category: 'tip' } as ScrapedQuote, 'practical', false);
  }
  
  // Zamíchej a vyber požadovaný počet
  const shuffled = templates.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, totalPosts);
}

/**
 * Vytvoř prompt pro konkrétní template
 */
function buildPrompt(template: PostTemplate, platform: Platform): string {
  const maxLength = platform === 'x' ? 270 : 480; // Nechej prostor pro link
  const { type, source, angle, includeLink, linkUrl } = template;
  
  let prompt = `Vygeneruj ${platform === 'x' ? 'tweet' : 'Threads post'} (max ${maxLength} znaků bez linku) pro Aibility.\n\n`;
  
  // Přidej CTA info
  if (includeLink && linkUrl) {
    prompt += `NA KONEC PŘIDEJ CTA s odkazem: ${linkUrl}\n`;
    prompt += `Příklady CTA: "Víc na:", "Zjisti víc:", "Vyzkoušej:", "Přihlas se:", "Link v bio"\n\n`;
  }
  
  prompt += `ÚEL: ${angle.replace(/_/g, ' ')}\n\n`;
  
  switch (type) {
    case 'product_benefit':
    case 'product_promo':
    case 'product_cta':
      const product = source as ScrapedProduct;
      prompt += `PRODUKT: ${product.name}
Tagline: ${product.tagline}
Popis: ${product.description}
Features: ${product.features.slice(0, 3).join(', ')}

ÚHEL "${angle}":
- benefit_focused: Vyzdvihni jeden konkrétní benefit, proč ho potřebují
- problem_solution: Jaký problém řeší? Začni problémem, pak řešení
- social_proof: Pro koho je, kdo ho používá
- urgency: Proč by měli začít teď
- curiosity: Polož otázku, vzbuď zvědavost
- how_it_works: Jak to funguje v praxi (konkrétní příklad)
- direct_cta: Přímá výzva k akci`;
      break;
      
    case 'webinar_invite':
    case 'webinar_reminder':
      const webinar = source as ScrapedWebinar;
      const date = new Date(webinar.date);
      prompt += `WEBINÁŘ: ${webinar.title}
Datum: ${formatCzechDate(date)}
Čas: ${webinar.time}
Cena: ${webinar.price || 'zdarma'}
Popis: ${webinar.description}

ÚHEL "${angle}":
- what_youll_learn: Co se účastníci naučí
- who_its_for: Pro koho je webinář určen
- speaker_expertise: Proč je lektor expert
- practical_outcome: Co si odnesou domů
- fomo: Nenechte si ujít, omezená kapacita`;
      break;
      
    case 'blog_insight':
    case 'blog_quote':
    case 'blog_tip':
      const article = source as ScrapedArticle;
      prompt += `ČLÁNEK: ${article.title}
Excerpt: ${article.excerpt}
Klíčové myšlenky: ${article.keyInsights.join('; ')}

ÚHEL "${angle}":
- key_insight: Hlavní myšlenka článku
- contrarian_view: Překvapivý nebo nečekaný pohled
- actionable_tip: Praktický tip, který čtenář může hned použít
- question_hook: Začni otázkou, která zaujme`;
      break;
      
    case 'testimonial':
      const testimonial = source as ScrapedTestimonial;
      prompt += `TESTIMONIAL (anonymní):
Text: "${testimonial.text}"
Role: ${testimonial.role || 'náš zákazník'}
Kontext: ${testimonial.context || 'Aibility'}

ÚHEL "${angle}":
- transformation: Jak se změnil jejich způsob práce
- specific_result: Konkrétní výsledek, který dosáhli
- emotional: Emocionální dopad, pocit

DŮLEŽITÉ: Nepoužívej jméno, jen roli. Můžeš parafrázovat.`;
      break;
      
    case 'brand_mission':
    case 'ai_insight':
      const quote = source as ScrapedQuote;
      prompt += `QUOTE/INSIGHT:
Text: "${quote.text}"
Kategorie: ${quote.category}

Použij citát jako základ. Můžeš ho rozvinout nebo dát do kontextu.
Buď autentický, ne salesy.`;
      break;
      
    case 'ai_tip':
      const tip = source as ScrapedQuote;
      prompt += `AI TIP:
Nástroj: ${tip.source}
Tip: ${tip.text}

Napiš praktický tip, který čtenář může hned použít. Buď konkrétní.
Ukaž, že Aibility = experti na AI.`;
      break;
      
    case 'thought_leadership':
      prompt += `Vygeneruj zajímavý insight nebo pozorování o AI a práci.
Něco, co lidi zaujme a budou chtít sdílet.
Buď originální, ne klišé.`;
      break;
  }
  
  prompt += `\n\n---
PRAVIDLA:
1. Piš česky, přirozeně, jako člověk
2. Žádné generické fráze ("V dnešní době", "Není žádným tajemstvím")
3. Jeden jasný message per post
4. Emoji max 2, a jen pokud sedí
5. ${includeLink ? 'NEZAPOMEŇ na CTA s linkem na konci!' : 'Žádný link nepřidávej.'}

VRAŤ POUZE TEXT POSTU. Žádné uvozovky, žádné vysvětlení.`;
  
  return prompt;
}

/**
 * Vygeneruj jeden post
 */
async function generateSinglePost(template: PostTemplate, platform: Platform): Promise<string> {
  const prompt = buildPrompt(template, platform);
  const maxLength = platform === 'x' ? 280 : 500;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 250,
      temperature: 0.85,
    });
    
    let content = response.choices[0]?.message?.content?.trim() || '';
    
    // Ořízni pokud je moc dlouhé
    if (content.length > maxLength) {
      // Zkus najít poslední celou větu
      const lastSentence = content.substring(0, maxLength - 3).lastIndexOf('. ');
      if (lastSentence > maxLength * 0.6) {
        content = content.substring(0, lastSentence + 1);
      } else {
        content = content.substring(0, maxLength - 3) + '...';
      }
    }
    
    return content;
    
  } catch (error) {
    console.error('Error generating post:', error);
    throw error;
  }
}

/**
 * Naplánuj posty s rozmanitým střídáním typů
 */
function schedulePostsWithVariety(
  posts: { template: PostTemplate; content_x: string; content_threads: string }[],
  config: GenerateConfig
): GeneratedPost[] {
  const startDate = config.startDate ? new Date(config.startDate) : new Date();
  const scheduled: GeneratedPost[] = [];
  
  // Střídej platformy: X, Threads, X, Threads...
  let dayIndex = 0;
  let timeIndex = 0;
  let lastTypeOnDay: ContentType | null = null;
  
  for (const post of posts) {
    // Pokud je stejný typ jako předchozí na stejný den, posuň na další den
    if (post.template.type === lastTypeOnDay && timeIndex > 0) {
      dayIndex++;
      timeIndex = 0;
      lastTypeOnDay = null;
    }
    
    const time = config.postTimes[timeIndex];
    const [hours, minutes] = time.split(':').map(Number);
    
    let scheduledDate = addDays(startDate, dayIndex);
    scheduledDate = setHours(scheduledDate, hours);
    scheduledDate = setMinutes(scheduledDate, minutes);
    
    // Střídej platformy
    const platform: Platform = scheduled.length % 2 === 0 ? 'x' : 'threads';
    
    scheduled.push({
      id: uuid(),
      type: post.template.type,
      content_x: post.content_x,
      content_threads: post.content_threads,
      platform,
      scheduledFor: scheduledDate.toISOString(),
      status: 'pending',
      sourceId: post.template.source?.id,
      sourceType: getSourceType(post.template.type),
      sourceUrl: post.template.linkUrl,
      createdAt: new Date().toISOString(),
    });
    
    lastTypeOnDay = post.template.type;
    timeIndex++;
    
    if (timeIndex >= config.postsPerDay) {
      dayIndex++;
      timeIndex = 0;
      lastTypeOnDay = null;
    }
  }
  
  return scheduled;
}

/**
 * Zjisti source type podle content type
 */
function getSourceType(type: ContentType): GeneratedPost['sourceType'] {
  if (type.startsWith('webinar')) return 'webinar';
  if (type.startsWith('product')) return 'product';
  if (type.startsWith('blog')) return 'article';
  if (type === 'testimonial') return 'testimonial';
  return 'quote';
}

/**
 * Hlavní funkce pro generování
 */
export async function generatePosts(
  sources: ContentSources,
  config: Partial<GenerateConfig> = {}
): Promise<GeneratedPost[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  console.log('🤖 Creating diverse post templates...');
  
  // Vytvoř rozmanitý mix templates
  const templates = createPostTemplates(sources, cfg.totalPosts);
  
  if (templates.length === 0) {
    console.log('❌ No templates created. Check content sources.');
    return [];
  }
  
  console.log(`📝 Generated ${templates.length} unique templates`);
  
  // Generuj content pro každý template
  const posts: { template: PostTemplate; content_x: string; content_threads: string }[] = [];
  
  for (const template of templates) {
    try {
      console.log(`✍️ Generating: ${template.type} (${template.angle})`);
      
      // Generuj pro obě platformy
      const [content_x, content_threads] = await Promise.all([
        generateSinglePost(template, 'x'),
        generateSinglePost(template, 'threads'),
      ]);
      
      posts.push({ template, content_x, content_threads });
      
      // Malá pauza mezi requesty
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`❌ Failed: ${template.type}`, error);
    }
  }
  
  console.log(`✅ Generated content for ${posts.length} posts`);
  
  // Naplánuj s rozmanitým střídáním
  const scheduled = schedulePostsWithVariety(posts, cfg);
  
  console.log(`🎉 Scheduled ${scheduled.length} posts`);
  
  return scheduled;
}

export { generateSinglePost };
