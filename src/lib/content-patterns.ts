/**
 * Content Patterns pro generování postů
 * 
 * Kombinace content-atomizer.mdc a direct-response-copy.mdc
 */

import type { ContentType, ScrapedWebinar, ScrapedProduct, ScrapedQuote } from './types';

// Patterns pro X (max 280 znaků)
export const X_PATTERNS = {
  webinar_invite: [
    '{date} v {time}: {title}. {benefit}. Link v bio.',
    '{title} - {date}. {hook}. Registrace: link v bio.',
    'Zítra/Dnes: {title}. {time}. {cta}',
    '{hook} Ukážeme to na webináři {date}. Link v bio.',
  ],
  
  product_promo: [
    '{name} - {tagline}. {price}. {cta}',
    '{benefit}. Zjistěte jak: {name}. {price}.',
    '{hook} Řešení? {name}. {cta}',
    '{name}: {feature}. {price}. Link v bio.',
  ],
  
  quote: [
    '"{text}"',
    '{text} 💡',
    'Aibility mindset: {text}',
    '{text} Souhlasíte?',
  ],
  
  tip: [
    'AI tip: {tip}',
    'Prompt hack: {tip}',
    '{tool} tip: {tip}',
    'Ušetřete čas: {tip}',
  ],
  
  highlight: [
    '3 věci z {source}: {points}',
    'Co jsme se naučili: {insight}',
    '{insight} (z {source})',
    'Zajímavost: {insight}',
  ],
};

// Patterns pro Threads (max 500 znaků)
export const THREADS_PATTERNS = {
  webinar_invite: [
    '{hook}\n\n{date} v {time} startuje {title}.\n\n{description}\n\n{cta} Link v bio.',
    'Přiznejme si to: {pain_point}.\n\nPrávě proto děláme {title}.\n\n{date}, {time}. {price}.\n\nLink v bio.',
    '{title} - {date}\n\n{benefits}\n\nRegistrace zdarma. Link v bio.',
  ],
  
  product_promo: [
    '{hook}\n\n{name} vám pomůže:\n{features}\n\n{price}. {cta}',
    'Víte, jaké to je, když {pain_point}?\n\n{name} to řeší.\n\n{tagline}\n\nLink v bio.',
    '{name}\n\n{description}\n\n{price}. Link v bio.',
  ],
  
  quote: [
    '"{text}"\n\nTohle je core toho, co v Aibility děláme. {expansion}',
    '{context}\n\n"{text}"\n\nCo si o tom myslíte?',
    'Jedna myšlenka na dnešek:\n\n"{text}"',
  ],
  
  tip: [
    '{tool} tip, který vám ušetří hodiny:\n\n{tip}\n\nVyzkoušejte a dejte vědět, jak to funguje.',
    'Praktický AI hack:\n\n{tip}\n\n{why_it_works}',
    'Tohle dělá TOP 3% AI uživatelů:\n\n{tip}\n\nJednoduché, ale většina to nedělá.',
  ],
  
  highlight: [
    'Co jsme se naučili na {source}:\n\n{points}\n\nCelý záznam v AI Edu Stream.',
    '3 takeaways z {source}:\n\n{points}\n\nKterý vás zaujal nejvíc?',
    'Highlight z {source}:\n\n{insight}\n\n{context}',
  ],
};

// Hook patterns (direct-response-copy inspired)
export const HOOK_PATTERNS = {
  direct_challenge: [
    'Používáte {tool} špatně.',
    'Většina lidí dělá {mistake}.',
    '{common_belief}? Ne tak docela.',
  ],
  
  specificity: [
    'Otestovali jsme {number} {things}. Jeden {result}.',
    'Za {time} jsme {achievement}. Tady je jak.',
    '{specific_result}. Bez {common_excuse}.',
  ],
  
  curiosity_gap: [
    'Jedna věc, kterou dělají TOP 3% {group} jinak.',
    'Tohle o {topic} vám nikdo neřekne.',
    '{question} Odpověď vás překvapí.',
  ],
  
  transformation: [
    'Z {before} na {after}. Za {time}.',
    'Dřív: {before}. Teď: {after}.',
    '{before} → {after}. Tady je jak.',
  ],
  
  confession: [
    'Přiznejme si to: {honest_truth}.',
    'Víme, jaké to je, když {relatable_moment}.',
    'Taky jsme dělali {mistake}. Pak jsme zjistili...',
  ],
};

// AI tipy pro generování
export const AI_TIPS = [
  { tool: 'Cursor', tip: 'Místo "napiš kód" řekněte "jednej jako senior developer a napiš..."' },
  { tool: 'Claude', tip: 'Používejte XML tagy pro strukturování dlouhých promptů.' },
  { tool: 'ChatGPT', tip: 'Custom instructions nastavte jednou, ušetříte hodiny týdně.' },
  { tool: 'Midjourney', tip: 'Přidejte "--style raw" pro realističtější výsledky.' },
  { tool: 'Prompt', tip: 'Začněte "Jednej jako expert na..." místo "Napiš mi..."' },
  { tool: 'AI', tip: 'Jeden prompt = jeden úkol. Složité rozdělte.' },
  { tool: 'Automatizace', tip: 'Začněte s tím, co děláte denně. Ne s tím, co je sexy.' },
  { tool: 'AI', tip: 'Feedback loop: ptejte se AI, jak prompt vylepšit.' },
];

/**
 * Vygeneruj placeholder data pro pattern
 */
export function getPlaceholders(
  type: ContentType,
  source: ScrapedWebinar | ScrapedProduct | ScrapedQuote | null
): Record<string, string> {
  const placeholders: Record<string, string> = {};
  
  if (type === 'webinar_invite' && source && 'date' in source) {
    const webinar = source as ScrapedWebinar;
    const date = new Date(webinar.date);
    
    placeholders.title = webinar.title;
    placeholders.description = webinar.description;
    placeholders.date = formatCzechDate(date);
    placeholders.time = webinar.time;
    placeholders.price = webinar.price || 'zdarma';
    placeholders.url = webinar.url;
    placeholders.cta = 'Registrujte se';
  }
  
  if (type === 'product_promo' && source && 'tagline' in source) {
    const product = source as ScrapedProduct;
    
    placeholders.name = product.name;
    placeholders.tagline = product.tagline;
    placeholders.description = product.description;
    placeholders.price = product.price;
    placeholders.features = product.features.slice(0, 3).map(f => `• ${f}`).join('\n');
    placeholders.cta = product.cta || 'Zjistit více';
  }
  
  if (type === 'quote' && source && 'text' in source) {
    const quote = source as ScrapedQuote;
    
    placeholders.text = quote.text;
    placeholders.source = quote.source;
    placeholders.category = quote.category;
  }
  
  return placeholders;
}

/**
 * Formátuj datum česky
 */
export function formatCzechDate(date: Date): string {
  const days = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const months = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 
                  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Kontrola jestli je to dnes nebo zítra
  if (date.toDateString() === today.toDateString()) {
    return 'Dnes';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Zítra';
  }
  
  // Jinak plný formát
  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  
  return `${dayName} ${dayNum}. ${monthName}`;
}
