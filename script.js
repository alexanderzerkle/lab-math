const problems = [
  { question: "7 + 8", answer: 15 },
  { question: "12 - 5", answer: 7 },
  { question: "6 × 4", answer: 24 },
  { question: "20 ÷ 5", answer: 4 }
];

let currentIndex = 0;
let score = 0;
let startTime = Date.now();

const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit");

function showProblem() {
  if (currentIndex >= problems.length) {
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    questionEl.textContent = "Done!";
    feedbackEl.textContent = `Final score: ${score}/${problems.length}. Time: ${totalTime}s`;
    answerEl.style.display = "none";
    submitBtn.style.display = "none";
    return;
  }

  questionEl.textContent = problems[currentIndex].question;
  answerEl.value = "";
  answerEl.focus();
}

function checkAnswer() {
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
  showProblem();
}

submitBtn.addEventListener("click", checkAnswer);

answerEl.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    checkAnswer();
  }
});

setInterval(function() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  timerEl.textContent = `Time: ${seconds}s`;
}, 1000);

showProblem();