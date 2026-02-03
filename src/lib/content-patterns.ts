/**
 * Content Patterns pro generování postů
 */

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
