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

  problems = lines
    .slice(1) // skip header row
    .map(line => {
      const [question, answer] = line.split(",");

      return {
        question: question.trim(),
        answer: Number(answer.trim())
      };
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
