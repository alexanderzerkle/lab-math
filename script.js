const QUIZ_LENGTH_SECONDS = 10 * 60;
const CORRECT_FEEDBACK_DURATION_MS = 1000;
const INCORRECT_FEEDBACK_DURATION_MS = 2000;

let problems = [];
let currentIndex = 0;
let score = 0;
let incorrectAnswers = 0;
let timeLeft = QUIZ_LENGTH_SECONDS;
let gameOver = false;
let isPaused = false;
let timerInterval = null;
let feedbackTimeout = null;
let acceptingAnswer = false;
let feedbackVersion = 0;
let questionResults = [];
let attemptId = null;

const questionEl = document.getElementById("question");
const categoryEl = document.getElementById("category");
const quizAreaEl = document.getElementById("quiz-area");
const answerAreaEl = document.getElementById("answer-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const reportEl = document.getElementById("report");
const submitBtn = document.getElementById("submit");
const startBtn = document.getElementById("start");
const tryAgainBtn = document.getElementById("try-again");
const pauseBtn = document.getElementById("pause");
const toggleTimerBtn = document.getElementById("toggle-timer");
const giveUpBtn = document.getElementById("give-up");
const sideControlsEl = document.querySelector(".side-controls");
const STATS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz3SgNm0MKBL9DWFPyGj_-l2fWCh-039_VnrE-pcJL8H9u9tp92teh6h92AK57TkIzGFA/exec";

submitBtn.disabled = true;
quizAreaEl.style.display = "block";
answerAreaEl.style.display = "none";
submitBtn.style.display = "none";
sideControlsEl.style.display = "none";
pauseBtn.disabled = true;
giveUpBtn.disabled = true;
questionEl.textContent = "Press Start to begin.";
categoryEl.textContent = "";
timerEl.textContent = `Time: ${formatTime(timeLeft)}`;
scoreEl.textContent = "Score: 0";

function formatTime(seconds) {
  if (seconds > 59) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

function normalizeAnswer(value) {
  return String(value)
    .trim()
    .replace(/,/g, "")
    .replace(/^(-?)0+\./, "$1.")
    .replace(/\s+/g, " ")
    .replace(/−/g, "-")
    .replace(/×/g, "x")
    .toLowerCase();
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }

      row.push(value.trim());

      if (row.some(cell => cell !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());

  if (row.some(cell => cell !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseCsv(text) {
  const rows = parseCsvRows(text);

  if (rows.length < 2) return [];

  const headers = rows[0].map(header => header.trim().toLowerCase());
  const indexOf = name => headers.indexOf(name.toLowerCase());

  const indexes = {
    questionId: indexOf("questionId"),
    category: indexOf("category"),
    question: indexOf("question"),
    answer1: indexOf("answer1"),
    static1: indexOf("static1"),
    answer2: indexOf("answer2"),
    static2: indexOf("static2")
  };

  if (indexes.questionId < 0 || indexes.category < 0 || indexes.question < 0 || indexes.answer1 < 0) {
    throw new Error("Published problems sheet is missing questionId, category, question, or answer1 columns");
  }

  return rows.slice(1).map(columns => ({
    questionId: columns[indexes.questionId] ?? "",
    category: columns[indexes.category] ?? "Uncategorized",
    question: columns[indexes.question] ?? "",
    answer1: columns[indexes.answer1] ?? "",
    static1: indexes.static1 >= 0 ? (columns[indexes.static1] ?? "") : "",
    answer2: indexes.answer2 >= 0 ? (columns[indexes.answer2] ?? "") : "",
    static2: indexes.static2 >= 0 ? (columns[indexes.static2] ?? "") : ""
  })).filter(problem => problem.questionId && problem.question && problem.answer1);
}

function shuffleProblems(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

function createAnswerInput(id, placeholder) {
  const input = document.createElement("input");
  input.id = id;
  input.className = "answer-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";

  input.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      checkAnswer();
    }
  });

  return input;
}

function createStaticText(text) {
  const span = document.createElement("span");
  span.className = "static-answer-text";
  span.textContent = text;
  return span;
}

function renderAnswerArea(problem) {
  answerAreaEl.innerHTML = "";

  const answer1Input = createAnswerInput("answer1", "Answer");
  answerAreaEl.appendChild(answer1Input);

  if (problem.static1) {
    answerAreaEl.appendChild(createStaticText(problem.static1));
  }

  if (problem.answer2) {
    const answer2Input = createAnswerInput("answer2", "Answer");
    answerAreaEl.appendChild(answer2Input);
  }

  if (problem.static2) {
    answerAreaEl.appendChild(createStaticText(problem.static2));
  }

  answer1Input.focus();
}

function getCorrectAnswerText(problem) {
  return [problem.answer1, problem.static1, problem.answer2, problem.static2]
    .filter(part => part !== undefined && part !== null && String(part).trim() !== "")
    .map(part => String(part).trim())
    .join(" ");
}

function getUserAnswerText(problem, answer1Value, answer2Value) {
  return [answer1Value, problem.static1, problem.answer2 ? answer2Value : "", problem.static2]
    .filter(part => part !== undefined && part !== null && String(part).trim() !== "")
    .map(part => String(part).trim())
    .join(" ");
}

function getTotalAttempted() {
  return score + incorrectAnswers;
}

function updateScoreDisplay() {
  scoreEl.textContent = `Score: ${score}`;
}

function clearFeedback() {
  feedbackEl.textContent = "";
  feedbackEl.className = "";
}

function setFeedback(message, className) {
  feedbackEl.textContent = message;
  feedbackEl.className = className;
}

function clearPendingFeedbackTimeout() {
  if (feedbackTimeout !== null) {
    clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
  }
}

function clearFeedbackAfterDelay(duration) {
  clearPendingFeedbackTimeout();
  const thisFeedbackVersion = ++feedbackVersion;

  feedbackTimeout = setTimeout(function() {
    feedbackTimeout = null;

    if (!gameOver && !isPaused && thisFeedbackVersion === feedbackVersion) {
      clearFeedback();
    }
  }, duration);
}

function setInputsDisabled(disabled) {
  answerAreaEl.querySelectorAll("input").forEach(input => {
    input.disabled = disabled;
  });

  submitBtn.disabled = disabled || gameOver || isPaused;
}

function showProblem() {
  if (gameOver || isPaused) return;

  if (currentIndex >= problems.length) {
    endGame("Done!", "completed");
    return;
  }

  const problem = problems[currentIndex];
  categoryEl.textContent = `Category: ${problem.category}`;
  questionEl.textContent = problem.question;
  renderAnswerArea(problem);
  acceptingAnswer = true;
  setInputsDisabled(false);
}

async function loadProblems() {
  try {
    questionEl.textContent = "Loading problems...";
    categoryEl.textContent = "";

    const response = await fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTIeqsCRe0S_KkEFktfQtjuYQtcE2yA1Jybwa1jaH1dl5GOqt5gDQCqa6i8gpyKQP3ugoJYZ63rUQzO/pub?output=csv",
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Could not load problems.csv (${response.status})`);
    }

    const text = await response.text();
    problems = shuffleProblems(parseCsv(text));

    if (problems.length === 0) {
      throw new Error("Published problems sheet did not contain any valid problems");
    }

    submitBtn.disabled = false;
    pauseBtn.disabled = false;
    giveUpBtn.disabled = false;
    acceptingAnswer = true;
    startTimer();
    showProblem();
  } catch (error) {
    gameOver = true;
    categoryEl.textContent = "";
    questionEl.textContent = "Could not load quiz problems.";
    setFeedback(error.message, "incorrect-feedback");
    submitBtn.disabled = true;
    pauseBtn.disabled = true;
    giveUpBtn.disabled = true;
    setInputsDisabled(true);
    console.error(error);
  }
}

function createAttemptId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function startQuiz() {
  attemptId = createAttemptId();
  questionResults = [];
  startBtn.disabled = true;
  startBtn.style.display = "none";
  tryAgainBtn.style.display = "none";
  reportEl.style.display = "none";
  reportEl.innerHTML = "";
  sideControlsEl.style.display = "flex";
  quizAreaEl.style.display = "block";
  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";

  await loadProblems();
}

async function restartQuiz() {
  clearPendingFeedbackTimeout();

  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  problems = [];
  questionResults = [];
  attemptId = createAttemptId();
  currentIndex = 0;
  score = 0;
  incorrectAnswers = 0;
  timeLeft = QUIZ_LENGTH_SECONDS;
  gameOver = false;
  isPaused = false;
  acceptingAnswer = false;
  feedbackVersion++;

  updateScoreDisplay();
  timerEl.textContent = `Time: ${formatTime(timeLeft)}`;
  timerEl.style.visibility = "visible";
  toggleTimerBtn.textContent = "Hide Timer";
  pauseBtn.textContent = "Pause";
  categoryEl.textContent = "";
  clearFeedback();
  answerAreaEl.innerHTML = "";
  reportEl.innerHTML = "";
  reportEl.style.display = "none";
  tryAgainBtn.style.display = "none";
  sideControlsEl.style.display = "flex";
  quizAreaEl.style.display = "block";
  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";

  await loadProblems();
}

function checkAnswer() {
  if (gameOver || isPaused || problems.length === 0 || !acceptingAnswer) return;

  const problem = problems[currentIndex];
  const answer1Input = document.getElementById("answer1");
  const answer2Input = document.getElementById("answer2");
  const answer1Value = answer1Input?.value ?? "";
  const answer2Value = answer2Input?.value ?? "";

  const answer1Correct = normalizeAnswer(answer1Value) === normalizeAnswer(problem.answer1);
  const answer2Correct = !problem.answer2 || normalizeAnswer(answer2Value) === normalizeAnswer(problem.answer2);
  const isCorrect = answer1Correct && answer2Correct;

  questionResults.push({
    questionId: problem.questionId,
    category: problem.category,
    question: problem.question,
    correct: isCorrect,
    userAnswer: getUserAnswerText(problem, answer1Value, answer2Value),
    correctAnswer: getCorrectAnswerText(problem)
  });

  if (isCorrect) {
    score++;
    updateScoreDisplay();
    setFeedback("Correct", "correct-feedback");
    clearFeedbackAfterDelay(CORRECT_FEEDBACK_DURATION_MS);

    currentIndex++;
    showProblem();
    return;
  }

  incorrectAnswers++;
  updateScoreDisplay();

  acceptingAnswer = false;
  setInputsDisabled(true);
  setFeedback(`Correct answer: ${getCorrectAnswerText(problem)}`, "incorrect-feedback");
  clearPendingFeedbackTimeout();

  feedbackTimeout = setTimeout(function() {
    feedbackTimeout = null;

    if (gameOver) return;

    clearFeedback();
    currentIndex++;
    showProblem();
  }, INCORRECT_FEEDBACK_DURATION_MS);
}

function getElapsedSeconds() {
  return QUIZ_LENGTH_SECONDS - timeLeft;
}

function getCategoryPerformance() {
  const performance = {};

  questionResults.forEach(result => {
    const category = result.category || "Uncategorized";

    if (!performance[category]) {
      performance[category] = { category, correct: 0, attempted: 0, accuracy: 0 };
    }

    performance[category].attempted++;
    if (result.correct) performance[category].correct++;
  });

  return Object.values(performance)
    .map(item => ({
      ...item,
      accuracy: item.attempted > 0 ? Number(((item.correct / item.attempted) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function saveStatsToGoogleSheet(stats) {
  fetch(STATS_WEB_APP_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain"
    },
    body: JSON.stringify(stats)
  }).catch(error => {
    console.error("Could not save stats:", error);
  });
}

function appendTextElement(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

function renderQuestionList(title, results, showCorrectAnswer) {
  const section = document.createElement("section");
  section.className = "report-section";
  appendTextElement(section, "h3", title);

  if (results.length === 0) {
    appendTextElement(section, "p", "None");
    return section;
  }

  const list = document.createElement("ol");
  list.className = "report-list";

  results.forEach(result => {
    const item = document.createElement("li");
    appendTextElement(item, "strong", `${result.questionId} — ${result.category}`);
    appendTextElement(item, "span", result.question, "report-detail");
    appendTextElement(item, "span", `Your answer: ${result.userAnswer || "(blank)"}`, "report-detail");

    if (showCorrectAnswer) {
      appendTextElement(item, "span", `Correct answer: ${result.correctAnswer}`, "report-detail");
    }

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function renderDetailedReport(message, elapsedSeconds, accuracy, secondsPerCorrect, categoryPerformance) {
  reportEl.innerHTML = "";
  reportEl.style.display = "block";

  appendTextElement(reportEl, "h2", message);

  const summary = document.createElement("section");
  summary.className = "report-summary";
  appendTextElement(summary, "p", `Total correct: ${score}`);
  appendTextElement(summary, "p", `Total attempted: ${getTotalAttempted()}`);
  appendTextElement(summary, "p", `Accuracy: ${accuracy}%`);
  appendTextElement(summary, "p", `Time elapsed: ${formatTime(elapsedSeconds)}`);
  appendTextElement(summary, "p", `Seconds per correct answer: ${secondsPerCorrect}`);
  reportEl.appendChild(summary);

  const categorySection = document.createElement("section");
  categorySection.className = "report-section";
  appendTextElement(categorySection, "h3", "Performance by category");

  if (categoryPerformance.length === 0) {
    appendTextElement(categorySection, "p", "No questions were attempted.");
  } else {
    const categoryList = document.createElement("ul");
    categoryList.className = "report-list";
    categoryPerformance.forEach(item => {
      appendTextElement(
        categoryList,
        "li",
        `${item.category}: ${item.correct}/${item.attempted} correct (${item.accuracy}%)`
      );
    });
    categorySection.appendChild(categoryList);
  }

  reportEl.appendChild(categorySection);
  reportEl.appendChild(renderQuestionList("Answered correctly", questionResults.filter(result => result.correct), false));
  reportEl.appendChild(renderQuestionList("Answered incorrectly", questionResults.filter(result => !result.correct), true));
}

function endGame(message, endedBy = "unknown") {
  if (gameOver) return;

  gameOver = true;
  acceptingAnswer = false;
  isPaused = false;

  clearPendingFeedbackTimeout();

  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const elapsedSeconds = getElapsedSeconds();
  const totalAttempted = getTotalAttempted();
  const accuracy = totalAttempted > 0 ? ((score / totalAttempted) * 100).toFixed(1) : "0.0";
  const secondsPerCorrect = score > 0 ? (elapsedSeconds / score).toFixed(1) : "N/A";
  const categoryPerformance = getCategoryPerformance();

  saveStatsToGoogleSheet({
    attemptId,
    endedBy,
    totalCorrect: score,
    totalAttempted,
    accuracy: `${accuracy}%`,
    timeElapsed: formatTime(elapsedSeconds),
    elapsedSeconds,
    secondsPerCorrectAnswer: secondsPerCorrect,
    categoryPerformance,
    questionResults
  });

  categoryEl.textContent = "";
  questionEl.textContent = "";
  feedbackEl.textContent = "";
  feedbackEl.className = "";
  renderDetailedReport(message, elapsedSeconds, accuracy, secondsPerCorrect, categoryPerformance);

  quizAreaEl.style.display = "none";
  answerAreaEl.style.display = "none";
  submitBtn.style.display = "none";
  sideControlsEl.style.display = "none";
  tryAgainBtn.style.display = "inline-block";
  pauseBtn.disabled = true;
  giveUpBtn.disabled = true;
}

function startTimer() {
  if (timerInterval !== null) return;

  timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

  timerInterval = setInterval(function() {
    if (gameOver || isPaused) return;

    timeLeft--;
    timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

    if (timeLeft <= 0) {
      timeLeft = 0;
      timerEl.textContent = "Time: 0s";
      endGame("Time's up!", "timeout");
    }
  }, 1000);
}

function toggleTimerVisibility() {
  const isHidden = timerEl.style.visibility === "hidden";
  timerEl.style.visibility = isHidden ? "visible" : "hidden";
  toggleTimerBtn.textContent = isHidden ? "Hide Timer" : "Show Timer";
}

function pauseQuiz() {
  if (gameOver || isPaused) return;

  isPaused = true;
  acceptingAnswer = false;
  pauseBtn.textContent = "Resume";
  quizAreaEl.style.display = "none";
  clearPendingFeedbackTimeout();
  setFeedback("Paused", "paused-feedback");
  setInputsDisabled(true);
}

function resumeQuiz() {
  if (gameOver || !isPaused) return;

  isPaused = false;
  acceptingAnswer = true;
  pauseBtn.textContent = "Pause";
  quizAreaEl.style.display = "block";
  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";
  clearFeedback();
  setInputsDisabled(false);

  const firstInput = answerAreaEl.querySelector("input");
  if (firstInput) firstInput.focus();
}

function togglePause() {
  if (isPaused) {
    resumeQuiz();
  } else {
    pauseQuiz();
  }
}

function giveUp() {
  if (gameOver) return;

  const confirmed = window.confirm("Are you sure you want to give up and end the quiz now?");
  if (!confirmed) return;

  endGame("Quiz ended.", "gave_up");
}

startBtn.addEventListener("click", startQuiz);
tryAgainBtn.addEventListener("click", restartQuiz);
submitBtn.addEventListener("click", checkAnswer);
pauseBtn.addEventListener("click", togglePause);
toggleTimerBtn.addEventListener("click", toggleTimerVisibility);
giveUpBtn.addEventListener("click", giveUp);
