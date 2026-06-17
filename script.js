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

const questionEl = document.getElementById("question");
const quizAreaEl = document.getElementById("quiz-area");
const answerAreaEl = document.getElementById("answer-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");
const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const giveUpBtn = document.getElementById("give-up");
const sideControlsEl = document.querySelector(".side-controls");

submitBtn.disabled = true;
quizAreaEl.style.display = "block";
answerAreaEl.style.display = "none";
submitBtn.style.display = "none";
sideControlsEl.style.display = "none";
pauseBtn.disabled = true;
giveUpBtn.disabled = true;
questionEl.textContent = "Press Start to begin.";
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

  return rows.slice(1).map(columns => {
    return {
      question: columns[0] ?? "",
      answer1: columns[1] ?? "",
      static1: columns[2] ?? "",
      answer2: columns[3] ?? "",
      static2: columns[4] ?? ""
    };
  }).filter(problem => problem.question && problem.answer1);
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
    endGame("Done!");
    return;
  }

  const problem = problems[currentIndex];
  questionEl.textContent = problem.question;
  renderAnswerArea(problem);
  acceptingAnswer = true;
  setInputsDisabled(false);
}

async function loadProblems() {
  try {
    questionEl.textContent = "Loading problems...";

    const response = await fetch("problems.csv", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load problems.csv (${response.status})`);
    }

    const text = await response.text();
    problems = parseCsv(text);

    if (problems.length === 0) {
      throw new Error("problems.csv did not contain any valid problems");
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

  const answer1Correct = normalizeAnswer(answer1Input?.value ?? "") === normalizeAnswer(problem.answer1);
  const answer2Correct = !problem.answer2 || normalizeAnswer(answer2Input?.value ?? "") === normalizeAnswer(problem.answer2);

  if (answer1Correct && answer2Correct) {
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

function endGame(message) {
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

  questionEl.textContent = message;
  feedbackEl.className = "";
  feedbackEl.innerHTML = `
    Total correct: ${score}<br>
    Total attempted: ${totalAttempted}<br>
    Accuracy: ${accuracy}%<br>
    Seconds per correct answer: ${secondsPerCorrect}
  `;
  answerAreaEl.style.display = "none";
  submitBtn.style.display = "none";
  sideControlsEl.style.display = "none";
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
      endGame("Time's up!");
    }
  }, 1000);
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

  endGame("Quiz ended.");
}

startBtn.addEventListener("click", startQuiz);
submitBtn.addEventListener("click", checkAnswer);
pauseBtn.addEventListener("click", togglePause);
giveUpBtn.addEventListener("click", giveUp);
