export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const dateFromKey = (key) => new Date(`${key}T00:00:00`);

export const weekStartKey = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return dateKey(start);
};

export function classOccursOnDate(item, key) {
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(key || "")) return false;
  if (item.weekPattern !== "A" && item.weekPattern !== "B") return true;
  const anchorKey = /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "")
    ? item.startDate
    : key;
  const targetMonday = dateFromKey(weekStartKey(dateFromKey(key)));
  const anchorMonday = dateFromKey(weekStartKey(dateFromKey(anchorKey)));
  const weekOffset = Math.round((targetMonday - anchorMonday) / 604800000);
  const parity = ((weekOffset % 2) + 2) % 2;
  return parity === (item.weekPattern === "B" ? 1 : 0);
}

export function findDuplicateClassDays(classes, { name, days, startTime, endTime }) {
  const normalizedName = String(name || "").trim().toLowerCase();
  return days.filter((day) =>
    classes.some(
      (item) =>
        String(item.name || "").trim().toLowerCase() === normalizedName &&
        item.day === day &&
        item.startTime === startTime &&
        item.endTime === endTime,
    ),
  );
}

export function getClassTimetableRange(classes, padding = 0) {
  const minutes = classes
    .filter(
      (item) =>
        /^\d{2}:\d{2}$/.test(item.startTime || "") &&
        /^\d{2}:\d{2}$/.test(item.endTime || ""),
    )
    .flatMap((item) => [
      Number(item.startTime.slice(0, 2)) * 60 + Number(item.startTime.slice(3)),
      Number(item.endTime.slice(0, 2)) * 60 + Number(item.endTime.slice(3)),
    ]);
  if (!minutes.length) {
    return { start: 7 * 60, end: 8 * 60, hours: [] };
  }
  const start = Math.max(
    0,
    Math.floor((Math.min(...minutes) - padding) / 60) * 60,
  );
  const end = Math.min(
    24 * 60,
    Math.ceil((Math.max(...minutes) + padding) / 60) * 60,
  );
  const hours = Array.from(
    { length: Math.ceil((end - start) / 60) },
    (_, index) => start + index * 60,
  );
  return { start, end, hours };
}

export function layoutClassTimetable(dayClasses, gridStart, slotCount) {
  const groups = [];
  [...dayClasses]
    .filter(
      (item) =>
        /^\d{2}:\d{2}$/.test(item.startTime || "") &&
        /^\d{2}:\d{2}$/.test(item.endTime || ""),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .forEach((item) => {
      const start =
        Number(item.startTime.slice(0, 2)) * 60 +
        Number(item.startTime.slice(3));
      const end =
        Number(item.endTime.slice(0, 2)) * 60 +
        Number(item.endTime.slice(3));
      let group = groups.at(-1);
      if (!group || start >= group.end) {
        group = { start, end, laneEnds: [], entries: [] };
        groups.push(group);
      }
      let lane = group.laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) lane = group.laneEnds.length;
      group.laneEnds[lane] = end;
      group.end = Math.max(group.end, end);
      group.entries.push({ item, lane, start, end });
    });

  return groups.map((group) => {
    const startSlot = Math.max(
      0,
      Math.floor((group.start - gridStart) / 30),
    );
    const endSlot = Math.min(
      slotCount,
      Math.max(startSlot + 1, Math.ceil((group.end - gridStart) / 30)),
    );
    return {
      ...group,
      startSlot,
      endSlot,
      slotCount: endSlot - startSlot,
      laneCount: group.laneEnds.length,
      entries: group.entries.map((entry) => {
        const entryStartSlot = Math.max(
          startSlot,
          Math.floor((entry.start - gridStart) / 30),
        );
        const entryEndSlot = Math.min(
          endSlot,
          Math.max(
            entryStartSlot + 1,
            Math.ceil((entry.end - gridStart) / 30),
          ),
        );
        return {
          ...entry,
          gridRow: `${entryStartSlot - startSlot + 1} / ${entryEndSlot - startSlot + 1}`,
        };
      }),
    };
  });
}

export const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const STUDY_SET_LEVELS = ["Beginner", "Intermediate", "Advanced"];

export function normalizeStudySets(value) {
  if (!Array.isArray(value)) return [];
  const seenSetKeys = new Set();
  return value
    .filter((set) => set && typeof set === "object")
    .map((set) => ({
      id: String(set.id || createId()),
      subject: String(set.subject || "").trim().replace(/\s*@\s*$/, "").slice(0, 60),
      level: STUDY_SET_LEVELS.find((level) =>
        level.toLowerCase() === String(set.level || "").trim().toLowerCase(),
      ) || "Beginner",
      createdAt: String(set.createdAt || new Date().toISOString()),
      updatedAt: String(set.updatedAt || set.createdAt || new Date().toISOString()),
      cards: Array.isArray(set.cards)
        ? set.cards.filter((card) => card && String(card.question || "").trim() && String(card.answer || "").trim()).map((card) => ({
            id: String(card.id || createId()),
            question: String(card.question).trim().slice(0, 300),
            answer: String(card.answer).trim().slice(0, 500),
          }))
        : [],
      quiz: Array.isArray(set.quiz)
        ? set.quiz.filter((item) => item &&
          String(item.question || "").trim() &&
          Array.isArray(item.options) &&
          item.options.length === 4 &&
          Number.isInteger(item.correctIndex) &&
          item.correctIndex >= 0 &&
          item.correctIndex <= 3).map((item) => ({
            id: String(item.id || createId()),
            question: String(item.question).trim().slice(0, 300),
            options: item.options.map((option) => String(option || "").trim().slice(0, 200)),
            correctIndex: item.correctIndex,
            explanation: String(item.explanation || "").trim().slice(0, 500),
          }))
        : [],
      lastScore: Number.isFinite(Number(set.lastScore)) ? Math.max(0, Number(set.lastScore)) : null,
      lastScoreDate: String(set.lastScoreDate || ""),
      bestScore: Number.isFinite(Number(set.bestScore)) ? Math.max(0, Number(set.bestScore)) : null,
    }))
    .filter((set) => {
      if (!set.subject) return false;
      const key = `${set.subject.trim().toLowerCase()}|${set.level.toLowerCase()}`;
      if (seenSetKeys.has(key)) return false;
      seenSetKeys.add(key);
      return true;
    });
}

export function validateStudySetQuiz(value) {
  if (!Array.isArray(value)) return { valid: false, error: "Quiz JSON must be an array." };
  const questions = value.map((item, index) => {
    if (!item || typeof item !== "object" || !String(item.question || "").trim()) {
      return { error: `Question ${index + 1} needs a question.` };
    }
    if (!Array.isArray(item.options) || item.options.length !== 4 || item.options.some((option) => !String(option || "").trim())) {
      return { error: `Question ${index + 1} must have exactly four non-empty options.` };
    }
    if (new Set(item.options.map((option) => String(option).trim().toLowerCase())).size !== 4) {
      return { error: `Question ${index + 1} must have four different options.` };
    }
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) {
      return { error: `Question ${index + 1} has an invalid correctIndex.` };
    }
    return {
      id: String(item.id || createId()),
      question: String(item.question).trim().slice(0, 300),
      options: item.options.map((option) => String(option).trim().slice(0, 200)),
      correctIndex: item.correctIndex,
      explanation: String(item.explanation || "").trim().slice(0, 500),
    };
  });
  const error = questions.find((item) => item?.error);
  return error ? { valid: false, error: error.error } : { valid: true, questions };
}

export function scheduleSpacedReview(card, quality, reviewedOn = dateKey(new Date())) {
  const rawScore = Number(quality);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(5, rawScore)) : 0;
  const previousRepetitions = Math.max(0, Number(card.repetitions) || 0);
  const previousInterval = Math.max(0, Number(card.intervalDays) || 0);
  const previousEase = Math.max(1.3, Number(card.easeFactor) || 2.5);
  const easeFactor = score < 3
    ? Math.max(1.3, previousEase - 0.2)
    : Math.max(1.3, previousEase + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
  const repetitions = score < 3 ? 0 : previousRepetitions + 1;
  const intervalDays = score < 3
    ? 1
    : repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.max(1, Math.round(previousInterval * easeFactor));
  const due = dateFromKey(reviewedOn);
  due.setDate(due.getDate() + intervalDays);
  return {
    repetitions,
    intervalDays,
    easeFactor,
    reviewedAt: reviewedOn,
    dueAt: dateKey(due),
  };
}

export function parseFlashcardCsvWithReport(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  if (!input.trim()) return { cards: [], skipped: [], error: "" };
  const lines = input.split(/\r?\n/);
  const firstDataLine = lines.findIndex((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (firstDataLine === -1) return { cards: [], skipped: [], error: "" };
  const csv = lines.slice(firstDataLine).join("\n");
  const firstLine = csv.split(/\r?\n/, 1)[0];
  const delimiters = ["\t", ",", ";"];
  const delimiterCounts = delimiters.map((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      if (firstLine[index] === '"' && firstLine[index + 1] === '"' && quoted) {
        index += 1;
      } else if (firstLine[index] === '"') {
        quoted = !quoted;
      } else if (firstLine[index] === delimiter && !quoted) {
        count += 1;
      }
    }
    return count;
  });
  const delimiter = delimiters[delimiterCounts.indexOf(Math.max(...delimiterCounts))];
  const rows = [];
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"' && csv[index + 1] === '"' && quoted) {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      fields.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      fields.push(field.trim());
      if (fields.some(Boolean)) rows.push([...fields]);
      fields.length = 0;
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) {
    return {
      cards: [],
      skipped: [],
      error: "The CSV has an unclosed quote. Fix the quoted field and try again.",
    };
  }
  fields.push(field.trim());
  if (fields.some(Boolean)) rows.push(fields);
  const dataRows = rows.filter((row) => !(row.length === 1 && row[0].trimStart().startsWith("#")));
  const hasHeader = /^(front|question|term)$/i.test(dataRows[0]?.[0] || "") &&
    /^(back|answer|definition)$/i.test(dataRows[0]?.[1] || "");
  const skipped = [];
  const cards = dataRows
    .slice(hasHeader ? 1 : 0)
    .flatMap(([question, answer], index) => {
      const card = { question: question?.trim() || "", answer: answer?.trim() || "" };
      if (card.question && card.answer) return [card];
      skipped.push({
        row: index + (hasHeader ? 2 : 1),
        reason: !card.question && !card.answer
          ? "Both question and answer are empty."
          : !card.question
            ? "Question is empty."
            : "Answer is empty.",
      });
      return [];
    });
  return { cards, skipped, error: "" };
}

export function parseFlashcardCsv(text) {
  const result = parseFlashcardCsvWithReport(text);
  if (result.error) throw new Error(result.error);
  return result.cards;
}

function flashcardKey(card) {
  return [card.question, card.answer]
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .join("\u0000");
}

export function deduplicateFlashcards(cards, existingCards = []) {
  const known = new Set(existingCards.map(flashcardKey));
  const unique = [];
  const duplicates = [];
  for (const card of cards) {
    const key = flashcardKey(card);
    if (known.has(key)) duplicates.push(card);
    else {
      known.add(key);
      unique.push(card);
    }
  }
  return { cards: unique, duplicates };
}

export function isValidBackup(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.habits) &&
    value.habits.every((habit) => habit && typeof habit === "object" && !Array.isArray(habit)),
  );
}

export function buildExamStudyPlan({
  topics,
  startKey,
  examKey,
  classes = [],
  schedule = [],
  subject,
  minutes = 45,
}) {
  if (!topics.length || !examKey || examKey <= startKey) return [];
  const candidates = [];
  const start = dateFromKey(startKey);
  const end = dateFromKey(examKey);
  const preferredByDay = new Map();
  for (const block of schedule) {
    if (!block.day || block.date || !block.time) continue;
    preferredByDay.set(block.day, [...(preferredByDay.get(block.day) || []), block.time]);
  }
  const fallbackTimes = ["17:00", "18:00", "19:00", "20:00"];
  const currentDate = dateKey(new Date());
  const currentTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
  for (const date = new Date(start.getFullYear(), start.getMonth(), start.getDate()); date < end; date.setDate(date.getDate() + 1)) {
    const key = dateKey(date);
    const day = WEEKDAYS[(date.getDay() + 6) % 7];
    const preferred = preferredByDay.get(day) || [];
    const times = [...new Set([...preferred, ...fallbackTimes])];
    let scheduledForDay = 0;
    for (const time of times) {
      if (key === currentDate && time <= currentTime) continue;
      const [hour, minute] = time.split(":").map(Number);
      const startMinute = hour * 60 + minute;
      const endMinute = startMinute + minutes;
      const overlaps = (from, to) => startMinute < to && endMinute > from;
      const classConflict = classes.some((item) => {
        if (item.day !== day || !item.startTime || !item.endTime) return false;
        const [fromHour, fromMinute] = item.startTime.split(":").map(Number);
        const [toHour, toMinute] = item.endTime.split(":").map(Number);
        return overlaps(fromHour * 60 + fromMinute, toHour * 60 + toMinute);
      });
      const existingConflict = schedule.some((item) => {
        if (item.date && item.date !== key) return false;
        if (!item.date && item.day !== day) return false;
        if (!item.time) return false;
        const [fromHour, fromMinute] = item.time.split(":").map(Number);
        const from = fromHour * 60 + fromMinute;
        return startMinute < from + Number(item.minutes || 60) && endMinute > from;
      });
      if (classConflict || existingConflict) continue;
      candidates.push({ date: key, day, time, minutes });
      scheduledForDay += 1;
      if (scheduledForDay >= 4) break;
    }
  }
  return topics.slice(0, candidates.length).map((topic, index) => ({
    id: createId(),
    subject,
    topic: typeof topic === "string" ? topic : topic.title,
    ...candidates[index],
    done: false,
    examPlan: true,
  }));
}

export function suggestInterclassStudyGaps({
  day,
  date,
  classes = [],
  schedule = [],
  minMinutes = 30,
}) {
  const toMinutes = (time) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const dayClasses = classes
    .filter((item) => item.day === day)
    .map((item) => ({
      start: toMinutes(item.startTime),
      end: toMinutes(item.endTime),
    }))
    .filter((item) => item.start !== null && item.end !== null && item.end > item.start)
    .sort((a, b) => a.start - b.start);
  if (dayClasses.length < 2) return [];

  const planned = schedule
    .filter((item) => item.time && (item.date ? item.date === date : item.day === day))
    .map((item) => {
      const start = toMinutes(item.time);
      return {
        start,
        end: start === null ? null : start + Math.max(1, Number(item.minutes) || 60),
      };
    })
    .filter((item) => item.start !== null && item.end > item.start);

  const suggestions = [];
  let latestEnd = dayClasses[0].end;
  for (const nextClass of dayClasses.slice(1)) {
    const gapStart = latestEnd;
    const gapEnd = nextClass.start;

    if (gapEnd - gapStart >= minMinutes) {
      let cursor = gapStart;
      const occupied = planned
        .filter((item) => item.start < gapEnd && item.end > gapStart)
        .map((item) => ({
          start: Math.max(gapStart, item.start),
          end: Math.min(gapEnd, item.end),
        }))
        .sort((a, b) => a.start - b.start);
      for (const interval of [...occupied, { start: gapEnd, end: gapEnd }]) {
        if (interval.start - cursor >= minMinutes) {
          const start = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
          suggestions.push({ day, date, time: start, minutes: interval.start - cursor });
        }
        cursor = Math.max(cursor, interval.end);
      }
    }
    latestEnd = Math.max(latestEnd, nextClass.end);
  }
  return suggestions;
}

export function summarizeGrades(grades, finalWeight = 30, targetGrade = 90) {
  const validGrades = (Array.isArray(grades) ? grades : []).filter((grade) => {
    const score = Number(grade.score);
    const max = Number(grade.max);
    return Number.isFinite(score) && Number.isFinite(max) && max > 0 && score >= 0 && score <= max;
  });
  const finalShare = Number(finalWeight);
  const validFinalWeightType = typeof finalWeight === "number" ||
    (typeof finalWeight === "string" && finalWeight.trim() !== "");
  if (!validFinalWeightType || !Number.isFinite(finalShare) || finalShare < 1 || finalShare > 99) {
    const weights = validGrades.map((grade) =>
      grade.weight !== undefined && grade.weight !== null && grade.weight !== "" &&
      Number.isFinite(Number(grade.weight)) && Number(grade.weight) >= 0
        ? Number(grade.weight)
        : 1,
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const average = totalWeight
      ? validGrades.reduce((sum, grade, index) =>
          sum + Number(grade.score) / Number(grade.max) * 100 * weights[index],
        0) / totalWeight
      : null;
    return {
      average,
      requiredFinalScore: null,
      error: "Final weight must be between 1 and 99",
    };
  }
  if (!validGrades.length) {
    return { average: null, requiredFinalScore: null, weights: [] };
  }

  const explicitWeight = (grade) =>
    grade.weight !== undefined && grade.weight !== null && grade.weight !== "" &&
    Number.isFinite(Number(grade.weight)) && Number(grade.weight) >= 0;
  const assignedWeight = validGrades.reduce((sum, grade) =>
    sum + (explicitWeight(grade) ? Number(grade.weight) : 0), 0,
  );
  const unweightedCount = validGrades.filter((grade) => !explicitWeight(grade)).length;
  const implicitWeight = unweightedCount
    ? Math.max(0, 100 - finalShare - assignedWeight) / unweightedCount
    : 0;
  const weights = validGrades.map((grade) =>
    explicitWeight(grade) ? Number(grade.weight) : implicitWeight,
  );
  const percentages = validGrades.map((grade) => Number(grade.score) / Number(grade.max) * 100);
  const courseworkWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const average = percentages.reduce((sum, score, index) => sum + score * weights[index], 0) /
    Math.max(1, courseworkWeight);
  const remainingCourseworkWeight = Math.max(0, 100 - finalShare - courseworkWeight);
  const recordedContribution = percentages.reduce(
    (sum, score, index) => sum + score * weights[index] / 100,
    0,
  );
  const projectedContribution = recordedContribution +
    average * remainingCourseworkWeight / 100;
  const requiredFinalScore = Math.max(
    0,
    (Number(targetGrade || 0) - projectedContribution) * 100 / finalShare,
  );
  return { average, requiredFinalScore, weights };
}

export function createClassCalendarExportWithReport(classes) {
  const escapeText = (value) => String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
  const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const toDateTime = (time) => `${time.replaceAll(":", "")}00`;
  const isValidTime = (time) => {
    if (!/^\d{2}:\d{2}$/.test(time || "")) return false;
    const [hour, minute] = time.split(":").map(Number);
    return hour < 24 && minute < 60;
  };
  const allClasses = Array.isArray(classes) ? classes : [];
  const validClasses = allClasses.filter((item) =>
    item &&
    WEEKDAYS.includes(item.day) &&
    isValidTime(item.startTime) &&
    isValidTime(item.endTime) &&
    item.startTime < item.endTime &&
    String(item.name || "").trim(),
  );
  const skipped = allClasses.filter((item) => !validClasses.includes(item));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Daymark//Class Timetable//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Singapore",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:SGT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  validClasses.forEach((item) => {
    const dayIndex = WEEKDAYS.indexOf(item.day);
    const now = new Date();
    const stamp = now.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
    const nextClass = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysUntilClass = (dayIndex - ((now.getDay() + 6) % 7) + 7) % 7;
    nextClass.setDate(nextClass.getDate() + daysUntilClass);
    if (daysUntilClass === 0 && item.startTime <= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`) {
      nextClass.setDate(nextClass.getDate() + 7);
    }
    while (!classOccursOnDate(item, dateKey(nextClass))) {
      nextClass.setDate(nextClass.getDate() + 7);
    }
    const dateStamp = dateKey(nextClass).replaceAll("-", "");
    const until = new Date(nextClass);
    until.setFullYear(until.getFullYear() + 1);
    const untilUtc = new Date(`${dateKey(until)}T23:59:59+08:00`)
      .toISOString()
      .replaceAll("-", "")
      .replaceAll(":", "")
      .replace(/\.\d{3}Z$/, "Z");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(item.id)}@daymark.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Singapore:${dateStamp}T${toDateTime(item.startTime)}`,
      `DTEND;TZID=Asia/Singapore:${dateStamp}T${toDateTime(item.endTime)}`,
      `RRULE:FREQ=WEEKLY${item.weekPattern ? ";INTERVAL=2" : ""};BYDAY=${dayCodes[dayIndex]};UNTIL=${untilUtc}`,
      `SUMMARY:${escapeText(item.name)}`,
      ...(item.location ? [`LOCATION:${escapeText(item.location)}`] : []),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  const foldLine = (line) => {
    const parts = [];
    let part = "";
    let byteLength = 0;
    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).length;
      if (byteLength + characterBytes > 75) {
        parts.push(part);
        part = " ";
        byteLength = 1;
      }
      part += character;
      byteLength += characterBytes;
    }
    parts.push(part);
    return parts.join("\r\n");
  };
  return {
    calendar: lines.map(foldLine).join("\r\n"),
    exportedCount: validClasses.length,
    skipped,
  };
}

export function createClassCalendarExport(classes) {
  return createClassCalendarExportWithReport(classes).calendar;
}

function parseClassTime(value, inheritedMeridiem = "") {
  const normalizedValue = value
    .replace(/[Oo]/g, "0")
    .replace(/^(\d{1,2})\.(\d{2})$/, "$1:$2");
  const match = normalizedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || inheritedMeridiem).replace(/\./g, "").toLowerCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimePair(startValue, startSuffix, endValue, endSuffix) {
  const startTime = parseClassTime(startValue, startSuffix || endSuffix || "");
  let endTime = parseClassTime(endValue, endSuffix || startSuffix || "");
  if (!startTime || !endTime) return null;

  if (endTime <= startTime && !endSuffix && startSuffix !== "pm") {
    const endHour = Number(endValue.match(/^\d{1,2}/)?.[0]);
    if (Number.isFinite(endHour) && endHour > 0 && endHour < 12) {
      endTime = parseClassTime(endValue, "pm");
    }
  }
  if (!endTime || endTime <= startTime) return null;
  return { startTime, endTime };
}

export function parseScheduleTextWithReport(text) {
  const lines = String(text || "").split(/\r?\n/);
  const totalLines = lines.filter((line) => line.trim()).length;
  const skipped = [];
  const classes = [];
  let importedLines = 0;
  const dayPattern = /\b(mon(?:day)?|tue(?:sday)?|tues(?:day)?|wed(?:nesday)?|thu(?:rsday)?|thurs(?:day)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
  const ocrTime = "\\d{1,2}(?:[:.][0-5Oo]\\d|[:.][Oo]{2})?";
  const rangePattern = new RegExp(
    `\\b(${ocrTime})(?:\\s*(a\\.?m\\.?|p\\.?m\\.?))?\\s*(?:-|–|—|to)\\s*(${ocrTime})(?:\\s*(a\\.?m\\.?|p\\.?m\\.?))?\\b`,
    "i",
  );
  const singleTimePattern = new RegExp(
    `\\b(${ocrTime})(?:\\s*(a\\.?m\\.?|p\\.?m\\.?))?\\b`,
    "i",
  );

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const dayMatches = [...line.matchAll(dayPattern)];
    const days = [...new Set(dayMatches.map((match) =>
      WEEKDAYS.find((day) => day.toLowerCase().startsWith(match[1].slice(0, 3).toLowerCase())),
    ).filter(Boolean))];
    if (!days.length) {
      skipped.push({ line: index + 1, text: line, reason: "No weekday was found." });
      return;
    }

    const rangeMatch = rangePattern.exec(line);
    let timePair;
    let timeMatch;
    if (rangeMatch) {
      timePair = parseTimePair(rangeMatch[1], rangeMatch[2] || "", rangeMatch[3], rangeMatch[4] || "");
      timeMatch = rangeMatch;
    } else {
      const singleMatch = singleTimePattern.exec(line);
      if (singleMatch) {
        const startTime = parseClassTime(singleMatch[1], singleMatch[2] || "");
        if (startTime) {
          const endMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + 60;
          if (endMinutes < 24 * 60) {
            timePair = {
              startTime,
              endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
            };
            timeMatch = singleMatch;
          }
        }
      }
    }
    if (!timePair) {
      skipped.push({ line: index + 1, text: line, reason: "No valid time or time range was found." });
      return;
    }

    const name = line
      .replace(timeMatch[0], " ")
      .replace(dayPattern, " ")
      .replace(/[|,;–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      skipped.push({ line: index + 1, text: line, reason: "No class name was found." });
      return;
    }
    days.forEach((day) => classes.push({
      id: createId(),
      name,
      day,
      ...timePair,
      location: "",
      reminderEnabled: true,
    }));
    importedLines += 1;
  });
  return { classes, importedLines, totalLines, skipped };
}

export function parseScheduleText(text) {
  return parseScheduleTextWithReport(text).classes;
}

export const normalizeQuizAnswer = (value) => value
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/(?<=\p{N}),(?=\p{N})/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const MAX_STREAK_ITERATIONS = 3660;

export function dailyStreak(days, allowance, endKey) {
  const cursor = dateFromKey(endKey);
  const skipsByMonth = {};
  let total = 0;
  let iterations = 0;
  while (iterations < MAX_STREAK_ITERATIONS) {
    iterations += 1;
    const key = dateKey(cursor);
    const day = days[key];
    if (day?.done) total += 1;
    else if (day?.paused) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    else {
      const month = key.slice(0, 7);
      const used = skipsByMonth[month] || 0;
      if (key !== endKey && used < Math.min(1, Math.max(0, Number(allowance) || 0))) skipsByMonth[month] = used + 1;
      else if (key !== endKey) break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return total;
}

function dayNameForDate(date) {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

export function getHabitScheduleDays(habit) {
  if (Array.isArray(habit.scheduleDays) && habit.scheduleDays.length) {
    return WEEKDAYS.filter((day) => habit.scheduleDays.includes(day));
  }
  return WEEKDAYS.slice(0, Math.max(1, Math.min(7, Number(habit.goal) || 7)));
}

export function isHabitPausedOnDate(habit, key) {
  return Boolean(
    habit.paused &&
    (!habit.pausedAt || key >= habit.pausedAt) &&
    (!habit.pauseUntil || key <= habit.pauseUntil),
  );
}

export function getMissedHabitDates(habit, startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  const days = habit.days || {};
  const scheduleDays = getHabitScheduleDays(habit);
  const goal = Math.max(1, Number(habit.goal) || 1);
  const missedDates = [];

  for (const date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
    const key = dateKey(date);
    if (days[key]?.done || days[key]?.paused || isHabitPausedOnDate(habit, key)) continue;

    if (!habit.flexibleWeekly) {
      if (scheduleDays.includes(dayNameForDate(date))) missedDates.push(key);
      continue;
    }

    const weekStart = dateFromKey(weekStartKey(date));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    let completed = 0;
    let remainingAvailable = 0;

    for (const weekDate = new Date(weekStart); weekDate < weekEnd; weekDate.setDate(weekDate.getDate() + 1)) {
      const weekKey = dateKey(weekDate);
      if (weekKey < (habit.startDate || startKey) || isHabitPausedOnDate(habit, weekKey) || days[weekKey]?.paused) continue;
      if (weekKey <= key && days[weekKey]?.done) completed += 1;
      if (weekKey > key) remainingAvailable += 1;
    }

    if (completed + remainingAvailable < goal) missedDates.push(key);
  }

  return missedDates;
}

export function fillPausedScheduleDays(habit, startKey, endKey) {
  const days = { ...(habit.days || {}) };
  const scheduledDays = getHabitScheduleDays(habit);
  const cursor = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  while (cursor < end) {
    const key = dateKey(cursor);
    if (scheduledDays.includes(dayNameForDate(cursor)) && !days[key]?.done) {
      days[key] = { ...days[key], done: false, paused: true, note: days[key]?.note || "" };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function resumeExpiredHabitPause(habit, currentKey = dateKey(new Date())) {
  const validDate = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key || "");
  if (!habit.paused || !validDate(habit.pauseUntil) || habit.pauseUntil >= currentKey) return habit;

  const pausedAt = validDate(habit.pausedAt) ? habit.pausedAt : habit.pauseUntil;
  const resumeDate = dateFromKey(habit.pauseUntil);
  resumeDate.setDate(resumeDate.getDate() + 1);
  return {
    ...habit,
    days: fillPausedScheduleDays(habit, pausedAt, dateKey(resumeDate)),
    paused: false,
  };
}

export function weeklyStreak(days, goal, endKey, skipIncompleteCurrentWeek = true, scheduleDays) {
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  const isScheduled = (key) => !scheduleDays || scheduleDays.includes(dayNameForDate(dateFromKey(key)));
  const countScheduled = (week) => {
    const weekEnd = new Date(week);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return Object.entries(days).filter(([key, value]) => {
      const date = dateFromKey(key);
      return isScheduled(key) && (value?.done || value?.paused) && date >= week && date < weekEnd;
    }).length;
  };
  const pausedScheduledWeek = (week) => {
    const weekEnd = new Date(week);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return Object.entries(days).some(([key, value]) => {
      const date = dateFromKey(key);
      return isScheduled(key) && value?.paused && date >= week && date < weekEnd;
    });
  };
  const cursor = dateFromKey(endKey);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  if (
    skipIncompleteCurrentWeek &&
    countScheduled(cursor) < goal &&
    !pausedScheduledWeek(cursor)
  ) {
    cursor.setDate(cursor.getDate() - 7);
  }
  let total = 0;
  let iterations = 0;
  while (iterations < MAX_STREAK_ITERATIONS) {
    iterations += 1;
    if (countScheduled(cursor) >= goal) total += 1;
    else if (!pausedScheduledWeek(cursor)) break;
    cursor.setDate(cursor.getDate() - 7);
  }
  return total;
}

export function currentStreak(habit, endKey) {
  let streakEndKey = endKey;
  if (habit.paused) {
    const pausedAt = dateFromKey(habit.pausedAt || endKey);
    pausedAt.setDate(pausedAt.getDate() - 1);
    streakEndKey = dateKey(pausedAt);
  }
  if (!Array.isArray(habit.scheduleDays) || !habit.scheduleDays.length) {
    return habit.goal === 7
      ? dailyStreak(habit.days, habit.allowance, streakEndKey)
      : weeklyStreak(habit.days, habit.goal, streakEndKey);
  }
  if (habit.flexibleWeekly) {
    return weeklyStreak(habit.days, Math.max(1, Number(habit.goal) || 1), streakEndKey);
  }
  const scheduleDays = getHabitScheduleDays(habit);
  if (scheduleDays.length === 7) return dailyStreak(habit.days, habit.allowance, streakEndKey);
  return weeklyStreak(habit.days, scheduleDays.length, streakEndKey, true, scheduleDays);
}

export function estimateOneRepMax(weight, reps) {
  const load = Number(weight);
  const repetitions = Number(reps);
  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(repetitions) || repetitions < 1) return 0;
  return repetitions === 1 ? load : load * (1 + repetitions / 30);
}

export function buildWarmupSets(targetWeight, barWeight = 20, increment = 2.5) {
  const target = Number(targetWeight);
  const bar = Number(barWeight);
  const step = Number(increment);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(bar) || bar < 0 ||
    !Number.isFinite(step) || step <= 0) return [];
  if (target <= bar) return [];
  if (target <= bar * 2) return [{ percent: Math.round(bar / target * 100), reps: 8, weight: bar }];
  return [
    { percent: 40, reps: 8 },
    { percent: 60, reps: 5 },
    { percent: 75, reps: 3 },
    { percent: 85, reps: 1 },
  ]
    .map(({ percent, reps }) => {
      const rawWeight = target * percent / 100;
      const weight = Math.max(bar, Math.round(rawWeight / step) * step);
      return { percent: Math.round(weight / target * 100), reps, weight };
    })
    .filter((set, index, sets) =>
      set.weight < target &&
      set.weight > 0 &&
      (index === 0 || set.weight > sets[index - 1].weight),
    );
}

export function bestStreak(habit) {
  const keys = Object.keys(habit.days)
    .filter((key) => habit.days[key]?.done || habit.days[key]?.paused)
    .sort();
  if (habit.goal < 7) {
    const weeks = new Map();
    keys.forEach((key) => {
      if (
        Array.isArray(habit.scheduleDays) &&
        !getHabitScheduleDays(habit).includes(dayNameForDate(dateFromKey(key)))
      ) {
        return;
      }
      const week = weekStartKey(dateFromKey(key));
      const status = weeks.get(week) || { completed: 0, paused: false };
      status.completed += 1;
      status.paused ||= Boolean(habit.days[key]?.paused);
      weeks.set(week, status);
    });
    let best = 0;
    let streak = 0;
    let previousWeek = "";
    weeks.forEach((status, week) => {
      if (previousWeek) {
        const nextWeek = dateFromKey(previousWeek);
        nextWeek.setDate(nextWeek.getDate() + 7);
        if (dateKey(nextWeek) !== week) streak = 0;
      }
      if (status.completed >= habit.goal) {
        streak += 1;
        best = Math.max(best, streak);
      } else if (!status.paused) {
        streak = 0;
      }
      previousWeek = week;
    });
    return best;
  }
  let best = 0;
  let streak = 0;
  let previousDay = "";
  keys.forEach((key) => {
    if (previousDay) {
      const nextDay = dateFromKey(previousDay);
      nextDay.setDate(nextDay.getDate() + 1);
      if (dateKey(nextDay) !== key) streak = 0;
    }
    if (habit.days[key]?.done) {
      streak += 1;
      best = Math.max(best, streak);
    }
    previousDay = key;
  });
  return best;
}

export function averageStreak(habit) {
  const keys = Object.keys(habit.days || {})
    .filter((key) => habit.days[key]?.done || habit.days[key]?.paused)
    .sort();
  if (!keys.length) return 0;

  const isWeekly = habit.flexibleWeekly || habit.goal < 7;
  const runs = [];
  let run = 0;

  if (isWeekly) {
    const firstWeek = dateFromKey(weekStartKey(dateFromKey(keys[0])));
    const lastWeek = dateFromKey(weekStartKey(dateFromKey(keys[keys.length - 1])));
    const scheduleDays = habit.flexibleWeekly ? null : getHabitScheduleDays(habit);
    for (const week = new Date(firstWeek); week <= lastWeek; week.setDate(week.getDate() + 7)) {
      const weekEnd = new Date(week);
      weekEnd.setDate(weekEnd.getDate() + 7);
      let completed = 0;
      let paused = false;
      for (const [key, value] of Object.entries(habit.days)) {
        const date = dateFromKey(key);
        if (date < week || date >= weekEnd) continue;
        if (scheduleDays && !scheduleDays.includes(dayNameForDate(date))) continue;
        if (value?.done) completed += 1;
        paused ||= Boolean(value?.paused);
      }
      if (completed >= Math.max(1, Number(habit.goal) || 1)) run += 1;
      else if (!paused && run) {
        runs.push(run);
        run = 0;
      }
    }
  } else {
    const cursor = dateFromKey(keys[0]);
    const end = dateFromKey(keys[keys.length - 1]);
    while (cursor <= end) {
      const key = dateKey(cursor);
      if (habit.days[key]?.done) run += 1;
      else if (!habit.days[key]?.paused && run) {
        runs.push(run);
        run = 0;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  if (run) runs.push(run);
  return runs.length ? runs.reduce((sum, length) => sum + length, 0) / runs.length : 0;
}

export function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const weekday = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
  }[values.weekday];
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday,
  };
}

export function isWithinQuietHours(time, quietStart, quietEnd) {
  if (!quietStart || !quietEnd || quietStart === quietEnd) return false;
  return quietStart < quietEnd
    ? time >= quietStart && time < quietEnd
    : time >= quietStart || time < quietEnd;
}
