"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import styles from "./tma.module.css";

type AnalysisResponse = {
  analysis?: {
    summary: string;
    sources: Array<{
      url: string;
      confidence: number;
      reason: string;
    }>;
  };
  error?: string;
};

export default function MiniAppPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [sources, setSources] = useState<
    Array<{ url: string; confidence: number; reason: string }>
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.ready();
      webApp.expand();
    }
  }, []);

  const handleSubmit = async (): Promise<void> => {
    if (!text.trim()) {
      setError("Введите текст для анализа.");
      return;
    }

    setError("");
    setLoading(true);
    setSummary("");
    setSources([]);

    try {
      const response = await fetch("/api/miniapp/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Ошибка анализа.");
      }

      setSummary(data.analysis?.summary ?? "");
      setSources(data.analysis?.sources ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить анализ.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Script src="https://telegram.org/js/telegram-web-app.js" />
      <div className={styles.card}>
        <div>
          <h1 className={styles.title}>FindOrigin</h1>
          <p className={styles.subtitle}>
            Вставьте текст или ссылку — получите краткий вывод и список
            источников из текста.
          </p>
        </div>

        <textarea
          className={styles.textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Введите текст или ссылку на пост"
        />

        <button
          className={styles.button}
          onClick={() => void handleSubmit()}
          disabled={loading}
        >
          {loading ? "Анализ..." : "Проверить"}
        </button>

        {error && <div className={styles.error}>{error}</div>}

        {(summary || sources.length > 0) && (
          <div className={styles.resultBox}>
            {summary && (
              <>
                <p className={styles.sectionTitle}>Краткий вывод</p>
                <p>{summary}</p>
              </>
            )}

            <p className={styles.sectionTitle}>Источники</p>
            {sources.length === 0 ? (
              <p>Ссылки не найдены в тексте.</p>
            ) : (
              <ul className={styles.list}>
                {sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.url}
                    </a>{" "}
                    ({Math.round(source.confidence * 100)}%)
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
