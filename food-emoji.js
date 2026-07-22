// Deterministic food-emoji fallback — same rules as the platform's
// lib/food-emoji.ts so a dish shows the same placeholder everywhere.
const RULES = [
  [/cappuccino|espresso|koffie|coffee|latte|flat white|americano|cortado/i, '☕'],
  [/matcha|thee|tea|chai/i, '🍵'],
  [/taart|cake|cheesecake|brownie|blondie|banana ?bread|gebak|muffin/i, '🍰'],
  [/croissant|pain|viennoiserie/i, '🥐'],
  [/tosti|sandwich|panini|ciabatta|broodje|toast(?!.*avocado)/i, '🥪'],
  [/avocado/i, '🥑'],
  [/burger/i, '🍔'],
  [/pizza/i, '🍕'],
  [/salade|salad|bowl(?!.*breakfast)|poke/i, '🥗'],
  [/soep|soup|ramen|noodle/i, '🍲'],
  [/zalm|vis|tonijn|fish|garnaal|gamba|kreeft|oester/i, '🐟'],
  [/steak|rund|biefstuk|vlees|kip|chicken|spareribs|bbq/i, '🍖'],
  [/ei(eren)?\b|omelet|uitsmijter|egg/i, '🍳'],
  [/friet|fries|patat/i, '🍟'],
  [/bier|beer|ipa|pils|weizen|blond|tripel/i, '🍺'],
  [/wijn|wine|prosecco|cava|champagne|bubbels/i, '🍷'],
  [/cocktail|gin|spritz|mojito|margarita|negroni/i, '🍸'],
  [/sap|juice|smoothie|limonade|fris|cola|ice ?tea/i, '🥤'],
  [/ontbijt|breakfast|granola|yoghurt|bowl/i, '🥣'],
  [/pannenkoek|pancake|wafel|waffle|french toast/i, '🥞'],
  [/ijs|ice ?cream|gelato|sorbet/i, '🍨'],
  [/borrel|plank|bitterbal|kroket|nacho|snack/i, '🍿'],
];

export function foodEmoji(name, tags = []) {
  const hay = `${name} ${(tags || []).join(' ')}`;
  for (const [re, emoji] of RULES) if (re.test(hay)) return emoji;
  return '🍽️';
}
