let problems = [];

let currentIndex = 0;
let score = 0;
let timeLeft = 10 * 60; // 10 minutes in seconds
let gameOver = false;
let timerInterval = null;

const questionEl = document.getElementById("question");
const answerAreaEl = document.getElementById("answer-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");
const startBtn = document.getElementById("start");

submitBtn.disabled = true;
answerAreaEl.style.display = "none";
submitBtn.style.display = "none";
questionEl.textContent = "Press Start to begin.";
timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

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
    const problem = {
      question: columns[0] ?? "",
      answer1: columns[1] ?? "",
      static1: columns[2] ?? "",
      answer2: columns[3] ?? "",
      static2: columns[4] ?? ""
    };

    return problem;
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
  let answerText = problem.answer1;

  if (problem.static1) {
    answerText += problem.static1;
  }

  if (problem.answer2) {
    answerText += problem.answer2;
  }

  if (problem.static2) {
    answerText += problem.static2;
  }

  return answerText;
}

function showProblem() {
  if (gameOver) return;

  if (currentIndex >= problems.length) {
    endGame("Done!");
    return;
  }

  const problem = problems[currentIndex];
  questionEl.textContent = problem.question;
  feedbackEl.textContent = "";
  renderAnswerArea(problem);
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
    startTimer();
    showProblem();
  } catch (error) {
    gameOver = true;
    questionEl.textContent = "Could not load quiz problems.";
    feedbackEl.textContent = error.message;
    submitBtn.disabled = true;
    answerAreaEl.querySelectorAll("input").forEach(input => {
      input.disabled = true;
    });
    console.error(error);
  }
}

async function startQuiz() {
  startBtn.disabled = true;
  startBtn.style.display = "none";

  answerAreaEl.style.display = "flex";
  submitBtn.style.display = "inline-block";

  await loadProblems();
}

function checkAnswer() {
  if (gameOver || problems.length === 0) return;

  const problem = problems[currentIndex];
  const answer1Input = document.getElementById("answer1");
  const answer2Input = document.getElementById("answer2");

  const answer1Correct = normalizeAnswer(answer1Input?.value ?? "") === normalizeAnswer(problem.answer1);
  const answer2Correct = !problem.answer2 || normalizeAnswer(answer2Input?.value ?? "") === normalizeAnswer(problem.answer2);

  if (answer1Correct && answer2Correct) {
    score++;
    feedbackEl.textContent = "Correct!";
  } else {
    feedbackEl.textContent = `Wrong. Correct answer: ${getCorrectAnswerText(problem)}`;
  }

  currentIndex++;
  scoreEl.textContent = `Score: ${score}`;
  showProblem();
}

function endGame(message) {
  gameOver = true;

  questionEl.textContent = message;
  feedbackEl.textContent = `Final score: ${score}/${problems.length}`;
  answerAreaEl.style.display = "none";
  submitBtn.style.display = "none";

  if (timerInterval !== null) {
    clearInterval(timerInterval);
  }
}

function startTimer() {
  if (timerInterval !== null) return;

  timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

  timerInterval = setInterval(function() {
    timeLeft--;

    timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

    if (timeLeft <= 0) {
      timerEl.textContent = "Time: 0s";
      endGame("Time's up!");
    }
  }, 1000);
}

startBtn.addEventListener("click", startQuiz);
submitBtn.addEventListener("click", checkAnswer);
