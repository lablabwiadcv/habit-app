import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStudySets,
  parseFlashcardCsvWithReport,
  validateStudySetQuiz,
} from "../src/appUtils.js";

test("duplicate study sets are detected case-insensitively by subject and level", () => {
  const sets = normalizeStudySets([
    { id: "one", subject: " Biology ", level: "Beginner" },
    { id: "two", subject: "biology", level: " beginner " },
    { id: "three", subject: " biology ", level: " Advanced " },
    { id: "four", subject: "BIOLOGY", level: "advanced" },
  ]);
  assert.equal(sets.length, 2);
  const duplicate = sets.some((set) => set.subject.toLowerCase() === "biology" && set.level === "Beginner");
  assert.equal(duplicate, true);
  assert.equal(sets.some((set) => set.subject.toLowerCase() === "biology" && set.level === "Advanced"), true);
});

test("study set normalization drops duplicate subjects and invalid quiz indexes", () => {
  const sets = normalizeStudySets([
    {
      id: "one",
      subject: " Biology ",
      level: "Beginner",
      quiz: [
        { question: "Valid?", options: ["A", "B", "C", "D"], correctIndex: 2 },
        { question: "Out of range?", options: ["A", "B", "C", "D"], correctIndex: 4 },
        { question: "Not an integer?", options: ["A", "B", "C", "D"], correctIndex: "2" },
      ],
    },
    { id: "two", subject: "biology", level: " beginner " },
  ]);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].quiz.length, 1);
  assert.equal(sets[0].quiz[0].correctIndex, 2);
});

test("CSV cards can be imported into a study set", () => {
  const report = parseFlashcardCsvWithReport('Question,Answer\n"What is CSS?","A styling language"\nBad row');
  assert.equal(report.cards.length, 1);
  const set = normalizeStudySets([{ subject: "Web", level: "Beginner", cards: report.cards }])[0];
  assert.equal(set.cards[0].question, "What is CSS?");
  assert.equal(set.cards[0].answer, "A styling language");
});

test("quiz JSON validation requires four options and a valid answer index", () => {
  const valid = validateStudySetQuiz([{ question: "2+2?", options: ["3", "4", "5", "6"], correctIndex: 1, explanation: "Addition." }]);
  assert.equal(valid.valid, true);
  const invalid = validateStudySetQuiz([{ question: "2+2?", options: ["4"], correctIndex: 0 }]);
  assert.equal(invalid.valid, false);
});

test("quiz JSON validation rejects duplicate options with the question number", () => {
  const invalid = validateStudySetQuiz([{
    question: "Choose one",
    options: ["Apple", " apple ", "Pear", "Plum"],
    correctIndex: 0,
  }]);
  assert.deepEqual(invalid, {
    valid: false,
    error: "Question 1 must have four different options.",
  });
});

test("old saved data without study sets normalizes safely", () => {
  const sets = normalizeStudySets(undefined);
  assert.deepEqual(sets, []);
  const oldSet = normalizeStudySets([{ subject: "Old", level: "Beginner" }]);
  assert.deepEqual(oldSet[0].cards, []);
  assert.deepEqual(oldSet[0].quiz, []);
});
