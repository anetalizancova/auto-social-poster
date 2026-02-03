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
  
  // 1. WEBINÁŘE - priorita podle data! Nejbližší první
  const webinarSlots = Math.ceil(totalPosts * 0.3);
  const webinars = sources.webinars || [];
  console.log(`📅 Webinars available: ${webinars.length}, slots: ${webinarSlots}`);
  if (webinars.length > 0) {
    // Seřaď podle data - nejbližší první
    const sortedWebinars = [...webinars].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Rozděl na "brzy" (do 14 dnů) a "později"
    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const soonWebinars = sortedWebinars.filter(w => new Date(w.date) <= twoWeeksLater);
    const laterWebinars = sortedWebinars.filter(w => new Date(w.date) > twoWeeksLater);
    
    console.log(`  📆 Soon (≤14 days): ${soonWebinars.length}, Later: ${laterWebinars.length}`);
    
    // Priorita: nejdřív blízké webináře, pak vzdálenější
    const prioritizedWebinars = [...soonWebinars, ...shuffle(laterWebinars)];
    
    for (let i = 0; i < Math.min(webinarSlots, prioritizedWebinars.length); i++) {
      const webinar = prioritizedWebinars[i];
      const daysUntil = Math.ceil((new Date(webinar.date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const angle = CONTENT_ANGLES.webinar[i % CONTENT_ANGLES.webinar.length];
      addTemplate('webinar_invite', webinar, angle, true, webinar.url);
      console.log(`  ✅ Added webinar: ${webinar.title} (za ${daysUntil} dní)`);
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
  
  // 4. TESTIMONIALS (10% obsahu) - s linkem na Aibility
  const testimonialSlots = Math.ceil(totalPosts * 0.1);
  const testimonials = sources.testimonials || [];
  console.log(`💬 Testimonials available: ${testimonials.length}, slots: ${testimonialSlots}`);
  if (testimonials.length > 0) {
    const shuffledTestimonials = shuffle(testimonials);
    for (let i = 0; i < Math.min(testimonialSlots, shuffledTestimonials.length); i++) {
      const testimonial = shuffledTestimonials[i];
      const angle = CONTENT_ANGLES.testimonial[i % CONTENT_ANGLES.testimonial.length];
      addTemplate('testimonial', testimonial, angle, true, 'https://aibility.cz');
    }
  }
  
  // 5. AI TIPY (10% obsahu) - s linkem na Aibility
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
    // AI tipy s linkem na aibility.cz
    addTemplate('ai_tip', { id: uuid(), text: tip.tip, source: tip.tool, category: 'tip' } as ScrapedQuote, 'practical', true, 'https://aibility.cz');
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
  const maxLength = platform === 'x' ? 260 : 460; // Nechej prostor pro link
  const { type, source, angle, includeLink, linkUrl } = template;
  
  // KRITICKÉ PRAVIDLA HNED NA ZAČÁTEK
  let prompt = `⚠️ KRITICKÁ PRAVIDLA (porušení = FAIL):
1. VŽDY VYKEJ v celém postu! Nikdy nemíchej tykání a vykání!
   ✅ "Chcete vědět... Zjistěte víc:"
   ❌ "Chceš vědět... Zjistěte víc:" (ZAKÁZÁNO - míchá!)
2. NIKDY NEZMIŇUJ CENY! Žádné "Cena je X Kč", "za X Kč"
3. Max ${maxLength} znaků (bez linku)

Vygeneruj ${platform === 'x' ? 'tweet' : 'Threads post'} pro Aibility.\n\n`;
  
  // Přidej CTA info
  if (includeLink && linkUrl) {
    prompt += `📎 NA KONEC přidej CTA s linkem: ${linkUrl}
Příklady: "Víc na:", "Zjistěte víc:", "Vyzkoušejte:"\n\n`;
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

⚠️ NEZMIŇUJ CENU!

ÚHEL "${angle}":
- benefit_focused: Jeden konkrétní benefit, proč ho potřebují
- problem_solution: Problém → řešení
- social_proof: Pro koho je, kdo ho používá
- urgency: Proč začít teď
- curiosity: Otázka, vzbuď zvědavost
- how_it_works: Jak to funguje v praxi`;
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
PRAVIDLA (DODRŽUJ!):
1. CELÝ post ve VYKÁNÍ: "Chcete", "Máte", "Znáte", "Víte"
2. ŽÁDNÉ CENY - nikdy nezmiňuj kolik co stojí
3. Žádné generické fráze ("V dnešní době", "Není žádným tajemstvím")
4. Jeden jasný message per post
5. Emoji max 1-2
6. ${includeLink ? 'NA KONCI CTA s linkem!' : ''}
7. Piš jako smart kamarád, ne jako korporát

PŘÍKLAD DOBRÉHO POSTU:
"Víte, kolik času strávíte přepisováním poznámek? S AI to zvládnete za minuty. Vyzkoušejte: [link]"

VRAŤ POUZE TEXT POSTU. Žádné uvozovky.`;
  
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
    
    // POST-PROCESSING: 
    
    // 1. Odstraň ceny
    content = content.replace(/\s*Cena( je)?:?\s*\d[\d\s]*\s*Kč\.?/gi, '');
    content = content.replace(/\s*[Zz]a\s+\d[\d\s]*\s*Kč/gi, '');
    content = content.replace(/\s*\d[\d\s]*\s*Kč/gi, '');
    
    // 2. Převeď VŠECHNO tykání na vykání (ne jen maskulinní)
    const tykaníToVykání: [RegExp, string][] = [
      // Přítomný čas
      [/\bChceš\b/g, 'Chcete'],
      [/\bchceš\b/g, 'chcete'],
      [/\bMáš\b/g, 'Máte'],
      [/\bmáš\b/g, 'máte'],
      [/\bVíš\b/g, 'Víte'],
      [/\bvíš\b/g, 'víte'],
      [/\bZnáš\b/g, 'Znáte'],
      [/\bznáš\b/g, 'znáte'],
      [/\bPotřebuješ\b/g, 'Potřebujete'],
      [/\bpotřebuješ\b/g, 'potřebujete'],
      [/\bMůžeš\b/g, 'Můžete'],
      [/\bmůžeš\b/g, 'můžete'],
      [/\bUmíš\b/g, 'Umíte'],
      [/\bumíš\b/g, 'umíte'],
      [/\bZajímá tě\b/g, 'Zajímá vás'],
      [/\bzajímá tě\b/g, 'zajímá vás'],
      [/\bBavilo by tě\b/g, 'Bavilo by vás'],
      [/\bZkoušíš\b/g, 'Zkoušíte'],
      [/\bzkoušíš\b/g, 'zkoušíte'],
      [/\bPoužíváš\b/g, 'Používáte'],
      [/\bpoužíváš\b/g, 'používáte'],
      [/\bPracuješ\b/g, 'Pracujete'],
      [/\bpracuješ\b/g, 'pracujete'],
      [/\bTrávíš\b/g, 'Trávíte'],
      [/\btrávíš\b/g, 'trávíte'],
      [/\bHledáš\b/g, 'Hledáte'],
      [/\bhledáš\b/g, 'hledáte'],
      
      // Rozkazovací způsob
      [/\bNauč se\b/g, 'Naučte se'],
      [/\bnauč se\b/g, 'naučte se'],
      [/\bPřihlas se\b/g, 'Přihlaste se'],
      [/\bpřihlas se\b/g, 'přihlaste se'],
      [/\bVyzkoušej\b/g, 'Vyzkoušejte'],
      [/\bvyzkoušej\b/g, 'vyzkoušejte'],
      [/\bZkus\b/g, 'Zkuste'],
      [/\bzkus\b/g, 'zkuste'],
      [/\bPodívej se\b/g, 'Podívejte se'],
      [/\bpodívej se\b/g, 'podívejte se'],
      [/\bZjisti\b/g, 'Zjistěte'],
      [/\bzjisti\b/g, 'zjistěte'],
      
      // Minulý čas (maskulinní i obecné)
      [/\bPřemýšlel jsi\b/gi, 'Přemýšleli jste'],
      [/\bSlyšel jsi\b/gi, 'Slyšeli jste'],
      [/\bVěděl jsi\b/gi, 'Věděli jste'],
      [/\bZkoušel jsi\b/gi, 'Zkoušeli jste'],
      [/\bViděl jsi\b/gi, 'Viděli jste'],
      [/\bChtěl jsi\b/gi, 'Chtěli jste'],
      [/\bChtěl bys\b/gi, 'Chtěli byste'],
      [/\bMohl bys\b/gi, 'Mohli byste'],
      [/\bMěl jsi\b/gi, 'Měli jste'],
      [/\bNarazil jsi\b/gi, 'Narazili jste'],
      
      // Zájmena
      [/\btebe\b/g, 'vás'],
      [/\btobě\b/g, 'vám'],
      [/\btvůj\b/g, 'váš'],
      [/\btvá\b/g, 'vaše'],
      [/\btvé\b/g, 'vaše'],
      [/\btvojí\b/g, 'vaší'],
      [/\b ti \b/g, ' vám '],
      [/\b tě \b/g, ' vás '],
    ];
    
    for (const [pattern, replacement] of tykaníToVykání) {
      content = content.replace(pattern, replacement);
    }
    
    // 3. Vyčisti případné dvojité mezery
    content = content.replace(/\s+/g, ' ').trim();
    
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
