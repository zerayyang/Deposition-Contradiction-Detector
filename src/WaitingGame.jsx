import { useEffect, useRef, useState } from "react";
import "./waitingGame.css";

// A small jump-over-the-obstacles game for the wait while an analysis runs. Everything is
// drawn here, so it needs no network. When the analysis finishes the game stops by itself.
const W = 520, H = 170, GROUND = 140, PLAYER = { x: 40, w: 32, h: 38 };
const GRAVITY = 0.0021, JUMP = -0.66, START_SPEED = 0.32, MAX_SPEED = 0.75;
const readBest = () => { try { return Number(localStorage.getItem("waitingGameBest")) || 0; } catch { return 0; } };
const saveBest = value => { try { localStorage.setItem("waitingGameBest", String(value)); } catch { /* storage unavailable */ } };

function fresh() { return { y: GROUND - PLAYER.h, vy: 0, obstacles: [], speed: START_SPEED, distance: 0, spawnIn: 900, last: 0, step: 0 }; }
function sharp(canvas) {
  const ratio = Math.min(3, window.devicePixelRatio || 1), ctx = canvas.getContext("2d");
  if (canvas.width !== W * ratio) { canvas.width = W * ratio; canvas.height = H * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
function draw(ctx, s, colors) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = colors.ground; ctx.fillRect(0, GROUND, W, 2);
  for (let x = -(s.distance * 0.6) % 40; x < W; x += 40) ctx.fillRect(x, GROUND + 8, 14, 2);
  // Obstacles: stacks of paper.
  for (const o of s.obstacles) {
    ctx.fillStyle = colors.paper; ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
    ctx.fillStyle = colors.lines; for (let y = GROUND - o.h + 5; y < GROUND - 2; y += 5) ctx.fillRect(o.x + 2, y, o.w - 4, 1);
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.5; ctx.strokeRect(o.x + .5, GROUND - o.h + .5, o.w - 1, o.h - 1);
  }
  // Player: the app's little "D" mascot with running legs.
  const y = s.y, legUp = Math.floor(s.step / 90) % 2 === 0 && y >= GROUND - PLAYER.h - 0.5;
  ctx.fillStyle = colors.player; ctx.beginPath(); ctx.roundRect(PLAYER.x, y, PLAYER.w, PLAYER.h - 6, 7); ctx.fill();
  ctx.fillRect(PLAYER.x + 5, y + PLAYER.h - 7, 5, legUp ? 4 : 7); ctx.fillRect(PLAYER.x + 16, y + PLAYER.h - 7, 5, legUp ? 7 : 4);
  ctx.fillStyle = "#fff"; ctx.font = "bold 19px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("D", PLAYER.x + PLAYER.w / 2, y + 22);
}

export default function WaitingGame({ analysisRunning, onClose, onShowResults }) {
  const canvas = useRef(null), state = useRef(fresh()), frame = useRef(0), wasRunning = useRef(analysisRunning);
  const [phase, setPhase] = useState("ready"); // ready | playing | over | done
  const [score, setScore] = useState(0), [best, setBest] = useState(readBest);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function finishRound(final) {
    cancelAnimationFrame(frame.current);
    const points = Math.floor(final);
    setScore(points);
    if (points > readBest()) { saveBest(points); setBest(points); }
  }
  function jump() {
    const s = state.current;
    if (phaseRef.current === "done") return;
    if (phaseRef.current !== "playing") { state.current = fresh(); setScore(0); setPhase("playing"); return; }
    if (s.y >= GROUND - PLAYER.h - 0.5) s.vy = JUMP;
  }
  // The game loop runs only while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    const ctx = sharp(canvas.current), css = getComputedStyle(canvas.current);
    const colors = { ground: css.getPropertyValue("--game-ground"), paper: css.getPropertyValue("--game-paper"), lines: css.getPropertyValue("--game-lines"), ink: css.getPropertyValue("--game-ink"), player: css.getPropertyValue("--game-player") };
    const loop = now => {
      const s = state.current, dt = Math.min(34, s.last ? now - s.last : 16); s.last = now;
      if (document.hidden) { frame.current = requestAnimationFrame(loop); return; }
      s.vy += GRAVITY * dt; s.y = Math.min(GROUND - PLAYER.h, s.y + s.vy * dt); if (s.y >= GROUND - PLAYER.h) s.vy = 0;
      s.speed = Math.min(MAX_SPEED, s.speed + dt * 0.000012); s.distance += s.speed * dt; s.step += dt;
      s.spawnIn -= dt;
      if (s.spawnIn <= 0) { const h = 20 + Math.random() * 24; s.obstacles.push({ x: W + 10, w: 16 + Math.random() * 14, h }); s.spawnIn = 650 + Math.random() * 900 - s.speed * 300; }
      for (const o of s.obstacles) o.x -= s.speed * dt;
      s.obstacles = s.obstacles.filter(o => o.x + o.w > -5);
      const hit = s.obstacles.some(o => PLAYER.x + 4 < o.x + o.w && PLAYER.x + PLAYER.w - 4 > o.x && s.y + PLAYER.h - 4 > GROUND - o.h);
      draw(ctx, s, colors); setScore(Math.floor(s.distance / 10));
      if (hit) { finishRound(s.distance / 10); setPhase("over"); return; }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
  }, [phase]);
  // When the analysis finishes, stop the game and show the score.
  useEffect(() => {
    if (wasRunning.current && !analysisRunning) { finishRound(state.current.distance / 10); setPhase("done"); }
    wasRunning.current = analysisRunning;
  }, [analysisRunning]);
  // Space or the up arrow jumps, unless the person is typing somewhere.
  useEffect(() => {
    const key = event => {
      if (!["Space", "ArrowUp"].includes(event.code) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "")) return;
      event.preventDefault(); jump();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { const ctx = sharp(canvas.current); draw(ctx, state.current, { ground: "#c7d2d8", paper: "#fff", lines: "#dfe6ea", ink: "#8a9aa5", player: "#126e70" }); }, []);

  return <aside className="waiting-game" aria-label="Mini game while the analysis runs">
    <header><b>Waiting game</b><span>{analysisRunning ? "Analysis running…" : "Analysis finished"}</span><button className="waiting-close" aria-label="Close game" onClick={onClose}>×</button></header>
    <div className="waiting-stage" onPointerDown={event => { event.preventDefault(); jump(); }}>
      <canvas ref={canvas} width={W} height={H} aria-label="Jump over the paper stacks" />
      <span className="waiting-score">{String(score).padStart(5, "0")}<small>Best {String(best).padStart(5, "0")}</small></span>
      {phase === "ready" && <div className="waiting-overlay"><b>Jump over the paper stacks</b><span>Press Space or tap to start</span></div>}
      {phase === "over" && <div className="waiting-overlay"><b>Game over · {score}</b><span>Press Space or tap to try again</span></div>}
      {phase === "done" && <div className="waiting-overlay done" role="status"><b>✓ Analysis done</b><span>Your score: {score}{score >= best && score > 0 ? " · new best!" : ""}</span><span>Thanks for playing!</span>
        <button onPointerDown={event => event.stopPropagation()} onClick={onShowResults}>See results</button></div>}
    </div>
  </aside>;
}
