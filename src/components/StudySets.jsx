import { useEffect, useMemo, useRef, useState } from "react";
import {
  createId,
  parseFlashcardCsvWithReport,
  validateStudySetQuiz,
} from "../appUtils.js";
import Icon from "./Icon.jsx";

const nowIso = () => new Date().toISOString();
const limit = (value, max) => String(value || "").trim().slice(0, max);
const displaySubject = (value) => String(value || "").replace(/@/g, "").replace(/\s+/g, " ").trim();
const csvEscape = (value) => {
  const text = String(value || "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const shuffled = (items) => [...items].sort(() => Math.random() - 0.5);

function downloadFile(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function StudySetEditor({ set, onChange, toast }) {
  const [tab, setTab] = useState("cards");
  const [editorPage, setEditorPage] = useState("home");
  const [studyMode, setStudyMode] = useState("");
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyAnswer, setStudyAnswer] = useState(false);
  const [quizChoice, setQuizChoice] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [missed, setMissed] = useState([]);
  const [sessionCards, setSessionCards] = useState([]);
  const [sessionQuiz, setSessionQuiz] = useState([]);
  const [csvPreview, setCsvPreview] = useState(null);
  const [quizPreview, setQuizPreview] = useState(null);
  const csvRef = useRef(null);
  const quizRef = useRef(null);
  const cards = set.cards || [];
  const quiz = set.quiz || [];
  const studyCard = sessionCards[studyIndex];
  const studyQuiz = sessionQuiz[studyIndex];

  const updateSet = (patch, message = "Study set updated") => {
    onChange({ ...set, ...patch, updatedAt: nowIso() }, message);
  };
  const resetStudy = () => {
    setStudyMode("");
    setStudyIndex(0);
    setStudyAnswer(false);
    setQuizChoice(null);
    setQuizScore(0);
    setMissed([]);
    setSessionCards([]);
    setSessionQuiz([]);
  };
  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const report = parseFlashcardCsvWithReport(await file.text());
    if (report.error) return toast(report.error);
    setCsvPreview({ ...report, fileName: file.name });
  };
  const confirmCsv = () => {
    if (!csvPreview?.cards.length) return;
    const imported = csvPreview.cards.map((card) => ({
      id: createId(),
      question: limit(card.question, 300),
      answer: limit(card.answer, 500),
    })).filter((card) => card.question && card.answer);
    updateSet({ cards: [...cards, ...imported] }, `${imported.length} cards imported`);
    setCsvPreview(null);
  };
  const importQuiz = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const report = validateStudySetQuiz(JSON.parse(await file.text()));
      if (!report.valid) return toast(report.error);
      setQuizPreview({ questions: report.questions, fileName: file.name });
    } catch {
      toast("Quiz JSON is not valid JSON.");
    }
  };
  const confirmQuiz = () => {
    if (!quizPreview) return;
    updateSet({ quiz: [...quiz, ...quizPreview.questions] }, `${quizPreview.questions.length} quiz questions imported`);
    setQuizPreview(null);
  };
  const exportCards = () => downloadFile(`${set.subject.toLowerCase().replace(/\s+/g, "-")}-flashcards.csv`, [
    "Question,Answer",
    ...cards.map((card) => `${csvEscape(card.question)},${csvEscape(card.answer)}`),
  ].join("\r\n"), "text/csv");
  const exportQuiz = () => downloadFile(`${set.subject.toLowerCase().replace(/\s+/g, "-")}-quiz.json`, JSON.stringify(quiz.map(({ id: _id, ...item }) => item), null, 2), "application/json");
  const startCards = () => {
    if (!cards.length) return toast("Add at least one flashcard first.");
    setSessionCards(shuffled(cards));
    setStudyMode("cards");
    setStudyIndex(0);
    setStudyAnswer(false);
  };
  const startQuiz = () => {
    if (!quiz.length) return toast("Add at least one quiz question first.");
    setSessionQuiz(shuffled(quiz));
    setStudyMode("quiz");
    setStudyIndex(0);
    setQuizChoice(null);
    setQuizScore(0);
    setMissed([]);
  };
  const answerQuiz = (index) => {
    if (quizChoice !== null) return;
    setQuizChoice(index);
    if (index === studyQuiz.correctIndex) setQuizScore((score) => score + 1);
    else setMissed((items) => [...items, studyQuiz]);
  };
  const nextStudy = () => {
    if (studyIndex + 1 >= (studyMode === "cards" ? sessionCards.length : sessionQuiz.length)) {
      if (studyMode === "quiz") {
        const score = quizScore + (quizChoice === studyQuiz?.correctIndex ? 0 : 0);
        const percent = Math.round((score / sessionQuiz.length) * 100);
        updateSet({ lastScore: percent, lastScoreDate: nowIso(), bestScore: Math.max(percent, set.bestScore || 0) }, "Quiz score saved");
      }
      setStudyMode("result");
      return;
    }
    setStudyIndex((index) => index + 1);
    setStudyAnswer(false);
    setQuizChoice(null);
  };
  const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "Not yet";

  if (studyMode === "cards" && studyCard) return (
    <div className="study-set-study" aria-live="polite">
      <div className="study-set-study-heading"><strong>Flashcard {studyIndex + 1} of {sessionCards.length}</strong><button type="button" className="text-button" onClick={resetStudy}>Exit study</button></div>
      <article className="study-set-study-card">
        <h3>{studyCard.question}</h3>
        {studyAnswer ? <p>{studyCard.answer}</p> : <button type="button" className="subtle-btn" onClick={() => setStudyAnswer(true)}>Reveal answer</button>}
        {studyAnswer && <div className="study-set-study-actions"><button type="button" className="subtle-btn" onClick={nextStudy}>Again</button><button type="button" className="primary-btn" onClick={nextStudy}>Got it</button></div>}
      </article>
    </div>
  );
  if (studyMode === "quiz" && studyQuiz) return (
    <div className="study-set-study" aria-live="polite">
      <div className="study-set-study-heading"><strong>Quiz {studyIndex + 1} of {sessionQuiz.length}</strong><button type="button" className="text-button" onClick={resetStudy}>Exit quiz</button></div>
      <article className="study-set-study-card">
        <h3>{studyQuiz.question}</h3>
        <div className="study-set-options">{studyQuiz.options.map((option, index) => <button type="button" key={option} disabled={quizChoice !== null} className={quizChoice !== null ? index === studyQuiz.correctIndex ? "correct" : index === quizChoice ? "incorrect" : "" : ""} onClick={() => answerQuiz(index)}>{String.fromCharCode(65 + index)}. {option}</button>)}</div>
        {quizChoice !== null && <div className="study-set-feedback"><strong>{quizChoice === studyQuiz.correctIndex ? "Correct" : "Not quite"}</strong><p>{studyQuiz.explanation}</p><button type="button" className="primary-btn" onClick={nextStudy}>{studyIndex + 1 === sessionQuiz.length ? "See results" : "Next question"}</button></div>}
      </article>
    </div>
  );
  if (studyMode === "result") return (
    <div className="study-set-result" aria-live="polite">
      <h3>{studyMode === "result" ? "Study complete" : ""}</h3>
      {set.lastScore !== null && <p>Latest quiz score: {set.lastScore}%{set.bestScore !== null ? ` · Best: ${set.bestScore}%` : ""}</p>}
      {missed.length > 0 && <div><strong>Missed questions</strong>{missed.map((item) => <p key={item.id}>{item.question}</p>)}</div>}
      <button type="button" className="primary-btn" onClick={resetStudy}>Back to set</button>
    </div>
  );

  return (
    <section className="study-set-editor">
      <div className="study-set-editor-heading">
        <div><span className="study-set-level">{set.level}</span><small>Updated {formatDate(set.updatedAt)} · Last quiz: {set.lastScore === null ? "Not yet" : `${set.lastScore}%`} · Best: {set.bestScore === null ? "Not yet" : `${set.bestScore}%`}</small></div>
        <div className="study-set-editor-actions"><button type="button" className="primary-btn" onClick={startCards}>Study flashcards</button><button type="button" className="subtle-btn" onClick={startQuiz}>Take quiz</button></div>
      </div>
      {editorPage === "home" ? (
        <div className="study-set-home">
          <div className="study-set-home-icon"><Icon name="BookOpen" size={24} /></div>
          <h3>{displaySubject(set.subject)}</h3>
          <p>Build your lesson with flashcards and quiz questions.</p>
          <div className="study-set-home-stats"><span><strong>{cards.length}</strong> flashcards</span><span><strong>{quiz.length}</strong> quiz questions</span></div>
          <div className="study-set-home-actions"><button type="button" className="primary-btn" onClick={() => { setTab("cards"); setEditorPage("content"); }}><Icon name="Plus" size={16} /> Add flashcards</button><button type="button" className="subtle-btn" onClick={() => { setTab("quiz"); setEditorPage("content"); }}><Icon name="Plus" size={16} /> Add quiz</button></div>
        </div>
      ) : <><div className="study-set-content-heading"><button type="button" className="text-button" onClick={() => setEditorPage("home")}><Icon name="ArrowLeft" size={16} /> Set overview</button><strong>{tab === "cards" ? "Flashcards" : "Quiz"}</strong></div><div className="study-set-tabs"><button type="button" className={tab === "cards" ? "selected" : ""} onClick={() => setTab("cards")}>Flashcards ({cards.length})</button><button type="button" className={tab === "quiz" ? "selected" : ""} onClick={() => setTab("quiz")}>Quiz ({quiz.length})</button></div>{tab === "cards" ? (
        <>
          <div className="study-set-import-actions"><button type="button" className="subtle-btn" onClick={() => csvRef.current?.click()}>Import CSV</button><input ref={csvRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={importCsv} /><button type="button" className="subtle-btn" onClick={exportCards}>Export CSV</button></div>
          {csvPreview && <div className="study-set-preview"><strong>Preview {csvPreview.fileName}</strong><span>{csvPreview.cards.length} cards ready · {csvPreview.skipped.length} skipped</span><button type="button" className="primary-btn" onClick={confirmCsv}>Import cards</button><button type="button" className="text-button" onClick={() => setCsvPreview(null)}>Cancel</button></div>}
          <div className="study-set-items">{cards.length ? cards.map((card) => <article key={card.id}><div><strong>{card.question}</strong><p>{card.answer}</p></div><div><button type="button" className="text-button" onClick={() => updateSet({ cards: cards.filter((item) => item.id !== card.id) }, "Card deleted")}>Delete</button></div></article>) : <div className="study-set-empty"><span aria-hidden="true"><Icon name="PanelsTopLeft" size={20} /></span><strong>No flashcards yet</strong><p>Import a CSV file to add flashcards.</p></div>}</div>
        </>
      ) : (
        <>
          <div className="study-set-import-actions"><button type="button" className="subtle-btn" onClick={() => quizRef.current?.click()}>Import quiz JSON</button><input ref={quizRef} type="file" accept=".json,application/json" hidden onChange={importQuiz} /><button type="button" className="subtle-btn" onClick={exportQuiz}>Export JSON</button></div>
          {quizPreview && <div className="study-set-preview"><strong>Preview {quizPreview.fileName}</strong><span>{quizPreview.questions.length} questions ready</span><button type="button" className="primary-btn" onClick={confirmQuiz}>Import questions</button><button type="button" className="text-button" onClick={() => setQuizPreview(null)}>Cancel</button></div>}
          <div className="study-set-items">{quiz.length ? quiz.map((item) => <article key={item.id}><div><strong>{item.question}</strong><p>{item.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join(" · ")}</p></div><div><button type="button" className="text-button" onClick={() => updateSet({ quiz: quiz.filter((entry) => entry.id !== item.id) }, "Question deleted")}>Delete</button></div></article>) : <div className="study-set-empty"><span aria-hidden="true"><Icon name="Sparkles" size={20} /></span><strong>No quiz questions yet</strong><p>Import a quiz JSON file to add questions.</p></div>}</div>
        </>
      )}</>}
    </section>
  );
}

export default function StudySets({ sets, onChange, toast, onOpenChange }) {
  const [subject, setSubject] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState("");
  const [actionId, setActionId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const subjectRef = useRef(null);
  const visible = useMemo(() => sets.filter((set) => !search || set.subject.toLowerCase().includes(search.toLowerCase())), [sets, search]);
  useEffect(() => {
    onOpenChange?.(openId);
  }, [openId, onOpenChange]);
  const createSet = (event) => {
    event.preventDefault();
    const cleanSubject = limit(displaySubject(subject), 60);
    if (!cleanSubject) return toast("Enter a subject.");
    const level = "Beginner";
    if (sets.some((set) => set.subject.toLowerCase() === cleanSubject.toLowerCase() && set.level === level)) return toast("A study set with this subject already exists.");
    const created = { id: createId(), subject: cleanSubject, level, createdAt: nowIso(), updatedAt: nowIso(), cards: [], quiz: [], lastScore: null, lastScoreDate: "", bestScore: null };
    onChange([...sets, created], "Study set created");
    setSubject("");
    setShowCreate(false);
    setOpenId(created.id);
    onOpenChange?.(created.id);
  };
  const updateSet = (next, message) => onChange(sets.map((set) => set.id === next.id ? next : set), message);
  const rename = (set) => {
    const nextSubject = window.prompt("Rename study set", set.subject);
    const clean = limit(displaySubject(nextSubject), 60);
    if (!clean || clean.toLowerCase() === set.subject.toLowerCase()) return;
    if (sets.some((item) => item.id !== set.id && item.subject.toLowerCase() === clean.toLowerCase() && item.level === set.level)) return toast("A study set with this subject and level already exists.");
    updateSet({ ...set, subject: clean, updatedAt: nowIso() }, "Study set renamed");
  };
  const remove = (set) => {
    if (!window.confirm(`Delete the ${set.subject} study set?`)) return;
    onChange(sets.filter((item) => item.id !== set.id), "Study set deleted", { label: "Undo", onClick: () => onChange(sets, "Study set deletion undone") });
    if (openId === set.id) {
      setOpenId("");
      onOpenChange?.("");
    }
  };
  const open = sets.find((set) => set.id === openId);
  return (
    <section className="study-sets-section" aria-labelledby="study-sets-title">
      {!open ? <><div className="study-set-library-heading"><div><h4>Study sets <span>{sets.length}</span></h4><small>Your lessons and practice materials</small></div><button type="button" className="subtle-btn study-set-new-button" onClick={() => { setShowCreate(true); window.setTimeout(() => subjectRef.current?.focus(), 0); }}><Icon name="Plus" size={16} /> New study set</button></div>{showCreate && <form className="study-set-new-form" onSubmit={createSet}><input ref={subjectRef} value={subject} maxLength="60" required aria-label="Study set subject" placeholder="Subject name" onChange={(event) => setSubject(event.target.value)} /><button type="submit" className="primary-btn">Create</button><button type="button" className="text-button" onClick={() => { setShowCreate(false); setSubject(""); }}>Cancel</button></form>}<div className="study-set-filters"><input value={search} aria-label="Search study sets by subject" placeholder="Search subjects" onChange={(event) => setSearch(event.target.value)} /></div><div className="study-set-list">{visible.map((set) => <article className="study-set-library-card" key={set.id} role="button" tabIndex="0" onClick={() => { setOpenId(set.id); onOpenChange?.(set.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenId(set.id); onOpenChange?.(set.id); } }}><div className="study-set-library-card-content"><h4>{displaySubject(set.subject)}</h4><span>{set.cards.length} flashcards · {set.quiz.length} quiz questions</span><small>Opened {new Date(set.updatedAt).toLocaleDateString()}</small></div><div className="study-set-card-actions"><button type="button" className="study-set-more-button" aria-label={`More actions for ${displaySubject(set.subject)}`} title={`More actions for ${displaySubject(set.subject)}`} aria-expanded={actionId === set.id} onClick={(event) => { event.stopPropagation(); setActionId(actionId === set.id ? "" : set.id); }}><Icon name="Ellipsis" size={18} /></button>{actionId === set.id && <div className="study-set-hidden-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="text-button" onClick={() => rename(set)}>Rename</button><button type="button" className="text-button" onClick={() => remove(set)}>Delete</button></div>}</div></article>)}</div></> : <><div className="study-set-open-heading"><button type="button" className="text-button" onClick={() => { setOpenId(""); onOpenChange?.(""); }}><Icon name="ArrowLeft" size={16} /> All study sets</button><h4>{displaySubject(open.subject)}</h4></div><StudySetEditor key={open.id} set={open} onChange={updateSet} toast={toast} /></>}
    </section>
  );
}
