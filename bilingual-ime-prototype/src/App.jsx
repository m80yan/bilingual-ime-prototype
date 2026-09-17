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
const USER_DICTIONARY_KEY = "ime:user-dictionary";
const USER_GLOSSARY_KEY = "ime:domain-glossary";
const emptyGlossaryDraft = { zh: "", pinyin: "", en: "", ja: "", domain: "common" };
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

function targetPunctuation(mark, language) {
  if (!mark) return "";
  if (language === "ja") return mark === "？" || mark === "?" ? "？" : mark === "！" || mark === "!" ? "！" : "。";
  return mark === "？" || mark === "?" ? "?" : mark === "！" || mark === "!" ? "!" : ".";
}

function properEnglishCandidate(zh) {
  const firstDefinition = cedictTranslations[zh]?.[0];
  const match = firstDefinition?.match(/^([A-Z][A-Za-z .'-]{1,40})(?:,|$)/);
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

function rankWithUserDictionary(candidates, pinyin, dictionary, glossary, context) {
  const learned = dictionary[normalizePinyin(pinyin)] ?? {};
  const domainBoosts = activeDomainBoosts(context);
  return [...new Set(candidates)]
    .map((zh, index) => {
      const glossaryEntry = glossary.find((entry) => entry.zh === zh);
      return {
        zh,
        index,
        learned: learned[zh],
        domainScore: glossaryEntry ? glossaryEntryWeight(glossaryEntry) + (domainBoosts[glossaryEntry.domain] ?? 0) : 0,
      };
    })
    .sort((left, right) => {
      const leftCount = left.learned?.count ?? 0;
      const rightCount = right.learned?.count ?? 0;
      if (leftCount !== rightCount) return rightCount - leftCount;
      const leftUsed = left.learned?.lastUsedAt ?? 0;
      const rightUsed = right.learned?.lastUsedAt ?? 0;
      if (leftUsed !== rightUsed) return rightUsed - leftUsed;
      if (left.domainScore !== right.domainScore) return right.domainScore - left.domainScore;
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
  const [playedTranslations, setPlayedTranslations] = useState({});
  const [loadingSegments, setLoadingSegments] = useState({});
  const [activeLine, setActiveLine] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const [candidatePosition, setCandidatePosition] = useState({ left: 0, top: 0 });
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [allChineseSelected, setAllChineseSelected] = useState(false);
  const editorRef = useRef(null);
  const inputRefs = useRef([]);
  const previousDraftLines = useRef([""]);
  const resizeStart = useRef(null);

  function translationFor(zh, language) {
    const { body, punctuation } = splitFinalPunctuation(zh);
    const baseTranslation = body !== zh ? translationFor(body, language) : null;
    if (baseTranslation && baseTranslation !== "…" && baseTranslation !== "翻訳中…") {
      return `${baseTranslation.replace(/[.!?。！？]$/, "")}${targetPunctuation(punctuation, language)}`;
    }

    return translations[`${language}:${zh}`]
      ?? userGlossaryTranslation(zh, language, userGlossary)
      ?? localTranslations[zh]?.[language]
      ?? (language === "en" && cedictTranslations[zh]?.length ? cedictTranslations[zh].join("; ") : null)
      ?? (language === "en" ? "…" : "翻訳中…");
  }

  const visibleCandidates = useMemo(() => {
    const context = draftLines.join("");
    const rankedCandidates = rankWithUserDictionary(
      [...userGlossaryCandidates(query, userGlossary), ...getPinyinCandidates(query)],
      query,
      userDictionary,
      userGlossary,
      context,
    );
    const chineseCandidates = rankedCandidates.map((zh) => ({ zh, kind: "zh" }));
    const english = englishCandidate(query, chineseCandidates[0]?.zh);
    const englishItem = english ? { zh: english, kind: "en" } : null;
    const shouldPrioritizeEnglish = /[A-Z]/.test(query);
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
  }, [query, translations, userDictionary, userGlossary, draftLines]);
  const pageCount = Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE));
  const pagedCandidates = visibleCandidates.slice(candidatePage * PAGE_SIZE, candidatePage * PAGE_SIZE + PAGE_SIZE);
  const selectedCandidate = pagedCandidates[selected];
  const footerLanguageLabel = secondaryLanguage === "ja" ? "Japanese" : "English";

  useEffect(() => { setSelected(0); setCandidatePage(0); }, [query]);

  useEffect(() => {
    setQueryCursor((current) => Math.min(current, query.length));
  }, [query]);

  useLayoutEffect(() => {
    updateCandidatePosition();
  }, [query, activeLine, draftLines, windowSize]);

  useEffect(() => {
    const filledSegments = draftLines.flatMap(splitChineseSegments).filter(isChineseText);
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

    const pendingSource = query ? [selectedCandidateText] : filledSegments;
    const pending = [...new Set(pendingSource.filter(Boolean))]
      .filter((zh) => !localTranslations[zh]?.[secondaryLanguage]
        && !(splitFinalPunctuation(zh).body !== zh && translationFor(splitFinalPunctuation(zh).body, secondaryLanguage) !== (secondaryLanguage === "en" ? "…" : "翻訳中…"))
        && !userGlossaryTranslation(zh, secondaryLanguage, userGlossary)
        && !(secondaryLanguage === "en" && cedictTranslations[zh]?.length)
        && !translations[`${secondaryLanguage}:${zh}`]);

    if (!pending.length) {
      const settle = window.setTimeout(() => setLoadingSegments({}), 360);
      return () => window.clearTimeout(settle);
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: pending, targetLanguage: secondaryLanguage }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { translations: results } = await response.json();
        if (!results) return;
        setTranslations((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(results).map(([zh, translation]) => [`${secondaryLanguage}:${zh}`, translation])),
        }));
      } catch (error) {
        if (error.name !== "AbortError") console.warn("Translation service is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoadingSegments({});
      }
    }, 300);

    return () => { window.clearTimeout(debounce); controller.abort(); };
  }, [query, selectedCandidate?.zh, selectedCandidate?.kind, draftLines, secondaryLanguage, userGlossary]);

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
    const next = `${currentLine.slice(0, start)}${text}${currentLine.slice(end)}`;
    setDraftLines((current) => current.map((line, index) => (index === activeLine ? next : line)));
    requestAnimationFrame(() => {
      inputRefs.current[activeLine]?.focus();
      inputRefs.current[activeLine]?.setSelectionRange(start + text.length, start + text.length);
    });
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

  function commit(candidate = pagedCandidates[selected], suffix = "") {
    if (!candidate && !suffix) return;
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

  function handleKeyDown(event) {
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
    else if (event.key === "=" && query && candidatePage < pageCount - 1) { event.preventDefault(); setCandidatePage((current) => Math.min(pageCount - 1, current + 1)); setSelected(0); }
    else if ((event.key === "Enter" || event.key === " ") && query && pagedCandidates.length) {
      event.preventDefault();
      const candidate = pagedCandidates[selected];
      commit(candidate, event.key === " " && candidate?.kind === "en" ? " " : "");
    }
    else if (event.key === "Enter" && !query) {
      event.preventDefault();
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
        setQuery((current) => `${current.slice(0, queryCursor - 1)}${current.slice(queryCursor)}`);
        setQueryCursor((current) => Math.max(0, current - 1));
      }
    }
    else if (event.key === "Delete" && query) {
      event.preventDefault();
      setQuery((current) => `${current.slice(0, queryCursor)}${current.slice(queryCursor + 1)}`);
    }
    else if (event.key === "Backspace" && !query && activeLine > 0) {
      const editor = inputRefs.current[activeLine];
      const start = editor?.selectionStart ?? 0;
      const end = editor?.selectionEnd ?? start;
      if (start === 0 && end === 0) {
        event.preventDefault();
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
      const previousLine = Math.max(0, activeLine - 1);
      setDraftLines((current) => current.filter((_, index) => index !== activeLine));
      setSoftBreaks((current) => current.filter((_, index) => index !== activeLine));
      setActiveLine(previousLine);
      requestAnimationFrame(() => inputRefs.current[previousLine]?.focus());
    }
    else if (/^[a-z]$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const letter = event.key;
      setQuery((current) => `${current.slice(0, queryCursor)}${letter}${current.slice(queryCursor)}`);
      setQueryCursor((current) => current + 1);
    }
  }

  function handleDraftChange(event, lineIndex) {
    setAllChineseSelected(false);
    const next = event.target.value;
    const previous = draftLines[lineIndex] ?? "";
    const change = insertedTextChange(previous, next);
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
      ...(entry.en ? { [`en:${entry.zh}`]: entry.en } : {}),
      ...(entry.ja ? { [`ja:${entry.zh}`]: entry.ja } : {}),
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

  function translationPair(item) {
    return {
      primary: item.zh,
      secondary: item[secondaryLanguage] ?? item.en ?? translationFor(item.zh, secondaryLanguage),
    };
  }

  function renderSecondarySegments(line, lineIndex) {
    return splitChineseSegments(line).map((segment, segmentIndex) => {
      const secondary = translationFor(segment, secondaryLanguage);
      const translationKey = `${secondaryLanguage}:${segment}:${secondary}`;
      const needsSpace = segmentIndex > 0;

      return (
        <span className="translation-segment" key={`${segment}-${segmentIndex}`}>
          {needsSpace ? " " : ""}
          {loadingSegments[segment]
            ? <span className="translation-shimmer segment-shimmer" aria-label="Translating" />
            : <StableTranslation
                text={secondary}
                hasPlayed={Boolean(playedTranslations[translationKey])}
                onDone={() => setPlayedTranslations((current) => ({ ...current, [translationKey]: true }))}
              />}
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

  return (
    <main className="input-stage">
      <section className="ime-window" style={{ width: windowSize.width, height: windowSize.height }} aria-label="Chinese bilingual input tool">
        <header className="ime-header">
          <div className="header-controls">
            <span className="locked-language" aria-label="Primary language: Simplified Chinese">简体中文</span>
            <span className="field-label primary-label">Primary</span>
            <span className="field-label secondary-label">Secondary</span>
            {secondaryLanguageCombo()}
          </div>
        </header>
        <section className="writing-area">
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
                  <button className="candidate-page-button" type="button" aria-label="下一页" disabled={candidatePage >= pageCount - 1} onClick={() => { setCandidatePage((current) => Math.min(pageCount - 1, current + 1)); setSelected(0); }}><span className="page-arrow down" /></button>
                </div>
              </div>
            )}
          </div>
        </section>
        <footer className="ime-footer"><span>{`Smart ${footerLanguageLabel} output as you write Chinese`}</span><button className={resizing ? "resize-handle active" : "resize-handle"} onPointerDown={startResize} aria-label="Drag to resize window"><span className="resize-grip" aria-hidden="true">{[1, 2, 3].map((count) => <span className="resize-grip-row" key={count}>{Array.from({ length: count }, (_, index) => <img key={index} src={resizing ? "/assets/figma-drag-handle-pressed.svg" : "/assets/figma-drag-handle-default.svg"} alt="" />)}</span>)}</span></button></footer>
        <button className="glossary-trigger" type="button" onClick={() => setIsGlossaryOpen(true)}>Glossary</button>
        {isGlossaryOpen && (
          <div className="glossary-overlay" role="dialog" aria-modal="true" aria-label="Editable glossary">
            <form className="glossary-panel" onSubmit={saveGlossaryEntry}>
              <div className="glossary-title">Glossary</div>
              <label>中文<input value={glossaryDraft.zh} onChange={(event) => updateGlossaryDraft("zh", event.target.value)} /></label>
              <label>拼音<input value={glossaryDraft.pinyin} onChange={(event) => updateGlossaryDraft("pinyin", event.target.value)} /></label>
              <label>English<input value={glossaryDraft.en} onChange={(event) => updateGlossaryDraft("en", event.target.value)} /></label>
              <label>日本語<input value={glossaryDraft.ja} onChange={(event) => updateGlossaryDraft("ja", event.target.value)} /></label>
              <label>Domain<input value={glossaryDraft.domain} onChange={(event) => updateGlossaryDraft("domain", event.target.value)} /></label>
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
