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
  "今天": { en: "today", ja: "今日" }, "太好了": { en: "That’s wonderful!", ja: "すばらしい！" },
};

const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;
const secondaryLanguages = [
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];

export function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [lines, setLines] = useState([{ zh: "我爱你", en: "I love you", ja: "愛してる" }]);
  const [translations, setTranslations] = useState({});
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const inputRef = useRef(null);
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
    const pending = getPinyinCandidates(query)
      .filter((zh) => !localTranslations[zh]?.[secondaryLanguage]
        && !(secondaryLanguage === "en" && cedictTranslations[zh]?.length)
        && !translations[`${secondaryLanguage}:${zh}`]);

    if (!pending.length) return undefined;

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
      }
    }, 300);

    return () => { window.clearTimeout(debounce); controller.abort(); };
  }, [query, secondaryLanguage]);

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

  function commit(candidate = visibleCandidates[selected]) {
    if (!candidate) return;
    setLines((current) => [...current, { zh: candidate.zh, en: candidate.en }]);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected((current) => (current + 1) % visibleCandidates.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((current) => (current - 1 + visibleCandidates.length) % visibleCandidates.length); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); commit(); }
    else if (/^[1-5]$/.test(event.key) && visibleCandidates[Number(event.key) - 1]) { event.preventDefault(); commit(visibleCandidates[Number(event.key) - 1]); }
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
      secondary: item[secondaryLanguage] ?? item.en,
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
              {lines.map((line, index) => {
                const pair = translationPair(line);
                return <p key={`${line.zh}-${index}`}><strong>{pair.primary}</strong><span>{pair.secondary}</span></p>;
              })}
            </div>
            <div className="typing-line"><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="输入拼音…" aria-label="输入拼音" autoComplete="off" /></div>
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
