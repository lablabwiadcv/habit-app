import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "./App.css";
import {
  averageStreak,
  bestStreak,
  buildWarmupSets,
  buildExamStudyPlan,
  classOccursOnDate,
  createId,
  createClassCalendarExportWithReport,
  currentStreak,
  dateFromKey,
  dateKey,
  deduplicateFlashcards,
  estimateOneRepMax,
  findDuplicateClassDays,
  fillPausedScheduleDays,
  getClassTimetableRange,
  getHabitScheduleDays,
  getMissedHabitDates,
  isHabitPausedOnDate,
  isValidBackup,
  isWithinQuietHours,
  layoutClassTimetable,
  normalizeQuizAnswer,
  parseFlashcardCsvWithReport,
  resumeExpiredHabitPause,
  scheduleSpacedReview,
  normalizeStudySets,
  suggestInterclassStudyGaps,
  WEEKDAYS,
  weekStartKey,
  zonedDateParts,
} from "./appUtils.js";
import PageHeading from "./components/PageHeading.jsx";
import MobileNav, { NavIcon } from "./components/MobileNav.jsx";
import Icon from "./components/Icon.jsx";
import StudySets from "./components/StudySets.jsx";
import AccountSyncDialog from "./components/AccountSyncDialog.jsx";
import { isFirebaseConfigured } from "./firebaseConfig.js";

const COLORS = [
  "#7c5cff",
  "#ff8b5e",
  "#38c995",
  "#f3bd4b",
  "#5a9cff",
  "#ef6b9a",
];

const THEME_PRESETS = [
  ["#9a5de8", "Violet"],
  ["#287d9b", "Ocean"],
  ["#26866b", "Forest"],
  ["#c66a37", "Terracotta"],
  ["#c34b72", "Rose"],
];
const DAILY_MOTIVATIONAL_QUOTES = [
  "Small steps still move you forward.",
  "Show up for the life you want to build.",
  "Progress grows where patience and effort meet.",
  "You can begin again, one choice at a time.",
  "A little consistency can change a lot.",
  "Make room for progress, not perfection.",
  "Keep going; your effort is adding up.",
  "Today is a good day to take one small step.",
  "You do not have to do it all—just begin.",
  "Steady effort is its own kind of strength.",
  "Celebrate how far your small steps have brought you.",
  "Your next kind choice can shape the day.",
  "Keep your promises to yourself gently.",
  "Let progress be simple and repeatable.",
];
const JOURNAL_TAGS = [
  "Work",
  "Study",
  "Health",
  "Family",
  "Gratitude",
  "Challenge",
];
const PROFILE_ICONS = [
  ["user", "User"],
  ["smile", "Smile"],
  ["star", "Star"],
  ["heart", "Heart"],
  ["leaf", "Leaf"],
  ["flower-2", "Flower"],
  ["cat", "Cat"],
  ["dog", "Dog"],
  ["rabbit", "Rabbit"],
  ["bird", "Bird"],
  ["fish", "Fish"],
  ["moon", "Moon"],
  ["sun", "Sun"],
  ["cloud", "Cloud"],
  ["mountain", "Mountain"],
  ["rocket", "Rocket"],
];
const HABIT_ICONS = [
  "dumbbell",
  "book-open",
  "droplet",
  "moon",
  "sun",
  "heart",
  "brain",
  "pencil",
  "coffee",
  "apple",
  "footprints",
  "bike",
  "music",
  "code",
  "target",
  "leaf",
  "flame",
  "clock",
  "sparkles",
  "star",
  "cloud",
  "flower-2",
  "rocket",
  "smile",
  "crown",
  "circle-dashed",
  "diamond",
];
const LEGACY_HABIT_ICONS = new Map([
  ["✦", "sparkles"],
  ["▰", "book-open"],
  ["◒", "circle-dashed"],
]);
const LEGACY_PROFILE_ICONS = new Map(
  [
    [0x2726, "star"],
    [0x1f319, "moon"],
    [0x1f337, "flower-2"],
    [0x1f98b, "flower-2"],
    [0x1f33f, "leaf"],
    [0x2601, "cloud"],
    [0x1f408, "cat"],
    [0x1f353, "leaf"],
    [0x1f9f8, "dog"],
    [0x1f33c, "flower-2"],
    [0x2600, "sun"],
    [0x2b50, "star"],
    [0x1f308, "star"],
    [0x1fabb, "flower-2"],
    [0x1f33b, "flower-2"],
    [0x1f344, "leaf"],
    [0x1f430, "rabbit"],
    [0x1f43b, "dog"],
    [0x1f43c, "dog"],
    [0x1f98a, "dog"],
    [0x1f438, "fish"],
    [0x1f41d, "bird"],
    [0x1f41e, "bird"],
    [0x1f422, "fish"],
    [0x1f42c, "fish"],
    [0x1fabc, "fish"],
    [0x1fa90, "moon"],
    [0x1f338, "flower-2"],
    [0x1f352, "leaf"],
    [0x1f351, "leaf"],
    [0x1f34b, "leaf"],
    [0x1f349, "leaf"],
    [0x1f9c1, "star"],
    [0x1f375, "smile"],
    [0x1f380, "heart"],
    [0x1f48e, "star"],
    [0x1f56f, "sun"],
    [0x1f3a7, "smile"],
    [0x1f3a8, "star"],
  ].map(([codePoint, icon]) => [String.fromCodePoint(codePoint), icon]),
);
const MOOD_VALUES = [
  "\u{1F614}",
  "\u{1F610}",
  "\u{1F642}",
  "\u{1F60A}",
  "\u{1F929}",
];
const MOOD_ICONS = ["Frown", "Meh", "Smile", "SmilePlus", "Laugh"];
const MOOD_LABELS = ["Very low", "Low", "Okay", "Good", "Great"];
const normalizeHabitIcon = (value) =>
  HABIT_ICONS.includes(value)
    ? value
    : LEGACY_HABIT_ICONS.get(value) || "dumbbell";
const normalizeProfileIcon = (value) => {
  const icon = String(value || "").replaceAll("\uFE0F", "");
  if (PROFILE_ICONS.some(([name]) => name === icon)) return icon;
  return LEGACY_PROFILE_ICONS.get(icon) || "user";
};
const DEVICE_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const TIME_ZONE_OPTIONS = [
  ...new Set([
    DEVICE_TIME_ZONE,
    "UTC",
    ...(typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [
          "UTC",
          "America/Los_Angeles",
          "America/New_York",
          "Europe/London",
          "Asia/Manila",
          "Asia/Tokyo",
        ]),
  ]),
];
const ROUTINE_EXERCISES = {
  "Upper / Lower": {
    Upper: ["Bench press", "Pull-up", "Overhead press"],
    Lower: ["Squat", "Deadlift"],
  },
  "Push / Pull / Legs": {
    Push: ["Bench press", "Overhead press"],
    Pull: ["Pull-up", "Deadlift"],
    Legs: ["Squat"],
  },
  "Full body": {
    Full: ["Squat", "Bench press", "Deadlift"],
  },
};
const WORKOUT_PLAN_DAYS = [
  ...new Set([
    ...WEEKDAYS,
    ...Object.values(ROUTINE_EXERCISES).flatMap((split) => Object.keys(split)),
  ]),
];
const EXERCISE_CATALOG = [
  { name: "Bench press", muscle: "Chest", equipment: "Barbell" },
  { name: "Barbell bench press", muscle: "Chest", equipment: "Barbell" },
  { name: "Incline barbell press", muscle: "Chest", equipment: "Barbell" },
  { name: "Dumbbell bench press", muscle: "Chest", equipment: "Dumbbell" },
  { name: "Incline dumbbell press", muscle: "Chest", equipment: "Dumbbell" },
  { name: "Cable chest fly", muscle: "Chest", equipment: "Cable" },
  { name: "Pec deck fly", muscle: "Chest", equipment: "Machine" },
  { name: "Push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Chest dip", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Decline barbell press", muscle: "Chest", equipment: "Barbell" },
  { name: "Decline dumbbell press", muscle: "Chest", equipment: "Dumbbell" },
  { name: "Dumbbell pullover", muscle: "Chest", equipment: "Dumbbell" },
  { name: "Single-arm cable fly", muscle: "Chest", equipment: "Cable" },
  { name: "Low-to-high cable fly", muscle: "Chest", equipment: "Cable" },
  {
    name: "Smith machine bench press",
    muscle: "Chest",
    equipment: "Smith machine",
  },
  { name: "Incline push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Plyometric push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Deadlift", muscle: "Back", equipment: "Barbell" },
  { name: "Bent-over row", muscle: "Back", equipment: "Barbell" },
  { name: "One-arm dumbbell row", muscle: "Back", equipment: "Dumbbell" },
  { name: "Lat pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Pull-up", muscle: "Back", equipment: "Bodyweight" },
  { name: "Assisted pull-up", muscle: "Back", equipment: "Machine" },
  { name: "Seated cable row", muscle: "Back", equipment: "Cable" },
  { name: "Chest-supported row", muscle: "Back", equipment: "Machine" },
  { name: "Straight-arm pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Back extension", muscle: "Back", equipment: "Bodyweight" },
  { name: "Pendlay row", muscle: "Back", equipment: "Barbell" },
  { name: "T-bar row", muscle: "Back", equipment: "Machine" },
  { name: "Wide-grip lat pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Close-grip lat pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Inverted row", muscle: "Back", equipment: "Bodyweight" },
  { name: "Single-arm cable row", muscle: "Back", equipment: "Cable" },
  { name: "Rack pull", muscle: "Back", equipment: "Barbell" },
  { name: "Shrug", muscle: "Traps", equipment: "Dumbbell" },
  { name: "Barbell shrug", muscle: "Traps", equipment: "Barbell" },
  { name: "Cable shrug", muscle: "Traps", equipment: "Cable" },
  { name: "Overhead press", muscle: "Shoulders", equipment: "Barbell" },
  { name: "Seated dumbbell press", muscle: "Shoulders", equipment: "Dumbbell" },
  {
    name: "Dumbbell lateral raise",
    muscle: "Shoulders",
    equipment: "Dumbbell",
  },
  { name: "Cable lateral raise", muscle: "Shoulders", equipment: "Cable" },
  { name: "Reverse pec deck", muscle: "Shoulders", equipment: "Machine" },
  { name: "Face pull", muscle: "Shoulders", equipment: "Cable" },
  { name: "Arnold press", muscle: "Shoulders", equipment: "Dumbbell" },
  { name: "Front raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { name: "Plate front raise", muscle: "Shoulders", equipment: "Other" },
  { name: "Machine shoulder press", muscle: "Shoulders", equipment: "Machine" },
  { name: "Cable rear-delt fly", muscle: "Shoulders", equipment: "Cable" },
  { name: "Barbell curl", muscle: "Biceps", equipment: "Barbell" },
  { name: "Incline dumbbell curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Hammer curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Cable curl", muscle: "Biceps", equipment: "Cable" },
  { name: "EZ-bar curl", muscle: "Biceps", equipment: "EZ bar" },
  { name: "Preacher curl", muscle: "Biceps", equipment: "Machine" },
  { name: "Concentration curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Cable hammer curl", muscle: "Biceps", equipment: "Cable" },
  { name: "Spider curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Rope triceps pushdown", muscle: "Triceps", equipment: "Cable" },
  { name: "Overhead cable extension", muscle: "Triceps", equipment: "Cable" },
  { name: "Skull crusher", muscle: "Triceps", equipment: "Barbell" },
  { name: "Close-grip bench press", muscle: "Triceps", equipment: "Barbell" },
  {
    name: "Dumbbell overhead triceps extension",
    muscle: "Triceps",
    equipment: "Dumbbell",
  },
  { name: "Bench dip", muscle: "Triceps", equipment: "Bodyweight" },
  { name: "Single-arm cable pushdown", muscle: "Triceps", equipment: "Cable" },
  { name: "EZ-bar skull crusher", muscle: "Triceps", equipment: "EZ bar" },
  { name: "Squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Barbell squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Front squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Leg press", muscle: "Legs", equipment: "Machine" },
  { name: "Leg extension", muscle: "Legs", equipment: "Machine" },
  { name: "Seated leg curl", muscle: "Legs", equipment: "Machine" },
  { name: "Romanian deadlift", muscle: "Legs", equipment: "Barbell" },
  { name: "Dumbbell walking lunge", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Bulgarian split squat", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Standing calf raise", muscle: "Legs", equipment: "Machine" },
  { name: "Goblet squat", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Hack squat", muscle: "Legs", equipment: "Machine" },
  { name: "Smith machine squat", muscle: "Legs", equipment: "Smith machine" },
  { name: "Dumbbell Romanian deadlift", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Lying leg curl", muscle: "Legs", equipment: "Machine" },
  { name: "Leg extension single-leg", muscle: "Legs", equipment: "Machine" },
  { name: "Step-up", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Seated calf raise", muscle: "Calves", equipment: "Machine" },
  { name: "Donkey calf raise", muscle: "Calves", equipment: "Machine" },
  { name: "Single-leg calf raise", muscle: "Calves", equipment: "Bodyweight" },
  { name: "Tibialis raise", muscle: "Calves", equipment: "Bodyweight" },
  { name: "Barbell hip thrust", muscle: "Glutes", equipment: "Barbell" },
  { name: "Cable glute kickback", muscle: "Glutes", equipment: "Cable" },
  { name: "Glute bridge", muscle: "Glutes", equipment: "Bodyweight" },
  { name: "Hip abduction", muscle: "Glutes", equipment: "Machine" },
  { name: "Dumbbell glute bridge", muscle: "Glutes", equipment: "Dumbbell" },
  { name: "Cable pull-through", muscle: "Glutes", equipment: "Cable" },
  { name: "Single-leg hip thrust", muscle: "Glutes", equipment: "Bodyweight" },
  { name: "Hip adduction", muscle: "Adductors", equipment: "Machine" },
  { name: "Copenhagen plank", muscle: "Adductors", equipment: "Bodyweight" },
  { name: "Plank", muscle: "Core", equipment: "Bodyweight" },
  { name: "Hanging knee raise", muscle: "Core", equipment: "Bodyweight" },
  { name: "Cable crunch", muscle: "Core", equipment: "Cable" },
  { name: "Ab wheel rollout", muscle: "Core", equipment: "Other" },
  { name: "Russian twist", muscle: "Core", equipment: "Bodyweight" },
  { name: "Dead bug", muscle: "Core", equipment: "Bodyweight" },
  { name: "Bird dog", muscle: "Core", equipment: "Bodyweight" },
  { name: "Hollow body hold", muscle: "Core", equipment: "Bodyweight" },
  { name: "Pallof press", muscle: "Core", equipment: "Cable" },
  { name: "Side plank", muscle: "Core", equipment: "Bodyweight" },
  { name: "Wrist curl", muscle: "Forearms", equipment: "Dumbbell" },
  { name: "Reverse wrist curl", muscle: "Forearms", equipment: "Dumbbell" },
  { name: "Reverse curl", muscle: "Forearms", equipment: "EZ bar" },
  { name: "Wrist roller", muscle: "Forearms", equipment: "Other" },
  { name: "Plate pinch", muscle: "Forearms", equipment: "Other" },
  { name: "Kettlebell swing", muscle: "Full body", equipment: "Kettlebell" },
  { name: "Kettlebell goblet squat", muscle: "Legs", equipment: "Kettlebell" },
  {
    name: "Kettlebell clean and press",
    muscle: "Full body",
    equipment: "Kettlebell",
  },
  { name: "Farmer carry", muscle: "Full body", equipment: "Dumbbell" },
  {
    name: "Resistance-band pull-apart",
    muscle: "Shoulders",
    equipment: "Resistance band",
  },
  { name: "Resistance-band row", muscle: "Back", equipment: "Resistance band" },
  { name: "Burpee", muscle: "Full body", equipment: "Bodyweight" },
  { name: "Sled push", muscle: "Full body", equipment: "Other" },
  { name: "Sled drag", muscle: "Full body", equipment: "Other" },
  { name: "Battle rope", muscle: "Full body", equipment: "Other" },
  {
    name: "Medicine ball slam",
    muscle: "Full body",
    equipment: "Medicine ball",
  },
  { name: "Box jump", muscle: "Legs", equipment: "Bodyweight" },
  { name: "Jump rope", muscle: "Cardio", equipment: "Other" },
  { name: "Treadmill run", muscle: "Cardio", equipment: "Treadmill" },
  { name: "Incline treadmill walk", muscle: "Cardio", equipment: "Treadmill" },
  { name: "Stationary bike", muscle: "Cardio", equipment: "Bike" },
  { name: "Elliptical", muscle: "Cardio", equipment: "Machine" },
  { name: "Rowing machine", muscle: "Cardio", equipment: "Rowing machine" },
  { name: "Stair climber", muscle: "Cardio", equipment: "Machine" },
  {
    name: "Single-arm dumbbell bench press",
    muscle: "Chest",
    equipment: "Dumbbell",
  },
  { name: "Close-grip push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Wide-grip push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Archer push-up", muscle: "Chest", equipment: "Bodyweight" },
  { name: "Ring push-up", muscle: "Chest", equipment: "Gymnastic rings" },
  { name: "Landmine chest press", muscle: "Chest", equipment: "Landmine" },
  { name: "Single-arm landmine press", muscle: "Chest", equipment: "Landmine" },
  { name: "Cable crossover", muscle: "Chest", equipment: "Cable" },
  { name: "Machine chest press", muscle: "Chest", equipment: "Machine" },
  { name: "Floor press", muscle: "Chest", equipment: "Barbell" },
  { name: "Dumbbell floor press", muscle: "Chest", equipment: "Dumbbell" },
  { name: "Barbell pullover", muscle: "Chest", equipment: "Barbell" },
  { name: "Deficit push-up", muscle: "Chest", equipment: "Bodyweight" },
  {
    name: "Neutral-grip dumbbell press",
    muscle: "Chest",
    equipment: "Dumbbell",
  },
  { name: "Meadows row", muscle: "Back", equipment: "Landmine" },
  { name: "Seal row", muscle: "Back", equipment: "Barbell" },
  { name: "Smith machine row", muscle: "Back", equipment: "Smith machine" },
  { name: "Machine high row", muscle: "Back", equipment: "Machine" },
  { name: "Machine low row", muscle: "Back", equipment: "Machine" },
  { name: "Wide-grip seated row", muscle: "Back", equipment: "Cable" },
  { name: "Neutral-grip pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Single-arm lat pulldown", muscle: "Back", equipment: "Cable" },
  { name: "Chin-up", muscle: "Back", equipment: "Bodyweight" },
  { name: "Neutral-grip pull-up", muscle: "Back", equipment: "Bodyweight" },
  { name: "Weighted pull-up", muscle: "Back", equipment: "Other" },
  { name: "Weighted chin-up", muscle: "Back", equipment: "Other" },
  {
    name: "Band-assisted pull-up",
    muscle: "Back",
    equipment: "Resistance band",
  },
  { name: "Good morning", muscle: "Legs", equipment: "Barbell" },
  { name: "Superman hold", muscle: "Back", equipment: "Bodyweight" },
  { name: "Dumbbell shrug", muscle: "Traps", equipment: "Dumbbell" },
  { name: "Trap-bar shrug", muscle: "Traps", equipment: "Trap bar" },
  { name: "Upright row", muscle: "Shoulders", equipment: "Barbell" },
  { name: "Cable upright row", muscle: "Shoulders", equipment: "Cable" },
  {
    name: "Lean-away lateral raise",
    muscle: "Shoulders",
    equipment: "Dumbbell",
  },
  { name: "Machine lateral raise", muscle: "Shoulders", equipment: "Machine" },
  {
    name: "Dumbbell rear-delt fly",
    muscle: "Shoulders",
    equipment: "Dumbbell",
  },
  { name: "Bent-over reverse fly", muscle: "Shoulders", equipment: "Dumbbell" },
  {
    name: "Landmine shoulder press",
    muscle: "Shoulders",
    equipment: "Landmine",
  },
  { name: "Z press", muscle: "Shoulders", equipment: "Barbell" },
  { name: "Barbell preacher curl", muscle: "Biceps", equipment: "Barbell" },
  { name: "EZ-bar preacher curl", muscle: "Biceps", equipment: "EZ bar" },
  { name: "Dumbbell preacher curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Bayesian cable curl", muscle: "Biceps", equipment: "Cable" },
  { name: "Reverse-grip barbell curl", muscle: "Biceps", equipment: "Barbell" },
  { name: "Zottman curl", muscle: "Biceps", equipment: "Dumbbell" },
  { name: "Cross-body hammer curl", muscle: "Biceps", equipment: "Dumbbell" },
  {
    name: "Alternating dumbbell curl",
    muscle: "Biceps",
    equipment: "Dumbbell",
  },
  { name: "Machine biceps curl", muscle: "Biceps", equipment: "Machine" },
  { name: "Triceps kickback", muscle: "Triceps", equipment: "Dumbbell" },
  { name: "Cable triceps kickback", muscle: "Triceps", equipment: "Cable" },
  {
    name: "Rope overhead triceps extension",
    muscle: "Triceps",
    equipment: "Cable",
  },
  {
    name: "Straight-bar triceps pushdown",
    muscle: "Triceps",
    equipment: "Cable",
  },
  { name: "V-bar triceps pushdown", muscle: "Triceps", equipment: "Cable" },
  {
    name: "Machine triceps extension",
    muscle: "Triceps",
    equipment: "Machine",
  },
  { name: "Diamond push-up", muscle: "Triceps", equipment: "Bodyweight" },
  { name: "Ring dip", muscle: "Triceps", equipment: "Gymnastic rings" },
  { name: "Weighted dip", muscle: "Triceps", equipment: "Other" },
  { name: "Trap-bar deadlift", muscle: "Legs", equipment: "Trap bar" },
  { name: "Sumo deadlift", muscle: "Legs", equipment: "Barbell" },
  { name: "Deficit deadlift", muscle: "Legs", equipment: "Barbell" },
  { name: "Pause squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Safety-bar squat", muscle: "Legs", equipment: "Safety squat bar" },
  { name: "Zercher squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Box squat", muscle: "Legs", equipment: "Barbell" },
  { name: "Sissy squat", muscle: "Legs", equipment: "Bodyweight" },
  { name: "Pendulum squat", muscle: "Legs", equipment: "Machine" },
  { name: "Single-leg press", muscle: "Legs", equipment: "Machine" },
  { name: "Reverse lunge", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Forward lunge", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Barbell walking lunge", muscle: "Legs", equipment: "Barbell" },
  { name: "Reverse barbell lunge", muscle: "Legs", equipment: "Barbell" },
  { name: "Lateral lunge", muscle: "Legs", equipment: "Dumbbell" },
  { name: "Curtsy lunge", muscle: "Legs", equipment: "Dumbbell" },
  {
    name: "Single-leg Romanian deadlift",
    muscle: "Legs",
    equipment: "Dumbbell",
  },
  { name: "Nordic hamstring curl", muscle: "Legs", equipment: "Bodyweight" },
  { name: "Glute-ham raise", muscle: "Legs", equipment: "Machine" },
  { name: "Band leg curl", muscle: "Legs", equipment: "Resistance band" },
  { name: "Cable leg curl", muscle: "Legs", equipment: "Cable" },
  { name: "Standing leg curl", muscle: "Legs", equipment: "Machine" },
  { name: "Adductor machine", muscle: "Adductors", equipment: "Machine" },
  {
    name: "Barbell front-foot elevated split squat",
    muscle: "Legs",
    equipment: "Barbell",
  },
  { name: "Reverse step-down", muscle: "Legs", equipment: "Bodyweight" },
  { name: "Single-leg extension", muscle: "Legs", equipment: "Machine" },
  {
    name: "Standing single-leg calf raise",
    muscle: "Calves",
    equipment: "Dumbbell",
  },
  { name: "Leg press calf raise", muscle: "Calves", equipment: "Machine" },
  { name: "Donkey calf raise machine", muscle: "Calves", equipment: "Machine" },
  {
    name: "Banded glute kickback",
    muscle: "Glutes",
    equipment: "Resistance band",
  },
  {
    name: "Smith machine hip thrust",
    muscle: "Glutes",
    equipment: "Smith machine",
  },
  { name: "Cable hip abduction", muscle: "Glutes", equipment: "Cable" },
  { name: "Frog pump", muscle: "Glutes", equipment: "Bodyweight" },
  { name: "Clamshell", muscle: "Glutes", equipment: "Resistance band" },
  { name: "Monster walk", muscle: "Glutes", equipment: "Resistance band" },
  {
    name: "Banded lateral walk",
    muscle: "Glutes",
    equipment: "Resistance band",
  },
  { name: "Reverse crunch", muscle: "Core", equipment: "Bodyweight" },
  { name: "Hanging leg raise", muscle: "Core", equipment: "Bodyweight" },
  { name: "Toes-to-bar", muscle: "Core", equipment: "Bodyweight" },
  { name: "Decline sit-up", muscle: "Core", equipment: "Bench" },
  { name: "Weighted sit-up", muscle: "Core", equipment: "Other" },
  { name: "Bicycle crunch", muscle: "Core", equipment: "Bodyweight" },
  { name: "Mountain climber", muscle: "Core", equipment: "Bodyweight" },
  { name: "Cable wood chop", muscle: "Core", equipment: "Cable" },
  { name: "Landmine rotation", muscle: "Core", equipment: "Landmine" },
  { name: "Weighted plank", muscle: "Core", equipment: "Other" },
  { name: "Suitcase carry", muscle: "Core", equipment: "Dumbbell" },
  { name: "Barbell wrist curl", muscle: "Forearms", equipment: "Barbell" },
  {
    name: "Behind-the-back wrist curl",
    muscle: "Forearms",
    equipment: "Barbell",
  },
  { name: "Farmer hold", muscle: "Forearms", equipment: "Dumbbell" },
  { name: "Dead hang", muscle: "Forearms", equipment: "Bodyweight" },
  { name: "Pinch-grip hold", muscle: "Forearms", equipment: "Other" },
  { name: "Kettlebell deadlift", muscle: "Legs", equipment: "Kettlebell" },
  {
    name: "Kettlebell single-arm row",
    muscle: "Back",
    equipment: "Kettlebell",
  },
  {
    name: "Kettlebell Turkish get-up",
    muscle: "Full body",
    equipment: "Kettlebell",
  },
  { name: "Kettlebell snatch", muscle: "Full body", equipment: "Kettlebell" },
  { name: "Kettlebell clean", muscle: "Full body", equipment: "Kettlebell" },
  { name: "Dumbbell snatch", muscle: "Full body", equipment: "Dumbbell" },
  {
    name: "Dumbbell clean and press",
    muscle: "Full body",
    equipment: "Dumbbell",
  },
  { name: "Thruster", muscle: "Full body", equipment: "Barbell" },
  { name: "Dumbbell thruster", muscle: "Full body", equipment: "Dumbbell" },
  { name: "Wall ball", muscle: "Full body", equipment: "Medicine ball" },
  { name: "Bear crawl", muscle: "Full body", equipment: "Bodyweight" },
  { name: "Inchworm", muscle: "Full body", equipment: "Bodyweight" },
  { name: "Assault bike", muscle: "Cardio", equipment: "Bike" },
  { name: "Air bike", muscle: "Cardio", equipment: "Bike" },
  { name: "Recumbent bike", muscle: "Cardio", equipment: "Bike" },
  { name: "Spin bike", muscle: "Cardio", equipment: "Bike" },
  { name: "Outdoor cycling", muscle: "Cardio", equipment: "Bike" },
  { name: "Outdoor run", muscle: "Cardio", equipment: "Other" },
  { name: "Walking", muscle: "Cardio", equipment: "Other" },
  { name: "Hill sprint", muscle: "Cardio", equipment: "Bodyweight" },
  {
    name: "Treadmill sprint intervals",
    muscle: "Cardio",
    equipment: "Treadmill",
  },
  { name: "Ski erg", muscle: "Cardio", equipment: "Machine" },
  { name: "Arc trainer", muscle: "Cardio", equipment: "Machine" },
  { name: "Swimming", muscle: "Cardio", equipment: "Other" },
  { name: "Shadow boxing", muscle: "Cardio", equipment: "Bodyweight" },
  { name: "Boxing bag rounds", muscle: "Cardio", equipment: "Other" },
  { name: "Step mill", muscle: "Cardio", equipment: "Machine" },
  { name: "Dynamic warm-up", muscle: "Mobility", equipment: "Bodyweight" },
  {
    name: "World's greatest stretch",
    muscle: "Mobility",
    equipment: "Bodyweight",
  },
  { name: "Cat-cow", muscle: "Mobility", equipment: "Bodyweight" },
  { name: "Thoracic rotation", muscle: "Mobility", equipment: "Bodyweight" },
  {
    name: "Shoulder dislocates",
    muscle: "Mobility",
    equipment: "Resistance band",
  },
  { name: "Hip flexor stretch", muscle: "Mobility", equipment: "Bodyweight" },
  { name: "90/90 hip switches", muscle: "Mobility", equipment: "Bodyweight" },
  { name: "Ankle rocks", muscle: "Mobility", equipment: "Bodyweight" },
  { name: "Hamstring stretch", muscle: "Mobility", equipment: "Bodyweight" },
  { name: "Foam rolling", muscle: "Mobility", equipment: "Foam roller" },
];
const EXERCISE_MUSCLE_FILTERS = [
  "All muscle groups",
  ...new Set(EXERCISE_CATALOG.map((item) => item.muscle)),
  "Custom",
];
const EXERCISE_EQUIPMENT_FILTERS = [
  "All equipment",
  ...new Set(EXERCISE_CATALOG.map((item) => item.equipment)),
];
const VALID_SECTIONS = new Set([
  "today",
  "habits",
  "add-habit",
  "calendar",
  "study",
  "flashcards",
  "flashcard-library",
  "class-schedule",
  "add-class",
  "workout",
  "learning",
  "journal",
  "insights",
]);
const DESKTOP_NAV_GROUPS = [
  [["today", "home", "Today"]],
  [
    ["habits", "check", "Habits"],
    ["calendar", "calendar", "Calendar"],
  ],
  [
    ["study", "clock", "Study"],
    ["flashcards", "cards", "Flashcards"],
    ["class-schedule", "calendar", "Classes"],
  ],
  [
    ["workout", "activity", "Workout"],
    ["learning", "book", "Learning"],
    ["journal", "note", "Journal"],
  ],
  [["insights", "chart", "Insights"]],
];
const todayKey = () => dateKey(new Date());
const shuffled = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};
let studyAiWorker;
let studyAiRequestId = 0;
const studyAiRequests = new Map();
const STUDY_AI_TIMEOUT_MS = 5 * 60_000;

function resetStudyAiRequestTimeout(request) {
  window.clearTimeout(request.timeoutId);
  request.timeoutId = window.setTimeout(() => {
    const error = new Error(
      "On-device AI took too long. Check your connection and try again.",
    );
    studyAiWorker?.terminate();
    studyAiWorker = null;
    for (const pendingRequest of studyAiRequests.values()) {
      window.clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(error);
    }
    studyAiRequests.clear();
  }, STUDY_AI_TIMEOUT_MS);
}

function cancelStudyCardGeneration() {
  studyAiWorker?.terminate();
  studyAiWorker = null;
  for (const request of studyAiRequests.values()) {
    window.clearTimeout(request.timeoutId);
    request.reject(new Error("On-device AI generation was cancelled."));
  }
  studyAiRequests.clear();
}

function generateStudyCardsOnDevice(text, count, onProgress) {
  return new Promise((resolve, reject) => {
    let id;
    try {
      if (!studyAiWorker) {
        studyAiWorker = new Worker(
          new URL("./studyAi.worker.js", import.meta.url),
          {
            type: "module",
          },
        );
        studyAiWorker.onmessage = ({ data }) => {
          const request = studyAiRequests.get(data.id);
          if (!request) return;
          if (data.type === "progress" || data.type === "warning") {
            resetStudyAiRequestTimeout(request);
            request.onProgress(data.message);
          } else {
            window.clearTimeout(request.timeoutId);
            studyAiRequests.delete(data.id);
            if (data.type === "complete") {
              request.resolve({ cards: data.cards, truncated: data.truncated });
            } else {
              request.reject(new Error(data.message));
            }
          }
        };
        studyAiWorker.onerror = () => {
          const error = new Error(
            window.isSecureContext
              ? "The on-device AI worker stopped unexpectedly."
              : "The AI worker stopped on this HTTP connection. On a phone using a local-network address, try an HTTPS address.",
          );
          for (const request of studyAiRequests.values()) {
            window.clearTimeout(request.timeoutId);
            request.reject(error);
          }
          studyAiRequests.clear();
          studyAiWorker.terminate();
          studyAiWorker = null;
        };
      }

      id = ++studyAiRequestId;
      const request = { resolve, reject, onProgress, timeoutId: 0 };
      studyAiRequests.set(id, request);
      resetStudyAiRequestTimeout(request);
      studyAiWorker.postMessage({ id, text, count });
    } catch (error) {
      if (id !== undefined) {
        const request = studyAiRequests.get(id);
        window.clearTimeout(request?.timeoutId);
        studyAiRequests.delete(id);
      }
      reject(
        error instanceof Error
          ? error
          : new Error("Could not start the on-device AI."),
      );
    }
  });
}

async function extractStudyText(file) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Please choose a file smaller than 10 MB.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!pdfjs.GlobalWorkerOptions || typeof pdfWorkerUrl !== "string") {
        throw new Error("PDF worker is unavailable");
      }
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loadingTask = pdfjs.getDocument({
        data: await file.arrayBuffer(),
      });
      try {
        const pdf = await loadingTask.promise;
        const pageCount = Math.min(pdf.numPages, 40);
        const pages = await Promise.all(
          Array.from({ length: pageCount }, async (_, index) => {
            const page = await pdf.getPage(index + 1);
            const content = await page.getTextContent();
            return content.items
              .filter((item) => "str" in item)
              .map((item) => item.str)
              .join(" ");
          }),
        );
        return pages.join("\n");
      } finally {
        await loadingTask.destroy();
      }
    } catch {
      throw new Error("PDF import is not supported in this browser");
    }
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return result.value;
  }
  if (["txt", "md", "markdown", "csv"].includes(extension || "")) {
    return file.text();
  }
  throw new Error(
    "Choose a PDF, Word document (.docx), TXT, Markdown, or CSV file.",
  );
}

const formatDate = (date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const initialState = {
  habits: [
    {
      id: 1,
      name: "Move your body",
      icon: "dumbbell",
      goal: 7,
      scheduleDays: [...WEEKDAYS],
      color: COLORS[0],
      allowance: 1,
      note: "",
      reminderEnabled: false,
      reminderTime: "09:00",
      startDate: todayKey(),
      days: {},
    },
    {
      id: 2,
      name: "Read 20 minutes",
      icon: "book-open",
      goal: 7,
      scheduleDays: [...WEEKDAYS],
      color: COLORS[1],
      allowance: 1,
      note: "",
      reminderEnabled: false,
      reminderTime: "09:00",
      startDate: todayKey(),
      days: {},
    },
    {
      id: 3,
      name: "Deep work",
      icon: "brain",
      goal: 4,
      scheduleDays: WEEKDAYS.slice(0, 4),
      color: COLORS[2],
      allowance: 1,
      note: "",
      reminderEnabled: false,
      reminderTime: "09:00",
      startDate: todayKey(),
      days: {},
    },
  ],
  tasks: [],
  settings: {
    dashboard: { progress: true, tasks: true, wellness: true, focus: true },
    dashboardOrder: ["progress", "tasks", "wellness", "focus"],
    askMissedReasons: true,
    celebrations: true,
    todayPriorities: [],
    weeklyReviewDismissed: "",
    weeklyReviewNote: "",
    weeklyReviewPlans: {},
    journalPin: null,
    quarterlyGoal: {
      title: "",
      weeklyHabit: "",
      targetWeeks: 12,
      completedWeeks: [],
      quarterId: `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`,
    },
    accent: "#9a5de8",
    highContrast: false,
    largeText: false,
    reduceMotion: false,
  },
  profile: { name: "Alex Morgan", icon: "user" },
  journal: {},
  study: {
    subject: "Computer Science",
    selectedSubject: "Computer Science",
    subjects: [
      { name: "Computer Science", goal: 8, color: "#7c5cff", units: 3 },
    ],
    goal: 8,
    actual: 3.5,
    sessions: 7,
    exam: "",
    timer: 25 * 60,
    workMinutes: 25,
    breakMinutes: 5,
    week: weekStartKey(),
    history: [],
    timerEnd: null,
    timerStartedAt: null,
    timerMode: "focus",
    flashcards: [],
    decks: [],
    sets: [],
    studyToolPrefs: {
      flashcardSessionSize: 10,
      quizType: "multiple-choice",
      quizQuestionCount: 10,
      shuffleQuestions: true,
    },
    classes: [],
    schedule: [],
    sessionNote: "",
  },
  workout: {
    split: "Upper / Lower",
    weight: "",
    height: "",
    measurements: "",
    measurementHistory: [],
    lifts: [],
    exercises: [],
    library: ["Squat", "Bench press", "Deadlift", "Overhead press", "Pull-up"],
    templates: ["Upper / Lower", "Push / Pull / Legs", "Full body"],
    currentSession: null,
    recovery: { soreness: 0, energy: 3, sleep: "" },
    restSeconds: 90,
    weightUnit: "kg",
    platePresets: [
      { name: "Standard gym", barWeight: 20, plateIncrement: 2.5 },
      { name: "Home gym", barWeight: 15, plateIncrement: 1.25 },
    ],
    activePlatePreset: "Standard gym",
    history: [],
    records: [],
    dayPlans: Object.fromEntries(WORKOUT_PLAN_DAYS.map((day) => [day, []])),
    daySplits: Object.fromEntries(WEEKDAYS.map((day) => [day, null])),
    routineTemplates: [],
    waist: "",
  },
  learning: [
    {
      id: 1,
      title: "Learn Python",
      category: "Coding",
      type: "Skill",
      targetHours: 10,
      deadline: "",
      steps: [
        { id: "python-variables", title: "Variables", done: true },
        { id: "python-functions", title: "Functions", done: false },
        { id: "python-projects", title: "Projects", done: false },
      ],
      resources: [],
      logs: [],
      focusMinutes: 0,
      readingList: [],
      badges: [],
      reviewDates: [],
    },
  ],
  wellness: {
    sleep: "",
    sleepGoal: 8,
    bedtime: "",
    wakeTime: "",
    water: 0,
    waterGoal: 8,
    meditation: 0,
    meditationGoal: 10,
    selfCareActions: [
      { id: "fresh-air", title: "Step outside for a little fresh air" },
      { id: "stretch", title: "Take a gentle stretch break" },
      { id: "prepare", title: "Make one thing easier for tomorrow" },
    ],
    history: {},
    bedtimeReminderEnabled: false,
    bedtimeReminder: "22:00",
    waterReminderEnabled: false,
    waterReminderTime: "14:00",
    breathingPattern: "calm",
  },
  xp: 240,
  xpHistory: [],
};

function normalizeState(value) {
  if (!value || typeof value !== "object") return initialState;
  const quarterId = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
  const habits = Array.isArray(value.habits)
    ? value.habits.map((habit) =>
        resumeExpiredHabitPause(
          {
            ...habit,
            id: habit.id || Date.now() + Math.random(),
            name: String(habit.name || "Untitled habit"),
            icon: normalizeHabitIcon(habit.icon),
            goal: Number.isFinite(Number(habit.goal))
              ? Math.max(1, Math.min(7, Number(habit.goal)))
              : 7,
            allowance: 1,
            flexibleWeekly: Boolean(habit.flexibleWeekly),
            numericTarget: Math.max(0, Number(habit.numericTarget) || 0),
            numericUnit: String(habit.numericUnit || ""),
            stackAfter: String(habit.stackAfter || ""),
            note: String(habit.note || ""),
            paused: Boolean(habit.paused),
            pauseUntil: /^\d{4}-\d{2}-\d{2}$/.test(habit.pauseUntil || "")
              ? habit.pauseUntil
              : "",
            pausedAt: /^\d{4}-\d{2}-\d{2}$/.test(habit.pausedAt || "")
              ? habit.pausedAt
              : habit.paused
                ? todayKey()
                : "",
            reminderEnabled: Boolean(habit.reminderEnabled),
            archived: Boolean(habit.archived),
            minimumVersion: String(habit.minimumVersion || ""),
            group: ["Morning", "Evening", "School"].includes(habit.group)
              ? habit.group
              : "Anytime",
            reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(
              habit.reminderTime || "",
            )
              ? habit.reminderTime
              : "09:00",
            ...(Array.isArray(habit.scheduleDays)
              ? {
                  scheduleDays: [
                    ...new Set(
                      habit.scheduleDays.filter((day) =>
                        WEEKDAYS.includes(day),
                      ),
                    ),
                  ],
                }
              : {}),
            reminderTimeZone: (() => {
              const value = String(habit.reminderTimeZone || DEVICE_TIME_ZONE);
              try {
                new Intl.DateTimeFormat(undefined, { timeZone: value });
                return value;
              } catch {
                return DEVICE_TIME_ZONE;
              }
            })(),
            reminderQuietEnabled: Boolean(habit.reminderQuietEnabled),
            reminderQuietStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(
              habit.reminderQuietStart || "",
            )
              ? habit.reminderQuietStart
              : "22:00",
            reminderQuietEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(
              habit.reminderQuietEnd || "",
            )
              ? habit.reminderQuietEnd
              : "07:00",
            reminderSnoozedUntil: Math.max(
              0,
              Number(habit.reminderSnoozedUntil) || 0,
            ),
            startDate: String(habit.startDate || todayKey()),
            days: Object.fromEntries(
              Object.entries(habit.days || {}).map(([key, day]) => [
                key,
                typeof day === "boolean"
                  ? {
                      done: day,
                      paused: false,
                      note: "",
                      amount: 0,
                      reason: "",
                    }
                  : {
                      done: Boolean(day?.done),
                      paused: Boolean(day?.paused),
                      note: String(day?.note || ""),
                      amount: Math.max(0, Number(day?.amount) || 0),
                      reason: String(day?.reason || ""),
                      completedAt: String(day?.completedAt || ""),
                      minimumVersion: Boolean(day?.minimumVersion),
                      pauseReason: String(day?.pauseReason || ""),
                    },
              ]),
            ),
          },
          todayKey(),
        ),
      )
    : initialState.habits;
  return {
    ...initialState,
    ...value,
    habits,
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    settings: {
      ...initialState.settings,
      ...(value.settings || {}),
      accent: /^#[0-9a-f]{6}$/i.test(value.settings?.accent || "")
        ? value.settings.accent
        : initialState.settings.accent,
      askMissedReasons: value.settings?.askMissedReasons !== false,
      celebrations: value.settings?.celebrations !== false,
      journalPin:
        value.settings?.journalPin &&
        typeof value.settings.journalPin.salt === "string" &&
        typeof value.settings.journalPin.hash === "string"
          ? value.settings.journalPin
          : null,
      highContrast: Boolean(value.settings?.highContrast),
      largeText: Boolean(value.settings?.largeText),
      reduceMotion: Boolean(value.settings?.reduceMotion),
      dashboard: {
        ...initialState.settings.dashboard,
        ...(value.settings?.dashboard || {}),
      },
      dashboardOrder: Array.isArray(value.settings?.dashboardOrder)
        ? [
            ...new Set(
              value.settings.dashboardOrder.filter((id) =>
                ["progress", "tasks", "wellness", "focus"].includes(id),
              ),
            ),
          ].concat(
            initialState.settings.dashboardOrder.filter(
              (id) => !value.settings.dashboardOrder.includes(id),
            ),
          )
        : initialState.settings.dashboardOrder,
      weeklyReviewPlans:
        value.settings?.weeklyReviewPlans &&
        typeof value.settings.weeklyReviewPlans === "object"
          ? value.settings.weeklyReviewPlans
          : {},
      quarterlyGoal: {
        ...initialState.settings.quarterlyGoal,
        ...(value.settings?.quarterlyGoal || {}),
        title: String(value.settings?.quarterlyGoal?.title || "").slice(0, 100),
        weeklyHabit: String(
          value.settings?.quarterlyGoal?.weeklyHabit || "",
        ).slice(0, 100),
        targetWeeks: Math.max(
          1,
          Math.min(
            13,
            Number(value.settings?.quarterlyGoal?.targetWeeks) || 12,
          ),
        ),
        quarterId,
        completedWeeks:
          value.settings?.quarterlyGoal?.quarterId === quarterId &&
          Array.isArray(value.settings?.quarterlyGoal?.completedWeeks)
            ? [
                ...new Set(
                  value.settings.quarterlyGoal.completedWeeks.filter((key) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(key),
                  ),
                ),
              ]
            : [],
      },
    },
    profile: {
      ...initialState.profile,
      ...(value.profile || {}),
      icon: normalizeProfileIcon(value.profile?.icon),
    },
    journal:
      value.journal && !Array.isArray(value.journal) && !value.journal.mood
        ? value.journal
        : { [todayKey()]: value.journal || {} },
    study: {
      ...initialState.study,
      ...(value.study || {}),
      classes: Array.isArray(value.study?.classes)
        ? value.study.classes
            .filter(
              (item) =>
                item && typeof item === "object" && !Array.isArray(item),
            )
            .map((item) => ({
              ...item,
              weekPattern: ["A", "B"].includes(item.weekPattern)
                ? item.weekPattern
                : "",
              startDate: /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "")
                ? item.startDate
                : todayKey(),
            }))
        : [],
      subjects:
        Array.isArray(value.study?.subjects) && value.study.subjects.length
          ? value.study.subjects.map((subject) => ({
              ...subject,
              units: Math.max(1, Number(subject.units) || 3),
              topics: Array.isArray(subject.topics) ? subject.topics : [],
              grades: Array.isArray(subject.grades)
                ? subject.grades
                    .filter(
                      (grade) =>
                        grade &&
                        typeof grade === "object" &&
                        !Array.isArray(grade),
                    )
                    .map((grade, index) => ({
                      ...grade,
                      id: String(grade.id || `${subject.name}-grade-${index}`),
                      ...(Number.isFinite(Number(grade.weight)) &&
                      Number(grade.weight) >= 0
                        ? { weight: Math.min(100, Number(grade.weight)) }
                        : {}),
                    }))
                : [],
              targetGrade: Math.max(
                0,
                Math.min(100, Number(subject.targetGrade) || 90),
              ),
              finalWeight: subject.finalWeight ?? 30,
            }))
          : initialState.study.subjects,
      decks: Array.isArray(value.study?.decks)
        ? value.study.decks.filter(
            (deck) => deck && typeof deck.name === "string" && deck.name.trim(),
          )
        : [],
      sets: normalizeStudySets(value.study?.sets),
      flashcards: Array.isArray(value.study?.flashcards)
        ? value.study.flashcards
            .filter(
              (card) =>
                card && typeof card === "object" && !Array.isArray(card),
            )
            .map((card) => ({
              ...card,
              deck: String(card.deck || card.subject || ""),
              tags: [
                ...new Set(
                  (Array.isArray(card.tags) ? card.tags : [])
                    .map((tag) => String(tag).trim())
                    .filter(Boolean),
                ),
              ],
              correctCount: Math.max(0, Number(card.correctCount) || 0),
              missCount: Math.max(0, Number(card.missCount) || 0),
              repetitions: Math.max(0, Number(card.repetitions) || 0),
              intervalDays: Math.max(0, Number(card.intervalDays) || 0),
              easeFactor: Math.max(1.3, Number(card.easeFactor) || 2.5),
            }))
        : [],
      studyToolPrefs: {
        ...initialState.study.studyToolPrefs,
        ...(value.study?.studyToolPrefs || {}),
        quizType: [
          "all",
          "combo",
          "multiple-choice",
          "identification",
          "true-false",
          "matching",
        ].includes(value.study?.studyToolPrefs?.quizType)
          ? value.study.studyToolPrefs.quizType
          : initialState.study.studyToolPrefs.quizType,
        flashcardSessionSize: Math.max(
          1,
          Number(value.study?.studyToolPrefs?.flashcardSessionSize) ||
            initialState.study.studyToolPrefs.flashcardSessionSize,
        ),
        quizQuestionCount: Math.max(
          1,
          Number(value.study?.studyToolPrefs?.quizQuestionCount) ||
            initialState.study.studyToolPrefs.quizQuestionCount,
        ),
        shuffleQuestions:
          value.study?.studyToolPrefs?.shuffleQuestions !== false,
      },
      history: Array.isArray(value.study?.history) ? value.study.history : [],
      schedule: Array.isArray(value.study?.schedule)
        ? value.study.schedule
        : [],
    },
    workout: {
      ...initialState.workout,
      ...(value.workout || {}),
      measurementHistory: Array.isArray(value.workout?.measurementHistory)
        ? value.workout.measurementHistory
        : [],
      bodyPhotos: Array.isArray(value.workout?.bodyPhotos)
        ? value.workout.bodyPhotos
        : [],
      library: Array.isArray(value.workout?.library)
        ? value.workout.library
        : initialState.workout.library,
      exercises: Array.isArray(value.workout?.exercises)
        ? value.workout.exercises
        : [],
      history: Array.isArray(value.workout?.history)
        ? value.workout.history
        : [],
      records: Array.isArray(value.workout?.records)
        ? value.workout.records
        : [],
      weightUnit: value.workout?.weightUnit === "lb" ? "lb" : "kg",
      platePresets:
        Array.isArray(value.workout?.platePresets) &&
        value.workout.platePresets.length
          ? value.workout.platePresets
              .filter(
                (preset) =>
                  preset &&
                  typeof preset.name === "string" &&
                  preset.name.trim(),
              )
              .map((preset) => ({
                name: preset.name.trim().slice(0, 40),
                barWeight: Math.max(0, Number(preset.barWeight) || 0),
                plateIncrement: Math.max(
                  0.5,
                  Number(preset.plateIncrement) || 0.5,
                ),
              }))
          : initialState.workout.platePresets,
      activePlatePreset: String(
        value.workout?.activePlatePreset ||
          initialState.workout.activePlatePreset,
      ),
      templates: Array.isArray(value.workout?.templates)
        ? value.workout.templates
        : initialState.workout.templates,
      recovery: {
        ...initialState.workout.recovery,
        ...(value.workout?.recovery || {}),
      },
      dayPlans: Object.fromEntries(
        WORKOUT_PLAN_DAYS.map((day) => [
          day,
          Array.isArray(value.workout?.dayPlans?.[day])
            ? value.workout.dayPlans[day]
                .filter(
                  (item) =>
                    item &&
                    typeof item === "object" &&
                    String(item.name || "").trim(),
                )
                .map((item, index) => ({
                  id: String(
                    item.id || `${day}-${index}-${String(item.name).trim()}`,
                  ),
                  name: String(item.name).trim(),
                  sets: Math.min(
                    12,
                    Math.max(1, Math.round(Number(item.sets) || 3)),
                  ),
                  reps: Math.min(
                    30,
                    Math.max(1, Math.round(Number(item.reps) || 8)),
                  ),
                }))
            : [],
        ]),
      ),
      daySplits: Object.fromEntries(
        WEEKDAYS.map((day) => {
          const saved = value.workout?.daySplits?.[day];
          const legacyExercises = value.workout?.dayPlans?.[day];
          const source =
            saved && typeof saved === "object" && !Array.isArray(saved)
              ? saved
              : Array.isArray(legacyExercises) && legacyExercises.length
                ? {
                    id: `${day}-legacy-plan`,
                    name: "Custom workout",
                    split: "Custom",
                    focus: day,
                    exercises: legacyExercises,
                  }
                : null;
          if (!source || !Array.isArray(source.exercises)) return [day, null];
          const exercises = source.exercises
            .filter((item) => item && String(item.name || "").trim())
            .map((item, index) => ({
              id: String(
                item.id || `${day}-${index}-${String(item.name).trim()}`,
              ),
              name: String(item.name).trim(),
              sets: Math.min(
                12,
                Math.max(1, Math.round(Number(item.sets) || 3)),
              ),
              reps: Math.min(
                30,
                Math.max(1, Math.round(Number(item.reps) || 8)),
              ),
            }));
          return [
            day,
            exercises.length
              ? {
                  id: String(source.id || `${day}-${source.name || "routine"}`),
                  templateId: String(source.templateId || ""),
                  name: String(source.name || source.focus || "Workout"),
                  split: String(source.split || "Custom"),
                  focus: String(source.focus || source.name || "Workout"),
                  exercises,
                }
              : null,
          ];
        }),
      ),
      routineTemplates: Array.isArray(value.workout?.routineTemplates)
        ? value.workout.routineTemplates
            .filter(
              (routine) =>
                routine &&
                typeof routine.name === "string" &&
                Array.isArray(routine.exercises),
            )
            .map((routine) => ({
              id: String(routine.id || createId()),
              name: routine.name.trim().slice(0, 40),
              exercises: routine.exercises
                .filter((item) => item && String(item.name || "").trim())
                .map((item) => ({
                  id: String(item.id || createId()),
                  name: String(item.name).trim(),
                  sets: Math.min(
                    12,
                    Math.max(1, Math.round(Number(item.sets) || 3)),
                  ),
                  reps: Math.min(
                    30,
                    Math.max(1, Math.round(Number(item.reps) || 8)),
                  ),
                })),
            }))
        : [],
    },
    learning: Array.isArray(value.learning)
      ? value.learning
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const legacySteps = Array.isArray(item.steps)
              ? item.steps
              : (Array.isArray(item.milestones) ? item.milestones : []).map(
                  (title, index, milestones) => ({
                    id: `${item.id}-step-${index}`,
                    title: String(title),
                    done:
                      Number(item.progress || 0) >=
                      ((index + 1) * 100) / milestones.length,
                  }),
                );
            return {
              ...item,
              category: [
                "Coding",
                "Language",
                "Music",
                "Finance",
                "Health",
                "Other",
              ].includes(item.category)
                ? item.category
                : ["Coding", "Language", "Music", "Finance", "Health"].includes(
                      item.type,
                    )
                  ? item.type
                  : "Other",
              deadline: item.deadline || "",
              targetHours: Math.max(1, Number(item.targetHours) || 10),
              steps: legacySteps.map((step, index) => ({
                id: step.id || `${item.id}-step-${index}`,
                title: String(step.title || ""),
                done: Boolean(step.done),
              })),
              resources: Array.isArray(item.resources)
                ? item.resources.filter(
                    (resource) => resource && typeof resource === "object",
                  )
                : [],
              logs: Array.isArray(item.logs)
                ? item.logs.filter((log) => log && typeof log === "object")
                : [],
              focusMinutes: Math.max(0, Number(item.focusMinutes) || 0),
              readingList: Array.isArray(item.readingList)
                ? item.readingList.filter(
                    (reading) => reading && typeof reading === "object",
                  )
                : [],
              badges: Array.isArray(item.badges) ? item.badges : [],
              reviewDates: Array.isArray(item.reviewDates)
                ? item.reviewDates
                : [],
            };
          })
      : initialState.learning,
    wellness: {
      ...initialState.wellness,
      ...(value.wellness || {}),
      waterReminderEnabled: Boolean(value.wellness?.waterReminderEnabled),
      waterReminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(
        value.wellness?.waterReminderTime || "",
      )
        ? value.wellness.waterReminderTime
        : initialState.wellness.waterReminderTime,
      breathingPattern: ["calm", "box", "relax"].includes(
        value.wellness?.breathingPattern,
      )
        ? value.wellness.breathingPattern
        : initialState.wellness.breathingPattern,
      selfCareActions: Array.isArray(value.wellness?.selfCareActions)
        ? value.wellness.selfCareActions
            .filter(
              (action) =>
                action &&
                typeof action === "object" &&
                action.id &&
                typeof action.title === "string",
            )
            .map((action) => ({
              id: String(action.id),
              title: action.title.trim().slice(0, 100),
            }))
            .filter((action) => action.title)
        : initialState.wellness.selfCareActions,
      history:
        value.wellness?.history && typeof value.wellness.history === "object"
          ? value.wellness.history
          : {},
    },
    xp: Number.isFinite(Number(value.xp)) ? Math.max(0, Number(value.xp)) : 0,
    xpHistory: Array.isArray(value.xpHistory)
      ? value.xpHistory
          .filter(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              Number.isFinite(Number(entry.delta)),
          )
          .slice(-40)
      : [],
  };
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem("daymark-state")));
  } catch {
    return initialState;
  }
}

function datesForGrid(endDate, monthCount = 3, monthOffset = 0) {
  const end = new Date(`${endDate}T00:00:00`);
  const monthStart = new Date(
    end.getFullYear(),
    end.getMonth() + monthOffset - monthCount + 1,
    1,
  );
  const monthEnd = new Date(
    end.getFullYear(),
    end.getMonth() + monthOffset + 1,
    0,
  );
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)));
  const weeks = [];
  for (
    let weekStart = new Date(gridStart);
    weekStart <= gridEnd;
    weekStart.setDate(weekStart.getDate() + 7)
  ) {
    weeks.push(
      Array.from({ length: 7 }, (_, dayIndex) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + dayIndex);
        return date < monthStart || date > monthEnd ? null : date;
      }),
    );
  }
  return weeks;
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const focusable = [
    ...event.currentTarget.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.getClientRects().length);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function hashJournalPin(pin, salt) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${pin}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function usePhoneViewport() {
  const [isPhoneViewport, setIsPhoneViewport] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const updateViewport = () => setIsPhoneViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);
  return isPhoneViewport;
}

function HabitRow({
  habit,
  dates,
  isPhoneViewport,
  endKey,
  selectedDay,
  onToggle,
  onProgress,
  onReason,
  onDisableReasonPrompt,
  askMissedReasons,
  onPause,
  onNote,
  onEdit,
  onDelete,
  onSelectDay,
  onSuggestReminder,
}) {
  const [showNoteHistory, setShowNoteHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [yearView, setYearView] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [skippedReasonDates, setSkippedReasonDates] = useState([]);
  const selectedDate = dateFromKey(selectedDay);
  const selectedDayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const selectedDayEntry = habit.days[selectedDay] || {};
  const historyDates = yearView
    ? datesForGrid(endKey, 12, 11 - dateFromKey(endKey).getMonth())
    : dates;
  const selectedDayStatus =
    selectedDayEntry.paused || isHabitPausedOnDate(habit, selectedDay)
      ? selectedDayEntry.pauseReason
        ? `Paused · ${selectedDayEntry.pauseReason}`
        : "Paused"
      : selectedDayEntry.done
        ? selectedDayEntry.minimumVersion
          ? "Minimum done"
          : "Completed"
        : selectedDay === endKey
          ? "Not checked in"
          : "Not completed";
  const shiftSelectedDay = (days) => {
    const date = dateFromKey(selectedDay);
    date.setDate(date.getDate() + days);
    onSelectDay(dateKey(date));
  };
  const completed = Object.values(habit.days).filter((day) => day?.done).length;
  const start = dateFromKey(habit.startDate || endKey);
  const end = dateFromKey(endKey);
  const scheduledDays = getHabitScheduleDays(habit);
  const weekStart = dateFromKey(weekStartKey(end));
  let weeklyAvailableDays = 0;
  let weeklyTarget = 0;
  let weeklyDone = 0;
  for (
    const date = new Date(weekStart);
    date <= end;
    date.setDate(date.getDate() + 1)
  ) {
    const key = dateKey(date);
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    if (
      key >= (habit.startDate || key) &&
      (habit.flexibleWeekly || scheduledDays.includes(weekday)) &&
      !habit.days[key]?.paused &&
      !isHabitPausedOnDate(habit, key)
    ) {
      weeklyAvailableDays += 1;
      weeklyTarget += 1;
      weeklyDone += habit.numericTarget
        ? Math.min(
            1,
            Number(habit.days[key]?.amount || 0) / habit.numericTarget,
          )
        : habit.days[key]?.done
          ? 1
          : 0;
    }
  }
  if (habit.flexibleWeekly)
    weeklyTarget = Math.min(Number(habit.goal) || 1, weeklyAvailableDays);
  weeklyDone = Math.min(weeklyDone, weeklyTarget);
  let expected = 0;
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const key = dateKey(day);
    if (
      scheduledDays.includes(WEEKDAYS[(day.getDay() + 6) % 7]) &&
      !habit.days[key]?.paused &&
      !isHabitPausedOnDate(habit, key)
    )
      expected += 1;
  }
  if (habit.flexibleWeekly) {
    const firstWeek = dateFromKey(weekStartKey(start));
    const lastWeek = dateFromKey(weekStartKey(end));
    const weeks = Math.max(
      1,
      Math.round((lastWeek - firstWeek) / 604800000) + 1,
    );
    expected = weeks * Math.max(1, Number(habit.goal) || 1);
  }
  const noteHistory = Object.entries(habit.days)
    .filter(([, day]) => day?.note?.trim())
    .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  const visibleNotes = showNoteHistory ? noteHistory : noteHistory.slice(0, 3);
  const completionCredit = Object.entries(habit.days)
    .filter(([key]) => key >= (habit.startDate || key) && key <= endKey)
    .reduce(
      (sum, [, day]) =>
        sum +
        (habit.numericTarget
          ? Math.min(1, Number(day?.amount || 0) / habit.numericTarget)
          : day?.done
            ? 1
            : 0),
      0,
    );
  const completionRate = expected
    ? Math.min(100, Math.round((completionCredit / expected) * 100))
    : 0;
  const recentDates = Array.from({ length: 30 }, (_, index) => {
    const date = dateFromKey(endKey);
    date.setDate(date.getDate() - 29 + index);
    return dateKey(date);
  });
  const eligibleRecent = recentDates.filter((key) => {
    const date = dateFromKey(key);
    return (
      key >= (habit.startDate || "") &&
      (habit.flexibleWeekly ||
        scheduledDays.includes(WEEKDAYS[(date.getDay() + 6) % 7])) &&
      !habit.days[key]?.paused &&
      !isHabitPausedOnDate(habit, key)
    );
  });
  const recentRate = eligibleRecent.length
    ? eligibleRecent.filter((key) => habit.days[key]?.done).length /
      eligibleRecent.length
    : 0;
  const weeklyRates = Array.from({ length: 4 }, (_, weekIndex) => {
    const eligible = recentDates
      .slice(weekIndex * 7, weekIndex * 7 + 7)
      .filter((key) => {
        const date = dateFromKey(key);
        return (
          key >= (habit.startDate || "") &&
          (habit.flexibleWeekly ||
            scheduledDays.includes(WEEKDAYS[(date.getDay() + 6) % 7])) &&
          !habit.days[key]?.paused &&
          !isHabitPausedOnDate(habit, key)
        );
      });
    return eligible.length
      ? eligible.filter((key) => habit.days[key]?.done).length / eligible.length
      : null;
  }).filter((rate) => rate !== null);
  const steadiness =
    weeklyRates.length > 1
      ? Math.max(
          0,
          100 - (Math.max(...weeklyRates) - Math.min(...weeklyRates)) * 100,
        )
      : recentRate * 100;
  const healthScore = Math.round(recentRate * 60 + steadiness * 0.4);
  const completionTimes = recentDates
    .map((key) => habit.days[key]?.completedAt)
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
    .map((time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
  const averageCompletionMinute = completionTimes.length
    ? Math.round(
        completionTimes.reduce((sum, time) => sum + time, 0) /
          completionTimes.length,
      )
    : null;
  const suggestedTime =
    averageCompletionMinute === null
      ? ""
      : `${String(Math.floor(averageCompletionMinute / 60)).padStart(2, "0")}:${String(averageCompletionMinute % 60).padStart(2, "0")}`;
  const missedDates = getMissedHabitDates(
    habit,
    habit.startDate || endKey,
    endKey,
  );
  const missedDateSet = new Set(missedDates);
  const reasonWindowStart = dateFromKey(endKey);
  reasonWindowStart.setDate(reasonWindowStart.getDate() - 7);
  const recentMissedDates = getMissedHabitDates(
    habit,
    dateKey(reasonWindowStart),
    endKey,
  ).reverse();
  const reasonPromptDate = recentMissedDates.find(
    (key) => !habit.days[key]?.reason && !skippedReasonDates.includes(key),
  );
  const reasonPromptDateLabel = reasonPromptDate
    ? dateFromKey(reasonPromptDate).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  const reasons = Object.entries(habit.days).reduce((counts, [date, day]) => {
    const reason = day?.reason?.trim();
    if (reason) counts.set(reason, [...(counts.get(reason) || []), date]);
    return counts;
  }, new Map());
  const current = currentStreak(habit, endKey);
  const lastPausedDate = Object.entries(habit.days)
    .filter(([, day]) => day?.paused)
    .map(([date]) => date)
    .sort()
    .at(-1);
  const lastMissedDate = missedDates.filter((date) => date < endKey).at(-1);
  const streakExplanation =
    isHabitPausedOnDate(habit, endKey) || habit.days[endKey]?.paused
      ? `Your streak is frozen by a pause${habit.days[endKey]?.paused ? ` on ${endKey}` : ""}.`
      : lastPausedDate && lastPausedDate >= (habit.startDate || "")
        ? `A pause on ${lastPausedDate} protected your streak.`
        : current > 0
          ? "Your recent check-ins are keeping this streak active."
          : habit.flexibleWeekly
            ? "This weekly streak resets only after a week ends below its target."
            : lastMissedDate
              ? `The streak broke after a missed scheduled day on ${lastMissedDate}.`
              : "Your streak starts with your first completed check-in.";
  return (
    <article className="habit-row" style={{ "--habit-color": habit.color }}>
      <div className="habit-info">
        <span
          className="habit-icon"
          style={{ background: `${habit.color}20`, color: habit.color }}
        >
          <Icon name={normalizeHabitIcon(habit.icon)} size={20} />
        </span>
        <div>
          <h3>
            <button
              type="button"
              className="habit-title-button"
              onClick={() => setDetailOpen(true)}
            >
              {habit.name}
            </button>
          </h3>
          <span className="goal-label">
            {isHabitPausedOnDate(habit, endKey) ? "Paused · " : ""}
            {habit.flexibleWeekly
              ? `Any ${habit.goal} days/week`
              : scheduledDays.length === 7
                ? "Every day"
                : `${scheduledDays.length} days/week`}{" "}
            · {7 - scheduledDays.length} rest{" "}
            {7 - scheduledDays.length === 1 ? "day" : "days"}
          </span>
          {habit.group && habit.group !== "Anytime" && (
            <small className="habit-group-label">{habit.group}</small>
          )}
          {habit.minimumVersion && (
            <small className="habit-minimum-version">
              Minimum: {habit.minimumVersion}
            </small>
          )}
          {suggestedTime && (
            <button
              type="button"
              className="text-button habit-smart-reminder"
              onClick={() => onSuggestReminder(habit.id, suggestedTime)}
            >
              Suggested reminder · {suggestedTime}
            </button>
          )}
          {habit.minimumVersion &&
            !habit.numericTarget &&
            !habit.days[selectedDay]?.done && (
              <button
                type="button"
                className="subtle-btn habit-minimum-action"
                onClick={() => onToggle(habit.id, selectedDay, true)}
              >
                Do minimum · {habit.minimumVersion}
              </button>
            )}
          {habit.stackAfter && (
            <small className="habit-stack-note">After {habit.stackAfter}</small>
          )}
        </div>
      </div>
      {habit.numericTarget > 0 && (
        <label className="habit-numeric-progress">
          <span>
            {habit.days[selectedDay]?.amount || 0} / {habit.numericTarget}{" "}
            {habit.numericUnit || "units"}
          </span>
          <input
            type="number"
            min="0"
            max={habit.numericTarget}
            step="any"
            value={habit.days[selectedDay]?.amount || 0}
            aria-label={`${habit.name} progress for ${selectedDay}`}
            onChange={(event) =>
              onProgress(habit.id, selectedDay, event.target.value)
            }
          />
          <i>
            <b
              style={{
                width: `${Math.min(100, (Number(habit.days[selectedDay]?.amount || 0) / habit.numericTarget) * 100)}%`,
              }}
            />
          </i>
        </label>
      )}
      {askMissedReasons &&
        recentMissedDates.length >= 2 &&
        reasonPromptDate && (
          <div className="habit-reason-prompt">
            <strong>
              {reasonPromptDateLabel} - what got in the way? (optional)
            </strong>
            <div>
              {["Too tired", "No time", "Forgot"].map((reason) => (
                <button
                  type="button"
                  className="subtle-btn"
                  key={reason}
                  onClick={() => onReason(habit.id, reasonPromptDate, reason)}
                >
                  {reason}
                </button>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSkippedReasonDates((skipped) => [
                    ...skipped,
                    reasonPromptDate,
                  ])
                }
              >
                Skip
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onDisableReasonPrompt}
              >
                Don’t ask again
              </button>
            </div>
          </div>
        )}
      <div className="heatmap-wrap">
        <div
          className="habit-date-nav"
          aria-label={`${habit.name} date navigation`}
        >
          <button
            type="button"
            className="habit-date-arrow"
            aria-label="Previous day"
            title="Previous day"
            onClick={() => shiftSelectedDay(-1)}
          >
            <Icon name="ArrowLeft" size={16} />
          </button>
          <strong aria-live="polite">{selectedDayLabel}</strong>
          <button
            type="button"
            className="habit-date-arrow"
            aria-label="Next day"
            title="Next day"
            disabled={selectedDay >= endKey}
            onClick={() => shiftSelectedDay(1)}
          >
            <Icon name="ArrowRight" size={16} />
          </button>
          <button
            type="button"
            className="text-button habit-today-button"
            disabled={selectedDay === endKey}
            onClick={() => onSelectDay(endKey)}
          >
            Today
          </button>
          <button
            type="button"
            className="primary-btn habit-completion-button"
            onClick={() => onToggle(habit.id, selectedDay)}
          >
            {selectedDayEntry.done ? "Undo check-in" : "Complete day"}
          </button>
          <span
            className={`habit-selected-status ${selectedDayEntry.done ? "complete" : selectedDayEntry.paused || isHabitPausedOnDate(habit, selectedDay) ? "paused" : ""}`}
          >
            {selectedDayStatus}
          </span>
        </div>
        <div className="habit-history-controls">
          <button
            type="button"
            className="text-button habit-history-toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyOpen ? "Hide calendar history" : "Show calendar history"}
            <span aria-hidden="true">{historyOpen ? "−" : "+"}</span>
          </button>
          <button
            type="button"
            className="text-button habit-year-toggle"
            aria-pressed={yearView}
            onClick={() => {
              setYearView((showYear) => !showYear);
              setHistoryOpen(true);
            }}
          >
            {yearView ? "Show shorter view" : "View full year"}
          </button>
          <span>{isPhoneViewport ? "This + next month" : "Last 3 months"}</span>
        </div>
        {historyOpen && (
          <div
            className={`habit-history-content${yearView ? " year-view" : ""}`}
            tabIndex={yearView ? 0 : undefined}
          >
            <div className="habit-calendar-hint">
              {yearView
                ? "Swipe across the calendar to see the full year."
                : "Select a day to review its notes and status."}
              <span className="habit-calendar-legend">
                <span aria-hidden="true" />
                Missed
              </span>
            </div>
            <div
              className="month-labels"
              style={{ "--habit-week-count": historyDates.length }}
            >
              {historyDates.map((week, index) => {
                const firstOfMonth = week.find((day) => day?.getDate() === 1);
                return (
                  <span key={index}>
                    {firstOfMonth?.toLocaleDateString(undefined, {
                      month: "short",
                    }) || ""}
                  </span>
                );
              })}
            </div>
            <div
              className="heatmap"
              style={{ "--habit-week-count": historyDates.length }}
            >
              {historyDates.map((week, weekIndex) => (
                <div className="week" key={weekIndex}>
                  {week.map((day, dayIndex) => {
                    if (!day)
                      return <span className="day-cell blank" key={dayIndex} />;
                    const key = dateKey(day);
                    const done = habit.days[key]?.done;
                    const minimumDone = Boolean(
                      habit.days[key]?.minimumVersion,
                    );
                    const paused = habit.days[key]?.paused;
                    const upcoming = key > endKey;
                    const missed = missedDateSet.has(key);
                    return (
                      <button
                        aria-label={`Select ${day.toDateString()} for ${habit.name}${upcoming ? ", upcoming" : done ? ", completed" : paused ? ", paused" : missed ? ", missed" : ", not completed"}`}
                        aria-pressed={key === selectedDay}
                        key={dayIndex}
                        className={`day-cell ${done ? "done" : ""} ${minimumDone ? "minimum-done" : ""} ${paused ? "paused" : ""} ${missed ? "missed" : ""} ${upcoming ? "upcoming" : ""} ${key === endKey ? "current" : ""} ${key === selectedDay ? "selected" : ""}`}
                        disabled={upcoming}
                        style={done ? { background: habit.color } : {}}
                        onClick={() => onSelectDay(key)}
                        title={`${day.toDateString()}${upcoming ? " · upcoming" : paused ? ` · streak paused${habit.days[key]?.pauseReason ? `: ${habit.days[key].pauseReason}` : ""}` : missed ? " · missed" : minimumDone ? " · minimum version" : ""}${habit.days[key]?.note ? ` · ${habit.days[key].note}` : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="habit-stats">
        <strong>
          {currentStreak(habit, endKey)}
          <small>{habit.goal === 7 ? "day streak" : "week streak"}</small>
        </strong>
        <strong>
          {completionRate}%<small>completion</small>
        </strong>
        <button
          className="more-btn"
          aria-label={`Edit ${habit.name}`}
          onClick={() => onEdit(habit)}
        >
          <Icon name="Ellipsis" size={18} />
        </button>
        <button
          type="button"
          className="habit-delete-btn"
          aria-label={`Archive ${habit.name}`}
          title={`Archive ${habit.name}`}
          onClick={() => onDelete(habit.id)}
        >
          ↧
        </button>
      </div>
      <details className="habit-day-tools">
        <summary>
          <span>More details</span>
          <small>Notes, pause &amp; stats</small>
        </summary>
        <div className="habit-extra-stats">
          <span title="Completion and consistency over the last 30 days">
            Health · {healthScore}/100
          </span>
          <span
            className="habit-week-summary"
            title="Completed scheduled check-ins this week"
          >
            This week · {weeklyDone}/{weeklyTarget}
            <i>
              <b
                style={{
                  width: `${weeklyTarget ? Math.min(100, (weeklyDone / weeklyTarget) * 100) : 0}%`,
                }}
              />
            </i>
          </span>
        </div>
        <div className="habit-note-editor">
          <label>
            Note for {selectedDay}
            <input
              value={selectedDayEntry.note || ""}
              onChange={(event) =>
                onNote(habit.id, selectedDay, event.target.value)
              }
              placeholder="Add context to this day"
            />
          </label>
          <button
            type="button"
            className={`subtle-btn ${selectedDayEntry.paused ? "selected" : ""}`}
            onClick={() => onPause(habit.id, selectedDay)}
          >
            {selectedDayEntry.paused ? "Resume streak" : "Pause with reason"}
          </button>
        </div>
      </details>
      {noteHistory.length > 0 && (
        <div className="habit-note-history">
          <div className="habit-note-history-heading">
            <strong>Reflection history</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowNoteHistory((visible) => !visible)}
            >
              {showNoteHistory
                ? "Show less"
                : `View all (${noteHistory.length})`}
            </button>
          </div>
          {visibleNotes.map(([date, day]) => (
            <button
              type="button"
              className={`habit-note-entry ${date === selectedDay ? "selected" : ""}`}
              key={date}
              onClick={() => onSelectDay(date)}
            >
              <time dateTime={date}>{date}</time>
              <span>{day.note}</span>
            </button>
          ))}
        </div>
      )}
      {detailOpen && (
        <div
          className="habit-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOpen(false);
          }}
        >
          <section
            className="habit-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`habit-detail-${habit.id}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDetailOpen(false);
                return;
              }
              trapDialogFocus(event);
            }}
          >
            <header>
              <span
                className="habit-icon"
                style={{ background: `${habit.color}20`, color: habit.color }}
              >
                <Icon name={normalizeHabitIcon(habit.icon)} size={20} />
              </span>
              <div>
                <p className="eyebrow">HABIT DETAILS</p>
                <h2 id={`habit-detail-${habit.id}`}>{habit.name}</h2>
                <small>
                  {isHabitPausedOnDate(habit, endKey)
                    ? "Paused"
                    : `${scheduledDays.length} planned day${scheduledDays.length === 1 ? "" : "s"} each week`}
                </small>
              </div>
              <button
                type="button"
                className="close"
                autoFocus
                onClick={() => setDetailOpen(false)}
                aria-label="Close habit details"
                title="Close habit details"
              >
                <Icon name="X" size={18} />
              </button>
            </header>
            <div className="habit-detail-metrics">
              <div>
                <strong>{currentStreak(habit, endKey)}</strong>
                <span>{habit.goal === 7 ? "day streak" : "week streak"}</span>
              </div>
              <div>
                <strong>{completionRate}%</strong>
                <span>completion rate</span>
              </div>
              <div>
                <strong>{completed}</strong>
                <span>total check-ins</span>
              </div>
              <div>
                <strong>{bestStreak(habit)}</strong>
                <span>best streak</span>
              </div>
              <div>
                <strong>{averageStreak(habit).toFixed(1)}</strong>
                <span>average streak</span>
              </div>
            </div>
            <p className="habit-detail-streak-status">{streakExplanation}</p>
            <div className="habit-detail-heatmap">
              <h3>Recent months</h3>
              <div
                role="img"
                aria-label="Habit completion heat map for the last three months"
              >
                {dates.flatMap((week, weekIndex) =>
                  week.map((day, dayIndex) => {
                    if (!day)
                      return (
                        <i className="blank" key={`${weekIndex}-${dayIndex}`} />
                      );
                    const key = dateKey(day);
                    const done = Boolean(habit.days[key]?.done);
                    const paused = Boolean(
                      habit.days[key]?.paused ||
                      isHabitPausedOnDate(habit, key),
                    );
                    return (
                      <i
                        key={key}
                        className={done ? "done" : paused ? "paused" : ""}
                        style={done ? { background: habit.color } : {}}
                        title={`${key}: ${done ? "completed" : paused ? "paused" : "missed"}`}
                      />
                    );
                  }),
                )}
              </div>
            </div>
            <div className="habit-detail-week">
              <h3>Last seven days</h3>
              <div>
                {Array.from({ length: 7 }, (_, index) => {
                  const date = dateFromKey(endKey);
                  date.setDate(date.getDate() - 6 + index);
                  const key = dateKey(date);
                  const done = Boolean(habit.days[key]?.done);
                  const paused = Boolean(
                    habit.days[key]?.paused || isHabitPausedOnDate(habit, key),
                  );
                  return (
                    <span
                      key={key}
                      title={`${key}: ${done ? "completed" : paused ? "paused" : "not completed"}`}
                    >
                      <i
                        className={done ? "done" : paused ? "paused" : ""}
                        style={done ? { background: habit.color } : {}}
                      />
                      <small>
                        {date.toLocaleDateString(undefined, {
                          weekday: "narrow",
                        })}
                      </small>
                    </span>
                  );
                })}
              </div>
            </div>
            <p className="habit-detail-kindness">
              {habit.days[endKey]?.done
                ? "You showed up for this today. Nice work."
                : habit.days[endKey]?.paused
                  ? "You gave yourself room today. You can pick this back up whenever you're ready."
                  : "A missed day does not erase your progress. Start again when it feels right."}
            </p>
            {noteHistory.length > 0 && (
              <div className="habit-detail-notes">
                <h3>Recent reflections</h3>
                {noteHistory.slice(0, 3).map(([date, day]) => (
                  <p key={date}>
                    <time dateTime={date}>{date}</time>
                    {day.note}
                  </p>
                ))}
              </div>
            )}
            {reasons.size > 0 && (
              <div className="habit-detail-reasons">
                <h3>Missed-day reasons</h3>
                {[...reasons.entries()]
                  .sort(
                    ([, datesA], [, datesB]) => datesB.length - datesA.length,
                  )
                  .map(([reason, datesForReason]) => (
                    <p key={reason}>
                      <span>{reason}</span>
                      <strong>{datesForReason.length}</strong>
                    </p>
                  ))}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="subtle-btn"
                onClick={() => {
                  onSelectDay(endKey);
                  setDetailOpen(false);
                }}
              >
                Add today’s note
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  onEdit(habit);
                  setDetailOpen(false);
                }}
              >
                Edit habit
              </button>
            </footer>
          </section>
        </div>
      )}
    </article>
  );
}

function AiFlashcardLibrary({ study, onUpdate, onNavigate }) {
  const [editingFlashcard, setEditingFlashcard] = useState(null);
  const [flashcardDraft, setFlashcardDraft] = useState({
    question: "",
    answer: "",
  });
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementMessage, setReplacementMessage] = useState("");
  const [replacementError, setReplacementError] = useState("");
  const [pendingReplacement, setPendingReplacement] = useState(null);
  const replacementCancelledRef = useRef(false);
  const cards = (study.flashcards || []).filter((card) => card.source);
  const sourceKeyForCard = (card) => card.sourceId || `legacy:${card.source}`;
  const sources = [
    ...cards
      .reduce((groups, card) => {
        const sourceId = sourceKeyForCard(card);
        const group = groups.get(sourceId) || {
          id: sourceId,
          name: card.source,
          cards: [],
        };
        group.cards.push(card);
        groups.set(sourceId, group);
        return groups;
      }, new Map())
      .values(),
  ];

  const saveCard = (cardId) => {
    if (!flashcardDraft.question.trim() || !flashcardDraft.answer.trim())
      return;
    onUpdate({
      flashcards: (study.flashcards || []).map((card) =>
        card.id === cardId
          ? {
              ...card,
              question: flashcardDraft.question.trim(),
              answer: flashcardDraft.answer.trim(),
            }
          : card,
      ),
    });
    setEditingFlashcard(null);
  };

  const restoreCards = (removedCards, message) => {
    onUpdate((current) => {
      const currentIds = new Set(current.flashcards.map((card) => card.id));
      return {
        flashcards: [
          ...current.flashcards,
          ...removedCards.filter((card) => !currentIds.has(card.id)),
        ],
      };
    }, message);
  };

  const removeCard = (card) => {
    onUpdate(
      (current) => ({
        flashcards: current.flashcards.filter((item) => item.id !== card.id),
      }),
      "AI-created card removed",
      {
        label: "Undo",
        onClick: () => restoreCards([card], "Card removal undone"),
      },
    );
    if (editingFlashcard === card.id) setEditingFlashcard(null);
  };

  const removeSource = (source) => {
    const removedCards = source.cards;
    const sourceId = source.id;
    onUpdate(
      (current) => ({
        flashcards: current.flashcards.filter(
          (card) => sourceKeyForCard(card) !== sourceId,
        ),
      }),
      `${source.name} and its cards removed`,
      {
        label: "Undo",
        onClick: () => restoreCards(removedCards, "Source removal undone"),
      },
    );
    setEditingFlashcard(null);
  };

  const replaceSource = async (source, file) => {
    replacementCancelledRef.current = false;
    setPendingReplacement(null);
    setReplacementError("");
    setReplacementMessage("Reading your notes on this device…");
    setReplacementBusy(true);
    try {
      const text = await extractStudyText(file);
      if (replacementCancelledRef.current) return;
      if (!text.trim())
        throw new Error("No readable text was found in that file.");
      const result = await generateStudyCardsOnDevice(
        text,
        10,
        setReplacementMessage,
      );
      if (replacementCancelledRef.current) return;
      if (!result.cards.length)
        throw new Error("No flashcards could be created from that file.");
      const firstCard = source.cards[0];
      const generatedCards = result.cards.map((card) => ({
        ...card,
        id: createId(),
        subject: firstCard.subject || study.selectedSubject || study.subject,
        deck:
          firstCard.deck ||
          firstCard.subject ||
          study.selectedSubject ||
          study.subject,
        tags: [],
        rating: null,
        dueAt: todayKey(),
        source: file.name,
        sourceId: source.id,
      }));
      setPendingReplacement({
        sourceId: source.id,
        oldSourceName: source.name,
        fileName: file.name,
        cards: generatedCards,
        truncated: result.truncated,
      });
      setReplacementMessage("");
    } catch (error) {
      if (replacementCancelledRef.current) return;
      console.error(
        "Could not replace the source for AI-created study cards.",
        error,
      );
      setReplacementError(
        error instanceof Error
          ? error.message
          : "Could not create replacement cards on this device.",
      );
      setReplacementMessage("");
    } finally {
      setReplacementBusy(false);
    }
  };

  const confirmSourceReplacement = () => {
    if (!pendingReplacement) return;
    const { sourceId, cards: replacementCards } = pendingReplacement;
    const previousCards = (study.flashcards || []).filter(
      (card) => sourceKeyForCard(card) === sourceId,
    );
    const replacementIds = new Set(replacementCards.map((card) => card.id));
    onUpdate(
      (current) => ({
        flashcards: [
          ...current.flashcards.filter(
            (card) => sourceKeyForCard(card) !== sourceId,
          ),
          ...replacementCards,
        ],
      }),
      `${pendingReplacement.oldSourceName} replaced with ${pendingReplacement.fileName}`,
      {
        label: "Undo",
        onClick: () =>
          onUpdate(
            (current) => ({
              flashcards: [
                ...current.flashcards.filter(
                  (card) => !replacementIds.has(card.id),
                ),
                ...previousCards.filter(
                  (oldCard) =>
                    !current.flashcards.some((card) => card.id === oldCard.id),
                ),
              ],
            }),
            "Source replacement undone",
          ),
      },
    );
    setPendingReplacement(null);
    setReplacementMessage("");
  };

  return (
    <div className="section feature-card ai-cards-page">
      <PageHeading
        eyebrow="YOUR STUDY SPACE"
        title="AI-created cards"
        subtitle="Review and edit cards generated from your notes."
        aside={
          <button
            type="button"
            className="subtle-btn"
            onClick={() => onNavigate("flashcards")}
          >
            <Icon name="ArrowLeft" size={16} /> Back to flashcards
          </button>
        }
      />
      {sources.length > 0 && (
        <section className="ai-card-sources" aria-label="Source files">
          <div className="ai-card-sources-heading">
            <h2>Source files</h2>
            <p>
              Files are processed on this device and aren’t stored. Removing a
              source removes its generated cards.
            </p>
          </div>
          {sources.map((source) => (
            <article className="ai-card-source" key={source.id}>
              <div>
                <strong>{source.name}</strong>
                <small>
                  {source.cards.length} AI-created card
                  {source.cards.length === 1 ? "" : "s"}
                </small>
              </div>
              <label
                className={`text-button ai-card-source-replace${replacementBusy || pendingReplacement ? " disabled" : ""}`}
              >
                Replace source
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                  aria-label={`Choose replacement for ${source.name}`}
                  disabled={replacementBusy || Boolean(pendingReplacement)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void replaceSource(source, file);
                  }}
                />
              </label>
              <button
                type="button"
                className="text-button"
                disabled={replacementBusy || Boolean(pendingReplacement)}
                onClick={() => removeSource(source)}
              >
                Remove source
              </button>
            </article>
          ))}
          {replacementBusy && (
            <div className="ai-source-status" role="status" aria-live="polite">
              <span>{replacementMessage}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  replacementCancelledRef.current = true;
                  cancelStudyCardGeneration();
                  setReplacementMessage("Source replacement cancelled.");
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {replacementMessage && !replacementBusy && (
            <p className="ai-source-status" role="status">
              {replacementMessage}
            </p>
          )}
          {replacementError && (
            <p className="file-import-error" role="alert">
              {replacementError}
            </p>
          )}
          {pendingReplacement && (
            <section
              className="import-preview"
              aria-labelledby="source-replacement-preview-title"
            >
              <h3 id="source-replacement-preview-title">
                Replace {pendingReplacement.oldSourceName}?
              </h3>
              <p>
                {pendingReplacement.cards.length} cards will be generated from{" "}
                {pendingReplacement.fileName} and replace the current source
                cards.
              </p>
              {pendingReplacement.truncated && (
                <p>Only the first sections of the notes were analyzed.</p>
              )}
              <ul>
                {pendingReplacement.cards.slice(0, 3).map((card) => (
                  <li key={card.id}>
                    <strong>{card.question}</strong> — {card.answer}
                  </li>
                ))}
                {pendingReplacement.cards.length > 3 && (
                  <li>And {pendingReplacement.cards.length - 3} more cards.</li>
                )}
              </ul>
              <div className="modal-actions">
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => setPendingReplacement(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={confirmSourceReplacement}
                >
                  Replace source cards
                </button>
              </div>
            </section>
          )}
        </section>
      )}
      {cards.length ? (
        <section className="ai-card-library" aria-label="AI-created cards">
          {cards.map((card) => (
            <article className="ai-card-library-item" key={card.id}>
              {editingFlashcard === card.id ? (
                <>
                  <input
                    value={flashcardDraft.question}
                    aria-label="Edit AI card question"
                    onChange={(event) =>
                      setFlashcardDraft((draft) => ({
                        ...draft,
                        question: event.target.value,
                      }))
                    }
                  />
                  <textarea
                    value={flashcardDraft.answer}
                    aria-label="Edit AI card answer"
                    onChange={(event) =>
                      setFlashcardDraft((draft) => ({
                        ...draft,
                        answer: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="text-button"
                    disabled={
                      !flashcardDraft.question.trim() ||
                      !flashcardDraft.answer.trim()
                    }
                    onClick={() => saveCard(card.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditingFlashcard(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <strong>{card.question}</strong>
                  <p>{card.answer}</p>
                  <small>
                    {card.subject ? card.subject : ""}
                    {card.deck && card.deck !== card.subject
                      ? ` · ${card.deck}`
                      : ""}
                  </small>
                  <div className="ai-card-library-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingFlashcard(card.id);
                        setFlashcardDraft({
                          question: card.question,
                          answer: card.answer,
                        });
                      }}
                    >
                      Edit / replace
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => removeCard(card)}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>
      ) : (
        <div className="friendly-empty">
          <strong>No AI-created cards yet.</strong>
          <p>
            Create cards from a document in Flashcards and they’ll appear here.
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onNavigate("flashcards")}
          >
            Go to flashcards
          </button>
        </div>
      )}
    </div>
  );
}

function StudyCard({
  study,
  onUpdate,
  onSession,
  toast,
  toolsOnly = false,
  onNavigate,
  onAddTask,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [studyTab, setStudyTab] = useState("plan");
  const [newSubject, setNewSubject] = useState("");
  const [cardSubject, setCardSubject] = useState(
    study.selectedSubject || study.subject,
  );
  const [cardDeck, setCardDeck] = useState(
    study.selectedSubject || study.subject,
  );
  const [selectedStudySetId, setSelectedStudySetId] = useState(
    study.sets?.[0]?.id || "",
  );
  const [tagDraft, setTagDraft] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [cramMode, setCramMode] = useState(false);
  const [scheduleSubject, setScheduleSubject] = useState(
    study.selectedSubject || study.subject,
  );
  const [scheduleDay, setScheduleDay] = useState("Monday");
  const [scheduleTime, setScheduleTime] = useState("19:00");
  const [scheduleMinutes, setScheduleMinutes] = useState(60);
  const [topicDraft, setTopicDraft] = useState("");
  const [focusItemDraft, setFocusItemDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [flashcardSessionSize, setFlashcardSessionSize] = useState(
    study.studyToolPrefs?.flashcardSessionSize || 10,
  );
  const [flashcardSessionIds, setFlashcardSessionIds] = useState([]);
  const [flashcardSessionStarted, setFlashcardSessionStarted] = useState(false);
  const [flashcardsReviewed, setFlashcardsReviewed] = useState(0);
  const [flashcardMode, setFlashcardMode] = useState("cards");
  const [quizType, setQuizType] = useState(
    study.studyToolPrefs?.quizType || "multiple-choice",
  );
  const [quizCombination, setQuizCombination] = useState([
    "multiple-choice",
    "identification",
  ]);
  const [quizQuestionCount, setQuizQuestionCount] = useState(
    study.studyToolPrefs?.quizQuestionCount || 10,
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    study.studyToolPrefs?.shuffleQuestions !== false,
  );
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizChoice, setQuizChoice] = useState("");
  const studyShortcutsRef = useRef({});
  const [quizAnswerInput, setQuizAnswerInput] = useState("");
  const [quizScore, setQuizScore] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSessionCards, setQuizSessionCards] = useState([]);
  const [missedQuizCards, setMissedQuizCards] = useState([]);
  const [trueFalseFlags, setTrueFalseFlags] = useState([]);
  const [matchingAnswerCards, setMatchingAnswerCards] = useState([]);
  const [matchingSelectedQuestion, setMatchingSelectedQuestion] = useState("");
  const [matchingAnswers, setMatchingAnswers] = useState({});
  const [matchingEvaluated, setMatchingEvaluated] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const studyAiCancelledRef = useRef(false);
  const [fileError, setFileError] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [pendingAiImport, setPendingAiImport] = useState(null);
  const [aiCardCount, setAiCardCount] = useState(10);
  const csvImportRef = useRef(null);
  const [pendingCsvImport, setPendingCsvImport] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [retryStudyFile, setRetryStudyFile] = useState(null);
  const [weakFocus, setWeakFocus] = useState(
    Boolean(study.studyToolPrefs?.weakFocus),
  );
  const handledTimerEndRef = useRef(null);
  const sessionSummary =
    study.timerMode === "break" && !study.timerEnd
      ? {
          minutes: study.workMinutes || 25,
          subject: study.selectedSubject || study.subject,
        }
      : null;
  const running = Boolean(study.timerEnd);
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (study.timerEnd && study.timerEnd <= now) {
      if (handledTimerEndRef.current === study.timerEnd) return;
      handledTimerEndRef.current = study.timerEnd;
      if (study.timerMode === "break") {
        onUpdate({
          timerEnd: null,
          timerStartedAt: null,
          timerMode: "focus",
          timer: (study.workMinutes || 25) * 60,
        });
        toast("Break complete");
      } else {
        onSession(
          study.workMinutes || 25,
          study.selectedSubject,
          study.sessionNote || "",
          {
            timerEnd: null,
            timerStartedAt: null,
            timerMode: "break",
            timer: (study.breakMinutes || 5) * 60,
          },
        );
        toast("Focus session complete");
      }
    }
  }, [
    now,
    study.timerEnd,
    study.timerMode,
    study.breakMinutes,
    study.workMinutes,
    study.selectedSubject,
    study.subject,
    study.sessionNote,
    onUpdate,
    onSession,
    toast,
  ]);
  const seconds = study.timerEnd
    ? Math.max(0, Math.ceil((study.timerEnd - now) / 1000))
    : study.timer || (study.workMinutes || 25) * 60;
  const hours = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const examDays = study.exam
    ? Math.max(
        0,
        Math.ceil(
          (dateFromKey(study.exam) - dateFromKey(todayKey())) / 86400000,
        ),
      )
    : null;
  const addSubject = () => {
    const name = newSubject.trim();
    if (
      !name ||
      (study.subjects || []).some(
        (subject) => subject.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    onUpdate({
      subjects: [
        ...study.subjects,
        { name, goal: 5, color: "#38c995", units: 3 },
      ],
      selectedSubject: name,
    });
    setNewSubject("");
    setCardSubject(name);
    setCardDeck(name);
    toast(`${name} added to your subjects`);
  };
  const parseTags = (value) => {
    const seen = new Set();
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => {
        const key = tag.toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const selectedStudySet =
    (study.sets || []).find((set) => set.id === selectedStudySetId) ||
    study.sets?.[0] ||
    null;
  const addCardsToStudySet = (cards, message) => {
    if (!selectedStudySet) {
      toast("Create a study set first.");
      return false;
    }
    const added = cards.map(
      ({
        id: _id,
        subject: _subject,
        deck: _deck,
        tags: _tags,
        rating: _rating,
        dueAt: _dueAt,
        source: _source,
        sourceId: _sourceId,
        ...card
      }) => ({
        ...card,
        id: createId(),
      }),
    );
    onUpdate(
      (current) => ({
        sets:
          current.sets?.map((set) =>
            set.id === selectedStudySet.id
              ? {
                  ...set,
                  cards: [...(set.cards || []), ...added],
                  updatedAt: new Date().toISOString(),
                }
              : set,
          ) || current.sets,
      }),
      message,
    );
    return added.map((card) => card.id);
  };
  const addQuizToStudySet = (questionsToAdd, message) => {
    if (!selectedStudySet) {
      toast("Create a study set first.");
      return false;
    }
    const added = questionsToAdd.map((question) => ({
      ...question,
      id: createId(),
    }));
    const addedIds = new Set(added.map((question) => question.id));
    onUpdate(
      (current) => ({
        sets:
          current.sets?.map((set) =>
            set.id === selectedStudySet.id
              ? {
                  ...set,
                  quiz: [...(set.quiz || []), ...added],
                  updatedAt: new Date().toISOString(),
                }
              : set,
          ) || current.sets,
      }),
      message,
      {
        label: "Undo",
        onClick: () =>
          onUpdate(
            (current) => ({
              sets:
                current.sets?.map((set) =>
                  set.id === selectedStudySet.id
                    ? {
                        ...set,
                        quiz: (set.quiz || []).filter(
                          (question) => !addedIds.has(question.id),
                        ),
                      }
                    : set,
                ) || current.sets,
            }),
            "AI quiz questions removed",
          ),
      },
    );
    return true;
  };
  const addFlashcard = () => {
    if (!question.trim() || !answer.trim()) return;
    if (
      !addCardsToStudySet(
        [
          {
            question: question.trim(),
            answer: answer.trim(),
            tags: parseTags(tagDraft),
          },
        ],
        "Flashcard added to study set",
      )
    )
      return;
    setQuestion("");
    setAnswer("");
    setTagDraft("");
    setShowAnswer(false);
    toast("Flashcard added");
  };
  const processStudyFile = async (file, destination = "cards") => {
    studyAiCancelledRef.current = false;
    setFileError("");
    setFileMessage("");
    setAiMessage("Reading your notes on this device…");
    setFileBusy(true);
    try {
      const text = await extractStudyText(file);
      if (studyAiCancelledRef.current) return;
      if (!text.trim())
        throw new Error("No readable text was found in that file.");
      const result = await generateStudyCardsOnDevice(
        text,
        destination === "quiz"
          ? Math.max(4, Number(aiCardCount) || 10)
          : aiCardCount,
        setAiMessage,
      );
      const generatedCards = result.cards.filter(
        (card) =>
          String(card.question || "").trim() &&
          String(card.answer || "").trim(),
      );
      if (!generatedCards.length)
        throw new Error(
          "No usable question and answer pairs were created from that document.",
        );
      if (destination === "quiz") {
        const answerPool = [
          ...generatedCards.map((card) => card.answer.trim()),
          ...(selectedStudySet?.cards || []).map((card) => card.answer.trim()),
          ...(selectedStudySet?.quiz || []).flatMap(
            (item) => item.options || [],
          ),
        ].reduce((answers, rawAnswer) => {
          const answer = String(rawAnswer || "").trim();
          if (
            answer &&
            !answers.some(
              (existing) =>
                existing.toLocaleLowerCase() === answer.toLocaleLowerCase(),
            )
          ) {
            answers.push(answer);
          }
          return answers;
        }, []);
        const questionsToAdd = generatedCards
          .flatMap((card) => {
            const correctAnswer = card.answer.trim();
            const distractors = answerPool
              .filter(
                (option) =>
                  option.toLocaleLowerCase() !==
                  correctAnswer.toLocaleLowerCase(),
              )
              .slice(0, 3);
            if (distractors.length < 3) return [];
            const options = shuffled([correctAnswer, ...distractors]);
            return [
              {
                question: card.question.trim(),
                options,
                correctIndex: options.indexOf(correctAnswer),
                explanation: correctAnswer,
              },
            ];
          })
          .filter((item) => item.question);
        if (questionsToAdd.length === 0) {
          throw new Error(
            "Could not create quiz questions with four distinct answer choices. Try a longer document or add more flashcards first.",
          );
        }
        if (
          !addQuizToStudySet(
            questionsToAdd,
            `${questionsToAdd.length} AI quiz questions added to study set`,
          )
        )
          return;
        setFileMessage(
          `${questionsToAdd.length} AI-created quiz questions added to ${selectedStudySet.subject}.`,
        );
        setAiMessage("");
        setRetryStudyFile(null);
        return;
      }
      const sourceId = createId();
      const generated = generatedCards.map((card) => ({
        ...card,
        id: createId(),
        subject: cardSubject,
        deck: cardDeck,
        tags: [],
        rating: null,
        dueAt: todayKey(),
        source: file.name,
        sourceId,
        selected: true,
      }));
      const importedCards = generated.map(
        ({ selected: _selected, ...card }) => card,
      );
      const addedIds = addCardsToStudySet(
        importedCards,
        `${importedCards.length} flashcards added to study set`,
      );
      if (!addedIds) return;
      setPendingAiImport(null);
      setFlashcardMode("cards");
      setQuizStarted(false);
      setFileMessage(`${importedCards.length} AI-created cards added.`);
      setAiMessage("");
      setRetryStudyFile(null);
    } catch (error) {
      if (studyAiCancelledRef.current) return;
      console.error("Could not generate study cards with on-device AI.", error);
      setFileError(
        error instanceof Error
          ? error.message
          : "Could not create study questions on this device.",
      );
      setAiMessage("");
    } finally {
      setFileBusy(false);
    }
  };
  const importStudyFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setRetryStudyFile(file);
    await processStudyFile(file);
  };
  const importStudyQuizFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!selectedStudySet) {
      toast("Create a study set first.");
      return;
    }
    setRetryStudyFile(file);
    await processStudyFile(file, "quiz");
  };
  const importFlashcards = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseFlashcardCsvWithReport(await file.text());
      if (parsed.error) {
        toast(parsed.error);
        return;
      }
      const deduplicated = deduplicateFlashcards(
        parsed.cards,
        study.flashcards || [],
      );
      if (!parsed.cards.length && !parsed.skipped.length) {
        toast(
          "No cards found. Use Question and Answer columns or two-column rows.",
        );
        return;
      }
      setPendingCsvImport({
        cards: deduplicated.cards,
        skipped: [
          ...parsed.skipped,
          ...deduplicated.duplicates.map((card) => ({
            reason: `Duplicate card skipped: ${card.question}`,
          })),
        ],
        fileName: file.name,
        parsedCount: parsed.cards.length,
      });
    } catch (error) {
      console.error("Could not import flashcards.", error);
      toast("Could not read that file. Try a CSV or Anki TSV export.");
    }
  };
  const confirmFlashcardImport = () => {
    if (!pendingCsvImport?.cards.length) return;
    const cards = pendingCsvImport.cards.map((card) => ({
      ...card,
      id: createId(),
      subject: cardSubject,
      deck: cardDeck,
      tags: card.tags || [],
      rating: null,
      dueAt: todayKey(),
    }));
    if (
      !addCardsToStudySet(
        cards,
        `${cards.length} flashcard${cards.length === 1 ? "" : "s"} added to study set`,
      )
    )
      return;
    setPendingCsvImport(null);
  };
  const confirmAiImport = () => {
    if (
      !pendingAiImport?.cards.some(
        (card) =>
          card.selected !== false && card.question.trim() && card.answer.trim(),
      )
    )
      return;
    const cards = pendingAiImport.cards
      .filter(
        (card) =>
          card.selected !== false && card.question.trim() && card.answer.trim(),
      )
      .map(({ selected: _selected, ...card }) => card);
    const importedIds = new Set(cards.map((card) => card.id));
    onUpdate(
      (current) => ({
        flashcards: [
          ...current.flashcards,
          ...deduplicateFlashcards(cards, current.flashcards).cards,
        ],
      }),
      `${cards.length} flashcards created`,
      {
        label: "Undo",
        onClick: () =>
          onUpdate(
            (current) => ({
              flashcards: current.flashcards.filter(
                (card) => !importedIds.has(card.id),
              ),
            }),
            "Flashcard generation undone",
          ),
      },
    );
    setFlashcardsReviewed(0);
    setFlashcardMode("cards");
    setQuizStarted(false);
    setQuizIndex(0);
    setQuizScore(0);
    setQuizChoice("");
    setPendingAiImport(null);
  };
  const readyAiCardCount =
    pendingAiImport?.cards.filter(
      (card) =>
        card.selected !== false && card.question.trim() && card.answer.trim(),
    ).length || 0;
  const rateFlashcard = (id, rating) => {
    const quality = { hard: 2, good: 4, easy: 5 }[rating];
    const card = (study.flashcards || []).find((item) => item.id === id);
    if (!card) return;
    const review = scheduleSpacedReview(card, quality, todayKey());
    onUpdate({
      flashcards: (study.flashcards || []).map((card) =>
        card.id === id
          ? {
              ...card,
              rating,
              ...review,
              correctCount:
                Number(card.correctCount || 0) + (rating === "hard" ? 0 : 1),
              missCount:
                Number(card.missCount || 0) + (rating === "hard" ? 1 : 0),
            }
          : card,
      ),
    });
    setFlashcardsReviewed((count) => count + 1);
    setShowAnswer(false);
    toast(`Card reviewed · next review ${review.dueAt}`);
  };
  const saveToolPreferences = (patch) => {
    onUpdate({
      studyToolPrefs: {
        ...study.studyToolPrefs,
        ...patch,
      },
    });
  };
  const resetCardSession = () => {
    setShowAnswer(false);
    setFlashcardSessionStarted(false);
    setFlashcardSessionIds([]);
    setFlashcardsReviewed(0);
    setQuizStarted(false);
    setQuizIndex(0);
    setQuizScore(0);
    setQuizChoice("");
    setQuizAnswerInput("");
    setQuizSessionCards([]);
    setMissedQuizCards([]);
    setMatchingAnswers({});
    setMatchingEvaluated(false);
  };
  const subjectDeckCards = (study.flashcards || [])
    .filter(
      (card) =>
        card.subject === cardSubject &&
        (card.deck || card.subject) === cardDeck,
    )
    .sort((a, b) => {
      const aDue = a.dueAt || todayKey();
      const bDue = b.dueAt || todayKey();
      return aDue.localeCompare(bDue);
    });
  const tagOptions = [
    ...new Set(subjectDeckCards.flatMap((card) => card.tags || [])),
  ].sort();
  const studySetOptions = (study.sets || []).map((set) => [
    set.id,
    set.subject,
  ]);
  const subjectCards = subjectDeckCards.filter(
    (card) => !selectedTag || (card.tags || []).includes(selectedTag),
  );
  const regularDueCards = subjectCards.filter(
    (card) => !card.dueAt || card.dueAt <= todayKey(),
  );
  const dueSoonEnd = dateFromKey(todayKey());
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);
  const dueSoonCards = subjectCards.filter(
    (card) => card.dueAt > todayKey() && card.dueAt <= dateKey(dueSoonEnd),
  );
  const dueCards = cramMode ? subjectCards : regularDueCards;
  const studySetCountLabel = selectedStudySet
    ? cramMode
      ? `All ${subjectCards.length} ${subjectCards.length === 1 ? "card" : "cards"} in ${selectedStudySet.subject}`
      : `${regularDueCards.length} due today · ${dueSoonCards.length} due soon · ${subjectCards.length} in ${selectedStudySet.subject}`
    : "No study set selected";
  const flashcardTarget = flashcardSessionStarted
    ? flashcardSessionIds.length
    : Math.min(flashcardSessionSize, dueCards.length);
  const flashcardSessionComplete =
    flashcardSessionStarted && flashcardsReviewed >= flashcardTarget;
  const activeCard =
    flashcardSessionStarted && !flashcardSessionComplete
      ? dueCards.find(
          (card) => card.id === flashcardSessionIds[flashcardsReviewed],
        )
      : null;
  const quizCards = selectedStudySet
    ? selectedStudySet.quiz?.length
      ? selectedStudySet.quiz.map((item) => ({
          ...item,
          answer: item.options[item.correctIndex],
        }))
      : selectedStudySet.cards || []
    : dueCards;
  const uniqueAnswerCards = quizCards.filter(
    (card, index, cards) =>
      cards.findIndex(
        (candidate) =>
          normalizeQuizAnswer(candidate.answer) ===
          normalizeQuizAnswer(card.answer),
      ) === index,
  );
  const activeQuizType =
    quizType === "combo"
      ? quizCombination[quizIndex % quizCombination.length]
      : quizType === "all"
        ? ["multiple-choice", "identification", "true-false"][quizIndex % 3]
        : quizType;
  const quizAvailableCards =
    quizType === "identification" || quizType === "all" || quizType === "combo"
      ? quizCards
      : uniqueAnswerCards;
  const quizTarget = quizStarted
    ? quizSessionCards.length
    : Math.min(quizQuestionCount, quizAvailableCards.length);
  const activeQuizCard = quizSessionCards[quizIndex] || null;
  const activeQuizDistractor = activeQuizCard
    ? quizCards.find(
        (card) =>
          card.id !== activeQuizCard.id &&
          card.answer !== activeQuizCard.answer,
      )
    : null;
  const trueFalseIsTrue = trueFalseFlags[quizIndex] ?? true;
  const trueFalseAnswer = trueFalseIsTrue
    ? activeQuizCard?.answer
    : activeQuizDistractor?.answer;
  const quizAnswerIsCorrect =
    activeQuizType === "identification"
      ? normalizeQuizAnswer(quizChoice) ===
        normalizeQuizAnswer(activeQuizCard?.answer || "")
      : activeQuizType === "true-false"
        ? (quizChoice === "True") === trueFalseIsTrue
        : quizChoice === activeQuizCard?.answer;
  const quizCorrectionText =
    activeQuizType === "true-false"
      ? `Not quite. The correct choice is ${trueFalseIsTrue ? "True" : "False"}. The answer is ${activeQuizCard?.answer}.`
      : `Not quite. The answer is ${activeQuizCard?.answer}.`;
  const quizChoices = activeQuizCard
    ? Array.isArray(activeQuizCard.options) && activeQuizCard.options.length
      ? activeQuizCard.options
      : [
          ...uniqueAnswerCards
            .filter((card) => card.id !== activeQuizCard.id)
            .map((card) => card.answer)
            .slice(0, 3),
          activeQuizCard.answer,
        ].sort((a, b) => a.localeCompare(b))
    : [];
  const canStartQuiz =
    quizAvailableCards.length > 0 &&
    (quizType === "identification" ||
      quizType === "all" ||
      quizType === "combo" ||
      quizAvailableCards.length > 1);
  const updateQuizReviews = (reviewedCards, incorrectIds) => {
    if (selectedStudySet?.quiz?.length) {
      const reviewedIds = new Set(reviewedCards.map((card) => card.id));
      onUpdate((current) => ({
        sets:
          current.sets?.map((set) =>
            set.id === selectedStudySet.id
              ? {
                  ...set,
                  quiz: (set.quiz || []).map((item) =>
                    !reviewedIds.has(item.id)
                      ? item
                      : {
                          ...item,
                          correctCount:
                            Number(item.correctCount || 0) +
                            (incorrectIds.has(item.id) ? 0 : 1),
                          missCount:
                            Number(item.missCount || 0) +
                            (incorrectIds.has(item.id) ? 1 : 0),
                        },
                  ),
                }
              : set,
          ) || current.sets,
      }));
      return;
    }
    onUpdate({
      flashcards: (study.flashcards || []).map((card) => {
        const reviewed = reviewedCards.find((item) => item.id === card.id);
        if (!reviewed) return card;
        const missed = incorrectIds.has(card.id);
        return {
          ...card,
          ...scheduleSpacedReview(card, missed ? 1 : 4, todayKey()),
          correctCount: Number(card.correctCount || 0) + (missed ? 0 : 1),
          missCount: Number(card.missCount || 0) + (missed ? 1 : 0),
        };
      }),
    });
  };
  const startFlashcardSession = () => {
    const sessionCards = dueCards.slice(0, flashcardSessionSize);
    const orderedCards = shuffleQuestions
      ? shuffled(sessionCards)
      : sessionCards;
    setFlashcardSessionIds(orderedCards.map((card) => card.id));
    setFlashcardSessionStarted(true);
    setFlashcardsReviewed(0);
    setShowAnswer(false);
  };
  const skipFlashcard = () => {
    setFlashcardsReviewed((count) => count + 1);
    setShowAnswer(false);
  };
  const rememberMissed = (cards) => {
    setMissedQuizCards((missed) => [
      ...missed,
      ...cards.filter((card) => !missed.some((item) => item.id === card.id)),
    ]);
  };
  const startQuiz = (cardsToRetry = null) => {
    const weakCards = [...quizAvailableCards]
      .filter((card) => Number(card.missCount || 0) > 0)
      .sort((a, b) => Number(b.missCount || 0) - Number(a.missCount || 0));
    const sourceCards =
      cardsToRetry ||
      (weakFocus && weakCards.length
        ? [
            ...weakCards,
            ...quizAvailableCards.filter(
              (card) => !weakCards.some((weak) => weak.id === card.id),
            ),
          ].slice(0, quizQuestionCount)
        : quizAvailableCards.slice(0, quizQuestionCount));
    const sessionCards = shuffleQuestions
      ? shuffled(sourceCards)
      : [...sourceCards];
    setQuizSessionCards(sessionCards);
    setMatchingAnswerCards(
      quizType === "matching" ||
        (quizType === "combo" && quizCombination.includes("matching"))
        ? shuffled(sessionCards)
        : [],
    );
    setQuizIndex(0);
    setQuizScore(0);
    setQuizChoice("");
    setQuizAnswerInput("");
    setMissedQuizCards([]);
    setMatchingAnswers({});
    setMatchingEvaluated(false);
    setMatchingSelectedQuestion("");
    const flags = sessionCards.map((_, index) => index % 2 === 0);
    setTrueFalseFlags(shuffleQuestions ? shuffled(flags) : flags);
    setQuizStarted(true);
  };
  const retryMissedQuiz = () => startQuiz(missedQuizCards);
  const answerQuiz = (choice) => {
    if (quizChoice) return;
    setQuizChoice(choice);
    const isCorrect =
      activeQuizType === "identification"
        ? normalizeQuizAnswer(choice) ===
          normalizeQuizAnswer(activeQuizCard?.answer || "")
        : activeQuizType === "true-false"
          ? (choice === "True") === trueFalseIsTrue
          : choice === activeQuizCard?.answer;
    if (isCorrect) {
      setQuizScore((score) => score + 1);
    } else {
      rememberMissed([activeQuizCard].filter(Boolean));
    }
    if (activeQuizCard)
      updateQuizReviews(
        [activeQuizCard],
        new Set(isCorrect ? [] : [activeQuizCard.id]),
      );
  };
  const chooseMatchingAnswer = (answerId) => {
    if (!matchingSelectedQuestion || matchingEvaluated) return;
    setMatchingAnswers((pairs) => ({
      ...pairs,
      [matchingSelectedQuestion]: answerId,
    }));
    setMatchingSelectedQuestion("");
  };
  const checkMatchingAnswers = () => {
    const incorrectCards = quizSessionCards.filter(
      (card) => matchingAnswers[card.id] !== card.id,
    );
    const incorrectIds = new Set(incorrectCards.map((card) => card.id));
    updateQuizReviews(quizSessionCards, incorrectIds);
    setQuizScore(quizSessionCards.length - incorrectCards.length);
    rememberMissed(incorrectCards);
    setMatchingEvaluated(true);
  };
  const nextQuizQuestion = () => {
    setQuizChoice("");
    setQuizAnswerInput("");
    setQuizIndex(
      (index) =>
        index + (activeQuizType === "matching" ? quizSessionCards.length : 1),
    );
    setMatchingSelectedQuestion("");
    setMatchingAnswers({});
    setMatchingEvaluated(false);
  };
  useEffect(() => {
    studyShortcutsRef.current = {
      activeCard,
      answerQuiz,
      flashcardMode,
      nextQuizQuestion,
      quizChoice,
      quizChoices,
      quizStarted,
      quizType,
      rateFlashcard,
      showAnswer,
      skipFlashcard,
    };
  });
  useEffect(() => {
    const handleStudyShortcut = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      const shortcuts = studyShortcutsRef.current;
      if (shortcuts.flashcardMode === "cards" && shortcuts.activeCard) {
        if (event.code === "Space") {
          event.preventDefault();
          if (!shortcuts.showAnswer) setShowAnswer(true);
          return;
        }
        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          shortcuts.skipFlashcard();
          return;
        }
        if (shortcuts.showAnswer && ["1", "2", "3"].includes(event.key)) {
          event.preventDefault();
          shortcuts.rateFlashcard(
            shortcuts.activeCard.id,
            { 1: "hard", 2: "good", 3: "easy" }[event.key],
          );
        }
      } else if (shortcuts.flashcardMode === "quiz" && shortcuts.quizStarted) {
        if (
          shortcuts.quizType !== "matching" &&
          !shortcuts.quizChoice &&
          ["1", "2", "3", "4"].includes(event.key)
        ) {
          const availableChoices =
            shortcuts.quizType === "true-false"
              ? ["True", "False"]
              : shortcuts.quizChoices;
          const choice = availableChoices[Number(event.key) - 1];
          if (choice) {
            event.preventDefault();
            shortcuts.answerQuiz(choice);
          }
        } else if (shortcuts.quizChoice && event.key === "Enter") {
          event.preventDefault();
          shortcuts.nextQuizQuestion();
        }
      }
    };
    window.addEventListener("keydown", handleStudyShortcut);
    return () => window.removeEventListener("keydown", handleStudyShortcut);
  }, []);
  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const todayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(new Date(now));
  const currentTime = new Date(now).toTimeString().slice(0, 5);
  const todaysSchedule = (study.schedule || []).filter(
    (block) => block.day === todayName,
  );
  const todayStudyMinutes = (study.history || [])
    .filter((session) => session.date === todayKey())
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  const studyStreak = (() => {
    let days = 0;
    const date = dateFromKey(todayKey());
    while (true) {
      const key = dateKey(date);
      const minutes = (study.history || [])
        .filter((session) => session.date === key)
        .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
      if (minutes < 30) break;
      days += 1;
      date.setDate(date.getDate() - 1);
    }
    return days;
  })();
  const weekHistory = weekDays.map((day, index) => {
    const date = dateFromKey(weekStartKey());
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    const minutes = (study.history || [])
      .filter((session) => session.date === key)
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
    return { day: day.slice(0, 3), key, minutes };
  });
  const interclassSuggestions = weekDays.flatMap((day, index) => {
    const date = dateFromKey(weekStartKey());
    date.setDate(date.getDate() + index);
    return suggestInterclassStudyGaps({
      day,
      date: dateKey(date),
      classes: (study.classes || []).filter((item) =>
        classOccursOnDate(item, dateKey(date)),
      ),
      schedule: study.schedule || [],
    }).filter((gap) => gap.date !== todayKey() || gap.time > currentTime);
  });
  const addScheduleBlock = (suggestion) => {
    const block = suggestion
      ? {
          id: createId(),
          subject: scheduleSubject,
          day: suggestion.day,
          time: suggestion.time,
          minutes: Math.min(60, Math.floor(suggestion.minutes / 15) * 15),
          done: false,
        }
      : {
          id: createId(),
          subject: scheduleSubject,
          day: scheduleDay,
          time: scheduleTime,
          minutes: Number(scheduleMinutes) || 60,
          done: false,
        };
    onUpdate({
      schedule: [...(study.schedule || []), block],
    });
    toast("Study block added");
  };
  const toggleScheduleBlock = (id) =>
    onUpdate({
      schedule: (study.schedule || []).map((block) =>
        block.id === id ? { ...block, done: !block.done } : block,
      ),
    });
  const focusChecklist = study.focusChecklist || [];
  const addFocusItem = (event) => {
    event.preventDefault();
    const title = focusItemDraft.trim();
    if (!title) return;
    onUpdate({
      focusChecklist: [
        ...focusChecklist,
        { id: createId(), title, done: false },
      ],
    });
    setFocusItemDraft("");
  };
  const toggleFocusItem = (id) =>
    onUpdate({
      focusChecklist: focusChecklist.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    });
  const removeFocusItem = (id) =>
    onUpdate({
      focusChecklist: focusChecklist.filter((item) => item.id !== id),
    });
  const addTopic = () => {
    const title = topicDraft.trim();
    if (!title) return;
    onUpdate({
      subjects: (study.subjects || []).map((subject) =>
        subject.name === study.selectedSubject
          ? {
              ...subject,
              topics: [
                ...(subject.topics || []),
                { id: Date.now(), title, done: false },
              ],
            }
          : subject,
      ),
    });
    setTopicDraft("");
    toast("Topic added");
  };
  const toggleTopic = (topicId) =>
    onUpdate({
      subjects: (study.subjects || []).map((subject) =>
        subject.name === study.selectedSubject
          ? {
              ...subject,
              topics: (subject.topics || []).map((topic) =>
                topic.id === topicId ? { ...topic, done: !topic.done } : topic,
              ),
            }
          : subject,
      ),
    });
  const currentSubject = (study.subjects || []).find(
    (subject) => subject.name === study.selectedSubject,
  );
  const weakCards = subjectCards
    .filter((card) => Number(card.missCount || 0) > 0)
    .sort((a, b) => Number(b.missCount || 0) - Number(a.missCount || 0));
  const buildExamPlan = () => {
    const topics = (currentSubject?.topics || []).filter(
      (topic) => !topic.done,
    );
    if (!study.exam || !topics.length || examDays < 1) return;
    const nextSchedule = buildExamStudyPlan({
      topics,
      startKey: todayKey(),
      examKey: study.exam,
      classes: study.classes || [],
      schedule: study.schedule || [],
      subject: currentSubject.name,
    });
    if (!nextSchedule.length) {
      toast(
        "No available study slots before this exam. Adjust your schedule or add more time.",
      );
      return;
    }
    onUpdate({
      schedule: [
        ...(study.schedule || []).filter((block) => !block.examPlan),
        ...nextSchedule,
      ],
    });
    toast(
      nextSchedule.length < topics.length
        ? `Study plan created for ${nextSchedule.length} of ${topics.length} topics. ${topics.length - nextSchedule.length} could not be scheduled; add more days or study slots.`
        : `Study plan created for all ${topics.length} remaining topics`,
    );
  };
  const averageSession = study.history?.length
    ? Math.round(
        study.history.reduce(
          (sum, session) => sum + Number(session.minutes || 0),
          0,
        ) / study.history.length,
      )
    : 0;
  return (
    <div
      className={`section feature-card compact-study${toolsOnly ? " study-tools-page" : ""}`}
      id="study"
    >
      <PageHeading
        eyebrow={toolsOnly ? "STUDY TOOLS" : "STUDY PLAN"}
        title={toolsOnly ? "Flashcards & Quiz" : "Study planner"}
        subtitle={
          toolsOnly
            ? "Review cards, import an Anki deck, or take a quiz."
            : "Plan study sessions, exams, and weekly goals."
        }
        aside={
          toolsOnly ? (
            <button
              type="button"
              className="subtle-btn"
              onClick={() => onNavigate("study")}
            >
              <Icon name="ArrowLeft" size={16} /> Study planner
            </button>
          ) : null
        }
      />
      {!toolsOnly && (
        <div
          className="study-tool-tabs"
          role="tablist"
          aria-label="Study planner"
        >
          {[
            ["plan", "Plan"],
            ["topics", "Topics"],
            ["focus", "Focus"],
          ].map(([tab, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={studyTab === tab}
              className={studyTab === tab ? "selected" : ""}
              key={tab}
              onClick={() => setStudyTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!toolsOnly && studyTab === "plan" && (
        <section
          className="study-schedule-overview"
          aria-label="Study schedule overview"
        >
          <div className="study-today-plan">
            <strong>Today’s plan · {todayName}</strong>
            {todaysSchedule.length ? (
              todaysSchedule.map((block) => (
                <label
                  className={`schedule-block ${block.done ? "done" : ""}`}
                  key={block.id}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(block.done)}
                    onChange={() => toggleScheduleBlock(block.id)}
                  />
                  <span>
                    {block.time} · {block.subject} · {block.minutes} min
                  </span>
                  {block.done ? (
                    <small>Done</small>
                  ) : currentTime > block.time ? (
                    <small>Missed</small>
                  ) : null}
                </label>
              ))
            ) : (
              <p className="muted">No study blocks planned for today.</p>
            )}
          </div>
          <div className="study-week-schedule">
            {weekDays.map((day) => {
              const dayBlocks = (study.schedule || []).filter(
                (block) => block.day === day,
              );
              return (
                <div
                  className={`schedule-day${day === todayName ? " today" : ""}`}
                  key={day}
                >
                  <div className="schedule-day-heading">
                    <strong>{day}</strong>
                    {day === todayName && (
                      <span className="schedule-day-today">Today</span>
                    )}
                  </div>
                  <small className="schedule-day-count">
                    {dayBlocks.length}{" "}
                    {dayBlocks.length === 1 ? "study block" : "study blocks"}
                  </small>
                  <div className="schedule-day-content">
                    {dayBlocks.length ? (
                      dayBlocks.map((block) => (
                        <span key={block.id}>
                          {block.time} {block.subject}
                        </span>
                      ))
                    ) : (
                      <span className="schedule-day-empty">Free day</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {!toolsOnly && studyTab === "focus" && (
        <section
          className="study-focus-checklist"
          aria-labelledby="study-focus-checklist-title"
        >
          <div className="study-focus-checklist-heading">
            <div>
              <h3 id="study-focus-checklist-title">Focus checklist</h3>
              <span>
                {focusChecklist.filter((item) => item.done).length}/
                {focusChecklist.length} steps complete
              </span>
            </div>
            {focusChecklist.length > 0 && (
              <div
                className="study-focus-progress"
                role="progressbar"
                aria-label="Focus checklist progress"
                aria-valuemin="0"
                aria-valuemax={focusChecklist.length}
                aria-valuenow={
                  focusChecklist.filter((item) => item.done).length
                }
              >
                <i
                  style={{
                    width: `${(focusChecklist.filter((item) => item.done).length / focusChecklist.length) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
          {focusChecklist.map((item) => (
            <div
              className={`study-focus-checklist-item${item.done ? " done" : ""}`}
              key={item.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(item.done)}
                  onChange={() => toggleFocusItem(item.id)}
                />
                <span>{item.title}</span>
              </label>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove ${item.title}`}
                title={`Remove ${item.title}`}
                onClick={() => removeFocusItem(item.id)}
              >
                <Icon name="X" size={16} />
              </button>
            </div>
          ))}
          <form className="study-focus-checklist-form" onSubmit={addFocusItem}>
            <input
              value={focusItemDraft}
              onChange={(event) => setFocusItemDraft(event.target.value)}
              placeholder="Add a small next step"
              aria-label="New focus checklist item"
              maxLength={100}
            />
            <button
              type="submit"
              className="text-button"
              disabled={!focusItemDraft.trim()}
            >
              Add step
            </button>
          </form>
        </section>
      )}
      {!toolsOnly && studyTab === "focus" && (
        <div className="study-stat">
          <strong>{study.actual}h</strong>
          <span>/ {study.goal}h this week</span>
          <div className="study-bar">
            <i
              style={{
                width: `${study.goal ? Math.min(100, (study.actual / study.goal) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {!toolsOnly && studyTab === "plan" && examDays !== null && (
        <div className="study-exam-countdown">
          <strong>
            {study.subject} exam in {examDays} day{examDays === 1 ? "" : "s"}
          </strong>
          <span>{study.exam}</span>
          <button
            type="button"
            className="text-button"
            onClick={buildExamPlan}
            disabled={
              !currentSubject?.topics?.some((topic) => !topic.done) ||
              examDays < 1
            }
          >
            Build daily topic plan
          </button>
        </div>
      )}
      {!toolsOnly && studyTab === "plan" && (
        <details className="study-advanced-settings">
          <summary>Study settings</summary>
          <div className="study-controls">
            <label>
              Subject
              <select
                value={study.selectedSubject || study.subject}
                onChange={(event) =>
                  onUpdate({
                    selectedSubject: event.target.value,
                    subject: event.target.value,
                  })
                }
                aria-label="Study subject"
              >
                {(study.subjects || []).map((subject) => (
                  <option value={subject.name} key={subject.name}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Add subject
              <div className="study-inline-control">
                <input
                  value={newSubject}
                  onChange={(event) => setNewSubject(event.target.value)}
                  placeholder="e.g. Math"
                />
                <button
                  type="button"
                  onClick={addSubject}
                  disabled={!newSubject.trim()}
                >
                  Add
                </button>
              </div>
            </label>
            <label>
              Exam date
              <input
                type="date"
                value={study.exam}
                onChange={(event) => onUpdate({ exam: event.target.value })}
              />
            </label>
            <label>
              Weekly hours
              <input
                type="number"
                min="0"
                value={study.goal}
                onChange={(event) =>
                  onUpdate({ goal: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Focus minutes
              <input
                type="number"
                min="1"
                value={study.workMinutes}
                onChange={(event) =>
                  onUpdate({
                    workMinutes: Number(event.target.value) || 25,
                    timer: (Number(event.target.value) || 25) * 60,
                  })
                }
              />
            </label>
            <label>
              Break minutes
              <input
                type="number"
                min="1"
                value={study.breakMinutes}
                onChange={(event) =>
                  onUpdate({ breakMinutes: Number(event.target.value) || 5 })
                }
              />
            </label>
          </div>
        </details>
      )}
      {!toolsOnly && studyTab === "focus" && (
        <div className="pomodoro">
          <strong>{hours}</strong>
          <button
            className="primary-btn"
            onClick={() => {
              if (running) {
                onUpdate({
                  timer: seconds,
                  timerEnd: null,
                  timerStartedAt: null,
                });
              } else {
                onUpdate({
                  timerEnd: Date.now() + seconds * 1000,
                  timerStartedAt: Date.now(),
                  timerMode: study.timerMode || "focus",
                });
              }
            }}
          >
            {running
              ? "Pause"
              : study.timerMode === "break"
                ? "Start break"
                : "Start focus"}
          </button>
          <button
            className="subtle-btn"
            onClick={() => {
              const focusMode = study.timerMode !== "break";
              onUpdate({
                timer:
                  (focusMode
                    ? study.workMinutes || 25
                    : study.breakMinutes || 5) * 60,
                timerMode: focusMode ? "focus" : "break",
                timerEnd: null,
                timerStartedAt: null,
              });
            }}
          >
            Reset
          </button>
        </div>
      )}
      {sessionSummary && (
        <div className="study-session-complete-backdrop">
          <section
            className="study-session-complete"
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-session-complete-title"
            onKeyDown={(event) => {
              if (event.key === "Escape")
                onUpdate({
                  timerMode: "focus",
                  timer: (study.workMinutes || 25) * 60,
                });
              else trapDialogFocus(event);
            }}
          >
            <div>
              <p className="eyebrow">FOCUS SESSION COMPLETE</p>
              <strong id="study-session-complete-title">
                {sessionSummary.minutes} minutes on {sessionSummary.subject}
              </strong>
              <span>Take a short reset before your next focus block.</span>
            </div>
            <button
              type="button"
              className="primary-btn"
              autoFocus
              onClick={() => {
                const startedAt = Date.now();
                const breakSeconds =
                  Math.max(1, Number(study.breakMinutes) || 5) * 60;
                onUpdate({
                  timer: breakSeconds,
                  timerEnd: startedAt + breakSeconds * 1000,
                  timerStartedAt: startedAt,
                  timerMode: "break",
                });
              }}
            >
              Start {study.breakMinutes || 5}-min break
            </button>
            <button
              type="button"
              className="subtle-btn"
              onClick={() =>
                onUpdate({
                  timerMode: "focus",
                  timer: (study.workMinutes || 25) * 60,
                })
              }
            >
              Dismiss
            </button>
          </section>
        </div>
      )}
      {!toolsOnly && studyTab === "focus" && (
        <div className="study-focus-panel">
          <div className="feature-line">
            <span>{study.sessions} focus sessions</span>
            <button
              onClick={() => {
                onSession(
                  study.workMinutes || 25,
                  study.selectedSubject,
                  sessionNote,
                );
                setSessionNote("");
              }}
            >
              <Icon name="Plus" size={16} /> Log {study.workMinutes || 25} min
            </button>
          </div>
          <label className="study-session-note">
            Session note
            <input
              value={sessionNote}
              onChange={(event) => {
                setSessionNote(event.target.value);
                onUpdate({ sessionNote: event.target.value });
              }}
              placeholder="What are you working on?"
            />
          </label>
          <div className="study-stats-grid">
            <div>
              <strong>{studyStreak}</strong>
              <span>study-day streak</span>
            </div>
            <div>
              <strong>{averageSession}m</strong>
              <span>average session</span>
            </div>
            <div>
              <strong>{todayStudyMinutes}m</strong>
              <span>studied today</span>
            </div>
          </div>
          <details className="study-chart collapsible-panel">
            <summary>
              <strong>This week</strong>
              <span>Minutes studied each day</span>
            </summary>
            <div className="study-chart-bars">
              {weekHistory.map((day) => (
                <div className="study-chart-day" key={day.key}>
                  <span>{day.minutes ? `${day.minutes}m` : ""}</span>
                  <i
                    style={{
                      height: `${Math.max(4, Math.min(100, (day.minutes / Math.max(1, ...weekHistory.map((entry) => entry.minutes))) * 100))}%`,
                    }}
                  />
                  <small>{day.day}</small>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
      {!toolsOnly && studyTab === "plan" && (
        <details className="study-subject-settings">
          <summary>Subject goals &amp; colors</summary>
          <div className="study-subjects">
            {(study.subjects || []).map((subject) => {
              const subjectMinutes = (study.history || [])
                .filter(
                  (session) =>
                    session.subject === subject.name &&
                    session.date >= weekStartKey() &&
                    session.date <= todayKey(),
                )
                .reduce(
                  (total, session) => total + Number(session.minutes || 0),
                  0,
                );
              return (
                <div className="study-subject-row" key={subject.name}>
                  <span className="study-subject-name">
                    <i style={{ background: subject.color }} />
                    {subject.name}
                    <input
                      type="color"
                      value={subject.color || "#7c5cff"}
                      aria-label={`${subject.name} color`}
                      onChange={(event) =>
                        onUpdate({
                          subjects: study.subjects.map((item) =>
                            item.name === subject.name
                              ? { ...item, color: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </span>
                  <label className="study-subject-goal">
                    Goal
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={subject.goal}
                      aria-label={`${subject.name} weekly goal in hours`}
                      onChange={(event) =>
                        onUpdate({
                          subjects: study.subjects.map((item) =>
                            item.name === subject.name
                              ? {
                                  ...item,
                                  goal: Number(event.target.value) || 0,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    h
                  </label>
                  <small>
                    {(subjectMinutes / 60).toFixed(1)} / {subject.goal}h
                  </small>
                  <div className="study-subject-bar">
                    <i
                      style={{
                        background: subject.color,
                        width: `${subject.goal ? Math.min(100, (subjectMinutes / (subject.goal * 60)) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
      {toolsOnly && (
        <div
          className={`study-flashcards${flashcardSessionStarted || quizStarted ? " study-session-view" : ""}`}
        >
          <>
            {(flashcardSessionStarted || quizStarted) && (
              <div className="study-session-view-header">
                <strong>
                  {flashcardMode === "cards"
                    ? "Flashcard session"
                    : "Quiz session"}
                </strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFlashcardSessionStarted(false);
                    setQuizStarted(false);
                  }}
                >
                  <Icon name="ArrowLeft" size={16} /> Back to setup
                </button>
              </div>
            )}
            <div className="workout-subheading">
              <h3>Flashcards</h3>
              <span>
                {regularDueCards.length} due · {subjectCards.length} in deck
              </span>
            </div>
            <details
              className="flashcard-import-details"
              open={Boolean(pendingCsvImport)}
            >
              <summary>Import Anki or CSV</summary>
              <div className="flashcard-import-actions">
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => csvImportRef.current?.click()}
                >
                  Import Anki / CSV
                </button>
                <input
                  ref={csvImportRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  hidden
                  aria-label="Import flashcards from CSV or TSV"
                  onChange={importFlashcards}
                />
                <span>Two columns: question and answer</span>
              </div>
              {pendingCsvImport && (
                <section
                  className="import-preview"
                  aria-labelledby="flashcard-import-preview-title"
                >
                  <h4 id="flashcard-import-preview-title">
                    Preview {pendingCsvImport.fileName}
                  </h4>
                  <p>
                    {pendingCsvImport.parsedCount} valid card
                    {pendingCsvImport.parsedCount === 1 ? "" : "s"} found;{" "}
                    {pendingCsvImport.cards.length} new card
                    {pendingCsvImport.cards.length === 1 ? "" : "s"} ready
                    {" · "}
                    {pendingCsvImport.skipped.length} skipped
                  </p>
                  {pendingCsvImport.cards.length > 0 && (
                    <ul>
                      {pendingCsvImport.cards.slice(0, 3).map((card, index) => (
                        <li key={`${card.question}-${index}`}>
                          <strong>{card.question}</strong> — {card.answer}
                        </li>
                      ))}
                      {pendingCsvImport.cards.length > 3 && (
                        <li>
                          And {pendingCsvImport.cards.length - 3} more new
                          cards.
                        </li>
                      )}
                    </ul>
                  )}
                  {pendingCsvImport.skipped.length > 0 && (
                    <ul>
                      {pendingCsvImport.skipped
                        .slice(0, 3)
                        .map((item, index) => (
                          <li key={`${item.row || "duplicate"}-${index}`}>
                            {item.row ? `Row ${item.row}: ` : ""}
                            {item.reason}
                          </li>
                        ))}
                      {pendingCsvImport.skipped.length > 3 && (
                        <li>
                          And {pendingCsvImport.skipped.length - 3} more skipped
                          rows.
                        </li>
                      )}
                    </ul>
                  )}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="subtle-btn"
                      onClick={() => setPendingCsvImport(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!pendingCsvImport.cards.length}
                      onClick={confirmFlashcardImport}
                    >
                      Import {pendingCsvImport.cards.length} cards
                    </button>
                  </div>
                </section>
              )}
            </details>
            <details className="flashcard-filter-details">
              <summary>
                {selectedStudySet?.subject || "No study set selected"} · filters
              </summary>
              <label className="flashcard-selector">
                Study set
                <CompactPicker
                  value={selectedStudySetId}
                  onChange={(studySetId) => {
                    const studySet = study.sets.find(
                      (set) => set.id === studySetId,
                    );
                    setSelectedStudySetId(studySetId);
                    setCardSubject(studySet?.subject || "");
                    setCardDeck(studySet?.subject || "");
                    setSelectedTag("");
                    resetCardSession();
                  }}
                  ariaLabel="Select study set for flashcards"
                  options={
                    studySetOptions.length
                      ? studySetOptions
                      : [["", "Create a study set first"]]
                  }
                />
              </label>
              <label className="flashcard-selector">
                Tag
                <CompactPicker
                  value={selectedTag}
                  onChange={(tag) => {
                    setSelectedTag(tag);
                    resetCardSession();
                  }}
                  ariaLabel="Filter flashcards by tag"
                  options={[
                    ["", "All tags"],
                    ...tagOptions.map((tag) => [tag, tag]),
                  ]}
                />
              </label>
            </details>
            <div className="flashcard-cram-control">
              <button
                type="button"
                className={`subtle-btn${cramMode ? " selected" : ""}`}
                aria-pressed={cramMode}
                onClick={() => {
                  setCramMode((enabled) => !enabled);
                  resetCardSession();
                }}
              >
                {cramMode ? "Exit cram mode" : "Cram mode"}
              </button>
              <span>{studySetCountLabel}</span>
            </div>
            <div
              className="study-tool-tabs"
              role="tablist"
              aria-label="Study tool"
            >
              <button
                type="button"
                role="tab"
                aria-selected={flashcardMode === "cards"}
                className={flashcardMode === "cards" ? "selected" : ""}
                onClick={() => setFlashcardMode("cards")}
              >
                Flashcards
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={flashcardMode === "quiz"}
                className={flashcardMode === "quiz" ? "selected" : ""}
                onClick={() => {
                  setFlashcardMode("quiz");
                  setQuizStarted(false);
                  setQuizIndex(0);
                  setQuizScore(0);
                  setQuizChoice("");
                  setQuizAnswerInput("");
                  setQuizSessionCards([]);
                  setMissedQuizCards([]);
                  setMatchingAnswers({});
                  setMatchingEvaluated(false);
                }}
              >
                Quiz
              </button>
            </div>
            {flashcardMode === "cards" ? (
              <>
                {!flashcardSessionStarted ? (
                  <div className="flashcard-session-controls">
                    <details className="flashcard-session-options">
                      <summary>Session options</summary>
                      <label className="study-session-size">
                        Cards this session
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, dueCards.length)}
                          value={
                            dueCards.length
                              ? Math.min(flashcardSessionSize, dueCards.length)
                              : ""
                          }
                          disabled={!dueCards.length}
                          aria-label="Cards this session"
                          onChange={(event) => {
                            const count = Math.max(
                              1,
                              Number(event.target.value) || 1,
                            );
                            setFlashcardSessionSize(count);
                            saveToolPreferences({
                              flashcardSessionSize: count,
                            });
                          }}
                        />
                        <small>
                          {cramMode
                            ? `${dueCards.length} cards in cram mode`
                            : `${dueCards.length} due cards available`}
                        </small>
                      </label>
                      <label className="shuffle-toggle">
                        <input
                          type="checkbox"
                          checked={shuffleQuestions}
                          onChange={(event) => {
                            setShuffleQuestions(event.target.checked);
                            saveToolPreferences({
                              shuffleQuestions: event.target.checked,
                            });
                          }}
                        />
                        Shuffle questions
                      </label>
                      <label className="shuffle-toggle">
                        <input
                          type="checkbox"
                          checked={weakFocus}
                          onChange={(event) => {
                            setWeakFocus(event.target.checked);
                            saveToolPreferences({
                              weakFocus: event.target.checked,
                            });
                          }}
                        />
                        Prioritize missed cards
                      </label>
                    </details>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!dueCards.length}
                      onClick={startFlashcardSession}
                    >
                      {dueCards.length
                        ? `Start ${Math.min(flashcardSessionSize, dueCards.length)}-card session`
                        : cramMode
                          ? "No cards in this deck"
                          : "No cards due"}
                    </button>
                    {!dueCards.length && (
                      <p className="flashcard-empty-note">
                        {cramMode
                          ? "This deck has no cards yet. Add a card or import one to start cramming."
                          : "You’re all caught up. Add or import cards, or come back when a review is due."}
                      </p>
                    )}
                  </div>
                ) : activeCard ? (
                  <div className="flashcard">
                    <strong>{activeCard.question}</strong>
                    <small>
                      Card {flashcardsReviewed + 1} of {flashcardTarget}
                    </small>
                    <small className="flashcard-shortcuts">
                      Space: reveal · S: skip
                    </small>
                    {activeCard.tags?.length > 0 && (
                      <div className="flashcard-tags">
                        {activeCard.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {showAnswer ? (
                      <p>{activeCard.answer}</p>
                    ) : (
                      <button
                        type="button"
                        className="subtle-btn"
                        onClick={() => setShowAnswer(true)}
                      >
                        Reveal answer
                      </button>
                    )}
                    <button
                      type="button"
                      className="flashcard-next"
                      onClick={() => {
                        skipFlashcard();
                      }}
                    >
                      Skip card <Icon name="ArrowRight" size={16} />
                    </button>
                  </div>
                ) : flashcardSessionComplete ? (
                  <div className="flashcard-session-result" role="status">
                    <strong>Session complete</strong>
                    <span>
                      You finished {flashcardsReviewed} card
                      {flashcardsReviewed === 1 ? "" : "s"} in this session.
                    </span>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        setFlashcardsReviewed(0);
                        setFlashcardSessionIds([]);
                        setFlashcardSessionStarted(false);
                      }}
                    >
                      Start another session
                    </button>
                  </div>
                ) : (
                  <div className="flashcard-session-result" role="status">
                    <strong>You’re all caught up</strong>
                    <span>There are no due cards left in this session.</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setFlashcardSessionIds([]);
                        setFlashcardsReviewed(0);
                        setFlashcardSessionStarted(false);
                      }}
                    >
                      Back to flashcards
                    </button>
                  </div>
                )}
                {flashcardMode === "cards" && !flashcardSessionStarted && (
                  <>
                    <details
                      className="flashcard-ai-import-details"
                      open={Boolean(
                        fileBusy || aiMessage || fileMessage || fileError,
                      )}
                    >
                      <summary>Create cards from notes</summary>
                      <div className="study-file-import">
                        <p className="flashcard-ai-note">
                          First use downloads the on-device AI model. Keep this
                          page open; mobile HTTP links may need to download the
                          model again next time.
                        </p>
                        <label className="ai-card-count">
                          Number of cards
                          <input
                            type="number"
                            min="1"
                            max="50"
                            step="1"
                            value={aiCardCount}
                            aria-label="Number of AI flashcards to generate"
                            disabled={fileBusy}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAiCardCount(
                                value === ""
                                  ? ""
                                  : Math.min(50, Math.max(1, Number(value))),
                              );
                            }}
                            onBlur={() =>
                              setAiCardCount((count) =>
                                Math.min(
                                  50,
                                  Math.max(1, Math.round(Number(count) || 10)),
                                ),
                              )
                            }
                          />
                        </label>
                        <label
                          className={`file-import-button ${fileBusy ? "busy" : ""}`}
                        >
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                            onChange={importStudyFile}
                            disabled={fileBusy}
                            aria-label="Select a document to generate flashcards"
                          />
                          <Icon
                            name={fileBusy ? "CircleDashed" : "Plus"}
                            size={16}
                          />
                          {fileBusy ? "Creating questions…" : "Create with AI"}
                        </label>
                        {fileBusy && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              studyAiCancelledRef.current = true;
                              cancelStudyCardGeneration();
                              setAiMessage("");
                              setFileMessage("AI card generation cancelled.");
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      {aiMessage && (
                        <p
                          className="file-import-progress"
                          role="status"
                          aria-live="polite"
                        >
                          {aiMessage}
                        </p>
                      )}
                      {fileMessage && (
                        <p className="file-import-success" role="status">
                          {fileMessage}
                        </p>
                      )}
                      {fileError && (
                        <div className="study-ai-error" role="alert">
                          <p className="file-import-error">{fileError}</p>
                        </div>
                      )}
                      <section
                        className="flashcard-library-link"
                        aria-label="AI-created card library"
                      >
                        <div>
                          <strong>AI-created cards</strong>
                          <small>
                            {
                              (study.flashcards || []).filter(
                                (card) => card.source,
                              ).length
                            }{" "}
                            cards from your notes
                          </small>
                        </div>
                        <button
                          type="button"
                          className="subtle-btn"
                          onClick={() => onNavigate("flashcard-library")}
                        >
                          Manage cards
                        </button>
                      </section>
                    </details>
                  </>
                )}
              </>
            ) : (
              <div className="study-quiz">
                {!quizStarted ? (
                  <div className="quiz-intro">
                    <div className="quiz-settings">
                      <label>
                        Quiz type
                        <CompactPicker
                          value={quizType}
                          ariaLabel="Quiz type"
                          options={[
                            ["all", "All types"],
                            ["combo", "Choose 2 types"],
                            ["multiple-choice", "Multiple choice"],
                            ["identification", "Identification"],
                            ["true-false", "True or false"],
                            ["matching", "Matching"],
                          ]}
                          onChange={(type) => {
                            setQuizType(type);
                            saveToolPreferences({ quizType: type });
                            setQuizIndex(0);
                            setQuizScore(0);
                            setQuizChoice("");
                            setQuizAnswerInput("");
                            setQuizStarted(false);
                            setMissedQuizCards([]);
                            setQuizSessionCards([]);
                          }}
                        />
                        {quizType === "combo" && (
                          <div className="quiz-combination-picker">
                            <CompactPicker
                              value={quizCombination[0]}
                              ariaLabel="First quiz type"
                              options={[
                                ["multiple-choice", "Multiple choice"],
                                ["identification", "Identification"],
                                ["true-false", "True or false"],
                                ["matching", "Matching"],
                              ]}
                              onChange={(type) =>
                                setQuizCombination(([, second]) => [
                                  type,
                                  type === second
                                    ? type === "matching"
                                      ? "identification"
                                      : "matching"
                                    : second,
                                ])
                              }
                            />
                            <CompactPicker
                              value={quizCombination[1]}
                              ariaLabel="Second quiz type"
                              options={[
                                ["multiple-choice", "Multiple choice"],
                                ["identification", "Identification"],
                                ["true-false", "True or false"],
                                ["matching", "Matching"],
                              ]}
                              onChange={(type) =>
                                setQuizCombination(([first]) => [
                                  type === first
                                    ? type === "matching"
                                      ? "identification"
                                      : "matching"
                                    : first,
                                  type,
                                ])
                              }
                            />
                          </div>
                        )}
                      </label>
                      <label>
                        Questions
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, quizAvailableCards.length)}
                          value={quizAvailableCards.length ? quizTarget : ""}
                          disabled={!quizAvailableCards.length}
                          aria-label="Number of quiz questions"
                          onChange={(event) => {
                            const count = Math.max(
                              1,
                              Number(event.target.value) || 1,
                            );
                            setQuizQuestionCount(count);
                            saveToolPreferences({ quizQuestionCount: count });
                          }}
                        />
                        <small>
                          Up to {quizAvailableCards.length} available for this
                          type
                        </small>
                      </label>
                    </div>
                    <div className="quiz-ai-actions">
                      <label
                        className={`file-import-button ${fileBusy ? "busy" : ""}`}
                      >
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                          onChange={importStudyQuizFile}
                          disabled={fileBusy}
                          aria-label="Select a document to create quiz questions with AI"
                        />
                        <Icon
                          name={fileBusy ? "CircleDashed" : "Plus"}
                          size={16}
                        />
                        {fileBusy ? "Creating questions…" : "Create with AI"}
                      </label>
                      {fileBusy && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            studyAiCancelledRef.current = true;
                            cancelStudyCardGeneration();
                            setAiMessage("");
                            setFileMessage("AI card generation cancelled.");
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {aiMessage && (
                        <small
                          className="file-import-progress"
                          role="status"
                          aria-live="polite"
                        >
                          {aiMessage}
                        </small>
                      )}
                      {fileMessage && (
                        <small className="file-import-success" role="status">
                          {fileMessage}
                        </small>
                      )}
                      {fileError && (
                        <small className="file-import-error" role="alert">
                          {fileError}
                        </small>
                      )}
                    </div>
                    <label className="shuffle-toggle">
                      <input
                        type="checkbox"
                        checked={shuffleQuestions}
                        onChange={(event) => {
                          setShuffleQuestions(event.target.checked);
                          saveToolPreferences({
                            shuffleQuestions: event.target.checked,
                          });
                        }}
                      />
                      Shuffle questions
                    </label>
                    <p>
                      {quizTarget} question{quizTarget === 1 ? "" : "s"} for{" "}
                      {cardSubject}
                    </p>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => startQuiz()}
                      disabled={!canStartQuiz}
                    >
                      Start quiz
                    </button>
                    {!canStartQuiz && (
                      <small>
                        {activeQuizType === "identification"
                          ? "Add a flashcard to start an identification quiz."
                          : "Add at least two flashcards with different answers for this quiz type."}
                      </small>
                    )}
                  </div>
                ) : quizIndex >= quizTarget ? (
                  <div className="quiz-result" role="status">
                    <strong>Quiz complete</strong>
                    <span>
                      You got {quizScore} out of {quizTarget} correct.
                    </span>
                    {missedQuizCards.length > 0 && (
                      <>
                        <div className="missed-quiz-review">
                          <strong>Review these answers</strong>
                          {missedQuizCards.map((card) => (
                            <p key={card.id}>
                              <b>{card.question}</b>
                              <span>{card.answer}</span>
                            </p>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={retryMissedQuiz}
                        >
                          Retry {missedQuizCards.length} missed
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => startQuiz()}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="quiz-question">
                    <small>
                      Question {quizIndex + 1} of {quizTarget}
                    </small>
                    {activeQuizType === "identification" ? (
                      <small className="flashcard-shortcuts">
                        Type your answer and press Enter
                      </small>
                    ) : (
                      activeQuizType !== "matching" && (
                        <small className="flashcard-shortcuts">
                          {activeQuizType === "true-false"
                            ? "Press 1/2 to choose"
                            : "Press 1–4 to choose"}{" "}
                          · Enter for next
                        </small>
                      )
                    )}
                    <strong>{activeQuizCard.question}</strong>
                    {activeQuizCard.tags?.length > 0 && (
                      <div className="flashcard-tags">
                        {activeQuizCard.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {activeQuizType === "matching" ? (
                      <div className="matching-game">
                        <p>
                          Select a question, then select its matching answer.
                        </p>
                        <div className="matching-columns">
                          <div className="matching-column">
                            <strong>Questions</strong>
                            {quizSessionCards.map((card, index) => (
                              <button
                                type="button"
                                key={card.id}
                                className={`${matchingSelectedQuestion === card.id ? "selected" : ""} ${matchingEvaluated ? (matchingAnswers[card.id] === card.id ? "correct" : "incorrect") : ""}`}
                                aria-pressed={
                                  matchingSelectedQuestion === card.id
                                }
                                disabled={matchingEvaluated}
                                onClick={() =>
                                  setMatchingSelectedQuestion(card.id)
                                }
                              >
                                {index + 1}. {card.question}
                              </button>
                            ))}
                          </div>
                          <div className="matching-column">
                            <strong>Answers</strong>
                            {matchingAnswerCards.map((card) => {
                              const paired = Object.values(
                                matchingAnswers,
                              ).includes(card.id);
                              return (
                                <button
                                  type="button"
                                  key={card.id}
                                  className={`${paired ? "paired" : ""} ${matchingEvaluated ? (Object.entries(matchingAnswers).some(([questionId, answerId]) => answerId === card.id && questionId === card.id) ? "correct" : Object.entries(matchingAnswers).some(([, answerId]) => answerId === card.id) ? "incorrect" : "") : ""}`}
                                  disabled={
                                    matchingEvaluated ||
                                    !matchingSelectedQuestion
                                  }
                                  onClick={() => chooseMatchingAnswer(card.id)}
                                >
                                  {card.answer}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {matchingEvaluated ? (
                          <div className="quiz-feedback">
                            <span>
                              {quizScore} of {quizSessionCards.length} matches
                              correct.
                            </span>
                            <button
                              type="button"
                              className="text-button"
                              onClick={nextQuizQuestion}
                            >
                              See results
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="primary-btn"
                            disabled={
                              Object.keys(matchingAnswers).length !==
                              quizSessionCards.length
                            }
                            onClick={checkMatchingAnswers}
                          >
                            Check matches
                          </button>
                        )}
                      </div>
                    ) : activeQuizType === "identification" ? (
                      <form
                        className="quiz-identification"
                        onSubmit={(event) => {
                          event.preventDefault();
                          answerQuiz(quizAnswerInput.trim());
                        }}
                      >
                        <input
                          value={quizAnswerInput}
                          onChange={(event) =>
                            setQuizAnswerInput(event.target.value)
                          }
                          disabled={Boolean(quizChoice)}
                          placeholder="Type your answer"
                          aria-label="Your answer"
                        />
                        <button
                          type="submit"
                          className="primary-btn"
                          disabled={
                            !quizAnswerInput.trim() || Boolean(quizChoice)
                          }
                        >
                          Check answer
                        </button>
                      </form>
                    ) : activeQuizType === "true-false" ? (
                      <div className="quiz-statement">
                        <span>Is this answer correct?</span>
                        <strong>{trueFalseAnswer}</strong>
                        <div className="quiz-choices">
                          {["True", "False"].map((choice) => (
                            <button
                              type="button"
                              key={choice}
                              disabled={Boolean(quizChoice)}
                              className={
                                quizChoice
                                  ? choice ===
                                    (trueFalseIsTrue ? "True" : "False")
                                    ? "correct"
                                    : choice === quizChoice
                                      ? "incorrect"
                                      : ""
                                  : ""
                              }
                              onClick={() => answerQuiz(choice)}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="quiz-choices">
                        {quizChoices.map((choice) => (
                          <button
                            type="button"
                            key={choice}
                            disabled={Boolean(quizChoice)}
                            className={
                              quizChoice
                                ? choice === activeQuizCard.answer
                                  ? "correct"
                                  : choice === quizChoice
                                    ? "incorrect"
                                    : ""
                                : ""
                            }
                            onClick={() => answerQuiz(choice)}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    )}
                    {quizChoice && (
                      <div className="quiz-feedback">
                        <span>
                          {quizAnswerIsCorrect
                            ? "Correct!"
                            : quizCorrectionText}
                        </span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={nextQuizQuestion}
                        >
                          {quizIndex + 1 === quizTarget
                            ? "See score"
                            : "Next question"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        </div>
      )}
      {!toolsOnly && studyTab === "topics" && (
        <div className="study-topics">
          <div className="workout-subheading">
            <h3>{study.selectedSubject} topics</h3>
            <span>
              {
                (currentSubject?.topics || []).filter((topic) => topic.done)
                  .length
              }
              /{(currentSubject?.topics || []).length} done
            </span>
          </div>
          {weakCards.length > 0 && (
            <section className="study-weak-topics">
              <div className="workout-subheading">
                <h3>Needs another look</h3>
                <span>
                  {weakCards.length} weak card
                  {weakCards.length === 1 ? "" : "s"}
                </span>
              </div>
              {weakCards.slice(0, 4).map((card) => (
                <div key={card.id}>
                  <span>{card.question}</span>
                  <small>
                    Missed {card.missCount} time
                    {card.missCount === 1 ? "" : "s"}
                  </small>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setWeakFocus(true);
                  saveToolPreferences({ weakFocus: true });
                  setFlashcardMode("quiz");
                }}
              >
                Practice weak cards
              </button>
            </section>
          )}
          <div className="study-topic-form">
            <input
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              placeholder="Add a chapter or topic"
              aria-label="New study topic"
            />
            <button
              type="button"
              className="text-button"
              onClick={addTopic}
              disabled={!topicDraft.trim()}
            >
              Add topic
            </button>
          </div>
          {(currentSubject?.topics || []).map((topic) => (
            <label
              className={`study-topic ${topic.done ? "done" : ""}`}
              key={topic.id}
            >
              <input
                type="checkbox"
                checked={topic.done}
                onChange={() => toggleTopic(topic.id)}
              />
              {topic.title}
            </label>
          ))}
        </div>
      )}
      {!toolsOnly && studyTab === "plan" && (
        <div className="study-schedule">
          <div className="workout-subheading">
            <h3>Weekly study schedule</h3>
            <span>Plan your study blocks</span>
          </div>
          <div className="study-schedule-form">
            <select
              value={scheduleSubject}
              onChange={(event) => setScheduleSubject(event.target.value)}
              aria-label="Schedule subject"
            >
              {(study.subjects || []).map((subject) => (
                <option key={subject.name}>{subject.name}</option>
              ))}
            </select>
            <select
              value={scheduleDay}
              onChange={(event) => setScheduleDay(event.target.value)}
              aria-label="Schedule day"
            >
              {weekDays.map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
            <input
              type="time"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
              aria-label="Schedule time"
            />
            <input
              type="number"
              min="15"
              step="15"
              value={scheduleMinutes}
              onChange={(event) => setScheduleMinutes(event.target.value)}
              aria-label="Schedule duration in minutes"
            />
            <button
              type="button"
              className="text-button"
              onClick={addScheduleBlock}
            >
              Add block
            </button>
          </div>
          {interclassSuggestions.length > 0 && (
            <section
              className="study-gap-suggestions"
              aria-label="Suggested study gaps between classes"
            >
              <div className="workout-subheading">
                <h4>Free gaps between classes</h4>
                <span>Based on your timetable and planned study blocks</span>
              </div>
              {interclassSuggestions.length ? (
                <div className="study-gap-list">
                  {interclassSuggestions.map((gap) => {
                    const minutes = Math.min(
                      60,
                      Math.floor(gap.minutes / 15) * 15,
                    );
                    return (
                      <article key={`${gap.date}-${gap.time}`}>
                        <span>
                          <strong>
                            {gap.day.slice(0, 3)} · {gap.time}
                          </strong>
                          <small>{minutes} minutes free</small>
                        </span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => addScheduleBlock(gap)}
                        >
                          Plan study
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onAddTask?.({
                              id: createId(),
                              title: `Study ${scheduleSubject} · ${gap.minutes} min`,
                              due: gap.date,
                              priority: "medium",
                              done: false,
                              type: "task",
                              subject: scheduleSubject,
                            })
                          }
                        >
                          Add task
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="study-gap-empty">
                  {(study.classes || []).length < 2
                    ? "Add at least two classes on a day to get suggestions for the gaps between them."
                    : "No available gaps between classes this week. Your planned study blocks are included."}
                </p>
              )}
            </section>
          )}
        </div>
      )}
      {!toolsOnly && studyTab === "focus" && study.history?.length > 0 && (
        <details className="study-history-details">
          <summary>Recent focus sessions</summary>
          {study.history
            ?.slice(-4)
            .reverse()
            .map((session) => (
              <div className="history-line" key={session.id}>
                Focus session · {session.minutes} min ·{" "}
                {session.subject || study.subject}
                {session.note && (
                  <span className="study-history-note">{session.note}</span>
                )}
                <small>{session.date}</small>
              </div>
            ))}
        </details>
      )}
    </div>
  );
}

function WorkoutCard({ workout, onUpdate }) {
  const [workoutView, setWorkoutView] = useState("plan");
  const [exercise, setExercise] = useState({
    name: "",
    sets: 3,
    reps: 8,
    weight: "",
    rpe: 7,
    notes: "",
  });
  const [rest, setRest] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [restPaused, setRestPaused] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [libraryName, setLibraryName] = useState("");
  const exerciseNameInputRef = useRef(null);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseMuscleFilter, setExerciseMuscleFilter] =
    useState("All muscle groups");
  const [exerciseEquipmentFilter, setExerciseEquipmentFilter] =
    useState("All equipment");
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [warmupTarget, setWarmupTarget] = useState("");
  const [weightUnit, setWeightUnit] = useState(
    workout.weightUnit === "lb" ? "lb" : "kg",
  );
  const weightFactor = weightUnit === "lb" ? 2.20462 : 1;
  const toDisplayWeight = (weight) =>
    weight === "" || weight === undefined
      ? ""
      : (Number(weight) * weightFactor).toFixed(1);
  const fromDisplayWeight = (weight) => Number(weight) / weightFactor;
  const changeWeightUnit = (nextUnit) => {
    const nextFactor = nextUnit === "lb" ? 2.20462 : 1;
    setExercise((current) => ({
      ...current,
      weight: current.weight
        ? String((Number(current.weight) / weightFactor) * nextFactor)
        : "",
    }));
    setWarmupTarget((current) =>
      current ? String((Number(current) / weightFactor) * nextFactor) : "",
    );
    setWeightUnit(nextUnit);
    onUpdate({ weightUnit: nextUnit });
  };
  const platePresets = workout.platePresets?.length
    ? workout.platePresets
    : initialState.workout.platePresets;
  const activePlatePreset =
    platePresets.find((preset) => preset.name === workout.activePlatePreset) ||
    platePresets[0];
  const [barWeight, setBarWeight] = useState(
    activePlatePreset?.barWeight || 20,
  );
  const [plateIncrement, setPlateIncrement] = useState(
    activePlatePreset?.plateIncrement || 2.5,
  );
  const [newPlatePresetName, setNewPlatePresetName] = useState("");
  const startRest = (seconds = Number(workout.restSeconds) || 90) => {
    const duration = Math.max(1, Number(seconds) || 90);
    setRestTotal(duration);
    setRest(duration);
    setRestPaused(false);
  };
  const adjustRest = (delta) => {
    const next = Math.max(0, rest + delta);
    setRest(next);
    setRestTotal((total) => Math.max(next, total + (delta > 0 ? delta : 0)));
  };
  const [selectedPlanDay, setSelectedPlanDay] = useState(
    () => WEEKDAYS[(dateFromKey(todayKey()).getDay() + 6) % 7],
  );
  const [measurement, setMeasurement] = useState({
    weight: workout.weight || "",
    height: workout.height || "",
    waist: workout.waist || "",
  });
  useEffect(() => {
    setMeasurement({
      weight: workout.weight || "",
      height: workout.height || "",
      waist: workout.waist || "",
    });
  }, [workout.weight, workout.height, workout.waist]);
  const session = workout.currentSession;
  const exercises = workout.exercises || [];
  const selectedDayPlan = workout.dayPlans?.[selectedPlanDay] || [];
  const selectedDaySplit = workout.daySplits?.[selectedPlanDay] || null;
  const selectedDayExercises = selectedDaySplit?.exercises || selectedDayPlan;
  const selectedDayIsPlanned = Boolean(
    selectedDaySplit || selectedDayPlan.length,
  );
  const todayPlanDay = WEEKDAYS[(dateFromKey(todayKey()).getDay() + 6) % 7];
  const sessionLoggedExercises = session
    ? exercises.filter((item) => String(item.sessionId) === String(session.id))
    : [];
  const sessionLineup = (() => {
    if (!session) return [];
    const planned = (
      Array.isArray(session.routineExercises) ? session.routineExercises : []
    )
      .map((item, index) => {
        const entry =
          typeof item === "string" ? { name: item, sets: 3, reps: 8 } : item;
        const name = String(entry?.name || "").trim();
        if (!name) return null;
        const loggedSets = sessionLoggedExercises
          .filter(
            (logged) =>
              String(logged.name || "").toLowerCase() === name.toLowerCase(),
          )
          .reduce((total, logged) => total + Number(logged.sets || 0), 0);
        return {
          id: entry.id || `${index}-${name}`,
          name,
          sets: Number(entry.sets) || 3,
          reps: Number(entry.reps) || 8,
          loggedSets,
          planned: true,
        };
      })
      .filter(Boolean);
    const plannedNames = new Set(
      planned.map((item) => item.name.toLowerCase()),
    );
    const completedUnplanned = [
      ...new Map(
        sessionLoggedExercises
          .filter(
            (item) => !plannedNames.has(String(item.name || "").toLowerCase()),
          )
          .map((item) => [String(item.name || "").toLowerCase(), item]),
      ).values(),
    ].map((item, index) => ({
      id: `logged-${index}-${item.name}`,
      name: item.name,
      sets: Number(item.sets) || 3,
      reps: Number(item.reps) || 8,
      loggedSets: sessionLoggedExercises
        .filter(
          (logged) =>
            String(logged.name || "").toLowerCase() ===
            String(item.name || "").toLowerCase(),
        )
        .reduce((total, logged) => total + Number(logged.sets || 0), 0),
      planned: false,
    }));
    return [...planned, ...completedUnplanned];
  })();
  const completedSessionExercises = sessionLineup.filter(
    (item) => item.loggedSets >= item.sets,
  ).length;
  const sessionTargetSets = sessionLineup.reduce(
    (total, item) => total + item.sets,
    0,
  );
  const sessionLoggedSets = sessionLineup.reduce(
    (total, item) => total + Math.min(item.loggedSets, item.sets),
    0,
  );
  const sessionProgress = sessionTargetSets
    ? Math.round((sessionLoggedSets / sessionTargetSets) * 100)
    : 0;
  const completedSessions = [...(workout.history || [])]
    .reverse()
    .map((entry, index) => {
      const sessionExercises = exercises.filter(
        (item) => String(item.sessionId) === String(entry.id),
      );
      return {
        ...entry,
        displayId: `${entry.id || entry.finished || entry.date}-${index}`,
        sessionExercises,
        setCount: sessionExercises.reduce(
          (total, item) => total + Number(item.sets || 0),
          0,
        ),
        volume:
          Number(entry.volume) ||
          sessionExercises.reduce(
            (total, item) =>
              total +
              Number(item.sets || 0) *
                Number(item.reps || 0) *
                Number(item.weight || 0),
            0,
          ),
      };
    });
  const [selectedExercise, setSelectedExercise] = useState("");
  const [photoError, setPhotoError] = useState("");
  const exerciseCatalog = useMemo(() => {
    const seenNames = new Set(
      EXERCISE_CATALOG.map((item) => item.name.toLowerCase()),
    );
    const customExercises = [];
    for (const value of workout.library || []) {
      if (typeof value !== "string" || !value.trim()) continue;
      const name = value.trim();
      const key = name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      customExercises.push({ name, muscle: "Custom", equipment: "Other" });
    }
    const search = exerciseSearch.trim().toLowerCase();
    return [...EXERCISE_CATALOG, ...customExercises].filter(
      (item) =>
        (exerciseMuscleFilter === "All muscle groups" ||
          item.muscle === exerciseMuscleFilter) &&
        (exerciseEquipmentFilter === "All equipment" ||
          item.equipment === exerciseEquipmentFilter) &&
        (!search ||
          `${item.name} ${item.muscle} ${item.equipment}`
            .toLowerCase()
            .includes(search)),
    );
  }, [
    exerciseEquipmentFilter,
    exerciseMuscleFilter,
    exerciseSearch,
    workout.library,
  ]);
  const visibleExerciseCatalog = showAllExercises
    ? exerciseCatalog
    : exerciseCatalog.slice(0, 8);
  const volume = exercises.reduce(
    (total, item) =>
      total +
      Number(item.sets || 0) *
        Number(item.reps || 0) *
        Number(item.weight || 0),
    0,
  );
  const setCount = exercises.reduce(
    (total, item) => total + Number(item.sets || 0),
    0,
  );
  const records = exercises.reduce((result, item) => {
    const weight = Number(item.weight || 0);
    const reps = Number(item.reps || 0);
    const name = String(item.name || "").trim();
    const key = name.toLowerCase();
    if (!name) return result;
    if (!result[key] || weight > result[key].weight) {
      result[key] = {
        name,
        weight,
        reps,
        date: item.date,
        maxReps: reps,
        oneRepMax: estimateOneRepMax(weight, reps),
      };
    } else if (reps > result[key].maxReps) {
      result[key].maxReps = reps;
    }
    result[key].oneRepMax = Math.max(
      result[key].oneRepMax || 0,
      estimateOneRepMax(weight, reps),
    );
    return result;
  }, {});
  const previousExerciseSets = [
    ...new Map(
      exercises
        .filter(
          (item) =>
            String(item.name || "").toLowerCase() ===
            exercise.name.trim().toLowerCase(),
        )
        .map((item) => [item.sessionId || item.date || item.id, item]),
    ).values(),
  ].slice(-2);
  const overloadHint =
    previousExerciseSets.length === 2 &&
    previousExerciseSets.every(
      (item) => Number(item.sets) >= 3 && Number(item.reps) >= 8,
    ) &&
    Number(previousExerciseSets[0].weight) ===
      Number(previousExerciseSets[1].weight)
      ? `You logged ${previousExerciseSets[0].sets}×${previousExerciseSets[0].reps} at ${toDisplayWeight(previousExerciseSets[0].weight)} ${weightUnit} twice. Consider a small increase.`
      : "";
  const warmupSets = buildWarmupSets(
    fromDisplayWeight(warmupTarget),
    barWeight,
    plateIncrement,
  );
  const updatePlatePreset = (patch) => {
    const updated = { ...activePlatePreset, ...patch };
    if (!activePlatePreset) return;
    setBarWeight(updated.barWeight);
    setPlateIncrement(updated.plateIncrement);
    onUpdate({
      platePresets: platePresets.map((preset) =>
        preset.name === activePlatePreset.name ? updated : preset,
      ),
    });
  };
  const addPlatePreset = () => {
    const name = newPlatePresetName.trim();
    if (
      !name ||
      platePresets.some(
        (preset) => preset.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    onUpdate({
      platePresets: [...platePresets, { name, barWeight, plateIncrement }],
      activePlatePreset: name,
    });
    setNewPlatePresetName("");
  };
  const measurements = (workout.measurementHistory || []).slice(-8);
  const bmi =
    Number(measurement.weight) > 0 && Number(measurement.height) > 0
      ? Number(measurement.weight) / (Number(measurement.height) / 100) ** 2
      : null;
  const bmiCategory =
    bmi === null
      ? "Enter your height and weight"
      : bmi < 18.5
        ? "Underweight"
        : bmi < 25
          ? "Healthy weight"
          : bmi < 30
            ? "Overweight"
            : "Obesity";
  const saveExercise = () => {
    const name = String(exercise.name || "").trim();
    if (!name) return;
    const sets = Math.min(
      12,
      Math.max(1, Math.round(Number(exercise.sets) || 1)),
    );
    const reps = Math.min(
      30,
      Math.max(1, Math.round(Number(exercise.reps) || 1)),
    );
    const weight = Math.max(0, fromDisplayWeight(exercise.weight) || 0);
    const rpe = Math.min(
      10,
      Math.max(1, Math.round(Number(exercise.rpe) || 1)),
    );
    const item = {
      ...exercise,
      name,
      sets,
      reps,
      weight,
      rpe,
      date: todayKey(),
      sessionId: session?.id || null,
    };
    onUpdate({
      exercises: [...exercises, item],
      currentSession: session
        ? { ...session, exerciseCount: Number(session.exerciseCount || 0) + 1 }
        : session,
    });
    setSelectedExercise(name);
    setExercise({
      ...exercise,
      name: "",
      weight: "",
      notes: "",
      sets: 3,
      reps: 8,
      rpe: 7,
    });
  };
  const startRoutine = (template, focus) => {
    const names = ROUTINE_EXERCISES[template]?.[focus] || [];
    const first = names[0];
    const previous = [...exercises]
      .reverse()
      .find((item) => item.name === first);
    onUpdate({
      split: template,
      currentSession: {
        id: createId(),
        date: todayKey(),
        split: template,
        focus,
        routineExercises: names,
      },
    });
    setSelectedExercise(first);
    setExercise({
      ...exercise,
      name: first,
      sets: previous?.sets || 3,
      reps: previous?.reps || 8,
      weight: previous?.weight ? toDisplayWeight(previous.weight) : "",
      rpe: previous?.rpe || 7,
    });
  };
  const loadExercise = (name, plannedExercise) => {
    const previous = [...exercises]
      .reverse()
      .find((item) => item.name === name);
    setSelectedExercise(name);
    setExercise({
      ...exercise,
      name,
      sets: plannedExercise?.sets || previous?.sets || 3,
      reps: plannedExercise?.reps || previous?.reps || 8,
      weight: previous?.weight ? toDisplayWeight(previous.weight) : "",
      rpe: previous?.rpe || 7,
    });
    window.requestAnimationFrame(() => {
      exerciseNameInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      exerciseNameInputRef.current?.focus({ preventScroll: true });
    });
  };
  const continueWorkout = () => {
    const nextExercise = sessionLineup.find(
      (item) => item.loggedSets < item.sets,
    );
    if (nextExercise) loadExercise(nextExercise.name, nextExercise);
  };
  const repeatWorkout = (entry) => {
    const routineExercises = [
      ...new Map(
        entry.sessionExercises
          .filter((item) => String(item.name || "").trim())
          .map((item) => {
            const name = String(item.name).trim();
            return [
              name.toLowerCase(),
              {
                id: createId(),
                name,
                sets: Math.min(
                  12,
                  Math.max(1, Math.round(Number(item.sets) || 3)),
                ),
                reps: Math.min(
                  30,
                  Math.max(1, Math.round(Number(item.reps) || 8)),
                ),
              },
            ];
          }),
      ).values(),
    ];
    const first = routineExercises[0];
    if (!first) return;
    const nextSession = {
      id: createId(),
      date: todayKey(),
      split: entry.split || workout.split,
      focus: entry.focus || entry.split || "Workout",
      routineExercises,
    };
    onUpdate({ split: nextSession.split, currentSession: nextSession });
    loadExercise(first.name, first);
  };
  const startPlannedWorkout = () => {
    const first = selectedDayExercises[0];
    if (!first) return;
    if (!session) {
      onUpdate({
        split: workout.split,
        currentSession: {
          id: createId(),
          date: todayKey(),
          split: selectedDaySplit?.split || workout.split,
          focus:
            selectedDaySplit?.focus ||
            selectedDayPlan[0]?.focus ||
            selectedPlanDay,
          routineExercises: selectedDayExercises.map(
            ({ id, name, sets, reps }) => ({ id, name, sets, reps }),
          ),
        },
      });
    }
    loadExercise(first.name, first);
  };
  const assignSplitToDay = (
    split,
    focus,
    templateId = `builtin:${split}:${focus}`,
    customTemplate = null,
  ) => {
    const names =
      customTemplate?.exercises?.map((item) => item.name) ||
      ROUTINE_EXERCISES[split]?.[focus] ||
      [];
    if (!names.length) return;
    const templateExercises =
      customTemplate?.exercises ||
      names.map((name) => ({ name, sets: 3, reps: 8 }));
    onUpdate({
      dayPlans: {
        ...workout.dayPlans,
        [selectedPlanDay]: [],
      },
      daySplits: {
        ...workout.daySplits,
        [selectedPlanDay]: {
          id: createId(),
          templateId,
          name: customTemplate?.name || focus,
          split,
          focus,
          exercises: templateExercises.map(({ name, sets, reps }) => ({
            id: createId(),
            name,
            sets: Number(sets) || 3,
            reps: Number(reps) || 8,
          })),
        },
      },
    });
  };
  const removeSplitFromDay = () =>
    onUpdate({
      dayPlans: {
        ...workout.dayPlans,
        [selectedPlanDay]: [],
      },
      daySplits: {
        ...workout.daySplits,
        [selectedPlanDay]: null,
      },
    });
  const addCustomExercise = () => {
    const name = libraryName.trim();
    if (!name) return;
    const isDuplicate = (workout.library || []).some(
      (item) => String(item).trim().toLowerCase() === name.toLowerCase(),
    );
    if (!isDuplicate) onUpdate({ library: [...(workout.library || []), name] });
    setLibraryName("");
  };
  const addBodyPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoError("");
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setPhotoError("Choose an image smaller than 10 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const source = canvas.toDataURL("image/jpeg", 0.65);
      const nextPhotos = [
        ...(workout.bodyPhotos || []),
        { id: createId(), date: todayKey(), source },
      ].slice(-6);
      onUpdate({
        bodyPhotos: nextPhotos,
      });
    } catch (error) {
      console.error("Could not save this progress photo.", error);
      setPhotoError("Could not process this photo. Try a different image.");
    }
  };
  useEffect(() => {
    if (!rest || restPaused) return undefined;
    const timer = window.setInterval(
      () => setRest((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [rest, restPaused]);
  return (
    <div
      className="section feature-card workout-dashboard"
      id="workout"
      data-workout-view={workoutView}
    >
      <PageHeading
        eyebrow="WORKOUTS"
        title="Workout log"
        subtitle="Plan workouts and track training, records, and recovery."
      />
      <div
        className="workout-view-switch"
        role="group"
        aria-label="Workout sections"
      >
        {[
          ["plan", "Plan"],
          ["progress", "Progress"],
          ["train", "Train"],
        ].map(([view, label]) => (
          <button
            type="button"
            key={view}
            aria-pressed={workoutView === view}
            onClick={() => setWorkoutView(view)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="workout-day-plan">
        <div className="workout-day-plan-heading">
          <div className="workout-subheading">
            <h3>Workout schedule</h3>
            <span>Assign a workout split for each day</span>
          </div>
          <div className="workout-day-plan-actions">
            <strong>{selectedDayIsPlanned ? "1 split" : "0 splits"}</strong>
          </div>
        </div>
        <div
          className="workout-day-picker"
          role="group"
          aria-label="Choose a day to plan"
        >
          {WEEKDAYS.map((day) => {
            const assignedSplit = workout.daySplits?.[day];
            const legacyCount = workout.dayPlans?.[day]?.length || 0;
            const exerciseCount =
              assignedSplit?.exercises?.length || legacyCount;
            const isToday = day === todayPlanDay;
            const dayLabel =
              assignedSplit?.name ||
              (legacyCount ? "Custom workout" : "Rest day");
            return (
              <button
                type="button"
                className={`${selectedPlanDay === day ? "selected " : ""}${isToday ? "today" : ""}`}
                key={day}
                aria-pressed={selectedPlanDay === day}
                aria-label={`${day}${isToday ? ", today" : ""}, ${dayLabel}${exerciseCount ? `, ${exerciseCount} exercises` : ""}`}
                onClick={() => setSelectedPlanDay(day)}
              >
                <span className="workout-day-card-heading">
                  <strong>{day.slice(0, 3)}</strong>
                  {isToday && <span className="workout-day-today">Today</span>}
                </span>
                <small className="workout-day-count">
                  {assignedSplit || legacyCount ? "1" : "0"}
                </small>
                <span className="workout-day-exercise-count">
                  {exerciseCount}{" "}
                  {exerciseCount === 1 ? "exercise" : "exercises"}
                </span>
                <span
                  className={`workout-day-card-content${exerciseCount ? "" : " empty"}`}
                >
                  {dayLabel}
                </span>
              </button>
            );
          })}
        </div>
        <div className="workout-day-plan-list" aria-live="polite">
          <div className="workout-day-plan-list-heading">
            <strong>{selectedPlanDay}</strong>
            <span>
              {selectedDaySplit ? "Workout split" : "No split assigned yet"}
            </span>
          </div>
          {selectedDaySplit ? (
            <div className="workout-day-split-assignment">
              <div>
                <strong>{selectedDaySplit.name}</strong>
                <small>
                  {selectedDaySplit.split} · {selectedDayExercises.length}{" "}
                  exercises in this split
                </small>
              </div>
              <button
                type="button"
                className="text-button danger-text"
                onClick={removeSplitFromDay}
              >
                Remove from day
              </button>
            </div>
          ) : selectedDayPlan.length ? (
            <div className="workout-day-split-assignment">
              <div>
                <strong>Custom workout</strong>
                <small>{selectedDayPlan.length} saved exercises</small>
              </div>
              <button
                type="button"
                className="workout-day-plan-start"
                onClick={startPlannedWorkout}
              >
                Start saved workout
              </button>
            </div>
          ) : (
            <p className="workout-day-plan-empty">
              Choose a split below to assign it to {selectedPlanDay}.
            </p>
          )}
        </div>
        {(workout.routineTemplates || []).length > 0 && (
          <div className="workout-saved-routines">
            <strong>Saved routines · assign to {selectedPlanDay}</strong>
            {workout.routineTemplates.map((routine) => (
              <div key={routine.id}>
                <span>
                  {routine.name} · {routine.exercises.length} exercises
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    assignSplitToDay(
                      "Saved routine",
                      routine.name,
                      routine.id,
                      routine,
                    )
                  }
                >
                  Assign
                </button>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() =>
                    onUpdate({
                      routineTemplates: workout.routineTemplates.filter(
                        (item) => item.id !== routine.id,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="workout-summary">
        <div>
          <strong>{setCount}</strong>
          <small>sets logged</small>
        </div>
        <div>
          <strong>{Math.round(volume).toLocaleString()}</strong>
          <small>kg volume</small>
        </div>
        <div>
          <strong>{Object.keys(records).length}</strong>
          <small>PR exercises</small>
        </div>
        <div>
          <strong>{(workout.history || []).length}</strong>
          <small>sessions</small>
        </div>
      </div>
      <div className="workout-session-bar">
        <div>
          <strong>
            {session
              ? `${session.focus || session.split || "Workout"} in progress`
              : "Ready to train?"}
          </strong>
          <small>
            {session
              ? `Started ${session.date} · ${sessionLoggedExercises.reduce((total, item) => total + Number(item.sets || 0), 0)} sets logged`
              : "Start a focused session and track every set."}
          </small>
        </div>
        <div className="workout-session-actions">
          {session && (
            <button
              type="button"
              className="subtle-btn"
              onClick={() => setFocusMode(true)}
            >
              Focus mode
            </button>
          )}
          <button
            className="primary-btn"
            onClick={() => {
              if (!session) {
                onUpdate({
                  currentSession: {
                    id: Date.now(),
                    date: todayKey(),
                    split: workout.split,
                  },
                });
                return;
              }
              const sessionExercises = exercises.filter(
                (item) => item.sessionId === session.id,
              );
              if (!sessionExercises.length) {
                onUpdate({ currentSession: null });
                return;
              }
              const sessionVolume = sessionExercises.reduce(
                (total, item) =>
                  total +
                  Number(item.sets || 0) *
                    Number(item.reps || 0) *
                    Number(item.weight || 0),
                0,
              );
              onUpdate({
                currentSession: null,
                history: [
                  ...(workout.history || []),
                  {
                    ...session,
                    finished: todayKey(),
                    volume: sessionVolume,
                    exerciseCount: sessionExercises.length,
                  },
                ],
              });
            }}
          >
            {session ? "Finish workout" : "Start workout"}
          </button>
        </div>
      </div>
      {session && sessionLineup.length > 0 && (
        <section
          className="workout-session-lineup"
          aria-label="Current workout exercise list"
        >
          <div className="workout-session-lineup-heading">
            <div>
              <strong>Today’s session</strong>
              <span>{sessionLineup.length} exercises planned</span>
            </div>
            <div className="workout-session-progress-summary">
              <span className="workout-session-progress">
                {sessionLoggedSets} / {sessionTargetSets} sets
              </span>
              <button
                type="button"
                className="workout-session-continue"
                onClick={continueWorkout}
                disabled={completedSessionExercises === sessionLineup.length}
              >
                {completedSessionExercises === sessionLineup.length
                  ? "All done"
                  : "Continue workout"}
              </button>
            </div>
          </div>
          <div
            className="workout-session-progress-track"
            role="progressbar"
            aria-label="Workout session progress"
            aria-valuemin="0"
            aria-valuemax={sessionTargetSets}
            aria-valuenow={sessionLoggedSets}
          >
            <span style={{ width: `${sessionProgress}%` }} />
          </div>
          <div className="workout-session-progress-caption">
            {completedSessionExercises} of {sessionLineup.length} exercises
            complete
          </div>
          <div className="workout-session-lineup-list">
            {sessionLineup.map((item, index) => (
              <div
                className={`workout-session-lineup-item ${item.loggedSets >= item.sets ? "logged" : ""} ${selectedExercise.toLowerCase() === item.name.toLowerCase() ? "selected" : ""}`}
                key={item.id}
              >
                <span className="workout-session-lineup-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.planned
                      ? `${item.sets} sets × ${item.reps} reps`
                      : "Added during session"}
                    {` · ${Math.min(item.loggedSets, item.sets)}/${item.sets} sets`}
                  </small>
                </div>
                <span className="workout-session-lineup-status">
                  {item.loggedSets >= item.sets
                    ? "Complete"
                    : selectedExercise.toLowerCase() === item.name.toLowerCase()
                      ? "Selected"
                      : item.loggedSets
                        ? "In progress"
                        : "Up next"}
                </span>
                <button
                  type="button"
                  className="workout-session-lineup-load"
                  aria-label={`Load ${item.name} (${Math.min(item.loggedSets, item.sets)} of ${item.sets} sets complete)`}
                  onClick={() => loadExercise(item.name, item)}
                >
                  {selectedExercise.toLowerCase() === item.name.toLowerCase()
                    ? "Selected"
                    : "Load"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="workout-select">
        <label>
          Lifting units
          <select
            value={weightUnit}
            onChange={(event) => changeWeightUnit(event.target.value)}
          >
            <option value="kg">Kilograms (kg)</option>
            <option value="lb">Pounds (lb)</option>
          </select>
        </label>
        <label>
          Training split
          <select
            value={workout.split}
            onChange={(event) => onUpdate({ split: event.target.value })}
          >
            <option>Upper / Lower</option>
            <option>Push / Pull / Legs</option>
            <option>Full body</option>
          </select>
        </label>
      </div>
      <div className="workout-template-row">
        <div className="workout-subheading">
          <h3>Workout split templates</h3>
          <span>Start a split now or add it to {selectedPlanDay}</span>
        </div>
        {workout.templates.map((template) => (
          <div className="workout-routine-template" key={template}>
            <strong>{template}</strong>
            <div>
              {Object.keys(ROUTINE_EXERCISES[template] || {}).map((focus) => (
                <Fragment key={focus}>
                  <button
                    type="button"
                    className={
                      session?.split === template && session?.focus === focus
                        ? "selected"
                        : ""
                    }
                    onClick={() => startRoutine(template, focus)}
                  >
                    Start {focus}
                  </button>
                  <button
                    type="button"
                    className={
                      workout.daySplits?.[selectedPlanDay]?.templateId ===
                      `builtin:${template}:${focus}`
                        ? "selected"
                        : ""
                    }
                    aria-label={`Assign ${template} ${focus} split to ${selectedPlanDay}`}
                    onClick={() => assignSplitToDay(template, focus)}
                  >
                    {workout.daySplits?.[selectedPlanDay]?.templateId ===
                    `builtin:${template}:${focus}`
                      ? `Assigned to ${selectedPlanDay}`
                      : `Schedule ${focus}`}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="exercise-form">
        <label className="exercise-field">
          <span>Exercise</span>
          <input
            ref={exerciseNameInputRef}
            list="workout-exercises"
            placeholder="e.g. Squat"
            value={exercise.name}
            onChange={(event) =>
              setExercise({ ...exercise, name: event.target.value })
            }
          />
        </label>
        <datalist id="workout-exercises">
          {[...new Set(workout.library)].map((item) => (
            <option value={item} key={item} />
          ))}
        </datalist>
        <label className="exercise-field">
          <span>Sets</span>
          <input
            type="number"
            min="1"
            value={exercise.sets}
            onChange={(event) =>
              setExercise({ ...exercise, sets: event.target.value })
            }
          />
        </label>
        <label className="exercise-field">
          <span>Reps</span>
          <input
            type="number"
            min="1"
            value={exercise.reps}
            onChange={(event) =>
              setExercise({ ...exercise, reps: event.target.value })
            }
          />
        </label>
        <label className="exercise-field">
          <span>Weight ({weightUnit})</span>
          <input
            type="number"
            min="0"
            value={exercise.weight}
            onChange={(event) =>
              setExercise({ ...exercise, weight: event.target.value })
            }
          />
        </label>
        <label className="exercise-field">
          <span>RPE</span>
          <input
            type="number"
            min="1"
            max="10"
            value={exercise.rpe}
            onChange={(event) =>
              setExercise({ ...exercise, rpe: event.target.value })
            }
          />
        </label>
        <button className="primary-btn" onClick={saveExercise}>
          Log set
        </button>
      </div>
      {overloadHint && <p className="workout-overload-hint">{overloadHint}</p>}
      <details className="workout-warmup-tool">
        <summary>Warm-up and plate calculator</summary>
        <div className="workout-warmup-controls">
          <label>
            Gym preset
            <select
              value={activePlatePreset?.name || ""}
              onChange={(event) => {
                const nextPreset = platePresets.find(
                  (preset) => preset.name === event.target.value,
                );
                if (!nextPreset) return;
                setBarWeight(nextPreset.barWeight);
                setPlateIncrement(nextPreset.plateIncrement);
                onUpdate({ activePlatePreset: nextPreset.name });
              }}
            >
              {platePresets.map((preset) => (
                <option key={preset.name}>{preset.name}</option>
              ))}
            </select>
          </label>
          <label>
            Target weight ({weightUnit})
            <input
              type="number"
              min="1"
              value={warmupTarget}
              onChange={(event) => setWarmupTarget(event.target.value)}
              placeholder={weightUnit === "kg" ? "e.g. 80" : "e.g. 175"}
            />
          </label>
          <label>
            Bar weight ({weightUnit})
            <input
              type="number"
              min="0"
              value={toDisplayWeight(barWeight)}
              onChange={(event) =>
                updatePlatePreset({
                  barWeight: Math.max(
                    0,
                    fromDisplayWeight(event.target.value) || 0,
                  ),
                })
              }
            />
          </label>
          <label>
            Plate increment ({weightUnit})
            <input
              type="number"
              min="0.5"
              step={weightUnit === "kg" ? "0.5" : "1"}
              value={toDisplayWeight(plateIncrement)}
              onChange={(event) =>
                updatePlatePreset({
                  plateIncrement: Math.max(
                    0.5,
                    fromDisplayWeight(event.target.value) || 0.5,
                  ),
                })
              }
            />
          </label>
        </div>
        <form
          className="workout-plate-preset-form"
          onSubmit={(event) => {
            event.preventDefault();
            addPlatePreset();
          }}
        >
          <input
            value={newPlatePresetName}
            maxLength={40}
            onChange={(event) => setNewPlatePresetName(event.target.value)}
            placeholder="Name this gym preset"
            aria-label="New gym plate preset name"
          />
          <button
            type="submit"
            className="text-button"
            disabled={
              !newPlatePresetName.trim() ||
              platePresets.some(
                (preset) =>
                  preset.name.toLowerCase() ===
                  newPlatePresetName.trim().toLowerCase(),
              )
            }
          >
            Save gym preset
          </button>
        </form>
        {warmupSets.length ? (
          <ol className="workout-warmup-list">
            {warmupSets.map((set) => (
              <li key={set.percent}>
                <span>
                  {set.percent}% × {set.reps} reps
                </span>
                <strong>
                  {toDisplayWeight(set.weight)} {weightUnit}
                </strong>
                <small>
                  {barWeight > 0
                    ? `+ ${Math.max(0, Math.round((set.weight - barWeight) / (plateIncrement * 2)))} plate pair${Math.round((set.weight - barWeight) / (plateIncrement * 2)) === 1 ? "" : "s"} of ${toDisplayWeight(plateIncrement)} ${weightUnit}`
                    : "Use available plates"}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>Enter a target weight to build gradual warm-up sets.</p>
        )}
      </details>
      <div className="rest-timer">
        Rest timer:{" "}
        <strong aria-live="polite">
          {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}
        </strong>
        <div
          className="rest-timer-track"
          role="progressbar"
          aria-label="Rest timer remaining"
          aria-valuemin="0"
          aria-valuemax={restTotal}
          aria-valuenow={rest}
        >
          <i
            style={{ width: `${restTotal ? (rest / restTotal) * 100 : 0}%` }}
          />
        </div>
        <button type="button" onClick={() => startRest()}>
          {rest ? "Restart" : "Start rest"}
        </button>
        <button
          type="button"
          onClick={() => setRestPaused((paused) => !paused)}
          disabled={!rest}
        >
          {restPaused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={() => adjustRest(30)} disabled={!rest}>
          +30 sec
        </button>
        <button type="button" onClick={() => setRest(0)} disabled={!rest}>
          Stop
        </button>
      </div>
      {workout.exercises.length ? (
        workout.exercises
          .slice(-5)
          .reverse()
          .map((item, index) => (
            <div className="feature-line" key={`${item.name}-${index}`}>
              <span className="workout-log-exercise">
                <NavIcon name="activity" />
                {item.name}
              </span>
              <span className="muted">
                {item.sets} × {item.reps} @{" "}
                {toDisplayWeight(item.weight) || "—"} {weightUnit} · RPE{" "}
                {item.rpe || "—"}
              </span>
            </div>
          ))
      ) : (
        <div className="friendly-empty workout-empty-state">
          <Icon name="CircleDashed" size={20} />
          <div>
            <strong>Your workout log is ready.</strong>
            <p>
              Start a session and log a set to see your training history here.
            </p>
          </div>
        </div>
      )}
      <section className="workout-history-panel">
        <div className="workout-history-heading">
          <div className="workout-subheading">
            <h3>Workout history</h3>
            <span>Review your completed sessions and exercise details</span>
          </div>
          <strong>
            {completedSessions.length}{" "}
            {completedSessions.length === 1 ? "session" : "sessions"}
          </strong>
        </div>
        {completedSessions.length ? (
          <div className="workout-history-list">
            {completedSessions.map((entry, index) => (
              <details
                className="workout-history-session"
                key={entry.displayId}
              >
                <summary>
                  <span className="workout-history-session-index">
                    {String(completedSessions.length - index).padStart(2, "0")}
                  </span>
                  <span className="workout-history-session-title">
                    <strong>
                      {entry.focus || entry.split || "Workout session"}
                    </strong>
                    <small>
                      {entry.finished || entry.date || "Date not recorded"}
                    </small>
                  </span>
                  <span className="workout-history-session-stat">
                    <strong>
                      {entry.sessionExercises.length ||
                        entry.exerciseCount ||
                        0}
                    </strong>
                    <small>exercises</small>
                  </span>
                  <span className="workout-history-session-stat">
                    <strong>{entry.setCount}</strong>
                    <small>sets</small>
                  </span>
                  <span className="workout-history-session-volume">
                    {Math.round(entry.volume).toLocaleString()} kg
                    <small>volume</small>
                  </span>
                </summary>
                {entry.sessionExercises.length ? (
                  <>
                    <div className="workout-history-session-actions">
                      <button
                        type="button"
                        onClick={() => repeatWorkout(entry)}
                      >
                        Repeat workout
                      </button>
                    </div>
                    <div className="workout-history-exercises">
                      {entry.sessionExercises.map((item, exerciseIndex) => (
                        <div
                          className="workout-history-exercise"
                          key={`${entry.displayId}-${item.name}-${exerciseIndex}`}
                        >
                          <span className="workout-history-exercise-index">
                            {String(exerciseIndex + 1).padStart(2, "0")}
                          </span>
                          <strong>{item.name}</strong>
                          <span>
                            {item.sets} × {item.reps} @{" "}
                            {toDisplayWeight(item.weight) || "—"} {weightUnit}
                          </span>
                          <small>RPE {item.rpe || "—"}</small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="workout-history-unavailable">
                    Exercise details are not available for this older session.
                  </p>
                )}
              </details>
            ))}
          </div>
        ) : (
          <p className="workout-history-empty">
            Finished workouts will appear here with their complete exercise
            lists.
          </p>
        )}
      </section>
      <details className="workout-progress-details collapsible-panel" open>
        <summary>
          <strong>Records &amp; recovery</strong>
          <span>Progress, exercise history, and recovery</span>
        </summary>
        <div className="workout-columns">
          <div>
            <div className="workout-subheading">
              <h3>Personal records</h3>
              <span>Heaviest set and estimated 1RM</span>
            </div>
            {Object.entries(records)
              .slice(0, 5)
              .map(([key, record]) => (
                <div className="record-line" key={key}>
                  <span>
                    {record.name}
                    <b className="workout-pr-badge">PR</b>
                  </span>
                  <strong>
                    {toDisplayWeight(record.weight) || "—"} {weightUnit}{" "}
                    <small>
                      × {record.reps} · est. 1RM{" "}
                      {toDisplayWeight(record.oneRepMax)} {weightUnit}
                    </small>
                  </strong>
                </div>
              ))}
            {!Object.keys(records).length && (
              <p className="muted workout-records-empty">
                Log a set to start tracking records.
              </p>
            )}
            <label className="workout-history-select">
              Exercise history
              <select
                value={selectedExercise}
                onChange={(event) => setSelectedExercise(event.target.value)}
              >
                <option value="">Choose an exercise</option>
                {Object.entries(records).map(([key, record]) => (
                  <option key={key}>{record.name}</option>
                ))}
              </select>
            </label>
            {selectedExercise &&
              (() => {
                const history = exercises
                  .filter(
                    (item) =>
                      String(item.name || "").toLowerCase() ===
                      selectedExercise.toLowerCase(),
                  )
                  .slice(-8);
                if (!history.length) return null;
                const maxWeight = Math.max(
                  1,
                  ...history.map((item) => Number(item.weight || 0)),
                );
                return (
                  <div
                    className="workout-history-chart"
                    aria-label={`${selectedExercise} weight history`}
                  >
                    {history.map((item, index) => (
                      <div
                        key={`${item.date}-${index}`}
                        title={`${item.date}: ${item.weight} kg × ${item.reps} reps`}
                      >
                        <i
                          style={{
                            height: `${Math.max(8, (Number(item.weight || 0) / maxWeight) * 100)}%`,
                          }}
                        />
                        <b
                          style={{
                            height: `${Math.max(8, (Number(item.reps || 0) / Math.max(1, ...history.map((entry) => Number(entry.reps || 0)))) * 100)}%`,
                          }}
                        />
                        <small>{item.date.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                );
              })()}
            {selectedExercise &&
              (() => {
                const history = exercises
                  .filter(
                    (item) =>
                      String(item.name || "").toLowerCase() ===
                      selectedExercise.toLowerCase(),
                  )
                  .slice(-8);
                if (history.length < 2) return null;
                const maxOneRepMax = Math.max(
                  1,
                  ...history.map((item) =>
                    estimateOneRepMax(item.weight, item.reps),
                  ),
                );
                const latest = estimateOneRepMax(
                  history.at(-1).weight,
                  history.at(-1).reps,
                );
                const previous = estimateOneRepMax(
                  history.at(-2).weight,
                  history.at(-2).reps,
                );
                return (
                  <>
                    {latest < previous && (
                      <p className="workout-one-rm-drop" role="status">
                        Estimated 1RM is down from the previous logged set.
                        Consider recovery before increasing the load.
                      </p>
                    )}
                    <div
                      className="workout-one-rm-chart"
                      role="img"
                      aria-label={`${selectedExercise} estimated one-rep max trend`}
                    >
                      <strong>Estimated one-rep max</strong>
                      <div>
                        {history.map((item, index) => {
                          const value = estimateOneRepMax(
                            item.weight,
                            item.reps,
                          );
                          return (
                            <span
                              key={`${item.date}-${index}`}
                              title={`${item.date}: ${toDisplayWeight(value)} ${weightUnit}`}
                            >
                              <i
                                style={{
                                  height: `${Math.max(8, (value / maxOneRepMax) * 100)}%`,
                                }}
                              />
                              <small>{item.date.slice(5)}</small>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
          </div>
          <div>
            <div className="workout-subheading">
              <h3>Recovery</h3>
              <span>How are you feeling?</span>
            </div>
            <div className="recovery-controls">
              <label>
                <span>
                  <span>Soreness</span>
                  <strong>{workout.recovery.soreness} / 5</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={workout.recovery.soreness}
                  onChange={(event) =>
                    onUpdate({
                      recovery: {
                        ...workout.recovery,
                        soreness: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                <span>
                  <span>Energy</span>
                  <strong>{workout.recovery.energy} / 5</strong>
                </span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={workout.recovery.energy}
                  onChange={(event) =>
                    onUpdate({
                      recovery: {
                        ...workout.recovery,
                        energy: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </details>
      <div className="workout-measurements">
        <div className="workout-subheading">
          <h3>Body measurements</h3>
          <span>Private on this device</span>
        </div>
        <div className="bmi-panel">
          <div className="measurement-form bmi-inputs">
            {["height", "weight", "waist"].map((field) => (
              <label className="measurement-field" key={field}>
                <span>
                  {field === "height"
                    ? "Height (cm)"
                    : field === "weight"
                      ? "Weight (kg)"
                      : "Waist (cm)"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={measurement[field]}
                  onChange={(event) =>
                    setMeasurement({
                      ...measurement,
                      [field]: event.target.value,
                    })
                  }
                  aria-label={
                    field === "height"
                      ? "Height in centimeters"
                      : field === "weight"
                        ? "Weight in kilograms"
                        : "Waist in centimeters"
                  }
                />
              </label>
            ))}
          </div>
          <div className={`bmi-result ${bmi ? "has-value" : ""}`}>
            <strong>{bmi ? bmi.toFixed(1) : "—"}</strong>
            <span>{bmiCategory}</span>
          </div>
          <button
            className="text-button bmi-save"
            onClick={() => {
              const weight = Number(measurement.weight);
              const height = Number(measurement.height);
              const waist = Number(measurement.waist);
              if (
                !Number.isFinite(weight) ||
                !Number.isFinite(height) ||
                !Number.isFinite(waist)
              )
                return;
              const cleanWeight = Math.max(0, Math.min(400, weight));
              const cleanHeight = Math.max(1, Math.min(250, height));
              const cleanWaist = Math.max(0, Math.min(200, waist));
              if (cleanWeight <= 0 && cleanHeight <= 0 && cleanWaist <= 0)
                return;
              onUpdate({
                weight: cleanWeight > 0 ? cleanWeight : workout.weight,
                height: cleanHeight > 0 ? cleanHeight : workout.height,
                waist: cleanWaist > 0 ? cleanWaist : workout.waist,
                measurementHistory: [
                  ...(workout.measurementHistory || []),
                  {
                    id: createId(),
                    date: todayKey(),
                    weight: cleanWeight || 0,
                    waist: cleanWaist || 0,
                  },
                ],
              });
            }}
          >
            Save check-in
          </button>
        </div>
        {(workout.measurementHistory || [])
          .slice(-5)
          .reverse()
          .map((entry) => (
            <div className="workout-measurement-entry" key={entry.id}>
              <span>{entry.date}</span>
              <strong>{entry.weight || "—"} kg</strong>
              <small>Waist {entry.waist || "—"} cm</small>
              <button
                type="button"
                className="workout-measurement-delete"
                aria-label={`Delete check-in from ${entry.date}`}
                title="Delete check-in"
                onClick={() =>
                  onUpdate({
                    measurementHistory: (
                      workout.measurementHistory || []
                    ).filter((item) => item.id !== entry.id),
                  })
                }
              >
                <Icon name="X" size={16} />
              </button>
            </div>
          ))}
        {measurements.length > 1 && (
          <section
            className="workout-measurement-chart"
            aria-label="Recent body measurement trends"
          >
            <h4>Recent measurements</h4>
            <div className="measurement-chart-series">
              {measurements.map((entry) => {
                const maxWeight = Math.max(
                  1,
                  ...measurements.map((item) => Number(item.weight) || 0),
                );
                const maxWaist = Math.max(
                  1,
                  ...measurements.map((item) => Number(item.waist) || 0),
                );
                return (
                  <div
                    key={entry.id}
                    title={`${entry.date}: ${entry.weight || "—"} kg, waist ${entry.waist || "—"} cm`}
                  >
                    <span>
                      <i
                        style={{
                          height: `${Math.max(4, ((Number(entry.weight) || 0) / maxWeight) * 100)}%`,
                        }}
                      />
                      <b
                        style={{
                          height: `${Math.max(4, ((Number(entry.waist) || 0) / maxWaist) * 100)}%`,
                        }}
                      />
                    </span>
                    <small>{entry.date.slice(5)}</small>
                  </div>
                );
              })}
            </div>
            <p>
              <i className="measurement-weight-key" /> Weight ·{" "}
              <i className="measurement-waist-key" /> Waist. Each series is
              scaled independently.
            </p>
          </section>
        )}
        <div className="workout-photo-tools">
          <label className="text-button">
            Add progress photo
            <input type="file" accept="image/*" onChange={addBodyPhoto} />
          </label>
          <small>
            Images are resized on this device before they are saved.
          </small>
        </div>
        {photoError && (
          <p className="file-import-error" role="alert">
            {photoError}
          </p>
        )}
        {(workout.bodyPhotos || [])
          .slice(-6)
          .reverse()
          .map((photo) => (
            <figure className="workout-photo-entry" key={photo.id}>
              <img
                src={photo.source}
                alt={`Body progress from ${photo.date}`}
              />
              <figcaption>
                {photo.date}
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() =>
                    onUpdate({
                      bodyPhotos: workout.bodyPhotos.filter(
                        (item) => item.id !== photo.id,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
      </div>
      <div className="exercise-library">
        <div className="exercise-library-heading">
          <div className="workout-subheading">
            <h3>Exercise library</h3>
            <span>Browse by muscle group and equipment</span>
          </div>
          <button
            type="button"
            className="exercise-library-toggle"
            aria-expanded={showExerciseLibrary}
            aria-controls="exercise-library-content"
            onClick={() => setShowExerciseLibrary((visible) => !visible)}
          >
            {showExerciseLibrary ? "Hide exercises" : "Show exercises"}
          </button>
        </div>
        {showExerciseLibrary && (
          <div id="exercise-library-content">
            <div className="exercise-library-filters">
              <label className="exercise-library-search">
                <span>Search exercises</span>
                <input
                  type="search"
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  placeholder="Try “row” or “press”"
                />
              </label>
              <label>
                <span>Muscle group</span>
                <select
                  value={exerciseMuscleFilter}
                  onChange={(event) =>
                    setExerciseMuscleFilter(event.target.value)
                  }
                >
                  {EXERCISE_MUSCLE_FILTERS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Equipment</span>
                <select
                  value={exerciseEquipmentFilter}
                  onChange={(event) =>
                    setExerciseEquipmentFilter(event.target.value)
                  }
                >
                  {EXERCISE_EQUIPMENT_FILTERS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="exercise-library-results-heading">
              <strong>
                {visibleExerciseCatalog.length === exerciseCatalog.length
                  ? `${exerciseCatalog.length} exercises`
                  : `Showing ${visibleExerciseCatalog.length} of ${exerciseCatalog.length} exercises`}
              </strong>
              <span>Select an exercise to load into the workout log</span>
            </div>
            {exerciseCatalog.length ? (
              <div className="exercise-catalog">
                {visibleExerciseCatalog.map((item) => (
                  <article
                    className="exercise-catalog-item"
                    key={`${item.name}-${item.equipment}`}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <span className="exercise-catalog-tags">
                        <span>{item.muscle}</span>
                        <span>{item.equipment}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Load ${item.name} into the workout log`}
                      onClick={() => loadExercise(item.name)}
                    >
                      Load
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="exercise-catalog-empty">
                No exercises match these filters. Try another search or add your
                own below.
              </p>
            )}
            {exerciseCatalog.length > 8 && (
              <button
                type="button"
                className="exercise-catalog-toggle"
                aria-expanded={showAllExercises}
                onClick={() => setShowAllExercises((value) => !value)}
              >
                {showAllExercises
                  ? "Hide all"
                  : `See all ${exerciseCatalog.length}`}
              </button>
            )}
            <div className="library-add">
              <input
                value={libraryName}
                onChange={(event) => setLibraryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomExercise();
                  }
                }}
                placeholder="Add a custom exercise"
                aria-label="Custom exercise name"
              />
              <button
                type="button"
                className="text-button"
                onClick={addCustomExercise}
                disabled={!libraryName.trim()}
              >
                Add exercise
              </button>
            </div>
          </div>
        )}
      </div>
      <textarea
        className="journal-input"
        value={workout.measurements}
        onChange={(event) => onUpdate({ measurements: event.target.value })}
        placeholder="Workout notes or progress reflection"
      />
      {focusMode && (
        <div
          className="workout-focus-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusMode(false);
          }}
        >
          <section
            className="workout-focus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-focus-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setFocusMode(false);
                return;
              }
              trapDialogFocus(event);
            }}
          >
            <header>
              <div>
                <p className="eyebrow">TRAINING MODE</p>
                <h2 id="workout-focus-title">
                  {session?.focus || session?.split || "Workout session"}
                </h2>
                <span>
                  {session ? `Started ${session.date}` : "Ready when you are"}
                </span>
              </div>
              <button
                type="button"
                className="close"
                autoFocus
                onClick={() => setFocusMode(false)}
                aria-label="Close workout focus mode"
                title="Close workout focus mode"
              >
                <Icon name="X" size={18} />
              </button>
            </header>
            <div className="workout-focus-rest">
              <span>Rest timer</span>
              <strong aria-live="polite">
                {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}
              </strong>
              <div
                className="rest-timer-track"
                role="progressbar"
                aria-label="Rest timer remaining"
                aria-valuemin="0"
                aria-valuemax={restTotal}
                aria-valuenow={rest}
              >
                <i
                  style={{
                    width: `${restTotal ? (rest / restTotal) * 100 : 0}%`,
                  }}
                />
              </div>
              <div>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => startRest()}
                >
                  {rest ? "Restart" : "Start rest"}
                </button>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => setRestPaused((paused) => !paused)}
                  disabled={!rest}
                >
                  {restPaused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => adjustRest(30)}
                  disabled={!rest}
                >
                  +30 sec
                </button>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => setRest(0)}
                  disabled={!rest}
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="workout-focus-form">
              <label>
                Exercise
                <input
                  value={exercise.name}
                  onChange={(event) =>
                    setExercise({ ...exercise, name: event.target.value })
                  }
                  placeholder="Choose an exercise"
                  list="workout-exercises"
                  autoFocus
                />
              </label>
              <div>
                <label>
                  Sets
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={exercise.sets}
                    onChange={(event) =>
                      setExercise({ ...exercise, sets: event.target.value })
                    }
                  />
                </label>
                <label>
                  Reps
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={exercise.reps}
                    onChange={(event) =>
                      setExercise({ ...exercise, reps: event.target.value })
                    }
                  />
                </label>
                <label>
                  Weight ({weightUnit})
                  <input
                    type="number"
                    min="0"
                    value={exercise.weight}
                    onChange={(event) =>
                      setExercise({ ...exercise, weight: event.target.value })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-btn"
                disabled={!exercise.name.trim()}
                onClick={saveExercise}
              >
                Log set
              </button>
            </div>
            <p className="workout-focus-hint">
              One set at a time. Rest whenever you need it.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

let youtubeIframeApiPromise;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const previousCallback = window.onYouTubeIframeAPIReady;
    const script =
      document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      ) || document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      youtubeIframeApiPromise = null;
      reject(
        new Error(
          "YouTube player took too long to load. Check your connection and try again.",
        ),
      );
    }, 20000);

    window.onYouTubeIframeAPIReady = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeoutId);
        if (window.YT?.Player) {
          resolve(window.YT);
        } else {
          youtubeIframeApiPromise = null;
          reject(
            new Error(
              "YouTube player could not be initialized. Please try again.",
            ),
          );
        }
      }
      previousCallback?.();
    };

    if (!script.src) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        youtubeIframeApiPromise = null;
        reject(
          new Error(
            "YouTube player could not load. Check your connection or privacy settings.",
          ),
        );
      };
      document.head.appendChild(script);
    }
  });
  return youtubeIframeApiPromise;
}

function getYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") || "";
      } else {
        videoId =
          url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
      }
    }
    return /^[\w-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function YouTubeLearningPlayer({ videoId, title, onWatchLog, onClose }) {
  const playerElementRef = useRef(null);
  const playerRef = useRef(null);
  const watchedSinceRef = useRef(null);
  const sessionMillisecondsRef = useRef(0);
  const onWatchLogRef = useRef(onWatchLog);
  const [playerError, setPlayerError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchedSeconds, setWatchedSeconds] = useState(0);

  useEffect(() => {
    onWatchLogRef.current = onWatchLog;
  }, [onWatchLog]);

  const flushWatchTime = () => {
    if (watchedSinceRef.current === null) return;
    const watchedMilliseconds = Date.now() - watchedSinceRef.current;
    sessionMillisecondsRef.current += watchedMilliseconds;
    watchedSinceRef.current = null;
    if (watchedMilliseconds <= 0) return;
    onWatchLogRef.current({
      minutes: Number((watchedMilliseconds / 60000).toFixed(2)),
      note: `YouTube: ${title}`,
      source: "youtube",
    });
  };
  const flushWatchTimeRef = useRef(flushWatchTime);
  useEffect(() => {
    flushWatchTimeRef.current = flushWatchTime;
  });

  useEffect(() => {
    let cancelled = false;
    let tickerId;
    const stopTicker = () => {
      window.clearInterval(tickerId);
      tickerId = undefined;
    };
    const stopPlaybackTracking = () => {
      stopTicker();
      flushWatchTimeRef.current();
      setIsPlaying(false);
      setWatchedSeconds(Math.floor(sessionMillisecondsRef.current / 1000));
    };

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !playerElementRef.current) return;
        playerRef.current = new youtube.Player(playerElementRef.current, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onStateChange: ({ data }) => {
              if (data === youtube.PlayerState.PLAYING) {
                if (watchedSinceRef.current !== null) return;
                watchedSinceRef.current = Date.now();
                setIsPlaying(true);
                tickerId = window.setInterval(() => {
                  const currentSession =
                    sessionMillisecondsRef.current +
                    (watchedSinceRef.current === null
                      ? 0
                      : Date.now() - watchedSinceRef.current);
                  setWatchedSeconds(Math.floor(currentSession / 1000));
                }, 1000);
              } else {
                stopPlaybackTracking();
              }
            },
            onError: ({ data }) => {
              stopPlaybackTracking();
              const messages = {
                2: "This YouTube link is invalid.",
                5: "This video can’t be played in the embedded player.",
                100: "This video is unavailable or private.",
                101: "The video owner doesn’t allow embedded playback.",
                150: "The video owner doesn’t allow embedded playback.",
              };
              setPlayerError(
                messages[data] || "YouTube couldn’t play this video.",
              );
            },
          },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Could not load the YouTube player.", error);
        setPlayerError(
          error instanceof Error
            ? error.message
            : "Could not load the YouTube player.",
        );
      });

    return () => {
      cancelled = true;
      stopTicker();
      flushWatchTimeRef.current();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  const formattedTime = `${String(Math.floor(watchedSeconds / 60)).padStart(2, "0")}:${String(watchedSeconds % 60).padStart(2, "0")}`;
  return (
    <div className="learning-youtube-player">
      <div className="learning-youtube-player-heading">
        <span>
          {isPlaying ? "Watching in Daymark" : "YouTube watch time"} ·{" "}
          {formattedTime}
        </span>
        <button type="button" className="text-button" onClick={onClose}>
          Close player
        </button>
      </div>
      {playerError ? (
        <p className="file-import-error" role="alert">
          {playerError}
        </p>
      ) : (
        <div className="learning-youtube-frame" ref={playerElementRef} />
      )}
      <small>Watch time counts only while this video is playing here.</small>
    </div>
  );
}

function LearningCard({
  items,
  onAdd,
  onUpdate,
  onDelete,
  onLog,
  onSendToStudy,
  onRequestReminders,
}) {
  const [activeYoutube, setActiveYoutube] = useState(null);
  const [goalSearch, setGoalSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [showAllLearningGoals, setShowAllLearningGoals] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: "Coding",
    deadline: "",
    targetHours: 10,
    includeReadingList: false,
  });
  const [stepDrafts, setStepDrafts] = useState({});
  const [resourceDrafts, setResourceDrafts] = useState({});
  const [resourceErrors, setResourceErrors] = useState({});
  const resourceFormRefs = useRef({});
  const [logDrafts, setLogDrafts] = useState({});
  const [readingDrafts, setReadingDrafts] = useState({});
  const [readingLogDrafts, setReadingLogDrafts] = useState({});
  const addGoalOptionsRef = useRef(null);
  const activeLearningTimer = items.find((item) => item.focusTimerEnd);
  const [focusGoal, setFocusGoal] = useState(activeLearningTimer?.id || "");
  const [focusEnd, setFocusEnd] = useState(
    activeLearningTimer?.focusTimerEnd || null,
  );
  const [focusNow, setFocusNow] = useState(0);
  const itemsRef = useRef(items);
  const onLogRef = useRef(onLog);
  useEffect(() => {
    itemsRef.current = items;
    onLogRef.current = onLog;
  }, [items, onLog]);

  useEffect(() => {
    if (!focusEnd) return undefined;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setFocusNow(timestamp);
      if (timestamp < focusEnd) return;
      const goal = itemsRef.current.find((item) => item.id === focusGoal);
      if (goal)
        onLogRef.current(goal.id, {
          minutes: 25,
          source: "focus",
          note: `Focus session: ${goal.title}`,
        });
      setFocusEnd(null);
      setFocusGoal("");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusEnd, focusGoal]);

  const startFocus = (item) => {
    const timerEnd = Date.now() + 25 * 60 * 1000;
    setFocusGoal(item.id);
    setFocusEnd(timerEnd);
    setFocusNow(Date.now());
    onUpdate(item.id, { focusTimerEnd: timerEnd });
  };
  const focusRemaining = focusEnd
    ? Math.max(0, Math.ceil((focusEnd - focusNow) / 1000))
    : 0;
  const categoryTotals = items.reduce((totals, item) => {
    const category = item.category || item.type || "Other";
    totals[category] = totals[category] || { goals: 0, minutes: 0 };
    totals[category].goals += 1;
    totals[category].minutes += (item.logs || []).reduce(
      (sum, log) => sum + Number(log.minutes || 0),
      0,
    );
    return totals;
  }, {});
  const totalLearningMinutes = items.reduce(
    (sum, item) =>
      sum +
      (item.logs || []).reduce(
        (itemMinutes, log) => itemMinutes + Number(log.minutes || 0),
        0,
      ),
    0,
  );
  const completedStepCount = items.reduce(
    (sum, item) => sum + (item.steps || []).filter((step) => step.done).length,
    0,
  );
  const totalStepCount = items.reduce(
    (sum, item) => sum + (item.steps || []).length,
    0,
  );
  const learningCategories = [
    ...new Set(items.map((item) => item.category || item.type || "Other")),
  ];
  const visibleItems = items.filter((item) => {
    const matchesSearch = item.title
      .toLocaleLowerCase()
      .includes(goalSearch.trim().toLocaleLowerCase());
    const matchesCategory =
      categoryFilter === "All categories" ||
      (item.category || item.type || "Other") === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const addLearningGoal = (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    onAdd({
      title,
      category: draft.category,
      type: draft.category,
      deadline: draft.deadline,
      targetHours: Number(draft.targetHours),
      steps: [],
      resources: [],
      logs: [],
      readingList: [],
      readingListEnabled: draft.includeReadingList,
      badges: [],
      id: createId(),
    });
    setDraft({
      title: "",
      category: "Coding",
      deadline: "",
      targetHours: 10,
      includeReadingList: false,
    });
    if (addGoalOptionsRef.current) addGoalOptionsRef.current.open = false;
  };
  const addStep = (item) => {
    const title = (stepDrafts[item.id] || "").trim();
    if (!title) return;
    onUpdate(item.id, {
      steps: [...(item.steps || []), { id: createId(), title, done: false }],
    });
    setStepDrafts({ ...stepDrafts, [item.id]: "" });
  };
  const removeStep = (item, stepId) => {
    onUpdate(item.id, {
      steps: (item.steps || []).filter((step) => step.id !== stepId),
    });
  };
  const addResource = (item) => {
    const resource = resourceDrafts[item.id] || {};
    if (!resource.title?.trim() || !resource.url?.trim()) {
      setResourceErrors({
        ...resourceErrors,
        [item.id]: "Add a title and a link.",
      });
      return;
    }
    let url;
    try {
      url = new URL(resource.url);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Use an http or https link.");
    } catch {
      setResourceErrors({
        ...resourceErrors,
        [item.id]: "Enter a valid http or https link.",
      });
      return;
    }
    setResourceErrors({ ...resourceErrors, [item.id]: "" });
    onUpdate(item.id, {
      resources: [
        ...(item.resources || []),
        { id: createId(), title: resource.title.trim(), url: url.href },
      ],
    });
    setResourceDrafts({ ...resourceDrafts, [item.id]: { title: "", url: "" } });
    if (resourceFormRefs.current[item.id])
      resourceFormRefs.current[item.id].open = false;
  };
  const addReading = (item) => {
    const reading = readingDrafts[item.id] || {};
    if (!reading.title?.trim()) return;
    onUpdate(item.id, {
      readingList: [
        ...(item.readingList || []),
        {
          id: createId(),
          title: reading.title.trim(),
          status: "To read",
          rating: 0,
          takeaway: "",
          totalPages: Math.max(0, Number(reading.totalPages) || 0),
          pagesRead: 0,
          pageLogs: [],
        },
      ],
    });
    setReadingDrafts({
      ...readingDrafts,
      [item.id]: { title: "", totalPages: "" },
    });
  };
  const logReadingPages = (item, reading) => {
    const draftLog = readingLogDrafts[reading.id] || {};
    const pages = Math.max(0, Number(draftLog.pages) || 0);
    const minutes = Math.max(0, Number(draftLog.minutes) || 0);
    if (!pages) return;
    const pageLog = { id: createId(), date: todayKey(), pages, minutes };
    onUpdate(item.id, {
      readingList: (item.readingList || []).map((entry) =>
        entry.id === reading.id
          ? {
              ...entry,
              pagesRead: Math.min(
                Number(entry.totalPages) || Infinity,
                Number(entry.pagesRead || 0) + pages,
              ),
              pageLogs: [...(entry.pageLogs || []), pageLog],
            }
          : entry,
      ),
    });
    setReadingLogDrafts({
      ...readingLogDrafts,
      [reading.id]: { pages: "", minutes: "" },
    });
  };
  const removeResource = (item, resourceId) => {
    onUpdate(item.id, {
      resources: (item.resources || []).filter(
        (resource) => resource.id !== resourceId,
      ),
    });
  };
  const removeReading = (item, readingId) => {
    onUpdate(item.id, {
      readingList: (item.readingList || []).filter(
        (entry) => entry.id !== readingId,
      ),
    });
  };
  const scheduleReviews = async (item) => {
    await onRequestReminders();
    onUpdate(item.id, {
      reviewDates: [3, 7, 21].map((days) => {
        const date = dateFromKey(todayKey());
        date.setDate(date.getDate() + days);
        return dateKey(date);
      }),
    });
  };
  return (
    <div className="section feature-card" id="learning">
      <PageHeading
        eyebrow="LEARNING"
        title="Learning goals"
        subtitle="Track goals, steps, and time spent."
      />
      <section className="learning-overview" aria-label="Learning overview">
        <div>
          <span>Active goals</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Time invested</span>
          <strong>
            {totalLearningMinutes >= 60
              ? `${Math.floor(totalLearningMinutes / 60)}h ${totalLearningMinutes % 60}m`
              : `${totalLearningMinutes} min`}
          </strong>
        </div>
        <div>
          <span>Steps completed</span>
          <strong>
            {completedStepCount}
            <small> / {totalStepCount}</small>
          </strong>
        </div>
      </section>
      {Object.keys(categoryTotals).length > 0 && (
        <details className="learning-category-summary">
          <summary>Goals by category</summary>
          {Object.entries(categoryTotals).map(([category, total]) => (
            <div key={category}>
              <strong>{category}</strong>
              <span>
                {total.goals} goal{total.goals === 1 ? "" : "s"} ·{" "}
                {(total.minutes / 60).toFixed(1)}h
              </span>
            </div>
          ))}
        </details>
      )}
      <section
        className="learning-add-panel"
        aria-labelledby="learning-add-heading"
      >
        <div className="learning-add-heading">
          <strong id="learning-add-heading">Add a learning goal</strong>
          <span>Choose what you want to make progress on next.</span>
        </div>
        <form className="learning-add" onSubmit={addLearningGoal}>
          <input
            placeholder="e.g. Learn Python"
            aria-label="New learning goal"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
          <button
            type="submit"
            className="text-button"
            disabled={!draft.title.trim()}
          >
            <Icon name="Plus" size={16} /> Add goal
          </button>
          <details className="learning-add-options" ref={addGoalOptionsRef}>
            <summary>Set category, target date, and hours</summary>
            <div className="learning-add-fields">
              <label>
                Category
                <select
                  aria-label="New learning goal category"
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                >
                  {[
                    "Coding",
                    "Language",
                    "Music",
                    "Finance",
                    "Health",
                    "Other",
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Target date (optional)
                <input
                  type="date"
                  value={draft.deadline}
                  onChange={(event) =>
                    setDraft({ ...draft, deadline: event.target.value })
                  }
                  aria-label="Learning goal target date"
                />
              </label>
              <label>
                Target hours
                <input
                  type="number"
                  min="1"
                  value={draft.targetHours}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      targetHours: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                  aria-label="New learning goal target hours"
                />
              </label>
            </div>
            <label className="learning-add-checkbox">
              <input
                type="checkbox"
                checked={draft.includeReadingList}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    includeReadingList: event.target.checked,
                  })
                }
              />
              Include reading list (optional)
            </label>
          </details>
        </form>
      </section>
      {items.length > 0 && (
        <section
          className="learning-goal-tools"
          aria-label="Find learning goals"
        >
          <label className="learning-goal-search">
            <Icon name="Search" size={18} />
            <input
              type="search"
              value={goalSearch}
              onChange={(event) => setGoalSearch(event.target.value)}
              placeholder="Search goals"
              aria-label="Search learning goals"
            />
          </label>
          <label className="learning-category-filter">
            <span className="sr-only">Filter by category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option>All categories</option>
              {learningCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <span className="learning-result-count">
            {visibleItems.length} of {items.length} goal
            {items.length === 1 ? "" : "s"}
          </span>
        </section>
      )}
      {visibleItems.length === 0 && items.length > 0 && (
        <div className="learning-no-results" role="status">
          <strong>No goals match those filters.</strong>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setGoalSearch("");
              setCategoryFilter("All categories");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {visibleItems.length > 1 && (
        <button
          type="button"
          className="learning-goal-list-toggle"
          aria-expanded={showAllLearningGoals}
          onClick={() => setShowAllLearningGoals((showAll) => !showAll)}
        >
          {showAllLearningGoals
            ? "Show one goal"
            : `Show all ${visibleItems.length} goals`}
        </button>
      )}
      {visibleItems
        .slice(0, showAllLearningGoals ? visibleItems.length : 1)
        .map((item) => (
          <details className="learning-item" key={item.id}>
            <summary className="learning-goal-summary">
              <strong>{item.title}</strong>
              <span>{item.category || item.type || "Other"}</span>
            </summary>
            <div className="learning-goal-content">
              {(() => {
                const steps = item.steps || [];
                const completedSteps = steps.filter((step) => step.done).length;
                const progress = steps.length
                  ? Math.round((completedSteps / steps.length) * 100)
                  : 0;
                const logs = item.logs || [];
                const currentResource = (item.resources || []).find(
                  (resource) => resource.id === item.currentResourceId,
                );
                const totalMinutes = logs.reduce(
                  (sum, log) => sum + Number(log.minutes || 0),
                  0,
                );
                const weekStart = dateFromKey(weekStartKey());
                const weekMinutes = logs
                  .filter((log) => dateFromKey(log.date) >= weekStart)
                  .reduce((sum, log) => sum + Number(log.minutes || 0), 0);
                const deadlineDays = item.deadline
                  ? Math.ceil(
                      (dateFromKey(item.deadline) - dateFromKey(todayKey())) /
                        86400000,
                    )
                  : null;
                const remainingMinutes = Math.max(
                  0,
                  Number(item.targetHours || 0) * 60 - totalMinutes,
                );
                const dailyPace =
                  deadlineDays > 0
                    ? Math.ceil(remainingMinutes / deadlineDays)
                    : null;
                const lastWeek = Array.from({ length: 7 }, (_, index) => {
                  const date = dateFromKey(todayKey());
                  date.setDate(date.getDate() - 6 + index);
                  const key = dateKey(date);
                  const pages = (item.readingList || [])
                    .flatMap((reading) => reading.pageLogs || [])
                    .filter((log) => log.date === key)
                    .reduce((sum, log) => sum + Number(log.pages || 0), 0);
                  return {
                    key,
                    minutes: logs
                      .filter((log) => log.date === key)
                      .reduce((sum, log) => sum + Number(log.minutes || 0), 0),
                    pages,
                  };
                });
                const maxWeekMinutes = Math.max(
                  30,
                  ...lastWeek.map((day) => day.minutes),
                );
                const maxWeekPages = Math.max(
                  10,
                  ...lastWeek.map((day) => day.pages),
                );
                const lastMonth = Array.from({ length: 28 }, (_, index) => {
                  const date = dateFromKey(todayKey());
                  date.setDate(date.getDate() - 27 + index);
                  const key = dateKey(date);
                  return {
                    key,
                    minutes: logs
                      .filter((log) => log.date === key)
                      .reduce((sum, log) => sum + Number(log.minutes || 0), 0),
                  };
                });
                return (
                  <>
                    <div className="learning-title">
                      <input
                        value={item.title}
                        readOnly
                        aria-label="Learning goal title"
                      />
                      <span className="learning-item-meta">
                        {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
                        learned
                      </span>
                      <strong className="learning-progress-value">
                        {progress}%
                      </strong>
                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        aria-label={`Delete ${item.title}`}
                        title={`Delete ${item.title}`}
                      >
                        <Icon name="X" size={16} />
                      </button>
                    </div>
                    <div className="learning-progress-track">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                    <details className="learning-goal-edit">
                      <summary>Edit goal details</summary>
                      <div className="learning-goal-meta">
                        <label>
                          Category
                          <select
                            aria-label="Learning goal category"
                            value={item.category || item.type || "Coding"}
                            onChange={(event) =>
                              onUpdate(item.id, {
                                category: event.target.value,
                                type: event.target.value,
                              })
                            }
                          >
                            {[
                              "Coding",
                              "Language",
                              "Music",
                              "Finance",
                              "Health",
                              "Other",
                            ].map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Target date
                          <input
                            type="date"
                            aria-label="Learning goal target date"
                            value={item.deadline || ""}
                            onChange={(event) =>
                              onUpdate(item.id, {
                                deadline: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Target hours
                          <input
                            type="number"
                            min="1"
                            aria-label="Learning goal target hours"
                            value={item.targetHours || 10}
                            onChange={(event) =>
                              onUpdate(item.id, {
                                targetHours: Math.max(
                                  1,
                                  Number(event.target.value) || 1,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      {item.deadline && (
                        <p
                          className={`learning-pace ${deadlineDays <= 0 || (dailyPace !== null && weekMinutes / 7 < dailyPace) ? "behind" : ""}`}
                        >
                          {deadlineDays < 0
                            ? "Target date has passed"
                            : deadlineDays === 0
                              ? "Target date is today"
                              : `${dailyPace} min/day to reach ${item.targetHours || 10} hours by ${item.deadline}`}
                        </p>
                      )}
                    </details>
                    {item.readingListEnabled !== false && (
                      <section className="learning-subsection">
                        <div className="learning-subheading">
                          <strong>Steps</strong>
                          <span>
                            {completedSteps}/{steps.length} complete
                          </span>
                        </div>
                        {steps.map((step) => (
                          <label className="learning-step" key={step.id}>
                            <input
                              type="checkbox"
                              checked={Boolean(step.done)}
                              onChange={(event) => {
                                const nextSteps = steps.map((entry) =>
                                  entry.id === step.id
                                    ? { ...entry, done: event.target.checked }
                                    : entry,
                                );
                                onUpdate(item.id, { steps: nextSteps });
                              }}
                            />
                            <input
                              value={step.title}
                              onChange={(event) =>
                                onUpdate(item.id, {
                                  steps: steps.map((entry) =>
                                    entry.id === step.id
                                      ? { ...entry, title: event.target.value }
                                      : entry,
                                  ),
                                })
                              }
                              aria-label="Step title"
                            />
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => removeStep(item, step.id)}
                            >
                              Remove
                            </button>
                          </label>
                        ))}
                        <div className="learning-inline-add">
                          <input
                            value={stepDrafts[item.id] || ""}
                            onChange={(event) =>
                              setStepDrafts({
                                ...stepDrafts,
                                [item.id]: event.target.value,
                              })
                            }
                            placeholder="Add a lesson, chapter, or video"
                          />
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => addStep(item)}
                            disabled={!(stepDrafts[item.id] || "").trim()}
                          >
                            Add step
                          </button>
                        </div>
                      </section>
                    )}
                    <section className="learning-subsection">
                      <div className="learning-subheading">
                        <strong>Resources</strong>
                        <span>Resume where you left off</span>
                      </div>
                      {currentResource && (
                        <a
                          className="learning-resume-link"
                          href={currentResource.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Resume: {currentResource.title}{" "}
                          <Icon name="ArrowUpRight" size={16} />
                        </a>
                      )}
                      {(item.resources || []).map((resource) => (
                        <Fragment key={resource.id}>
                          <div className="learning-resource-row">
                            <strong className="learning-resource-title">
                              {resource.title}
                            </strong>
                            <a
                              className="learning-resource-open"
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open link <Icon name="ArrowUpRight" size={16} />
                            </a>
                            {getYouTubeVideoId(resource.url) && (
                              <button
                                type="button"
                                className="text-button"
                                aria-expanded={
                                  activeYoutube?.resourceId === resource.id
                                }
                                onClick={() =>
                                  setActiveYoutube((active) =>
                                    active?.resourceId === resource.id
                                      ? null
                                      : {
                                          goalId: item.id,
                                          resourceId: resource.id,
                                        },
                                  )
                                }
                              >
                                {activeYoutube?.resourceId === resource.id
                                  ? "Close video"
                                  : "Watch here"}
                              </button>
                            )}
                            <button
                              type="button"
                              className={`text-button ${item.currentResourceId === resource.id ? "selected" : ""}`}
                              onClick={() =>
                                onUpdate(item.id, {
                                  currentResourceId: resource.id,
                                })
                              }
                            >
                              {item.currentResourceId === resource.id
                                ? "Currently on"
                                : "Set current"}
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => removeResource(item, resource.id)}
                            >
                              Remove
                            </button>
                            <textarea
                              value={resource.notes || ""}
                              maxLength={2000}
                              aria-label={`Notes for ${resource.title}`}
                              placeholder="Notes for this resource"
                              onChange={(event) =>
                                onUpdate(item.id, {
                                  resources: (item.resources || []).map(
                                    (entry) =>
                                      entry.id === resource.id
                                        ? {
                                            ...entry,
                                            notes: event.target.value,
                                          }
                                        : entry,
                                  ),
                                })
                              }
                            />
                          </div>
                          {activeYoutube?.goalId === item.id &&
                            activeYoutube.resourceId === resource.id && (
                              <YouTubeLearningPlayer
                                key={resource.id}
                                videoId={getYouTubeVideoId(resource.url)}
                                title={resource.title}
                                onWatchLog={(entry) =>
                                  onLog(item.id, {
                                    ...entry,
                                    resourceId: resource.id,
                                  })
                                }
                                onClose={() => setActiveYoutube(null)}
                              />
                            )}
                        </Fragment>
                      ))}
                      <details
                        className="learning-resource-add"
                        ref={(element) => {
                          resourceFormRefs.current[item.id] = element;
                        }}
                      >
                        <summary>Add a resource link</summary>
                        <div className="learning-inline-add">
                          <input
                            value={resourceDrafts[item.id]?.title || ""}
                            onChange={(event) =>
                              setResourceDrafts({
                                ...resourceDrafts,
                                [item.id]: {
                                  ...resourceDrafts[item.id],
                                  title: event.target.value,
                                },
                              })
                            }
                            placeholder="Display name (e.g. Python lesson 1)"
                            aria-label="Resource display name"
                          />
                          <input
                            type="url"
                            value={resourceDrafts[item.id]?.url || ""}
                            onChange={(event) =>
                              setResourceDrafts({
                                ...resourceDrafts,
                                [item.id]: {
                                  ...resourceDrafts[item.id],
                                  url: event.target.value,
                                },
                              })
                            }
                            placeholder="Paste a YouTube or resource URL"
                            aria-label="Private resource URL"
                          />
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => addResource(item)}
                            disabled={
                              !(resourceDrafts[item.id]?.title || "").trim() ||
                              !(resourceDrafts[item.id]?.url || "").trim()
                            }
                          >
                            Save link
                          </button>
                        </div>
                        <small>
                          The URL stays in your local Daymark data and isn’t
                          shown in the resource list.
                        </small>
                      </details>
                      {resourceErrors[item.id] && (
                        <small className="file-import-error" role="alert">
                          {resourceErrors[item.id]}
                        </small>
                      )}
                    </section>
                    <section className="learning-subsection">
                      <div className="learning-subheading">
                        <strong>Learning log</strong>
                        <span>{weekMinutes} min this week</span>
                      </div>
                      <div
                        className="learning-timeline"
                        aria-label="Learning minutes and reading pages in the last seven days"
                      >
                        <div className="learning-timeline-legend">
                          <span>
                            <i className="minutes" />
                            Learning minutes
                          </span>
                          <span>
                            <i className="pages" />
                            Reading pages
                          </span>
                        </div>
                        <div className="learning-timeline-days">
                          {lastWeek.map((day) => (
                            <div
                              className="learning-timeline-day"
                              key={day.key}
                              title={`${day.key}: ${day.minutes} minutes learned, ${day.pages} pages read`}
                            >
                              <span>{day.key.slice(-2)}</span>
                              <div>
                                <i
                                  className="minutes"
                                  style={{
                                    height: `${Math.min(100, day.minutes ? Math.max(8, (day.minutes / maxWeekMinutes) * 100) : 0)}%`,
                                  }}
                                />
                                <i
                                  className="pages"
                                  style={{
                                    height: `${Math.min(100, day.pages ? Math.max(8, (day.pages / maxWeekPages) * 100) : 0)}%`,
                                  }}
                                />
                              </div>
                              <small>
                                {day.minutes}m · {day.pages}p
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div
                        className="learning-heatmap"
                        aria-label="Learning activity over the last four weeks"
                      >
                        {lastMonth.map((day) => (
                          <span
                            key={day.key}
                            title={`${day.key}: ${day.minutes} minutes`}
                            style={{
                              opacity: day.minutes
                                ? Math.min(1, 0.3 + day.minutes / 120)
                                : 0.14,
                            }}
                          />
                        ))}
                      </div>
                      <div className="learning-log-form">
                        <input
                          type="number"
                          min="1"
                          max="1440"
                          value={logDrafts[item.id]?.minutes || ""}
                          onChange={(event) =>
                            setLogDrafts({
                              ...logDrafts,
                              [item.id]: {
                                ...logDrafts[item.id],
                                minutes: event.target.value,
                              },
                            })
                          }
                          placeholder="Minutes"
                          aria-label="Minutes learned"
                        />
                        <input
                          value={logDrafts[item.id]?.note || ""}
                          onChange={(event) =>
                            setLogDrafts({
                              ...logDrafts,
                              [item.id]: {
                                ...logDrafts[item.id],
                                note: event.target.value,
                              },
                            })
                          }
                          placeholder="What did you learn today?"
                        />
                        <button
                          type="button"
                          className="text-button"
                          disabled={Number(logDrafts[item.id]?.minutes) <= 0}
                          onClick={() => {
                            const draftLog = logDrafts[item.id] || {};
                            const minutes = Number(draftLog.minutes);
                            if (
                              !Number.isFinite(minutes) ||
                              minutes <= 0 ||
                              minutes > 1440
                            )
                              return;
                            onLog(item.id, {
                              minutes,
                              note: draftLog.note || "",
                            });
                            setLogDrafts({
                              ...logDrafts,
                              [item.id]: { minutes: "", note: "" },
                            });
                          }}
                        >
                          Log time
                        </button>
                      </div>
                      {logs
                        .slice(-3)
                        .reverse()
                        .map((log) => (
                          <div className="learning-log-entry" key={log.id}>
                            <strong>
                              {log.date} · {log.minutes} min
                            </strong>
                            {log.note && <span>{log.note}</span>}
                          </div>
                        ))}
                      {(item.badges || []).length > 0 && (
                        <div className="learning-badges">
                          {item.badges.map((badge) => (
                            <span key={badge}>{badge}</span>
                          ))}
                        </div>
                      )}
                      <div className="learning-actions">
                        <button
                          type="button"
                          className="subtle-btn"
                          onClick={() => scheduleReviews(item)}
                        >
                          Schedule reviews · 3 / 7 / 21 days
                        </button>
                        <button
                          type="button"
                          className="subtle-btn"
                          onClick={() => startFocus(item)}
                          disabled={Boolean(focusEnd && focusGoal !== item.id)}
                        >
                          {focusEnd && focusGoal === item.id
                            ? `${Math.floor(focusRemaining / 60)}:${String(focusRemaining % 60).padStart(2, "0")} focus`
                            : "Start 25-min focus"}
                        </button>
                        {focusEnd && focusGoal === item.id && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setFocusEnd(null);
                              setFocusGoal("");
                              onUpdate(item.id, { focusTimerEnd: null });
                            }}
                          >
                            Stop
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onSendToStudy(item)}
                        >
                          Send note to flashcards
                        </button>
                      </div>
                      {(item.reviewDates || []).some(
                        (date) => date >= todayKey(),
                      ) && (
                        <div className="learning-review-dates">
                          <span>
                            Reviews:{" "}
                            {(item.reviewDates || [])
                              .filter((date) => date >= todayKey())
                              .join(" · ")}
                          </span>
                          {(item.reviewDates || []).includes(todayKey()) && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() =>
                                onUpdate(item.id, {
                                  reviewDates: item.reviewDates.filter(
                                    (date) => date !== todayKey(),
                                  ),
                                })
                              }
                            >
                              Mark today reviewed
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                    <section className="learning-subsection">
                      <div className="learning-subheading">
                        <strong>Reading list</strong>
                        <span>Books, page progress, and reading pace</span>
                      </div>
                      <label className="learning-year-goal">
                        Yearly page goal
                        <input
                          type="number"
                          min="0"
                          value={item.yearlyPageGoal || ""}
                          onChange={(event) =>
                            onUpdate(item.id, {
                              yearlyPageGoal: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
                            })
                          }
                          placeholder="Pages this year"
                        />
                      </label>
                      {Number(item.yearlyPageGoal) > 0 &&
                        (() => {
                          const year = String(new Date().getFullYear());
                          const pages = (item.readingList || [])
                            .flatMap((entry) => entry.pageLogs || [])
                            .filter((log) =>
                              String(log.date || "").startsWith(year),
                            )
                            .reduce(
                              (sum, log) => sum + Number(log.pages || 0),
                              0,
                            );
                          return (
                            <p className="learning-reading-year-progress">
                              {pages} / {item.yearlyPageGoal} pages this year
                            </p>
                          );
                        })()}
                      {(item.readingList || []).map((reading) => (
                        <div className="learning-reading" key={reading.id}>
                          <strong>{reading.title}</strong>
                          <select
                            value={reading.status}
                            onChange={(event) =>
                              onUpdate(item.id, {
                                readingList: item.readingList.map((entry) =>
                                  entry.id === reading.id
                                    ? { ...entry, status: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          >
                            <option>To read</option>
                            <option>Reading</option>
                            <option>Done</option>
                          </select>
                          <Icon name="Star" size={16} />
                          <select
                            aria-label={`Rate ${reading.title}`}
                            value={reading.rating || 0}
                            onChange={(event) =>
                              onUpdate(item.id, {
                                readingList: item.readingList.map((entry) =>
                                  entry.id === reading.id
                                    ? {
                                        ...entry,
                                        rating: Number(event.target.value),
                                      }
                                    : entry,
                                ),
                              })
                            }
                          >
                            <option value="0">Rate</option>
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <option value={rating} key={rating}>
                                {rating}
                              </option>
                            ))}
                          </select>
                          <input
                            value={reading.takeaway || ""}
                            placeholder="One-line takeaway"
                            onChange={(event) =>
                              onUpdate(item.id, {
                                readingList: item.readingList.map((entry) =>
                                  entry.id === reading.id
                                    ? { ...entry, takeaway: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          />
                          <label className="learning-page-count">
                            Pages
                            <input
                              type="number"
                              min="0"
                              value={reading.totalPages || ""}
                              aria-label={`${reading.title} total pages`}
                              onChange={(event) =>
                                onUpdate(item.id, {
                                  readingList: item.readingList.map((entry) =>
                                    entry.id === reading.id
                                      ? {
                                          ...entry,
                                          totalPages: Math.max(
                                            0,
                                            Number(event.target.value) || 0,
                                          ),
                                          pagesRead:
                                            Number(event.target.value) > 0
                                              ? Math.min(
                                                  Number(entry.pagesRead || 0),
                                                  Number(event.target.value),
                                                )
                                              : Number(entry.pagesRead || 0),
                                        }
                                      : entry,
                                  ),
                                })
                              }
                            />
                          </label>
                          <div className="learning-reading-progress">
                            <span>
                              {reading.pagesRead || 0}
                              {reading.totalPages
                                ? ` / ${reading.totalPages}`
                                : ""}{" "}
                              pages
                            </span>
                            {reading.totalPages > 0 && (
                              <i>
                                <b
                                  style={{
                                    width: `${Math.min(100, (Number(reading.pagesRead || 0) / reading.totalPages) * 100)}%`,
                                  }}
                                />
                              </i>
                            )}
                          </div>
                          <div className="learning-reading-log">
                            <input
                              type="number"
                              min="1"
                              value={readingLogDrafts[reading.id]?.pages || ""}
                              onChange={(event) =>
                                setReadingLogDrafts({
                                  ...readingLogDrafts,
                                  [reading.id]: {
                                    ...readingLogDrafts[reading.id],
                                    pages: event.target.value,
                                  },
                                })
                              }
                              placeholder="Pages read"
                              aria-label={`Pages read in ${reading.title}`}
                            />
                            <input
                              type="number"
                              min="1"
                              value={
                                readingLogDrafts[reading.id]?.minutes || ""
                              }
                              onChange={(event) =>
                                setReadingLogDrafts({
                                  ...readingLogDrafts,
                                  [reading.id]: {
                                    ...readingLogDrafts[reading.id],
                                    minutes: event.target.value,
                                  },
                                })
                              }
                              placeholder="Minutes"
                              aria-label={`Minutes spent reading ${reading.title}`}
                            />
                            <button
                              type="button"
                              className="text-button"
                              disabled={
                                Number(readingLogDrafts[reading.id]?.pages) <= 0
                              }
                              onClick={() => logReadingPages(item, reading)}
                            >
                              Log reading
                            </button>
                            {(() => {
                              const logs = reading.pageLogs || [];
                              const loggedPages = logs.reduce(
                                (sum, log) => sum + Number(log.pages || 0),
                                0,
                              );
                              const loggedMinutes = logs.reduce(
                                (sum, log) => sum + Number(log.minutes || 0),
                                0,
                              );
                              return loggedPages && loggedMinutes ? (
                                <small>
                                  Average pace:{" "}
                                  {(loggedPages / loggedMinutes).toFixed(1)}{" "}
                                  pages/min
                                </small>
                              ) : null;
                            })()}
                          </div>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => removeReading(item, reading.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="learning-inline-add">
                        <input
                          value={readingDrafts[item.id]?.title || ""}
                          onChange={(event) =>
                            setReadingDrafts({
                              ...readingDrafts,
                              [item.id]: {
                                ...readingDrafts[item.id],
                                title: event.target.value,
                              },
                            })
                          }
                          placeholder="Add a book or course"
                        />
                        <input
                          type="number"
                          min="0"
                          value={readingDrafts[item.id]?.totalPages || ""}
                          onChange={(event) =>
                            setReadingDrafts({
                              ...readingDrafts,
                              [item.id]: {
                                ...readingDrafts[item.id],
                                totalPages: event.target.value,
                              },
                            })
                          }
                          placeholder="Total pages"
                          aria-label="Total pages"
                        />
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => addReading(item)}
                          disabled={
                            !(readingDrafts[item.id]?.title || "").trim()
                          }
                        >
                          Add to list
                        </button>
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
          </details>
        ))}
    </div>
  );
}

function CalendarPicker({ value, onChange }) {
  const selected = useMemo(() => dateFromKey(value || todayKey()), [value]);
  const today = useMemo(() => todayKey(), []);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstDay + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - firstDay + 1;
      return day > 0 && day <= daysInMonth
        ? new Date(month.getFullYear(), month.getMonth(), day)
        : null;
    },
  );
  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const choose = (date) => {
    onChange(dateKey(date));
    setOpen(false);
  };
  const moveMonth = (amount) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  return (
    <div className="date-picker">
      <button
        type="button"
        className="date-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="date-trigger-icon">◷</span>
        <span className="date-trigger-full">
          {selected.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span className="date-trigger-short">
          {selected.getDate()}{" "}
          {selected.toLocaleDateString(undefined, { month: "short" })}
        </span>
      </button>
      {open && (
        <div className="calendar-popover">
          <div className="calendar-head">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <Icon name="ArrowLeft" size={16} />
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              <Icon name="ArrowRight" size={16} />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((date, index) =>
              date ? (
                <button
                  type="button"
                  key={dateKey(date)}
                  className={`${dateKey(date) === value ? "selected" : ""} ${dateKey(date) === today ? "today" : ""}`}
                  onClick={() => choose(date)}
                >
                  {date.getDate()}
                </button>
              ) : (
                <span className="calendar-blank" key={`blank-${index}`} />
              ),
            )}
          </div>
          <div className="calendar-foot">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                choose(today);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactPicker({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const label =
    options.find(([option]) => option === value)?.[1] || options[0][1];

  useEffect(() => {
    const close = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div className={`compact-picker${open ? " is-open" : ""}`} ref={pickerRef}>
      <button
        type="button"
        className="compact-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="compact-picker-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map(([option, optionLabel]) => (
            <button
              type="button"
              role="option"
              aria-selected={value === option}
              className={value === option ? "selected" : ""}
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {optionLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskList({
  tasks,
  subjects = [],
  onAdd,
  onToggle,
  onEdit,
  onDelete,
  onReorder,
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayKey());
  const [priority, setPriority] = useState("medium");
  const [filter, setFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("any");
  const [priorityFilter, setPriorityFilter] = useState("any");
  const [sortBy, setSortBy] = useState("priority");
  const [tagDraft, setTagDraft] = useState("");
  const [estimateDraft, setEstimateDraft] = useState("");
  const [recurrenceDraft, setRecurrenceDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [subtaskDrafts, setSubtaskDrafts] = useState({});
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const add = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: createId(),
      createdAt: Date.now(),
      title: title.trim(),
      due,
      priority,
      done: false,
      tags: tagDraft
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      estimateMinutes: Math.max(0, Number(estimateDraft) || 0),
      recurrence: recurrenceDraft,
      subject: subjectDraft,
      subtasks: [],
    });
    setTitle("");
    setTagDraft("");
    setEstimateDraft("");
    setRecurrenceDraft("");
    setSubjectDraft("");
  };
  const visibleTasks = tasks
    .filter(
      (task) =>
        filter === "all" || (filter === "open" ? !task.done : task.done),
    )
    .filter((task) => {
      if (dueFilter === "overdue")
        return !task.done && task.due && task.due < todayKey();
      if (dueFilter === "today") return task.due === todayKey();
      if (dueFilter === "upcoming") return task.due > todayKey();
      if (dueFilter === "unscheduled") return !task.due;
      return true;
    })
    .filter(
      (task) =>
        priorityFilter === "any" ||
        (task.priority || "medium") === priorityFilter,
    )
    .sort((a, b) =>
      sortBy === "newest"
        ? Number(b.createdAt || 0) - Number(a.createdAt || 0)
        : sortBy === "due"
          ? (a.due || "9999").localeCompare(b.due || "9999")
          : ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) -
            ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1),
    );
  const todaysEstimate = tasks
    .filter((task) => !task.done && task.due === todayKey())
    .reduce((sum, task) => sum + Number(task.estimateMinutes || 0), 0);
  return (
    <div className="section task-card" id="task-list" tabIndex="-1">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PLAN YOUR DAY</p>
          <h2>Tasks and time blocks</h2>
          <p className="section-intro">
            Choose one small priority and give yourself room to finish it.
          </p>
        </div>
      </div>
      <form className="task-form" onSubmit={add}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What would feel good to finish?"
          aria-label="Task title"
        />
        <CalendarPicker value={due} onChange={setDue} />
        <CompactPicker
          value={priority}
          onChange={setPriority}
          ariaLabel="Task priority"
          options={[
            ["high", "High priority"],
            ["medium", "Medium priority"],
            ["low", "Low priority"],
          ]}
        />
        <input
          type="number"
          min="0"
          step="5"
          value={estimateDraft}
          onChange={(event) => setEstimateDraft(event.target.value)}
          placeholder="Minutes"
          aria-label="Task time estimate in minutes"
        />
        <input
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          placeholder="Tags, comma-separated"
          aria-label="Task tags"
        />
        <CompactPicker
          value={recurrenceDraft}
          onChange={setRecurrenceDraft}
          ariaLabel="Task recurrence"
          options={[
            ["", "Does not repeat"],
            ["daily", "Daily"],
            ...WEEKDAYS.map((day) => [`weekly:${day}`, `Every ${day}`]),
          ]}
        />
        <select
          value={subjectDraft}
          onChange={(event) => setSubjectDraft(event.target.value)}
          aria-label="Link task to subject"
        >
          <option value="">No subject</option>
          {subjects.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
        <button className="primary-btn">Add task</button>
      </form>
      {todaysEstimate > 480 && (
        <p className="task-overbooked-warning" role="status">
          This day has {Math.round((todaysEstimate / 60) * 10) / 10} estimated
          task hours. Consider moving something.
        </p>
      )}
      <div className="task-tools">
        <span>{tasks.length} total</span>
        {["all", "open", "done"].map((item) => (
          <button
            type="button"
            className={filter === item ? "selected" : ""}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
        <label>
          <span className="sr-only">Filter tasks by due date</span>
          <select
            value={dueFilter}
            onChange={(event) => setDueFilter(event.target.value)}
            aria-label="Filter tasks by due date"
          >
            <option value="any">Any date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="upcoming">Upcoming</option>
            <option value="unscheduled">No due date</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort tasks</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sort tasks"
          >
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        {selectedTaskIds.length > 0 && (
          <div className="task-bulk-actions">
            <span>{selectedTaskIds.length} selected</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                selectedTaskIds.forEach((id) => onToggle(id));
                setSelectedTaskIds([]);
              }}
            >
              Complete
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const tomorrow = dateFromKey(todayKey());
                tomorrow.setDate(tomorrow.getDate() + 1);
                selectedTaskIds.forEach((id) =>
                  onEdit(id, { due: dateKey(tomorrow) }),
                );
                setSelectedTaskIds([]);
              }}
            >
              Move to tomorrow
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                selectedTaskIds.forEach((id) => onDelete(id));
                setSelectedTaskIds([]);
              }}
            >
              Delete
            </button>
          </div>
        )}
        <label>
          <span className="sr-only">Filter tasks by priority</span>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            aria-label="Filter tasks by priority"
          >
            <option value="any">Any priority</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
        </label>
      </div>
      {visibleTasks.length === 0 && (
        <div className="friendly-empty">
          <div>
            <strong>
              {tasks.length
                ? "No tasks match these filters."
                : "Your list is clear."}
            </strong>
            <p>
              {tasks.length
                ? "Try a different due date, priority, or status."
                : "Add a task above to get started."}
            </p>
          </div>
          {tasks.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFilter("all");
                setDueFilter("any");
                setPriorityFilter("any");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {visibleTasks.map((task) => (
        <div
          className={`task-item ${task.done ? "completed" : ""} ${editingTaskId === task.id ? "task-item-editing" : ""}`}
          key={task.id}
          draggable={editingTaskId !== task.id}
          onDragStart={() => setDraggedTaskId(task.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggedTaskId && draggedTaskId !== task.id)
              onReorder?.(draggedTaskId, task.id);
            setDraggedTaskId(null);
          }}
        >
          {editingTaskId === task.id ? (
            <form
              className="task-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                const nextTitle = editDraft.title.trim();
                if (!nextTitle) return;
                onEdit(task.id, {
                  title: nextTitle,
                  due: editDraft.due,
                  priority: editDraft.priority,
                });
                setEditingTaskId(null);
                setEditDraft(null);
              }}
            >
              <input
                autoFocus
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, title: event.target.value })
                }
                aria-label={`Edit ${task.title} title`}
                required
              />
              <input
                type="date"
                value={editDraft.due}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, due: event.target.value })
                }
                aria-label={`Edit ${task.title} due date`}
              />
              <select
                value={editDraft.priority}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, priority: event.target.value })
                }
                aria-label={`Edit ${task.title} priority`}
              >
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <div className="task-edit-actions">
                <button type="submit" className="primary-btn">
                  Save
                </button>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={() => {
                    setEditingTaskId(null);
                    setEditDraft(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                className="task-check"
                onClick={() => onToggle(task.id)}
                aria-label={`Mark ${task.title} ${task.done ? "open" : "complete"}`}
                title={`Mark ${task.title} ${task.done ? "open" : "complete"}`}
              >
                {task.done ? <Icon name="Check" size={18} /> : ""}
              </button>
              <input
                type="checkbox"
                aria-label={`Select ${task.title}`}
                checked={selectedTaskIds.includes(task.id)}
                onChange={(event) =>
                  setSelectedTaskIds((ids) =>
                    event.target.checked
                      ? [...ids, task.id]
                      : ids.filter((id) => id !== task.id),
                  )
                }
              />
              <span>
                {task.title}
                <small>
                  <b className={`priority-dot ${task.priority || "medium"}`} />
                  {task.due === todayKey()
                    ? "Today"
                    : task.due || "No due date"}{" "}
                  · {task.priority || "medium"} priority
                  {task.estimateMinutes ? ` · ${task.estimateMinutes} min` : ""}
                  {task.recurrence ? ` · repeats ${task.recurrence}` : ""}
                  {task.tags?.length ? ` · ${task.tags.join(", ")}` : ""}
                  {task.subject ? ` · ${task.subject}` : ""}
                </small>
              </span>
              <div className="task-subtasks">
                {(task.subtasks || []).map((subtask, index) => (
                  <label key={subtask.id || index}>
                    <input
                      type="checkbox"
                      checked={Boolean(subtask.done)}
                      onChange={(event) =>
                        onEdit(task.id, {
                          subtasks: task.subtasks.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, done: event.target.checked }
                              : item,
                          ),
                        })
                      }
                    />
                    <span className={subtask.done ? "completed" : ""}>
                      {subtask.title}
                    </span>
                  </label>
                ))}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = (subtaskDrafts[task.id] || "").trim();
                    if (!value) return;
                    onEdit(task.id, {
                      subtasks: [
                        ...(task.subtasks || []),
                        { id: createId(), title: value, done: false },
                      ],
                    });
                    setSubtaskDrafts((drafts) => ({
                      ...drafts,
                      [task.id]: "",
                    }));
                  }}
                >
                  <input
                    aria-label={`New checklist item for ${task.title}`}
                    placeholder="Add checklist item"
                    value={subtaskDrafts[task.id] || ""}
                    onChange={(event) =>
                      setSubtaskDrafts((drafts) => ({
                        ...drafts,
                        [task.id]: event.target.value,
                      }))
                    }
                  />
                  <button type="submit" className="text-button">
                    Add
                  </button>
                </form>
              </div>
              <button
                className="task-edit-button"
                type="button"
                onClick={() => {
                  setEditingTaskId(task.id);
                  setEditDraft({
                    title: task.title,
                    due: task.due || "",
                    priority: task.priority || "medium",
                  });
                }}
                aria-label={`Edit ${task.title}`}
              >
                Edit
              </button>
              <button
                className="task-delete"
                onClick={() => onDelete(task.id)}
                aria-label={`Delete ${task.title}`}
              >
                <Icon name="X" size={16} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function BreathingReset({ onComplete, patternKey = "calm", onPatternChange }) {
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [endsAt, setEndsAt] = useState(null);
  const [started, setStarted] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const active = endsAt !== null;
  const elapsed = duration - remaining;
  const patterns = {
    calm: { label: "Gentle · 4-4-6", inhale: 4, hold: 4, exhale: 6 },
    box: { label: "Balanced · 4-4-4", inhale: 4, hold: 4, exhale: 4 },
    relax: { label: "Long exhale · 4-2-8", inhale: 4, hold: 2, exhale: 8 },
  };
  const pattern = patterns[patternKey] || patterns.calm;
  const phaseTime = elapsed % (pattern.inhale + pattern.hold + pattern.exhale);
  const phase =
    phaseTime < pattern.inhale
      ? "Breathe in"
      : phaseTime < pattern.inhale + pattern.hold
        ? "Hold"
        : "Breathe out";

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (endsAt === null) return undefined;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(timer);
        setEndsAt(null);
        onCompleteRef.current(duration / 60);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, duration]);

  const chooseDuration = (seconds) => {
    setDuration(seconds);
    setRemaining(seconds);
    setEndsAt(null);
    setStarted(false);
  };
  const reset = () => {
    setRemaining(duration);
    setEndsAt(null);
    setStarted(false);
  };
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <section
      className="breathing-reset"
      aria-labelledby="breathing-reset-title"
    >
      <div className="workout-subheading">
        <div>
          <h3 id="breathing-reset-title">Take a breathing reset</h3>
          <span>A gentle inhale, hold, and exhale. Follow your own pace.</span>
        </div>
      </div>
      <div
        className={`breathing-orb ${active ? `breathing-${phase.toLowerCase().replace(" ", "-")}` : ""}`}
        aria-hidden="true"
      >
        <span>{active ? phase : "Ready"}</span>
      </div>
      <p className="breathing-phase">
        <span aria-hidden="true">
          {active
            ? `${phase} · ${minutes}:${seconds}`
            : remaining === 0
              ? "Session complete. Nice work."
              : started
                ? `Paused · ${minutes}:${seconds}`
                : "Choose a short session when you’re ready."}
        </span>
        <span className="sr-only" aria-live="polite">
          {active
            ? phase
            : remaining === 0
              ? "Breathing session complete. Meditation time logged."
              : started
                ? "Breathing session paused."
                : ""}
        </span>
      </p>
      <label className="breathing-pattern">
        Breathing pattern
        <select
          value={patternKey}
          disabled={active}
          onChange={(event) => onPatternChange(event.target.value)}
        >
          {Object.entries(patterns).map(([key, option]) => (
            <option value={key} key={key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div
        className="breathing-duration"
        role="group"
        aria-label="Breathing session length"
      >
        {[1, 3, 5].map((minutesOption) => (
          <button
            type="button"
            className={duration === minutesOption * 60 ? "selected" : ""}
            aria-pressed={duration === minutesOption * 60}
            disabled={active}
            key={minutesOption}
            onClick={() => chooseDuration(minutesOption * 60)}
          >
            {minutesOption} min
          </button>
        ))}
      </div>
      <div className="breathing-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            setStarted(true);
            setEndsAt(Date.now() + remaining * 1000);
          }}
          disabled={active || remaining === 0}
        >
          {started ? "Resume" : "Begin"}
        </button>
        {active && (
          <button
            type="button"
            className="subtle-btn"
            onClick={() => {
              setRemaining(
                Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
              );
              setEndsAt(null);
            }}
          >
            Pause
          </button>
        )}
        {started && (
          <button type="button" className="subtle-btn" onClick={reset}>
            Reset
          </button>
        )}
      </div>
    </section>
  );
}

function WellnessCard({
  wellness,
  onUpdate,
  journal,
  workout,
  onRequestReminders,
}) {
  const [selfCareDraft, setSelfCareDraft] = useState("");
  const todayLog = wellness.history?.[todayKey()] || {};
  const current = { ...wellness, ...todayLog };
  const selfCareActions = Array.isArray(wellness.selfCareActions)
    ? wellness.selfCareActions
    : initialState.wellness.selfCareActions;
  const selfCareDone = Array.isArray(todayLog.selfCareDone)
    ? todayLog.selfCareDone
    : [];
  const parseClock = (time) => {
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [hour, minute] = time.split(":").map(Number);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const sleepMinutes = (() => {
    const bedtime = parseClock(current.bedtime);
    const wakeTime = parseClock(current.wakeTime);
    if (bedtime === null || wakeTime === null) return 0;
    return (wakeTime - bedtime + 1440) % 1440;
  })();
  const sleepHours = sleepMinutes / 60;
  const loggedBedtimes = Object.values(wellness.history || {})
    .map((log) => parseClock(log.bedtime))
    .filter((time) => time !== null);
  const bedtimeMean = loggedBedtimes.length
    ? (() => {
        const x = loggedBedtimes.reduce(
          (sum, time) => sum + Math.cos((time / 1440) * Math.PI * 2),
          0,
        );
        const y = loggedBedtimes.reduce(
          (sum, time) => sum + Math.sin((time / 1440) * Math.PI * 2),
          0,
        );
        return ((Math.atan2(y, x) / (Math.PI * 2)) * 1440 + 1440) % 1440;
      })()
    : null;
  const bedtimeVariation =
    bedtimeMean === null
      ? null
      : loggedBedtimes.reduce((sum, time) => {
          const difference = Math.abs(time - bedtimeMean);
          return sum + Math.min(difference, 1440 - difference);
        }, 0) / loggedBedtimes.length;
  const suggestedReminderTime =
    bedtimeMean === null
      ? ""
      : `${String(Math.floor(((bedtimeMean - 30 + 1440) % 1440) / 60)).padStart(2, "0")}:${String(Math.round(((bedtimeMean - 30 + 1440) % 1440) % 60)).padStart(2, "0")}`;
  const sleepGoal = Math.max(1, Number(wellness.sleepGoal) || 8);
  const meditationGoal = Math.max(1, Number(wellness.meditationGoal) || 10);
  const wellnessGoals = [
    {
      id: "sleep",
      label: "Sleep",
      value: sleepHours,
      goal: sleepGoal,
      detail: sleepMinutes
        ? `${sleepHours.toFixed(1)} / ${sleepGoal} h`
        : "Log bedtime and wake time",
    },
    {
      id: "meditation",
      label: "Meditation",
      value: Number(current.meditation) || 0,
      goal: meditationGoal,
      detail: `${Number(current.meditation) || 0} / ${meditationGoal} min`,
    },
    {
      id: "water",
      label: "Water",
      value: Number(current.water) || 0,
      goal: Math.max(1, Number(wellness.waterGoal) || 8),
      detail: `${Number(current.water) || 0} / ${Math.max(1, Number(wellness.waterGoal) || 8)} glasses`,
    },
  ];
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateFromKey(todayKey());
    date.setDate(date.getDate() - 6 + index);
    const key = dateKey(date);
    return {
      key,
      log: wellness.history?.[key] || {},
      energy: journal?.[key]?.energy || 0,
      mood: journal?.[key]?.mood || "",
      workout: (workout.history || []).some(
        (session) => session.finished === key,
      ),
    };
  });
  const update = (patch) =>
    onUpdate({
      ...patch,
      sleep:
        patch.bedtime !== undefined || patch.wakeTime !== undefined
          ? (() => {
              const bedtime = parseClock(patch.bedtime ?? current.bedtime);
              const wakeTime = parseClock(patch.wakeTime ?? current.wakeTime);
              return bedtime === null || wakeTime === null
                ? ""
                : (((wakeTime - bedtime + 1440) % 1440) / 60).toFixed(1);
            })()
          : current.sleep,
    });
  return (
    <div className="section wellness-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">WELLNESS</p>
          <h2>Wellness check-in</h2>
        </div>
      </div>
      <div className="wellness-grid">
        <label>
          Bedtime
          <input
            type="time"
            value={current.bedtime || ""}
            onChange={(event) => update({ bedtime: event.target.value })}
            aria-label="Bedtime"
          />
        </label>
        <label>
          Wake time
          <input
            type="time"
            value={current.wakeTime || ""}
            onChange={(event) => update({ wakeTime: event.target.value })}
            aria-label="Wake time"
          />
        </label>
        <label>
          Water today
          <input
            type="number"
            min="0"
            value={current.water || 0}
            onChange={(event) => update({ water: Number(event.target.value) })}
            placeholder="glasses"
          />
        </label>
        <label>
          Meditation
          <input
            type="number"
            min="0"
            value={current.meditation || 0}
            onChange={(event) =>
              update({ meditation: Number(event.target.value) })
            }
            placeholder="minutes"
          />
        </label>
        <label>
          Daily water goal
          <input
            type="number"
            min="1"
            value={wellness.waterGoal || 8}
            onChange={(event) =>
              onUpdate({
                waterGoal: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
      </div>
      <p className="sleep-summary">
        {sleepMinutes
          ? `${(sleepMinutes / 60).toFixed(1)} hours logged`
          : "Add bedtime and wake time to log sleep."}
      </p>
      <section className="bedtime-consistency">
        <div>
          <strong>Bedtime consistency</strong>
          <span>
            {bedtimeMean === null
              ? "Log a few bedtimes to see your pattern."
              : `Typical bedtime ${String(Math.floor(bedtimeMean / 60)).padStart(2, "0")}:${String(Math.round(bedtimeMean % 60)).padStart(2, "0")} · varies by about ${Math.round(bedtimeVariation)} min`}
          </span>
        </div>
        <label className="bedtime-reminder-toggle">
          <input
            type="checkbox"
            checked={Boolean(wellness.bedtimeReminderEnabled)}
            onChange={async (event) => {
              const enabled = event.target.checked;
              if (enabled) await onRequestReminders();
              onUpdate({
                bedtimeReminderEnabled: enabled,
                bedtimeReminderTime:
                  wellness.bedtimeReminderTime ||
                  wellness.bedtimeReminder ||
                  suggestedReminderTime,
              });
            }}
          />
          Gentle reminder
        </label>
        {wellness.bedtimeReminderEnabled && (
          <label className="bedtime-reminder-time">
            Reminder time
            <input
              type="time"
              value={
                wellness.bedtimeReminderTime ||
                wellness.bedtimeReminder ||
                suggestedReminderTime
              }
              onChange={(event) =>
                onUpdate({
                  bedtimeReminderTime: event.target.value,
                  bedtimeReminder: event.target.value,
                })
              }
            />
          </label>
        )}
      </section>
      <section className="water-reminder-settings" aria-label="Water reminder">
        <label className="bedtime-reminder-toggle">
          <input
            type="checkbox"
            checked={Boolean(wellness.waterReminderEnabled)}
            onChange={async (event) => {
              const enabled = event.target.checked;
              const allowed = enabled ? await onRequestReminders() : false;
              onUpdate({ waterReminderEnabled: enabled && allowed });
            }}
          />
          Remind me to drink water
        </label>
        {wellness.waterReminderEnabled && (
          <label className="bedtime-reminder-time">
            Reminder time
            <input
              type="time"
              value={wellness.waterReminderTime || "14:00"}
              onChange={(event) =>
                onUpdate({ waterReminderTime: event.target.value })
              }
            />
          </label>
        )}
      </section>
      <section
        className="wellness-goals"
        aria-labelledby="wellness-goals-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="wellness-goals-title">Gentle daily targets</h3>
            <span>Progress, not pressure. Adjust goals to fit your day.</span>
          </div>
        </div>
        <div className="wellness-goal-settings">
          <label>
            Sleep target · hours
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={wellness.sleepGoal || 8}
              onChange={(event) =>
                onUpdate({
                  sleepGoal: Math.max(
                    1,
                    Math.min(24, Number(event.target.value) || 1),
                  ),
                })
              }
              aria-label="Daily sleep target in hours"
            />
          </label>
          <label>
            Meditation target · minutes
            <input
              type="number"
              min="1"
              max="1440"
              step="5"
              value={wellness.meditationGoal || 10}
              onChange={(event) =>
                onUpdate({
                  meditationGoal: Math.max(
                    1,
                    Math.min(1440, Number(event.target.value) || 1),
                  ),
                })
              }
              aria-label="Daily meditation target in minutes"
            />
          </label>
        </div>
        <div className="wellness-goal-list">
          {wellnessGoals.map((goal) => (
            <div className="wellness-goal" key={goal.id}>
              <div className="wellness-goal-label">
                <strong>{goal.label}</strong>
                <span>{goal.detail}</span>
              </div>
              <div
                className="wellness-goal-track"
                role="progressbar"
                aria-label={`${goal.label} daily target`}
                aria-valuemin="0"
                aria-valuemax={goal.goal}
                aria-valuenow={Math.min(goal.value, goal.goal)}
              >
                <i
                  style={{
                    width: `${Math.min(100, Math.round((goal.value / goal.goal) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      <BreathingReset
        patternKey={wellness.breathingPattern}
        onPatternChange={(breathingPattern) => onUpdate({ breathingPattern })}
        onComplete={(minutes) =>
          update({ meditation: (Number(current.meditation) || 0) + minutes })
        }
      />
      <section
        className="self-care-plan"
        aria-labelledby="self-care-plan-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="self-care-plan-title">Small care plan</h3>
            <span>
              Pick a few gentle actions. Your check-offs reset each day.
            </span>
          </div>
          <span className="self-care-count">
            {
              selfCareDone.filter((id) =>
                selfCareActions.some((action) => action.id === id),
              ).length
            }
            /{selfCareActions.length}
          </span>
        </div>
        <div className="self-care-list">
          {!selfCareActions.length && (
            <p className="self-care-empty">
              Add a small action that would make today feel a little easier.
            </p>
          )}
          {selfCareActions.map((action) => {
            const checked = selfCareDone.includes(action.id);
            return (
              <div
                className={`self-care-item ${checked ? "completed" : ""}`}
                key={action.id}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selfCareDone, action.id]
                        : selfCareDone.filter((id) => id !== action.id);
                      onUpdate({ selfCareDone: next });
                    }}
                  />
                  <span>{action.title}</span>
                </label>
                <button
                  type="button"
                  className="self-care-remove"
                  aria-label={`Remove ${action.title}`}
                  onClick={() => {
                    onUpdate({
                      selfCareActions: selfCareActions.filter(
                        (item) => item.id !== action.id,
                      ),
                      selfCareDone: selfCareDone.filter(
                        (id) => id !== action.id,
                      ),
                    });
                  }}
                >
                  <Icon name="X" size={16} />
                </button>
              </div>
            );
          })}
        </div>
        <form
          className="self-care-add"
          onSubmit={(event) => {
            event.preventDefault();
            const title = selfCareDraft.trim();
            if (!title) return;
            if (
              selfCareActions.some(
                (action) => action.title.toLowerCase() === title.toLowerCase(),
              )
            )
              return;
            onUpdate({
              selfCareActions: [
                ...selfCareActions,
                { id: createId(), title: title.slice(0, 100) },
              ],
            });
            setSelfCareDraft("");
          }}
        >
          <input
            value={selfCareDraft}
            maxLength={100}
            onChange={(event) => setSelfCareDraft(event.target.value)}
            placeholder="Add a small care action"
            aria-label="New self-care action"
          />
          <button
            type="submit"
            className="subtle-btn"
            disabled={!selfCareDraft.trim()}
          >
            Add
          </button>
        </form>
      </section>
      <div className="water-row">
        <span>Water goal</span>
        {Array.from(
          { length: Math.min(16, wellness.waterGoal || 8) },
          (_, index) => (
            <button
              className={index < (current.water || 0) ? "filled" : ""}
              key={index}
              onClick={() => update({ water: index + 1 })}
              aria-label={`Set water to ${index + 1} glasses`}
            >
              ●
            </button>
          ),
        )}
      </div>
      <div className="wellness-history">
        <div className="workout-subheading">
          <h3>Weekly patterns</h3>
          <span>Sleep · mood · energy · movement</span>
        </div>
        <div
          className="wellness-trend-chart"
          aria-label="Weekly sleep, mood, and energy chart"
        >
          {days.map((day) => {
            const sleep = Number(day.log.sleep || 0);
            const moodScore = MOOD_VALUES.indexOf(day.mood) + 1;
            return (
              <div
                key={day.key}
                title={`${day.key}: ${sleep}h sleep, mood ${day.mood || "not logged"}, energy ${day.energy || "not logged"}${day.workout ? ", workout logged" : ""}`}
              >
                <i
                  style={{ height: `${Math.min(100, (sleep / 10) * 100)}%` }}
                />
                <b style={{ height: `${day.energy ? day.energy * 20 : 0}%` }} />
                <em style={{ height: `${moodScore ? moodScore * 20 : 0}%` }} />
                <small>{day.key.slice(-2)}</small>
              </div>
            );
          })}
        </div>
        <div className="wellness-history-grid">
          {days.map((day) => (
            <div key={day.key}>
              <strong>{day.key.slice(-2)}</strong>
              <span>{day.log.sleep || "—"}h sleep</span>
              <span>{day.log.water || 0} glasses</span>
              <span>{day.mood ? `Mood ${day.mood}` : "Mood —"}</span>
              <span>{day.energy ? `Energy ${day.energy}/5` : "Energy —"}</span>
              <span>
                {day.workout ? (
                  <>
                    Workout <Icon name="Check" size={14} />
                  </>
                ) : (
                  "Rest day"
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel({
  habits,
  weeklyDone,
  weeklyTarget,
  best,
  journal,
  journalEntries,
  study,
  workout,
  wellness,
  learning,
  tasks,
  bestUnit,
  quarterlyGoal,
  onQuarterlyGoalUpdate,
}) {
  const [insightsView, setInsightsView] = useState("overview");
  const [exportMessage, setExportMessage] = useState("");
  const activeQuarterlyGoal =
    quarterlyGoal || initialState.settings.quarterlyGoal;
  const [goalTitleDraft, setGoalTitleDraft] = useState(
    activeQuarterlyGoal.title || "",
  );
  const rate = weeklyTarget ? Math.round((weeklyDone / weeklyTarget) * 100) : 0;
  const today = dateFromKey(todayKey());
  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6 + index);
    const key = dateKey(date);
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    const scheduled = habits.filter(
      (habit) =>
        !habit.archived &&
        !isHabitPausedOnDate(habit, key) &&
        getHabitScheduleDays(habit).includes(weekday),
    );
    const completed = scheduled.filter((habit) => habit.days[key]?.done).length;
    const studyMinutes = (study.history || [])
      .filter((session) => session.date === key)
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
    const workouts = (workout.history || []).filter(
      (session) => session.finished === key,
    ).length;
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      habitRate: scheduled.length
        ? Math.round((completed / scheduled.length) * 100)
        : 0,
      completed,
      scheduled: scheduled.length,
      studyMinutes,
      workouts,
    };
  });
  const maxStudyMinutes = Math.max(
    1,
    ...trendDays.map((day) => day.studyMinutes),
  );
  const maxWorkouts = Math.max(1, ...trendDays.map((day) => day.workouts));
  const weeklyStudyMinutes = trendDays.reduce(
    (sum, day) => sum + day.studyMinutes,
    0,
  );
  const weeklyWorkouts = trendDays.reduce((sum, day) => sum + day.workouts, 0);
  const weeklyHabitRate = trendDays.filter((day) => day.scheduled > 0).length
    ? Math.round(
        trendDays.reduce((sum, day) => sum + day.habitRate, 0) /
          trendDays.filter((day) => day.scheduled > 0).length,
      )
    : 0;
  const weeklySuggestion =
    weeklyHabitRate < 70
      ? "Choose one habit to make easier this week: lower the bar until it fits your real schedule."
      : weeklyStudyMinutes < 150
        ? "Protect one focused 25-minute study block on a day with a lighter schedule."
        : weeklyWorkouts === 0
          ? "Add one short movement session to a day that already has a little breathing room."
          : "Keep the routine that worked, and leave one open slot for recovery.";
  const moodScores = Object.fromEntries(
    MOOD_VALUES.map((mood, index) => [mood, index + 1]),
  );
  const moodTrend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 13 + index);
    const key = dateKey(date);
    const entry = journalEntries?.[key] || {};
    return {
      key,
      label: date.toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      }),
      mood: moodScores[entry.mood] || 0,
      energy: Math.max(0, Math.min(5, Number(entry.energy) || 0)),
    };
  });
  const moodEntries = moodTrend.filter((day) => day.mood || day.energy);
  const completedLearningGoals = learning.filter(
    (item) =>
      (item.steps || []).length > 0 && item.steps.every((step) => step.done),
  ).length;
  const thirtyDaysAgo = dateFromKey(todayKey());
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const thirtyDayStart = dateKey(thirtyDaysAgo);
  const completedHabits = habits
    .map((habit) => ({
      name: habit.name,
      total: Object.entries(habit.days).filter(
        ([key, day]) => key >= thirtyDayStart && key <= todayKey() && day?.done,
      ).length,
    }))
    .sort((a, b) => b.total - a.total);
  const reasonTotals = habits.reduce((totals, habit) => {
    Object.entries(habit.days || {}).forEach(([key, day]) => {
      if (key >= thirtyDayStart && key <= todayKey() && day?.reason) {
        totals[day.reason] = (totals[day.reason] || 0) + 1;
      }
    });
    return totals;
  }, {});
  const commonFailureReason = Object.entries(reasonTotals).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const studyBySubject = (study.history || [])
    .filter(
      (session) => session.date >= thirtyDayStart && session.date <= todayKey(),
    )
    .reduce((totals, session) => {
      const subject = session.subject || "General study";
      totals[subject] = (totals[subject] || 0) + Number(session.minutes || 0);
      return totals;
    }, {});
  const subjectEntries = Object.entries(studyBySubject).sort(
    (a, b) => b[1] - a[1],
  );
  const maxSubjectMinutes = Math.max(
    1,
    ...subjectEntries.map(([, minutes]) => minutes),
  );
  const sleepHoursFor = (key) => {
    const log = wellness?.history?.[key];
    if (Number(log?.sleep) > 0) return Number(log.sleep);
    if (log?.bedtime && log?.wakeTime) {
      const [bedHour, bedMinute] = log.bedtime.split(":").map(Number);
      const [wakeHour, wakeMinute] = log.wakeTime.split(":").map(Number);
      return (
        ((wakeHour * 60 + wakeMinute - bedHour * 60 - bedMinute + 1440) %
          1440) /
        60
      );
    }
    return 0;
  };
  const moodWorkoutRows = Object.entries(journalEntries || {})
    .filter(
      ([key, entry]) =>
        key >= thirtyDayStart && key <= todayKey() && moodScores[entry?.mood],
    )
    .map(([key, entry]) => ({
      score: moodScores[entry.mood],
      workout: (workout.history || []).some(
        (session) => session.finished === key,
      ),
    }));
  const average = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const workoutMood = [true, false].map((didWorkout) => ({
    didWorkout,
    value: average(
      moodWorkoutRows
        .filter((row) => row.workout === didWorkout)
        .map((row) => row.score),
    ),
  }));
  const studyMinutesByDate = (study.history || [])
    .filter(
      (session) => session.date >= thirtyDayStart && session.date <= todayKey(),
    )
    .reduce((totals, session) => {
      totals[session.date] =
        (totals[session.date] || 0) + Number(session.minutes || 0);
      return totals;
    }, {});
  const studySleepRows = Object.keys(wellness?.history || {})
    .filter((date) => date >= thirtyDayStart && date <= todayKey())
    .map((date) => ({
      sleep: sleepHoursFor(date),
      minutes: studyMinutesByDate[date] || 0,
    }))
    .filter((row) => row.sleep > 0);
  const sleepStudy = [true, false].map((enoughSleep) => ({
    enoughSleep,
    value: average(
      studySleepRows
        .filter((row) => row.sleep >= 7 === enoughSleep)
        .map((row) => row.minutes),
    ),
  }));
  const currentWeekStart = dateFromKey(weekStartKey(today));
  const comparisonDays = Math.floor((today - currentWeekStart) / 86400000);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() + comparisonDays);
  const currentPeriod = { start: dateKey(currentWeekStart), end: todayKey() };
  const previousPeriod = {
    start: dateKey(previousWeekStart),
    end: dateKey(previousWeekEnd),
  };
  const totalsForPeriod = ({ start, end }) => ({
    habits: habits.reduce(
      (sum, habit) =>
        sum +
        Object.entries(habit.days || {}).filter(
          ([key, day]) => key >= start && key <= end && day?.done,
        ).length,
      0,
    ),
    studyMinutes: (study.history || [])
      .filter((session) => session.date >= start && session.date <= end)
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0),
    workouts: (workout.history || []).filter(
      (session) => session.finished >= start && session.finished <= end,
    ).length,
  });
  const currentPeriodTotals = totalsForPeriod(currentPeriod);
  const previousPeriodTotals = totalsForPeriod(previousPeriod);
  const comparisonItems = [
    {
      label: "Habit check-ins",
      value: currentPeriodTotals.habits,
      previous: previousPeriodTotals.habits,
      unit: "check-ins",
    },
    {
      label: "Study time",
      value: currentPeriodTotals.studyMinutes,
      previous: previousPeriodTotals.studyMinutes,
      unit: "min",
    },
    {
      label: "Workouts",
      value: currentPeriodTotals.workouts,
      previous: previousPeriodTotals.workouts,
      unit: "sessions",
    },
  ];
  const comparisonChange = ({ value, previous, unit }) => {
    const change = value - previous;
    if (!change) return "No change from last week";
    return `${change > 0 ? "+" : "−"}${Math.abs(change)} ${unit} vs last week`;
  };
  const year = String(today.getFullYear());
  const yearReview = {
    habitCompletions: habits.reduce(
      (sum, habit) =>
        sum +
        Object.entries(habit.days || {}).filter(
          ([key, day]) => key.startsWith(year) && day?.done,
        ).length,
      0,
    ),
    workoutSessions: (workout.history || []).filter((session) =>
      String(session.finished || "").startsWith(year),
    ).length,
    studyHours:
      (study.history || [])
        .filter((session) => String(session.date || "").startsWith(year))
        .reduce((sum, session) => sum + Number(session.minutes || 0), 0) / 60,
    journalEntries: Object.entries(journalEntries || {}).filter(
      ([key, entry]) =>
        key.startsWith(year) &&
        (entry?.text || entry?.gratitude || entry?.mood || entry?.energy),
    ).length,
  };
  const exportYearReview = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 760;
    const context = canvas.getContext("2d");
    if (!context) {
      setExportMessage("Could not create the review image in this browser.");
      return;
    }
    context.fillStyle = "#f4efff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#382565";
    context.font = "700 56px system-ui, sans-serif";
    context.fillText(`${year} · Your year in Daymark`, 76, 110);
    context.font = "400 26px system-ui, sans-serif";
    context.fillStyle = "#5f5670";
    context.fillText("A year of small steps, kept together.", 80, 160);
    const stats = [
      [`${yearReview.habitCompletions}`, "habit check-ins"],
      [`${yearReview.workoutSessions}`, "workouts"],
      [`${yearReview.studyHours.toFixed(1)}h`, "study time"],
      [`${yearReview.journalEntries}`, "journal entries"],
    ];
    stats.forEach(([value, label], index) => {
      const x = 80 + (index % 2) * 540;
      const y = 270 + Math.floor(index / 2) * 210;
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, 470, 150);
      context.fillStyle = "#754ec2";
      context.font = "700 52px system-ui, sans-serif";
      context.fillText(value, x + 28, y + 66);
      context.fillStyle = "#5f5670";
      context.font = "400 24px system-ui, sans-serif";
      context.fillText(label, x + 28, y + 112);
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        setExportMessage("The year review image could not be exported.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `daymark-year-in-review-${year}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Your year review image is ready.");
    }, "image/png");
  };
  return (
    <div
      className="section insights-panel"
      id="insights"
      data-insights-view={insightsView}
    >
      <PageHeading
        eyebrow="INSIGHTS"
        title="Progress over time"
        subtitle="Review your habit, study, and workout patterns."
        aside={<span className="date-pill">This week</span>}
      />
      <div
        className="insights-view-switch"
        role="group"
        aria-label="Insights sections"
      >
        {[
          ["overview", "Overview"],
          ["patterns", "Patterns"],
          ["goals", "Goals"],
        ].map(([view, label]) => (
          <button
            type="button"
            key={view}
            aria-pressed={insightsView === view}
            onClick={() => setInsightsView(view)}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        className="week-comparison"
        aria-labelledby="week-comparison-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="week-comparison-title">This week vs last week</h3>
            <p>Compared over the same number of days so far.</p>
          </div>
        </div>
        <div className="week-comparison-grid">
          {comparisonItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>
                {item.label === "Study time"
                  ? `${Math.floor(item.value / 60)}h ${item.value % 60}m`
                  : item.value}
              </strong>
              <small>{comparisonChange(item)}</small>
            </article>
          ))}
        </div>
      </section>
      <section
        className="weekly-summary-card"
        aria-labelledby="weekly-summary-title"
      >
        <div>
          <h3 id="weekly-summary-title">One small change</h3>
          <span>{weeklySuggestion}</span>
        </div>
      </section>
      <div className="insight-metrics">
        <div>
          <strong>{rate}%</strong>
          <span>weekly completion</span>
        </div>
        <div>
          <strong>
            {best} {bestUnit}
          </strong>
          <span>best habit streak</span>
        </div>
        <div>
          <strong>{study.actual}h</strong>
          <span>study logged</span>
        </div>
        <div>
          <strong>{tasks.filter((task) => task.done).length}</strong>
          <span>tasks completed</span>
        </div>
      </div>
      <section
        className="cross-area-insights"
        aria-labelledby="cross-area-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="cross-area-title">Connections across your week</h3>
            <p>Patterns are descriptive, not predictions.</p>
          </div>
        </div>
        <div className="cross-area-grid">
          <article>
            <strong>Mood and movement</strong>
            {workoutMood.some((group) => group.value !== null) ? (
              <p>
                {workoutMood
                  .map(
                    (group) =>
                      `${group.didWorkout ? "Workout days" : "Non-workout days"}: ${group.value === null ? "not enough entries" : `${group.value.toFixed(1)}/5 average mood`}`,
                  )
                  .join(" · ")}
              </p>
            ) : (
              <p>Log a mood and a workout to start comparing.</p>
            )}
          </article>
          <article>
            <strong>Sleep and study</strong>
            {sleepStudy.some((group) => group.value !== null) ? (
              <p>
                {sleepStudy
                  .map(
                    (group) =>
                      `${group.enoughSleep ? "7+ hours" : "Under 7 hours"}: ${group.value === null ? "not enough entries" : `${Math.round(group.value)} study min/day`}`,
                  )
                  .join(" · ")}
              </p>
            ) : (
              <p>Log sleep and study sessions to see this comparison.</p>
            )}
          </article>
        </div>
      </section>
      <section
        className="quarterly-goal-panel"
        aria-labelledby="quarterly-goal-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="quarterly-goal-title">Quarterly goal</h3>
            <p>Turn one meaningful outcome into a repeatable weekly action.</p>
          </div>
        </div>
        <div className="quarterly-goal-controls">
          <label>
            Goal
            <input
              maxLength="100"
              value={goalTitleDraft}
              onChange={(event) => {
                setGoalTitleDraft(event.target.value);
                onQuarterlyGoalUpdate({
                  ...activeQuarterlyGoal,
                  title: event.target.value,
                });
              }}
              placeholder="e.g. Run 5 km"
            />
          </label>
          <label>
            Weekly habit
            <input
              maxLength="100"
              value={activeQuarterlyGoal.weeklyHabit || ""}
              onChange={(event) =>
                onQuarterlyGoalUpdate({
                  ...activeQuarterlyGoal,
                  weeklyHabit: event.target.value,
                })
              }
              placeholder="e.g. One easy run each week"
            />
          </label>
          <label>
            Weeks in this quarter
            <input
              type="number"
              min="1"
              max="13"
              value={activeQuarterlyGoal.targetWeeks || 12}
              onChange={(event) =>
                onQuarterlyGoalUpdate({
                  ...activeQuarterlyGoal,
                  targetWeeks: Math.max(
                    1,
                    Math.min(13, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>
        </div>
        {activeQuarterlyGoal.title && (
          <div className="quarterly-goal-progress">
            <div
              className="quarterly-progress-ring"
              style={{
                "--goal-progress": `${Math.min(100, ((activeQuarterlyGoal.completedWeeks || []).length / Math.max(1, activeQuarterlyGoal.targetWeeks)) * 100)}%`,
              }}
              role="img"
              aria-label={`${Math.min((activeQuarterlyGoal.completedWeeks || []).length, activeQuarterlyGoal.targetWeeks)} of ${activeQuarterlyGoal.targetWeeks} weekly actions completed`}
            >
              <strong>
                {Math.min(
                  (activeQuarterlyGoal.completedWeeks || []).length,
                  activeQuarterlyGoal.targetWeeks,
                )}
                /{activeQuarterlyGoal.targetWeeks}
              </strong>
              <small>weeks</small>
            </div>
            <div>
              <strong>{activeQuarterlyGoal.title}</strong>
              <span>
                {activeQuarterlyGoal.weeklyHabit ||
                  "Set a weekly habit to support this goal."}
              </span>
            </div>
            <label className="quarterly-current-week">
              <input
                type="checkbox"
                checked={(activeQuarterlyGoal.completedWeeks || []).includes(
                  weekStartKey(today),
                )}
                onChange={(event) => {
                  const week = weekStartKey(today);
                  const completedWeeks = event.target.checked
                    ? [...(activeQuarterlyGoal.completedWeeks || []), week]
                    : (activeQuarterlyGoal.completedWeeks || []).filter(
                        (key) => key !== week,
                      );
                  onQuarterlyGoalUpdate({
                    ...activeQuarterlyGoal,
                    completedWeeks,
                  });
                }}
              />
              Mark this week complete
            </label>
          </div>
        )}
      </section>
      <section
        className="year-review-panel"
        aria-labelledby="year-review-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="year-review-title">{year} in review</h3>
            <p>
              A private summary of your effort, saved as a shareable image only
              when you choose.
            </p>
          </div>
          <button
            type="button"
            className="subtle-btn"
            onClick={exportYearReview}
          >
            Download image
          </button>
        </div>
        <div className="year-review-stats">
          <span>
            <strong>{yearReview.habitCompletions}</strong> habit check-ins
          </span>
          <span>
            <strong>{yearReview.workoutSessions}</strong> workouts
          </span>
          <span>
            <strong>{yearReview.studyHours.toFixed(1)}h</strong> study
          </span>
          <span>
            <strong>{yearReview.journalEntries}</strong> journal entries
          </span>
        </div>
        {exportMessage && (
          <p className="year-review-export-status" role="status">
            {exportMessage}
          </p>
        )}
      </section>
      <section
        className="weekly-activity"
        aria-labelledby="weekly-activity-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="weekly-activity-title">Your weekly rhythm</h3>
            <p>Small actions across habits, study, and movement.</p>
          </div>
          <div
            className="weekly-activity-legend"
            role="group"
            aria-label="Chart legend"
          >
            <span>
              <i className="habit-legend" />
              Habits
            </span>
            <span>
              <i className="study-legend" />
              Study
            </span>
            <span>
              <i className="workout-legend" />
              Workout
            </span>
          </div>
        </div>
        <div
          className="weekly-activity-chart"
          role="img"
          aria-label="Bar chart showing daily habit completion, study minutes, and workouts over the last seven days"
        >
          {trendDays.map((day) => (
            <div className="weekly-activity-day" key={day.key}>
              <div className="weekly-activity-bars" aria-hidden="true">
                <i
                  className="habit-bar"
                  style={{ height: `${day.habitRate}%` }}
                />
                <i
                  className="study-bar"
                  style={{
                    height: `${(day.studyMinutes / maxStudyMinutes) * 100}%`,
                  }}
                />
                <i
                  className="workout-bar"
                  style={{ height: `${(day.workouts / maxWorkouts) * 100}%` }}
                />
              </div>
              <small>{day.label}</small>
              <span className="sr-only">
                {day.label}: {day.completed} of {day.scheduled} habits,{" "}
                {day.studyMinutes} study minutes, {day.workouts} workouts
              </span>
            </div>
          ))}
        </div>
        <div className="sr-only">
          {trendDays.map((day) => (
            <p key={day.key}>
              {day.label}: {day.completed} of {day.scheduled} habits completed,{" "}
              {day.studyMinutes} study minutes, {day.workouts} workouts.
            </p>
          ))}
        </div>
      </section>
      <details className="mood-trend-panel">
        <summary>
          <span>
            <strong>Mood &amp; energy</strong>
            <small>A gentle look at the last two weeks</small>
          </span>
          <span className="mood-trend-legend" aria-hidden="true">
            <i />
            Mood <b />
            Energy
          </span>
        </summary>
        {moodEntries.length ? (
          <div
            className="mood-trend-chart"
            role="img"
            aria-label="Mood and energy ratings for the last fourteen days"
          >
            {moodTrend.map((day) => (
              <div
                key={day.key}
                title={`${day.key}: mood ${day.mood || "not logged"}, energy ${day.energy || "not logged"}`}
              >
                <i
                  className="mood-trend-mood"
                  style={{ height: `${day.mood * 20}%` }}
                />
                <b
                  className="mood-trend-energy"
                  style={{ height: `${day.energy * 20}%` }}
                />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="friendly-empty">
            <div>
              <strong>No mood or energy entries yet.</strong>
              <p>
                A quick journal check-in will start showing your patterns here.
              </p>
            </div>
          </div>
        )}
      </details>
      <section
        className="subject-insights"
        aria-labelledby="subject-insights-title"
      >
        <div className="workout-subheading">
          <div>
            <h3 id="subject-insights-title">Study by subject · last 30 days</h3>
            <p>See where your focus time is going.</p>
          </div>
        </div>
        {subjectEntries.length ? (
          subjectEntries.map(([subject, minutes]) => (
            <div className="insight-bar" key={subject}>
              <span>{subject}</span>
              <i>
                <b
                  style={{
                    width: `${Math.min(100, (minutes / maxSubjectMinutes) * 100)}%`,
                  }}
                />
              </i>
              <small>{(minutes / 60).toFixed(1)}h</small>
            </div>
          ))
        ) : (
          <div className="friendly-empty">
            <div>
              <strong>No subject sessions yet.</strong>
              <p>
                Log study sessions by subject to see your focus balance here.
              </p>
            </div>
          </div>
        )}
      </section>
      <div className="insight-columns">
        <div>
          <h3>Habit consistency · last 30 days</h3>
          {completedHabits.length ? (
            completedHabits.map((habit) => (
              <div className="insight-bar" key={habit.name}>
                <span>{habit.name}</span>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, (habit.total / 30) * 100)}%`,
                    }}
                  />
                </i>
                <small>{habit.total}/30 days</small>
              </div>
            ))
          ) : (
            <div className="friendly-empty">
              <div>
                <strong>No habit check-ins yet.</strong>
                <p>
                  Add a habit and check in a few times to see your consistency.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="insight-callout">
          <p>
            <strong>Weekly reflection</strong>
            <br />
            Your mood was {journal.mood || "not logged"} and energy was{" "}
            {journal.energy || "not logged"}/5.
          </p>
        </div>
      </div>
      <div className="insight-summary">
        <strong>
          {completedLearningGoals} learning goal
          {completedLearningGoals === 1 ? "" : "s"} completed.
        </strong>
        <span>
          {completedHabits[0]
            ? `${completedHabits[0].name} is your most consistent habit.`
            : "Complete a habit to unlock your first pattern."}
        </span>
      </div>
      {commonFailureReason && (
        <p className="habit-reason-insight">
          Most logged reason for a missed habit this month:{" "}
          <strong>{commonFailureReason[0]}</strong> ({commonFailureReason[1]}{" "}
          check-ins).
        </p>
      )}
    </div>
  );
}

function UpcomingDeadlines({
  tasks,
  exam,
  subject,
  onNavigate,
  dayKey = todayKey(),
}) {
  const today = dateFromKey(dayKey);
  const deadlines = tasks
    .filter((task) => !task.done && /^\d{4}-\d{2}-\d{2}$/.test(task.due || ""))
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type === "assignment" ? "Assignment" : "Task",
      due: task.due,
      days: Math.round((dateFromKey(task.due) - today) / 86400000),
      section: "calendar",
    }))
    .filter((item) => item.days >= -7 && item.days <= 7);
  if (dayKey === todayKey() && exam && /^\d{4}-\d{2}-\d{2}$/.test(exam)) {
    const days = Math.round((dateFromKey(exam) - today) / 86400000);
    if (days >= 0 && days <= 7) {
      deadlines.push({
        id: "exam-deadline",
        title: `${subject} exam`,
        type: "Exam",
        due: exam,
        days,
        section: "study",
      });
    }
  }
  deadlines.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
  if (!deadlines.length) return null;
  return (
    <section className="upcoming-deadlines" aria-labelledby="upcoming-title">
      <div className="upcoming-heading">
        <div>
          <p className="eyebrow">COMING UP</p>
          <h2 id="upcoming-title">Deadlines this week</h2>
        </div>
        <span>{deadlines.length} upcoming</span>
      </div>
      <div className="upcoming-list">
        {deadlines.slice(0, 4).map((deadline) => (
          <button
            type="button"
            key={deadline.id}
            onClick={() => onNavigate(deadline.section)}
          >
            <span className="upcoming-type">{deadline.type}</span>
            <strong>{deadline.title}</strong>
            <small>
              {deadline.days < 0
                ? "Past due · review task"
                : deadline.days === 0
                  ? "Due today"
                  : `In ${deadline.days} day${deadline.days === 1 ? "" : "s"}`}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

function TodayCommandCenter({
  habits,
  tasks,
  journal,
  wellness,
  study,
  classes,
  workout,
  now,
  dayKey = todayKey(),
  onDayChange,
  onNavigate,
  dashboard,
  dashboardOrder,
  priorityTaskIds = [],
  onToggleCard,
  onReorderCards,
  onToggleHabit,
  onHabitProgress,
  onStartStudy,
  onJournal,
  onAddTask,
  onToggleTask,
  onSavePriorities,
  onLogWater,
}) {
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [draggedDashboardCard, setDraggedDashboardCard] = useState("");
  const pending = tasks.filter((task) => !task.done).length;
  const today = dayKey;
  const todayDate = dateFromKey(today);
  const todayName = WEEKDAYS[(todayDate.getDay() + 6) % 7];
  const scheduledHabits = habits.filter(
    (habit) =>
      !habit.archived &&
      !isHabitPausedOnDate(habit, dayKey) &&
      (!habit.stackAfter ||
        habits.some(
          (trigger) =>
            trigger.name === habit.stackAfter && trigger.days[dayKey]?.done,
        )) &&
      getHabitScheduleDays(habit).includes(todayName),
  );
  const habitGroups = (() => {
    const groups = [];
    const assigned = new Set();
    const byName = new Map(scheduledHabits.map((habit) => [habit.name, habit]));
    const appendChain = (root) => {
      const chain = [];
      let current = root;
      while (current && !assigned.has(current.id)) {
        chain.push(current);
        assigned.add(current.id);
        current = scheduledHabits.find(
          (habit) =>
            !assigned.has(habit.id) && habit.stackAfter === current.name,
        );
      }
      if (chain.length) groups.push(chain);
    };
    scheduledHabits
      .filter((habit) => !byName.has(habit.stackAfter))
      .forEach(appendChain);
    scheduledHabits.forEach(appendChain);
    return groups;
  })();
  const sortableCardProps = (id, heading) => ({
    draggable: true,
    style: { order: Math.max(0, dashboardOrder.indexOf(id)) },
    "aria-label": `${heading}. Drag to reorder`,
    onDragStart: (event) => {
      setDraggedDashboardCard(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    },
    onDragOver: (event) => event.preventDefault(),
    onDrop: (event) => {
      event.preventDefault();
      const from =
        event.dataTransfer.getData("text/plain") || draggedDashboardCard;
      if (from && from !== id) onReorderCards(from, id);
      setDraggedDashboardCard("");
    },
    onDragEnd: () => setDraggedDashboardCard(""),
    className: `command-card ${id === "progress" ? "today-checklist" : "command-card-action"} dashboard-sortable${draggedDashboardCard === id ? " dragging" : ""}`,
  });
  const unfinishedHabits = scheduledHabits.filter(
    (habit) => !habit.days[today]?.done,
  );
  const completedHabits = scheduledHabits.length - unfinishedHabits.length;
  const studyTodayMinutes = (study.history || [])
    .filter((session) => session.date === today)
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  const waterToday =
    Number(
      wellness.history?.[today]?.water ??
        (today === todayKey() ? wellness.water : 0),
    ) || 0;
  const waterGoal = Math.max(1, Number(wellness.waterGoal) || 8);
  const studyGoal = Math.max(0, Number(study.goal) || 0);
  const studyPercent = studyGoal
    ? Math.min(100, Math.round((study.actual / studyGoal) * 100))
    : 0;
  const timerRunning = Boolean(
    study.timerEnd && study.timerEnd > now.getTime(),
  );
  const todayIndex = (todayDate.getDay() + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isPastDay = today < todayKey();
  const sameDayClasses = (classes || [])
    .filter((item) => item.day === todayName && item.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const visibleClasses =
    today === todayKey() && !isPastDay
      ? sameDayClasses
          .filter((item) => {
            const [hour, minute] = item.startTime.split(":").map(Number);
            return hour * 60 + minute >= nowMinutes;
          })
          .slice(0, 2)
      : sameDayClasses.slice(0, 2);
  const dayStudyBlocks = (study.schedule || [])
    .filter(
      (block) =>
        block.date === today || (!block.date && block.day === todayName),
    )
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  const dayTasks = tasks.filter((task) => task.due === today);
  const dayWorkoutSplit = workout.daySplits?.[todayName];
  const dayWorkoutPlanned = Boolean(
    dayWorkoutSplit || (workout.dayPlans?.[todayName] || []).length,
  );
  const timeline = [
    ...sameDayClasses.map((item) => ({
      id: `class-${item.id}`,
      time: item.startTime,
      title: item.name,
      detail: item.location || "Class",
      section: "class-schedule",
    })),
    ...dayStudyBlocks.map((block) => ({
      id: `study-${block.id}`,
      time: block.time || "—",
      title: block.topic || block.subject,
      detail: `${block.minutes} min study${block.done ? " · done" : ""}`,
      section: "study",
    })),
    ...dayTasks.map((task) => ({
      id: `task-${task.id}`,
      time: "All day",
      title: task.title,
      detail: `${task.done ? "Completed" : task.type === "assignment" ? "Assignment" : "Task"} · ${task.priority || "medium"} priority`,
      section: "calendar",
    })),
    ...(dayWorkoutPlanned
      ? [
          {
            id: "workout-plan",
            time: "Flexible",
            title: dayWorkoutSplit
              ? `${dayWorkoutSplit.name} workout`
              : "Planned workout",
            detail: dayWorkoutSplit
              ? `${dayWorkoutSplit.split} split`
              : "Movement is on your plan",
            section: "workout",
          },
        ]
      : []),
  ].sort((a, b) => {
    const timeValue = (value) =>
      /^\d{2}:\d{2}$/.test(value)
        ? Number(value.replace(":", ""))
        : Number.POSITIVE_INFINITY;
    return timeValue(a.time) - timeValue(b.time);
  });
  const plannedWorkoutDays = WEEKDAYS.filter(
    (day) => workout.daySplits?.[day] || (workout.dayPlans?.[day] || []).length,
  );
  const nextWorkoutDay = plannedWorkoutDays
    .filter((day) => WEEKDAYS.includes(day))
    .map((day) => ({
      day,
      daysAhead: (WEEKDAYS.indexOf(day) - todayIndex + 7) % 7,
    }))
    .filter((item) => item.daysAhead > 0)
    .sort((a, b) => a.daysAhead - b.daysAhead)[0]?.day;
  const pendingDayTask = tasks
    .filter((task) => !task.done && task.due && task.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const nextStudyBlock = dayStudyBlocks.find((block) => !block.done);
  const minutesUntilNextClass = visibleClasses.length
    ? Number(visibleClasses[0].startTime.slice(0, 2)) * 60 +
      Number(visibleClasses[0].startTime.slice(3, 5)) -
      nowMinutes
    : Number.POSITIVE_INFINITY;
  const classIsImminent =
    minutesUntilNextClass <= 15 &&
    (!pendingDayTask || pendingDayTask.due >= today);
  const workoutCompleted = (workout.history || []).some(
    (session) => session.finished === today,
  );
  const nextStep = classIsImminent
    ? {
        eyebrow: "COMING UP",
        title: visibleClasses[0].name,
        detail: `Your next class starts at ${visibleClasses[0].startTime}${visibleClasses[0].location ? ` · ${visibleClasses[0].location}` : ""}.`,
        action: "View schedule",
        run: () => onNavigate("class-schedule"),
      }
    : unfinishedHabits.length
      ? {
          eyebrow: "NEXT HABIT",
          title: `Check in: ${unfinishedHabits[0].name}`,
          detail: `${unfinishedHabits.length} scheduled habit${unfinishedHabits.length === 1 ? "" : "s"} left for ${today === todayKey() ? "today" : todayName}.`,
          action: "Mark complete",
          run: () => onToggleHabit(unfinishedHabits[0].id, today),
        }
      : pendingDayTask
        ? {
            eyebrow: "TASK DUE",
            title: pendingDayTask.title,
            detail:
              pendingDayTask.due < today
                ? "This task is overdue."
                : "Due today.",
            action: "View task list",
            run: () =>
              document.getElementById("task-list")?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
                block: "start",
              }),
          }
        : visibleClasses.length
          ? {
              eyebrow: "COMING UP",
              title: visibleClasses[0].name,
              detail: `Your next class starts at ${visibleClasses[0].startTime}${visibleClasses[0].location ? ` · ${visibleClasses[0].location}` : ""}.`,
              action: "View schedule",
              run: () => onNavigate("class-schedule"),
            }
          : nextStudyBlock
            ? {
                eyebrow: "NEXT STUDY BLOCK",
                title:
                  nextStudyBlock.topic ||
                  nextStudyBlock.subject ||
                  "Study block",
                detail: `${nextStudyBlock.minutes || 60} minutes planned${nextStudyBlock.time ? ` at ${nextStudyBlock.time}` : ""}.`,
                action: "Open study",
                run: () => onNavigate("study"),
              }
            : dayWorkoutPlanned && !workoutCompleted
              ? {
                  eyebrow: "WORKOUT",
                  title: "Workout planned for today.",
                  detail: "Open your workout plan to review it.",
                  action: "Open workout",
                  run: () => onNavigate("workout"),
                }
              : !journal.text && !journal.gratitude
                ? {
                    eyebrow: "JOURNAL",
                    title: "Write a journal entry.",
                    detail: "Record a note from today.",
                    action: "Write an entry",
                    run: onJournal,
                  }
                : {
                    eyebrow: "ALL CAUGHT UP",
                    title: "No next steps to show.",
                    detail: "Review your progress in Insights.",
                    action: "View insights",
                    run: () => onNavigate("insights"),
                  };
  const addQuickTask = (event) => {
    event.preventDefault();
    const title = quickTaskTitle.trim();
    if (!title) return;
    onAddTask({
      id: createId(),
      title,
      due: today,
      priority: "medium",
      done: false,
    });
    setQuickTaskTitle("");
    setQuickTaskOpen(false);
  };
  const setPriorityAt = (index, taskId) => {
    const next = [...validPriorityTaskIds];
    if (
      taskId &&
      next.some((id, position) => id === taskId && position !== index)
    )
      return;
    next[index] = taskId;
    onSavePriorities(next.filter(Boolean).slice(0, 3));
  };
  const movePriority = (index, offset) => {
    const next = [...validPriorityTaskIds];
    const destination = index + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    onSavePriorities(next);
  };
  const validPriorityTaskIds = priorityTaskIds
    .filter((id) => tasks.some((task) => String(task.id) === String(id)))
    .slice(0, 3);
  const priorityTasks = validPriorityTaskIds
    .map((id) => tasks.find((task) => String(task.id) === String(id)))
    .filter(Boolean);
  return (
    <section className="section command-center page-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR DAY AT A GLANCE</p>
          <h2>
            {today === todayKey()
              ? "Today command center"
              : `${todayDate.toLocaleDateString(undefined, { weekday: "long" })} command center`}
          </h2>
          <p className="section-intro">
            A calm overview of the habits, tasks, and care that matter on this
            day.
          </p>
        </div>
        <div className="dashboard-customize">
          <div
            className="dashboard-date-controls"
            role="group"
            aria-label="Choose dashboard date"
          >
            <button
              type="button"
              className="dashboard-date-step"
              aria-label="Previous day"
              onClick={() => {
                const next = dateFromKey(today);
                next.setDate(next.getDate() - 1);
                onDayChange(dateKey(next));
              }}
            >
              <Icon name="ArrowLeft" size={16} />
            </button>
            <input
              type="date"
              value={today}
              aria-label="Dashboard date"
              onChange={(event) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))
                  onDayChange(event.target.value);
              }}
            />
            <button
              type="button"
              className="dashboard-date-step"
              aria-label="Next day"
              onClick={() => {
                const next = dateFromKey(today);
                next.setDate(next.getDate() + 1);
                onDayChange(dateKey(next));
              }}
            >
              <Icon name="ArrowRight" size={16} />
            </button>
            {today !== todayKey() && (
              <button
                type="button"
                className="dashboard-date-today"
                onClick={() => onDayChange(todayKey())}
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="dashboard-overview" aria-label="Daily overview">
        <article className="overview-card">
          <div className="overview-card-heading">
            <span className="command-icon purple-bg">
              <Icon name="Check" size={18} />
            </span>
            <h3>Today’s habits</h3>
          </div>
          <strong className="overview-value">
            {completedHabits}
            <small> / {scheduledHabits.length}</small>
          </strong>
          <div
            className="overview-progress"
            role="progressbar"
            aria-label="Today's habit completion"
            aria-valuemin="0"
            aria-valuemax={scheduledHabits.length || 1}
            aria-valuenow={completedHabits}
          >
            <i
              style={{
                width: `${scheduledHabits.length ? (completedHabits / scheduledHabits.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {scheduledHabits.length
              ? `${unfinishedHabits.length} left to check in`
              : "No habits planned today"}
          </small>
        </article>
        <article className="overview-card">
          <div className="overview-card-heading">
            <span className="command-icon orange-bg">
              <Icon name="CalendarDays" size={18} />
            </span>
            <h3>Upcoming classes</h3>
          </div>
          {visibleClasses.length ? (
            <div className="overview-class-list">
              {visibleClasses.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onNavigate("class-schedule")}
                >
                  <strong>{item.name}</strong>
                  <small>
                    {item.startTime} · {item.endTime}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="overview-empty">
              No upcoming classes. Your schedule is clear.
            </p>
          )}
        </article>
        <article className="overview-card">
          <div className="overview-card-heading">
            <span className="command-icon green-bg">
              <Icon name="Clock" size={18} />
            </span>
            <h3>Study progress</h3>
          </div>
          <strong className="overview-value">
            {study.actual}
            <small> / {studyGoal}h this week</small>
          </strong>
          <div
            className="overview-progress study-progress"
            role="progressbar"
            aria-label="Weekly study goal progress"
            aria-valuemin="0"
            aria-valuemax={studyGoal || 1}
            aria-valuenow={Math.min(studyGoal || 1, study.actual)}
          >
            <i style={{ width: `${studyPercent}%` }} />
          </div>
          <small>
            {studyTodayMinutes} min today · {studyPercent}% of weekly goal
          </small>
        </article>
        <article className="overview-card">
          <div className="overview-card-heading">
            <span className="command-icon blue-bg">
              <Icon name="Dumbbell" size={18} />
            </span>
            <h3>Workout plan</h3>
          </div>
          <strong className="overview-value workout-plan-value">
            {dayWorkoutPlanned
              ? workoutCompleted
                ? "Completed"
                : "Planned for this day"
              : nextWorkoutDay
                ? `Next · ${nextWorkoutDay}`
                : "No days planned"}
          </strong>
          <small>
            {plannedWorkoutDays.length
              ? plannedWorkoutDays
                  .map((day) => {
                    const split = workout.daySplits?.[day];
                    return split
                      ? `${day.slice(0, 3)} · ${split.name}`
                      : day.slice(0, 3);
                  })
                  .join(" · ")
              : "Assign a split to a day in your workout schedule"}
          </small>
          <button
            type="button"
            className="overview-link"
            onClick={() => onNavigate("workout")}
          >
            Open workout plan <Icon name="ArrowRight" size={16} />
          </button>
        </article>
      </div>
      {nextStep.eyebrow !== "JOURNAL" && (
        <section
          className="dashboard-next-step"
          aria-labelledby="dashboard-next-step-title"
        >
          <span className="dashboard-next-step-icon">
            <Icon name="Sparkles" size={20} />
          </span>
          <div className="dashboard-next-step-copy">
            <p className="eyebrow">{nextStep.eyebrow}</p>
            <h3 id="dashboard-next-step-title">{nextStep.title}</h3>
            <p>{nextStep.detail}</p>
          </div>
          <button
            type="button"
            className="dashboard-next-step-action"
            onClick={nextStep.run}
          >
            {nextStep.action}
            <Icon name="ArrowRight" size={16} />
          </button>
        </section>
      )}
      <div
        className="dashboard-quick-actions"
        aria-labelledby="quick-actions-title"
      >
        <h3 id="quick-actions-title">Quick actions</h3>
        <button
          type="button"
          className="quick-action-button"
          disabled={scheduledHabits.length > 0 && !unfinishedHabits.length}
          onClick={() =>
            unfinishedHabits[0]
              ? onToggleHabit(unfinishedHabits[0].id, today)
              : onNavigate("habits")
          }
        >
          <Icon name="Check" size={16} />
          {unfinishedHabits.length
            ? `Complete ${unfinishedHabits[0].name}`
            : scheduledHabits.length
              ? "All habits checked"
              : habits.some((habit) => !habit.archived)
                ? "View habits"
                : "Add a habit"}
        </button>
        <button
          type="button"
          className="quick-action-button"
          onClick={(event) => onStartStudy(event.nativeEvent.timeStamp)}
        >
          <span aria-hidden="true">
            <NavIcon name="clock" />
          </span>
          {timerRunning
            ? "Resume focus timer"
            : `Start ${study.workMinutes || 25}-min focus`}
        </button>
        <button
          type="button"
          className="quick-action-button"
          onClick={onJournal}
        >
          <span aria-hidden="true">
            <NavIcon name="note" />
          </span>
          {journal.text || journal.gratitude
            ? "Continue journal entry"
            : "Add journal entry"}
        </button>
        <button
          type="button"
          className="quick-action-button"
          aria-expanded={quickTaskOpen}
          aria-controls="dashboard-quick-task-form"
          onClick={() => setQuickTaskOpen((open) => !open)}
        >
          <span aria-hidden="true">
            <NavIcon name="plus" />
          </span>
          Add task
        </button>
        <button
          type="button"
          className="quick-action-button"
          onClick={() => onLogWater(today)}
          aria-label={`Log a glass of water. ${waterToday} of ${waterGoal} glasses logged`}
        >
          <span aria-hidden="true">
            <NavIcon name="activity" />
          </span>
          Water {waterToday}/{waterGoal}
        </button>
        {quickTaskOpen && (
          <form
            id="dashboard-quick-task-form"
            className="dashboard-quick-task-form"
            onSubmit={addQuickTask}
          >
            <label className="sr-only" htmlFor="dashboard-quick-task-title">
              New task name
            </label>
            <input
              id="dashboard-quick-task-title"
              autoFocus
              value={quickTaskTitle}
              onChange={(event) => setQuickTaskTitle(event.target.value)}
              placeholder="What needs doing?"
              maxLength={100}
              required
            />
            <button type="submit" className="primary-btn">
              Save task
            </button>
          </form>
        )}
      </div>
      <details className="today-timeline" open>
        <summary>
          <span>
            <strong>Day timeline</strong>
            <small>Classes, study blocks, tasks, and movement</small>
          </span>
          <span className="timeline-count">
            {timeline.length} item{timeline.length === 1 ? "" : "s"}
          </span>
        </summary>
        {timeline.length ? (
          <ol>
            {timeline.map((item) => (
              <li key={item.id}>
                <time>{item.time}</time>
                <span
                  className={`timeline-dot timeline-${item.section}`}
                  aria-hidden="true"
                />
                <button type="button" onClick={() => onNavigate(item.section)}>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="timeline-empty">
            <strong>No scheduled items.</strong>
            <span>
              Add a class, study block, task, or workout plan to this day.
            </span>
          </div>
        )}
      </details>
      <section
        className="today-priorities"
        aria-labelledby="today-priorities-title"
      >
        <div className="today-priorities-heading">
          <div>
            <h3 id="today-priorities-title">Top 3 priorities</h3>
            <span>Pick the few tasks that matter most today.</span>
          </div>
          <small>
            {priorityTasks.filter((task) => task.done).length}/
            {priorityTasks.length} done
          </small>
        </div>
        <ol>
          {priorityTasks.map((task, index) => (
            <li className={task.done ? "done" : ""} key={task.id}>
              <button
                type="button"
                className="today-priority-check"
                aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
                onClick={() => onToggleTask(task.id)}
              >
                {task.done ? <Icon name="Check" size={16} /> : index + 1}
              </button>
              <span>{task.title}</span>
              <button
                type="button"
                className="today-priority-move"
                disabled={index === 0}
                aria-label={`Move ${task.title} up`}
                title={`Move ${task.title} up`}
                onClick={() => movePriority(index, -1)}
              >
                <Icon name="ArrowUp" size={16} />
              </button>
              <button
                type="button"
                className="today-priority-move"
                disabled={index === priorityTasks.length - 1}
                aria-label={`Move ${task.title} down`}
                title={`Move ${task.title} down`}
                onClick={() => movePriority(index, 1)}
              >
                <Icon name="ArrowDown" size={16} />
              </button>
              <button
                type="button"
                className="today-priority-remove"
                aria-label={`Remove ${task.title} from priorities`}
                title={`Remove ${task.title} from priorities`}
                onClick={() => setPriorityAt(index, "")}
              >
                <Icon name="X" size={16} />
              </button>
            </li>
          ))}
          {priorityTasks.length < 3 && (
            <li className="today-priority-add">
              <Icon name="Plus" size={16} />
              <select
                aria-label={`Choose priority ${priorityTasks.length + 1}`}
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    onSavePriorities(
                      [...validPriorityTaskIds, event.target.value].slice(0, 3),
                    );
                }}
              >
                <option value="">Add an existing task…</option>
                {tasks
                  .filter(
                    (task) =>
                      !task.done &&
                      !validPriorityTaskIds.some(
                        (id) => String(id) === String(task.id),
                      ),
                  )
                  .map((task) => (
                    <option value={task.id} key={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </li>
          )}
        </ol>
      </section>
      <div className="command-grid">
        {dashboard.progress && (
          <div {...sortableCardProps("progress", "Progress card")}>
            <div className="command-card-heading">
              <span className="command-icon purple-bg">
                <Icon name="Check" size={18} />
              </span>
              <div>
                <strong>Today’s habits</strong>
                <small>Tap to complete</small>
              </div>
            </div>
            {scheduledHabits.length ? (
              habitGroups.map((group) => (
                <div
                  className={`habit-routine-stack${group.length > 1 ? " linked" : ""}`}
                  key={group[0].id}
                >
                  {group.length > 1 && (
                    <small className="habit-routine-stack-title">
                      Habit stack
                    </small>
                  )}
                  {group.map((habit) => {
                    const done = habit.days[today]?.done;
                    return (
                      <div className="habit-checklist-row" key={habit.id}>
                        <button
                          type="button"
                          className={`checklist-item ${done ? "done" : ""}`}
                          onClick={() => onToggleHabit(habit.id, today)}
                        >
                          <span>
                            {done ? <Icon name="Check" size={16} /> : ""}
                          </span>
                          <span>
                            {habit.name}
                            {habit.stackAfter && (
                              <small>After {habit.stackAfter}</small>
                            )}
                          </span>
                        </button>
                        {habit.numericTarget > 0 && (
                          <label className="habit-checklist-quantity">
                            <input
                              type="number"
                              min="0"
                              max={habit.numericTarget}
                              step="any"
                              value={habit.days[today]?.amount || 0}
                              aria-label={`${habit.name} progress`}
                              onChange={(event) =>
                                onHabitProgress(
                                  habit.id,
                                  today,
                                  event.target.value,
                                )
                              }
                            />
                            <small>
                              / {habit.numericTarget} {habit.numericUnit}
                            </small>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : habits.some(
                (habit) =>
                  !habit.archived && !isHabitPausedOnDate(habit, today),
              ) ? (
              <div className="command-empty">
                <small>A planned rest day. Enjoy your breathing room.</small>
              </div>
            ) : habits.some(
                (habit) => !habit.archived && isHabitPausedOnDate(habit, today),
              ) ? (
              <div className="command-empty">
                <small>
                  Your habits are paused. Resume one whenever you’re ready.
                </small>
              </div>
            ) : (
              <div className="command-empty">
                <small>No habits yet. Start with one small routine.</small>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onNavigate("habits")}
                >
                  Add your first habit <Icon name="ArrowRight" size={16} />
                </button>
              </div>
            )}
          </div>
        )}
        {dashboard.tasks && (
          <div {...sortableCardProps("tasks", "Tasks card")}>
            <span className="command-icon orange-bg">
              <NavIcon name="clock" />
            </span>
            <strong>
              {pending
                ? `${pending} task${pending === 1 ? "" : "s"} left`
                : "Task list clear"}
            </strong>
            <small>Keep today realistic</small>
            <button
              type="button"
              className="command-card-open"
              onClick={() =>
                document.getElementById("task-list")?.scrollIntoView({
                  behavior:
                    data.settings.reduceMotion ||
                    window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "auto"
                      : "smooth",
                  block: "start",
                })
              }
            >
              Open tasks <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        )}
        {dashboard.wellness && (
          <div {...sortableCardProps("wellness", "Wellness card")}>
            <span className="command-icon blue-bg">
              <NavIcon name="activity" />
            </span>
            <strong>{journal.mood || "Check in with yourself"}</strong>
            <small>
              {wellness.sleep
                ? `${wellness.sleep}h sleep logged`
                : "Mood and energy are waiting"}
            </small>
            <button
              type="button"
              className="command-card-open"
              onClick={() => onNavigate("journal")}
            >
              Check in <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        )}
        {dashboard.focus && (
          <div {...sortableCardProps("focus", "Focus card")}>
            <span className="command-icon green-bg">
              <NavIcon name="clock" />
            </span>
            <strong>Make space to focus</strong>
            <small>Start a study session</small>
            <button
              type="button"
              className="command-card-open"
              onClick={() => onNavigate("study")}
            >
              Open study <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function GlobalSearchPalette({
  data,
  query,
  onQueryChange,
  onClose,
  onNavigate,
  onAction,
}) {
  const inputRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => inputRef.current?.focus(), []);
  const entries = [
    ...data.habits.map((item) => ({
      title: item.name,
      detail: "Habit",
      section: "habits",
    })),
    ...data.tasks.map((item) => ({
      title: item.title,
      detail: `${item.type === "assignment" ? "Assignment" : "Task"} · ${item.due || ""}`,
      section: "today",
    })),
    ...Object.entries(data.journal || {}).flatMap(([date, item]) =>
      [
        item.text && {
          title: item.text,
          detail: `Journal · ${date}`,
          section: "journal",
        },
        item.gratitude && {
          title: item.gratitude,
          detail: `Gratitude · ${date}`,
          section: "journal",
        },
        ...(item.tags || []).map((tag) => ({
          title: tag,
          detail: `Journal tag · ${date}`,
          section: "journal",
        })),
      ].filter(Boolean),
    ),
    ...data.study.flashcards.map((item) => ({
      title: item.question,
      detail: `Flashcard · ${item.subject}`,
      section: "flashcards",
    })),
    ...data.learning.flatMap((item) => [
      {
        title: item.title,
        detail: `Learning · ${item.category}`,
        section: "learning",
      },
      ...(item.logs || [])
        .filter((log) => log.note)
        .map((log) => ({
          title: log.note,
          detail: `Learning log · ${log.date}`,
          section: "learning",
        })),
    ]),
    ...(data.study.subjects || []).flatMap((item) => [
      { title: item.name, detail: "Study subject", section: "study" },
      ...(item.topics || []).map((topic) => ({
        title:
          typeof topic === "string" ? topic : topic.title || topic.name || "",
        detail: `Study topic · ${item.name}`,
        section: "study",
      })),
    ]),
    ...(data.workout.exercises || []).map((item) => ({
      title: item.name,
      detail: `Workout · ${item.date}`,
      section: "workout",
    })),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery
    ? entries
        .filter((entry) =>
          `${entry.title} ${entry.detail}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 12)
    : [
        {
          title: "Today",
          detail: "Open your daily overview",
          section: "today",
        },
        {
          title: "Study planner",
          detail: "Subjects, exams, and grades",
          section: "study",
        },
        {
          title: "Learning goals",
          detail: "Steps, resources, and notes",
          section: "learning",
        },
        {
          title: "Workout log",
          detail: "Routines and training history",
          section: "workout",
        },
        {
          title: "Start a focus session",
          detail: "Quick action · Ctrl Shift S",
          section: "study",
          action: "study",
        },
        {
          title: "Write a journal entry",
          detail: "Quick action · Ctrl Shift J",
          section: "journal",
          action: "journal",
        },
        {
          title: "Open workout log",
          detail: "Quick action · Ctrl Shift W",
          section: "workout",
          action: "workout",
        },
        {
          title: "Add a habit",
          detail: "Quick action",
          section: "habits",
          action: "habit",
        },
      ];
  const choose = (entry) => {
    if (entry.action) onAction(entry.action);
    else onNavigate(entry.section);
    onClose();
  };
  return (
    <div
      className="command-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search Daymark"
      >
        <div className="command-palette-search">
          <Icon name="Search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(results.length - 1, index + 1),
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter" && results[activeIndex])
                choose(results[activeIndex]);
            }}
            placeholder="Search habits, tasks, notes, cards…"
          />
          <kbd>ESC</kbd>
          <button
            type="button"
            className="command-palette-close"
            onClick={onClose}
            aria-label="Close search"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="command-palette-results">
          {results.map((entry, index) => (
            <button
              type="button"
              className={index === activeIndex ? "active" : ""}
              key={`${entry.section}-${entry.title}-${index}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(entry)}
            >
              <span>
                <strong>{entry.title}</strong>
                <small>{entry.detail}</small>
              </span>
              <small>
                <Icon name="CornerDownLeft" size={16} />
              </small>
            </button>
          ))}
          {!results.length && <p>No matching Daymark items.</p>}
        </div>
        <footer>
          <span>
            <Icon name="ArrowUp" size={14} />
            <Icon name="ArrowDown" size={14} /> to navigate
          </span>
          <span>Enter to open</span>
          <span>Ctrl K to search</span>
        </footer>
      </section>
    </div>
  );
}

function TodayScoreCard({
  habits,
  tasks,
  study,
  workout,
  wellness,
  classes,
  learning,
}) {
  const today = todayKey();
  const tomorrowDate = dateFromKey(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const tomorrowDay = WEEKDAYS[(tomorrowDate.getDay() + 6) % 7];
  const todayName = WEEKDAYS[(dateFromKey(today).getDay() + 6) % 7];
  const todayHabits = habits.filter(
    (habit) =>
      !habit.archived &&
      !isHabitPausedOnDate(habit, today) &&
      getHabitScheduleDays(habit).includes(todayName) &&
      !habit.days[today]?.paused,
  );
  const completedHabits = todayHabits.filter(
    (habit) => habit.days[today]?.done,
  ).length;
  const studyMinutes = (study.history || [])
    .filter((session) => session.date === today)
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  const todayWorkoutDay = WEEKDAYS[(dateFromKey(today).getDay() + 6) % 7];
  const plannedWorkout = Boolean(
    workout.daySplits?.[todayWorkoutDay] ||
    (workout.dayPlans?.[todayWorkoutDay] || []).length,
  );
  const workoutDone = (workout.history || []).some(
    (session) => session.finished === today,
  );
  const water = wellness.history?.[today]?.water ?? wellness.water ?? 0;
  const waterGoal = wellness.waterGoal || 8;
  const parts = [
    todayHabits.length ? completedHabits / todayHabits.length : 1,
    Math.min(1, studyMinutes / Math.max(1, (Number(study.goal || 0) * 60) / 7)),
    plannedWorkout ? Number(workoutDone) : 1,
    Math.min(1, water / waterGoal),
  ];
  const score = Math.round(
    (parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100,
  );
  const tomorrowTasks = tasks.filter(
    (task) => task.due === tomorrow && !task.done,
  );
  const tomorrowClasses = (classes || []).filter(
    (item) => item.day === tomorrowDay,
  );
  const tomorrowReviews = learning.filter((item) =>
    (item.reviewDates || []).includes(tomorrow),
  );
  return (
    <section className="today-score-card">
      <div>
        <p className="eyebrow">TODAY'S SCORE</p>
        <h3>
          Today’s score <strong>{score}</strong>
          <small>/100</small>
        </h3>
        <div className="today-score-track">
          <i style={{ width: `${score}%` }} />
        </div>
        <span>
          {completedHabits}/{todayHabits.length} habits · {studyMinutes} study
          min · {workoutDone ? "workout done" : "movement"} · {water}/
          {waterGoal} water
        </span>
      </div>
      <div className="tomorrow-preview">
        <strong>Tomorrow preview · {tomorrowDay}</strong>
        <span>
          {tomorrowTasks.length} assignment/task
          {tomorrowTasks.length === 1 ? "" : "s"} · {tomorrowClasses.length}{" "}
          class{tomorrowClasses.length === 1 ? "" : "es"} ·{" "}
          {tomorrowReviews.length} learning review
          {tomorrowReviews.length === 1 ? "" : "s"}
        </span>
        {[
          ...tomorrowTasks.map((task) => task.title),
          ...tomorrowClasses.map((item) => item.name),
          ...tomorrowReviews.map((item) => `${item.title} review`),
        ]
          .slice(0, 4)
          .map((item, index) => (
            <small key={`${item}-${index}`}>{item}</small>
          ))}
      </div>
    </section>
  );
}

function WeeklyReview({ habits, tasks, study, journal, settings, onSave }) {
  const today = todayKey();
  const week = weekStartKey();
  const plan = settings.weeklyReviewPlans?.[week] || {};
  if (
    dateFromKey(today).getDay() !== 0 ||
    settings.weeklyReviewDismissed === week
  )
    return null;
  const weekTasks = tasks.filter(
    (task) => task.done && task.due >= week && task.due <= todayKey(),
  );
  const studyMinutes = (study.history || [])
    .filter((session) => session.date >= week && session.date <= todayKey())
    .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  const activeHabits = habits.filter(
    (habit) => !habit.archived && !isHabitPausedOnDate(habit, today),
  );
  const missed = activeHabits.filter((habit) => {
    const scheduledDays = getHabitScheduleDays(habit);
    const expected = scheduledDays.filter((day) => {
      const offset = WEEKDAYS.indexOf(day);
      const keyDate = dateFromKey(week);
      keyDate.setDate(keyDate.getDate() + offset);
      const key = dateKey(keyDate);
      return (
        key <= today &&
        !isHabitPausedOnDate(habit, key) &&
        !(habit.days[key]?.done || habit.days[key]?.paused)
      );
    });
    return expected.length > 0;
  });
  const updatePlan = (field, value) =>
    onSave({
      weeklyReviewPlans: {
        ...(settings.weeklyReviewPlans || {}),
        [week]: { ...plan, [field]: value },
      },
    });
  return (
    <section className="weekly-review-card">
      <div className="workout-subheading">
        <h3>Your weekly review</h3>
        <span>Wins, misses, and a fresh start</span>
      </div>
      <p>
        {weekTasks.length} task{weekTasks.length === 1 ? "" : "s"} completed ·{" "}
        {studyMinutes} study minutes · {activeHabits.length - missed.length}/
        {activeHabits.length} habits on pace
      </p>
      <small>
        {missed.length
          ? `Still in progress: ${missed.map((habit) => habit.name).join(", ")}.`
          : "You stayed on pace with every habit."}{" "}
        Mood: {journal.mood || "not logged"}.
      </small>
      <label>
        What went well?
        <textarea
          value={plan.win || ""}
          onChange={(event) => updatePlan("win", event.target.value)}
          placeholder="Notice something you’re proud of"
          rows="2"
        />
      </label>
      <label>
        Next week’s priorities
        <textarea
          value={plan.priorities || ""}
          onChange={(event) => updatePlan("priorities", event.target.value)}
          placeholder="One or two things to make room for"
          rows="2"
        />
      </label>
      <label>
        Next week’s habit goal
        <textarea
          value={plan.goal || settings.weeklyReviewNote || ""}
          onChange={(event) => updatePlan("goal", event.target.value)}
          placeholder="A kind, specific intention"
          rows="2"
        />
      </label>
      <button
        type="button"
        className="text-button"
        onClick={() => onSave({ weeklyReviewDismissed: week })}
      >
        Close review
      </button>
    </section>
  );
}

function CalendarView({
  data,
  selectedDay,
  onSelectDay,
  onToggle,
  onAddTask,
  onMoveTask,
  onAddStudyBlock,
}) {
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState("");
  const [dropTargetDay, setDropTargetDay] = useState("");
  const [viewMode, setViewMode] = useState("month");
  const [filters, setFilters] = useState({
    habits: true,
    tasks: true,
    classes: true,
    study: true,
    workouts: true,
    journal: true,
    deadlines: true,
  });
  const [month, setMonth] = useState(() => {
    const date = dateFromKey(selectedDay);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstDay + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - firstDay + 1;
      return day > 0 && day <= daysInMonth
        ? new Date(month.getFullYear(), month.getMonth(), day)
        : null;
    },
  );
  const selectedDate = dateFromKey(selectedDay);
  const selectedDayName = WEEKDAYS[(selectedDate.getDay() + 6) % 7];
  const selectedHabits = filters.habits
    ? data.habits.filter((habit) => {
        const paused = isHabitPausedOnDate(habit, selectedDay);
        return (
          habit.days[selectedDay]?.done ||
          habit.days[selectedDay]?.paused ||
          habit.days[selectedDay]?.note?.trim() ||
          paused ||
          (!paused && getHabitScheduleDays(habit).includes(selectedDayName))
        );
      })
    : [];
  const selectedTasks = filters.tasks
    ? data.tasks.filter((task) => task.due === selectedDay)
    : [];
  const selectedClasses = (data.study.classes || []).filter(
    (item) =>
      item.day === selectedDayName && classOccursOnDate(item, selectedDay),
  );
  const visibleClasses = filters.classes ? selectedClasses : [];
  const selectedStudyBlocks = filters.study
    ? (data.study.schedule || []).filter(
        (block) =>
          block.date === selectedDay ||
          (!block.date && block.day === selectedDayName),
      )
    : [];
  const selectedStudySessions = filters.study
    ? (data.study.history || []).filter(
        (session) => session.date === selectedDay,
      )
    : [];
  const selectedStudyGaps =
    filters.study && filters.classes
      ? suggestInterclassStudyGaps({
          day: selectedDayName,
          date: selectedDay,
          classes: selectedClasses,
          schedule: data.study.schedule || [],
        })
      : [];
  const selectedWorkouts = filters.workouts
    ? (data.workout.history || []).filter(
        (session) => session.finished === selectedDay,
      )
    : [];
  const selectedJournal = filters.journal ? data.journal?.[selectedDay] : null;
  const hasJournalEntry = Boolean(
    selectedJournal?.text ||
    selectedJournal?.gratitude ||
    selectedJournal?.mood ||
    selectedJournal?.energy ||
    selectedJournal?.tags?.length,
  );
  const filterLabels = [
    ["habits", "Habits"],
    ["tasks", "Tasks"],
    ["classes", "Classes"],
    ["study", "Study"],
    ["workouts", "Workouts"],
    ["journal", "Journal"],
    ["deadlines", "Exam"],
  ];
  const addSelectedDayTask = (event) => {
    event.preventDefault();
    const title = quickTaskTitle.trim();
    if (!title) return;
    onAddTask({
      id: createId(),
      title,
      due: selectedDay,
      done: false,
      priority: "medium",
      type: "task",
    });
    setQuickTaskTitle("");
  };
  const dayEvents = (key) => {
    const date = dateFromKey(key);
    const dayName = WEEKDAYS[(date.getDay() + 6) % 7];
    return {
      habits:
        filters.habits &&
        data.habits.some((habit) => {
          const paused = isHabitPausedOnDate(habit, key);
          return (
            habit.days[key]?.done ||
            habit.days[key]?.paused ||
            habit.days[key]?.note?.trim() ||
            paused ||
            (!paused && getHabitScheduleDays(habit).includes(dayName))
          );
        }),
      tasks: filters.tasks && data.tasks.some((task) => task.due === key),
      classes:
        filters.classes &&
        (data.study.classes || []).some(
          (item) => item.day === dayName && classOccursOnDate(item, key),
        ),
      study:
        filters.study &&
        ((data.study.schedule || []).some(
          (block) =>
            block.date === key || (!block.date && block.day === dayName),
        ) ||
          (data.study.history || []).some((session) => session.date === key)),
      workouts:
        filters.workouts &&
        ((data.workout.history || []).some(
          (session) => session.finished === key,
        ) ||
          Boolean(data.workout.daySplits?.[dayName]) ||
          (data.workout.dayPlans?.[dayName] || []).length > 0),
      journal:
        filters.journal &&
        Boolean(
          data.journal?.[key]?.text ||
          data.journal?.[key]?.gratitude ||
          data.journal?.[key]?.mood ||
          data.journal?.[key]?.energy ||
          data.journal?.[key]?.tags?.length,
        ),
      deadlines: filters.deadlines && data.study.exam === key,
    };
  };
  const selectedWeek = Array.from({ length: 7 }, (_, index) => {
    const date = dateFromKey(selectedDay);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + index);
    return date;
  });
  const agendaDays = cells.filter(Boolean).filter((date) => {
    const key = dateKey(date);
    return Object.values(dayEvents(key)).some(Boolean);
  });
  const dayCompletion = (key) => {
    const date = dateFromKey(key);
    const dayName = WEEKDAYS[(date.getDay() + 6) % 7];
    const scheduled = data.habits.filter(
      (habit) =>
        !habit.archived &&
        !isHabitPausedOnDate(habit, key) &&
        getHabitScheduleDays(habit).includes(dayName),
    );
    if (!scheduled.length) return null;
    const credit = scheduled.reduce(
      (total, habit) =>
        total +
        (habit.numericTarget
          ? Math.min(
              1,
              Number(habit.days[key]?.amount || 0) / habit.numericTarget,
            )
          : habit.days[key]?.done
            ? 1
            : 0),
      0,
    );
    return Math.round((credit / scheduled.length) * 100);
  };
  const plannedWorkoutSplit = data.workout.daySplits?.[selectedDayName];
  const plannedWorkoutExercises =
    plannedWorkoutSplit?.exercises ||
    data.workout.dayPlans?.[selectedDayName] ||
    [];
  const hasWorkoutPlan = Boolean(
    plannedWorkoutSplit || plannedWorkoutExercises.length,
  );
  const eventCount =
    selectedHabits.length +
    selectedTasks.length +
    visibleClasses.length +
    selectedStudyBlocks.length +
    selectedStudySessions.length +
    selectedWorkouts.length +
    (filters.workouts && hasWorkoutPlan ? 1 : 0) +
    (hasJournalEntry ? 1 : 0) +
    (filters.deadlines && data.study.exam === selectedDay ? 1 : 0);
  const studyAgenda = [
    ...selectedStudyBlocks.map((block) => ({
      id: block.id,
      title: block.topic || block.subject,
      detail: `${block.time} · ${block.minutes} min${block.done ? " · Done" : ""}`,
    })),
    ...selectedStudySessions.map((session) => ({
      id: session.id,
      title: session.subject || "Study session",
      detail: `${session.minutes} min completed${session.note ? ` · ${session.note}` : ""}`,
    })),
  ];
  return (
    <section className="section calendar-view page-view compact-calendar">
      <PageHeading
        eyebrow="YOUR CALENDAR"
        title="Calendar"
        subtitle="Select a date to review habits, tasks, classes, study, and notes."
        aside={<span className="date-pill">{selectedDay}</span>}
      />
      <div className="calendar-review">
        <div className="calendar-review-toolbar">
          <details className="calendar-filter-details">
            <summary>Filters &amp; legend</summary>
            <div
              className="calendar-filter"
              role="group"
              aria-label="Filter calendar events"
            >
              <span>Show</span>
              {filterLabels.map(([id, label]) => (
                <button
                  type="button"
                  className={filters[id] ? "selected" : ""}
                  aria-pressed={filters[id]}
                  key={id}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      [id]: !current[id],
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="calendar-event-legend"
              aria-label="Calendar marker legend"
            >
              <span>
                <i className="calendar-day-marker habits" />
                Habits
              </span>
              <span>
                <i className="calendar-day-marker tasks" />
                Tasks
              </span>
              <span>
                <i className="calendar-day-marker classes" />
                Classes
              </span>
              <span>
                <i className="calendar-day-marker study" />
                Study
              </span>
              <span>
                <i className="calendar-day-marker workouts" />
                Workouts
              </span>
              <span>
                <i className="calendar-day-marker journal" />
                Journal
              </span>
              <span>
                <i className="calendar-day-marker deadlines" />
                Exam
              </span>
            </div>
          </details>
          <div
            className="calendar-view-switch"
            role="group"
            aria-label="Calendar view"
          >
            {["month", "week", "agenda"].map((mode) => (
              <button
                type="button"
                className={viewMode === mode ? "selected" : ""}
                aria-pressed={viewMode === mode}
                key={mode}
                onClick={() => setViewMode(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="calendar-review-body">
          <div
            className={`calendar-review-grid${viewMode !== "month" ? " calendar-grid-hidden" : ""}`}
          >
            <div className="calendar-review-head">
              <button
                type="button"
                aria-label="Previous month"
                title="Previous month"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <Icon name="ArrowLeft" size={16} />
              </button>
              <strong>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              <button
                type="button"
                aria-label="Next month"
                title="Next month"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <Icon name="ArrowRight" size={16} />
              </button>
              <button
                type="button"
                className="calendar-jump-today"
                onClick={() => {
                  const today = dateFromKey(todayKey());
                  setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  onSelectDay(todayKey());
                }}
              >
                Today
              </button>
            </div>
            <div className="calendar-review-weekdays">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-review-days">
              {cells.map((date, index) => {
                if (!date) return <span key={`blank-${index}`} />;
                const key = dateKey(date);
                const events = dayEvents(key);
                const completion = dayCompletion(key);
                return (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={key === selectedDay}
                    className={`${key === selectedDay ? "selected" : ""} ${key === todayKey() ? "today" : ""}${dropTargetDay === key ? " drop-target" : ""}`}
                    style={
                      completion === null
                        ? undefined
                        : { "--day-completion": completion / 100 }
                    }
                    aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${completion === null ? "" : `, ${completion}% habits complete`}${
                      Object.values(events).some(Boolean)
                        ? `, ${Object.entries(events)
                            .filter(([, hasEvents]) => hasEvents)
                            .map(([type]) => type)
                            .join(", ")}`
                        : ", no tracked events"
                    }`}
                    onDragOver={(event) => {
                      if (draggedTaskId) {
                        event.preventDefault();
                        setDropTargetDay(key);
                      }
                    }}
                    onDragLeave={() => setDropTargetDay("")}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id =
                        event.dataTransfer.getData("text/plain") ||
                        draggedTaskId;
                      if (id) onMoveTask(id, key);
                      setDraggedTaskId("");
                      setDropTargetDay("");
                      onSelectDay(key);
                    }}
                    onClick={() => onSelectDay(key)}
                  >
                    {date.getDate()}
                    <span className="calendar-day-markers" aria-hidden="true">
                      {Object.entries(events)
                        .filter(([, hasEvents]) => hasEvents)
                        .map(([type]) => (
                          <i
                            className={`calendar-day-marker ${type}`}
                            key={type}
                          />
                        ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {viewMode === "week" && (
            <section className="calendar-week-view" aria-label="Selected week">
              <h3>
                Week of{" "}
                {dateFromKey(dateKey(selectedWeek[0])).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" },
                )}
              </h3>
              {selectedWeek.map((date) => {
                const key = dateKey(date);
                const events = dayEvents(key);
                const labels = Object.entries(events)
                  .filter(([, hasEvents]) => hasEvents)
                  .map(([type]) => type);
                return (
                  <button
                    type="button"
                    className={key === selectedDay ? "selected" : ""}
                    key={key}
                    onClick={() => onSelectDay(key)}
                  >
                    <time dateTime={key}>
                      {date.toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </time>
                    <span>
                      {labels.length
                        ? labels.join(" · ")
                        : "No scheduled items"}
                    </span>
                  </button>
                );
              })}
            </section>
          )}
          {viewMode === "agenda" && (
            <section
              className="calendar-agenda-view"
              aria-label="Agenda for selected month"
            >
              <h3>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}{" "}
                · agenda
              </h3>
              {agendaDays.length ? (
                agendaDays.map((date) => {
                  const key = dateKey(date);
                  const labels = Object.entries(dayEvents(key))
                    .filter(([, hasEvents]) => hasEvents)
                    .map(([type]) => type);
                  return (
                    <button
                      type="button"
                      className={key === selectedDay ? "selected" : ""}
                      key={key}
                      onClick={() => onSelectDay(key)}
                    >
                      <time dateTime={key}>
                        {date.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                      <span>{labels.join(" · ")}</span>
                    </button>
                  );
                })
              ) : (
                <p>No tracked items this month.</p>
              )}
            </section>
          )}
          <div className="calendar-review-detail">
            <div className="calendar-detail-heading">
              <div>
                <p className="eyebrow">
                  {formatDate(dateFromKey(selectedDay)).toUpperCase()}
                </p>
                <h3>
                  {eventCount} tracked {eventCount === 1 ? "item" : "items"}
                </h3>
              </div>
              {filters.deadlines && data.study.exam === selectedDay && (
                <div className="calendar-agenda calendar-exam-countdown">
                  <strong>
                    Exam · {data.study.selectedSubject || data.study.subject}
                  </strong>
                  <small>Exam day · {selectedDay}</small>
                </div>
              )}
            </div>
            {filters.habits &&
              selectedHabits.map((habit) => {
                const paused =
                  habit.days[selectedDay]?.paused ||
                  isHabitPausedOnDate(habit, selectedDay);
                return (
                  <button
                    type="button"
                    className={`calendar-habit ${habit.days[selectedDay]?.done ? "done" : ""} ${paused ? "paused" : ""}`}
                    disabled={isHabitPausedOnDate(habit, selectedDay)}
                    key={habit.id}
                    onClick={() => onToggle(habit.id, selectedDay)}
                  >
                    <span style={{ background: habit.color }} />
                    {habit.name}
                    <b>
                      {habit.days[selectedDay]?.done
                        ? habit.days[selectedDay]?.minimumVersion
                          ? "Minimum done"
                          : "Done"
                        : paused
                          ? `Paused${habit.days[selectedDay]?.pauseReason ? ` · ${habit.days[selectedDay].pauseReason}` : ""}`
                          : "Open"}
                    </b>
                  </button>
                );
              })}
            {filters.habits &&
              data.habits.some((habit) =>
                habit.days[selectedDay]?.note?.trim(),
              ) && (
                <div className="calendar-agenda">
                  <strong>Habit reflections</strong>
                  {data.habits
                    .filter((habit) => habit.days[selectedDay]?.note?.trim())
                    .map((habit) => (
                      <div key={habit.id}>
                        <span>{habit.name}</span>
                        <small>{habit.days[selectedDay].note}</small>
                      </div>
                    ))}
                </div>
              )}
            {filters.tasks && (
              <div className="calendar-agenda">
                <strong>Deadlines and tasks</strong>
                {selectedTasks.length
                  ? selectedTasks.map((task) => (
                      <div
                        className="calendar-task-event"
                        key={task.id}
                        draggable={!task.done}
                        onDragStart={(event) => {
                          setDraggedTaskId(task.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            String(task.id),
                          );
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId("");
                          setDropTargetDay("");
                        }}
                      >
                        <span>{task.title}</span>
                        <small>
                          {task.type === "assignment"
                            ? `${task.subject} assignment`
                            : "Task"}{" "}
                          · {task.priority} · {task.done ? "Done" : "Open"}
                        </small>
                        {!task.done && (
                          <label className="calendar-task-reschedule">
                            Move to
                            <input
                              type="date"
                              value={task.due || ""}
                              aria-label={`Reschedule ${task.title}`}
                              onChange={(event) =>
                                onMoveTask(task.id, event.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))
                  : null}
                <form
                  className="calendar-quick-task"
                  onSubmit={addSelectedDayTask}
                >
                  <input
                    value={quickTaskTitle}
                    onChange={(event) => setQuickTaskTitle(event.target.value)}
                    placeholder="Add a task for this date"
                    aria-label={`New task for ${selectedDay}`}
                    maxLength={100}
                  />
                  <button
                    type="submit"
                    className="text-button"
                    disabled={!quickTaskTitle.trim()}
                  >
                    Add
                  </button>
                </form>
              </div>
            )}
            {filters.classes && visibleClasses.length > 0 && (
              <div className="calendar-agenda">
                <strong>Classes</strong>
                {visibleClasses.map((item) => (
                  <div key={item.id}>
                    <span>{item.name}</span>
                    <small>
                      {item.startTime}–{item.endTime}
                      {item.location ? ` · ${item.location}` : ""}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {filters.study &&
              (studyAgenda.length > 0 || selectedStudyGaps.length > 0) && (
                <div className="calendar-agenda">
                  <strong>Study sessions and plan</strong>
                  {studyAgenda.map((item) => (
                    <div key={item.id}>
                      <span>{item.title}</span>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                  {selectedStudyGaps.map((gap) => (
                    <div
                      className="calendar-study-gap"
                      key={`${gap.date}-${gap.time}`}
                    >
                      <span>Free gap · {gap.time}</span>
                      <small>{gap.minutes} minutes between classes</small>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onAddStudyBlock(gap)}
                      >
                        Plan study
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          onAddTask({
                            id: createId(),
                            title: `Study ${data.study.selectedSubject || data.study.subject} · ${gap.minutes} min`,
                            due: selectedDay,
                            priority: "medium",
                            done: false,
                            type: "task",
                            subject:
                              data.study.selectedSubject || data.study.subject,
                          })
                        }
                      >
                        Add task
                      </button>
                    </div>
                  ))}
                </div>
              )}
            {filters.workouts &&
              (selectedWorkouts.length > 0 || hasWorkoutPlan) && (
                <div className="calendar-agenda">
                  <strong>Workout sessions</strong>
                  {selectedWorkouts.map((session) => (
                    <div key={session.id}>
                      <span>{session.split || "Workout"}</span>
                      <small>
                        {session.exerciseCount || 0} exercises ·{" "}
                        {Math.round(session.volume || 0)} volume
                      </small>
                    </div>
                  ))}
                  {hasWorkoutPlan && (
                    <div>
                      <span>
                        {plannedWorkoutSplit
                          ? `${plannedWorkoutSplit.name} workout`
                          : "Workout planned"}
                      </span>
                      <small>
                        {plannedWorkoutSplit
                          ? `${plannedWorkoutSplit.split} split · ${plannedWorkoutExercises.length} exercises`
                          : `${plannedWorkoutExercises.length} saved exercises`}
                      </small>
                    </div>
                  )}
                </div>
              )}
            {filters.journal && hasJournalEntry && (
              <div className="calendar-agenda">
                <strong>Journal reflection</strong>
                <div>
                  <span>
                    {selectedJournal.mood || "Mood not logged"}
                    {selectedJournal.energy
                      ? ` · Energy ${selectedJournal.energy}/5`
                      : ""}
                  </span>
                  <small>
                    {(selectedJournal.tags || []).join(" · ")}
                    {selectedJournal.gratitude
                      ? ` · Grateful for ${selectedJournal.gratitude}`
                      : ""}
                    {selectedJournal.text ? ` · ${selectedJournal.text}` : ""}
                  </small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ClassSchedulePage({
  study,
  tasks = [],
  onToggleTask,
  onUpdate,
  onRequestReminders,
  toast,
  editorMode = false,
  onNavigate,
}) {
  const draggedClassId = useRef("");
  const now = useToday();
  const todayName = WEEKDAYS[(now.getDay() + 6) % 7];
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
  const weekDateRange = `${currentWeekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${currentWeekEnd.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
  const [className, setClassName] = useState("");
  const [classDays, setClassDays] = useState([todayName]);
  const [mobileTimetableDay, setMobileTimetableDay] = useState(todayName);
  useEffect(() => {
    setMobileTimetableDay(todayName);
  }, [todayName]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const classes = study.classes || [];
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcomingClasses = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    );
    const day = WEEKDAYS[(date.getDay() + 6) % 7];
    const dayLabel =
      offset === 0
        ? "Today"
        : offset === 1
          ? "Tomorrow"
          : date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            });
    return classes
      .filter(
        (item) =>
          item.day === day &&
          classOccursOnDate(item, dateKey(date)) &&
          (offset > 0 || item.startTime > currentTime),
      )
      .map((item) => ({ ...item, date: dateKey(date), dayLabel }));
  })
    .flat()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    )
    .slice(0, 3);
  const assignments = tasks
    .filter((task) => task.type === "assignment")
    .sort((a, b) => String(a.due || "").localeCompare(String(b.due || "")));
  const openAssignmentCount = assignments.filter((task) => !task.done).length;
  const remindersEnabled = classes.filter(
    (item) => item.reminderEnabled,
  ).length;
  const timetableRange = getClassTimetableRange(classes);
  const timetableStart = timetableRange.start;
  const timetableEnd = timetableRange.end;
  const timetableHours = timetableRange.hours;
  const timetableSlotCount = Math.max(
    2,
    Math.ceil((timetableEnd - timetableStart) / 30),
  );
  const mobileTimetableDate = new Date(currentWeekStart);
  mobileTimetableDate.setDate(
    currentWeekStart.getDate() + WEEKDAYS.indexOf(mobileTimetableDay),
  );
  const mobileDayClasses = classes.filter(
    (item) =>
      item.day === mobileTimetableDay &&
      classOccursOnDate(item, dateKey(mobileTimetableDate)),
  );
  const mobileTimetableRange = getClassTimetableRange(mobileDayClasses, 60);
  const mobileTimetableStart = mobileTimetableRange.start;
  const mobileTimetableEnd = mobileTimetableRange.end;
  const mobileTimetableHours = mobileTimetableRange.hours;
  const mobileTimetableSlotCount = Math.max(
    2,
    Math.ceil((mobileTimetableEnd - mobileTimetableStart) / 30),
  );
  const timetableRowStyle = {
    "--timetable-slot-count": timetableSlotCount,
    "--mobile-timetable-slot-count": mobileTimetableSlotCount,
    gridTemplateRows: classes.length
      ? `44px repeat(${timetableSlotCount}, 38px)`
      : "44px 92px",
  };
  const overlappingDays =
    endTime > startTime
      ? WEEKDAYS.filter(
          (day) =>
            classDays.includes(day) &&
            classes.some((item) => {
              if (item.day !== day) return false;
              return item.startTime < endTime && item.endTime > startTime;
            }),
        )
      : [];
  const notificationSupported = "Notification" in window;
  const exportCalendar = () => {
    if (!classes.length) {
      toast("Add a class before exporting your timetable.");
      return;
    }
    try {
      const result = createClassCalendarExportWithReport(classes);
      if (!result.exportedCount) {
        toast(
          result.skipped.length
            ? `No valid classes were exported. ${result.skipped.length} invalid class${result.skipped.length === 1 ? "" : "es"} skipped.`
            : "No valid classes were found to export.",
        );
        return;
      }
      const url = URL.createObjectURL(
        new Blob([result.calendar], { type: "text/calendar;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "daymark-classes.ics";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(
        result.skipped.length
          ? `Calendar exported; ${result.skipped.length} invalid class${result.skipped.length === 1 ? "" : "es"} skipped.`
          : "Calendar file exported",
      );
    } catch (error) {
      console.error("Could not export the class calendar.", error);
      toast(
        error instanceof Error
          ? error.message
          : "Could not export the class calendar.",
      );
    }
  };
  const toggleClassDay = (day) => {
    setClassDays((selectedDays) =>
      selectedDays.includes(day)
        ? selectedDays.filter((selectedDay) => selectedDay !== day)
        : WEEKDAYS.filter(
            (weekDay) => selectedDays.includes(weekDay) || weekDay === day,
          ),
    );
  };

  const addClass = async (event) => {
    event.preventDefault();
    if (!className.trim() || !classDays.length || endTime <= startTime) return;
    const duplicateDays = findDuplicateClassDays(classes, {
      name: className,
      days: classDays,
      startTime,
      endTime,
    });
    const daysToAdd = classDays.filter((day) => !duplicateDays.includes(day));
    if (!daysToAdd.length) {
      toast("Already in your timetable");
      return;
    }
    let enableReminder = reminderEnabled;
    if (enableReminder) {
      enableReminder = await onRequestReminders();
      if (!enableReminder) {
        toast("Classes saved without reminders");
      }
    }
    const savedItems = daysToAdd.map((day) => ({
      id: createId(),
      name: className.trim(),
      day,
      startTime,
      endTime,
      location: location.trim(),
      reminderEnabled: enableReminder,
      startDate: todayKey(),
    }));
    const savedIds = new Set(savedItems.map((item) => item.id));
    const addedMessage =
      savedItems.length === 1
        ? "Class added"
        : `Added ${savedItems.length} classes`;
    const successMessage = duplicateDays.length
      ? `${addedMessage} · Already in your timetable`
      : addedMessage;
    onUpdate(
      (current) => ({ classes: [...current.classes, ...savedItems] }),
      successMessage,
      {
        label: "Undo",
        onClick: () =>
          onUpdate(
            (current) => ({
              classes: current.classes.filter(
                (entry) => !savedIds.has(entry.id),
              ),
            }),
            savedItems.length === 1
              ? "Class addition undone"
              : "Class days addition undone",
          ),
      },
    );
    setClassDays([todayName]);
    setClassName("");
    setLocation("");
  };
  const toggleReminder = async (item) => {
    let enabled = !item.reminderEnabled;
    if (enabled) enabled = await onRequestReminders();
    onUpdate({
      classes: classes.map((entry) =>
        entry.id === item.id ? { ...entry, reminderEnabled: enabled } : entry,
      ),
    });
  };
  const moveClassToDay = (id, day) => {
    const item = classes.find((entry) => String(entry.id) === String(id));
    if (!item || item.day === day) return;
    onUpdate(
      {
        classes: classes.map((entry) =>
          entry.id === item.id ? { ...entry, day } : entry,
        ),
      },
      `${item.name} moved to ${day}`,
    );
  };
  const adjustClassTime = (item, delta) => {
    const start =
      Number(item.startTime.slice(0, 2)) * 60 +
      Number(item.startTime.slice(3, 5));
    const end =
      Number(item.endTime.slice(0, 2)) * 60 + Number(item.endTime.slice(3, 5));
    const duration = end - start;
    const nextStart = Math.max(0, Math.min(1439 - duration, start + delta));
    const toTime = (minutes) =>
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    onUpdate({
      classes: classes.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              startTime: toTime(nextStart),
              endTime: toTime(nextStart + duration),
            }
          : entry,
      ),
    });
  };

  const removeClass = (id) => {
    const index = classes.findIndex((item) => item.id === id);
    const removed = classes[index];
    if (!removed) return;
    onUpdate(
      { classes: classes.filter((item) => item.id !== id) },
      "Class deleted",
      {
        label: "Undo",
        onClick: () =>
          onUpdate((current) => {
            const restored = [...current.classes];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return { classes: restored };
          }, "Class restored"),
      },
    );
  };
  const formatTime = (time) =>
    new Date(`1970-01-01T${time}:00`).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  const permissionText = !notificationSupported
    ? "This browser does not support notifications."
    : Notification.permission === "granted"
      ? "Browser reminders are enabled."
      : "Allow notifications to receive class reminders while Daymark is open.";
  const renderTimetableClass = (item, placement = {}) => {
    const accent = [
      "#7c5cff",
      "#ff8b5e",
      "#38c995",
      "#f3bd4b",
      "#5a9cff",
      "#ef6b9a",
    ][
      [...String(item.name)].reduce(
        (hash, character) => hash + character.charCodeAt(0),
        0,
      ) % 6
    ];
    return (
      <article
        className="class-entry timetable-class-entry"
        key={`${item.id}-${placement.key || "timeline"}`}
        draggable
        style={{
          ...(placement.gridRow ? { gridRow: placement.gridRow } : {}),
          ...(placement.gridColumn ? { gridColumn: placement.gridColumn } : {}),
          "--class-accent": accent,
        }}
        onDragStart={(event) => {
          draggedClassId.current = String(item.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(item.id));
        }}
        onDragEnd={() => {
          draggedClassId.current = "";
        }}
      >
        <div className="class-entry-time">
          <time className="class-entry-start-time" dateTime={item.startTime}>
            {formatTime(item.startTime)}
          </time>
          <span aria-hidden="true">–</span>
          <time dateTime={item.endTime}>{formatTime(item.endTime)}</time>
        </div>
        <strong>
          {item.name}
          {item.weekPattern ? ` · Week ${item.weekPattern}` : ""}
        </strong>
        {item.location && <small>{item.location}</small>}
        <details className="class-entry-manage">
          <summary>Manage</summary>
          <div className="class-entry-actions">
            <label className="class-entry-move">
              Day
              <select
                aria-label={`Move ${item.name} to day`}
                value={item.day}
                onChange={(event) =>
                  moveClassToDay(item.id, event.target.value)
                }
              >
                {WEEKDAYS.map((weekDay) => (
                  <option key={weekDay}>{weekDay}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => adjustClassTime(item, -15)}
              aria-label={`Move ${item.name} 15 minutes earlier`}
            >
              −15m
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => adjustClassTime(item, 15)}
              aria-label={`Move ${item.name} 15 minutes later`}
            >
              +15m
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => toggleReminder(item)}
              aria-label={`${item.reminderEnabled ? "Disable" : "Enable"} reminder for ${item.name}`}
            >
              {item.reminderEnabled ? "Reminder on" : "Add reminder"}
            </button>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => removeClass(item.id)}
              aria-label={`Remove ${item.name}`}
            >
              Remove
            </button>
          </div>
        </details>
      </article>
    );
  };

  return (
    <section
      className={`section class-schedule-page page-view compact-classes${editorMode ? " class-editor-page" : ""}`}
    >
      {editorMode ? (
        <div className="class-editor-toolbar">
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate("class-schedule")}
          >
            <Icon name="ArrowLeft" size={16} /> Back to classes
          </button>
        </div>
      ) : (
        <PageHeading
          eyebrow="CLASSES"
          title="Class schedule"
          subtitle="Add classes, then review the week."
          aside={
            <div className="class-page-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => onNavigate("add-class")}
              >
                <Icon name="Plus" size={16} /> Add classes
              </button>
              <button
                type="button"
                className="subtle-btn"
                onClick={exportCalendar}
              >
                Export .ics
              </button>
            </div>
          }
        />
      )}

      {!editorMode && (
        <div className="class-timetable-top-layout">
          <section className="class-week-panel">
            <div className="class-week-heading">
              <div>
                <h3>Your weekly timetable</h3>
                <span className="class-week-date-range">{weekDateRange}</span>
                <span className="class-week-help">
                  {classes.length ? (
                    <>
                      <span className="class-week-desktop-help">
                        {permissionText} Drag a class to a different day, or
                        adjust its time in 15-minute steps.
                      </span>
                      <span className="class-week-mobile-help">
                        Tap a day to view your classes.
                      </span>
                    </>
                  ) : (
                    <span>Add classes to plan out your week.</span>
                  )}
                </span>
              </div>
              {classes.length > 0 && (
                <div className="class-week-summary">
                  <span className="class-count">
                    {classes.length} class{classes.length === 1 ? "" : "es"}
                  </span>
                  <span className="class-reminder-count">
                    {remindersEnabled} reminders
                  </span>
                </div>
              )}
            </div>
            {classes.length ? (
              <>
            <nav className="mobile-class-day-picker" aria-label="Choose timetable day">
              {WEEKDAYS.map((day, dayIndex) => {
                const dayDate = new Date(currentWeekStart);
                dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                return (
                  <button
                    type="button"
                    className={`${mobileTimetableDay === day ? "selected " : ""}${todayName === day ? "today" : ""}`.trim()}
                    key={day}
                    aria-label={`${day}, ${dayDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
                    aria-pressed={mobileTimetableDay === day}
                    onClick={() => setMobileTimetableDay(day)}
                  >
                    <strong>{day.slice(0, 1)}</strong>
                    <span>{dayDate.getDate()}</span>
                  </button>
                );
              })}
            </nav>
            <div className="class-timetable-scroll">
              <div
                className="class-week-grid"
                style={timetableRowStyle}
                role="grid"
                aria-label="Weekly class timetable"
              >
                {WEEKDAYS.map((day, dayIndex) => {
                  const dayDate = new Date(currentWeekStart);
                  dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                  const isToday = day === todayName;
                  return (
                    <div
                      className={`class-timetable-day-heading${isToday ? " today" : ""}${mobileTimetableDay === day ? " mobile-day-selected" : ""}`}
                      key={day}
                      style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                      role="columnheader"
                    >
                      <strong>{day.slice(0, 3)}</strong>
                      <span>
                        {dayDate.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {isToday && <small>TODAY</small>}
                    </div>
                  );
                })}
                {classes.length > 0 && (
                  <div
                    className="class-timetable-axis class-timetable-axis-desktop"
                    style={{
                      gridColumn: 1,
                      gridRow: `2 / span ${timetableSlotCount}`,
                      gridTemplateRows: `repeat(${timetableSlotCount}, 38px)`,
                    }}
                    aria-hidden="true"
                  >
                    {timetableHours.map((time, index) => (
                        <time key={time} style={{ gridRow: index * 2 + 1 }}>
                          {formatTime(
                            `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`,
                          )}
                        </time>
                    ))}
                  </div>
                )}
                {classes.length > 0 && (
                  <div
                    className="class-timetable-axis class-timetable-axis-mobile"
                    style={{
                      gridColumn: 1,
                      gridRow: `2 / span ${mobileTimetableSlotCount}`,
                      gridTemplateRows: `repeat(${mobileTimetableSlotCount}, 38px)`,
                    }}
                    aria-hidden="true"
                  >
                    {mobileTimetableHours.map((time, index) => (
                        <time key={time} style={{ gridRow: index * 2 + 1 }}>
                          {formatTime(
                            `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`,
                          )}
                        </time>
                    ))}
                  </div>
                )}
                {classes.length > 0 && WEEKDAYS.map((day, dayIndex) => {
                  const dayDate = new Date(currentWeekStart);
                  dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                  const dayKey = dateKey(dayDate);
                  const dayClasses = classes
                    .filter(
                      (item) =>
                        item.day === day && classOccursOnDate(item, dayKey),
                    )
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  const isToday = day === todayName;
                  const isMobileSelected = day === mobileTimetableDay;
                  const dayGridStart = isMobileSelected
                    ? mobileTimetableStart
                    : timetableStart;
                  const dayGridSlotCount = isMobileSelected
                    ? mobileTimetableSlotCount
                    : timetableSlotCount;
                  const dayGroups = layoutClassTimetable(
                    dayClasses,
                    dayGridStart,
                    dayGridSlotCount,
                  );
                  return (
                    <div
                      className={`class-timetable-day${isToday ? " today" : ""}${mobileTimetableDay === day ? " mobile-day-selected" : ""}`}
                      key={day}
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: `2 / span ${timetableSlotCount}`,
                        gridTemplateRows: `repeat(${timetableSlotCount}, 38px)`,
                      }}
                      role="gridcell"
                      aria-label={`${day}, ${dayDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${isToday ? ", today" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        moveClassToDay(
                          event.dataTransfer.getData("text/plain") ||
                            draggedClassId.current,
                          day,
                        );
                        draggedClassId.current = "";
                      }}
                    >
                      {dayClasses.length ? (
                        dayGroups.map((group) => {
                          if (group.entries.length === 1) {
                            const [entry] = group.entries;
                            return renderTimetableClass(entry.item, {
                              gridRow: `${group.startSlot + 1} / ${group.endSlot + 1}`,
                            });
                          }
                          return (
                            <div
                              className={`timetable-overlap-group ${group.laneCount > 3 ? "overlap-lanes-many" : `overlap-lanes-${group.laneCount}`}`}
                              key={`overlap-${day}-${group.start}`}
                              style={{
                                gridRow: `${group.startSlot + 1} / ${group.endSlot + 1}`,
                                "--overlap-lane-count": group.laneCount,
                                "--overlap-slot-count": group.slotCount,
                              }}
                            >
                              <div className="timetable-overlap-lanes">
                                {group.entries.map((entry) =>
                                  renderTimetableClass(entry.item, {
                                    key: "lane",
                                    gridRow: entry.gridRow,
                                    gridColumn: entry.lane + 1,
                                  }),
                                )}
                              </div>
                              <details className="timetable-overlap-summary">
                                <summary>
                                  <strong>{group.entries.length} classes</strong>
                                  <span>Overlapping · tap to view</span>
                                </summary>
                                <div className="timetable-overlap-expanded">
                                  {group.entries.map((entry) =>
                                    renderTimetableClass(entry.item, {
                                      key: "expanded",
                                    }),
                                  )}
                                </div>
                              </details>
                            </div>
                          );
                        })
                      ) : null}
                    </div>
                  );
                })}
                {classes.length > 0 && !mobileDayClasses.length && (
                    <p
                      className="class-timetable-empty mobile-class-day-empty"
                      style={{
                        gridColumn: 2,
                        gridRow: `2 / span ${mobileTimetableSlotCount}`,
                      }}
                    >
                      No classes scheduled for this day.
                    </p>
                  )}
              </div>
            </div>
              </>
            ) : (
              <div className="class-timetable-empty-state">
                <span className="class-timetable-empty-icon" aria-hidden="true">
                  <Icon name="CalendarDays" size={22} />
                </span>
                <strong>Your week is clear</strong>
                <p>Your timetable is ready when you are.</p>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => onNavigate("add-class")}
                >
                  <Icon name="Plus" size={16} /> Add your first class
                </button>
              </div>
            )}
            {upcomingClasses.length > 0 && (
              <section
                className="class-upcoming"
                aria-labelledby="class-upcoming-title"
              >
                <div className="class-upcoming-heading">
                  <div>
                    <h4 id="class-upcoming-title">Coming up</h4>
                    <span>Your next class meetings</span>
                  </div>
                  <span className="class-count">Next 7 days</span>
                </div>
                <ol className="class-upcoming-list">
                  {upcomingClasses.map((item, index) => (
                    <li
                      className={index === 0 ? "next" : ""}
                      key={`${item.id}-${item.date}`}
                    >
                      <div className="class-upcoming-meta">
                        <span className="class-upcoming-date">
                          {item.dayLabel}
                        </span>
                        <time dateTime={`${item.date}T${item.startTime}`}>
                          {formatTime(item.startTime)} –{" "}
                          {formatTime(item.endTime)}
                        </time>
                      </div>
                      <div className="class-upcoming-info">
                        <strong>{item.name}</strong>
                        <small>{item.location || item.day}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </section>

          {assignments.length > 0 && (
            <details className="class-assignment-board">
            <summary className="class-assignment-summary">
              Assignments &amp; deadlines
              <span className="class-assignment-count">
                {openAssignmentCount} open
              </span>
            </summary>
            <p className="class-assignment-intro">
              Deadlines also appear on your calendar.
            </p>
            <div className="class-assignment-list">
              {assignments.map((task) => (
                <div
                  className={`class-assignment${task.done ? " done" : ""}`}
                  key={task.id}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(task.done)}
                    onChange={() => onToggleTask?.(task.id)}
                    aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
                  />
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.subject || "Unassigned subject"} · Due{" "}
                      {task.due || "no date"} · {task.priority || "medium"}{" "}
                      priority
                    </small>
                  </span>
                  {task.sourceUrl && (
                    <a
                      className="text-button class-assignment-link"
                      href={task.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  )}
                  {!task.done && task.due && task.due < todayKey() && (
                    <b>Overdue</b>
                  )}
                </div>
              ))}
            </div>
          </details>
          )}
        </div>
      )}

      {editorMode && (
        <div className="class-schedule-grid">
          <section className="class-schedule-panel">
            <div className="class-panel-heading">
              <h3>Add a class</h3>
              <span>Recurring weekly</span>
            </div>
            <form className="class-entry-form" onSubmit={addClass}>
              <label>
                Class name
                <input
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="e.g. Biology"
                  required
                />
              </label>
              <fieldset className="class-day-picker">
                <legend>Day</legend>
                <div>
                  {WEEKDAYS.map((day) => (
                    <button
                      type="button"
                      className={classDays.includes(day) ? "selected" : ""}
                      key={day}
                      aria-label={day}
                      aria-pressed={classDays.includes(day)}
                      title={day}
                      onClick={() => toggleClassDay(day)}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <span className="class-day-hint">
                  Select every day this class meets.
                </span>
              </fieldset>
              <div className="class-time-fields">
                <label>
                  Starts
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </label>
              </div>
              {endTime <= startTime && (
                <small className="file-import-error">
                  End time must be after start time.
                </small>
              )}
              <label>
                Room or location
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="class-reminder-toggle">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(event) => setReminderEnabled(event.target.checked)}
                />
                Remind me 10 minutes before class
              </label>
              {overlappingDays.length > 0 && (
                <p className="class-overlap-warning" role="status">
                  This time overlaps another class on{" "}
                  {overlappingDays.join(", ")}. Check the
                  timetable before adding it.
                </p>
              )}
              <button
                type="submit"
                className="primary-btn"
                disabled={
                  !className.trim() || !classDays.length || endTime <= startTime
                }
              >
                {classDays.length > 1
                  ? `Add to ${classDays.length} days`
                  : "Add to timetable"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const now = useToday();
  const isPhoneViewport = usePhoneViewport();
  const endKey = dateKey(now);
  const [dashboardDay, setDashboardDay] = useState(endKey);
  const dashboardDate = dateFromKey(dashboardDay);
  const dashboardIsToday = dashboardDay === endKey;
  const [data, setData] = useState(loadState);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] =
    useState(!isFirebaseConfigured);
  const [cloudReadyUserId, setCloudReadyUserId] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState(
    isFirebaseConfigured ? "local" : "unconfigured",
  );
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudSyncRetry, setCloudSyncRetry] = useState(0);
  const [cloudLoadRetry, setCloudLoadRetry] = useState(0);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [section, setSection] = useState(
    VALID_SECTIONS.has(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : "today",
  );
  const sectionRef = useRef(section);
  const [openStudySetId, setOpenStudySetId] = useState("");
  const [flashcardsPageOpen, setFlashcardsPageOpen] = useState(
    () => window.location.hash === "#flashcards",
  );
  const displayDate = formatDate(section === "today" ? dashboardDate : now);
  const quoteIndex =
    Math.floor(Date.parse(`${endKey}T00:00:00Z`) / 86_400_000) %
    DAILY_MOTIVATIONAL_QUOTES.length;
  const dailyQuote = DAILY_MOTIVATIONAL_QUOTES[quoteIndex];
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const [name, setName] = useState("");
  const [habitIcon, setHabitIcon] = useState(HABIT_ICONS[0]);
  const [goal, setGoal] = useState(7);
  const [color, setColor] = useState(COLORS[0]);
  const [habitScheduleDays, setHabitScheduleDays] = useState([...WEEKDAYS]);
  const [numericTarget, setNumericTarget] = useState("");
  const [numericUnit, setNumericUnit] = useState("");
  const [habitStackAfter, setHabitStackAfter] = useState("");
  const [minimumVersionDraft, setMinimumVersionDraft] = useState("");
  const [habitGroupDraft, setHabitGroupDraft] = useState("Anytime");
  const [collapsedHabitGroups, setCollapsedHabitGroups] = useState({});
  const [habitStartDate, setHabitStartDate] = useState(endKey);
  const [habitFilter, setHabitFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [selectedDay, setSelectedDay] = useState(endKey);
  const [darkMode, setDarkMode] = useState(
    () => {
      const savedTheme = localStorage.getItem("daymark-dark");
      return savedTheme === null
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : savedTheme === "true";
    },
  );
  const [search, setSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () =>
      localStorage.getItem("daymark-onboarding-pending") === "true" ||
      (!localStorage.getItem("daymark-state") &&
        localStorage.getItem("daymark-onboarded") !== "true"),
  );
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingIcon, setOnboardingIcon] = useState(() => data.profile.icon);
  const [onboardingAccent, setOnboardingAccent] = useState(
    () => data.settings.accent || THEME_PRESETS[0][0],
  );
  const [installPrompt, setInstallPrompt] = useState(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileIcon, setProfileIcon] = useState(data.profile.icon);
  const [journalUnlocked, setJournalUnlocked] = useState(
    !data.settings.journalPin,
  );
  const [journalPinDraft, setJournalPinDraft] = useState("");
  const [journalPinError, setJournalPinError] = useState("");
  const [toastText, setToastText] = useState("");
  const [toastAction, setToastAction] = useState(null);
  const [xpDetailsOpen, setXpDetailsOpen] = useState(false);
  const dataRef = useRef(data);
  const cloudDirtyRef = useRef(false);
  const lastCloudStateRef = useRef("");
  const cloudSyncQueueRef = useRef(Promise.resolve());
  const importRef = useRef(null);
  const toastTimerRef = useRef(null);
  const dates = useMemo(
    () => (isPhoneViewport ? datesForGrid(endKey, 2, 1) : datesForGrid(endKey)),
    [endKey, isPhoneViewport],
  );
  const activeHabits = data.habits.filter((habit) => {
    if (habit.archived || isHabitPausedOnDate(habit, endKey)) return false;
    if (!habit.stackAfter) return true;
    const trigger = data.habits.find((item) => item.name === habit.stackAfter);
    return !trigger || Boolean(trigger.days[endKey]?.done);
  });
  const todayName = WEEKDAYS[(dateFromKey(endKey).getDay() + 6) % 7];
  const todayHabits = activeHabits.filter((habit) =>
    getHabitScheduleDays(habit).includes(todayName),
  );
  const doneToday = todayHabits.filter(
    (habit) => habit.days[endKey]?.done,
  ).length;
  const dueFlashcardCount = data.study.flashcards.filter(
    (card) => !card.dueAt || card.dueAt <= endKey,
  ).length;
  const currentLevel = Math.floor(data.xp / 100) + 1;
  const levelProgress = data.xp % 100;
  const nextLevelXp = currentLevel * 100;
  const xpToNextLevel = nextLevelXp - data.xp;
  const recentXpHistory = [...(data.xpHistory || [])].reverse().slice(0, 6);
  const earnedRewards = [
    { level: 2, label: "Getting started", icon: "sparkles" },
    { level: 3, label: "Building momentum", icon: "diamond" },
    { level: 5, label: "Consistent creator", icon: "star" },
    { level: 10, label: "Daymark legend", icon: "crown" },
  ].filter((reward) => currentLevel >= reward.level);
  const nextReward = [
    { level: 2, label: "Getting started", icon: "sparkles" },
    { level: 3, label: "Building momentum", icon: "diamond" },
    { level: 5, label: "Consistent creator", icon: "star" },
    { level: 10, label: "Daymark legend", icon: "crown" },
  ].find((reward) => currentLevel < reward.level);
  const todayProgress = todayHabits.length
    ? Math.round((doneToday / todayHabits.length) * 100)
    : 0;
  const mondayKey = weekStartKey(now);
  const weekday = now.getDay();
  const weeklyDone = activeHabits.reduce((sum, habit) => {
    const completed = Object.entries(habit.days).reduce(
      (total, [key, value]) => {
        if (
          key < mondayKey ||
          key > endKey ||
          !getHabitScheduleDays(habit).includes(
            WEEKDAYS[(dateFromKey(key).getDay() + 6) % 7],
          )
        )
          return total;
        return (
          total +
          (habit.numericTarget
            ? Math.min(1, Number(value?.amount || 0) / habit.numericTarget)
            : value?.done
              ? 1
              : 0)
        );
      },
      0,
    );
    return (
      sum +
      Math.min(
        completed,
        habit.flexibleWeekly
          ? Number(habit.goal) || 1
          : getHabitScheduleDays(habit).length,
      )
    );
  }, 0);
  const weeklyTarget = activeHabits.reduce(
    (sum, habit) =>
      sum +
      (habit.flexibleWeekly
        ? Number(habit.goal) || 1
        : getHabitScheduleDays(habit).length),
    0,
  );
  const bestHabit = useMemo(
    () =>
      data.habits.reduce(
        (current, habit) => {
          const value = bestStreak(habit);
          return value > current.value
            ? {
                value,
                unit:
                  habit.goal === 7 && !habit.flexibleWeekly ? "days" : "weeks",
              }
            : current;
        },
        { value: 0, unit: "days" },
      ),
    [data.habits],
  );
  const best = bestHabit.value;
  const bestUnit = bestHabit.unit;
  const visibleHabits = data.habits.filter(
    (habit) =>
      (habitFilter === "archived" ? habit.archived : !habit.archived) &&
      habit.name.toLowerCase().includes(search.toLowerCase()) &&
      (habitFilter !== "active" || !isHabitPausedOnDate(habit, endKey)) &&
      (habitFilter !== "paused" || isHabitPausedOnDate(habit, endKey)) &&
      (habitFilter !== "completed" || Boolean(habit.days[endKey]?.done)),
  );
  const visibleHabitChains = [];
  const visibleHabitIds = new Set();
  for (const habit of visibleHabits) {
    if (habit.archived) continue;
    if (visibleHabitIds.has(habit.id)) continue;
    const trigger = data.habits.find((item) => item.name === habit.stackAfter);
    if (
      trigger &&
      visibleHabits.some((item) => item.id === trigger.id) &&
      !trigger.days[selectedDay]?.done
    )
      continue;
    const chain = [];
    let current = habit;
    while (current && !visibleHabitIds.has(current.id)) {
      chain.push(current);
      visibleHabitIds.add(current.id);
      if (!current.days[selectedDay]?.done) break;
      current = visibleHabits.find(
        (item) =>
          item.stackAfter === current.name && !visibleHabitIds.has(item.id),
      );
    }
    visibleHabitChains.push(chain);
  }
  const visibleHabitGroups = visibleHabitChains.reduce((groups, chain) => {
    const group = chain[0].group || "Anytime";
    groups[group] = [...(groups[group] || []), chain];
    return groups;
  }, {});
  const showHabitActions =
    section === "today" || section === "habits" || section === "add-habit";
  const journal = data.journal[selectedDay] || {};
  const journalWordCount = String(journal.text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const journalStreak = (() => {
    let cursor = dateFromKey(endKey);
    if (!data.journal[endKey]?.text && !data.journal[endKey]?.gratitude)
      cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    for (let index = 0; index < 366; index += 1) {
      const entry = data.journal[dateKey(cursor)];
      if (!entry?.text && !entry?.gratitude) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  })();
  const onThisDayEntries = Object.entries(data.journal || {})
    .filter(
      ([key, entry]) =>
        key < selectedDay &&
        key.slice(5) === selectedDay.slice(5) &&
        (entry?.text || entry?.gratitude),
    )
    .sort(([a], [b]) => b.localeCompare(a));
  const journalPrompts = [
    "What helped you feel steady today?",
    "What felt easy or light today?",
    "What do you want to carry into tomorrow?",
    "What are you proud of from today?",
    "What would you like to let go of?",
  ];
  const journalPrompt =
    journal.prompt ||
    journalPrompts[
      (new Date(selectedDay).getDate() + selectedDay.length) %
        journalPrompts.length
    ];

  const toast = (message, action = null) => {
    setToastText(message);
    setToastAction(action);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastText("");
      setToastAction(null);
    }, 5000);
  };
  const [saveState, setSaveState] = useState("Saved");
  const journalSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    let active = true;
    let unsubscribe = () => {};
    import("./firebase.js")
      .then(({ observeAuth }) => {
        if (!active) return;
        unsubscribe = observeAuth(
          (user) => {
            setFirebaseUser(user);
            setCloudSyncError("");
            setFirebaseAuthReady(true);
          },
          (error) => {
            console.error(
              "Could not observe Firebase authentication state.",
              error,
            );
            setCloudSyncError(
              "Could not check your account. Reload the page and try again.",
            );
            setFirebaseAuthReady(true);
          },
        );
      })
      .catch((error) => {
        console.error(
          "Could not observe Firebase authentication state.",
          error,
        );
        setCloudSyncError(
          "Could not start Firebase. Check your setup and reload the page.",
        );
        setFirebaseAuthReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      setCloudReadyUserId("");
      setCloudSyncStatus(isFirebaseConfigured ? "local" : "unconfigured");
      cloudDirtyRef.current = false;
      return undefined;
    }

    let active = true;
    let stopWatching = () => {};
    const localState = dataRef.current;
    cloudDirtyRef.current = false;
    setCloudReadyUserId("");
    setCloudSyncStatus("loading");
    setCloudSyncError("");

    const applyCloudState = (value) => {
      const next = normalizeState(value);
      const serialized = JSON.stringify(next);
      lastCloudStateRef.current = serialized;
      cloudDirtyRef.current = false;
      dataRef.current = next;
      try {
        localStorage.setItem("daymark-state", serialized);
      } catch (error) {
        console.error(
          "Could not cache synced Daymark data on this device.",
          error,
        );
        setCloudSyncError(
          "Cloud data loaded, but this device could not save its offline copy.",
        );
      }
      setData(next);
    };

    import("./firebase.js")
      .then(async ({ getOrCreateCloudState, watchCloudState }) => {
        if (!active) return;
        const { state } = await getOrCreateCloudState(
          firebaseUser.uid,
          localState,
        );
        if (!active) return;
        applyCloudState(state);
        setCloudReadyUserId(firebaseUser.uid);
        setCloudSyncStatus("synced");
        stopWatching = watchCloudState(
          firebaseUser.uid,
          (remoteState) => {
            if (!active || cloudDirtyRef.current) return;
            const next = normalizeState(remoteState);
            const serialized = JSON.stringify(next);
            if (serialized === JSON.stringify(dataRef.current)) {
              lastCloudStateRef.current = serialized;
              return;
            }
            try {
              applyCloudState(next);
              setCloudSyncStatus("synced");
            } catch (error) {
              console.error("Could not apply synced Daymark data.", error);
              setCloudSyncError(
                "Cloud data was received but could not be saved on this device.",
              );
              setCloudSyncStatus("error");
            }
          },
          (error) => {
            if (!active) return;
            console.error("Could not listen for Daymark cloud updates.", error);
            setCloudSyncError(
              "Live sync stopped. Check your connection and retry.",
            );
            setCloudSyncStatus("error");
          },
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load Daymark cloud data.", error);
        setCloudSyncError(
          "Could not load cloud data. Check your Firebase setup and internet connection.",
        );
        setCloudSyncStatus("error");
      });

    return () => {
      active = false;
      stopWatching();
    };
  }, [firebaseUser, cloudLoadRetry]);

  useEffect(() => {
    if (firebaseUser && cloudReadyUserId === firebaseUser.uid) {
      setAccountDialogOpen(false);
    }
  }, [firebaseUser, cloudReadyUserId]);

  useEffect(() => {
    if (!firebaseUser || cloudReadyUserId !== firebaseUser.uid)
      return undefined;
    const serialized = JSON.stringify(data);
    if (serialized === lastCloudStateRef.current) return undefined;

    cloudDirtyRef.current = true;
    setCloudSyncStatus("saving");
    const timeout = window.setTimeout(() => {
      const snapshot = dataRef.current;
      const snapshotJson = JSON.stringify(snapshot);
      cloudSyncQueueRef.current = cloudSyncQueueRef.current
        .then(async () => {
          const { auth: currentAuth, saveCloudState } =
            await import("./firebase.js");
          if (currentAuth?.currentUser?.uid !== firebaseUser.uid) return;
          if (JSON.stringify(dataRef.current) !== snapshotJson) return;
          await saveCloudState(firebaseUser.uid, snapshot);
          lastCloudStateRef.current = snapshotJson;
          cloudDirtyRef.current = false;
          setCloudSyncStatus("synced");
          setCloudSyncError("");
        })
        .catch((error) => {
          console.error("Could not save Daymark data to Firebase.", error);
          cloudDirtyRef.current = true;
          setCloudSyncError(
            "Cloud save failed. Your changes remain on this device; retry when online.",
          );
          setCloudSyncStatus("error");
        });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [data, firebaseUser, cloudReadyUserId, cloudSyncRetry]);

  useEffect(() => {
    const flushJournalSave = () => {
      if (journalSaveTimerRef.current === null) return;
      window.clearTimeout(journalSaveTimerRef.current);
      journalSaveTimerRef.current = null;
      try {
        localStorage.setItem("daymark-state", JSON.stringify(dataRef.current));
        setSaveState("Saved");
      } catch (error) {
        console.error("Unable to save journal entry.", error);
        setSaveState("Save failed");
      }
    };
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") flushJournalSave();
    };
    window.addEventListener("pagehide", flushJournalSave);
    window.addEventListener("beforeunload", flushJournalSave);
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      window.removeEventListener("pagehide", flushJournalSave);
      window.removeEventListener("beforeunload", flushJournalSave);
      document.removeEventListener("visibilitychange", flushOnHide);
    };
  }, []);

  const save = (next, message, action = null) => {
    try {
      const previous = dataRef.current;
      const xpDelta = Number(next.xp || 0) - Number(previous.xp || 0);
      const savedNext =
        xpDelta === 0
          ? next
          : {
              ...next,
              xpHistory: [
                ...(Array.isArray(previous.xpHistory)
                  ? previous.xpHistory
                  : []),
                {
                  id: createId(),
                  date: endKey,
                  delta: xpDelta,
                  message:
                    message || (xpDelta > 0 ? "XP earned" : "XP adjusted"),
                },
              ].slice(-40),
            };
      localStorage.setItem("daymark-state", JSON.stringify(savedNext));
      dataRef.current = savedNext;
      cloudDirtyRef.current = true;
      setData(savedNext);
      if (message) {
        const undoAction = action || {
          label: "Undo",
          onClick: () => save(previous, "Change undone"),
        };
        toast(message, undoAction);
      }
      return true;
    } catch (error) {
      console.error("Unable to save Daymark data.", error);
      toast("Could not save changes. Check your device storage and try again.");
      return false;
    }
  };
  useEffect(() => {
    const current = dataRef.current;
    let changed = false;
    const habits = current.habits.map((habit) => {
      const resumed = resumeExpiredHabitPause(habit, endKey);
      if (resumed !== habit) changed = true;
      return resumed;
    });
    if (!changed) return;
    const next = { ...current, habits };
    try {
      localStorage.setItem("daymark-state", JSON.stringify(next));
      dataRef.current = next;
      cloudDirtyRef.current = true;
      setData(next);
    } catch (error) {
      console.error("Unable to save expired habit pauses.", error);
      toast(
        "Could not save expired habit pauses. Check your device storage and try again.",
      );
    }
  }, [endKey]);

  const nav = (id) => {
    if (id === "today") setDashboardDay(endKey);
    if (section === id) return;
    setOpenStudySetId("");
    setFlashcardsPageOpen(id === "flashcards");
    setSection(id);
    sectionRef.current = id;
    if (id === "flashcards") {
      if (section !== "study") window.history.replaceState(null, "", "#study");
      window.history.pushState(null, "", "#flashcards");
    } else {
      window.history.replaceState(null, "", `#${id}`);
    }
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  };

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.slice(1);
      if (!VALID_SECTIONS.has(next)) {
        window.history.replaceState(null, "", "#today");
        setDashboardDay(todayKey());
        setSection("today");
        sectionRef.current = "today";
        setFlashcardsPageOpen(false);
      } else {
        if (
          next === "flashcards" &&
          sectionRef.current !== "study" &&
          sectionRef.current !== "flashcards"
        ) {
          window.history.replaceState(null, "", "#study");
          window.history.pushState(null, "", "#flashcards");
        }
        if (next === "today") setDashboardDay(todayKey());
        setSection(next);
        sectionRef.current = next;
        setFlashcardsPageOpen(next === "flashcards");
      }
    };
    if (window.location.hash === "#flashcards") {
      window.history.replaceState(null, "", "#study");
      window.history.pushState(null, "", "#flashcards");
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", data.settings.highContrast);
    root.classList.toggle("large-text", data.settings.largeText);
    root.classList.toggle("reduce-motion", data.settings.reduceMotion);
  }, [
    data.settings.highContrast,
    data.settings.largeText,
    data.settings.reduceMotion,
  ]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--theme-accent",
      data.settings.accent || "#9a5de8",
    );
  }, [data.settings.accent]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimerRef.current);
      window.clearTimeout(journalSaveTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  const toggle = (id, key, minimumVersion = false) => {
    const current = dataRef.current;
    const habit = current.habits.find((item) => item.id === id);
    const wasDone = habit?.days[key]?.done;
    const completedAt = !wasDone ? new Date().toTimeString().slice(0, 5) : "";
    const next = {
      ...current,
      habits: current.habits.map((item) =>
        item.id !== id
          ? item
          : {
              ...item,
              days: {
                ...item.days,
                [key]: {
                  ...item.days[key],
                  done: !wasDone,
                  completedAt,
                  minimumVersion: !wasDone && minimumVersion,
                  amount: item.numericTarget
                    ? !wasDone
                      ? Number(item.numericTarget)
                      : 0
                    : item.days[key]?.amount,
                  paused: false,
                  note: item.days[key]?.note || "",
                },
              },
            },
      ),
      xp: Math.max(0, current.xp + (wasDone ? -5 : 5)),
    };
    const updatedHabit = next.habits.find((item) => item.id === id);
    const streak = updatedHabit ? currentStreak(updatedHabit, key) : 0;
    const milestone =
      !wasDone && data.settings.celebrations && [7, 30, 100].includes(streak);
    save(
      next,
      milestone
        ? `${streak}-day streak milestone`
        : wasDone
          ? "Check-in undone"
          : "Check-in saved",
    );
  };
  const deleteHabit = (id) => {
    const current = dataRef.current;
    const index = current.habits.findIndex((habit) => habit.id === id);
    const archived = current.habits[index];
    if (!archived || archived.archived) return;
    save(
      {
        ...current,
        habits: current.habits.map((habit) =>
          habit.id === id ? { ...habit, archived: true } : habit,
        ),
      },
      "Habit archived",
      {
        label: "Undo",
        onClick: () => {
          const latest = dataRef.current;
          const habits = latest.habits.map((habit) =>
            habit.id === id ? { ...habit, archived: false } : habit,
          );
          save({ ...latest, habits }, "Habit restored");
        },
      },
    );
  };
  const updateHabitProgress = (id, key, value) => {
    const habit = data.habits.find((item) => item.id === id);
    if (!habit?.numericTarget) return;
    const amount = Math.max(
      0,
      Math.min(Number(habit.numericTarget), Number(value) || 0),
    );
    const wasDone = Boolean(habit.days[key]?.done);
    const done = amount >= Number(habit.numericTarget);
    save(
      {
        ...data,
        habits: data.habits.map((item) =>
          item.id === id
            ? {
                ...item,
                days: {
                  ...item.days,
                  [key]: {
                    ...item.days[key],
                    amount,
                    done,
                    completedAt:
                      done && !wasDone
                        ? new Date().toTimeString().slice(0, 5)
                        : done
                          ? item.days[key]?.completedAt || ""
                          : "",
                    minimumVersion: false,
                    paused: false,
                    note: item.days[key]?.note || "",
                  },
                },
              }
            : item,
        ),
        xp: Math.max(
          0,
          data.xp + (done && !wasDone ? 5 : !done && wasDone ? -5 : 0),
        ),
      },
      done && !wasDone ? "Daily target reached" : "Habit progress saved",
    );
  };
  const saveHabitReason = (id, key, reason) =>
    save(
      {
        ...data,
        habits: data.habits.map((item) =>
          item.id === id
            ? {
                ...item,
                days: { ...item.days, [key]: { ...item.days[key], reason } },
              }
            : item,
        ),
      },
      "Thanks for checking in",
    );
  const pauseHabitDay = (id, key) => {
    const habit = data.habits.find((item) => item.id === id);
    if (!habit) return;
    const paused = !habit.days[key]?.paused;
    const pauseReason = paused
      ? window.prompt(
          "Why are you pausing this day? (sick, travel, exams, etc.)",
        )
      : "";
    if (paused && (!pauseReason || !pauseReason.trim())) return;
    save(
      {
        ...data,
        xp: Math.max(0, data.xp - (paused && habit.days[key]?.done ? 5 : 0)),
        habits: data.habits.map((item) =>
          item.id === id
            ? {
                ...item,
                days: {
                  ...item.days,
                  [key]: {
                    ...item.days[key],
                    done: false,
                    paused,
                    pauseReason: paused ? pauseReason.trim() : "",
                    note: item.days[key]?.note || "",
                  },
                },
              }
            : item,
        ),
      },
      paused ? "Streak paused for this day" : "Streak pause removed",
    );
  };
  const updateHabitNote = (id, key, note) =>
    save({
      ...data,
      habits: data.habits.map((item) =>
        item.id === id
          ? {
              ...item,
              days: {
                ...item.days,
                [key]: {
                  ...item.days[key],
                  done: Boolean(item.days[key]?.done),
                  paused: Boolean(item.days[key]?.paused),
                  note,
                },
              },
            }
          : item,
      ),
    });
  const suggestHabitReminder = (id, time) =>
    save(
      {
        ...dataRef.current,
        habits: dataRef.current.habits.map((habit) =>
          habit.id === id ? { ...habit, reminderTime: time } : habit,
        ),
      },
      `Reminder suggestion saved · ${time}`,
    );
  const restoreHabit = (id) =>
    save(
      {
        ...dataRef.current,
        habits: dataRef.current.habits.map((habit) =>
          habit.id === id ? { ...habit, archived: false } : habit,
        ),
      },
      "Habit restored",
    );
  const addHabit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    const saved = save(
      {
        ...data,
        habits: [
          ...data.habits,
          {
            id: createId(),
            name: name.trim(),
            icon: habitIcon,
            goal: habitScheduleDays.length,
            scheduleDays: habitScheduleDays,
            flexibleWeekly: false,
            numericTarget: Math.max(0, Number(numericTarget) || 0),
            numericUnit: numericUnit.trim(),
            stackAfter: habitStackAfter,
            minimumVersion: minimumVersionDraft.trim(),
            group: habitGroupDraft,
            color,
            allowance: 1,
            startDate: habitStartDate || endKey,
            days: {},
          },
        ],
      },
      "Habit added",
    );
    if (!saved) return;
    setName("");
    setHabitIcon(HABIT_ICONS[0]);
    setGoal(7);
    setHabitScheduleDays([...WEEKDAYS]);
    setNumericTarget("");
    setNumericUnit("");
    setHabitStackAfter("");
    setMinimumVersionDraft("");
    setHabitGroupDraft("Anytime");
    setColor(COLORS[0]);
    setHabitStartDate(endKey);
    nav("habits");
  };
  const cancelNewHabit = () => {
    setName("");
    setHabitIcon(HABIT_ICONS[0]);
    setGoal(7);
    setHabitScheduleDays([...WEEKDAYS]);
    setNumericTarget("");
    setNumericUnit("");
    setHabitStackAfter("");
    setMinimumVersionDraft("");
    setHabitGroupDraft("Anytime");
    setColor(COLORS[0]);
    setHabitStartDate(endKey);
    nav("habits");
  };
  const updateJournal = (field, value) => {
    const next = {
      ...data,
      journal: {
        ...data.journal,
        [selectedDay]: { ...(data.journal[selectedDay] || {}), [field]: value },
      },
    };
    dataRef.current = next;
    cloudDirtyRef.current = true;
    setData(next);
    setSaveState("Saving…");
    window.clearTimeout(journalSaveTimerRef.current);
    journalSaveTimerRef.current = window.setTimeout(() => {
      journalSaveTimerRef.current = null;
      try {
        localStorage.setItem("daymark-state", JSON.stringify(dataRef.current));
        setSaveState("Saved");
      } catch (error) {
        console.error("Unable to save journal entry.", error);
        setSaveState("Save failed");
      }
    }, 400);
  };
  const displayStudy =
    data.study.week && data.study.week !== weekStartKey(now)
      ? {
          ...data.study,
          actual: 0,
          sessions: 0,
          week: weekStartKey(now),
          history: data.study.history || [],
        }
      : data.study;
  const weeklyStudyHistory = (displayStudy.history || []).filter(
    (session) => session.date >= weekStartKey(now) && session.date <= endKey,
  );
  const studyForDisplay = {
    ...displayStudy,
    actual: +(
      weeklyStudyHistory.reduce(
        (total, session) => total + Number(session.minutes || 0),
        0,
      ) / 60
    ).toFixed(1),
    sessions: weeklyStudyHistory.length,
  };
  const updateStudy = (patch, message, action) => {
    const current = dataRef.current;
    const currentStudy =
      current.study.week && current.study.week !== weekStartKey(now)
        ? {
            ...current.study,
            actual: 0,
            sessions: 0,
            week: weekStartKey(now),
            history: current.study.history || [],
          }
        : current.study;
    const changes = typeof patch === "function" ? patch(currentStudy) : patch;
    save(
      { ...current, study: { ...currentStudy, ...changes } },
      message,
      action,
    );
  };
  const logSession = (
    minutes = displayStudy.workMinutes || 25,
    subject = displayStudy.selectedSubject,
    note = "",
    timerPatch = {},
  ) =>
    save(
      {
        ...data,
        study: {
          ...displayStudy,
          ...timerPatch,
          sessionNote: "",
          week: weekStartKey(now),
          history: [
            ...(displayStudy.history || []),
            {
              id: createId(),
              date: endKey,
              minutes: Number(minutes),
              subject,
              note,
            },
          ],
        },
      },
      "Focus session logged",
    );
  const startStudyFromDashboard = (eventTimestamp) => {
    const startedAt =
      eventTimestamp > 1_000_000_000_000
        ? eventTimestamp
        : performance.timeOrigin + eventTimestamp;
    if (displayStudy.timerEnd && displayStudy.timerEnd > startedAt) {
      nav("study");
      toast("Your focus timer is running");
      return;
    }
    const minutes = Math.max(1, Number(displayStudy.workMinutes) || 25);
    updateStudy({
      timer: minutes * 60,
      timerEnd: startedAt + minutes * 60 * 1000,
      timerStartedAt: startedAt,
      timerMode: "focus",
    });
    nav("study");
    toast(`${minutes}-minute focus session started`);
  };
  const openJournalFromDashboard = () => {
    setSelectedDay(dashboardDay);
    nav("journal");
    window.setTimeout(
      () => document.getElementById("journal-entry")?.focus(),
      0,
    );
  };
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch("");
        setCommandOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          startStudyFromDashboard(performance.timeOrigin + performance.now());
        } else if (key === "j") {
          event.preventDefault();
          openJournalFromDashboard();
        } else if (key === "w") {
          event.preventDefault();
          nav("workout");
        }
      }
      if (event.key === "Escape") {
        setEditing(null);
        setProfileEditing(false);
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const updateWorkout = (patch) =>
    save({ ...data, workout: { ...data.workout, ...patch } });
  const updateLearning = (id, patch) =>
    save({
      ...data,
      learning: data.learning.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const logLearning = (id, entry) => {
    const goal = data.learning.find((item) => item.id === id);
    if (
      !goal ||
      !Number.isFinite(Number(entry.minutes)) ||
      Number(entry.minutes) <= 0
    )
      return;
    const previousMinutes = Number(goal.focusMinutes || 0);
    const focusMinutes = entry.source === "focus" ? Number(entry.minutes) : 0;
    const nextMinutes = previousMinutes + focusMinutes;
    const thresholds = [
      { minutes: 5 * 60, badge: "5 hours", xp: 25 },
      { minutes: 10 * 60, badge: "10 hours", xp: 50 },
      { minutes: 50 * 60, badge: "50 hours", xp: 150 },
    ];
    const earned = thresholds.filter(
      (threshold) =>
        previousMinutes < threshold.minutes &&
        nextMinutes >= threshold.minutes &&
        !(goal.badges || []).includes(threshold.badge),
    );
    save(
      {
        ...data,
        learning: data.learning.map((item) =>
          item.id === id
            ? {
                ...item,
                logs: [
                  ...(item.logs || []),
                  {
                    id: createId(),
                    date: endKey,
                    minutes: Number(entry.minutes),
                    note: String(entry.note || "").trim(),
                    ...(entry.source ? { source: entry.source } : {}),
                    ...(entry.resourceId
                      ? { resourceId: entry.resourceId }
                      : {}),
                  },
                ],
                focusMinutes: nextMinutes,
                focusTimerEnd: null,
                badges: [
                  ...(item.badges || []),
                  ...earned.map((threshold) => threshold.badge),
                ],
              }
            : item,
        ),
        xp: data.xp + earned.reduce((sum, threshold) => sum + threshold.xp, 0),
      },
      earned.length
        ? `Learning milestone earned: ${earned.map((threshold) => threshold.badge).join(", ")}`
        : "Learning time logged",
    );
  };
  const sendLearningToStudy = (item) => {
    const note = [...(item.logs || [])].reverse().find((log) => log.note)?.note;
    if (!note) {
      toast("Add a learning-log note before sending it to flashcards");
      return;
    }
    const subjectName = item.category || "Learning";
    const subjects = data.study.subjects.some(
      (subject) => subject.name === subjectName,
    )
      ? data.study.subjects
      : [
          ...data.study.subjects,
          { name: subjectName, goal: 5, color: "#38c995" },
        ];
    const nextCard = {
      id: createId(),
      subject: subjectName,
      question: `What did I learn about ${item.title}?`,
      answer: note.trim(),
      rating: null,
      dueAt: endKey,
    };
    const alreadyExists = data.study.flashcards.some(
      (card) =>
        card.question.trim().toLowerCase() ===
          nextCard.question.trim().toLowerCase() &&
        card.answer.trim().toLowerCase() ===
          nextCard.answer.trim().toLowerCase(),
    );
    if (alreadyExists) {
      toast("That flashcard is already in your study deck");
      return;
    }
    save(
      {
        ...data,
        study: {
          ...data.study,
          subjects,
          subject: subjectName,
          selectedSubject: subjectName,
          flashcards: [...data.study.flashcards, nextCard],
        },
      },
      "Learning note sent to flashcards",
    );
    nav("flashcards");
  };
  const updateWellness = (patch) => {
    const dayFields = [
      "sleep",
      "bedtime",
      "wakeTime",
      "water",
      "meditation",
      "selfCareDone",
    ];
    const dayPatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => dayFields.includes(key)),
    );
    save({
      ...data,
      wellness: {
        ...data.wellness,
        ...patch,
        history: {
          ...(data.wellness.history || {}),
          ...(Object.keys(dayPatch).length
            ? {
                [endKey]: {
                  ...(data.wellness.history?.[endKey] || {}),
                  ...dayPatch,
                },
              }
            : {}),
        },
      },
    });
  };
  const addTask = (task) =>
    save({ ...data, tasks: [...data.tasks, task] }, "Task added");
  const logWater = (dayKey) => {
    const current = dataRef.current;
    const existing = current.wellness.history?.[dayKey] || {};
    const water =
      Math.max(
        0,
        Number(
          existing.water ?? (dayKey === endKey ? current.wellness.water : 0),
        ) || 0,
      ) + 1;
    save(
      {
        ...current,
        wellness: {
          ...current.wellness,
          ...(dayKey === endKey ? { water } : {}),
          history: {
            ...(current.wellness.history || {}),
            [dayKey]: { ...existing, water },
          },
        },
      },
      "Water logged",
    );
  };
  const toggleTask = (id) => {
    const current = dataRef.current;
    const task = current.tasks.find((item) => item.id === id);
    if (!task) return;
    const done = !task.done;
    let tasks = current.tasks.map((item) =>
      item.id === id ? { ...item, done } : item,
    );
    if (done && task.recurrence && task.due) {
      const nextDate = dateFromKey(task.due);
      if (task.recurrence === "daily") {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (task.recurrence.startsWith("weekly:")) {
        const target = WEEKDAYS.indexOf(
          task.recurrence.slice("weekly:".length),
        );
        const currentWeekday = (nextDate.getDay() + 6) % 7;
        nextDate.setDate(
          nextDate.getDate() + ((target - currentWeekday + 7) % 7 || 7),
        );
      } else {
        nextDate.setDate(nextDate.getDate() + 7);
      }
      const nextDue = dateKey(nextDate);
      if (
        !current.tasks.some(
          (item) =>
            item.id !== id && item.title === task.title && item.due === nextDue,
        )
      ) {
        tasks = [
          ...tasks,
          {
            ...task,
            id: createId(),
            createdAt: Date.now(),
            due: nextDue,
            done: false,
            subtasks: [],
          },
        ];
      }
    }
    save(
      { ...current, tasks },
      done && task.recurrence
        ? "Task completed · next one scheduled"
        : done
          ? "Task completed"
          : "Task reopened",
    );
  };
  const editTask = (id, patch) =>
    save(
      {
        ...dataRef.current,
        tasks: dataRef.current.tasks.map((task) =>
          task.id === id ? { ...task, ...patch } : task,
        ),
      },
      "Task updated",
    );
  const reorderTasks = (fromId, toId) => {
    const current = dataRef.current;
    const tasks = [...current.tasks];
    const from = tasks.findIndex((task) => task.id === fromId);
    const to = tasks.findIndex((task) => task.id === toId);
    if (from < 0 || to < 0) return;
    tasks.splice(to, 0, ...tasks.splice(from, 1));
    save({ ...current, tasks }, "Task order saved");
  };
  const deleteTask = (id) => {
    const index = data.tasks.findIndex((task) => task.id === id);
    const deleted = data.tasks[index];
    if (!deleted) return;
    save(
      { ...data, tasks: data.tasks.filter((task) => task.id !== id) },
      "Task deleted",
      {
        label: "Undo",
        onClick: () => {
          const current = dataRef.current;
          const tasks = [...current.tasks];
          tasks.splice(Math.min(index, tasks.length), 0, deleted);
          save({ ...current, tasks }, "Task restored");
        },
      },
    );
  };
  const toggleDashboardCard = (id) =>
    save({
      ...data,
      settings: {
        ...data.settings,
        dashboard: {
          ...data.settings.dashboard,
          [id]: !data.settings.dashboard[id],
        },
      },
    });
  const reorderDashboardCards = (from, to) => {
    const order = [
      ...(data.settings.dashboardOrder || initialState.settings.dashboardOrder),
    ];
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, from);
    save({
      ...data,
      settings: { ...data.settings, dashboardOrder: order },
    });
  };
  const saveTodayPriorities = (ids) => {
    save({
      ...data,
      settings: { ...data.settings, todayPriorities: ids },
    });
  };
  const setMissedReasonPrompts = (enabled) =>
    save(
      {
        ...dataRef.current,
        settings: { ...dataRef.current.settings, askMissedReasons: enabled },
      },
      enabled ? "Missed-day prompts enabled" : "Missed-day prompts disabled",
    );
  const setJournalPin = async (event) => {
    event.preventDefault();
    const pin = journalPinDraft.trim();
    if (pin.length < 4) {
      setJournalPinError("Choose a PIN with at least 4 characters.");
      return;
    }
    if (!crypto?.subtle) {
      setJournalPinError("This browser cannot create a secure journal PIN.");
      return;
    }
    try {
      const salt = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const hash = await hashJournalPin(pin, salt);
      save(
        {
          ...dataRef.current,
          settings: { ...dataRef.current.settings, journalPin: { salt, hash } },
        },
        "Journal PIN enabled",
      );
      setJournalUnlocked(true);
      setJournalPinDraft("");
      setJournalPinError("");
    } catch (error) {
      console.error("Could not set the journal PIN.", error);
      setJournalPinError(
        "Could not set the PIN. Try again in a secure browser context.",
      );
    }
  };
  const unlockJournal = async (event) => {
    event.preventDefault();
    try {
      const pin = journalPinDraft.trim();
      const hash = await hashJournalPin(pin, data.settings.journalPin.salt);
      if (hash !== data.settings.journalPin.hash) {
        setJournalPinError("That PIN is not correct.");
        return;
      }
      setJournalUnlocked(true);
      setJournalPinDraft("");
      setJournalPinError("");
    } catch (error) {
      console.error("Could not verify the journal PIN.", error);
      setJournalPinError("Could not verify the PIN in this browser.");
    }
  };
  const removeJournalPin = () => {
    save(
      {
        ...dataRef.current,
        settings: { ...dataRef.current.settings, journalPin: null },
      },
      "Journal PIN removed",
    );
    setJournalUnlocked(true);
    setJournalPinError("");
  };
  const updateQuarterlyGoal = (quarterlyGoal) =>
    save({
      ...data,
      settings: { ...data.settings, quarterlyGoal },
    });
  const snoozeHabitReminder = (id, snoozedAt) => {
    const habit = dataRef.current.habits.find((item) => item.id === id);
    if (!habit) return;
    const timeZone = habit.reminderTimeZone || DEVICE_TIME_ZONE;
    const reminderDate = zonedDateParts(new Date(snoozedAt), timeZone).date;
    localStorage.removeItem(`daymark-reminder-${id}-${reminderDate}`);
    save(
      {
        ...dataRef.current,
        habits: dataRef.current.habits.map((item) =>
          item.id === id
            ? { ...item, reminderSnoozedUntil: snoozedAt + 10 * 60 * 1000 }
            : item,
        ),
      },
      "Reminder snoozed for 10 minutes",
    );
  };
  useEffect(() => {
    const checkReminders = () => {
      const keepFrom = dateFromKey(endKey);
      keepFrom.setDate(keepFrom.getDate() - 1);
      const oldestReminderDate = dateKey(keepFrom);
      Object.keys(localStorage)
        .filter((key) => key.startsWith("daymark-reminder-"))
        .forEach((key) => {
          const reminderDate = key.match(/-(\d{4}-\d{2}-\d{2})(?:-|$)/)?.[1];
          if (reminderDate && reminderDate < oldestReminderDate) {
            localStorage.removeItem(key);
          }
        });
      if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      const current = new Date();
      const time = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;
      const bedtimeReminderTime =
        data.wellness.bedtimeReminderTime || data.wellness.bedtimeReminder;
      if (
        data.wellness.bedtimeReminderEnabled &&
        bedtimeReminderTime &&
        bedtimeReminderTime <= time &&
        !localStorage.getItem(`daymark-reminder-bedtime-${endKey}`)
      ) {
        new Notification("A gentle bedtime reminder", {
          body: "Start winding down when it feels right for you.",
        });
        localStorage.setItem(`daymark-reminder-bedtime-${endKey}`, "sent");
      }
      const currentWater =
        Number(data.wellness.history?.[endKey]?.water ?? data.wellness.water) ||
        0;
      const waterReminderTime = data.wellness.waterReminderTime || "14:00";
      if (
        data.wellness.waterReminderEnabled &&
        currentWater < Math.max(1, Number(data.wellness.waterGoal) || 8) &&
        waterReminderTime <= time &&
        !localStorage.getItem(`daymark-reminder-water-${endKey}`)
      ) {
        new Notification("A gentle water reminder", {
          body: "Pause for a drink when it feels right for you.",
        });
        localStorage.setItem(`daymark-reminder-water-${endKey}`, "sent");
      }
      data.learning.forEach((item) => {
        if (!(item.reviewDates || []).includes(endKey)) return;
        const key = `daymark-reminder-learning-${item.id}-${endKey}`;
        if (localStorage.getItem(key)) return;
        new Notification(`Review: ${item.title}`, {
          body: "A quick spaced review can help this topic stick.",
        });
        localStorage.setItem(key, "sent");
      });
      data.habits.forEach((habit) => {
        if (
          !habit.reminderEnabled ||
          isHabitPausedOnDate(habit, reminderTime.date)
        )
          return;
        const timeZone = habit.reminderTimeZone || DEVICE_TIME_ZONE;
        const reminderTime = zonedDateParts(current, timeZone);
        const scheduledDays = getHabitScheduleDays(habit);
        if (
          (Array.isArray(habit.scheduleDays) &&
            !scheduledDays.includes(reminderTime.weekday)) ||
          habit.days[reminderTime.date]?.done ||
          Number(habit.reminderSnoozedUntil) > current.getTime() ||
          reminderTime.time < habit.reminderTime ||
          (habit.reminderQuietEnabled &&
            isWithinQuietHours(
              reminderTime.time,
              habit.reminderQuietStart,
              habit.reminderQuietEnd,
            ))
        )
          return;
        const reminderKey = `daymark-reminder-${habit.id}-${reminderTime.date}`;
        if (localStorage.getItem(reminderKey)) return;
        new Notification(`Time for ${habit.name}`, {
          body: habit.note || "A small promise, kept today.",
        });
        localStorage.setItem(reminderKey, "sent");
      });
      const currentDay = WEEKDAYS[(current.getDay() + 6) % 7];
      const currentMinutes = current.getHours() * 60 + current.getMinutes();
      (data.study.classes || [])
        .filter((item) => {
          if (
            !item.reminderEnabled ||
            item.day !== currentDay ||
            !classOccursOnDate(item, endKey)
          )
            return false;
          const [hour, minute] = item.startTime.split(":").map(Number);
          const minutesUntilClass = hour * 60 + minute - currentMinutes;
          const [endHour, endMinute] = item.endTime.split(":").map(Number);
          const classEnd = endHour * 60 + endMinute;
          return minutesUntilClass <= 10 && currentMinutes < classEnd;
        })
        .forEach((item) => {
          const reminderKey = `daymark-class-reminder-${item.id}-${endKey}`;
          if (localStorage.getItem(reminderKey)) return;
          new Notification(`Class in 10 minutes: ${item.name}`, {
            body: item.location
              ? `Coming up at ${item.location}.`
              : "Your class is coming up soon.",
          });
          localStorage.setItem(reminderKey, "sent");
        });
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(timer);
  }, [data.habits, data.study.classes, data.wellness, data.learning, endKey]);

  useEffect(() => {
    if (
      weekday !== 0 ||
      localStorage.getItem("daymark-backup-reminder-week") === mondayKey
    )
      return;
    localStorage.setItem("daymark-backup-reminder-week", mondayKey);
    const timer = window.setTimeout(
      () =>
        toast(
          "Weekly backup reminder: export a copy of your Daymark data when convenient.",
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [weekday, mondayKey]);

  const requestReminderPermission = async () => {
    if (!("Notification" in window)) {
      toast("Notifications are not supported in this browser");
      return;
    }
    const permission = await Notification.requestPermission();
    toast(
      permission === "granted"
        ? "Reminders enabled"
        : "Reminder permission declined",
    );
    return permission === "granted";
  };
  const exportData = () => {
    const link = document.createElement("a");
    const backupUrl = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    link.href = backupUrl;
    link.download = `daymark-backup-${endKey}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(backupUrl), 1000);
    toast("Backup exported");
  };
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  const saveReviewSettings = (patch) =>
    save({
      ...data,
      settings: { ...data.settings, ...patch },
    });
  const importData = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!isValidBackup(parsed)) {
          throw new Error(
            "This file is not a Daymark backup with a habits list.",
          );
        }
        const imported = normalizeState(parsed);
        setPendingBackup({
          data: imported,
          counts: {
            habits: imported.habits.length,
            tasks: imported.tasks.length,
            cards: imported.study.flashcards.length,
            classes: imported.study.classes.length,
          },
        });
      } catch (error) {
        console.error("Could not read the Daymark backup.", error);
        toast(
          error instanceof Error ? error.message : "That backup is not valid.",
        );
      }
    };
    reader.readAsText(file);
  };
  const confirmBackupImport = () => {
    if (!pendingBackup) return;
    const previous = dataRef.current;
    save(pendingBackup.data, "Backup imported", {
      label: "Undo",
      onClick: () => save(previous, "Backup import undone"),
    });
    setJournalUnlocked(!pendingBackup.data.settings.journalPin);
    setPendingBackup(null);
  };
  const dismissOnboarding = () => {
    localStorage.setItem("daymark-onboarded", "true");
    localStorage.removeItem("daymark-onboarding-pending");
    setOnboardingOpen(false);
  };
  const resetAllData = () => {
    const resetState = JSON.parse(JSON.stringify(initialState));
    resetState.xp = 0;
    save(resetState, "All data reset");
    setEditing(null);
    setProfileEditing(false);
    setResetConfirmOpen(false);
    setJournalUnlocked(true);
    setOnboardingOpen(true);
    setOnboardingName("");
    setOnboardingIcon(initialState.profile.icon);
    setOnboardingAccent(initialState.settings.accent);
    localStorage.setItem("daymark-onboarding-pending", "true");
    Object.keys(localStorage)
      .filter((key) => key.startsWith("daymark-reminder-"))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem("daymark-dark");
    localStorage.removeItem("daymark-onboarded");
    setDarkMode(false);
    nav("today");
  };

  if (
    isFirebaseConfigured &&
    (!firebaseAuthReady ||
      (firebaseUser && cloudReadyUserId !== firebaseUser.uid))
  ) {
    const loadingError = cloudSyncStatus === "error";
    return (
      <main className="account-sync-loading" aria-live="polite">
        <section>
          <span className="account-sync-cloud-icon">
            <Icon name="Cloud" size={24} />
          </span>
          <h1>
            {loadingError ? "Could not load cloud data" : "Connecting Daymark"}
          </h1>
          <p>
            {loadingError
              ? cloudSyncError || "Check your connection and Firebase setup."
              : "Loading your account and syncing your data before opening the app."}
          </p>
          {loadingError && (
            <div>
              <button
                type="button"
                className="primary-btn"
                onClick={() => setCloudLoadRetry((retry) => retry + 1)}
              >
                Retry
              </button>
              <button
                type="button"
                className="subtle-btn"
                onClick={async () => {
                  try {
                    const { signOutAccount } = await import("./firebase.js");
                    await signOutAccount();
                  } catch (error) {
                    console.error("Could not sign out of Firebase.", error);
                    setCloudSyncError(
                      "Could not sign out. Check your connection and try again.",
                    );
                  }
                }}
              >
                Continue on this device
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">+</span>
          <span>daymark</span>
          <span className="mobile-section-name">
            {
              {
                today: "Today",
                habits: "Habits",
                calendar: "Calendar",
                study: "Study",
                flashcards: "Flashcards",
                "flashcard-library": "AI cards",
                "class-schedule": "Classes",
                "add-class": "Classes",
                workout: "Workout",
                learning: "Learning",
                journal: "Journal",
                insights: "Insights",
              }[section]
            }
          </span>
        </div>
        <nav aria-label="Primary navigation">
          {DESKTOP_NAV_GROUPS.map((group, groupIndex) => (
            <div className="sidebar-nav-group" key={groupIndex}>
              {groupIndex > 0 && (
                <span className="sidebar-nav-label">
                  {["", "TRACK", "STUDY", "WELLNESS", "REVIEW"][groupIndex]}
                </span>
              )}
              {group.map(([id, icon, label]) => {
                const active =
                  section === id ||
                  (section === "flashcard-library" && id === "flashcards") ||
                  (section === "add-habit" && id === "habits") ||
                  (section === "add-class" && id === "class-schedule");
                return (
                  <button
                    type="button"
                    className={`nav-item ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    key={id}
                    onClick={() => nav(id)}
                    title={label}
                  >
                    <span aria-hidden="true">
                      <NavIcon name={icon} />
                    </span>
                    {label}
                    {id === "today" && (
                      <b aria-label={`${doneToday} habits completed today`}>
                        {doneToday}
                      </b>
                    )}
                    {id === "flashcards" && dueFlashcardCount > 0 && (
                      <b aria-label={`${dueFlashcardCount} flashcards due`}>
                        {dueFlashcardCount}
                      </b>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <details className="sidebar-account-menu">
            <summary>
              <span className="avatar">
                <Icon name={data.profile.icon} size={20} />
              </span>
              <span>
                <strong>{data.profile.name}</strong>
                <small>Profile &amp; settings</small>
              </span>
            </summary>
            <div className="sidebar-account-popover">
              <button
                type="button"
                className="mini-card"
                onClick={() => setXpDetailsOpen(true)}
                aria-label={`View level ${currentLevel} XP details`}
              >
                <span className="spark">
                  <NavIcon name="chart" />
                </span>
                <strong>Level {currentLevel}</strong>
                <small>{levelProgress}/100 XP to next level</small>
                <div className="mini-progress">
                  <i style={{ width: `${levelProgress}%` }} />
                </div>
                <span className="mini-card-hint">View XP details</span>
              </button>
              <div className="backup-actions">
                <button type="button" onClick={exportData}>
                  <Icon name="ArrowDown" size={16} /> Export
                </button>
                <button
                  type="button"
                  onClick={() => importRef.current?.click()}
                >
                  <Icon name="ArrowUp" size={16} /> Import
                </button>
                <button
                  type="button"
                  className="reset-data"
                  onClick={() => setResetConfirmOpen(true)}
                >
                  Reset data
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  hidden
                  aria-label="Import Daymark backup"
                  onChange={importData}
                />
              </div>
              <button
                type="button"
                className="profile-menu-edit account-sync-button"
                onClick={() => setAccountDialogOpen(true)}
              >
                <Icon name="Cloud" size={16} />
                {firebaseUser ? "Cloud sync" : "Sync across devices"}
                {firebaseUser && (
                  <small>
                    {cloudSyncStatus === "synced"
                      ? "Synced"
                      : cloudSyncStatus === "saving"
                        ? "Syncing…"
                        : cloudSyncStatus === "error"
                          ? "Needs attention"
                          : "Connecting…"}
                  </small>
                )}
              </button>
              <button
                type="button"
                className="profile-menu-edit"
                onClick={() => {
                  setProfileIcon(data.profile.icon);
                  setProfileEditing(true);
                }}
              >
                Edit profile
              </button>
            </div>
          </details>
        </div>
      </aside>
      <MobileNav
        section={section}
        onNavigate={(id) => {
          setXpDetailsOpen(false);
          nav(id);
        }}
        dueCardCount={dueFlashcardCount}
        profile={data.profile}
        level={currentLevel}
        levelProgress={levelProgress}
        onXpDetails={() => setXpDetailsOpen(true)}
        onExport={exportData}
        onImport={() => importRef.current?.click()}
        onReset={() => setResetConfirmOpen(true)}
        onEditProfile={() => {
          setProfileIcon(data.profile.icon);
          setProfileEditing(true);
        }}
        onAccount={() => setAccountDialogOpen(true)}
        accountLabel={firebaseUser ? "Cloud sync" : "Sync across devices"}
        accountStatus={
          firebaseUser
            ? cloudSyncStatus === "synced"
              ? "Synced"
              : cloudSyncStatus === "saving"
                ? "Syncing…"
                : cloudSyncStatus === "error"
                  ? "Needs attention"
                  : "Connecting…"
            : ""
        }
      />
      <AccountSyncDialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        configured={isFirebaseConfigured}
        user={firebaseUser}
        status={cloudSyncStatus}
        error={cloudSyncError}
        onRetry={() => {
          if (!cloudDirtyRef.current) {
            setCloudLoadRetry((retry) => retry + 1);
          } else {
            setCloudSyncRetry((retry) => retry + 1);
          }
        }}
      />
      {xpDetailsOpen && (
        <div
          className="modal-backdrop xp-details-backdrop"
          onClick={() => setXpDetailsOpen(false)}
        >
          <section
            className="edit-modal xp-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="xp-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR PROGRESS</p>
                <h2 id="xp-details-title">
                  Level {currentLevel} · {data.xp} XP
                </h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setXpDetailsOpen(false)}
                aria-label="Close XP details"
                title="Close XP details"
              >
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="xp-details-progress">
              <div className="xp-details-progress-label">
                <strong>
                  {xpToNextLevel} XP to Level {currentLevel + 1}
                </strong>
                <span>{levelProgress}%</span>
              </div>
              <div className="mini-progress">
                <i style={{ width: `${levelProgress}%` }} />
              </div>
            </div>
            <div className="xp-details-grid">
              <div>
                <strong>+5 XP</strong>
                <small>Complete a habit</small>
              </div>
              <div>
                <strong>+25 XP</strong>
                <small>Reach a learning milestone</small>
              </div>
              <div>
                <strong>100 XP</strong>
                <small>Each level</small>
              </div>
            </div>
            <h3 className="xp-details-subheading">Recent XP activity</h3>
            {recentXpHistory.length ? (
              <div className="xp-history-list">
                {recentXpHistory.map((entry) => (
                  <div className="xp-history-item" key={entry.id}>
                    <span
                      className={
                        entry.delta >= 0 ? "xp-positive" : "xp-negative"
                      }
                    >
                      {entry.delta >= 0 ? "+" : ""}
                      {entry.delta} XP
                    </span>
                    <span>{entry.message}</span>
                    <small>{entry.date}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Complete a habit or learning milestone to start your XP history.
              </p>
            )}
            <h3 className="xp-details-subheading">Rewards</h3>
            <div className="xp-rewards">
              {earnedRewards.map((reward) => (
                <span className="xp-reward earned" key={reward.level}>
                  <Icon name={reward.icon} size={16} /> {reward.label}
                </span>
              ))}
              {nextReward && (
                <span className="xp-reward next">
                  Next: Level {nextReward.level} · {nextReward.label}
                </span>
              )}
            </div>
          </section>
        </div>
      )}
      <main
        id="main-content"
        tabIndex="-1"
        className={`content ${showHabitActions ? "" : "feature-content"}${section === "flashcards" ? " flashcards-content" : ""}${section === "flashcard-library" ? " ai-cards-content" : ""}`}
      >
        <header className="topbar">
          <div>
            <p className="eyebrow">{displayDate.toUpperCase()}</p>
            <h1>
              {section === "today" && !dashboardIsToday
                ? `${dashboardDate < dateFromKey(endKey) ? "Looking back at" : "Planning for"} ${dashboardDate.toLocaleDateString(undefined, { weekday: "long" })}`
                : `${greeting}, ${data.profile.name.split(" ")[0]}`}
            </h1>
          </div>
          {section === "today" && (
            <div className="top-actions">
              <label className="search-box">
                <Icon name="Search" size={18} />
                <input
                  value={search}
                  onFocus={() => setCommandOpen(true)}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCommandOpen(true);
                  }}
                  placeholder="Search Daymark"
                  aria-label="Search Daymark"
                />
              </label>
              {installPrompt && (
                <button
                  className="subtle-btn install-app-button"
                  onClick={installApp}
                >
                  Install app
                </button>
              )}
              <label className="accent-control" title="Accent color">
                <span className="sr-only">Accent color</span>
                <CompactPicker
                  value={data.settings.accent || "#9a5de8"}
                  onChange={(accent) =>
                    save(
                      {
                        ...data,
                        settings: { ...data.settings, accent },
                      },
                      `${THEME_PRESETS.find(([value]) => value === accent)?.[1] || "Custom"} theme applied`,
                    )
                  }
                  ariaLabel="Accent color"
                  options={THEME_PRESETS}
                />
              </label>
              <button
                className="icon-btn"
                aria-label={
                  darkMode ? "Switch to light mode" : "Switch to dark mode"
                }
                title={darkMode ? "Light mode" : "Dark mode"}
                onClick={() => {
                  setDarkMode((value) => {
                    localStorage.setItem("daymark-dark", String(!value));
                    return !value;
                  });
                }}
              >
                <NavIcon name={darkMode ? "sun" : "moon"} />
              </button>
            </div>
          )}
        </header>
        {section === "today" && dashboardIsToday && (
          <section className="hero-grid page-view" id="today">
            <div className="welcome-card">
              <p className="eyebrow light">YOUR DAILY RHYTHM</p>
              <h2>
                Make today
                <br />
                <em>count.</em>
              </h2>
              <p className="hero-copy daily-quote">“{dailyQuote}”</p>
              <div className="sun">
                <Icon name="Sun" size={24} />
              </div>
            </div>
            <div className="progress-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">TODAY'S PROGRESS</p>
                  <h3>
                    {doneToday} of {todayHabits.length} habits
                  </h3>
                </div>
                <span className="progress-percent">{todayProgress}%</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${todayProgress}%` }} />
              </div>
              <p className="muted">
                {!activeHabits.length
                  ? "Start with one small routine."
                  : !todayHabits.length
                    ? "A planned rest day. Enjoy your breathing room."
                    : doneToday === todayHabits.length
                      ? "Everything checked off. Nice work."
                      : `${todayHabits.length - doneToday} left for today`}
              </p>
              <button className="card-action" onClick={() => nav("habits")}>
                View routines <Icon name="ArrowRight" size={16} />
              </button>
            </div>
            <div className="stat-card">
              <span className="stat-icon purple">
                <Icon name="ArrowUpRight" size={18} />
              </span>
              <p className="eyebrow">THIS WEEK</p>
              <strong>
                {weeklyDone} <small>/ {weeklyTarget}</small>
              </strong>
              <p className="muted">check-ins completed</p>
            </div>
            <div className="stat-card">
              <span className="stat-icon orange">
                <Icon name="Flame" size={18} />
              </span>
              <p className="eyebrow">BEST STREAK</p>
              <strong>
                {best} <small>{bestUnit}</small>
              </strong>
              <p className="muted">best habit streak</p>
            </div>
          </section>
        )}
        {section === "today" && (
          <UpcomingDeadlines
            tasks={data.tasks}
            exam={data.study.exam}
            subject={data.study.selectedSubject || data.study.subject}
            onNavigate={nav}
            dayKey={dashboardDay}
          />
        )}
        {section === "today" && (
          <TodayCommandCenter
            habits={data.habits}
            tasks={data.tasks}
            journal={data.journal[dashboardDay] || {}}
            wellness={data.wellness}
            study={studyForDisplay}
            classes={data.study.classes}
            workout={data.workout}
            now={now}
            dayKey={dashboardDay}
            onDayChange={setDashboardDay}
            dashboard={data.settings.dashboard}
            dashboardOrder={
              data.settings.dashboardOrder ||
              initialState.settings.dashboardOrder
            }
            priorityTaskIds={data.settings.todayPriorities || []}
            onNavigate={nav}
            onToggleCard={toggleDashboardCard}
            onReorderCards={reorderDashboardCards}
            onToggleHabit={toggle}
            onHabitProgress={updateHabitProgress}
            onStartStudy={startStudyFromDashboard}
            onJournal={openJournalFromDashboard}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onSavePriorities={saveTodayPriorities}
            onLogWater={logWater}
          />
        )}
        {section === "today" && dashboardIsToday && (
          <>
            <TodayScoreCard
              habits={data.habits}
              tasks={data.tasks}
              study={data.study}
              workout={data.workout}
              wellness={data.wellness}
              classes={data.study.classes}
              learning={data.learning}
            />
            <WeeklyReview
              habits={data.habits}
              tasks={data.tasks}
              study={data.study}
              journal={data.journal[endKey] || {}}
              settings={data.settings}
              onSave={saveReviewSettings}
            />
          </>
        )}
        {section === "today" && (
          <>
            <TaskList
              tasks={data.tasks.filter(
                (task) => task.due === dashboardDay || !task.done,
              )}
              subjects={(data.study.subjects || []).map(
                (subject) => subject.name,
              )}
              onAdd={addTask}
              onToggle={toggleTask}
              onEdit={editTask}
              onDelete={deleteTask}
              onReorder={reorderTasks}
            />
          </>
        )}
        {section === "calendar" && (
          <section className="single-page calendar-page page-view">
            <CalendarView
              data={data}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onToggle={toggle}
              onAddTask={addTask}
              onMoveTask={editTask}
              onAddStudyBlock={(gap) =>
                updateStudy(
                  {
                    schedule: [
                      ...(dataRef.current.study.schedule || []),
                      {
                        ...gap,
                        id: createId(),
                        subject:
                          dataRef.current.study.selectedSubject ||
                          dataRef.current.study.subject,
                        topic: "Study gap",
                        done: false,
                      },
                    ],
                  },
                  "Study gap added to calendar",
                )
              }
            />
          </section>
        )}
        {(section === "habits" || section === "add-habit") && (
          <section className="section page-view compact-habits" id={section}>
            <PageHeading
              eyebrow={section === "add-habit" ? "NEW HABIT" : "YOUR HABITS"}
              title={section === "add-habit" ? "Create a habit" : "Habits"}
              subtitle={
                section === "add-habit"
                  ? "Set a schedule and add any details you need."
                  : "Track check-ins and adjust your schedule."
              }
              aside={
                section === "add-habit" ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={cancelNewHabit}
                  >
                    <Icon name="ArrowLeft" size={16} /> Back to habits
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => nav("add-habit")}
                  >
                    <Icon name="Plus" size={16} /> Add new habit
                  </button>
                )
              }
            />
            {section === "habits" && (
              <>
                <label className="habit-filter">
                  <span>Filter habits</span>
                  <CompactPicker
                    value={habitFilter}
                    onChange={setHabitFilter}
                    ariaLabel="Filter habits"
                    options={[
                      ["all", "All habits"],
                      ["active", "Active"],
                      ["paused", "Paused"],
                      ["completed", "Completed today"],
                      ["archived", "Archived"],
                    ]}
                  />
                </label>
              </>
            )}
            {section === "add-habit" && (
              <form className="add-form habit-create-form" onSubmit={addHabit}>
                <input
                  id="habit-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What habit would you like to build?"
                  aria-label="New habit name"
                  required
                  maxLength={60}
                  autoFocus
                />
                <fieldset
                  className="habit-icon-picker"
                  aria-label="Choose habit icon"
                >
                  <legend>Habit icon</legend>
                  <div>
                    {HABIT_ICONS.map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        className={habitIcon === icon ? "selected" : ""}
                        onClick={() => setHabitIcon(icon)}
                        aria-label={icon.replaceAll("-", " ")}
                        aria-pressed={habitIcon === icon}
                        title={icon.replaceAll("-", " ")}
                      >
                        <Icon name={icon} size={20} />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <select
                  value={goal}
                  onChange={(event) => {
                    const nextGoal = Number(event.target.value);
                    setGoal(nextGoal);
                    setHabitScheduleDays(WEEKDAYS.slice(0, nextGoal));
                  }}
                  aria-label="Weekly goal"
                >
                  {[7, 1, 2, 3, 4, 5, 6].map((days) => (
                    <option value={days} key={days}>
                      {days === 7 ? "Every day" : `${days}x a week`}
                    </option>
                  ))}
                </select>
                <fieldset className="habit-add-schedule">
                  <legend>Choose specific days</legend>
                  {WEEKDAYS.map((day) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={habitScheduleDays.includes(day)}
                        onChange={(event) => {
                          const nextDays = event.target.checked
                            ? WEEKDAYS.filter(
                                (item) =>
                                  habitScheduleDays.includes(item) ||
                                  item === day,
                              )
                            : habitScheduleDays.filter((item) => item !== day);
                          if (!nextDays.length) return;
                          setHabitScheduleDays(nextDays);
                          setGoal(nextDays.length);
                        }}
                      />
                      {day.slice(0, 3)}
                    </label>
                  ))}
                </fieldset>
                <div className="habit-quantity-fields">
                  <div className="habit-quantity-heading">
                    <strong>Track progress</strong>
                    <span>Optional</span>
                  </div>
                  <p className="habit-quantity-help">
                    For countable habits, like 8 glasses of water or 20 pages.
                  </p>
                  <label>
                    Target
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={numericTarget}
                      onChange={(event) => setNumericTarget(event.target.value)}
                      placeholder="e.g. 8"
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      value={numericUnit}
                      onChange={(event) => setNumericUnit(event.target.value)}
                      placeholder="glasses, pages…"
                    />
                  </label>
                </div>
                <label>
                  Minimum version (optional)
                  <input
                    value={minimumVersionDraft}
                    onChange={(event) =>
                      setMinimumVersionDraft(event.target.value)
                    }
                    placeholder="e.g. Read 2 pages"
                    maxLength={80}
                  />
                </label>
                <label>
                  Habit group
                  <select
                    value={habitGroupDraft}
                    onChange={(event) => setHabitGroupDraft(event.target.value)}
                  >
                    <option>Anytime</option>
                    <option>Morning</option>
                    <option>Evening</option>
                    <option>School</option>
                  </select>
                </label>
                <label className="habit-stack-select">
                  Habit stacking · do this after
                  <select
                    value={habitStackAfter}
                    onChange={(event) => setHabitStackAfter(event.target.value)}
                  >
                    <option value="">No linked habit</option>
                    {data.habits
                      .filter((habit) => !habit.archived)
                      .map((habit) => (
                        <option key={habit.id} value={habit.name}>
                          {habit.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="habit-start-date">
                  Start date
                  <input
                    type="date"
                    value={habitStartDate}
                    onChange={(event) => setHabitStartDate(event.target.value)}
                  />
                </label>
                <div className="color-picker">
                  {COLORS.map((item) => (
                    <button
                      type="button"
                      className={color === item ? "chosen" : ""}
                      key={item}
                      style={{ background: item }}
                      onClick={() => setColor(item)}
                      aria-label={`Choose ${item}`}
                    />
                  ))}
                </div>
                <div className="habit-create-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={cancelNewHabit}
                  >
                    Cancel
                  </button>
                  <button className="add-submit">Create habit</button>
                </div>
              </form>
            )}
            {section === "habits" && (
              <>
                <details className="habit-settings">
                  <summary>Habit settings</summary>
                  <label className="habit-reason-setting">
                    <input
                      type="checkbox"
                      checked={data.settings.celebrations}
                      onChange={(event) =>
                        save(
                          {
                            ...dataRef.current,
                            settings: {
                              ...dataRef.current.settings,
                              celebrations: event.target.checked,
                            },
                          },
                          event.target.checked
                            ? "Milestone celebrations enabled"
                            : "Milestone celebrations turned off",
                        )
                      }
                    />
                    Celebrate 7, 30 and 100-day streaks
                  </label>
                  <label className="habit-reason-setting">
                    <input
                      type="checkbox"
                      checked={data.settings.askMissedReasons}
                      onChange={(event) =>
                        setMissedReasonPrompts(event.target.checked)
                      }
                    />
                    Ask why a habit was missed
                  </label>
                </details>
                {visibleHabitChains.length ||
                (habitFilter === "archived" && visibleHabits.length) ? (
                  Object.entries(visibleHabitGroups).map(([group, chains]) => (
                    <section className="habit-group-section" key={group}>
                      <button
                        type="button"
                        className="habit-group-heading"
                        aria-expanded={!collapsedHabitGroups[group]}
                        onClick={() =>
                          setCollapsedHabitGroups((collapsed) => ({
                            ...collapsed,
                            [group]: !collapsed[group],
                          }))
                        }
                      >
                        <strong>{group}</strong>
                        <span>
                          {
                            chains
                              .flat()
                              .filter((habit) => habit.days[selectedDay]?.done)
                              .length
                          }
                          /{chains.flat().length} done
                        </span>
                        <span aria-hidden="true">
                          {collapsedHabitGroups[group] ? "+" : "−"}
                        </span>
                      </button>
                      {!collapsedHabitGroups[group] &&
                        chains.map((chain) => (
                          <div
                            className={`habit-chain${chain.length > 1 ? " has-stack" : ""}`}
                            key={chain[0].id}
                          >
                            {chain.map((habit) => (
                              <HabitRow
                                key={habit.id}
                                habit={habit}
                                dates={dates}
                                isPhoneViewport={isPhoneViewport}
                                endKey={endKey}
                                selectedDay={selectedDay}
                                onToggle={toggle}
                                onProgress={updateHabitProgress}
                                onReason={saveHabitReason}
                                onDisableReasonPrompt={() =>
                                  setMissedReasonPrompts(false)
                                }
                                askMissedReasons={
                                  data.settings.askMissedReasons
                                }
                                onPause={pauseHabitDay}
                                onNote={updateHabitNote}
                                onEdit={setEditing}
                                onDelete={deleteHabit}
                                onSelectDay={(key) => setSelectedDay(key)}
                                onSuggestReminder={suggestHabitReminder}
                              />
                            ))}
                          </div>
                        ))}
                    </section>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>No habits found.</strong>
                    <span>
                      Try a different search, or add a gentle new routine above.
                    </span>
                  </div>
                )}
                {habitFilter === "archived" &&
                  visibleHabits.map((habit) => (
                    <article className="archived-habit-row" key={habit.id}>
                      <span>
                        <strong>{habit.name}</strong>
                        <small>
                          History preserved ·{" "}
                          {
                            Object.values(habit.days || {}).filter(
                              (day) => day?.done,
                            ).length
                          }{" "}
                          check-ins
                        </small>
                      </span>
                      <button
                        type="button"
                        className="subtle-btn"
                        onClick={() => restoreHabit(habit.id)}
                      >
                        Restore
                      </button>
                    </article>
                  ))}
              </>
            )}
          </section>
        )}
        {(section === "study" || section === "flashcards") && (
          <section className="single-page page-view">
            {section === "flashcards" &&
              !openStudySetId &&
              !flashcardsPageOpen && (
                <div className="flashcards-page-entry">
                  <h2>Flashcards</h2>
                  <p>Review your cards or open a study set.</p>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setFlashcardsPageOpen(true)}
                  >
                    Open flashcards
                  </button>
                </div>
              )}
            {section === "flashcards" && flashcardsPageOpen && (
              <button
                type="button"
                className="text-button flashcards-page-back"
                onClick={() => setFlashcardsPageOpen(false)}
              >
                <Icon name="ArrowLeft" size={16} /> Back to study sets
              </button>
            )}
            {!openStudySetId && (section === "study" || flashcardsPageOpen) && (
              <StudyCard
                study={studyForDisplay}
                onUpdate={updateStudy}
                onSession={logSession}
                toast={toast}
                toolsOnly={section === "flashcards"}
                onNavigate={nav}
                onAddTask={addTask}
              />
            )}
            {section === "flashcards" && !flashcardsPageOpen && (
              <StudySets
                sets={data.study.sets || []}
                onChange={(sets, message, action) =>
                  updateStudy({ sets }, message, action)
                }
                toast={toast}
                onOpenChange={setOpenStudySetId}
              />
            )}
          </section>
        )}
        {section === "flashcard-library" && (
          <section className="single-page page-view">
            <AiFlashcardLibrary
              study={data.study}
              onUpdate={updateStudy}
              onNavigate={nav}
            />
          </section>
        )}
        {(section === "class-schedule" || section === "add-class") && (
          <section className="single-page class-timetable-page page-view">
            <ClassSchedulePage
              study={data.study}
              tasks={data.tasks}
              onToggleTask={toggleTask}
              onUpdate={updateStudy}
              onRequestReminders={requestReminderPermission}
              toast={toast}
              editorMode={section === "add-class"}
              onNavigate={nav}
            />
          </section>
        )}
        {section === "workout" && (
          <section className="single-page page-view">
            <WorkoutCard workout={data.workout} onUpdate={updateWorkout} />
          </section>
        )}
        {section === "learning" && (
          <section className="single-page page-view">
            <LearningCard
              items={data.learning}
              onAdd={(item) =>
                save(
                  { ...data, learning: [...data.learning, item] },
                  "Learning goal added",
                )
              }
              onUpdate={updateLearning}
              onLog={logLearning}
              onSendToStudy={sendLearningToStudy}
              onRequestReminders={requestReminderPermission}
              onDelete={(id) =>
                (() => {
                  const index = data.learning.findIndex(
                    (item) => item.id === id,
                  );
                  const deleted = data.learning[index];
                  if (!deleted) return;
                  save(
                    {
                      ...data,
                      learning: data.learning.filter((item) => item.id !== id),
                    },
                    "Learning goal deleted",
                    {
                      label: "Undo",
                      onClick: () => {
                        const current = dataRef.current;
                        const learning = [...current.learning];
                        learning.splice(
                          Math.min(index, learning.length),
                          0,
                          deleted,
                        );
                        save(
                          { ...current, learning },
                          "Learning goal restored",
                        );
                      },
                    },
                  );
                })()
              }
            />
          </section>
        )}
        {section === "journal" && (
          <section className="single-page page-view">
            {data.settings.journalPin && !journalUnlocked ? (
              <div className="journal-pin-gate">
                <PageHeading
                  eyebrow="PRIVATE SPACE"
                  title="Journal locked"
                  subtitle="Enter your PIN to open your reflections."
                />
                <form onSubmit={unlockJournal}>
                  <label>
                    Journal PIN
                    <input
                      type="password"
                      inputMode="text"
                      autoComplete="current-password"
                      value={journalPinDraft}
                      onChange={(event) =>
                        setJournalPinDraft(event.target.value)
                      }
                      required
                    />
                  </label>
                  {journalPinError && <p role="alert">{journalPinError}</p>}
                  <button type="submit" className="primary-btn">
                    Unlock journal
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div className="section reflection" id="journal">
                  <PageHeading
                    eyebrow="JOURNAL"
                    title="Daily journal"
                    subtitle="Record a note about how you feel and what happened."
                    aside={
                      <span className="date-pill">
                        {selectedDay === endKey ? "Today" : selectedDay}
                      </span>
                    }
                  />
                  <details className="journal-pin-disclosure">
                    <summary>Journal privacy</summary>
                    <section
                      className="journal-pin-settings"
                      aria-label="Journal privacy settings"
                    >
                      <div>
                        <strong>
                          {data.settings.journalPin
                            ? "Journal PIN is on"
                            : "Add a journal PIN"}
                        </strong>
                        <small>
                          It hides entries in Daymark on this device. Exported
                          backups are not encrypted.
                        </small>
                      </div>
                      {data.settings.journalPin ? (
                        <>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setJournalUnlocked(false);
                              setJournalPinDraft("");
                              setJournalPinError("");
                            }}
                          >
                            Lock journal
                          </button>
                          <button
                            type="button"
                            className="text-button danger-text"
                            onClick={removeJournalPin}
                          >
                            Remove PIN
                          </button>
                        </>
                      ) : (
                        <form onSubmit={setJournalPin}>
                          <input
                            type="password"
                            inputMode="text"
                            autoComplete="new-password"
                            minLength={4}
                            maxLength={32}
                            value={journalPinDraft}
                            onChange={(event) =>
                              setJournalPinDraft(event.target.value)
                            }
                            placeholder="At least 4 characters"
                            aria-label="New journal PIN"
                          />
                          <button type="submit" className="text-button">
                            Set PIN
                          </button>
                          {journalPinError && (
                            <small role="alert">{journalPinError}</small>
                          )}
                        </form>
                      )}
                    </section>
                  </details>
                  <div className="journal-meta-row">
                    <button
                      type="button"
                      className="journal-prompt"
                      onClick={() => {
                        const currentIndex =
                          journalPrompts.indexOf(journalPrompt);
                        updateJournal(
                          "prompt",
                          journalPrompts[
                            (currentIndex + 1) % journalPrompts.length
                          ],
                        );
                      }}
                      title="Choose another reflection prompt"
                    >
                      Prompt: {journalPrompt} <Icon name="RotateCw" size={16} />
                    </button>
                    <button
                      type="button"
                      className="text-button journal-use-prompt"
                      onClick={() => {
                        const currentText = journal.text || "";
                        const separator =
                          currentText && !currentText.endsWith("\n")
                            ? "\n\n"
                            : "";
                        updateJournal(
                          "text",
                          `${currentText}${separator}${journalPrompt}\n`,
                        );
                      }}
                    >
                      Use prompt in entry
                    </button>
                    <span className="journal-save-indicator">{saveState}</span>
                  </div>
                  <p className="question">How are you feeling today?</p>
                  <div
                    className="moods"
                    role="group"
                    aria-label="Mood selection"
                  >
                    {MOOD_VALUES.map((mood, index) => {
                      const label = MOOD_LABELS[index];
                      return (
                        <button
                          className={journal.mood === mood ? "selected" : ""}
                          key={mood}
                          onClick={() =>
                            updateJournal(
                              "mood",
                              journal.mood === mood ? "" : mood,
                            )
                          }
                          aria-label={`Mood: ${label}`}
                          aria-pressed={journal.mood === mood}
                          title={label}
                        >
                          <Icon name={MOOD_ICONS[index]} size={24} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="energy">
                    <span>Energy</span>
                    <div
                      className="energy-bar"
                      role="group"
                      aria-label="Energy selection"
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          className={
                            (journal.energy || 0) >= level ? "active" : ""
                          }
                          key={level}
                          onClick={() =>
                            updateJournal(
                              "energy",
                              journal.energy === level ? null : level,
                            )
                          }
                          aria-label={`Energy ${level}`}
                          aria-pressed={(journal.energy || 0) === level}
                          title={`Energy ${level}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <span>
                      {journal.energy
                        ? ["Low", "Fair", "Good", "High", "Peak"][
                            journal.energy - 1
                          ]
                        : "Not rated"}
                    </span>
                  </div>
                  <div
                    className="journal-tags"
                    role="group"
                    aria-label="Journal tags"
                  >
                    <span>Optional tags</span>
                    {JOURNAL_TAGS.map((tag) => {
                      const selected = (journal.tags || []).includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          className={selected ? "selected" : ""}
                          aria-pressed={selected}
                          onClick={() =>
                            updateJournal(
                              "tags",
                              selected
                                ? journal.tags.filter((item) => item !== tag)
                                : [...(journal.tags || []), tag],
                            )
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <details className="journal-calendar-disclosure">
                    <summary>Mood calendar</summary>
                    <section
                      className="journal-mood-calendar"
                      aria-labelledby="journal-mood-calendar-title"
                    >
                      <div className="workout-subheading">
                        <div>
                          <h3 id="journal-mood-calendar-title">
                            Mood calendar
                          </h3>
                          <p>Choose a day to revisit its reflection.</p>
                        </div>
                      </div>
                      <div
                        className="mood-calendar-grid"
                        role="grid"
                        aria-label="Mood calendar for selected month"
                      >
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                          (day) => (
                            <span
                              className="mood-calendar-weekday"
                              role="columnheader"
                              key={day}
                            >
                              {day}
                            </span>
                          ),
                        )}
                        {(() => {
                          const base = dateFromKey(selectedDay || endKey);
                          const first = new Date(
                            base.getFullYear(),
                            base.getMonth(),
                            1,
                          );
                          const count = new Date(
                            base.getFullYear(),
                            base.getMonth() + 1,
                            0,
                          ).getDate();
                          const cells = Array.from(
                            { length: first.getDay() },
                            (_, index) => (
                              <span
                                className="mood-calendar-blank"
                                key={`blank-${index}`}
                              />
                            ),
                          );
                          for (let day = 1; day <= count; day += 1) {
                            const date = new Date(
                              base.getFullYear(),
                              base.getMonth(),
                              day,
                            );
                            const key = dateKey(date);
                            const mood = data.journal?.[key]?.mood || "";
                            const moodIndex = MOOD_VALUES.indexOf(mood);
                            const moodClass =
                              moodIndex >= 0 ? ` mood-${moodIndex + 1}` : "";
                            cells.push(
                              <button
                                type="button"
                                role="gridcell"
                                key={key}
                                className={`mood-calendar-day${moodClass}${key === selectedDay ? " selected" : ""}`}
                                aria-label={`${key}${moodIndex >= 0 ? `, mood ${MOOD_LABELS[moodIndex]}` : ", no mood logged"}`}
                                aria-pressed={key === selectedDay}
                                onClick={() => setSelectedDay(key)}
                                title={
                                  moodIndex >= 0
                                    ? `${key} · ${MOOD_LABELS[moodIndex]}`
                                    : key
                                }
                              >
                                <span>{day}</span>
                                {moodIndex >= 0 && (
                                  <Icon
                                    name={MOOD_ICONS[moodIndex]}
                                    size={16}
                                  />
                                )}
                              </button>,
                            );
                          }
                          return cells;
                        })()}
                      </div>
                    </section>
                  </details>
                  <input
                    className="journal-input"
                    value={journal.gratitude || ""}
                    onChange={(event) =>
                      updateJournal("gratitude", event.target.value)
                    }
                    placeholder="Today I'm grateful for..."
                  />
                  <textarea
                    id="journal-entry"
                    className="journal-input"
                    value={journal.text || ""}
                    onChange={(event) =>
                      updateJournal("text", event.target.value)
                    }
                    placeholder="A few words about today..."
                    aria-label="Journal entry"
                  />
                  <div className="journal-entry-summary">
                    <span>
                      {journalWordCount} words · {journalStreak}-day writing
                      streak
                    </span>
                  </div>
                  {onThisDayEntries.length > 0 && (
                    <details className="journal-on-this-day">
                      <summary>On this day</summary>
                      {onThisDayEntries.slice(0, 3).map(([key, entry]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setSelectedDay(key)}
                        >
                          <time dateTime={key}>{key}</time>
                          <span>
                            {entry.gratitude || entry.text.slice(0, 120)}
                          </span>
                        </button>
                      ))}
                    </details>
                  )}
                  <details className="journal-history-panel">
                    <summary className="journal-history-heading">
                      Recent journal entries
                    </summary>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search entries"
                      aria-label="Search journal entries"
                    />
                    {Object.entries(data.journal || {})
                      .filter(
                        ([key, entry]) =>
                          key <= endKey &&
                          (entry?.text ||
                            entry?.gratitude ||
                            entry?.mood ||
                            entry?.energy ||
                            entry?.tags?.length),
                      )
                      .sort(([a], [b]) => b.localeCompare(a))
                      .filter(([key, entry]) => {
                        const haystack =
                          `${key} ${entry?.mood || ""} ${entry?.gratitude || ""} ${entry?.text || ""} ${(entry?.tags || []).join(" ")}`.toLowerCase();
                        return haystack.includes(search.toLowerCase());
                      })
                      .slice(0, 8)
                      .map(([key, entry]) => (
                        <button
                          type="button"
                          className="journal-history-entry"
                          key={key}
                          onClick={() => setSelectedDay(key)}
                        >
                          <strong>{key === endKey ? "Today" : key}</strong>
                          <small>
                            {entry.mood || "—"} ·{" "}
                            {entry.energy
                              ? `Energy ${entry.energy}/5`
                              : "Energy not rated"}
                          </small>
                          {!!entry.tags?.length && (
                            <span>{entry.tags.join(" · ")}</span>
                          )}
                          {entry.gratitude && <span>{entry.gratitude}</span>}
                        </button>
                      ))}
                  </details>
                </div>
                <details className="journal-wellness-disclosure">
                  <summary>Wellness</summary>
                  <WellnessCard
                    wellness={data.wellness}
                    onUpdate={updateWellness}
                    journal={data.journal}
                    workout={data.workout}
                    onRequestReminders={requestReminderPermission}
                  />
                </details>
              </>
            )}
          </section>
        )}
        {section === "insights" && (
          <section className="single-page page-view">
            <InsightsPanel
              habits={data.habits}
              weeklyDone={weeklyDone}
              weeklyTarget={weeklyTarget}
              best={best}
              bestUnit={bestUnit}
              journal={journal}
              journalEntries={data.journal}
              study={studyForDisplay}
              workout={data.workout}
              wellness={data.wellness}
              learning={data.learning}
              tasks={data.tasks}
              quarterlyGoal={data.settings.quarterlyGoal}
              onQuarterlyGoalUpdate={updateQuarterlyGoal}
            />
          </section>
        )}
        <footer>
          <span>daymark</span>
          <span>Your personal dashboard.</span>
        </footer>
      </main>
      {editing && (
        <EditModal
          habit={editing}
          habits={data.habits}
          onClose={() => setEditing(null)}
          onRequestReminders={requestReminderPermission}
          onSnooze={snoozeHabitReminder}
          onSave={(patch) => {
            save(
              {
                ...data,
                habits: data.habits.map((habit) => {
                  if (habit.id !== editing.id) return habit;
                  const updatedHabit = { ...habit, ...patch };
                  if (habit.paused && !patch.paused && habit.pausedAt) {
                    const pausedThrough =
                      patch.pauseUntil && patch.pauseUntil < endKey
                        ? patch.pauseUntil
                        : endKey;
                    const resumeDate = dateFromKey(pausedThrough);
                    resumeDate.setDate(resumeDate.getDate() + 1);
                    updatedHabit.days = fillPausedScheduleDays(
                      updatedHabit,
                      habit.pausedAt,
                      dateKey(resumeDate),
                    );
                  }
                  return updatedHabit;
                }),
              },
              "Habit updated",
            );
            setEditing(null);
          }}
          onDelete={() => {
            deleteHabit(editing.id);
            setEditing(null);
          }}
        />
      )}
      {profileEditing && (
        <div
          className="modal-backdrop profile-modal-backdrop"
          onClick={() => setProfileEditing(false)}
        >
          <form
            className="edit-modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onSubmit={(event) => {
              event.preventDefault();
              save(
                {
                  ...data,
                  profile: {
                    ...data.profile,
                    name: new FormData(event.currentTarget).get("name"),
                    icon: profileIcon,
                  },
                },
                "Profile updated",
              );
              setProfileEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setProfileEditing(false);
                return;
              }
              trapDialogFocus(event);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h2 id="profile-title">Your profile</h2>
              <button
                type="button"
                className="close"
                onClick={() => setProfileEditing(false)}
                aria-label="Close profile dialog"
                title="Close profile dialog"
              >
                <Icon name="X" size={18} />
              </button>
            </div>
            <label>
              Name
              <input name="name" defaultValue={data.profile.name} autoFocus />
            </label>
            <div className="profile-icon-preview" aria-live="polite">
              <span className="avatar">
                <Icon name={profileIcon} size={20} />
              </span>
              <span>
                <strong>Profile preview</strong>
                <small>Your selected icon</small>
              </span>
            </div>
            <div
              className="profile-icon-picker"
              role="group"
              aria-label="Choose profile icon"
            >
              <span>Choose your profile icon</span>
              <div>
                {PROFILE_ICONS.map(([icon, label]) => (
                  <button
                    type="button"
                    key={icon}
                    className={profileIcon === icon ? "selected" : ""}
                    onClick={() => setProfileIcon(icon)}
                    aria-label={label}
                    aria-pressed={profileIcon === icon}
                    title={label}
                  >
                    <Icon name={icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="accent-picker">
              <span>Color theme</span>
              <div>
                {THEME_PRESETS.map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={data.settings.accent === value ? "selected" : ""}
                    style={{ "--swatch": value }}
                    onClick={() =>
                      save(
                        {
                          ...data,
                          settings: { ...data.settings, accent: value },
                        },
                        `${label} theme applied`,
                      )
                    }
                    aria-label={`${label} theme`}
                    title={`${label} theme`}
                    aria-pressed={data.settings.accent === value}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setProfileEditing(false);
                  setResetConfirmOpen(true);
                }}
              >
                Reset all data
              </button>
              <button className="primary-btn">Save profile</button>
            </div>
          </form>
        </div>
      )}
      {pendingBackup && (
        <div className="modal-backdrop" onClick={() => setPendingBackup(null)}>
          <section
            className="edit-modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-import-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setPendingBackup(null);
                return;
              }
              trapDialogFocus(event);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">BACKUP PREVIEW</p>
                <h2 id="backup-import-title">Replace this Daymark data?</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setPendingBackup(null)}
                aria-label="Close backup preview"
                title="Close backup preview"
                autoFocus
              >
                <Icon name="X" size={18} />
              </button>
            </div>
            <p>This will replace your current data with the selected backup.</p>
            <ul className="backup-preview-counts">
              <li>{pendingBackup.counts.habits} habits</li>
              <li>{pendingBackup.counts.tasks} tasks</li>
              <li>{pendingBackup.counts.cards} flashcards</li>
              <li>{pendingBackup.counts.classes} classes</li>
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="subtle-btn"
                onClick={() => setPendingBackup(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={confirmBackupImport}
              >
                Confirm import
              </button>
            </div>
          </section>
        </div>
      )}
      {resetConfirmOpen && (
        <div
          className="modal-backdrop reset-confirm-backdrop"
          onClick={() => setResetConfirmOpen(false)}
        >
          <section
            className="edit-modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setResetConfirmOpen(false);
                return;
              }
              trapDialogFocus(event);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">THIS CANNOT BE UNDONE</p>
                <h2 id="reset-title">Reset all Daymark data?</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setResetConfirmOpen(false)}
                aria-label="Close reset dialog"
                title="Close reset dialog"
                autoFocus
              >
                <Icon name="X" size={18} />
              </button>
            </div>
            <p>
              Your habits, tasks, study history, notes, and settings will be
              cleared from this device.
            </p>
            <ul className="backup-preview-counts">
              <li>{data.habits.length} habits</li>
              <li>{data.tasks.length} tasks</li>
              <li>{data.study.flashcards.length} flashcards</li>
              <li>{data.study.classes.length} classes</li>
            </ul>
            <div className="modal-actions">
              <button type="button" className="subtle-btn" onClick={exportData}>
                Export backup first
              </button>
              <button type="button" className="danger" onClick={resetAllData}>
                Reset data
              </button>
            </div>
          </section>
        </div>
      )}
      {onboardingOpen && (
        <div className="modal-backdrop onboarding-backdrop">
          <form
            className="edit-modal onboarding-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                dismissOnboarding();
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = [
                ...event.currentTarget.querySelectorAll(
                  "input:not([disabled]), button:not([disabled])",
                ),
              ];
              if (!focusable.length) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const profileName = onboardingName.trim();
              save(
                {
                  ...data,
                  profile: {
                    ...data.profile,
                    name: profileName || data.profile.name,
                    icon: onboardingIcon,
                  },
                  settings: { ...data.settings, accent: onboardingAccent },
                },
                "Welcome to Daymark",
              );
              dismissOnboarding();
            }}
          >
            <p className="eyebrow">A FRESH START</p>
            <h2 id="onboarding-title">Make Daymark yours.</h2>
            <p>
              Track habits, learning, study, and wellness in one calm space.
              Your data stays on this device.
            </p>
            <label>
              What should we call you?
              <input
                autoFocus
                value={onboardingName}
                onChange={(event) => setOnboardingName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <div
              className="profile-icon-picker onboarding-icon-picker"
              role="group"
              aria-label="Choose your profile icon"
            >
              <span>Choose your profile icon</span>
              <div>
                {PROFILE_ICONS.map(([icon, label]) => (
                  <button
                    type="button"
                    key={icon}
                    className={onboardingIcon === icon ? "selected" : ""}
                    onClick={() => setOnboardingIcon(icon)}
                    aria-label={label}
                    aria-pressed={onboardingIcon === icon}
                    title={label}
                  >
                    <Icon name={icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="accent-picker onboarding-accent-picker">
              <span>Color theme</span>
              <div role="group" aria-label="Choose a color theme">
                {THEME_PRESETS.map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={onboardingAccent === value ? "selected" : ""}
                    style={{ "--swatch": value }}
                    onClick={() => setOnboardingAccent(value)}
                    aria-label={`${label} theme`}
                    aria-pressed={onboardingAccent === value}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  dismissOnboarding();
                }}
              >
                Not now
              </button>
              <button className="primary-btn">Get started</button>
            </div>
          </form>
        </div>
      )}
      {toastText && (
        <div className="toast" role="status">
          {toastText}
          {toastAction && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const action = toastAction;
                setToastText("");
                setToastAction(null);
                window.clearTimeout(toastTimerRef.current);
                action.onClick();
              }}
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}
      {commandOpen && (
        <GlobalSearchPalette
          data={data}
          query={search}
          onQueryChange={setSearch}
          onClose={() => {
            setCommandOpen(false);
            setSearch("");
          }}
          onNavigate={nav}
          onAction={(action) => {
            if (action === "study")
              startStudyFromDashboard(
                performance.timeOrigin + performance.now(),
              );
            if (action === "journal") openJournalFromDashboard();
            if (action === "workout") nav("workout");
            if (action === "habit") {
              nav("habits");
              window.setTimeout(
                () => document.getElementById("habit-name")?.focus(),
                0,
              );
            }
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  habit,
  habits,
  onClose,
  onSave,
  onDelete,
  onRequestReminders,
  onSnooze,
}) {
  const [patch, setPatch] = useState({
    name: habit.name,
    icon: normalizeHabitIcon(habit.icon),
    goal: habit.goal,
    allowance: habit.allowance,
    scheduleDays: getHabitScheduleDays(habit),
    paused: isHabitPausedOnDate(habit, todayKey()),
    pausedAt: habit.pausedAt || "",
    pauseUntil: /^\d{4}-\d{2}-\d{2}$/.test(habit.pauseUntil || "")
      ? habit.pauseUntil
      : "",
    color: habit.color,
    note: habit.note || "",
    reminderEnabled: Boolean(habit.reminderEnabled),
    reminderTime: habit.reminderTime || "09:00",
    reminderTimeZone: habit.reminderTimeZone || DEVICE_TIME_ZONE,
    reminderQuietEnabled: Boolean(habit.reminderQuietEnabled),
    reminderQuietStart: habit.reminderQuietStart || "22:00",
    reminderQuietEnd: habit.reminderQuietEnd || "07:00",
    startDate: habit.startDate || todayKey(),
    flexibleWeekly: Boolean(habit.flexibleWeekly),
    numericTarget: habit.numericTarget || "",
    numericUnit: habit.numericUnit || "",
    stackAfter: habit.stackAfter || "",
    minimumVersion: habit.minimumVersion || "",
    group: habit.group || "Anytime",
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="edit-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...patch,
            goal: patch.flexibleWeekly
              ? Math.min(7, Math.max(1, Number(patch.goal) || 1))
              : patch.scheduleDays.length,
            scheduleDays: patch.flexibleWeekly
              ? [...WEEKDAYS]
              : patch.scheduleDays,
            allowance: 1,
            numericTarget: Math.max(0, Number(patch.numericTarget) || 0),
            stackAfter: patch.stackAfter.trim(),
          });
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>Edit habit</h2>
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Close edit habit dialog"
            title="Close edit habit dialog"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <label>
          Name
          <input
            value={patch.name}
            onChange={(event) =>
              setPatch({ ...patch, name: event.target.value })
            }
          />
        </label>
        <fieldset className="habit-icon-picker" aria-label="Choose habit icon">
          <legend>Habit icon</legend>
          <div>
            {HABIT_ICONS.map((icon) => (
              <button
                type="button"
                key={icon}
                className={patch.icon === icon ? "selected" : ""}
                onClick={() => setPatch({ ...patch, icon })}
                aria-label={icon.replaceAll("-", " ")}
                aria-pressed={patch.icon === icon}
                title={icon.replaceAll("-", " ")}
              >
                <Icon name={icon} size={20} />
              </button>
            ))}
          </div>
        </fieldset>
        <label className="toggle-label">
          <span>Flexible weekly goal · any days</span>
          <input
            type="checkbox"
            checked={patch.flexibleWeekly}
            onChange={(event) =>
              setPatch({
                ...patch,
                flexibleWeekly: event.target.checked,
                goal: event.target.checked
                  ? Math.max(1, Number(patch.goal) || 3)
                  : patch.scheduleDays.length,
                scheduleDays: event.target.checked
                  ? [...WEEKDAYS]
                  : patch.scheduleDays,
              })
            }
          />
        </label>
        {patch.flexibleWeekly && (
          <label>
            Times per week
            <input
              type="number"
              min="1"
              max="7"
              value={patch.goal}
              onChange={(event) =>
                setPatch({
                  ...patch,
                  goal: Math.max(
                    1,
                    Math.min(7, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>
        )}
        {!patch.flexibleWeekly && (
          <fieldset className="habit-schedule-picker">
            <legend>
              Routine days · {7 - patch.scheduleDays.length} rest{" "}
              {7 - patch.scheduleDays.length === 1 ? "day" : "days"}
            </legend>
            <div>
              {WEEKDAYS.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={patch.scheduleDays.includes(day)}
                    onChange={(event) => {
                      const scheduleDays = event.target.checked
                        ? WEEKDAYS.filter(
                            (item) =>
                              patch.scheduleDays.includes(item) || item === day,
                          )
                        : patch.scheduleDays.filter((item) => item !== day);
                      if (scheduleDays.length)
                        setPatch({
                          ...patch,
                          scheduleDays,
                          goal: scheduleDays.length,
                        });
                    }}
                  />
                  <span>{day.slice(0, 3)}</span>
                </label>
              ))}
            </div>
            <small>
              Select the days you want to practice. Unselected days are your
              planned rest days.
            </small>
          </fieldset>
        )}
        <label>
          Daily quantity target (optional)
          <input
            type="number"
            min="0"
            step="any"
            value={patch.numericTarget}
            onChange={(event) =>
              setPatch({ ...patch, numericTarget: event.target.value })
            }
            placeholder="e.g. 8 glasses or 30 pages"
          />
        </label>
        <label>
          Quantity unit
          <input
            value={patch.numericUnit}
            onChange={(event) =>
              setPatch({ ...patch, numericUnit: event.target.value })
            }
            placeholder="glasses, pages, minutes…"
          />
        </label>
        <label>
          Minimum version
          <input
            value={patch.minimumVersion}
            onChange={(event) =>
              setPatch({ ...patch, minimumVersion: event.target.value })
            }
            maxLength={80}
            placeholder="e.g. Read 2 pages"
          />
        </label>
        <label>
          Habit group
          <select
            value={patch.group}
            onChange={(event) =>
              setPatch({ ...patch, group: event.target.value })
            }
          >
            <option>Anytime</option>
            <option>Morning</option>
            <option>Evening</option>
            <option>School</option>
          </select>
        </label>
        <label>
          Stack after (optional)
          <select
            value={patch.stackAfter}
            onChange={(event) =>
              setPatch({ ...patch, stackAfter: event.target.value })
            }
          >
            <option value="">No linked habit</option>
            {habits
              .filter((item) => item.id !== habit.id && !item.archived)
              .map((item) => (
                <option value={item.name} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <small className="habit-freeze-note">
          One streak freeze is available per calendar month; missed days beyond
          that will end the streak.
        </small>
        <label>
          Habit note
          <input
            value={patch.note}
            onChange={(event) =>
              setPatch({ ...patch, note: event.target.value })
            }
            placeholder="Why this matters to you"
          />
        </label>
        <label className="toggle-label">
          <span>Pause this habit</span>
          <input
            type="checkbox"
            checked={patch.paused}
            onChange={(event) => {
              const paused = event.target.checked;
              setPatch({
                ...patch,
                paused,
                pausedAt: paused ? todayKey() : "",
                pauseUntil: "",
              });
            }}
          />
        </label>
        <small className="habit-pause-note">
          Paused habits won’t appear in daily check-ins or send reminders. Your
          streak is held until you resume.
        </small>
        {patch.paused && (
          <label>
            Pause until (optional)
            <input
              type="date"
              min={patch.pausedAt || todayKey()}
              value={patch.pauseUntil}
              onChange={(event) =>
                setPatch({ ...patch, pauseUntil: event.target.value })
              }
            />
            <small>
              Leave blank to pause indefinitely. The habit resumes automatically
              after this date.
            </small>
          </label>
        )}
        <label className="toggle-label">
          <span>Reminder</span>
          <input
            type="checkbox"
            checked={patch.reminderEnabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setPatch({ ...patch, reminderEnabled: enabled });
              if (enabled) onRequestReminders();
            }}
          />
        </label>
        {patch.reminderEnabled && (
          <>
            <label>
              Reminder time
              <input
                type="time"
                value={patch.reminderTime}
                onChange={(event) =>
                  setPatch({ ...patch, reminderTime: event.target.value })
                }
              />
            </label>
            <label>
              Time zone
              <select
                value={patch.reminderTimeZone}
                onChange={(event) =>
                  setPatch({ ...patch, reminderTimeZone: event.target.value })
                }
              >
                {[
                  ...new Set([...TIME_ZONE_OPTIONS, patch.reminderTimeZone]),
                ].map((zone) => (
                  <option value={zone} key={zone}>
                    {zone}
                    {zone === DEVICE_TIME_ZONE ? " (device)" : ""}
                  </option>
                ))}
              </select>
              <small>
                Reminder time follows this time zone, even while traveling.
              </small>
            </label>
            <label className="toggle-label">
              <span>Quiet hours</span>
              <input
                type="checkbox"
                checked={patch.reminderQuietEnabled}
                onChange={(event) =>
                  setPatch({
                    ...patch,
                    reminderQuietEnabled: event.target.checked,
                  })
                }
              />
            </label>
            {patch.reminderQuietEnabled && (
              <div className="quiet-hours-fields">
                <label>
                  From
                  <input
                    type="time"
                    value={patch.reminderQuietStart}
                    onChange={(event) =>
                      setPatch({
                        ...patch,
                        reminderQuietStart: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Until
                  <input
                    type="time"
                    value={patch.reminderQuietEnd}
                    onChange={(event) =>
                      setPatch({
                        ...patch,
                        reminderQuietEnd: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              className="subtle-btn reminder-snooze"
              disabled={patch.paused}
              onClick={() => onSnooze(habit.id, Date.now())}
            >
              Snooze for 10 minutes
            </button>
          </>
        )}
        <label>
          Start date
          <input
            type="date"
            value={patch.startDate}
            onChange={(event) =>
              setPatch({ ...patch, startDate: event.target.value })
            }
          />
        </label>
        <div className="edit-colors">
          <span>Color</span>
          {COLORS.map((item) => (
            <button
              type="button"
              className={patch.color === item ? "chosen" : ""}
              key={item}
              style={{ background: item }}
              onClick={() => setPatch({ ...patch, color: item })}
              aria-label={`Choose ${item}`}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="subtle-btn" onClick={onDelete}>
            Archive
          </button>
          <button className="primary-btn">Save changes</button>
        </div>
      </form>
    </div>
  );
}
