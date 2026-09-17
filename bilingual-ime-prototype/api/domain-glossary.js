import { domainGlossarySeedEntries } from "../src/data/domainGlossarySeed.js";

// Curated terminology for candidate hints and model translation guidance.
// Add exact Chinese terms to src/data/domainGlossarySeed.js when their
// preferred bilingual output should take priority over model translation.
export const glossaryEntries = domainGlossarySeedEntries.map((entry) => ({
  ...entry,
  en: [entry.en],
  ja: [entry.ja],
}));

export const phraseTranslations = glossaryEntries.reduce((translations, entry) => {
  ["en", "ja"].forEach((language) => {
    const preferred = entry[language]?.[0];
    if (!preferred) return;
    translations[language][entry.zh] = preferred;
    entry.aliases?.forEach((alias) => {
      translations[language][alias] = preferred;
    });
  });
  return translations;
}, { en: {}, ja: {} });

export function getRelevantGlossary(texts, targetLanguage) {
  return glossaryEntries
    .map((entry) => {
      const terms = [entry.zh, ...(entry.aliases ?? [])];
      const matchedTerm = terms.find((term) => texts.some((text) => text.includes(term)));
      const preferred = entry[targetLanguage]?.[0];
      if (!matchedTerm || !preferred) return null;
      return {
        zh: entry.zh,
        target: preferred,
        alternatives: entry[targetLanguage]?.slice(1) ?? [],
        domain: entry.domain,
        matchedTerm,
      };
    })
    .filter(Boolean);
}
