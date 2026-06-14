let problems = [];

let currentIndex = 0;
let score = 0;
let timeLeft = 10 * 60; // 10 minutes in seconds
let gameOver = false;
let timerInterval = null;

const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");
const startBtn = document.getElementById("start");

submitBtn.disabled = true;
answerEl.style.display = "none";
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
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/−/g, "-")
    .replace(/×/g, "x")
    .toLowerCase();
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(line => line.trim() !== "");

  return lines.slice(1).map(line => {
    const columns = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        columns.push(value.trim());
        value = "";
      } else {
        value += char;
      }
    }

    columns.push(value.trim());

    return {
      question: columns[0] ?? "",
      answer: columns.slice(1).join(",").trim()
    };
  }).filter(problem => problem.question && problem.answer);
}

function showProblem() {
  if (gameOver) return;

  if (currentIndex >= problems.length) {
    endGame("Done!");
    return;
  }

  questionEl.textContent = problems[currentIndex].question;
  answerEl.value = "";
  answerEl.focus();
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
    answerEl.disabled = true;
    console.error(error);
  }
}

async function startQuiz() {
  startBtn.disabled = true;
  startBtn.style.display = "none";

  answerEl.style.display = "";
  submitBtn.style.display = "";

  await loadProblems();
}

function checkAnswer() {
  if (gameOver || problems.length === 0) return;

  const userAnswer = normalizeAnswer(answerEl.value);
  const correctAnswer = normalizeAnswer(problems[currentIndex].answer);

  if (userAnswer === correctAnswer) {
    score++;
    feedbackEl.textContent = "Correct!";
  } else {
    feedbackEl.textContent = `Wrong. Correct answer: ${problems[currentIndex].answer}`;
  }

  currentIndex++;
  scoreEl.textContent = `Score: ${score}`;
  showProblem();
}

function endGame(message) {
  gameOver = true;

  questionEl.textContent = message;
  feedbackEl.textContent = `Final score: ${score}/${problems.length}`;
  answerEl.style.display = "none";
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

answerEl.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    checkAnswer();
  }
});
