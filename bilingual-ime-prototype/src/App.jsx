import { useEffect, useMemo, useRef, useState } from "react";

const candidates = [
  { pinyin: "wo shi shui", zh: "我是谁？", en: "Who am I?", ja: "私は誰ですか？" },
  { pinyin: "wo shi shui", zh: "我是谁", en: "Who am I", ja: "私は誰？" },
  { pinyin: "wo shi shui", zh: "我是什么人？", en: "What kind of person am I?", ja: "私はどんな人ですか？" },
  { pinyin: "wo xiang yi xiang", zh: "我想一想。", en: "Let me think about it.", ja: "少し考えさせて。" },
  { pinyin: "jin tian hen mang", zh: "今天很忙。", en: "I’m busy today.", ja: "今日は忙しいです。" },
  { pinyin: "tai hao le", zh: "太好了！", en: "That’s wonderful!", ja: "すばらしい！" },
  { pinyin: "xue xi ying yu", zh: "学习英语", en: "Study English", ja: "英語を勉強する" },
  { pinyin: "bei dan ci", zh: "背单词", en: "Learn vocabulary", ja: "単語を覚える" },
];

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
  const [windowSize, setWindowSize] = useState({ width: 978, height: 520 });
  const [resizing, setResizing] = useState(false);
  const [secondaryLanguage, setSecondaryLanguage] = useState("en");
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const resizeStart = useRef(null);

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates.slice(0, 5);
    const matches = candidates.filter((item) => item.pinyin.includes(normalized) || item.zh.includes(normalized));
    return matches.length ? matches.slice(0, 5) : [{ pinyin: query, zh: query, en: "Translation will appear here", ja: "翻訳がここに表示されます" }];
  }, [query]);

  useEffect(() => setSelected(0), [query]);

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
    else if (event.key === "Enter") { event.preventDefault(); commit(); }
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
        </section>
        <footer className="ime-footer"><span>English translation below</span><button className={resizing ? "resize-handle active" : "resize-handle"} onPointerDown={startResize} aria-label="Drag to resize window"><span className="resize-grip" aria-hidden="true">{[1, 2, 3].map((count) => <span className="resize-grip-row" key={count}>{Array.from({ length: count }, (_, index) => <img key={index} src={resizing ? "/assets/figma-drag-handle-pressed.svg" : "/assets/figma-drag-handle-default.svg"} alt="" />)}</span>)}</span></button></footer>
      </section>
    </main>
  );
}
