import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getPinyinCandidates } from "./pinyinEngine";
import cedictTranslations from "./data/cedict-en.json";

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
};
const PAGE_SIZE = 5;
const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&";

function isChineseText(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function splitChineseSegments(text) {
  if (!text) return [];
  const matches = text.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
  return matches.map((segment) => segment.trim()).filter(Boolean);
}

function englishCandidate(value) {
  if (!value) return "";
  if (value.toLowerCase() === "pisa") return "Pizza";
  return value[0].toUpperCase() + value.slice(1);
}

function ScrambleText({ text, onDone }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!text) {
      setDisplay("");
      return undefined;
    }

    let frame = 0;
    const totalFrames = Math.max(18, Math.min(42, text.length * 2));
    const interval = window.setInterval(() => {
      frame += 1;
      const locked = Math.floor((frame / totalFrames) * text.length);
      setDisplay(text.split("").map((char, index) => {
        if (char === " " || index < locked) return char;
        return scrambleChars[(frame + index * 7) % scrambleChars.length];
      }).join(""));
      if (frame >= totalFrames) {
        window.clearInterval(interval);
        setDisplay(text);
        onDone?.();
      }
    }, 28);

    return () => window.clearInterval(interval);
  }, [text]);

  return display;
}

function StableTranslation({ text, hasPlayed, onDone }) {
  if (!text) return null;
  if (hasPlayed) return text;
  return <ScrambleText text={text} onDone={onDone} />;
}

export function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [candidatePage, setCandidatePage] = useState(0);
  const [draftLines, setDraftLines] = useState([""]);
  const [translations, setTranslations] = useState({});
  const [playedTranslations, setPlayedTranslations] = useState({});
  const [loadingSegments, setLoadingSegments] = useState({});
  const [activeLine, setActiveLine] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const [candidatePosition, setCandidatePosition] = useState({ left: 0, top: 0 });
  const editorRef = useRef(null);
  const inputRefs = useRef([]);
  const previousDraftLines = useRef([""]);
  const resizeStart = useRef(null);

  function translationFor(zh, language) {
    return translations[`${language}:${zh}`]
      ?? localTranslations[zh]?.[language]
      ?? (language === "en" && cedictTranslations[zh]?.length ? cedictTranslations[zh].join("; ") : null)
      ?? (language === "en" ? "…" : "翻訳中…");
  }

  const visibleCandidates = useMemo(() => {
    const english = englishCandidate(query);
    const chineseCandidates = getPinyinCandidates(query).map((zh) => ({ zh, kind: "zh" }));
    const matches = english
      ? [chineseCandidates[0], { zh: english, kind: "en" }, ...chineseCandidates.slice(1)].filter(Boolean)
      : chineseCandidates;
    return matches.map((candidate) => ({
      ...candidate,
      en: candidate.kind === "en" ? "English" : translationFor(candidate.zh, "en"),
      ja: candidate.kind === "en" ? "英語" : translationFor(candidate.zh, "ja"),
    }));
  }, [query, translations]);
  const pageCount = Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE));
  const pagedCandidates = visibleCandidates.slice(candidatePage * PAGE_SIZE, candidatePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => { setSelected(0); setCandidatePage(0); }, [query]);

  useLayoutEffect(() => {
    updateCandidatePosition();
  }, [query, activeLine, draftLines, windowSize]);

  useEffect(() => {
    const filledSegments = draftLines.flatMap(splitChineseSegments).filter(isChineseText);
    if (!filledSegments.length) {
      setLoadingSegments({});
      return undefined;
    }

    const previousSegments = previousDraftLines.current.flatMap(splitChineseSegments);
    const segmentKeys = {};
    draftLines.forEach((line, lineIndex) => {
      splitChineseSegments(line).forEach((segment, segmentIndex) => {
        const previousSegment = splitChineseSegments(previousDraftLines.current[lineIndex] ?? "")[segmentIndex];
        segmentKeys[`${lineIndex}:${segment}`] = isChineseText(segment) && segment !== previousSegment;
      });
    });
    previousSegments
      .filter((segment) => !filledSegments.includes(segment))
      .forEach((segment) => { segmentKeys[`removed:${segment}`] = false; });
    previousDraftLines.current = draftLines;
    setLoadingSegments(segmentKeys);
    const pending = [...new Set([...getPinyinCandidates(query), ...filledSegments].filter(Boolean))]
      .filter((zh) => !localTranslations[zh]?.[secondaryLanguage]
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
  }, [query, draftLines, secondaryLanguage]);

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

  function replaceDraftSelection(text) {
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
    const top = markerRect.bottom - editorRect.top + editor.scrollTop + 18;
    const left = markerRect.right - editorRect.left + editor.scrollLeft;

    document.body.removeChild(mirror);
    setCandidatePosition({
      left: Math.max(0, Math.min(left, editor.clientWidth - 215)),
      top: Math.max(0, top),
    });
  }

  function commit(candidate = pagedCandidates[selected], suffix = "") {
    if (!candidate && !suffix) return;
    replaceDraftSelection(`${candidate?.zh ?? ""}${suffix}`);
    setQuery("");
  }

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowDown" && pagedCandidates.length) { event.preventDefault(); setSelected((current) => (current + 1) % pagedCandidates.length); }
    else if (event.key === "ArrowUp" && pagedCandidates.length) { event.preventDefault(); setSelected((current) => (current - 1 + pagedCandidates.length) % pagedCandidates.length); }
    else if (event.key === "-" && query && pageCount > 1) { event.preventDefault(); setCandidatePage((current) => (current - 1 + pageCount) % pageCount); setSelected(0); }
    else if (event.key === "=" && query && pageCount > 1) { event.preventDefault(); setCandidatePage((current) => (current + 1) % pageCount); setSelected(0); }
    else if ((event.key === "Enter" || event.key === " ") && query && pagedCandidates.length) { event.preventDefault(); commit(); }
    else if (event.key === "Enter" && !query) {
      event.preventDefault();
      setDraftLines((current) => {
        const next = [...current];
        next.splice(activeLine + 1, 0, "");
        return next;
      });
      const nextLine = activeLine + 1;
      setActiveLine(nextLine);
      requestAnimationFrame(() => inputRefs.current[nextLine]?.focus());
    }
    else if (/^[1-5]$/.test(event.key) && pagedCandidates[Number(event.key) - 1]) { event.preventDefault(); commit(pagedCandidates[Number(event.key) - 1]); }
    else if (punctuationMap[event.key]) { event.preventDefault(); commit(query ? pagedCandidates[selected] : null, punctuationMap[event.key]); }
    else if (event.key === "Backspace" && query) { event.preventDefault(); setQuery((current) => current.slice(0, -1)); }
    else if (event.key === "Backspace" && !query && !draftLines[activeLine] && draftLines.length > 1) {
      event.preventDefault();
      const previousLine = Math.max(0, activeLine - 1);
      setDraftLines((current) => current.filter((_, index) => index !== activeLine));
      setActiveLine(previousLine);
      requestAnimationFrame(() => inputRefs.current[previousLine]?.focus());
    }
    else if (/^[a-z]$/i.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setQuery((current) => `${current}${event.key.toLowerCase()}`); }
  }

  function handleDraftChange(event, lineIndex) {
    const next = event.target.value;
    const pinyin = next.match(/[a-z]+/gi)?.join("").toLowerCase() ?? "";
    if (query && next.includes("=") && pageCount > 1) {
      setCandidatePage((current) => (current + 1) % pageCount);
      setSelected(0);
    }
    if (query && next.includes("-") && pageCount > 1) {
      setCandidatePage((current) => (current - 1 + pageCount) % pageCount);
      setSelected(0);
    }
    const controlPattern = query ? /[a-z=-]+/gi : /[a-z]+/gi;
    setDraftLines((current) => current.map((line, index) => (index === lineIndex ? next.replace(controlPattern, "") : line)));
    if (pinyin) setQuery((current) => `${current}${pinyin}`);
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
      const loadingKey = `${lineIndex}:${segment}`;
      const needsSpace = segmentIndex > 0;

      return (
        <span className="translation-segment" key={`${segment}-${segmentIndex}`}>
          {needsSpace ? " " : ""}
          {loadingSegments[loadingKey]
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
            <div className="written-lines" aria-live="polite">
              {draftLines.map((line, index) => {
                return (
                  <p className="bilingual-line" key={index}>
                    <textarea
                      ref={(element) => { inputRefs.current[index] = element; }}
                      value={line}
                      onChange={(event) => handleDraftChange(event, index)}
                      onFocus={() => setActiveLine(index)}
                      onKeyDown={handleKeyDown}
                      onKeyUp={updateCandidatePosition}
                      onClick={updateCandidatePosition}
                      onSelect={updateCandidatePosition}
                      placeholder={index === 0 ? "用英文输入法打出拼音…" : ""}
                      aria-label={`中文正文第 ${index + 1} 行`}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    {query && activeLine === index && <span className="pinyin-composition">{query}</span>}
                    {line && <span>{renderSecondarySegments(line, index)}</span>}
                  </p>
                );
              })}
            </div>
            <div className="candidate-picker" style={query ? candidatePosition : undefined} role="listbox" aria-label="双语候选">
              {pagedCandidates.map((candidate, index) => {
                const pair = translationPair(candidate);
                return <button key={`${candidate.zh}-${index}`} className={selected === index ? "candidate selected" : "candidate"} role="option" aria-selected={selected === index} onMouseEnter={() => setSelected(index)} onClick={() => commit(candidate)}><b>{index + 1}.</b><span><strong>{pair.primary}</strong><em>{pair.secondary}</em></span></button>;
              })}
            </div>
          </div>
        </section>
        <footer className="ime-footer"><span>English translation below</span><button className={resizing ? "resize-handle active" : "resize-handle"} onPointerDown={startResize} aria-label="Drag to resize window"><span className="resize-grip" aria-hidden="true">{[1, 2, 3].map((count) => <span className="resize-grip-row" key={count}>{Array.from({ length: count }, (_, index) => <img key={index} src={resizing ? "/assets/figma-drag-handle-pressed.svg" : "/assets/figma-drag-handle-default.svg"} alt="" />)}</span>)}</span></button></footer>
      </section>
    </main>
  );
}
