package com.ecobrains.lms.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

/** Periodically moves only dirty Redis sessions into MySQL in short, controlled transactions. */
@Service
public class ExamCheckpointService {
    private final RedisExamStateService redisState;
    private final ExamCheckpointWriter writer;

    public ExamCheckpointService(RedisExamStateService redisState, ExamCheckpointWriter writer) {
        this.redisState = redisState;
        this.writer = writer;
    }

    @Scheduled(fixedDelayString = "${app.exam.checkpoint-delay-ms:900000}")
    public void checkpointDirtySessions() {
        if (!redisState.available()) return;
        List<String> keys;
        try { keys = redisState.activeKeys(); } catch (Exception e) { return; }
        for (String key : keys) {
            RedisExamStateService.ExamSessionState state;
            try {
                state = parseKeyState(key);
                if (state == null || !state.dirty() || "COMPLETED".equals(state.status())) continue;
                boolean success = false;
                for (int attempt = 0; attempt < 3 && !success; attempt++) {
                    try {
                        writer.write(state);
                        success = true;
                    } catch (Exception ignored) {
                        if (attempt < 2) {
                            try { Thread.sleep(100L * (attempt + 1)); }
                            catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                        }
                    }
                }
            } catch (Exception ignored) {
                // One student's checkpoint must never stop the remaining sessions.
            }
        }
    }

    private RedisExamStateService.ExamSessionState parseKeyState(String key) {
        String[] p = key.split(":");
        if (p.length != 5) return null;
        Long examId = Long.valueOf(p[1]);
        Long studentId = Long.valueOf(p[3]);
        return redisState.get(examId, studentId).orElse(null);
    }
}
