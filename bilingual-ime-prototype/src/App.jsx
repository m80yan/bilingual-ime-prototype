import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getPinyinCandidates, remainingPinyinAfterLeadingCandidate } from "./pinyinEngine";
import cedictTranslations from "./data/cedict-en.json";
import { domainGlossarySeedEntries, glossaryEntryWeight } from "./data/domainGlossarySeed";

const localTranslations = {
  "我": { en: "I; me", ja: "私" }, "你": { en: "you", ja: "あなた" }, "他": { en: "he; him", ja: "彼" },
  "我们": { en: "we; us", ja: "私たち" }, "你们": { en: "you all", ja: "あなたたち" }, "你好": { en: "Hello", ja: "こんにちは" },
  "谢谢": { en: "Thank you", ja: "ありがとう" }, "再见": { en: "Goodbye", ja: "さようなら" }, "是": { en: "is; are", ja: "です" },
  "不是": { en: "is not", ja: "ではありません" }, "好": { en: "good", ja: "良い" }, "喜欢": { en: "like", ja: "好き" },
  "中国": { en: "China", ja: "中国" }, "中文": { en: "Chinese", ja: "中国語" }, "英语": { en: "English", ja: "英語" },
  "我爱你": { en: "I love you", ja: "愛してる" }, "我是谁": { en: "Who am I?", ja: "私は誰？" },
  "我想要去公园": { en: "I want to go to the park", ja: "公園に行きたい" },
  "今天": { en: "today", ja: "今日" }, "太好了": { en: "That’s wonderful!", ja: "すばらしい！" },
};

const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;
const secondaryLanguages = [
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];
const translationStyles = [
  { id: "daily", label: "Daily" },
  { id: "formal", label: "Formal" },
  { id: "technical", label: "Technical" },
];
const punctuationMap = {
  ",": "，",
  ".": "。",
  "?": "？",
  "!": "！",
  ";": "；",
  ":": "：",
  "(": "（",
  ")": "）",
  "/": "、",
  "\\": "、",
};
const PAGE_SIZE = 5;
const SHORT_PINYIN_CANDIDATE_LIMIT = 80;
const DEFAULT_PINYIN_CANDIDATE_LIMIT = 25;
const USER_DICTIONARY_KEY = "ime:user-dictionary";
const USER_GLOSSARY_KEY = "ime:domain-glossary";
const MISSED_QUERIES_KEY = "ime:missed-queries";
const USER_TRANSLATION_PATCHES_KEY = "ime:user-translation-patches";
const USER_LEARNING_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7;
const HISTORY_LIMIT = 80;
const emptyGlossaryDraft = { zh: "", pinyin: "", en: "", ja: "", domain: "common" };
const glossarySuggestionDomains = new Set(["design-uiux", "internet-slang", "history", "history-politics", "place", "auto", "ui", "movie", "device", "education", "business", "technology", "general"]);
const seedGlossaryEntries = domainGlossarySeedEntries.map((entry) => ({
  zh: entry.zh,
  pinyin: entry.pinyin,
  en: entry.en,
  ja: entry.ja,
  domain: entry.domain,
  locked: true,
}));
const domainContextHints = {
  "design-uiux": ["按钮", "页面", "用户", "设计", "体验", "组件", "界面", "交互", "流程", "原型", "Figma", "figma"],
  "internet-slang": ["公司", "业务", "团队", "绩效", "组织", "老板", "会议", "需求", "项目", "上线", "landing"],
  history: ["历史", "俄罗斯", "蒙古", "罗斯", "冷战", "帝国"],
  "history-politics": ["冷战", "战略", "美国", "苏联", "计划"],
};

function isChineseText(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function splitChineseSegments(text) {
  if (!text) return [];
  const matches = text.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
  return matches.map((segment) => segment.trim()).filter(Boolean);
}

function splitFinalPunctuation(text) {
  const match = text.match(/^(.*?)([。！？!?])$/);
  return match ? { body: match[1], punctuation: match[2] } : { body: text, punctuation: "" };
}

function shouldTrimSpaceBeforeChinesePunctuation(beforeCaret, text) {
  return /^[，。？！；：、]/.test(text) && /[A-Za-z0-9] $/.test(beforeCaret);
}

function targetPunctuation(mark, language) {
  if (!mark) return "";
  if (language === "ja") return mark === "？" || mark === "?" ? "？" : mark === "！" || mark === "!" ? "！" : "。";
  return mark === "？" || mark === "?" ? "?" : mark === "！" || mark === "!" ? "!" : ".";
}

function isFinalTranslationSegment(text) {
  return /[。！？!?]$/.test(text);
}

function properEnglishCandidate(zh) {
  const firstDefinition = cedictTranslations[zh]?.[0];
  const match = firstDefinition?.match(/^([A-Z][A-Za-z.'-]*(?: [A-Za-z.'-]+){0,8})(?:\s*\(|,|$)/);
  return match?.[1]?.trim() ?? "";
}

function englishCandidate(value, topChineseCandidate) {
  if (!value) return "";
  const properEnglish = topChineseCandidate ? properEnglishCandidate(topChineseCandidate) : "";
  if (properEnglish) return properEnglish;
  if (value.toLowerCase() === "pisa") return "Pizza";
  if (value !== value.toLowerCase()) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function readUserDictionary() {
  try {
    const saved = window.localStorage.getItem(USER_DICTIONARY_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function writeUserDictionary(dictionary) {
  try {
    window.localStorage.setItem(USER_DICTIONARY_KEY, JSON.stringify(dictionary));
  } catch {
    // Ignore storage failures; typing should keep working.
  }
}

function readUserGlossary() {
  try {
    const saved = window.localStorage.getItem(USER_GLOSSARY_KEY);
    const entries = saved ? JSON.parse(saved) : [];
    const userEntries = Array.isArray(entries) ? entries : [];
    const userKeys = new Set(userEntries.map((entry) => `${entry.zh}:${normalizePinyin(entry.pinyin)}`));
    return [...userEntries, ...seedGlossaryEntries.filter((entry) => !userKeys.has(`${entry.zh}:${normalizePinyin(entry.pinyin)}`))];
  } catch {
    return seedGlossaryEntries;
  }
}

function writeUserGlossary(entries) {
  try {
    window.localStorage.setItem(USER_GLOSSARY_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures; custom candidates are an enhancement.
  }
}

function readMissedQueries() {
  try {
    const saved = window.localStorage.getItem(MISSED_QUERIES_KEY);
    const entries = saved ? JSON.parse(saved) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeMissedQueries(entries) {
  try {
    window.localStorage.setItem(MISSED_QUERIES_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures; missed-query capture should never block typing.
  }
}

function readTranslationPatches() {
  try {
    const saved = window.localStorage.getItem(USER_TRANSLATION_PATCHES_KEY);
    const entries = saved ? JSON.parse(saved) : {};
    return entries && typeof entries === "object" ? entries : {};
  } catch {
    return {};
  }
}

function writeTranslationPatches(patches) {
  try {
    window.localStorage.setItem(USER_TRANSLATION_PATCHES_KEY, JSON.stringify(patches));
  } catch {
    // Ignore storage failures; user edits should not block typing.
  }
}

function normalizePinyin(value) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function userGlossaryCandidates(pinyin, entries) {
  const key = normalizePinyin(pinyin);
  if (!key) return [];
  return entries
    .filter((entry) => normalizePinyin(entry.pinyin) === key && entry.zh)
    .map((entry) => entry.zh);
}

function userGlossaryTranslation(zh, language, entries) {
  const entry = entries.find((item) => item.zh === zh);
  return entry?.[language] || null;
}

function translationCacheKey(language, style, zh, mode = "draft") {
  return mode === "final" ? `final:${language}:${style}:${zh}` : `${language}:${style}:${zh}`;
}

function frozenFinalTranslationKey(language, lineIndex, segmentIndex, zh) {
  return `final:${language}:line:${lineIndex}:segment:${segmentIndex}:${zh}`;
}

function translationPatchKey(language, style, zh) {
  return `${language}:${style}:${zh}`;
}

function relevantTranslationGlossary(texts, language, entries) {
  const normalizedTexts = texts.map((text) => text.toLowerCase());
  return entries
    .filter((entry) => entry.zh && entry[language])
    .filter((entry) => {
      const terms = [entry.zh, ...(entry.aliases ?? [])].filter(Boolean);
      return terms.some((term) => normalizedTexts.some((text) => text.includes(term.toLowerCase())));
    })
    .map((entry) => ({
      zh: entry.zh,
      target: entry[language],
      domain: entry.domain || "general",
      source: entry.locked ? "seed" : "user",
    }))
    .slice(0, 20);
}

function safeGlossarySuggestion(item, existingEntries) {
  const entry = {
    zh: typeof item.zh === "string" ? item.zh.trim() : "",
    pinyin: typeof item.pinyin === "string" ? item.pinyin.trim() : "",
    en: typeof item.en === "string" ? item.en.trim() : "",
    ja: typeof item.ja === "string" ? item.ja.trim() : "",
    domain: glossarySuggestionDomains.has(item.domain) ? item.domain : "general",
    weight: Number.isFinite(item.weight) ? Math.max(50, Math.min(130, Math.round(item.weight))) : 80,
    locked: false,
  };
  const key = `${entry.zh}:${normalizePinyin(entry.pinyin)}`;
  const isDuplicate = existingEntries.some((existing) => `${existing.zh}:${normalizePinyin(existing.pinyin)}` === key);
  const isTooGeneric = ["这个", "一个", "发现", "需要", "可以", "没有", "时候", "问题", "用户"].includes(entry.zh);
  if (!entry.zh || !entry.pinyin || !entry.en || !entry.ja) return null;
  if (!/[\u3400-\u9fff]/.test(entry.zh)) return null;
  if (!normalizePinyin(entry.pinyin)) return null;
  if (entry.zh.length === 1 || isTooGeneric || isDuplicate) return null;
  return entry;
}

function insertedTextChange(previous, next) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    inserted: next.slice(start, nextEnd),
    start,
    end: nextEnd,
  };
}

function activeDomainBoosts(context) {
  return Object.fromEntries(Object.entries(domainContextHints)
    .filter(([, hints]) => hints.some((hint) => context.includes(hint)))
    .map(([domain]) => [domain, 25]));
}

function recencyScore(lastUsedAt) {
  if (!lastUsedAt) return 0;
  const age = Math.max(0, Date.now() - lastUsedAt);
  return Math.max(0, 30 * (1 - age / USER_LEARNING_HALF_LIFE_MS));
}

function contextBoost(zh, context) {
  if (!zh || !context) return 0;
  return context.includes(zh) ? 18 : 0;
}

function rankWithUserDictionary(candidates, pinyin, dictionary, glossary, context) {
  const learned = dictionary[normalizePinyin(pinyin)] ?? {};
  const domainBoosts = activeDomainBoosts(context);
  return [...new Set(candidates)]
    .map((zh, index) => {
      const glossaryEntry = glossary.find((entry) => entry.zh === zh);
      const learnedEntry = learned[zh];
      const baseScore = Math.max(0, 100 - index * 3);
      const userScore = Math.min(60, (learnedEntry?.count ?? 0) * 16);
      return {
        zh,
        index,
        score: baseScore
          + userScore
          + recencyScore(learnedEntry?.lastUsedAt)
          + contextBoost(zh, context)
          + (glossaryEntry ? glossaryEntryWeight(glossaryEntry) * 0.45 + (domainBoosts[glossaryEntry.domain] ?? 0) : 0),
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((item) => item.zh);
}

function ScrambleText({ text, onDone }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!text) {
      setVisibleCount(0);
      return undefined;
    }

    let index = 0;
    setVisibleCount(0);
    const interval = window.setInterval(() => {
      index += 1;
      setVisibleCount(index);
      if (index >= text.length) {
        window.clearInterval(interval);
        onDone?.();
      }
    }, 18);

    return () => window.clearInterval(interval);
  }, [text]);

  return (
    <span className="typing-text">
      {text.slice(0, visibleCount).split("").map((char, index) => (
        <span className={index === visibleCount - 1 ? "typing-letter active" : "typing-letter"} key={`${char}-${index}`}>
          {char}
        </span>
      ))}
    </span>
  );
}

function StableTranslation({ text, hasPlayed, onDone }) {
  if (!text) return null;
  if (hasPlayed) return text;
  return <ScrambleText text={text} onDone={onDone} />;
}

export function App() {
  const [query, setQuery] = useState("");
  const [queryCursor, setQueryCursor] = useState(0);
  const [selected, setSelected] = useState(0);
  const [candidatePage, setCandidatePage] = useState(0);
  const [draftLines, setDraftLines] = useState([""]);
  const [softBreaks, setSoftBreaks] = useState([false]);
  const [translations, setTranslations] = useState({});
  const [userDictionary, setUserDictionary] = useState(() => readUserDictionary());
  const [userGlossary, setUserGlossary] = useState(() => readUserGlossary());
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);
  const [glossaryDraft, setGlossaryDraft] = useState(emptyGlossaryDraft);
  const [suggestCorpus, setSuggestCorpus] = useState("");
  const [suggestHints, setSuggestHints] = useState("");
  const [glossarySuggestions, setGlossarySuggestions] = useState([]);
  const [isSuggestingGlossary, setIsSuggestingGlossary] = useState(false);
  const [glossarySuggestError, setGlossarySuggestError] = useState("");
  const [missedQueries, setMissedQueries] = useState(() => readMissedQueries());
  const [translationPatches, setTranslationPatches] = useState(() => readTranslationPatches());
  const [editingTranslation, setEditingTranslation] = useState(null);
  const [playedTranslations, setPlayedTranslations] = useState({});
  const [loadingSegments, setLoadingSegments] = useState({});
  const [activeLine, setActiveLine] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [translationStyle, setTranslationStyle] = useState("daily");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [candidatePosition, setCandidatePosition] = useState({ left: 0, top: 0 });
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [allChineseSelected, setAllChineseSelected] = useState(false);
  const editorRef = useRef(null);
  const inputRefs = useRef([]);
  const previousDraftLines = useRef([""]);
  const resizeStart = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  function translationFor(zh, language, frozenKey = null) {
    const exactTranslation = (frozenKey ? translations[frozenKey] : null)
      ?? translationPatches[translationPatchKey(language, translationStyle, zh)]
      ?? translations[translationCacheKey(language, translationStyle, zh, "final")]
      ?? translations[translationCacheKey(language, translationStyle, zh)]
      ?? translations[`${language}:${zh}`]
      ?? userGlossaryTranslation(zh, language, userGlossary)
      ?? localTranslations[zh]?.[language]
      ?? (language === "en" && cedictTranslations[zh]?.length ? cedictTranslations[zh].join("; ") : null);
    if (exactTranslation) return exactTranslation;

    const { body, punctuation } = splitFinalPunctuation(zh);
    const baseTranslation = body !== zh ? translationFor(body, language) : null;
    if (baseTranslation && baseTranslation !== "…" && baseTranslation !== "翻訳中…") {
      return `${baseTranslation.replace(/[.!?。！？]$/, "")}${targetPunctuation(punctuation, language)}`;
    }

    return language === "en" ? "…" : "翻訳中…";
  }

  function punctuatedTranslationFromBase(zh, language, entries) {
    const { body, punctuation } = splitFinalPunctuation(zh);
    if (body === zh || !isChineseText(body)) return null;
    const baseTranslation = entries[translationPatchKey(language, translationStyle, body)]
      ?? entries[translationCacheKey(language, translationStyle, body, "final")]
      ?? entries[translationCacheKey(language, translationStyle, body)]
      ?? entries[`${language}:${body}`]
      ?? userGlossaryTranslation(body, language, userGlossary)
      ?? localTranslations[body]?.[language]
      ?? (language === "en" && cedictTranslations[body]?.length ? cedictTranslations[body].join("; ") : null);
    if (!baseTranslation || baseTranslation === "…" || baseTranslation === "翻訳中…") return null;
    return `${baseTranslation.replace(/[.!?。！？]$/, "")}${targetPunctuation(punctuation, language)}`;
  }

  const rankedChineseCandidates = useMemo(() => {
    const context = draftLines.join("");
    const pinyinLimit = query.length <= 6 ? SHORT_PINYIN_CANDIDATE_LIMIT : DEFAULT_PINYIN_CANDIDATE_LIMIT;
    return rankWithUserDictionary(
      [...userGlossaryCandidates(query, userGlossary), ...getPinyinCandidates(query, pinyinLimit)],
      query,
      userDictionary,
      userGlossary,
      context,
    );
  }, [query, userDictionary, userGlossary, draftLines]);

  const visibleCandidates = useMemo(() => {
    const chineseCandidates = rankedChineseCandidates.map((zh) => ({ zh, kind: "zh" }));
    const shouldPrioritizeEnglish = /[A-Z]/.test(query);
    const shouldOfferFallbackEnglish = shouldPrioritizeEnglish || !chineseCandidates.length || query.length <= 12;
    const english = shouldOfferFallbackEnglish ? englishCandidate(query, chineseCandidates[0]?.zh) : properEnglishCandidate(chineseCandidates[0]?.zh);
    const englishItem = english ? { zh: english, kind: "en" } : null;
    const matches = english
      ? shouldPrioritizeEnglish
        ? [englishItem, ...chineseCandidates].filter(Boolean)
        : [chineseCandidates[0], englishItem, ...chineseCandidates.slice(1)].filter(Boolean)
      : chineseCandidates;
    return matches.map((candidate) => ({
      ...candidate,
      en: candidate.kind === "en" ? "English" : undefined,
      ja: candidate.kind === "en" ? "英語" : undefined,
    }));
  }, [query, rankedChineseCandidates]);
  const pageCount = Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE));
  const pagedCandidates = visibleCandidates.slice(candidatePage * PAGE_SIZE, candidatePage * PAGE_SIZE + PAGE_SIZE);
  const selectedCandidate = pagedCandidates[selected];
  const footerLanguageLabel = secondaryLanguage === "ja" ? "Japanese" : "English";

  useEffect(() => { setSelected(0); setCandidatePage(0); }, [query]);

  useEffect(() => {
    const key = normalizePinyin(query);
    if (key.length < 6 || rankedChineseCandidates.length) return;
    recordMissedQuery(key, "no_chinese_candidates");
  }, [query, rankedChineseCandidates]);

  useEffect(() => {
    setQueryCursor((current) => Math.min(current, query.length));
  }, [query]);

  useLayoutEffect(() => {
    updateCandidatePosition();
  }, [query, activeLine, draftLines, windowSize]);

  useEffect(() => {
    const segmentInstances = draftLines.flatMap((line, lineIndex) => (
      splitChineseSegments(line).map((segment, segmentIndex) => ({
        zh: segment,
        lineIndex,
        segmentIndex,
        frozenKey: frozenFinalTranslationKey(secondaryLanguage, lineIndex, segmentIndex, segment),
        isFinal: isFinalTranslationSegment(segment) || lineIndex < draftLines.length - 1,
      }))
    )).filter(({ zh }) => isChineseText(zh));
    const filledSegments = segmentInstances.map(({ zh }) => zh);
    const selectedCandidateText = query && selectedCandidate?.kind !== "en" ? selectedCandidate?.zh : null;
    if (!filledSegments.length && !selectedCandidateText) {
      setLoadingSegments({});
      return undefined;
    }

    if (query) {
      setLoadingSegments({});
    } else {
      const previousSegments = previousDraftLines.current.flatMap(splitChineseSegments);
      const previousBodies = previousSegments.map((segment) => splitFinalPunctuation(segment).body);
      const segmentKeys = {};
      draftLines.forEach((line, lineIndex) => {
        splitChineseSegments(line).forEach((segment) => {
          const body = splitFinalPunctuation(segment).body;
          segmentKeys[segment] = isChineseText(segment) && !previousSegments.includes(segment) && !previousBodies.includes(body);
        });
      });
      previousSegments
        .filter((segment) => !filledSegments.includes(segment))
        .forEach((segment) => { segmentKeys[`removed:${segment}`] = false; });
      previousDraftLines.current = draftLines;
      setLoadingSegments(segmentKeys);
    }

    const pendingSource = query ? [selectedCandidateText] : segmentInstances.filter((instance) => !instance.isFinal).map((instance) => instance.zh);
    const pendingDraft = [...new Set(pendingSource.filter(Boolean))]
      .filter((zh) => !localTranslations[zh]?.[secondaryLanguage]
        && !(splitFinalPunctuation(zh).body !== zh && translationFor(splitFinalPunctuation(zh).body, secondaryLanguage) !== (secondaryLanguage === "en" ? "…" : "翻訳中…"))
        && !userGlossaryTranslation(zh, secondaryLanguage, userGlossary)
        && !(secondaryLanguage === "en" && cedictTranslations[zh]?.length)
        && !translations[translationCacheKey(secondaryLanguage, translationStyle, zh)]);
    const pendingFinalInstances = query ? [] : segmentInstances
      .filter((instance) => instance.isFinal)
      .filter(({ frozenKey }) => !translations[frozenKey]);
    const existingFinalEntries = pendingFinalInstances.flatMap(({ zh, frozenKey }) => {
      const existingTranslation = punctuatedTranslationFromBase(zh, secondaryLanguage, translations)
        ?? translations[translationCacheKey(secondaryLanguage, translationStyle, zh, "final")]
        ?? translations[translationCacheKey(secondaryLanguage, translationStyle, zh)]
        ?? translations[`${secondaryLanguage}:${zh}`]
        ?? userGlossaryTranslation(zh, secondaryLanguage, userGlossary)
        ?? localTranslations[zh]?.[secondaryLanguage]
        ?? (secondaryLanguage === "en" && cedictTranslations[zh]?.length ? cedictTranslations[zh].join("; ") : null);
      return existingTranslation ? [[frozenKey, existingTranslation]] : [];
    });
    if (existingFinalEntries.length) {
      setTranslations((current) => ({ ...current, ...Object.fromEntries(existingFinalEntries) }));
    }
    const pendingFinal = [...new Set(pendingFinalInstances
      .filter(({ frozenKey }) => !existingFinalEntries.some(([key]) => key === frozenKey))
      .map(({ zh }) => zh))];
    const requests = [
      { mode: "draft", texts: pendingDraft },
      { mode: "final", texts: pendingFinal },
    ].filter((request) => request.texts.length);

    if (!requests.length) {
      const settle = window.setTimeout(() => setLoadingSegments({}), 360);
      return () => window.clearTimeout(settle);
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      try {
        const resultsByMode = await Promise.all(requests.map(async (request) => {
          const response = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              texts: request.texts,
              targetLanguage: secondaryLanguage,
              style: translationStyle,
              mode: request.mode,
              context: draftLines.join("\n"),
              glossaryEntries: relevantTranslationGlossary(request.texts, secondaryLanguage, userGlossary),
            }),
            signal: controller.signal,
          });
          if (!response.ok) return null;
          const { translations: results } = await response.json();
          return results ? { mode: request.mode, results } : null;
        }));
        const entries = resultsByMode
          .filter(Boolean)
          .flatMap(({ mode, results }) => Object.entries(results).flatMap(([zh, translation]) => [
            [
              mode === "final" ? translationCacheKey(secondaryLanguage, translationStyle, zh, "final") : translationCacheKey(secondaryLanguage, translationStyle, zh),
              translation,
            ],
            ...(mode === "final"
              ? pendingFinalInstances
                  .filter((instance) => instance.zh === zh)
                  .map((instance) => [instance.frozenKey, translation])
              : []),
          ]));
        if (entries.length) {
          setTranslations((current) => ({ ...current, ...Object.fromEntries(entries) }));
        }
      } catch (error) {
        if (error.name !== "AbortError") console.warn("Translation service is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoadingSegments({});
      }
    }, 300);

    return () => { window.clearTimeout(debounce); controller.abort(); };
  }, [query, selectedCandidate?.zh, selectedCandidate?.kind, draftLines, secondaryLanguage, translationStyle, userGlossary]);

  useEffect(() => {
    function resize(event) {
      if (!resizeStart.current) return;
      const { x, y, width, height } = resizeStart.current;
      setWindowSize({ width: Math.max(MIN_WIDTH, width + event.clientX - x), height: Math.max(MIN_HEIGHT, height + event.clientY - y) });
    }
    function stop() { resizeStart.current = null; setResizing(false); }
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", resize); window.removeEventListener("pointerup", stop); };
  }, []);

  useEffect(() => {
    function openGlossary(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsGlossaryOpen(true);
      }
    }
    window.addEventListener("keydown", openGlossary);
    return () => window.removeEventListener("keydown", openGlossary);
  }, []);

  function replaceDraftSelection(text) {
    if (allChineseSelected) {
      setAllChineseSelected(false);
      setDraftLines([text]);
      setSoftBreaks([false]);
      setActiveLine(0);
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
        inputRefs.current[0]?.setSelectionRange(text.length, text.length);
      });
      return;
    }

    const editor = inputRefs.current[activeLine];
    const currentLine = draftLines[activeLine] ?? "";
    const start = editor?.selectionStart ?? currentLine.length;
    const end = editor?.selectionEnd ?? start;
    const trimPreviousSpace = shouldTrimSpaceBeforeChinesePunctuation(currentLine.slice(0, start), text);
    const insertStart = trimPreviousSpace ? start - 1 : start;
    const next = `${currentLine.slice(0, insertStart)}${text}${currentLine.slice(end)}`;
    setDraftLines((current) => current.map((line, index) => (index === activeLine ? next : line)));
    requestAnimationFrame(() => {
      inputRefs.current[activeLine]?.focus();
      inputRefs.current[activeLine]?.setSelectionRange(insertStart + text.length, insertStart + text.length);
    });
  }

  function editorSnapshot() {
    const editor = inputRefs.current[activeLine];
    const currentLine = draftLines[activeLine] ?? "";
    const cursorStart = editor?.selectionStart ?? currentLine.length;
    const cursorEnd = editor?.selectionEnd ?? cursorStart;
    return {
      draftLines,
      softBreaks,
      query,
      queryCursor,
      activeLine,
      allChineseSelected,
      cursorStart,
      cursorEnd,
    };
  }

  function restoreEditorSnapshot(snapshot) {
    setDraftLines(snapshot.draftLines);
    setSoftBreaks(snapshot.softBreaks);
    setQuery(snapshot.query);
    setQueryCursor(snapshot.queryCursor);
    setActiveLine(snapshot.activeLine);
    setAllChineseSelected(snapshot.allChineseSelected);
    requestAnimationFrame(() => {
      const editor = inputRefs.current[snapshot.activeLine];
      editor?.focus();
      editor?.setSelectionRange(snapshot.cursorStart, snapshot.cursorEnd);
      updateCandidatePosition();
    });
  }

  function pushUndoSnapshot() {
    undoStack.current = [...undoStack.current, editorSnapshot()].slice(-HISTORY_LIMIT);
    redoStack.current = [];
  }

  function undoEditorChange() {
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, editorSnapshot()].slice(-HISTORY_LIMIT);
    restoreEditorSnapshot(previous);
  }

  function redoEditorChange() {
    const next = redoStack.current.at(-1);
    if (!next) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, editorSnapshot()].slice(-HISTORY_LIMIT);
    restoreEditorSnapshot(next);
  }

  function updateCandidatePosition() {
    const editor = editorRef.current;
    const textarea = inputRefs.current[activeLine];
    if (!editor || !textarea) return;

    const computed = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const caretIndex = textarea.selectionStart ?? textarea.value.length;
    const beforeCaret = textarea.value.slice(0, caretIndex);
    const textareaRect = textarea.getBoundingClientRect();

    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.left = `${textareaRect.left}px`;
    mirror.style.top = `${textareaRect.top}px`;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordBreak = computed.wordBreak;
    mirror.style.overflowWrap = computed.overflowWrap;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.font = computed.font;
    mirror.style.fontWeight = computed.fontWeight;
    mirror.style.fontSize = computed.fontSize;
    mirror.style.fontFamily = computed.fontFamily;
    mirror.style.lineHeight = computed.lineHeight;
    mirror.style.letterSpacing = computed.letterSpacing;
    mirror.style.padding = computed.padding;
    mirror.style.border = computed.border;
    mirror.style.boxSizing = computed.boxSizing;
    mirror.textContent = beforeCaret || "";
    marker.textContent = "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const candidateTop = markerRect.bottom + 18;

    document.body.removeChild(mirror);
    setCandidatePosition({
      left: markerRect.right,
      top: Math.max(0, candidateTop),
    });
  }

  function focusEditorFromWritingArea(event) {
    if (event.target.closest("textarea, input, button, select, .candidate-picker, .glossary-overlay")) return;
    const targetLine = inputRefs.current[activeLine] ? activeLine : Math.max(0, draftLines.length - 1);
    const target = inputRefs.current[targetLine];
    if (!target) return;
    setAllChineseSelected(false);
    setActiveLine(targetLine);
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
      updateCandidatePosition();
    });
  }

  function commit(candidate = pagedCandidates[selected], suffix = "") {
    if (!candidate && !suffix) return;
    pushUndoSnapshot();
    const remainingQuery = candidate?.kind !== "en" && !suffix ? remainingPinyinAfterLeadingCandidate(query, candidate.zh) : "";
    if (candidate?.kind !== "en" && query) {
      setUserDictionary((current) => {
        const key = normalizePinyin(query);
        const existing = current[key]?.[candidate.zh];
        const next = {
          ...current,
          [key]: {
            ...(current[key] ?? {}),
            [candidate.zh]: {
              count: (existing?.count ?? 0) + 1,
              lastUsedAt: Date.now(),
            },
          },
        };
        writeUserDictionary(next);
        return next;
      });
    }
    replaceDraftSelection(`${candidate?.zh ?? ""}${suffix}`);
    setQuery(remainingQuery);
    setQueryCursor(remainingQuery.length);
  }

  function clearLearningData() {
    writeUserDictionary({});
    setUserDictionary({});
  }

  function recordMissedQuery(pinyin, reason) {
    const key = normalizePinyin(pinyin);
    if (key.length < 4) return;
    const context = draftLines.join("\n").slice(-240);
    setMissedQueries((current) => {
      const existing = current.find((item) => item.pinyin === key);
      const nextEntry = {
        pinyin: key,
        context,
        reason,
        count: (existing?.count ?? 0) + 1,
        lastSeenAt: Date.now(),
      };
      const next = [nextEntry, ...current.filter((item) => item.pinyin !== key)]
        .sort((left, right) => (right.count - left.count) || (right.lastSeenAt - left.lastSeenAt))
        .slice(0, 80);
      writeMissedQueries(next);
      return next;
    });
  }

  function handleKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoEditorChange();
      else undoEditorChange();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoEditorChange();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setQuery("");
      setQueryCursor(0);
      setAllChineseSelected(true);
      return;
    }
    if (allChineseSelected && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      navigator.clipboard?.writeText(draftLines.join("\n"));
      return;
    }
    if (allChineseSelected && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      pushUndoSnapshot();
      navigator.clipboard?.writeText(draftLines.join("\n"));
      setDraftLines([""]);
      setSoftBreaks([false]);
      setAllChineseSelected(false);
      setActiveLine(0);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
      return;
    }
    if (allChineseSelected && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      pushUndoSnapshot();
      setDraftLines([""]);
      setSoftBreaks([false]);
      setAllChineseSelected(false);
      setActiveLine(0);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
      return;
    }
    if (allChineseSelected && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      setAllChineseSelected(false);
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowDown" && query && pagedCandidates.length) { event.preventDefault(); setSelected((current) => (current + 1) % pagedCandidates.length); }
    else if (event.key === "ArrowUp" && query && pagedCandidates.length) { event.preventDefault(); setSelected((current) => (current - 1 + pagedCandidates.length) % pagedCandidates.length); }
    else if (event.key === "ArrowDown" && !query && activeLine < draftLines.length - 1) {
      event.preventDefault();
      const nextLine = activeLine + 1;
      const column = inputRefs.current[activeLine]?.selectionStart ?? draftLines[activeLine].length;
      setActiveLine(nextLine);
      requestAnimationFrame(() => {
        inputRefs.current[nextLine]?.focus();
        inputRefs.current[nextLine]?.setSelectionRange(Math.min(column, draftLines[nextLine].length), Math.min(column, draftLines[nextLine].length));
        updateCandidatePosition();
      });
    }
    else if (event.key === "ArrowUp" && !query && activeLine > 0) {
      event.preventDefault();
      const nextLine = activeLine - 1;
      const column = inputRefs.current[activeLine]?.selectionStart ?? draftLines[activeLine].length;
      setActiveLine(nextLine);
      requestAnimationFrame(() => {
        inputRefs.current[nextLine]?.focus();
        inputRefs.current[nextLine]?.setSelectionRange(Math.min(column, draftLines[nextLine].length), Math.min(column, draftLines[nextLine].length));
        updateCandidatePosition();
      });
    }
    else if (event.key === "ArrowLeft" && query) { event.preventDefault(); setQueryCursor((current) => Math.max(0, current - 1)); }
    else if (event.key === "ArrowRight" && query) { event.preventDefault(); setQueryCursor((current) => Math.min(query.length, current + 1)); }
    else if (event.key === "-" && query && candidatePage > 0) { event.preventDefault(); setCandidatePage((current) => Math.max(0, current - 1)); setSelected(0); }
    else if (event.key === "=" && query && candidatePage < pageCount - 1) {
      event.preventDefault();
      const nextPage = Math.min(pageCount - 1, candidatePage + 1);
      if (nextPage === pageCount - 1) recordMissedQuery(query, "reached_last_candidate_page");
      setCandidatePage(nextPage);
      setSelected(0);
    }
    else if ((event.key === "Enter" || event.key === " ") && query && pagedCandidates.length) {
      event.preventDefault();
      const candidate = pagedCandidates[selected];
      commit(candidate, event.key === " " && candidate?.kind === "en" ? " " : "");
    }
    else if (event.key === "Enter" && !query) {
      event.preventDefault();
      pushUndoSnapshot();
      const editor = inputRefs.current[activeLine];
      const currentLine = draftLines[activeLine] ?? "";
      const start = editor?.selectionStart ?? currentLine.length;
      const end = editor?.selectionEnd ?? start;
      const before = currentLine.slice(0, start);
      const after = currentLine.slice(end);
      setDraftLines((current) => {
        const next = [...current];
        next[activeLine] = before;
        next.splice(activeLine + 1, 0, after);
        return next;
      });
      setSoftBreaks((current) => {
        const next = [...current];
        next.splice(activeLine + 1, 0, true);
        return next;
      });
      const nextLine = activeLine + 1;
      setActiveLine(nextLine);
      requestAnimationFrame(() => {
        inputRefs.current[nextLine]?.focus();
        inputRefs.current[nextLine]?.setSelectionRange(0, 0);
        updateCandidatePosition();
      });
    }
    else if (/^[1-5]$/.test(event.key) && pagedCandidates[Number(event.key) - 1]) { event.preventDefault(); commit(pagedCandidates[Number(event.key) - 1]); }
    else if (punctuationMap[event.key]) { event.preventDefault(); commit(query ? pagedCandidates[selected] : null, punctuationMap[event.key]); }
    else if (event.key === "Backspace" && query) {
      event.preventDefault();
      if (queryCursor > 0) {
        pushUndoSnapshot();
        setQuery((current) => `${current.slice(0, queryCursor - 1)}${current.slice(queryCursor)}`);
        setQueryCursor((current) => Math.max(0, current - 1));
      }
    }
    else if (event.key === "Delete" && query) {
      event.preventDefault();
      pushUndoSnapshot();
      setQuery((current) => `${current.slice(0, queryCursor)}${current.slice(queryCursor + 1)}`);
    }
    else if (event.key === "Backspace" && !query && activeLine > 0) {
      const editor = inputRefs.current[activeLine];
      const start = editor?.selectionStart ?? 0;
      const end = editor?.selectionEnd ?? start;
      if (start === 0 && end === 0) {
        event.preventDefault();
        pushUndoSnapshot();
        const previousLine = activeLine - 1;
        const previousLength = draftLines[previousLine]?.length ?? 0;
        setDraftLines((current) => {
          const next = [...current];
          next[previousLine] = `${next[previousLine] ?? ""}${next[activeLine] ?? ""}`;
          next.splice(activeLine, 1);
          return next;
        });
        setSoftBreaks((current) => current.filter((_, index) => index !== activeLine));
        setActiveLine(previousLine);
        requestAnimationFrame(() => {
          inputRefs.current[previousLine]?.focus();
          inputRefs.current[previousLine]?.setSelectionRange(previousLength, previousLength);
          updateCandidatePosition();
        });
      }
    }
    else if (event.key === "Delete" && !query && activeLine < draftLines.length - 1) {
      const editor = inputRefs.current[activeLine];
      const currentLine = draftLines[activeLine] ?? "";
      const start = editor?.selectionStart ?? currentLine.length;
      const end = editor?.selectionEnd ?? start;
      if (start === currentLine.length && end === currentLine.length) {
        event.preventDefault();
        pushUndoSnapshot();
        setDraftLines((current) => {
          const next = [...current];
          next[activeLine] = `${next[activeLine] ?? ""}${next[activeLine + 1] ?? ""}`;
          next.splice(activeLine + 1, 1);
          return next;
        });
        setSoftBreaks((current) => current.filter((_, index) => index !== activeLine + 1));
        requestAnimationFrame(() => {
          inputRefs.current[activeLine]?.focus();
          inputRefs.current[activeLine]?.setSelectionRange(currentLine.length, currentLine.length);
          updateCandidatePosition();
        });
      }
    }
    else if (event.key === "Backspace" && !query && !draftLines[activeLine] && draftLines.length > 1) {
      event.preventDefault();
      pushUndoSnapshot();
      const previousLine = Math.max(0, activeLine - 1);
      setDraftLines((current) => current.filter((_, index) => index !== activeLine));
      setSoftBreaks((current) => current.filter((_, index) => index !== activeLine));
      setActiveLine(previousLine);
      requestAnimationFrame(() => inputRefs.current[previousLine]?.focus());
    }
    else if (/^[a-z]$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      pushUndoSnapshot();
      const letter = event.key;
      setQuery((current) => `${current.slice(0, queryCursor)}${letter}${current.slice(queryCursor)}`);
      setQueryCursor((current) => current + 1);
    }
  }

  function handleDraftChange(event, lineIndex) {
    setAllChineseSelected(false);
    const next = event.target.value;
    const previous = draftLines[lineIndex] ?? "";
    if (next === previous) return;
    pushUndoSnapshot();
    const change = insertedTextChange(previous, next);
    const isCompositionInput = /^[a-z=-]+$/i.test(change.inserted);
    if (!isCompositionInput) {
      setDraftLines((current) => current.map((line, index) => (index === lineIndex ? next : line)));
      return;
    }

    const pinyin = change.inserted.match(/[a-z]+/gi)?.join("") ?? "";
    if (query && change.inserted.includes("=") && candidatePage < pageCount - 1) {
      setCandidatePage((current) => Math.min(pageCount - 1, current + 1));
      setSelected(0);
    }
    if (query && change.inserted.includes("-") && candidatePage > 0) {
      setCandidatePage((current) => Math.max(0, current - 1));
      setSelected(0);
    }
    const cleanedInserted = change.inserted.replace(/[a-z=-]+/gi, "");
    const cleanedNext = `${next.slice(0, change.start)}${cleanedInserted}${next.slice(change.end)}`;
    setDraftLines((current) => current.map((line, index) => (index === lineIndex ? cleanedNext : line)));
    if (pinyin) {
      setQuery((current) => `${current.slice(0, queryCursor)}${pinyin}${current.slice(queryCursor)}`);
      setQueryCursor((current) => current + pinyin.length);
    }
  }

  function startResize(event) {
    event.preventDefault();
    resizeStart.current = { x: event.clientX, y: event.clientY, ...windowSize };
    setResizing(true);
  }

  function selectSecondaryLanguage(languageId) {
    setSecondaryLanguage(languageId);
    setIsSecondaryMenuOpen(false);
  }

  function selectTranslationStyle(styleId) {
    setTranslationStyle(styleId);
    setIsStyleMenuOpen(false);
  }

  function updateGlossaryDraft(field, value) {
    setGlossaryDraft((current) => ({ ...current, [field]: value }));
  }

  function saveGlossaryEntry(event) {
    event.preventDefault();
    const entry = {
      zh: glossaryDraft.zh.trim(),
      pinyin: glossaryDraft.pinyin.trim(),
      en: glossaryDraft.en.trim(),
      ja: glossaryDraft.ja.trim(),
      domain: glossaryDraft.domain.trim() || "common",
      locked: false,
    };
    if (!entry.zh || !entry.pinyin) return;
    setUserGlossary((current) => {
      const withoutDuplicate = current.filter((item) => !(item.zh === entry.zh && normalizePinyin(item.pinyin) === normalizePinyin(entry.pinyin)));
      const next = [entry, ...withoutDuplicate].slice(0, 200);
      writeUserGlossary(next);
      return next;
    });
    setTranslations((current) => ({
      ...current,
      ...(entry.en ? { [translationCacheKey("en", translationStyle, entry.zh)]: entry.en, [`en:${entry.zh}`]: entry.en } : {}),
      ...(entry.ja ? { [translationCacheKey("ja", translationStyle, entry.zh)]: entry.ja, [`ja:${entry.zh}`]: entry.ja } : {}),
    }));
    setGlossaryDraft(emptyGlossaryDraft);
  }

  function removeGlossaryEntry(indexToRemove) {
    setUserGlossary((current) => {
      const next = current.filter((_, index) => index !== indexToRemove);
      writeUserGlossary(next);
      return next;
    });
  }

  async function generateGlossarySuggestions() {
    const texts = suggestCorpus.split(/\n+/).map((text) => text.trim()).filter(Boolean);
    const hints = suggestHints.split(/[\n,，、]+/).map((hint) => hint.trim()).filter(Boolean);
    if (!texts.length && !hints.length) {
      setGlossarySuggestError("Paste corpus or hints first.");
      return;
    }

    setIsSuggestingGlossary(true);
    setGlossarySuggestError("");
    try {
      const response = await fetch("/api/glossary-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, hints, limit: 16 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Suggestion failed.");
      setGlossarySuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
    } catch (error) {
      setGlossarySuggestError(error.message || "Suggestion failed.");
    } finally {
      setIsSuggestingGlossary(false);
    }
  }

  async function generateGlossarySuggestionsFromMissed() {
    const topMisses = missedQueries.slice(0, 16);
    if (!topMisses.length) {
      setGlossarySuggestError("No missed queries captured yet.");
      return;
    }

    setIsSuggestingGlossary(true);
    setGlossarySuggestError("");
    try {
      const response = await fetch("/api/glossary-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: topMisses.map((item) => item.context).filter(Boolean),
          hints: topMisses.map((item) => item.pinyin),
          limit: 16,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Suggestion failed.");
      setGlossarySuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
    } catch (error) {
      setGlossarySuggestError(error.message || "Suggestion failed.");
    } finally {
      setIsSuggestingGlossary(false);
    }
  }

  function clearMissedQueries() {
    writeMissedQueries([]);
    setMissedQueries([]);
  }

  function addSafeGlossarySuggestions() {
    const safeEntries = glossarySuggestions
      .map((item) => safeGlossarySuggestion(item, userGlossary))
      .filter(Boolean);
    if (!safeEntries.length) {
      setGlossarySuggestError("No safe new suggestions to add.");
      return;
    }

    setUserGlossary((current) => {
      const existingKeys = new Set(current.map((entry) => `${entry.zh}:${normalizePinyin(entry.pinyin)}`));
      const additions = safeEntries.filter((entry) => {
        const key = `${entry.zh}:${normalizePinyin(entry.pinyin)}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      const next = [...additions, ...current].slice(0, 260);
      writeUserGlossary(next);
      return next;
    });
    setTranslations((current) => ({
      ...current,
      ...Object.fromEntries(safeEntries.flatMap((entry) => [
        entry.en ? [translationCacheKey("en", translationStyle, entry.zh), entry.en] : null,
        entry.en ? [`en:${entry.zh}`, entry.en] : null,
        entry.ja ? [translationCacheKey("ja", translationStyle, entry.zh), entry.ja] : null,
        entry.ja ? [`ja:${entry.zh}`, entry.ja] : null,
      ].filter(Boolean))),
    }));
    setGlossarySuggestError("");
  }

  function saveTranslationPatch(key, value) {
    const text = value.trim();
    setEditingTranslation(null);
    if (!text || !key?.zh) return;
    setTranslationPatches((current) => {
      const next = {
        ...current,
        [translationPatchKey(key.language, key.style, key.zh)]: text,
      };
      writeTranslationPatches(next);
      return next;
    });
    setTranslations((current) => ({
      ...current,
      [translationCacheKey(key.language, key.style, key.zh)]: text,
      [translationCacheKey(key.language, key.style, key.zh, "final")]: text,
    }));
  }

  function translationPair(item) {
    return {
      primary: item.zh,
      secondary: item[secondaryLanguage] ?? item.en ?? translationFor(item.zh, secondaryLanguage),
    };
  }

  function renderSecondarySegments(line, lineIndex) {
    return splitChineseSegments(line).map((segment, segmentIndex) => {
      const secondary = translationFor(segment, secondaryLanguage, frozenFinalTranslationKey(secondaryLanguage, lineIndex, segmentIndex, segment));
      const translationKey = `${secondaryLanguage}:${lineIndex}:${segmentIndex}:${segment}:${secondary}`;
      const needsSpace = segmentIndex > 0;

      return (
        <span className="translation-segment" key={`${segment}-${segmentIndex}`}>
          {needsSpace ? " " : ""}
          {loadingSegments[segment]
            ? <span className="translation-shimmer segment-shimmer" aria-label="Translating" />
            : editingTranslation?.zh === segment && editingTranslation?.language === secondaryLanguage && editingTranslation?.style === translationStyle
              ? <input
                  autoFocus
                  className="translation-edit"
                  defaultValue={editingTranslation.value}
                  style={{ width: `min(${Math.max(24, editingTranslation.value.length + 2)}ch, calc(100vw - 48px))` }}
                  onBlur={(event) => saveTranslationPatch(editingTranslation, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveTranslationPatch(editingTranslation, event.currentTarget.value);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingTranslation(null);
                    }
                  }}
                />
              : <span
                  className="translation-editable"
                  title="Double-click to edit translation"
                  onDoubleClick={() => setEditingTranslation({
                    zh: segment,
                    language: secondaryLanguage,
                    style: translationStyle,
                    value: secondary,
                  })}
                >
                  <StableTranslation
                    text={secondary}
                    hasPlayed={Boolean(playedTranslations[translationKey])}
                    onDone={() => setPlayedTranslations((current) => ({ ...current, [translationKey]: true }))}
                  />
                </span>}
        </span>
      );
    });
  }

  function secondaryLanguageCombo() {
    const selectedLanguage = secondaryLanguages.find((language) => language.id === secondaryLanguage);

    return (
      <div className="language-combo secondary-combo">
        <button
          className="language-control"
          type="button"
          aria-label={`Secondary language: ${selectedLanguage.label}`}
          aria-expanded={isSecondaryMenuOpen}
          onClick={() => setIsSecondaryMenuOpen(!isSecondaryMenuOpen)}
        >
          <span>{selectedLanguage.label}</span><img src="/assets/figma-triangle.svg" alt="" />
        </button>
        {isSecondaryMenuOpen && (
          <div className="language-list" role="listbox" aria-label="secondary language choices">
            {secondaryLanguages.map((language) => (
              <button
                className={language.id === secondaryLanguage ? "language-option selected" : "language-option"}
                key={language.id}
                type="button"
                role="option"
                aria-selected={language.id === secondaryLanguage}
                onClick={() => selectSecondaryLanguage(language.id)}
              >
                {language.id === secondaryLanguage ? <img src="/assets/figma-check.svg" alt="Selected" /> : <span className="check-space" />}
                <span>{language.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function translationStyleCombo() {
    const selectedStyle = translationStyles.find((style) => style.id === translationStyle);

    return (
      <div className="language-combo style-combo">
        <button
          className="language-control style-control"
          type="button"
          aria-label={`Translation style: ${selectedStyle.label}`}
          aria-expanded={isStyleMenuOpen}
          onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
        >
          <span>{selectedStyle.label}</span><img src="/assets/figma-triangle.svg" alt="" />
        </button>
        {isStyleMenuOpen && (
          <div className="language-list style-list" role="listbox" aria-label="translation style choices">
            {translationStyles.map((style) => (
              <button
                className={style.id === translationStyle ? "language-option selected" : "language-option"}
                key={style.id}
                type="button"
                role="option"
                aria-selected={style.id === translationStyle}
                onClick={() => selectTranslationStyle(style.id)}
              >
                {style.id === translationStyle ? <img src="/assets/figma-check.svg" alt="Selected" /> : <span className="check-space" />}
                <span>{style.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="input-stage">
      <section className="ime-window" style={{ width: windowSize.width, height: windowSize.height }} aria-label="Chinese bilingual input tool">
        <header className="ime-header">
          <div className="header-controls">
            <span className="field-label secondary-label">Write in Chinese +</span>
            {secondaryLanguageCombo()}
            {translationStyleCombo()}
          </div>
        </header>
        <section className="writing-area" onPointerDown={focusEditorFromWritingArea}>
          <div className="composition-editor" ref={editorRef}>
            <div className="written-lines" aria-live="polite" onScroll={updateCandidatePosition}>
              {draftLines.map((line, index) => {
                return (
                  <p className={[
                    "bilingual-line",
                    allChineseSelected ? "all-selected" : "",
                    softBreaks[index] ? "soft-break" : "",
                  ].filter(Boolean).join(" ")} key={index}>
                    <textarea
                      ref={(element) => { inputRefs.current[index] = element; }}
                      value={line}
                      onChange={(event) => handleDraftChange(event, index)}
                      onFocus={() => { setActiveLine(index); setIsEditorFocused(true); }}
                      onBlur={() => setIsEditorFocused(false)}
                      onKeyDown={handleKeyDown}
                      onKeyUp={updateCandidatePosition}
                      onClick={() => { setAllChineseSelected(false); updateCandidatePosition(); }}
                      onSelect={updateCandidatePosition}
                      placeholder={index === 0 && !(query && activeLine === index) ? "用英文输入法打出拼音…" : ""}
                      aria-label={`中文正文第 ${index + 1} 行`}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    {line && <span className="secondary-line">{renderSecondarySegments(line, index)}</span>}
                  </p>
                );
              })}
            </div>
            {query && (
              <div className="candidate-picker" style={candidatePosition} role="listbox" aria-label="双语候选">
                <div className="candidate-composition">
                  <span>{query.slice(0, queryCursor)}</span><span className="pinyin-caret" /><span>{query.slice(queryCursor)}</span>
                </div>
                <div className="candidate-options">
                  {pagedCandidates.map((candidate, index) => {
                    const pair = translationPair(candidate);
                    return <button key={`${candidate.zh}-${index}`} className={selected === index ? "candidate selected" : "candidate"} role="option" aria-selected={selected === index} onMouseEnter={() => setSelected(index)} onClick={() => commit(candidate)}><b>{index + 1}.</b><strong>{pair.primary}</strong></button>;
                  })}
                </div>
                <div className="candidate-translation">
                  {selectedCandidate ? translationPair(selectedCandidate).secondary : ""}
                </div>
                <div className="candidate-page-controls" aria-label="候选翻页">
                  <button className="candidate-page-button" type="button" aria-label="上一页" disabled={candidatePage === 0} onClick={() => { setCandidatePage((current) => Math.max(0, current - 1)); setSelected(0); }}><span className="page-arrow up" /></button>
                  <button className="candidate-page-button" type="button" aria-label="下一页" disabled={candidatePage >= pageCount - 1} onClick={() => {
                    const nextPage = Math.min(pageCount - 1, candidatePage + 1);
                    if (query && nextPage === pageCount - 1) recordMissedQuery(query, "reached_last_candidate_page");
                    setCandidatePage(nextPage);
                    setSelected(0);
                  }}><span className="page-arrow down" /></button>
                </div>
              </div>
            )}
          </div>
        </section>
        <footer className="ime-footer"><span>{`Smart ${footerLanguageLabel} output as you write Chinese`}</span><button className={resizing ? "resize-handle active" : "resize-handle"} onPointerDown={startResize} aria-label="Drag to resize window"><span className="resize-grip" aria-hidden="true">{[1, 2, 3].map((count) => <span className="resize-grip-row" key={count}>{Array.from({ length: count }, (_, index) => <img key={index} src={resizing ? "/assets/figma-drag-handle-pressed.svg" : "/assets/figma-drag-handle-default.svg"} alt="" />)}</span>)}</span></button></footer>
        <div className="footer-tools">
          <button className="glossary-trigger" type="button" onClick={() => setIsGlossaryOpen(true)}>Glossary</button>
          <button className="learning-reset" type="button" onClick={clearLearningData}>Reset learning</button>
        </div>
        {isGlossaryOpen && (
          <div className="glossary-overlay" role="dialog" aria-modal="true" aria-label="Editable glossary">
            <form className="glossary-panel" onSubmit={saveGlossaryEntry}>
              <div className="glossary-title">Glossary</div>
              <label>中文<input value={glossaryDraft.zh} onChange={(event) => updateGlossaryDraft("zh", event.target.value)} /></label>
              <label>拼音<input value={glossaryDraft.pinyin} onChange={(event) => updateGlossaryDraft("pinyin", event.target.value)} /></label>
              <label>English<input value={glossaryDraft.en} onChange={(event) => updateGlossaryDraft("en", event.target.value)} /></label>
              <label>日本語<input value={glossaryDraft.ja} onChange={(event) => updateGlossaryDraft("ja", event.target.value)} /></label>
              <label>Domain<input value={glossaryDraft.domain} onChange={(event) => updateGlossaryDraft("domain", event.target.value)} /></label>
              <div className="glossary-suggest">
                <div className="glossary-subtitle">Batch Suggest</div>
                <label>Corpus<textarea value={suggestCorpus} onChange={(event) => setSuggestCorpus(event.target.value)} placeholder="Paste Chinese sentences, one per line." /></label>
                <label>Hints<input value={suggestHints} onChange={(event) => setSuggestHints(event.target.value)} placeholder="Optional: terms, comma separated" /></label>
                <div className="glossary-actions">
                  <button type="button" onClick={generateGlossarySuggestions} disabled={isSuggestingGlossary}>{isSuggestingGlossary ? "Generating…" : "Generate suggestions"}</button>
                  <button type="button" onClick={generateGlossarySuggestionsFromMissed} disabled={isSuggestingGlossary || !missedQueries.length}>Generate from missed ({missedQueries.length})</button>
                  <button type="button" onClick={addSafeGlossarySuggestions} disabled={!glossarySuggestions.length}>Add all safe</button>
                  <button type="button" onClick={clearMissedQueries} disabled={!missedQueries.length}>Clear missed</button>
                </div>
                {glossarySuggestError && <div className="glossary-error">{glossarySuggestError}</div>}
                {glossarySuggestions.length > 0 && (
                  <div className="suggestion-list">
                    {glossarySuggestions.map((entry, index) => (
                      <div className="suggestion-row" key={`${entry.zh}-${entry.pinyin}-${index}`}>
                        <strong>{entry.zh}</strong><em>{entry.pinyin}</em><span>{entry.en}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="glossary-actions">
                <button type="button" onClick={() => setIsGlossaryOpen(false)}>Close</button>
                <button type="submit">Save</button>
              </div>
              <div className="glossary-list">
                {userGlossary.map((entry, index) => (
                  <div className="glossary-row" key={`${entry.zh}-${entry.pinyin}-${index}`}>
                    <span>{entry.zh}</span><em>{entry.pinyin}</em><button type="button" disabled={entry.locked} onClick={() => removeGlossaryEntry(index)}>{entry.locked ? "Seed" : "Remove"}</button>
                  </div>
                ))}
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
