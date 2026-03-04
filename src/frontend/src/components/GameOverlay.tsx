import { useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import type { GameEndData } from "./BikeGame";

interface ScoreEntry {
  score: bigint;
  playerName: string;
}

interface GameOverlayProps {
  gameEndData: GameEndData;
  onRestart: () => void;
}

export default function GameOverlay({
  gameEndData,
  onRestart,
}: GameOverlayProps) {
  const { actor, isFetching } = useActor();
  const [playerName, setPlayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!actor || isFetching || loadedRef.current) return;
    loadedRef.current = true;
    loadLeaderboard(actor);
  }, [actor, isFetching]);

  async function loadLeaderboard(actorInstance: typeof actor) {
    if (!actorInstance) return;
    setLoadingBoard(true);
    try {
      const scores = await actorInstance.getTopScores();
      setLeaderboard(scores);
    } catch (_e) {
      setLeaderboard([]);
    } finally {
      setLoadingBoard(false);
    }
  }

  async function handleSubmit() {
    if (!playerName.trim() || submitting || !actor) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await actor.submitScore(playerName.trim(), BigInt(gameEndData.score));
      setSubmitted(true);
      await loadLeaderboard(actor);
    } catch (_e) {
      setSubmitError("Failed to submit score. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stuntBadgeColors: Record<string, string> = {
    BACKFLIP: "#00ffff",
    FRONTFLIP: "#ff00ff",
    WHEELIE: "#ff00ff",
    "BIG AIR": "#ffff00",
    "HUGE AIR": "#ffaa00",
  };

  return (
    <div
      data-ocid="gameover.dialog"
      className="animate-fade-in"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 680,
          width: "100%",
          background: "rgba(10, 10, 20, 0.96)",
          border: "1px solid rgba(0, 255, 255, 0.3)",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow:
            "0 0 60px rgba(0, 255, 255, 0.15), 0 0 120px rgba(255, 0, 255, 0.08)",
          maxHeight: "95vh",
          overflowY: "auto",
        }}
      >
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1
            className="game-title neon-magenta"
            style={{
              fontSize: "clamp(36px, 8vw, 64px)",
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            GAME OVER
          </h1>
          <p
            style={{
              color: "rgba(0,255,255,0.5)",
              marginTop: 6,
              fontSize: 13,
              fontFamily: "Geist Mono, monospace",
            }}
          >
            YOUR RIDE HAS ENDED
          </p>
        </div>

        {/* Score highlights */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard
            label="FINAL SCORE"
            value={gameEndData.score.toLocaleString()}
            color="#00ffff"
          />
          <StatCard
            label="BEST COMBO"
            value={`x${gameEndData.maxCombo}`}
            color="#ff00ff"
          />
        </div>

        {/* Stunts performed */}
        {gameEndData.stuntsPerformed.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
                fontFamily: "Geist Mono, monospace",
              }}
            >
              Stunts Performed
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {gameEndData.stuntsPerformed.map((stunt) => {
                const color = stuntBadgeColors[stunt] ?? "#39ff14";
                return (
                  <span
                    key={stunt}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      border: `1px solid ${color}`,
                      color: color,
                      fontSize: 12,
                      fontFamily: "Geist Mono, monospace",
                      fontWeight: 700,
                      background: `${color}18`,
                      boxShadow: `0 0 8px ${color}44`,
                    }}
                  >
                    {stunt}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Score submission */}
        {!submitted ? (
          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
                fontFamily: "Geist Mono, monospace",
              }}
            >
              Submit Score
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                data-ocid="gameover.input"
                type="text"
                placeholder="Enter your name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                maxLength={20}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  background: "rgba(0, 255, 255, 0.06)",
                  border: "1px solid rgba(0, 255, 255, 0.25)",
                  borderRadius: 8,
                  color: "#e0f8ff",
                  fontSize: 14,
                  fontFamily: "Geist Mono, monospace",
                  outline: "none",
                }}
              />
              <button
                type="button"
                data-ocid="gameover.submit_button"
                onClick={handleSubmit}
                disabled={submitting || !playerName.trim() || !actor}
                style={{
                  padding: "10px 20px",
                  background:
                    submitting || !playerName.trim() || !actor
                      ? "rgba(0,255,255,0.1)"
                      : "rgba(0,255,255,0.15)",
                  border: "1px solid rgba(0,255,255,0.4)",
                  borderRadius: 8,
                  color:
                    submitting || !playerName.trim() || !actor
                      ? "rgba(0,255,255,0.3)"
                      : "#00ffff",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Geist Mono, monospace",
                  cursor:
                    submitting || !playerName.trim() || !actor
                      ? "not-allowed"
                      : "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {submitting ? "SAVING..." : "SUBMIT"}
              </button>
            </div>
            {submitError && (
              <p
                style={{
                  color: "#ff4444",
                  fontSize: 12,
                  marginTop: 6,
                  fontFamily: "Geist Mono, monospace",
                }}
              >
                {submitError}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              background: "rgba(57, 255, 20, 0.08)",
              border: "1px solid rgba(57, 255, 20, 0.3)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <p
              className="neon-green"
              style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "Geist Mono, monospace",
                margin: 0,
              }}
            >
              ✓ Score submitted!
            </p>
          </div>
        )}

        {/* Leaderboard */}
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 10,
              fontFamily: "Geist Mono, monospace",
            }}
          >
            Top Riders
          </p>
          <div
            data-ocid="leaderboard.table"
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(0,255,255,0.1)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {loadingBoard ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "rgba(0,255,255,0.4)",
                  fontSize: 13,
                  fontFamily: "Geist Mono, monospace",
                }}
              >
                Loading...
              </div>
            ) : leaderboard.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 13,
                  fontFamily: "Geist Mono, monospace",
                }}
              >
                No scores yet — be the first!
              </div>
            ) : (
              leaderboard.slice(0, 10).map((entry, i) => {
                const rank = i + 1;
                const rankColor =
                  rank === 1
                    ? "#ffd700"
                    : rank === 2
                      ? "#c0c0c0"
                      : rank === 3
                        ? "#cd7f32"
                        : "rgba(255,255,255,0.5)";
                return (
                  <div
                    key={entry.playerName + rank}
                    data-ocid={`leaderboard.row.${rank}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderBottom:
                        i < Math.min(leaderboard.length, 10) - 1
                          ? "1px solid rgba(0,255,255,0.07)"
                          : "none",
                      background:
                        playerName.trim() &&
                        entry.playerName === playerName.trim() &&
                        submitted
                          ? "rgba(0,255,255,0.05)"
                          : "transparent",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        fontSize: 13,
                        fontWeight: 700,
                        color: rankColor,
                        fontFamily: "Geist Mono, monospace",
                      }}
                    >
                      {rank === 1
                        ? "🥇"
                        : rank === 2
                          ? "🥈"
                          : rank === 3
                            ? "🥉"
                            : `${rank}.`}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: "rgba(224, 248, 255, 0.9)",
                        fontFamily: "Geist Mono, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.playerName}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#00ffff",
                        fontFamily: "Geist Mono, monospace",
                        textShadow: "0 0 8px rgba(0,255,255,0.6)",
                      }}
                    >
                      {Number(entry.score).toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Restart button */}
        <button
          type="button"
          data-ocid="gameover.primary_button"
          onClick={onRestart}
          style={{
            width: "100%",
            padding: "14px",
            background:
              "linear-gradient(135deg, rgba(0,255,255,0.12), rgba(255,0,255,0.08))",
            border: "1px solid rgba(0,255,255,0.5)",
            borderRadius: 10,
            color: "#00ffff",
            fontSize: 18,
            fontWeight: 900,
            fontFamily: "Bricolage Grotesque, sans-serif",
            letterSpacing: "0.05em",
            cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: "0 0 20px rgba(0,255,255,0.2)",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background =
              "linear-gradient(135deg, rgba(0,255,255,0.22), rgba(255,0,255,0.14))";
            btn.style.boxShadow = "0 0 30px rgba(0,255,255,0.4)";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background =
              "linear-gradient(135deg, rgba(0,255,255,0.12), rgba(255,0,255,0.08))";
            btn.style.boxShadow = "0 0 20px rgba(0,255,255,0.2)";
          }}
        >
          ▶ RIDE AGAIN
        </button>

        {/* Footer */}
        <p
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 11,
            color: "rgba(255,255,255,0.2)",
            fontFamily: "Geist Mono, monospace",
          }}
        >
          © {new Date().getFullYear()}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(0,255,255,0.35)", textDecoration: "none" }}
          >
            Built with ♥ using caffeine.ai
          </a>
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "16px",
        background: `${color}0d`,
        border: `1px solid ${color}30`,
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          margin: "0 0 6px 0",
          fontFamily: "Geist Mono, monospace",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: color,
          margin: 0,
          fontFamily: "Bricolage Grotesque, sans-serif",
          textShadow: `0 0 20px ${color}88`,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
