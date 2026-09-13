package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.SaveProgressBatchRequest;
import com.ecobrains.lms.dto.response.QuestionExamResponse;
import com.ecobrains.lms.entity.*;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.QuestionRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import tools.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Temporary live state for an active student examination.
 * MySQL remains the permanent source of truth. Redis is deliberately kept
 * outside the normal JPA answer-save hot path.
 */
@Service
public class RedisExamStateService {
    public static final String ACTIVE_SET = "exam:active:sessions";
    private static final Duration DEFAULT_TTL = Duration.ofHours(3);
    private static final Duration RESTRICTION = Duration.ofMinutes(5);

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final QuestionRepository questionRepository;
    private final StudentAnswerRepository answerRepository;
    private final StudentRepository studentRepository;

    public RedisExamStateService(StringRedisTemplate redis, ObjectMapper mapper,
                                 QuestionRepository questionRepository,
                                 StudentAnswerRepository answerRepository,
                                 StudentRepository studentRepository) {
        this.redis = redis;
        this.mapper = mapper;
        this.questionRepository = questionRepository;
        this.answerRepository = answerRepository;
        this.studentRepository = studentRepository;
    }

    public String key(Long examId, Long studentId) { return "exam:" + examId + ":student:" + studentId + ":state"; }

    public boolean available() {
        try { return redis.execute((org.springframework.data.redis.core.RedisCallback<String>) connection -> connection.ping()) != null; }
        catch (Exception e) { return false; }
    }

    public Optional<ExamSessionState> get(Long examId, Long studentId) {
        try {
            String json = redis.opsForValue().get(key(examId, studentId));
            if (json == null) return Optional.empty();
            return Optional.of(mapper.readValue(json, ExamSessionState.class));
        } catch (Exception e) {
            throw new RedisUnavailableException(e);
        }
    }

    public void createOrRestore(Long examId, Long studentId, Instant startedAt, Instant deadline,
                                String initialStatus, List<QuestionExamResponse> publicQuestions,
                                Map<Long, Integer> answers, Map<Long, Integer> correctAnswers) {
        try {
            String k = key(examId, studentId);
            Optional<ExamSessionState> existing = get(examId, studentId);
            if (existing.isPresent()) {
                refreshTtl(k, deadline);
                return;
            }
            ExamSessionState state = new ExamSessionState(
                    studentId, examId, initialStatus, startedAt, deadline,
                    0, 0, null, 0L, 0L, false,
                    publicQuestions, answers, correctAnswers);
            save(state);
        } catch (RedisUnavailableException e) { throw e; }
    }

    public void save(ExamSessionState state) {
        try {
            String k = key(state.examId(), state.studentId());
            redis.opsForValue().set(k, mapper.writeValueAsString(state));
            long ttl = Math.max(300, Duration.between(Instant.now(), state.deadline()).plus(DEFAULT_TTL).getSeconds());
            redis.expire(k, ttl, TimeUnit.SECONDS);
            redis.opsForSet().add(ACTIVE_SET, k);
            redis.expire(ACTIVE_SET, ttl, TimeUnit.SECONDS);
        } catch (Exception e) { throw new RedisUnavailableException(e); }
    }


    public ExamSessionState activate(Long examId, Long studentId, Instant startedAt, Instant deadline) {
        ExamSessionState state = require(examId, studentId);
        if ("TERMINATED".equals(state.status())) throw ApiException.forbidden("This examination access has been terminated.");
        ExamSessionState active = new ExamSessionState(state.studentId(), state.examId(), "ACTIVE", startedAt, deadline,
                state.currentQuestionIndex(), state.tabSwitchCount(), null, state.stateVersion() + 1, state.checkpointVersion(), state.dirty(),
                state.questions(), state.answers(), state.correctAnswers());
        save(active);
        return active;
    }

    public void applyAnswers(Long examId, Long studentId, SaveProgressBatchRequest req) {
        ExamSessionState state = require(examId, studentId);
        if (!"ACTIVE".equals(state.status())) {
            throw ApiException.forbidden("This examination session is not active.");
        }
        long incoming = req.clientSequence() == null ? state.stateVersion() + 1 : req.clientSequence();
        if (incoming <= state.stateVersion()) return;

        Map<Long,Integer> answers = new HashMap<>(state.answers());
        if (req.answers() != null) {
            for (var entry : req.answers()) {
                if (entry.questionId() == null) continue;
                answers.put(entry.questionId(), entry.selectedOptionIndex());
            }
        }
        int current = req.currentQuestionIndex() != null ? req.currentQuestionIndex() : state.currentQuestionIndex();
        save(new ExamSessionState(state.studentId(), state.examId(), state.status(), state.startedAt(), state.deadline(),
                current, state.tabSwitchCount(), state.restrictionUntil(), incoming, state.checkpointVersion(), true,
                state.questions(), answers, state.correctAnswers()));
    }

    public ViolationResult recordViolation(Long examId, Long studentId, SaveProgressBatchRequest req) {
        ExamSessionState state = require(examId, studentId);
        if (!"ACTIVE".equals(state.status())) {
            return new ViolationResult(state.status(), state.tabSwitchCount(), state.restrictionUntil());
        }
        applyAnswers(examId, studentId, req);
        state = require(examId, studentId);
        int count = state.tabSwitchCount() + 1;
        if (count >= 3) {
            ExamSessionState terminated = new ExamSessionState(state.studentId(), state.examId(), "TERMINATED", state.startedAt(), state.deadline(),
                    state.currentQuestionIndex(), count, null, state.stateVersion() + 1, state.checkpointVersion(), true,
                    state.questions(), state.answers(), state.correctAnswers());
            save(terminated);
            return new ViolationResult("TERMINATED", count, null);
        }
        Instant until = Instant.now().plus(RESTRICTION);
        ExamSessionState restricted = new ExamSessionState(state.studentId(), state.examId(), "RESTRICTED", state.startedAt(), state.deadline(),
                state.currentQuestionIndex(), count, until, state.stateVersion() + 1, state.checkpointVersion(), true,
                state.questions(), state.answers(), state.correctAnswers());
        save(restricted);
        return new ViolationResult("RESTRICTED", count, until);
    }

    public ExamSessionState reopen(Long examId, Long studentId) {
        ExamSessionState state = require(examId, studentId);
        if ("COMPLETED".equals(state.status())) throw ApiException.conflict("Exam is already completed.");
        ExamSessionState reopened = new ExamSessionState(state.studentId(), state.examId(), "ACTIVE", state.startedAt(), state.deadline(),
                state.currentQuestionIndex(), state.tabSwitchCount(), null, state.stateVersion() + 1, state.checkpointVersion(), true,
                state.questions(), state.answers(), state.correctAnswers());
        save(reopened);
        return reopened;
    }

    public void markCompleted(Long examId, Long studentId) {
        try {
            String k = key(examId, studentId);
            redis.opsForValue().getAndDelete(k);
            redis.opsForSet().remove(ACTIVE_SET, k);
        } catch (Exception ignored) { }
    }

    public List<String> activeKeys() {
        try { return new ArrayList<>(redis.opsForSet().members(ACTIVE_SET) == null ? Set.of() : redis.opsForSet().members(ACTIVE_SET)); }
        catch (Exception e) { throw new RedisUnavailableException(e); }
    }

    public void checkpointed(ExamSessionState state) {
        ExamSessionState current = require(state.examId(), state.studentId());
        long checkpointVersion = state.stateVersion();
        boolean stillDirty = current.stateVersion() > checkpointVersion;
        ExamSessionState next = new ExamSessionState(current.studentId(), current.examId(), current.status(), current.startedAt(), current.deadline(),
                current.currentQuestionIndex(), current.tabSwitchCount(), current.restrictionUntil(), current.stateVersion(),
                checkpointVersion, stillDirty, current.questions(), current.answers(), current.correctAnswers());
        save(next);
    }

    public ExamSessionState require(Long examId, Long studentId) {
        return get(examId, studentId).orElseThrow(() -> ApiException.notFound("Active examination session not found."));
    }

    private void refreshTtl(String key, Instant deadline) {
        try { redis.expire(key, Math.max(300, Duration.between(Instant.now(), deadline).plus(DEFAULT_TTL).getSeconds()), TimeUnit.SECONDS); }
        catch (Exception e) { throw new RedisUnavailableException(e); }
    }

    public static List<QuestionExamResponse> publicQuestions(ExamSessionState state) { return state.questions(); }

    public record ExamSessionState(Long studentId, Long examId, String status, Instant startedAt, Instant deadline,
                                   int currentQuestionIndex, int tabSwitchCount, Instant restrictionUntil,
                                   long stateVersion, long checkpointVersion, boolean dirty,
                                   List<QuestionExamResponse> questions, Map<Long,Integer> answers,
                                   Map<Long,Integer> correctAnswers) {
        public ExamSessionState {
            questions = questions == null ? List.of() : List.copyOf(questions);
            answers = answers == null ? Map.of() : Collections.unmodifiableMap(new HashMap<>(answers));
            correctAnswers = correctAnswers == null ? Map.of() : Collections.unmodifiableMap(new HashMap<>(correctAnswers));
        }
    }

    public record ViolationResult(String status, int violationCount, Instant restrictionUntil) {}

    public static class RedisUnavailableException extends RuntimeException {
        public RedisUnavailableException(Throwable cause) { super("Redis is unavailable", cause); }
    }
}
