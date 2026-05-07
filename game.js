const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const modeEl = document.querySelector("#mode");
const statusPanel = document.querySelector("#statusPanel");
const statusTitle = document.querySelector("#statusTitle");
const statusText = document.querySelector("#statusText");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");

const gridSize = 20;
const tileSize = canvas.width / gridSize;
const stepMs = 112;
const normalFoodScore = 10;
const specialFoodScore = 25;
const frozenSegmentScore = 15;
const ouroborosDurationMs = 8500;
const ouroborosBonusMs = 650;
const ouroborosKeepLength = 5;
const initialSnake = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

let snake;
let frozenSegments;
let food;
let direction;
let nextDirection;
let score;
let bestScore = Number(localStorage.getItem("roboros-best") || 0);
let gameState;
let gameMode;
let applesUntilSpecial;
let ouroborosEndsAt;
let ouroborosCombo;
let pauseStartedAt;
let lastStep = 0;
let animationFrame = 0;
let pulse = 0;

function cloneSnake() {
  return initialSnake.map((part) => ({ ...part }));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resetGame() {
  snake = cloneSnake();
  frozenSegments = [];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  applesUntilSpecial = randomInt(3, 5);
  ouroborosEndsAt = 0;
  ouroborosCombo = 0;
  pauseStartedAt = 0;
  gameMode = "normal";
  gameState = "ready";
  lastStep = 0;
  food = placeFood("normal");
  updateHud();
  setStatus("Roboros", "WASD", false);
  pauseBtn.textContent = "Pause Game";
  draw();
}

function startGame() {
  if (gameState === "playing") {
    return;
  }

  if (gameState === "gameover") {
    resetGame();
  }

  gameState = "playing";
  lastStep = performance.now();
  setStatus("", "", true);
  pauseBtn.textContent = "Pause Game";
}

function togglePause() {
  if (gameState === "ready") {
    startGame();
    return;
  }

  if (gameState === "gameover") {
    return;
  }

  if (gameState === "paused") {
    const now = performance.now();

    if (gameMode === "ouroboros" && pauseStartedAt) {
      ouroborosEndsAt += now - pauseStartedAt;
    }

    gameState = "playing";
    pauseStartedAt = 0;
    lastStep = now;
    setStatus("", "", true);
    pauseBtn.textContent = "Pause Game";
  } else {
    gameState = "paused";
    pauseStartedAt = performance.now();
    setStatus("Paused", `Score ${score}`, false);
    pauseBtn.textContent = "Resume";
  }
}

function updateHud(timestamp = performance.now()) {
  const displayTime = getOuroborosDisplayTime(timestamp);

  scoreEl.textContent = score;
  bestEl.textContent = bestScore;

  if (gameMode === "ouroboros") {
    modeEl.textContent = `${Math.max(0, Math.ceil((ouroborosEndsAt - displayTime) / 1000))}s`;
  } else if (gameState === "ready") {
    modeEl.textContent = "Ready";
  } else {
    modeEl.textContent = "Snake";
  }
}

function getOuroborosDisplayTime(timestamp) {
  if (gameState === "paused" && gameMode === "ouroboros" && pauseStartedAt) {
    return pauseStartedAt;
  }

  return timestamp;
}

function updateBestScore() {
  bestScore = Math.max(bestScore, score);
  localStorage.setItem("roboros-best", String(bestScore));
}

function setStatus(title, text, hidden) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusPanel.classList.toggle("is-hidden", hidden);
}

function cellKey(part) {
  return `${part.x},${part.y}`;
}

function placeFood(type) {
  const occupied = new Set([
    ...snake.map(cellKey),
    ...frozenSegments.map(cellKey),
  ]);
  const empty = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        empty.push({ x, y, type });
      }
    }
  }

  if (empty.length === 0) {
    gameOver("You Win");
    return null;
  }

  return empty[Math.floor(Math.random() * empty.length)];
}

function chooseNextFood() {
  if (applesUntilSpecial <= 0 && snake.length >= 6) {
    return placeFood("special");
  }

  return placeFood("normal");
}

function changeDirection(newDirection) {
  const hasNeck = snake.length > 1;
  const isOpposite = newDirection.x + direction.x === 0 && newDirection.y + direction.y === 0;

  if (!isOpposite || !hasNeck) {
    nextDirection = newDirection;
  }
}

function moveSnake(timestamp) {
  direction = nextDirection;

  const head = snake[0];
  const nextHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  if (nextHead.x < 0 || nextHead.x >= gridSize || nextHead.y < 0 || nextHead.y >= gridSize) {
    gameOver("Game Over");
    return;
  }

  if (gameMode === "ouroboros") {
    moveOuroborosHead(nextHead, timestamp);
  } else {
    moveNormalSnake(nextHead);
  }
}

function moveNormalSnake(nextHead) {
  const willEat = food && nextHead.x === food.x && nextHead.y === food.y;
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((part) => part.x === nextHead.x && part.y === nextHead.y);

  if (hitSelf) {
    gameOver("Game Over");
    return;
  }

  snake.unshift(nextHead);

  if (!willEat) {
    snake.pop();
    return;
  }

  if (food.type === "special") {
    score += specialFoodScore;
    updateBestScore();
    startOuroborosMode();
    return;
  }

  score += normalFoodScore;
  applesUntilSpecial -= 1;
  updateBestScore();
  food = chooseNextFood();
}

function moveOuroborosHead(nextHead, timestamp) {
  const frozenIndex = frozenSegments.findIndex((part) => part.x === nextHead.x && part.y === nextHead.y);
  const willEatFrozen = frozenIndex !== -1;
  const bodyToCheck = willEatFrozen ? snake : snake.slice(0, -1);
  const hitActiveBody = bodyToCheck.some((part) => part.x === nextHead.x && part.y === nextHead.y);

  if (hitActiveBody) {
    gameOver("Game Over");
    return;
  }

  snake.unshift(nextHead);

  if (willEatFrozen) {
    frozenSegments.splice(frozenIndex, 1);
    ouroborosCombo += 1;
    score += frozenSegmentScore + ouroborosCombo * 3;
    ouroborosEndsAt = Math.min(ouroborosEndsAt + ouroborosBonusMs, timestamp + 12000);
    updateBestScore();
    snake.pop();

    if (frozenSegments.length === 0) {
      score += 50;
      updateBestScore();
      finishOuroborosMode();
      return;
    }
  } else {
    snake.pop();
  }
}

function startOuroborosMode() {
  frozenSegments = snake.slice(ouroborosKeepLength).map((part, index) => ({
    ...part,
    order: index,
  }));
  snake = snake.slice(0, ouroborosKeepLength);
  food = null;
  gameMode = "ouroboros";
  ouroborosCombo = 0;
  ouroborosEndsAt = performance.now() + ouroborosDurationMs + Math.min(frozenSegments.length * 280, 3500);
}

function finishOuroborosMode() {
  frozenSegments = [];
  gameMode = "normal";
  ouroborosEndsAt = 0;
  ouroborosCombo = 0;
  pauseStartedAt = 0;
  applesUntilSpecial = randomInt(3, 6);
  food = placeFood("normal");
}

function gameOver(title) {
  gameState = "gameover";
  setStatus(title, `Score ${score}`, false);
  pauseBtn.textContent = "Pause Game";
}

function drawGrid() {
  ctx.fillStyle = gameMode === "ouroboros" ? "#d6d1a2" : "#bfc6bd";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(58, 66, 64, 0.24)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= gridSize; i += 1) {
    const position = i * tileSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }
}

function drawFood() {
  if (!food) {
    return;
  }

  const wobble = Math.round(Math.sin(pulse / 12) * 2);
  const x = food.x * tileSize;
  const y = food.y * tileSize + wobble;

  if (food.type === "special") {
    drawChip(x, y, true);
  } else {
    drawChip(x, y, false);
  }
}

function drawChip(x, y, isSpecial) {
  const body = isSpecial ? "#d8b447" : "#25312f";
  const face = isSpecial ? "#ffe078" : "#51605d";
  const trace = isSpecial ? "#fff2ad" : "#9aa5a1";
  const glow = isSpecial ? "#ff5362" : "#1b2423";

  ctx.fillStyle = "#101313";
  ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
  ctx.fillStyle = body;
  ctx.fillRect(x + 5, y + 5, tileSize - 10, tileSize - 10);
  ctx.fillStyle = face;
  ctx.fillRect(x + 8, y + 8, tileSize - 16, tileSize - 16);
  ctx.fillStyle = trace;
  ctx.fillRect(x + 10, y + 11, 8, 2);
  ctx.fillRect(x + 12, y + 13, 2, 6);
  ctx.fillRect(x + 16, y + 16, 5, 2);
  ctx.fillStyle = glow;
  ctx.fillRect(x + 15, y + 11, 4, 4);
  ctx.fillStyle = "#101313";

  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(x + 2, y + 7 + i * 5, 3, 2);
    ctx.fillRect(x + tileSize - 5, y + 7 + i * 5, 3, 2);
    ctx.fillRect(x + 7 + i * 5, y + 2, 2, 3);
    ctx.fillRect(x + 7 + i * 5, y + tileSize - 5, 2, 3);
  }
}

function drawFrozenSegments() {
  frozenSegments.forEach((part, index) => {
    const x = part.x * tileSize;
    const y = part.y * tileSize;
    const flash = (pulse + index * 3) % 32 < 16;

    ctx.fillStyle = flash ? "#ffe078" : "#9aa5a1";
    ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
    ctx.fillStyle = "#3b4442";
    ctx.fillRect(x + 5, y + 5, tileSize - 10, tileSize - 10);
    drawPanelMarks(x, y, index, "rgba(255, 255, 255, 0.28)", "#151919");
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.fillRect(x + 7, y + 7, tileSize - 14, 3);
  });
}

function drawSnake() {
  snake.forEach((part, index) => {
    const x = part.x * tileSize;
    const y = part.y * tileSize;
    const isHead = index === 0;

    if (!isHead) {
      drawSnakeBodySegment(x, y, index);
      return;
    }

    drawSnakeHead(x, y);
  });
}

function drawSnakeBodySegment(x, y, index) {
  const shade = index % 2 === 0 ? "#596461" : "#78837f";

  ctx.fillStyle = "#101313";
  ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
  ctx.fillStyle = shade;
  ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(x + 5, y + 5, tileSize - 10, 3);
  drawPanelMarks(x, y, index, "#d9ddda", "#151919");
}

function drawPanelMarks(x, y, index, lightColor, darkColor) {
  const offset = index % 2 === 0 ? 0 : 4;

  ctx.fillStyle = lightColor;
  ctx.fillRect(x + 6 + offset, y + 8, 3, 3);
  ctx.fillRect(x + 15 - offset, y + 15, 3, 3);
  ctx.fillStyle = darkColor;
  ctx.fillRect(x + 9, y + 12, tileSize - 18, 2);
  ctx.fillRect(x + 8, y + 8, 2, 2);
  ctx.fillRect(x + 16, y + 16, 2, 2);
}

function drawSnakeHead(x, y) {
  ctx.fillStyle = "#101313";
  ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

  ctx.fillStyle = "#323b39";
  ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

  ctx.fillStyle = "#c9ceca";
  ctx.fillRect(x + 6, y + 5, tileSize - 12, 5);
  ctx.fillStyle = "#747f7b";
  ctx.fillRect(x + 6, y + 14, tileSize - 12, 4);

  drawPanelMarks(x, y, 0, "#f2f5f2", "#151919");
  drawSnout(x, y);
  drawEyes(x, y);
  drawTongue(x, y);
}

function drawSnout(x, y) {
  const snoutMap = {
    "1,0": [x + 17, y + 8, 4, 8],
    "-1,0": [x + 3, y + 8, 4, 8],
    "0,1": [x + 8, y + 17, 8, 4],
    "0,-1": [x + 8, y + 3, 8, 4],
  };
  const snout = snoutMap[`${direction.x},${direction.y}`] || snoutMap["1,0"];

  ctx.fillStyle = "#151919";
  ctx.fillRect(...snout);
}

function drawEyes(x, y) {
  const eyeMap = {
    "1,0": [
      [14, 6],
      [14, 14],
    ],
    "-1,0": [
      [6, 6],
      [6, 14],
    ],
    "0,1": [
      [6, 14],
      [14, 14],
    ],
    "0,-1": [
      [6, 6],
      [14, 6],
    ],
  };
  const eyes = eyeMap[`${direction.x},${direction.y}`] || eyeMap["1,0"];

  ctx.fillStyle = "#ff5362";
  eyes.forEach(([eyeX, eyeY]) => {
    ctx.fillRect(x + eyeX, y + eyeY, 4, 4);
    ctx.fillStyle = "#151919";
    ctx.fillRect(x + eyeX + 1, y + eyeY + 1, 2, 2);
    ctx.fillStyle = "#ff5362";
  });
}

function drawTongue(x, y) {
  const flicker = pulse % 20 < 10 ? 0 : 2;
  const tongueMap = {
    "1,0": [
      [x + 21, y + 11, 5 + flicker, 2],
      [x + 25 + flicker, y + 9, 2, 2],
      [x + 25 + flicker, y + 13, 2, 2],
    ],
    "-1,0": [
      [x - 2 - flicker, y + 11, 5 + flicker, 2],
      [x - 4 - flicker, y + 9, 2, 2],
      [x - 4 - flicker, y + 13, 2, 2],
    ],
    "0,1": [
      [x + 11, y + 21, 2, 5 + flicker],
      [x + 9, y + 25 + flicker, 2, 2],
      [x + 13, y + 25 + flicker, 2, 2],
    ],
    "0,-1": [
      [x + 11, y - 2 - flicker, 2, 5 + flicker],
      [x + 9, y - 4 - flicker, 2, 2],
      [x + 13, y - 4 - flicker, 2, 2],
    ],
  };
  const pieces = tongueMap[`${direction.x},${direction.y}`] || tongueMap["1,0"];

  ctx.fillStyle = "#ff3d4d";
  pieces.forEach((piece) => {
    ctx.fillRect(...piece);
  });
}

function drawOuroborosTimer(timestamp) {
  if (gameMode !== "ouroboros") {
    return;
  }

  const displayTime = getOuroborosDisplayTime(timestamp);
  const remaining = Math.max(0, ouroborosEndsAt - displayTime);
  const width = Math.floor((remaining / 12000) * canvas.width);

  ctx.fillStyle = "rgba(38, 63, 33, 0.75)";
  ctx.fillRect(0, 0, canvas.width, 10);
  ctx.fillStyle = "#f1d46a";
  ctx.fillRect(0, 0, width, 10);
}

function drawScanline() {
  const y = (pulse * 3) % canvas.height;

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(0, y, canvas.width, 3);
}

function draw(timestamp = performance.now()) {
  drawGrid();
  drawFrozenSegments();
  drawFood();
  drawSnake();
  drawOuroborosTimer(timestamp);
  drawScanline();
}

function loop(timestamp) {
  pulse += 1;

  if (gameState === "playing" && gameMode === "ouroboros" && timestamp >= ouroborosEndsAt) {
    finishOuroborosMode();
  }

  if (gameState === "playing") {
    if (timestamp - lastStep >= stepMs) {
      moveSnake(timestamp);
      lastStep = timestamp;
    }
  }

  updateHud(timestamp);
  draw(timestamp);
  animationFrame = requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const keyDirections = {
    w: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
    arrowup: { x: 0, y: -1 },
    arrowleft: { x: -1, y: 0 },
    arrowdown: { x: 0, y: 1 },
    arrowright: { x: 1, y: 0 },
  };
  const codeDirections = {
    KeyW: { x: 0, y: -1 },
    KeyA: { x: -1, y: 0 },
    KeyS: { x: 0, y: 1 },
    KeyD: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowDown: { x: 0, y: 1 },
    ArrowRight: { x: 1, y: 0 },
  };
  const directionInput = codeDirections[event.code] || keyDirections[key];

  if (directionInput) {
    event.preventDefault();
    changeDirection(directionInput);

    if (gameState === "ready") {
      startGame();
    }
  }

  if (key === " " || key === "escape") {
    event.preventDefault();
    togglePause();
  }
});

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetGame);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
});

resetGame();
animationFrame = requestAnimationFrame(loop);
