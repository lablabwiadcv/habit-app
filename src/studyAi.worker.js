import { env, pipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/flan-t5-small";
const MAX_CHUNK_LENGTH = 600;
const MAX_CHUNKS = 40;
const COMMON_WORDS = new Set(
  "about after again all also an and any are as at be been before between both but by can did do does during each for from had has have how in into is it its may more most no not of on one or other our out over same some such than that the their them then there these they this those through to too under up use used using very was we were what when where which who why will with would you your".split(
    " ",
  ),
);

let generatorPromise;
let generationQueue = Promise.resolve();

env.useBrowserCache = true;

const isBrowserCacheAvailable = () =>
  typeof caches !== "undefined" && self.isSecureContext;

function splitIntoChunks(text) {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g) || [];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (current && current.length + clean.length + 1 > MAX_CHUNK_LENGTH) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${clean}` : clean;
  }
  if (current) chunks.push(current);
  return chunks;
}

function contentWords(text) {
  return (
    text
      .toLowerCase()
      .match(/[a-z][a-z'-]{2,}/g)
      ?.filter((word) => !COMMON_WORDS.has(word)) || []
  );
}

function isCompleteFact(text) {
  return /\b(?:is|are|was|were|has|have|use|uses|produce|produces|store|stores|absorb|absorbs|contain|contains|convert|converts|require|requires|occur|occurs|happen|happens|takes place|means|refers to)\b/i.test(
    text,
  );
}

function isGrounded(text, source) {
  const words = contentWords(text);
  if (!words.length) return false;
  const sourceWords = new Set(contentWords(source));
  const matches = words.filter(
    (word) =>
      sourceWords.has(word) ||
      (word.endsWith("s") && sourceWords.has(word.slice(0, -1))) ||
      sourceWords.has(`${word}s`),
  ).length;
  return matches >= Math.min(2, words.length) && matches / words.length >= 0.95;
}

function questionFromFact(fact, source) {
  const usePattern = fact.match(
    /^(?:during|in)\s+([^,]+),\s*(.+?)\s+(use|uses)\s+(.+?)\s+to\s+(produce|make|create|build)\s+(.+?)[.!?]?$/i,
  );
  if (usePattern) {
    const [, context, subject, use, resource, action, result] = usePattern;
    const auxiliary = use.toLowerCase() === "uses" ? "does" : "do";
    return {
      question: `What ${auxiliary} ${subject} use to ${action} ${result} during ${context}?`,
      answer: resource,
    };
  }

  const locationPattern = fact.match(
    /^(.+?)\s+(takes place|occur|occurs|happen|happens)\s+(?:in|at|during)\s+(.+?)[.!?]?$/i,
  );
  if (locationPattern) {
    const [, rawSubject, verb] = locationPattern;
    const subject = rawSubject
      .trim()
      .replace(/^(the|a|an)\b/i, (article) => article.toLowerCase());
    const plural = subject.trim().endsWith("s");
    const verbText = verb.toLowerCase();
    const action = verbText.includes("place")
      ? "take place"
      : verbText.startsWith("occur")
        ? "occur"
        : "happen";
    const location = locationPattern[3]
      .replace(
        /\s+and\s+(?:produce|produces|create|creates|make|makes|release|releases)\b.*$/i,
        "",
      )
      .replace(/[.!?]+$/, "");
    return {
      question: `Where ${plural ? "do" : "does"} ${subject} ${action}?`,
      answer: location,
    };
  }

  const definitionPattern = fact.match(
    /^([^,.]{2,70}?)\s+(?:is|are|means|refers to)\s+(.+?)[.!?]?$/i,
  );
  if (definitionPattern) {
    const [, term, definition] = definitionPattern;
    const rawTerm = term.trim();
    const hasSourceArticle = source
      .toLowerCase()
      .includes(rawTerm.toLowerCase());
    const normalizedTerm = rawTerm.replace(/^(a|an|the)\s+/i, (article) =>
      hasSourceArticle ? `${article.toLowerCase()} ` : "",
    );
    return {
      question: `What is ${normalizedTerm}?`,
      answer: definition.replace(/^(?:a|an|the)\s+/i, ""),
    };
  }

  const subjectVerbPattern = fact.match(
    /^(?:([^,]+),.*?\b|(.+?)\s+)(absorbs?|stores?|produces?|contains?|converts?|requires?)\s+(.+?)[.!?]?$/i,
  );
  if (subjectVerbPattern) {
    const subject = (subjectVerbPattern[1] || subjectVerbPattern[2])
      .trim()
      .replace(/^(the|a|an)\b/i, (article) => article.toLowerCase());
    const verb = subjectVerbPattern[3].toLowerCase();
    const object = subjectVerbPattern[4];
    const baseVerb = verb.endsWith("s") ? verb.slice(0, -1) : verb;
    return {
      question: `What does ${subject} ${baseVerb}?`,
      answer: object,
    };
  }

  const mainClause = fact.replace(/^(?:during|in|at)\s+[^,]+,\s*/i, "");
  const subject = mainClause.match(
    /^(.{2,50}?)\s+(?:is|are|use|uses|produce|produces|store|stores|absorb|absorbs|occur|occurs|means)\b/i,
  )?.[1];
  const term = subject?.trim() || mainClause.split(/\s+/).slice(0, 3).join(" ");
  return {
    question: `What is one important fact about ${term}?`,
    answer: fact,
  };
}

async function generateCards({ id, text, count = 10 }) {
  if (!isBrowserCacheAvailable()) {
    env.useBrowserCache = false;
    self.postMessage({
      id,
      type: "warning",
      message: "AI cards need localhost or HTTPS. Open the app at localhost or an https address.",
    });
  }
  const chunks = splitIntoChunks(text);
  if (!chunks.length) throw new Error("No readable study text was found.");

  const targetCount = Math.min(50, Math.max(1, Math.round(Number(count) || 10)));
  const usedChunks = chunks.slice(0, MAX_CHUNKS);
  const truncated = chunks.length > usedChunks.length;
  const cards = [];
  const seen = new Set();
  if (!generatorPromise) {
    generatorPromise = pipeline("text2text-generation", MODEL_ID, {
      progress_callback: (progress) => {
        const percentage = Number.isFinite(progress.progress)
          ? ` ${Math.round(progress.progress)}%`
          : "";
        self.postMessage({
          id,
          type: "progress",
          message:
            progress.status === "progress"
              ? `Downloading the on-device AI model…${percentage}`
              : "Loading the on-device AI model…",
        });
      },
    }).catch((error) => {
      generatorPromise = undefined;
      throw error;
    });
  }
  const generator = await generatorPromise;

  for (let index = 0; index < usedChunks.length && cards.length < targetCount; index += 1) {
    self.postMessage({
      id,
      type: "progress",
      message: `Creating questions from your notes… ${index + 1} of ${usedChunks.length}`,
    });
    const notes = usedChunks[index];
    const factResult = await generator(
      `State up to ${Math.min(3, targetCount - cards.length)} distinct important facts from these notes. Put each complete fact on a separate line. Use only information in the notes. Notes: ${notes}`,
      {
        max_new_tokens: 160,
        do_sample: false,
      },
    );
    const generatedFacts = (factResult[0]?.generated_text || "")
      .split(/\n+|(?<=[.!?])\s+|;\s+/)
      .map((candidate) => candidate.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const sourceSentences = notes.match(/[^.!?]+[.!?]?/g) || [];
    const facts = [...generatedFacts, ...sourceSentences]
      .map((candidate) => candidate.trim())
      .filter(
        (candidate) =>
          candidate.length >= 8 &&
          candidate.length <= 500 &&
          isCompleteFact(candidate) &&
          isGrounded(candidate, notes),
      );
    let cardsForChunk = 0;
    for (const fact of facts) {
      const generatedCard = questionFromFact(fact, notes);
      const cleanQuestion = generatedCard.question.replace(/[.!?]+$/, "");
      const key = cleanQuestion.toLowerCase();
      if (cleanQuestion.length > 8 && cleanQuestion.length <= 240 && !seen.has(key) && cards.length < targetCount) {
        seen.add(key);
        cards.push({
          question: `${cleanQuestion}?`,
          answer: generatedCard.answer.slice(0, 500),
        });
        cardsForChunk += 1;
        if (cardsForChunk === 3 || cards.length === targetCount) break;
      }
    }
  }

  if (!cards.length) {
    throw new Error(
      "The on-device model could not make clear questions. Try notes with a few complete sentences.",
    );
  }
  self.postMessage({ id, type: "complete", cards, truncated });
}

self.onmessage = ({ data }) => {
  generationQueue = generationQueue
    .then(() => generateCards(data))
    .catch((error) => {
      const message = error instanceof Error
        ? error.message
        : String(error || "The on-device AI could not generate questions.");
      const failedToLoadModel = error instanceof TypeError ||
        /cache|fetch|failed to load/i.test(message);
      self.postMessage({
        id: data.id,
        type: "error",
        message: failedToLoadModel
          ? "AI cards need localhost or HTTPS. Open the app at localhost or an https address."
          : message,
      });
    });
};
