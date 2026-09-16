import { useEffect, useMemo, useRef, useState } from "react";
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
const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&";

function ScrambleText({ text }) {
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
      }
    }, 28);

    return () => window.clearInterval(interval);
  }, [text]);

  return display;
}

export function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [draftLines, setDraftLines] = useState([""]);
  const [translations, setTranslations] = useState({});
  const [loadingLines, setLoadingLines] = useState({});
  const [activeLine, setActiveLine] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const inputRefs = useRef([]);
  const resizeStart = useRef(null);

  function translationFor(zh, language) {
    return translations[`${language}:${zh}`]
      ?? localTranslations[zh]?.[language]
      ?? (language === "en" && cedictTranslations[zh]?.length ? cedictTranslations[zh].join("; ") : null)
      ?? (language === "en" ? "…" : "翻訳中…");
  }

  const visibleCandidates = useMemo(() => {
    const matches = getPinyinCandidates(query);
    return matches.map((zh) => ({
      zh,
      en: translationFor(zh, "en"),
      ja: translationFor(zh, "ja"),
    }));
  }, [query, translations]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    const filledLines = draftLines.filter(Boolean);
    if (!filledLines.length) {
      setLoadingLines({});
      return undefined;
    }

    const lineKeys = Object.fromEntries(draftLines.map((line, index) => [index, Boolean(line)]));
    setLoadingLines(lineKeys);
    const pending = [...new Set([...getPinyinCandidates(query), ...filledLines].filter(Boolean))]
      .filter((zh) => !localTranslations[zh]?.[secondaryLanguage]
        && !(secondaryLanguage === "en" && cedictTranslations[zh]?.length)
        && !translations[`${secondaryLanguage}:${zh}`]);

    if (!pending.length) {
      const settle = window.setTimeout(() => setLoadingLines({}), 360);
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
        if (!controller.signal.aborted) setLoadingLines({});
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

  function commit(candidate = visibleCandidates[selected], suffix = "") {
    if (!candidate && !suffix) return;
    replaceDraftSelection(`${candidate?.zh ?? ""}${suffix}`);
    setQuery("");
  }

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowDown" && visibleCandidates.length) { event.preventDefault(); setSelected((current) => (current + 1) % visibleCandidates.length); }
    else if (event.key === "ArrowUp" && visibleCandidates.length) { event.preventDefault(); setSelected((current) => (current - 1 + visibleCandidates.length) % visibleCandidates.length); }
    else if ((event.key === "Enter" || event.key === " ") && query && visibleCandidates.length) { event.preventDefault(); commit(); }
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
    else if (/^[1-5]$/.test(event.key) && visibleCandidates[Number(event.key) - 1]) { event.preventDefault(); commit(visibleCandidates[Number(event.key) - 1]); }
    else if (punctuationMap[event.key]) { event.preventDefault(); commit(query ? visibleCandidates[selected] : null, punctuationMap[event.key]); }
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
    setDraftLines((current) => current.map((line, index) => (index === lineIndex ? next.replace(/[a-z]+/gi, "") : line)));
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
          <div className="composition-editor">
            <div className="written-lines" aria-live="polite">
              {draftLines.map((line, index) => {
                const secondary = translationPair({
                  zh: line,
                  en: translationFor(line, "en"),
                  ja: translationFor(line, "ja"),
                }).secondary;
                return (
                  <p className="bilingual-line" key={index}>
                    <textarea
                      ref={(element) => { inputRefs.current[index] = element; }}
                      value={line}
                      onChange={(event) => handleDraftChange(event, index)}
                      onFocus={() => setActiveLine(index)}
                      onKeyDown={handleKeyDown}
                      placeholder={index === 0 ? "用英文输入法打出拼音…" : ""}
                      aria-label={`中文正文第 ${index + 1} 行`}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    {query && activeLine === index && <span className="pinyin-composition">{query}</span>}
                    {line && (loadingLines[index]
                      ? <span className="translation-shimmer" aria-label="Translating" />
                      : <span><ScrambleText text={secondary} /></span>)}
                  </p>
                );
              })}
            </div>
            <div className="candidate-picker" role="listbox" aria-label="双语候选">
              {visibleCandidates.map((candidate, index) => {
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
