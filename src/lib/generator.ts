/**
 * AI Content Generator
 * 
 * Generuje posty pomocí OpenAI API
 */

import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import { addDays, setHours, setMinutes, format } from 'date-fns';
import { SYSTEM_PROMPT } from './brand-voice';
import { AI_TIPS, formatCzechDate } from './content-patterns';
import type { 
  ContentSources, 
  GeneratedPost, 
  ContentType, 
  Platform,
  GenerateConfig,
  ScrapedWebinar,
  ScrapedProduct,
  ScrapedQuote,
} from './types';

// Use OpenRouter API (key starts with sk-or-)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://auto-social-poster.vercel.app',
    'X-Title': 'Aibility Auto Social Poster',
  },
});

/**
 * Výchozí konfigurace
 */
const DEFAULT_CONFIG: GenerateConfig = {
  postsPerType: 6,        // 6 postů každého typu = 30 celkem
  startDate: new Date().toISOString(),
  postsPerDay: 2,
  postTimes: ['09:00', '14:00'],
};

/**
 * Generuj prompt pro konkrétní typ obsahu
 */
function buildPrompt(
  type: ContentType,
  platform: Platform,
  source: ScrapedWebinar | ScrapedProduct | ScrapedQuote | null,
  tip?: typeof AI_TIPS[0]
): string {
  const maxLength = platform === 'x' ? 280 : 500;
  
  let prompt = `Vygeneruj ${platform === 'x' ? 'tweet' : 'Threads post'} (max ${maxLength} znaků) pro Aibility.\n\n`;
  
  switch (type) {
    case 'webinar_invite':
      if (source && 'date' in source) {
        const webinar = source as ScrapedWebinar;
        const date = new Date(webinar.date);
        prompt += `Typ: Pozvánka na webinář
Název: ${webinar.title}
Datum: ${formatCzechDate(date)}
Čas: ${webinar.time}
Cena: ${webinar.price || 'zdarma'}
Popis: ${webinar.description}

Napiš engaging pozvánku. Zakonči "Link v bio." nebo podobně.`;
      }
      break;
      
    case 'product_promo':
      if (source && 'tagline' in source) {
        const product = source as ScrapedProduct;
        prompt += `Typ: Promo produktu
Produkt: ${product.name}
Tagline: ${product.tagline}
Cena: ${product.price}
Popis: ${product.description}
Features: ${product.features.join(', ')}

Napiš přesvědčivou promo. Zaměř se na benefit pro čtenáře.`;
      }
      break;
      
    case 'quote':
      if (source && 'text' in source) {
        const quote = source as ScrapedQuote;
        prompt += `Typ: Inspirativní quote/insight
Text: "${quote.text}"
Kategorie: ${quote.category}

Použij citát jako základ postu. Můžeš ho lehce rozvinout nebo dát do kontextu.`;
      }
      break;
      
    case 'tip':
      if (tip) {
        prompt += `Typ: Praktický AI tip
Nástroj: ${tip.tool}
Tip: ${tip.tip}

Napiš praktický tip, který čtenář může hned použít. Buď konkrétní.`;
      }
      break;
      
    case 'highlight':
      prompt += `Typ: Highlight/zajímavost
Téma: AI a práce

Vygeneruj zajímavý insight nebo pozorování o AI. Něco, co lidi zaujme a bude chtít sdílet.`;
      break;
  }
  
  prompt += `\n\nVRÁŤ POUZE TEXT POSTU. Žádné vysvětlení, žádné uvozovky kolem.`;
  
  return prompt;
}

/**
 * Vygeneruj jeden post pomocí AI
 */
async function generateSinglePost(
  type: ContentType,
  platform: Platform,
  source: ScrapedWebinar | ScrapedProduct | ScrapedQuote | null,
  tip?: typeof AI_TIPS[0]
): Promise<string> {
  const prompt = buildPrompt(type, platform, source, tip);
  const maxLength = platform === 'x' ? 280 : 500;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.8,
    });
    
    let content = response.choices[0]?.message?.content?.trim() || '';
    
    // Ořízni pokud je moc dlouhé
    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 3) + '...';
    }
    
    return content;
    
  } catch (error) {
    console.error('Error generating post:', error);
    throw error;
  }
}

/**
 * Naplánuj posty na konkrétní časy
 */
function schedulePost(
  startDate: Date,
  postIndex: number,
  postsPerDay: number,
  postTimes: string[]
): Date {
  const dayOffset = Math.floor(postIndex / postsPerDay);
  const timeIndex = postIndex % postsPerDay;
  const time = postTimes[timeIndex] || postTimes[0];
  
  const [hours, minutes] = time.split(':').map(Number);
  
  let scheduled = addDays(startDate, dayOffset);
  scheduled = setHours(scheduled, hours);
  scheduled = setMinutes(scheduled, minutes);
  
  return scheduled;
}

/**
 * Hlavní funkce pro bulk generování postů
 */
export async function generatePosts(
  sources: ContentSources,
  config: Partial<GenerateConfig> = {}
): Promise<GeneratedPost[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const posts: GeneratedPost[] = [];
  const startDate = new Date(cfg.startDate);
  
  console.log('🤖 Starting bulk post generation...');
  
  // Střídáme platformy: X, Threads, X, Threads...
  let postIndex = 0;
  
  // 1. Webinar invites
  for (let i = 0; i < Math.min(cfg.postsPerType, sources.webinars.length); i++) {
    const webinar = sources.webinars[i];
    const platform: Platform = postIndex % 2 === 0 ? 'x' : 'threads';
    
    try {
      const content_x = await generateSinglePost('webinar_invite', 'x', webinar);
      const content_threads = await generateSinglePost('webinar_invite', 'threads', webinar);
      
      posts.push({
        id: uuid(),
        type: 'webinar_invite',
        content_x,
        content_threads,
        platform,
        scheduledFor: schedulePost(startDate, postIndex, cfg.postsPerDay, cfg.postTimes).toISOString(),
        status: 'pending',
        sourceId: webinar.id,
        sourceType: 'webinar',
        createdAt: new Date().toISOString(),
      });
      
      postIndex++;
      console.log(`✅ Generated webinar invite: ${webinar.title}`);
    } catch (error) {
      console.error(`❌ Failed to generate for webinar: ${webinar.title}`, error);
    }
  }
  
  // 2. Product promos
  for (let i = 0; i < Math.min(cfg.postsPerType, sources.products.length); i++) {
    const product = sources.products[i];
    const platform: Platform = postIndex % 2 === 0 ? 'x' : 'threads';
    
    try {
      const content_x = await generateSinglePost('product_promo', 'x', product);
      const content_threads = await generateSinglePost('product_promo', 'threads', product);
      
      posts.push({
        id: uuid(),
        type: 'product_promo',
        content_x,
        content_threads,
        platform,
        scheduledFor: schedulePost(startDate, postIndex, cfg.postsPerDay, cfg.postTimes).toISOString(),
        status: 'pending',
        sourceId: product.id,
        sourceType: 'product',
        createdAt: new Date().toISOString(),
      });
      
      postIndex++;
      console.log(`✅ Generated product promo: ${product.name}`);
    } catch (error) {
      console.error(`❌ Failed to generate for product: ${product.name}`, error);
    }
  }
  
  // 3. Quotes
  for (let i = 0; i < Math.min(cfg.postsPerType, sources.quotes.length); i++) {
    const quote = sources.quotes[i];
    const platform: Platform = postIndex % 2 === 0 ? 'x' : 'threads';
    
    try {
      const content_x = await generateSinglePost('quote', 'x', quote);
      const content_threads = await generateSinglePost('quote', 'threads', quote);
      
      posts.push({
        id: uuid(),
        type: 'quote',
        content_x,
        content_threads,
        platform,
        scheduledFor: schedulePost(startDate, postIndex, cfg.postsPerDay, cfg.postTimes).toISOString(),
        status: 'pending',
        sourceId: quote.id,
        sourceType: 'quote',
        createdAt: new Date().toISOString(),
      });
      
      postIndex++;
      console.log(`✅ Generated quote post`);
    } catch (error) {
      console.error(`❌ Failed to generate quote post`, error);
    }
  }
  
  // 4. Tips
  for (let i = 0; i < Math.min(cfg.postsPerType, AI_TIPS.length); i++) {
    const tip = AI_TIPS[i];
    const platform: Platform = postIndex % 2 === 0 ? 'x' : 'threads';
    
    try {
      const content_x = await generateSinglePost('tip', 'x', null, tip);
      const content_threads = await generateSinglePost('tip', 'threads', null, tip);
      
      posts.push({
        id: uuid(),
        type: 'tip',
        content_x,
        content_threads,
        platform,
        scheduledFor: schedulePost(startDate, postIndex, cfg.postsPerDay, cfg.postTimes).toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      
      postIndex++;
      console.log(`✅ Generated tip: ${tip.tool}`);
    } catch (error) {
      console.error(`❌ Failed to generate tip`, error);
    }
  }
  
  // 5. Highlights
  for (let i = 0; i < cfg.postsPerType; i++) {
    const platform: Platform = postIndex % 2 === 0 ? 'x' : 'threads';
    
    try {
      const content_x = await generateSinglePost('highlight', 'x', null);
      const content_threads = await generateSinglePost('highlight', 'threads', null);
      
      posts.push({
        id: uuid(),
        type: 'highlight',
        content_x,
        content_threads,
        platform,
        scheduledFor: schedulePost(startDate, postIndex, cfg.postsPerDay, cfg.postTimes).toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      
      postIndex++;
      console.log(`✅ Generated highlight`);
    } catch (error) {
      console.error(`❌ Failed to generate highlight`, error);
    }
  }
  
  // Seřaď podle scheduled time
  posts.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  
  console.log(`🎉 Generated ${posts.length} posts total`);
  
  return posts;
}

export { generateSinglePost };
