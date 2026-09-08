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
let timerHidden = false;
let questionResults = [];
let currentAttemptId = "";

const questionEl = document.getElementById("question");
const questionCategoryEl = document.getElementById("question-category");
const quizAreaEl = document.getElementById("quiz-area");
const answerAreaEl = document.getElementById("answer-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");
const startBtn = document.getElementById("start");
const tryAgainBtn = document.getElementById("try-again");
const pauseBtn = document.getElementById("pause");
const toggleTimerBtn = document.getElementById("toggle-timer");
const giveUpBtn = document.getElementById("give-up");
const sideControlsEl = document.querySelector(".side-controls");
const catStageEl = document.getElementById("cat-stage");
const STATS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz3SgNm0MKBL9DWFPyGj_-l2fWCh-039_VnrE-pcJL8H9u9tp92teh6h92AK57TkIzGFA/exec";

submitBtn.disabled = true;
quizAreaEl.style.display = "flex";
answerAreaEl.style.display = "none";
submitBtn.style.display = "none";
sideControlsEl.style.display = "none";
pauseBtn.disabled = true;
giveUpBtn.disabled = true;
questionEl.textContent = "Press Start to begin.";
questionCategoryEl.textContent = "";
timerEl.textContent = `Time: ${formatTime(timeLeft)}`;
scoreEl.textContent = "Score: 0";
updateTimerVisibility();

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function getCatLevel(correctCount) {
  if (correctCount >= 35) return 35;
  if (correctCount >= 30) return 30;
  if (correctCount >= 25) return 25;
  if (correctCount >= 20) return 20;
  if (correctCount >= 15) return 15;
  if (correctCount >= 10) return 10;
  if (correctCount >= 5) return 5;
  return 0;
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

function getUserAnswerText(problem) {
  const answer1Input = document.getElementById("answer1");
  const answer2Input = document.getElementById("answer2");

  return [answer1Input?.value ?? "", problem.static1, answer2Input?.value ?? "", problem.static2]
    .filter(part => part !== undefined && part !== null && String(part).trim() !== "")
    .map(part => String(part).trim())
    .join(" ");
}

function getTotalAttempted() {
  return questionResults.length;
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
  questionCategoryEl.textContent = `Category: ${problem.category}`;
  questionEl.textContent = problem.question;
  renderAnswerArea(problem);
  acceptingAnswer = true;
  setInputsDisabled(false);
}

function createAttemptId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resetQuizState() {
  clearPendingFeedbackTimeout();

  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  problems = [];
  currentIndex = 0;
  score = 0;
  incorrectAnswers = 0;
  timeLeft = QUIZ_LENGTH_SECONDS;
  gameOver = false;
  isPaused = false;
  acceptingAnswer = false;
  feedbackVersion++;
  questionResults = [];
  currentAttemptId = createAttemptId();

  updateScoreDisplay();
  updateCatGraphic();
  timerEl.textContent = `Time: ${formatTime(timeLeft)}`;
  pauseBtn.textContent = "Pause";
  clearFeedback();
  questionCategoryEl.textContent = "";
  answerAreaEl.innerHTML = "";
  tryAgainBtn.style.display = "none";
  sideControlsEl.style.display = "flex";
  quizAreaEl.style.display = "flex";
  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";
  updateTimerVisibility();
}

async function loadProblems() {
  try {
    questionEl.textContent = "Loading problems...";

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
    questionEl.textContent = "Could not load quiz problems.";
    questionCategoryEl.textContent = "";
    setFeedback(error.message, "incorrect-feedback");
    submitBtn.disabled = true;
    pauseBtn.disabled = true;
    giveUpBtn.disabled = true;
    setInputsDisabled(true);
    console.error(error);
  }
}

async function startQuiz() {
  startBtn.disabled = true;
  startBtn.style.display = "none";
  resetQuizState();
  await loadProblems();
}

async function restartQuiz() {
  resetQuizState();
  await loadProblems();
}

function recordQuestionResult(problem, userAnswer, correct) {
  questionResults.push({
    questionId: problem.questionId,
    category: problem.category || "Uncategorized",
    question: problem.question,
    correct: correct,
    userAnswer: userAnswer,
    correctAnswer: getCorrectAnswerText(problem)
  });
}

function checkAnswer() {
  if (gameOver || isPaused || problems.length === 0 || !acceptingAnswer) return;

  const problem = problems[currentIndex];
  const answer1Input = document.getElementById("answer1");
  const answer2Input = document.getElementById("answer2");
  const userAnswer = getUserAnswerText(problem);

  const answer1Correct = normalizeAnswer(answer1Input?.value ?? "") === normalizeAnswer(problem.answer1);
  const answer2Correct = !problem.answer2 || normalizeAnswer(answer2Input?.value ?? "") === normalizeAnswer(problem.answer2);

  if (answer1Correct && answer2Correct) {
    recordQuestionResult(problem, userAnswer, true);
    score++;
    updateScoreDisplay();
    updateCatGraphic();
    setFeedback("Correct", "correct-feedback");
    clearFeedbackAfterDelay(CORRECT_FEEDBACK_DURATION_MS);

    currentIndex++;
    showProblem();
    return;
  }

  recordQuestionResult(problem, userAnswer, false);
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
  const byCategory = new Map();

  questionResults.forEach(result => {
    const category = result.category || "Uncategorized";

    if (!byCategory.has(category)) {
      byCategory.set(category, { category, attempted: 0, correct: 0, incorrect: 0, accuracy: "0.0" });
    }

    const summary = byCategory.get(category);
    summary.attempted++;

    if (result.correct) {
      summary.correct++;
    } else {
      summary.incorrect++;
    }
  });

  return Array.from(byCategory.values())
    .sort((a, b) => a.category.localeCompare(b.category))
    .map(summary => ({
      ...summary,
      accuracy: summary.attempted > 0 ? ((summary.correct / summary.attempted) * 100).toFixed(1) : "0.0"
    }));
}

function buildStatsPayload(endedBy) {
  const elapsedSeconds = getElapsedSeconds();
  const totalAttempted = getTotalAttempted();
  const accuracy = totalAttempted > 0 ? ((score / totalAttempted) * 100).toFixed(1) : "0.0";
  const secondsPerCorrect = score > 0 ? (elapsedSeconds / score).toFixed(1) : "N/A";

  return {
    attemptId: currentAttemptId,
    endedBy: endedBy,
    totalCorrect: score,
    totalAttempted: totalAttempted,
    accuracy: `${accuracy}%`,
    timeElapsed: formatTime(elapsedSeconds),
    elapsedSeconds: elapsedSeconds,
    secondsPerCorrectAnswer: secondsPerCorrect,
    categoryPerformance: getCategoryPerformance(),
    questionResults: questionResults
  };
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

function resultListHtml(results, emptyMessage, includeCorrectAnswer) {
  if (results.length === 0) {
    return `<p>${emptyMessage}</p>`;
  }

  const items = results.map(result => {
    const base = `<strong>${escapeHtml(result.questionId)}</strong> (${escapeHtml(result.category)}): ${escapeHtml(result.question)}<br>`;
    const user = `Your answer: <code>${escapeHtml(result.userAnswer || "[blank]")}</code>`;
    const correct = includeCorrectAnswer ? `<br>Correct answer: <code>${escapeHtml(result.correctAnswer)}</code>` : "";
    return `<li>${base}${user}${correct}</li>`;
  }).join("");

  return `<ul>${items}</ul>`;
}

function buildReportHtml(stats) {
  const correctResults = stats.questionResults.filter(result => result.correct);
  const incorrectResults = stats.questionResults.filter(result => !result.correct);
  const categoryItems = stats.categoryPerformance.map(item =>
    `<li><strong>${escapeHtml(item.category)}</strong>: ${item.correct}/${item.attempted} correct (${item.accuracy}%)</li>`
  ).join("");

  return `
    <div class="report">
      <div class="summary-lines">
        Total correct: ${stats.totalCorrect}<br>
        Total attempted: ${stats.totalAttempted}<br>
        Accuracy: ${escapeHtml(stats.accuracy)}<br>
        Time elapsed: ${escapeHtml(stats.timeElapsed)}<br>
        Seconds per correct answer: ${escapeHtml(stats.secondsPerCorrectAnswer)}
      </div>

      <h3>Performance by category</h3>
      ${categoryItems ? `<ul>${categoryItems}</ul>` : "<p>No questions were attempted.</p>"}

      <h3>Questions answered correctly</h3>
      ${resultListHtml(correctResults, "No questions were answered correctly yet.", false)}

      <h3>Questions answered incorrectly</h3>
      ${resultListHtml(incorrectResults, "No questions were answered incorrectly.", true)}
    </div>
  `;
}

function endGame(message, endedBy) {
  gameOver = true;
  acceptingAnswer = false;
  isPaused = false;

  clearPendingFeedbackTimeout();

  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const stats = buildStatsPayload(endedBy);
  saveStatsToGoogleSheet(stats);

  questionCategoryEl.textContent = "";
  questionEl.textContent = message;
  feedbackEl.className = "";
  feedbackEl.innerHTML = buildReportHtml(stats);
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

function updateTimerVisibility() {
  timerEl.style.visibility = timerHidden ? "hidden" : "visible";
  toggleTimerBtn.textContent = timerHidden ? "Show Timer" : "Hide Timer";
}

function toggleTimerVisibility() {
  timerHidden = !timerHidden;
  updateTimerVisibility();
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
  quizAreaEl.style.display = "flex";
  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";
  clearFeedback();
  setInputsDisabled(false);

  const firstInput = answerAreaEl.querySelector("input");
  if (firstInput) {
    firstInput.focus();
  }
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
