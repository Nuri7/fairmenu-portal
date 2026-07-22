// Shared "Oracle" quiz engine.
// Builds questions dynamically from whatever a vendor's menu.json actually
// contains — categories, price range, and tags — so one engine serves every
// vendor regardless of their tag vocabulary. Degrades gracefully: a menu with
// no tags still gets a category + budget quiz.

const DIETARY = ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'halal', 'organic'];

// Generic/uninformative tags that shouldn't become a "vibe" choice.
const VIBE_EXCLUDE = new Set(['any', 'surprise', 'regular', 'classic', 'standard', 'normal', 'other', 'low', 'mid', 'medium']);

// Human labels for known tags (fallback: the tag itself, capitalized)
const TAG_LABELS = {
  vegan: 'Vegan', vegetarian: 'Vegetarisch', 'gluten-free': 'Glutenvrij',
  'lactose-free': 'Lactosevrij', halal: 'Halal', organic: 'Biologisch',
  spicy: 'Pittig', iced: 'IJskoud', hot: 'Warm', foamy: 'Schuimig',
  fruity: 'Fruitig', sweet: 'Zoet', high: 'Extra zoet', matcha: 'Matcha',
  fancy: 'Chic', gezellig: 'Gezellig', delen: 'Om te delen', bewust: 'Bewust',
  indulgent: 'Genieten', surprise: 'Verrassing', dessert: 'Dessert'
};

const label = (t) => TAG_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1));

// Count tag frequency across items, excluding dietary tags.
function tagFrequency(items) {
  const freq = new Map();
  for (const it of items) {
    for (const t of it.tags || []) {
      if (DIETARY.includes(t)) continue;
      if (VIBE_EXCLUDE.has(t.toLowerCase())) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  return freq;
}

// Build the question list for a given menu.
export function buildQuestions(menu) {
  const items = menu.items.filter(i => i.available !== false);
  const questions = [];

  // Q1 — category (always, if >1 category). Cap at the busiest categories so
  // menus with dozens of sections don't produce an unusable wall of buttons.
  if (menu.categories.length > 1) {
    const countByCat = new Map();
    for (const it of items) countByCat.set(it.category, (countByCat.get(it.category) || 0) + 1);
    const topCats = [...menu.categories]
      .sort((a, b) => (countByCat.get(b.id) || 0) - (countByCat.get(a.id) || 0))
      .slice(0, 8);
    questions.push({
      id: 'category',
      prompt: 'Waar heb je zin in?',
      options: [
        { label: 'Verras me', value: null },
        ...topCats.map(c => ({ label: c.name, value: c.id }))
      ]
    });
  }

  // Q2 — budget (always)
  const prices = items.map(i => i.price).filter(p => typeof p === 'number').sort((a, b) => a - b);
  if (prices.length >= 3) {
    const lo = prices[Math.floor(prices.length / 3)];
    const hi = prices[Math.floor(prices.length * 2 / 3)];
    questions.push({
      id: 'budget',
      prompt: 'Wat past bij je budget?',
      options: [
        { label: 'Maakt niet uit', value: null },
        { label: `Voordelig (tot €${Math.round(lo)})`, value: ['min', lo] },
        { label: `Middenklasse`, value: ['mid', lo, hi] },
        { label: `Ga los (€${Math.round(hi)}+)`, value: ['max', hi] }
      ]
    });
  }

  // Q3 — dietary (only if any dietary tags present)
  const dietaryPresent = DIETARY.filter(d => items.some(i => (i.tags || []).includes(d)));
  if (dietaryPresent.length) {
    questions.push({
      id: 'dietary',
      prompt: 'Dieetwensen?',
      options: [
        { label: 'Geen voorkeur', value: null },
        ...dietaryPresent.map(d => ({ label: label(d), value: d }))
      ]
    });
  }

  // Q4 — vibe (top non-dietary tags, if enough variety)
  const freq = tagFrequency(items);
  const topTags = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  if (topTags.length >= 2) {
    questions.push({
      id: 'vibe',
      prompt: 'Welke vibe?',
      options: [
        { label: 'Maakt niet uit', value: null },
        ...topTags.map(t => ({ label: label(t), value: t }))
      ]
    });
  }

  return questions;
}

// Score items against the collected answers and return ranked results.
export function recommend(menu, answers) {
  const items = menu.items.filter(i => i.available !== false);

  const scored = items.map(item => {
    let score = 0;

    // Category match — heavy
    if (answers.category && item.category === answers.category) score += 10;

    // Budget fit — medium
    if (answers.budget && typeof item.price === 'number') {
      const [mode, a, b] = answers.budget;
      if (mode === 'min' && item.price <= a) score += 5;
      else if (mode === 'mid' && item.price >= a && item.price <= b) score += 5;
      else if (mode === 'max' && item.price >= a) score += 5;
    }

    // Dietary — hard filter expressed as big bonus (and penalty if absent)
    if (answers.dietary) {
      if ((item.tags || []).includes(answers.dietary)) score += 8;
      else score -= 100; // effectively excludes non-matching items
    }

    // Vibe tag — medium
    if (answers.vibe && (item.tags || []).includes(answers.vibe)) score += 6;

    // Tiny nudge toward items that have a photo (nicer recommendation)
    if (item._hasPhoto) score += 0.5;

    return { item, score };
  });

  // Sort by score, keep only viable (>=0) items
  const viable = scored.filter(s => s.score >= 0).sort((a, b) => b.score - a.score);
  const pool = viable.length ? viable : scored.sort((a, b) => b.score - a.score);

  // If everything tied at 0 (user picked "verras me" everywhere), rotate by
  // answer count so repeat plays surface different picks.
  const topScore = pool[0].score;
  const topTies = pool.filter(s => s.score === topScore);
  const spin = Object.values(answers).filter(Boolean).length;
  const primary = topTies[spin % topTies.length].item;

  const runnersUp = pool.map(s => s.item).filter(i => i.id !== primary.id).slice(0, 2);
  return { primary, runnersUp };
}
