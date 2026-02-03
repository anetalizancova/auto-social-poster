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
 * Vytvoř VYVÁŽENÝ mix post templates - důraz na variety
 */
function createPostTemplates(sources: ContentSources, totalPosts: number): PostTemplate[] {
  const templates: PostTemplate[] = [];
  const usedSources = new Set<string>(); // Omez jeden zdroj na 1 post
  
  // Helper pro přidání
  const addTemplate = (
    type: ContentType, 
    source: PostTemplate['source'], 
    angle: string,
    includeLink: boolean,
    linkUrl?: string
  ) => {
    templates.push({ type, source, angle, includeLink, linkUrl });
  };
  
  // Shuffle helper
  const shuffle = <T>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  
  // 1. WEBINÁŘE - priorita! (30% obsahu)
  const webinarSlots = Math.ceil(totalPosts * 0.3);
  const webinars = sources.webinars || [];
  console.log(`📅 Webinars available: ${webinars.length}, slots: ${webinarSlots}`);
  if (webinars.length > 0) {
    const shuffledWebinars = shuffle(webinars);
    for (let i = 0; i < Math.min(webinarSlots, shuffledWebinars.length); i++) {
      const webinar = shuffledWebinars[i];
      const angle = CONTENT_ANGLES.webinar[i % CONTENT_ANGLES.webinar.length];
      addTemplate('webinar_invite', webinar, angle, true, webinar.url);
      console.log(`  ✅ Added webinar: ${webinar.title}`);
    }
  }
  
  // 2. PRODUKTY - Test AI Dovedností, Aimee, AI Edu Stream (25% obsahu)
  const productSlots = Math.ceil(totalPosts * 0.25);
  const products = sources.products || [];
  console.log(`🛍️ Products available: ${products.length}, slots: ${productSlots}`);
  if (products.length > 0) {
    const shuffledProducts = shuffle(products);
    for (let i = 0; i < Math.min(productSlots, shuffledProducts.length); i++) {
      const product = shuffledProducts[i];
      const angle = CONTENT_ANGLES.product[i % CONTENT_ANGLES.product.length];
      addTemplate('product_benefit', product, angle, true, product.url);
      console.log(`  ✅ Added product: ${product.name}`);
    }
  }
  
  // 3. BLOG ČLÁNKY - ale každý článek max 1x (25% obsahu)
  const articleSlots = Math.ceil(totalPosts * 0.25);
  const articles = sources.articles || [];
  console.log(`📝 Articles available: ${articles.length}, slots: ${articleSlots}`);
  if (articles.length > 0) {
    const shuffledArticles = shuffle(articles);
    for (let i = 0; i < Math.min(articleSlots, shuffledArticles.length); i++) {
      const article = shuffledArticles[i];
      const angle = CONTENT_ANGLES.article[i % CONTENT_ANGLES.article.length];
      addTemplate('blog_insight', article, angle, true, article.url);
    }
  }
  
  // 4. TESTIMONIALS (10% obsahu)
  const testimonialSlots = Math.ceil(totalPosts * 0.1);
  const testimonials = sources.testimonials || [];
  console.log(`💬 Testimonials available: ${testimonials.length}, slots: ${testimonialSlots}`);
  if (testimonials.length > 0) {
    const shuffledTestimonials = shuffle(testimonials);
    for (let i = 0; i < Math.min(testimonialSlots, shuffledTestimonials.length); i++) {
      const testimonial = shuffledTestimonials[i];
      const angle = CONTENT_ANGLES.testimonial[i % CONTENT_ANGLES.testimonial.length];
      addTemplate('testimonial', testimonial, angle, false);
    }
  }
  
  // 5. AI TIPY (10% obsahu)
  const aiTips = [
    { tip: 'Když používáte ChatGPT, začněte "Jednej jako..." a dejte AI roli experta.', tool: 'ChatGPT' },
    { tip: 'V Claude používejte XML tagy pro strukturování složitějších promptů.', tool: 'Claude' },
    { tip: 'Cursor vám ušetří hodiny práce. Naučte se ho ovládat za jedno odpoledne.', tool: 'Cursor' },
    { tip: 'Nejlepší prompty obsahují kontext, roli, úkol a formát výstupu.', tool: 'Prompting' },
    { tip: 'AI není věštec. Dejte jí konkrétní data a dostanete konkrétní odpovědi.', tool: 'General' },
    { tip: 'Feedback loop: ptejte se AI, co by potřebovala vědět, aby vám lépe pomohla.', tool: 'Prompting' },
  ];
  const tipSlots = Math.ceil(totalPosts * 0.1);
  const shuffledTips = shuffle(aiTips);
  for (let i = 0; i < Math.min(tipSlots, shuffledTips.length); i++) {
    const tip = shuffledTips[i];
    addTemplate('ai_tip', { id: uuid(), text: tip.tip, source: tip.tool, category: 'tip' } as ScrapedQuote, 'practical', false);
  }
  
  // Log template counts
  const typeCounts = templates.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`📊 Template types:`, typeCounts);
  
  // Proper Fisher-Yates shuffle
  const shuffled = [...templates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  const selected = shuffled.slice(0, totalPosts);
  console.log(`✅ Selected ${selected.length} templates from ${templates.length} total`);
  
  return selected;
}

/**
 * Vytvoř prompt pro konkrétní template
 */
function buildPrompt(template: PostTemplate, platform: Platform): string {
  const maxLength = platform === 'x' ? 270 : 480; // Nechej prostor pro link
  const { type, source, angle, includeLink, linkUrl } = template;
  
  // KRITICKÉ: Genderově neutrální jazyk
  let prompt = `⚠️ GENDEROVĚ NEUTRÁLNÍ! Tykání OK, ale NIKDY maskulinní minulý čas.
ZAKÁZÁNO: "Přemýšlel jsi", "Věděl jsi", "Chtěl bys", "Zkoušel jsi", "Narazil jsi"
MÍSTO TOHO: "Přemýšlíte...", "Věděli jste...", "Zkoušíš...", "Znáte to..."

Vygeneruj ${platform === 'x' ? 'tweet' : 'Threads post'} (max ${maxLength} znaků bez linku) pro Aibility.\n\n`;
  
  // Přidej CTA info
  if (includeLink && linkUrl) {
    prompt += `NA KONEC PŘIDEJ CTA s odkazem: ${linkUrl}\n`;
    prompt += `Příklady CTA: "Víc na:", "Zjistěte víc:", "Vyzkoušejte:", "Přihlaste se:"\n\n`;
  }
  
  prompt += `ÚHEL: ${angle.replace(/_/g, ' ')}\n\n`;
  
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
6. Tykání OK, ale NIKDY maskulinní minulý čas!
7. ZAKÁZÁNO: "Přemýšlel jsi", "Věděl jsi", "Chtěl bys", "Zkoušel jsi"
8. MÍSTO TOHO: "Přemýšlíš...", "Věděli jste...", "Znáte to...", "Zkoušíte..."

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
    
    // POST-PROCESSING: Oprav pouze MASKULINNÍ minulý čas (tykání je OK)
    const masculineFixes: [RegExp, string][] = [
      // Maskulinní minulý čas → neutrální vykání
      [/\bPřemýšlel jsi\b/gi, 'Přemýšleli jste'],
      [/\bpřemýšlel jsi\b/gi, 'přemýšleli jste'],
      [/\bSlyšel jsi\b/gi, 'Slyšeli jste'],
      [/\bslyšel jsi\b/gi, 'slyšeli jste'],
      [/\bVěděl jsi\b/gi, 'Věděli jste'],
      [/\bvěděl jsi\b/gi, 'věděli jste'],
      [/\bNarazil jsi\b/gi, 'Narazili jste'],
      [/\bnarazil jsi\b/gi, 'narazili jste'],
      [/\bZkusil jsi\b/gi, 'Zkusili jste'],
      [/\bzkusil jsi\b/gi, 'zkusili jste'],
      [/\bZkoušel jsi\b/gi, 'Zkoušeli jste'],
      [/\bzkoušel jsi\b/gi, 'zkoušeli jste'],
      [/\bViděl jsi\b/gi, 'Viděli jste'],
      [/\bviděl jsi\b/gi, 'viděli jste'],
      [/\bChtěl jsi\b/gi, 'Chtěli jste'],
      [/\bchtěl jsi\b/gi, 'chtěli jste'],
      [/\bChtěl bys\b/gi, 'Chtěli byste'],
      [/\bchtěl bys\b/gi, 'chtěli byste'],
      [/\bMohl bys\b/gi, 'Mohli byste'],
      [/\bmohl bys\b/gi, 'mohli byste'],
      [/\bMěl jsi\b/gi, 'Měli jste'],
      [/\bměl jsi\b/gi, 'měli jste'],
      [/\bByl jsi\b/gi, 'Byli jste'],
      [/\bbyl jsi\b/gi, 'byli jste'],
      [/\bDostal jsi\b/gi, 'Dostali jste'],
      [/\bdostal jsi\b/gi, 'dostali jste'],
      [/\bSetkal jsi se\b/gi, 'Setkali jste se'],
      [/\bsetkal jsi se\b/gi, 'setkali jste se'],
    ];
    
    for (const [pattern, replacement] of masculineFixes) {
      content = content.replace(pattern, replacement);
    }
    
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
  const now = new Date();
  let startDate = config.startDate ? new Date(config.startDate) : new Date();
  
  // Začni od zítřka - dnes už většinou nestíháme
  startDate = addDays(startDate, 1);
  startDate.setHours(0, 0, 0, 0);
  
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
