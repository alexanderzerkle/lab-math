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
updateCatGraphic();
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

function updateCatGraphic() {
  const level = getCatLevel(score);
  catStageEl.innerHTML = buildCatSvg(level);
  catStageEl.classList.toggle("animated-fire", level >= 35);
}

function buildCatSvg(level) {
  const hasFire = level >= 30;
  const isStanding = level >= 25;
  const hasLabCoat = level >= 15;
  const hasGlassware = level >= 20;
  const isCurled = level < 10;
  const oneEyeOpen = level >= 5 && level < 10;

  return `
    <svg viewBox="0 0 240 240" role="img" aria-label="Cartoon chemistry cat progress level ${level}">
      ${hasFire ? fireSvg() : ""}
      ${isStanding ? standingCatSvg(hasGlassware) : isCurled ? curledCatSvg(oneEyeOpen) : sittingCatSvg(hasLabCoat, hasGlassware)}
    </svg>
  `;
}

function fireSvg() {
  return `
    <g aria-hidden="true">
      <path class="cat-flame cat-flame-left" d="M22 210 C4 168 36 145 28 112 C56 138 58 168 46 210 Z" fill="#ff6a00" opacity="0.85"/>
      <path class="cat-flame cat-flame-left" d="M42 210 C25 172 55 154 50 128 C78 154 78 178 66 210 Z" fill="#ffd23f" opacity="0.9"/>
      <path class="cat-flame cat-flame-right" d="M218 210 C236 168 204 145 212 112 C184 138 182 168 194 210 Z" fill="#ff6a00" opacity="0.85"/>
      <path class="cat-flame cat-flame-right" d="M198 210 C215 172 185 154 190 128 C162 154 162 178 174 210 Z" fill="#ffd23f" opacity="0.9"/>
      <path class="cat-flame cat-flame-center" d="M92 222 C72 170 120 151 106 108 C150 146 154 180 132 222 Z" fill="#ff3b00" opacity="0.45"/>
      <circle class="cat-spark" cx="58" cy="74" r="4" fill="#ffb300"/>
      <circle class="cat-spark" cx="182" cy="76" r="4" fill="#ffb300"/>
      <circle class="cat-spark" cx="42" cy="100" r="2.8" fill="#ffd23f"/>
      <circle class="cat-spark" cx="198" cy="102" r="2.8" fill="#ffd23f"/>
    </g>
  `;
}

function curledCatSvg(oneEyeOpen) {
  return `
    <g aria-hidden="true">
      <ellipse cx="122" cy="142" rx="76" ry="48" fill="#f5a33b" stroke="#8a4b16" stroke-width="4"/>
      <path d="M166 126 C205 128 212 172 178 191 C150 207 112 190 119 162" fill="none" stroke="#c76d24" stroke-width="14" stroke-linecap="round"/>
      <circle cx="91" cy="111" r="45" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M58 82 L48 38 L84 66 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M122 79 L136 38 L151 83 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M61 77 L55 53 L77 67 Z" fill="#ffb6a6"/>
      <path d="M128 75 L136 52 L144 76 Z" fill="#ffb6a6"/>
      <path d="M65 98 C70 92 78 92 83 98" stroke="#5d2a0c" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${oneEyeOpen ? `<ellipse cx="103" cy="99" rx="8" ry="11" fill="#5d2a0c"/><circle cx="100" cy="95" r="2.5" fill="white"/>` : `<path d="M96 98 C102 92 110 92 115 98" stroke="#5d2a0c" stroke-width="4" fill="none" stroke-linecap="round"/>`}
      <path d="M86 106 C94 116 105 116 114 106 C110 128 92 133 78 121" fill="#fff2dc"/>
      <path d="M91 108 L98 111 L91 114 Z" fill="#e97975"/>
      <path d="M92 116 C96 121 101 121 105 116" stroke="#5d2a0c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M53 95 L30 88 M53 105 L28 108 M126 96 L151 89 M126 106 L153 111" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="86" cy="151" rx="19" ry="14" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      <ellipse cx="119" cy="151" rx="19" ry="14" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      <path d="M80 69 L88 88 M98 66 L102 86 M116 72 L111 90" stroke="#c76d24" stroke-width="5" stroke-linecap="round"/>
      <path d="M156 120 C174 134 174 164 154 181" stroke="#c76d24" stroke-width="6" stroke-linecap="round" fill="none"/>
    </g>
  `;
}

function sittingCatSvg(hasLabCoat, hasGlassware) {
  return `
    <g aria-hidden="true">
      <path d="M160 138 C196 144 194 196 153 202" fill="none" stroke="#f5a33b" stroke-width="24" stroke-linecap="round"/>
      <ellipse cx="120" cy="150" rx="50" ry="63" fill="#f5a33b" stroke="#8a4b16" stroke-width="4"/>
      <circle cx="120" cy="78" r="47" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M82 47 L72 8 L108 34 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M158 47 L168 8 L132 34 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M84 42 L79 22 L99 36 Z" fill="#ffb6a6"/>
      <path d="M156 42 L161 22 L141 36 Z" fill="#ffb6a6"/>
      <ellipse cx="104" cy="75" rx="9" ry="13" fill="#5d2a0c"/><circle cx="101" cy="70" r="3" fill="white"/>
      <ellipse cx="136" cy="75" rx="9" ry="13" fill="#5d2a0c"/><circle cx="133" cy="70" r="3" fill="white"/>
      <ellipse cx="120" cy="94" rx="25" ry="18" fill="#fff2dc"/>
      <path d="M114 88 L126 88 L120 95 Z" fill="#e97975"/>
      <path d="M110 101 C116 108 124 108 130 101" stroke="#5d2a0c" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M88 87 L61 82 M88 96 L60 101 M152 87 L179 82 M152 96 L180 101" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <path d="M96 38 L102 59 M120 31 L120 55 M144 38 L138 59" stroke="#c76d24" stroke-width="5" stroke-linecap="round"/>
      ${hasLabCoat ? labCoatSittingSvg() : `<ellipse cx="120" cy="148" rx="22" ry="37" fill="#fff2dc" opacity="0.9"/>`}
      <ellipse cx="93" cy="205" rx="21" ry="13" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      <ellipse cx="147" cy="205" rx="21" ry="13" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      ${hasGlassware ? foregroundGlasswareSvg() : ""}
    </g>
  `;
}

function labCoatSittingSvg() {
  return `
    <path d="M78 108 C92 126 95 178 84 211 L116 211 L120 136 L124 211 L156 211 C145 178 148 126 162 108 C143 120 132 122 120 122 C108 122 97 120 78 108 Z" fill="white" stroke="#c7ccd8" stroke-width="3"/>
    <path d="M100 120 L120 149 L140 120" fill="none" stroke="#8d96a8" stroke-width="3" stroke-linecap="round"/>
    <path d="M92 166 L111 166" stroke="#d6dbe6" stroke-width="3" stroke-linecap="round"/>
    <path d="M129 166 L148 166" stroke="#d6dbe6" stroke-width="3" stroke-linecap="round"/>
  `;
}

function foregroundGlasswareSvg() {
  return `
    <g opacity="0.95">
      <path d="M42 157 L75 157 L70 213 L47 213 Z" fill="#cfeefa" stroke="#6d8794" stroke-width="3"/>
      <path d="M47 190 L70 190 L69 213 L48 213 Z" fill="#6ed6ff" opacity="0.75"/>
      <ellipse cx="58.5" cy="157" rx="17" ry="5" fill="#eefcff" stroke="#6d8794" stroke-width="3"/>
      <rect x="178" y="135" width="21" height="78" rx="7" fill="#dff6ff" stroke="#6d8794" stroke-width="3"/>
      <rect x="181" y="176" width="15" height="37" rx="5" fill="#6ed6ff" opacity="0.75"/>
      <path d="M198 150 L190 150 M198 166 L192 166 M198 182 L190 182 M198 198 L192 198" stroke="#6d8794" stroke-width="2"/>
    </g>
  `;
}

function standingCatSvg(hasGlassware) {
  return `
    <g aria-hidden="true">
      <path d="M80 92 C48 100 38 126 50 151" fill="none" stroke="#f5a33b" stroke-width="20" stroke-linecap="round"/>
      <path d="M160 92 C192 100 202 126 190 151" fill="none" stroke="#f5a33b" stroke-width="20" stroke-linecap="round"/>
      <ellipse cx="120" cy="152" rx="43" ry="61" fill="#f5a33b" stroke="#8a4b16" stroke-width="4"/>
      <path d="M153 170 C198 180 176 219 139 198" fill="none" stroke="#f5a33b" stroke-width="18" stroke-linecap="round"/>
      <circle cx="120" cy="74" r="45" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M84 44 L75 8 L109 33 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M156 44 L165 8 L131 33 Z" fill="#ffa640" stroke="#8a4b16" stroke-width="4"/>
      <path d="M87 40 L81 22 L99 35 Z" fill="#ffb6a6"/>
      <path d="M153 40 L159 22 L141 35 Z" fill="#ffb6a6"/>
      <ellipse cx="104" cy="72" rx="9" ry="13" fill="#5d2a0c"/><circle cx="101" cy="67" r="3" fill="white"/>
      <ellipse cx="136" cy="72" rx="9" ry="13" fill="#5d2a0c"/><circle cx="133" cy="67" r="3" fill="white"/>
      <ellipse cx="120" cy="91" rx="24" ry="17" fill="#fff2dc"/>
      <path d="M114 85 L126 85 L120 92 Z" fill="#e97975"/>
      <path d="M106 100 C114 112 126 112 134 100" stroke="#5d2a0c" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M88 84 L61 80 M88 94 L60 99 M152 84 L179 80 M152 94 L180 99" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <path d="M79 112 C95 125 100 176 88 215 L116 215 L120 137 L124 215 L152 215 C140 176 145 125 161 112 C143 125 132 127 120 127 C108 127 97 125 79 112 Z" fill="white" stroke="#c7ccd8" stroke-width="3"/>
      <path d="M99 126 L120 154 L141 126" fill="none" stroke="#8d96a8" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="96" cy="217" rx="19" ry="12" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      <ellipse cx="144" cy="217" rx="19" ry="12" fill="#fff2dc" stroke="#8a4b16" stroke-width="3"/>
      ${hasGlassware ? heldGlasswareSvg() : ""}
    </g>
  `;
}

function heldGlasswareSvg() {
  return `
    <g>
      <path d="M35 103 L70 103 L65 148 L40 148 Z" fill="#dff6ff" stroke="#6d8794" stroke-width="3"/>
      <path d="M40 128 L65 128 L63 148 L42 148 Z" fill="#59cfff" opacity="0.8"/>
      <ellipse cx="52.5" cy="103" rx="18" ry="5" fill="#eefcff" stroke="#6d8794" stroke-width="3"/>
      <rect x="176" y="82" width="20" height="70" rx="7" fill="#dff6ff" stroke="#6d8794" stroke-width="3"/>
      <rect x="179" y="117" width="14" height="35" rx="5" fill="#59cfff" opacity="0.8"/>
      <path d="M195 96 L188 96 M195 110 L190 110 M195 124 L188 124 M195 138 L190 138" stroke="#6d8794" stroke-width="2"/>
    </g>
  `;
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
