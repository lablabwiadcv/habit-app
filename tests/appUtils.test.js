import assert from "node:assert/strict";
import test from "node:test";
import {
  averageStreak,
  bestStreak,
  buildWarmupSets,
  classOccursOnDate,
  currentStreak,
  dateFromKey,
  dateKey,
  buildExamStudyPlan,
  createClassCalendarExport,
  createClassCalendarExportWithReport,
  deduplicateFlashcards,
  findDuplicateClassDays,
  dailyStreak,
  fillPausedScheduleDays,
  getClassTimetableRange,
  getHabitScheduleDays,
  getMissedHabitDates,
  isValidBackup,
  isHabitPausedOnDate,
  isWithinQuietHours,
  estimateOneRepMax,
  layoutClassTimetable,
  normalizeQuizAnswer,
  parseFlashcardCsv,
  parseFlashcardCsvWithReport,
  parseScheduleText,
  parseScheduleTextWithReport,
  resumeExpiredHabitPause,
  scheduleSpacedReview,
  summarizeGrades,
  suggestInterclassStudyGaps,
  weeklyStreak,
  WEEKDAYS,
  zonedDateParts,
  weekStartKey,
} from "../src/appUtils.js";

test("alternating classes use their anchor week for A and B schedules", () => {
  const weekA = { day: "Monday", startDate: "2026-03-02", weekPattern: "A" };
  const weekB = { ...weekA, weekPattern: "B" };
  assert.equal(classOccursOnDate(weekA, "2026-03-02"), true);
  assert.equal(classOccursOnDate(weekA, "2026-03-09"), false);
  assert.equal(classOccursOnDate(weekA, "2026-03-16"), true);
  assert.equal(classOccursOnDate(weekB, "2026-03-02"), false);
  assert.equal(classOccursOnDate(weekB, "2026-03-09"), true);
  assert.equal(classOccursOnDate({ day: "Monday" }, "2026-03-09"), true);
});

test("grade projection estimates the final score using assessment weights", () => {
  const result = summarizeGrades([
    { score: 40, max: 50, weight: 40 },
  ], 30, 85);
  assert.equal(result.average, 80);
  assert.equal(result.requiredFinalScore, 96.66666666666667);
  assert.deepEqual(result.weights, [40]);
});

test("grade projection evenly weights older records and handles impossible targets", () => {
  const result = summarizeGrades([
    { score: 80, max: 100 },
    { score: 100, max: 100 },
  ], 30, 95);
  assert.equal(result.average, 90);
  assert.ok(result.requiredFinalScore > 100);
  assert.deepEqual(result.weights, [35, 35]);
  assert.deepEqual(summarizeGrades([], 30, 90), {
    average: null,
    requiredFinalScore: null,
    weights: [],
  });
});

test("grade projection reports an invalid final weight instead of clamping it", () => {
  assert.deepEqual(summarizeGrades([{ score: 80, max: 100 }], 100, 90), {
    average: 80,
    requiredFinalScore: null,
    error: "Final weight must be between 1 and 99",
  });
  assert.deepEqual(summarizeGrades([], 0, 90), {
    average: null,
    requiredFinalScore: null,
    error: "Final weight must be between 1 and 99",
  });
  assert.equal(summarizeGrades([{ score: 80, max: 100 }], true, 90).error, "Final weight must be between 1 and 99");
});

test("daily streak freeze allowance refreshes monthly and is capped at one skip", () => {
  const days = {
    "2026-10-04": { done: true },
    "2026-10-03": { done: false },
    "2026-10-02": { done: true },
    "2026-10-01": { done: true },
    "2026-09-30": { done: false },
    "2026-09-29": { done: true },
  };
  assert.equal(dailyStreak(days, 1, "2026-10-04"), 4);
  assert.equal(dailyStreak(days, 2, "2026-10-04"), 4);
});

test("workout helpers estimate one-rep max and build progressive warm-up sets", () => {
  assert.equal(estimateOneRepMax(60, 8), 76);
  assert.equal(estimateOneRepMax(60, 1), 60);
  assert.equal(estimateOneRepMax(0, 8), 0);
  assert.deepEqual(buildWarmupSets(100, 20, 2.5), [
    { percent: 40, reps: 8, weight: 40 },
    { percent: 60, reps: 5, weight: 60 },
    { percent: 75, reps: 3, weight: 75 },
    { percent: 85, reps: 1, weight: 85 },
  ]);
  assert.deepEqual(buildWarmupSets(40, 20, 2.5), [
    { percent: 50, reps: 8, weight: 20 },
  ]);
  assert.deepEqual(buildWarmupSets(30, 20, 2.5), [
    { percent: 67, reps: 8, weight: 20 },
  ]);
  assert.deepEqual(buildWarmupSets(20, 20, 2.5), []);
});

test("study gap suggestions find windows between classes", () => {
  assert.deepEqual(suggestInterclassStudyGaps({
    day: "Monday",
    date: "2026-10-26",
    classes: [
      { day: "Monday", startTime: "09:00", endTime: "10:00" },
      { day: "Monday", startTime: "11:00", endTime: "12:00" },
      { day: "Monday", startTime: "14:00", endTime: "15:00" },
    ],
  }), [
    { day: "Monday", date: "2026-10-26", time: "10:00", minutes: 60 },
    { day: "Monday", date: "2026-10-26", time: "12:00", minutes: 120 },
  ]);
});

test("study gap suggestions skip overlapping classes using the latest end time", () => {
  assert.deepEqual(suggestInterclassStudyGaps({
    day: "Monday",
    date: "2026-10-26",
    classes: [
      { day: "Monday", startTime: "09:00", endTime: "12:00" },
      { day: "Monday", startTime: "10:00", endTime: "11:00" },
      { day: "Monday", startTime: "13:00", endTime: "14:00" },
    ],
  }), [
    { day: "Monday", date: "2026-10-26", time: "12:00", minutes: 60 },
  ]);
});

test("study gap suggestions subtract scheduled blocks and ignore other dates", () => {
  assert.deepEqual(suggestInterclassStudyGaps({
    day: "Monday",
    date: "2026-10-26",
    classes: [
      { day: "Monday", startTime: "09:00", endTime: "10:00" },
      { day: "Monday", startTime: "12:00", endTime: "13:00" },
    ],
    schedule: [
      { day: "Monday", time: "10:30", minutes: 30 },
      { day: "Monday", date: "2026-10-27", time: "10:00", minutes: 60 },
    ],
  }), [
    { day: "Monday", date: "2026-10-26", time: "10:00", minutes: 30 },
    { day: "Monday", date: "2026-10-26", time: "11:00", minutes: 60 },
  ]);
});

test("study gap suggestions omit short gaps and days with fewer than two classes", () => {
  assert.deepEqual(suggestInterclassStudyGaps({
    day: "Tuesday",
    date: "2026-10-27",
    minMinutes: 45,
    classes: [
      { day: "Tuesday", startTime: "09:00", endTime: "10:00" },
      { day: "Tuesday", startTime: "10:30", endTime: "11:00" },
    ],
  }), []);
  assert.deepEqual(suggestInterclassStudyGaps({
    day: "Wednesday",
    date: "2026-10-28",
    classes: [{ day: "Wednesday", startTime: "09:00", endTime: "10:00" }],
  }), []);
});

test("class schedules accept 24-hour times", () => {
  const [item] = parseScheduleText("Monday 13:00-14:00 Math");
  assert.deepEqual(
    { day: item.day, name: item.name, start: item.startTime, end: item.endTime },
    { day: "Monday", name: "Math", start: "13:00", end: "14:00" },
  );
});

test("class schedules propagate meridiem across compact ranges", () => {
  const [item] = parseScheduleText("Mon 8-9am Biology");
  assert.deepEqual(
    { start: item.startTime, end: item.endTime, name: item.name },
    { start: "08:00", end: "09:00", name: "Biology" },
  );
});

test("class schedules recover common OCR punctuation and zero confusions in times", () => {
  const [dotted] = parseScheduleText("Mon 9.00-10.00 Mathematics");
  assert.deepEqual(
    { start: dotted.startTime, end: dotted.endTime, name: dotted.name },
    { start: "09:00", end: "10:00", name: "Mathematics" },
  );
  const [misread] = parseScheduleText("Wed 1:OO-2:OO History");
  assert.deepEqual(
    { start: misread.startTime, end: misread.endTime, name: misread.name },
    { start: "13:00", end: "14:00", name: "History" },
  );
});

test("class schedules infer an afternoon end time when an AM/PM range crosses noon", () => {
  const [item] = parseScheduleText("Mon 11:00 - 1:00 Chem");
  assert.deepEqual(
    { start: item.startTime, end: item.endTime },
    { start: "11:00", end: "13:00" },
  );
});

test("class schedules reject invalid or reversed time ranges", () => {
  assert.deepEqual(parseScheduleText("Mon 13:00-12:00 Chemistry"), []);
  assert.deepEqual(parseScheduleText("Mon 11pm-1am Chemistry"), []);
  assert.deepEqual(parseScheduleText("Mon 25:00-26:00 Chemistry"), []);
});

test("class schedules accept multiple weekdays and one-time entries", () => {
  const parsed = parseScheduleText("Mon,Wed 9:00-10:00 English\nWed 9:00 Lunch");
  assert.deepEqual(
    parsed.map(({ day, name, startTime, endTime }) => ({ day, name, startTime, endTime })),
    [
      { day: "Monday", name: "English", startTime: "09:00", endTime: "10:00" },
      { day: "Wednesday", name: "English", startTime: "09:00", endTime: "10:00" },
      { day: "Wednesday", name: "Lunch", startTime: "09:00", endTime: "10:00" },
    ],
  );
});

test("class schedules detect duplicate name, day, and time without matching unrelated entries", () => {
  const classes = [
    { name: "Biology", day: "Monday", startTime: "09:00", endTime: "10:00" },
    { name: "History", day: "Wednesday", startTime: "09:00", endTime: "10:00" },
  ];
  assert.deepEqual(
    findDuplicateClassDays(classes, {
      name: " biology ",
      days: ["Monday", "Wednesday", "Friday"],
      startTime: "09:00",
      endTime: "10:00",
    }),
    ["Monday"],
  );
  assert.deepEqual(
    findDuplicateClassDays(classes, {
      name: "Biology",
      days: ["Monday"],
      startTime: "09:30",
      endTime: "10:30",
    }),
    [],
  );
});

test("class timetable labels each hour and pads a mobile day by one hour", () => {
  assert.deepEqual(
    getClassTimetableRange([{ startTime: "06:00", endTime: "07:30" }], 60),
    {
      start: 5 * 60,
      end: 9 * 60,
      hours: [5 * 60, 6 * 60, 7 * 60, 8 * 60],
    },
  );
});

test("class timetable groups overlaps into minimum-width lanes and keeps separate times separate", () => {
  const groups = layoutClassTimetable(
    [
      { id: "a", startTime: "09:00", endTime: "11:00" },
      { id: "b", startTime: "09:00", endTime: "10:00" },
      { id: "c", startTime: "10:00", endTime: "12:00" },
      { id: "d", startTime: "12:00", endTime: "13:00" },
    ],
    8 * 60,
    10,
  );
  assert.deepEqual(
    groups.map(({ laneCount, startSlot, endSlot, entries }) => ({
      laneCount,
      startSlot,
      endSlot,
      entries: entries.map(({ item, lane, gridRow }) => ({
        id: item.id,
        lane,
        gridRow,
      })),
    })),
    [
      {
        laneCount: 2,
        startSlot: 2,
        endSlot: 8,
        entries: [
          { id: "a", lane: 0, gridRow: "1 / 5" },
          { id: "b", lane: 1, gridRow: "1 / 3" },
          { id: "c", lane: 1, gridRow: "3 / 7" },
        ],
      },
      {
        laneCount: 1,
        startSlot: 8,
        endSlot: 10,
        entries: [{ id: "d", lane: 0, gridRow: "1 / 3" }],
      },
    ],
  );
});

test("class schedules infer afternoon times and explain skipped lines", () => {
  const parsed = parseScheduleTextWithReport("Mon 1-2 Math\nWed 25:00-26:00 Science\nNo weekday");
  assert.equal(parsed.classes[0].startTime, "13:00");
  assert.equal(parsed.classes[0].endTime, "14:00");
  assert.equal(parsed.importedLines, 1);
  assert.equal(parsed.totalLines, 3);
  assert.deepEqual(parsed.skipped.map(({ reason }) => reason), [
    "No valid time or time range was found.",
    "No weekday was found.",
  ]);
});

test("weekly streak includes a completed current week and its prior streak", () => {
  const days = {
    "2026-10-19": { done: true },
    "2026-10-20": { done: true },
    "2026-10-21": { done: true },
    "2026-10-26": { done: true },
    "2026-10-27": { done: true },
    "2026-10-28": { done: true },
  };
  const habit = { goal: 3, days };
  assert.equal(currentStreak(habit, "2026-10-28"), 2);
  assert.equal(bestStreak(habit), 2);
});

test("weekly streak keeps the prior streak while this week is still in progress", () => {
  const days = {
    "2026-10-19": { done: true },
    "2026-10-20": { done: true },
    "2026-10-21": { done: true },
    "2026-10-26": { done: true },
  };
  assert.equal(currentStreak({ goal: 3, days }, "2026-10-26"), 1);
});

test("best weekly streak preserves a streak through a partially paused week", () => {
  const days = {
    "2026-10-12": { done: true },
    "2026-10-13": { done: true },
    "2026-10-14": { done: true },
    "2026-10-20": { done: true },
    "2026-10-21": { paused: true },
    "2026-10-27": { done: true },
    "2026-10-28": { done: true },
    "2026-10-29": { done: true },
  };
  assert.equal(bestStreak({ goal: 3, days }), 2);
});

test("streak pauses preserve the current streak without recording a completed habit", () => {
  const days = {
    "2026-10-28": { done: true },
    "2026-10-29": { paused: true },
    "2026-10-30": { done: true },
  };
  assert.equal(currentStreak({ goal: 7, allowance: 0, days }, "2026-10-30"), 2);
  assert.equal(currentStreak({ goal: 3, days }, "2026-10-30"), 1);
});

test("habit schedules limit weekly streak completion to selected weekdays", () => {
  const habit = {
    goal: 3,
    scheduleDays: ["Monday", "Wednesday", "Friday"],
    days: {
      "2026-10-19": { done: true },
      "2026-10-20": { done: true },
      "2026-10-21": { done: true },
      "2026-10-23": { done: true },
      "2026-10-26": { done: true },
      "2026-10-27": { done: true },
      "2026-10-28": { done: true },
    },
  };
  assert.equal(currentStreak(habit, "2026-10-28"), 1);
  assert.equal(bestStreak(habit), 1);
});

test("missed habit dates include only scheduled days and flexible days after a goal becomes impossible", () => {
  assert.deepEqual(getMissedHabitDates({
    goal: 3,
    scheduleDays: ["Monday", "Wednesday"],
    days: {},
  }, "2026-10-26", "2026-10-31"), [
    "2026-10-26",
    "2026-10-28",
  ]);
  assert.deepEqual(getMissedHabitDates({
    goal: 3,
    flexibleWeekly: true,
    startDate: "2026-10-26",
    days: {},
  }, "2026-10-26", "2026-11-01"), [
    "2026-10-30",
    "2026-10-31",
  ]);
});

test("missed-reason candidates stay within the last seven days for long-running habits", () => {
  const end = dateFromKey("2026-11-07");
  const start = new Date(end);
  start.setDate(start.getDate() - 40);
  const reasonWindowStart = new Date(end);
  reasonWindowStart.setDate(reasonWindowStart.getDate() - 7);
  const habit = {
    goal: 7,
    startDate: dateKey(start),
    days: {},
  };
  const promptDates = getMissedHabitDates(
    habit,
    dateKey(reasonWindowStart),
    dateKey(end),
  ).reverse();

  assert.ok(promptDates.length >= 2);
  assert.equal(promptDates[0], "2026-11-06");
  assert.ok(promptDates.every((key) => key >= dateKey(reasonWindowStart) && key < dateKey(end)));
  assert.ok(promptDates.every((key) => dateFromKey(key) >= dateFromKey("2026-10-31")));
});

test("habit schedules infer a default and preserve skipped days", () => {
  assert.deepEqual(getHabitScheduleDays({ goal: 3 }), ["Monday", "Tuesday", "Wednesday"]);
  const habit = {
    goal: 2,
    scheduleDays: ["Thursday", "Sunday"],
    days: {
      "2026-10-22": { done: true },
      "2026-10-25": { done: true },
      "2026-10-29": { done: true },
      "2026-11-01": { done: true },
    },
  };
  assert.equal(currentStreak(habit, "2026-11-01"), 2);
});

test("paused habits hold their streak and mark scheduled days as paused on resume", () => {
  const habit = {
    goal: 3,
    scheduleDays: ["Monday", "Wednesday", "Friday"],
    paused: true,
    pausedAt: "2026-10-31",
    days: {
      "2026-10-19": { done: true },
      "2026-10-21": { done: true },
      "2026-10-23": { done: true },
      "2026-10-26": { done: true },
      "2026-10-28": { done: true },
      "2026-10-30": { done: true },
    },
  };
  assert.equal(isHabitPausedOnDate(habit, "2026-10-30"), false);
  assert.equal(isHabitPausedOnDate(habit, "2026-10-31"), true);
  assert.equal(currentStreak(habit, "2026-11-02"), 2);

  const resumedDays = fillPausedScheduleDays(habit, "2026-10-31", "2026-11-04");
  assert.equal(resumedDays["2026-11-02"].paused, true);
  assert.equal(resumedDays["2026-11-03"], undefined);
  assert.equal(resumedDays["2026-11-04"], undefined);
});

test("dated habit pauses only apply inside the selected pause window", () => {
  const habit = {
    paused: true,
    pausedAt: "2026-10-20",
    pauseUntil: "2026-10-31",
  };
  assert.equal(isHabitPausedOnDate(habit, "2026-10-19"), false);
  assert.equal(isHabitPausedOnDate(habit, "2026-10-20"), true);
  assert.equal(isHabitPausedOnDate(habit, "2026-10-31"), true);
  assert.equal(isHabitPausedOnDate(habit, "2026-11-01"), false);
});

test("expired dated habit pauses mark scheduled days and resume without losing the streak", () => {
  const completedDays = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const date = new Date("2026-10-14T00:00:00");
      date.setDate(date.getDate() + index);
      return [dateKey(date), { done: true }];
    }),
  );
  const habit = {
    goal: 7,
    allowance: 0,
    scheduleDays: [...WEEKDAYS],
    paused: true,
    pausedAt: "2026-10-24",
    pauseUntil: "2026-10-29",
    days: completedDays,
  };
  const resumed = resumeExpiredHabitPause(habit, "2026-10-30");

  assert.equal(resumed.paused, false);
  assert.equal(resumed.days["2026-10-24"].paused, true);
  assert.equal(resumed.days["2026-10-29"].paused, true);
  assert.equal(currentStreak(resumed, "2026-10-30"), 10);
});

test("habit pauses remain unchanged until the day after their end date", () => {
  const habit = { paused: true, pausedAt: "2026-10-25", pauseUntil: "2026-10-29", days: {} };
  assert.equal(resumeExpiredHabitPause(habit, "2026-10-29"), habit);
});

test("quiet hours support normal and overnight windows", () => {
  assert.equal(isWithinQuietHours("22:30", "22:00", "07:00"), true);
  assert.equal(isWithinQuietHours("06:59", "22:00", "07:00"), true);
  assert.equal(isWithinQuietHours("07:00", "22:00", "07:00"), false);
  assert.equal(isWithinQuietHours("12:00", "09:00", "17:00"), true);
  assert.equal(isWithinQuietHours("17:00", "09:00", "17:00"), false);
});

test("reminder time zones produce local weekday, date, and time", () => {
  assert.deepEqual(
    zonedDateParts(new Date("2026-10-30T23:30:00Z"), "Asia/Manila"),
    { date: "2026-10-31", time: "07:30", weekday: "Saturday" },
  );
});

test("quiz answer normalization preserves non-Latin letters and diacritics", () => {
  assert.notEqual(normalizeQuizAnswer("水"), normalizeQuizAnswer("火"));
  assert.equal(normalizeQuizAnswer("café"), normalizeQuizAnswer("cafe"));
  assert.equal(normalizeQuizAnswer("東京！"), normalizeQuizAnswer("東京"));
  assert.equal(normalizeQuizAnswer("1,000"), normalizeQuizAnswer("1000"));
});

test("date helpers use local calendar dates", () => {
  const date = new Date(2026, 9, 30, 0, 15);
  assert.equal(dateKey(date), "2026-10-30");
  assert.equal(weekStartKey(date), "2026-10-26");
});

test("spaced repetition updates SM-2 interval and resets a missed card", () => {
  const first = scheduleSpacedReview({ repetitions: 0, intervalDays: 0, easeFactor: 2.5 }, 4, "2026-10-30");
  assert.deepEqual(
    { repetitions: first.repetitions, interval: first.intervalDays, due: first.dueAt },
    { repetitions: 1, interval: 1, due: "2026-10-31" },
  );
  const second = scheduleSpacedReview(first, 5, "2026-10-31");
  assert.equal(second.intervalDays, 6);
  const missed = scheduleSpacedReview(second, 2, "2026-11-06");
  assert.equal(missed.repetitions, 0);
  assert.equal(missed.intervalDays, 1);
  assert.equal(scheduleSpacedReview({ easeFactor: 2.5 }, 2, "2026-10-30").easeFactor, 2.3);
});

test("flashcard import reads Anki tab rows and quoted CSV", () => {
  assert.deepEqual(parseFlashcardCsv("Front\tBack\nQuestion\tAnswer"), [
    { question: "Question", answer: "Answer" },
  ]);
  assert.deepEqual(parseFlashcardCsv('Question,Answer\n"What, now?","Say ""hello"""'), [
    { question: "What, now?", answer: 'Say "hello"' },
  ]);
  assert.deepEqual(parseFlashcardCsv('Front,Back\n"Line one\nLine two",Answer'), [
    { question: "Line one\nLine two", answer: "Answer" },
  ]);
});

test("flashcard import detects delimiters after comments and reports bad rows", () => {
  const parsed = parseFlashcardCsvWithReport("# Flashcard export\nQuestion;Answer\nQ1;A1\nQ2;\n");
  assert.deepEqual(parsed.cards, [{ question: "Q1", answer: "A1" }]);
  assert.equal(parsed.skipped.length, 1);
  assert.match(parsed.skipped[0].reason, /Answer is empty/);
});

test("flashcard import rejects unclosed quotes", () => {
  const parsed = parseFlashcardCsvWithReport('Question,Answer\n"never closed,answer\nQ2,A2');
  assert.match(parsed.error, /unclosed quote/);
  assert.deepEqual(parsed.cards, []);
  assert.throws(() => parseFlashcardCsv('"never closed'), /unclosed quote/);
});

test("flashcard imports skip duplicates from the file and existing collection", () => {
  const result = deduplicateFlashcards([
    { question: "Question", answer: "Answer" },
    { question: " new  card ", answer: "A" },
    { question: "NEW CARD", answer: "a" },
  ], [{ question: "question", answer: "answer" }]);
  assert.deepEqual(result.cards, [{ question: " new  card ", answer: "A" }]);
  assert.equal(result.duplicates.length, 2);
});

test("backup imports require an object with a habits array", () => {
  assert.equal(isValidBackup([1, 2, 3]), false);
  assert.equal(isValidBackup({ tasks: [] }), false);
  assert.equal(isValidBackup({ habits: [null] }), false);
  assert.equal(isValidBackup({ habits: [{ name: "Reading" }] }), true);
});

test("exam planner skips class overlaps and uses matching study times", () => {
  const plan = buildExamStudyPlan({
    topics: ["Arrays", "Loops"],
    startKey: "2026-10-26",
    examKey: "2026-10-28",
    classes: [{ day: "Monday", startTime: "18:00", endTime: "20:00" }],
    schedule: [{ day: "Monday", time: "19:00", minutes: 45 }],
    subject: "Computer Science",
  });
  assert.deepEqual(
    plan.map(({ topic, day, time }) => ({ topic, day, time })),
    [{ topic: "Arrays", day: "Monday", time: "17:00" }, { topic: "Loops", day: "Monday", time: "20:00" }],
  );
});

test("exam planner respects class start and end minutes", () => {
  const plan = buildExamStudyPlan({
    topics: ["Arrays"],
    startKey: "2026-10-26",
    examKey: "2026-10-27",
    classes: [{ day: "Monday", startTime: "17:30", endTime: "18:30" }],
    subject: "Computer Science",
  });
  assert.equal(plan[0].time, "19:00");
});

test("exam planner offers four study slots per day", () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const exam = new Date(start);
  exam.setDate(exam.getDate() + 3);
  const plan = buildExamStudyPlan({
    topics: Array.from({ length: 20 }, (_, index) => `Topic ${index + 1}`),
    startKey: dateKey(start),
    examKey: dateKey(exam),
    subject: "Computer Science",
  });
  assert.equal(plan.length, 12);
  assert.equal(Math.max(...Object.values(plan.reduce((counts, item) => {
    counts[item.date] = (counts[item.date] || 0) + 1;
    return counts;
  }, {}))), 4);
});

test("class calendar export creates weekly recurring calendar events", () => {
  const calendar = createClassCalendarExport([{
    id: "math-1",
    name: "Math, II",
    day: "Monday",
    startTime: "09:30",
    endTime: "10:30",
    location: "Room 2; east",
  }]);
  assert.match(calendar, /RRULE:FREQ=WEEKLY;BYDAY=MO/);
  assert.match(calendar, /TZID=Asia\/Singapore/);
  assert.match(calendar, /UNTIL=.*Z/);
  assert.match(calendar, /SUMMARY:Math\\, II/);
  assert.match(calendar, /LOCATION:Room 2\\; east/);
});

test("class calendar export skips invalid entries and folds long lines", () => {
 const result = createClassCalendarExportWithReport([
   {
     id: "long",
     name: "A class name that is deliberately long enough to make this calendar summary line exceed seventy-five octets",
      day: "Monday",
     startTime: "09:30",
     endTime: "10:30",
   },
   {
     id: "invalid",
     name: "Bad time",
     day: "Monday",
     startTime: "25:00",
     endTime: "26:00",
   },
 ]);
 assert.equal(result.exportedCount, 1);
 assert.equal(result.skipped.length, 1);
 assert.match(result.calendar, /SUMMARY:A class name/);
 assert.ok(result.calendar.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75));
});

test("class calendar export keeps alternating-week classes every other week", () => {
  const { calendar } = createClassCalendarExportWithReport([
    {
      id: "alternating",
      name: "Biology",
      day: "Monday",
      startTime: "08:00",
      endTime: "09:00",
      weekPattern: "B",
      startDate: "2026-03-02",
    },
  ]);
  assert.match(calendar, /RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO/);
});

test("best streak calculates long histories in one pass", () => {
 const days = {};
 const start = new Date(2024, 0, 1);
 for (let index = 0; index < 900; index += 1) {
   const date = new Date(start);
   date.setDate(start.getDate() + index);
   days[dateKey(date)] = { done: true };
 }
 const started = performance.now();
 assert.equal(bestStreak({ goal: 7, days }), 900);
 assert.ok(performance.now() - started < 250);
});

test("average streak reports the mean length of completed daily runs", () => {
  assert.equal(averageStreak({
    goal: 7,
    days: {
      "2026-10-01": { done: true },
      "2026-10-02": { done: true },
      "2026-10-04": { done: true },
    },
  }), 1.5);
});

test("streak helpers stop safely for invalid goals and excessive allowances", () => {
 assert.equal(weeklyStreak({}, 0, "2026-10-30"), 0);
 assert.equal(dailyStreak({}, 7, "2026-10-30"), 0);
});
