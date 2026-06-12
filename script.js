let problems = [];

let currentIndex = 0;
let score = 0;
let timeLeft = 10 * 60; // 10 minutes in seconds
let gameOver = false;

const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");

function formatTime(seconds) {
  if (seconds > 59) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
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
  const response = await fetch("problems.csv");
  const text = await response.text();
  const lines = text.trim().split("\n");

  problems = lines.slice(1).map(line => {
    // Find the last comma not inside quotes
    let inQuotes = false;
    let lastCommaIndex = -1;
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] === '"') inQuotes = !inQuotes;
      if (line[i] === ',' && !inQuotes) {
        lastCommaIndex = i;
        break;
      }
    }
    
    const question = line.substring(0, lastCommaIndex).replace(/^"|"$/g, '').trim();
    const answer = Number(line.substring(lastCommaIndex + 1).trim());

    return { question, answer };
  });

  showProblem();
}

function checkAnswer() {
  if (gameOver) return;
  if (problems.length === 0) return;

  const userAnswer = Number(answerEl.value);
  const correctAnswer = problems[currentIndex].answer;

  if (userAnswer === correctAnswer) {
    score++;
    feedbackEl.textContent = "Correct!";
  } else {
    feedbackEl.textContent = `Wrong. Correct answer: ${correctAnswer}`;
  }

  currentIndex++;
  scoreEl.textContent = `Score: ${score}`;
  loadProblems();
}

function endGame(message) {
  gameOver = true;

  questionEl.textContent = message;
  feedbackEl.textContent = `Final score: ${score}/${problems.length}`;
  answerEl.style.display = "none";
  submitBtn.style.display = "none";

  clearInterval(timerInterval);
}

submitBtn.addEventListener("click", checkAnswer);

answerEl.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    checkAnswer();
  }
});

timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

const timerInterval = setInterval(function() {
  timeLeft--;

  timerEl.textContent = `Time: ${formatTime(timeLeft)}`;

  if (timeLeft <= 0) {
    timerEl.textContent = "Time: 0s";
    endGame("Time's up!");
  }
}, 1000);

showProblem();
