package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.SaveProgressBatchRequest;
import com.ecobrains.lms.dto.request.SubmitExamRequest;
import com.ecobrains.lms.dto.response.*;
import com.ecobrains.lms.entity.*;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Production exam engine. Normal answer traffic is browser -> Redis, not
 * browser -> MySQL. MySQL is used for controlled checkpoints and finalization.
 */
@Service
public class StudentExamService {
    private final StudentRepository studentRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final ActivityLogRepository activityLogRepository;
    private final ExamService examService;
    private final QuestionService questionService;
    private final QuestionRepository questionRepository;
    private final RedisExamStateService redisState;
    private final SiteContentService siteContentService;
    private final ZoneId zoneId = ZoneId.of("Asia/Kolkata");

    public StudentExamService(StudentRepository studentRepository,
                               StudentAnswerRepository studentAnswerRepository,
                               ActivityLogRepository activityLogRepository,
                               ExamService examService,
                               QuestionService questionService,
                               QuestionRepository questionRepository,
                               RedisExamStateService redisState,
                               SiteContentService siteContentService) {
        this.studentRepository = studentRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.activityLogRepository = activityLogRepository;
        this.examService = examService;
        this.questionService = questionService;
        this.questionRepository = questionRepository;
        this.redisState = redisState;
        this.siteContentService = siteContentService;
    }

    @Transactional
    public ExamStateResponse getExam(Long studentId) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);
        ensureStudentAccessAllowed(student);
        Exam exam = requireExam(student);
        LocalDateTime now = LocalDateTime.now(zoneId);
        if (now.isAfter(exam.getEndTime())) {
            if (student.isExamStarted()) {
                submitExam(studentId, true, null, null);
            }
            throw ApiException.forbidden("This exam has ended.");
        }

        if ("RESTRICTED".equals(student.getExamAccessStatus()) && student.getRestrictionUntil() != null && student.getRestrictionUntil().isAfter(now)) {
            throw ApiException.forbidden("Examination access temporarily restricted. Please wait until the restriction period ends.");
        }
        if ("TERMINATED".equals(student.getExamAccessStatus())) {
            throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
        }
        try {
            RedisExamStateService.ExamSessionState state = redisState.get(exam.getId(), studentId).orElse(null);
            if (state != null && "RESTRICTED".equals(state.status()) && state.restrictionUntil() != null && !state.restrictionUntil().isAfter(Instant.now())) {
                state = redisState.reopen(exam.getId(), studentId);
            }
            if (state == null) {
                state = buildRedisState(student, exam);
                redisState.createOrRestore(exam.getId(), studentId, state.startedAt(), state.deadline(), state.status(),
                        state.questions(), state.answers(), state.correctAnswers());
                state = redisState.require(exam.getId(), studentId);
            }
            return toResponse(state, exam);
        } catch (RedisExamStateService.RedisUnavailableException e) {
            // Redis is only the live transport. If it is unavailable before a
            // paper has been created, freeze the complete question set in MySQL
            // once and continue the exam from there. This keeps the student-facing
            // exam alive instead of returning an infrastructure error.
            List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(studentId);
            if (existing.isEmpty()) {
                generateLegacyPaper(student);
            }
            return legacyExamResponse(student);
        }
    }

    private RedisExamStateService.ExamSessionState buildRedisState(Student student, Exam exam) {
        List<QuestionExamResponse> publicQuestions = new ArrayList<>();
        Map<Long, Integer> answers = new HashMap<>();
        Map<Long, Integer> correct = new HashMap<>();

        List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());

        // A paper already stored for this student is the frozen paper for that
        // attempt. Otherwise load the complete question bank once and shuffle
        // it by section exactly as the original exam engine did.
        List<Question> paperQuestions;
        if (!existing.isEmpty()) {
            paperQuestions = existing.stream().map(StudentAnswer::getQuestion).toList();
        } else {
            List<Question> allQuestions = questionService.getQuestionsForExam(student.getCourse().getId());
            if (allQuestions.isEmpty()) {
                throw ApiException.notFound("No questions found for this course. Please contact the administrator.");
            }

            Map<QuestionType, List<Question>> bySection = allQuestions.stream()
                    .collect(Collectors.groupingBy(Question::getType, LinkedHashMap::new, Collectors.toList()));

            paperQuestions = new ArrayList<>();
            for (QuestionType type : QuestionType.values()) {
                List<Question> section = new ArrayList<>(bySection.getOrDefault(type, List.of()));
                Collections.shuffle(section);
                paperQuestions.addAll(section);
            }
        }

        Map<Long, StudentAnswer> existingByQuestion = existing.stream()
                .collect(Collectors.toMap(a -> a.getQuestion().getId(), a -> a, (a, b) -> a));

        for (Question q : paperQuestions) {
            StudentAnswer old = existingByQuestion.get(q.getId());
            Integer selected = old != null && old.getSelectedOption() != null
                    ? old.getSelectedOption().index() : null;

            publicQuestions.add(new QuestionExamResponse(
                    q.getId(),
                    q.getType().name().toLowerCase(),
                    q.getQuestion(),
                    q.getOptionA(),
                    q.getOptionB(),
                    q.getOptionC(),
                    q.getOptionD(),
                    selected,
                    old != null && old.getTimeSpentSeconds() != null ? old.getTimeSpentSeconds() : 0
            ));

            if (selected != null) answers.put(q.getId(), selected);
            correct.put(q.getId(), q.getCorrectAnswer().index());
        }

        String status = student.isExamStarted() ? "ACTIVE" : "READY";
        Instant started = student.getStartedAt() == null
                ? null
                : student.getStartedAt().atZone(zoneId).toInstant();

        return new RedisExamStateService.ExamSessionState(
                student.getId(),
                exam.getId(),
                status,
                started,
                exam.getEndTime().atZone(zoneId).toInstant(),
                student.getCurrentQuestionIndex() == null ? 0 : student.getCurrentQuestionIndex(),
                student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations(),
                null,
                0,
                0,
                false,
                publicQuestions,
                answers,
                correct
        );
    }

    private ExamStateResponse legacyExamResponse(Student student) {
        List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        if (existing.isEmpty()) {
            throw ApiException.serviceUnavailable(
                    "Live examination state is temporarily unavailable. Your browser copy remains safe; please retry."
            );
        }

        Exam exam = requireExam(student);
        Instant now = LocalDateTime.now(zoneId).atZone(zoneId).toInstant();

        return new ExamStateResponse(
                existing.stream().map(this::toExamQuestion).toList(),
                student.getCurrentQuestionIndex() == null ? 0 : student.getCurrentQuestionIndex(),
                student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations(),
                student.isExamStarted(),
                student.isExamSubmitted(),
                now,
                exam.getStartTime().atZone(zoneId).toInstant(),
                exam.getEndTime().atZone(zoneId).toInstant(),
                student.isExamStarted() ? "ACTIVE" : "READY",
                null,
                0L
        );
    }

    private List<StudentAnswer> generateLegacyPaper(Student student) {
        List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        if (!existing.isEmpty()) return existing;

        List<Question> all = questionService.getQuestionsForExam(student.getCourse().getId());
        if (all.isEmpty()) {
            throw ApiException.notFound("No questions found for this course. Please contact the administrator.");
        }

        Map<QuestionType, List<Question>> bySection = all.stream()
                .collect(Collectors.groupingBy(Question::getType, LinkedHashMap::new, Collectors.toList()));

        List<StudentAnswer> out = new ArrayList<>();
        int order = 0;
        for (QuestionType type : QuestionType.values()) {
            List<Question> section = new ArrayList<>(bySection.getOrDefault(type, List.of()));
            Collections.shuffle(section);
            for (Question q : section) {
                out.add(StudentAnswer.builder()
                        .student(student)
                        .question(q)
                        .orderIndex(order++)
                        .timeSpentSeconds(0)
                        .build());
            }
        }
        return studentAnswerRepository.saveAll(out);
    }

    @Transactional
    public Map<String,Object> startExam(Long studentId) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);
        ensureStudentAccessAllowed(student);
        Exam exam = requireExam(student);
        LocalDateTime now = LocalDateTime.now(zoneId);
        if (now.isBefore(exam.getStartTime())) {
            throw ApiException.forbidden("This exam has not started yet. It begins at " + exam.getStartTime() + ".");
        }
        if (now.isAfter(exam.getEndTime())) throw ApiException.forbidden("This exam has ended.");

        if (!student.isExamStarted()) {
            student.setExamStarted(true);
            student.setExamAccessStatus("ACTIVE");
            student.setRestrictionUntil(null);
            student.setStartedAt(now);
            studentRepository.save(student);
            examService.lockOnFirstStart(exam);
            activityLogRepository.save(ActivityLog.builder().student(student).college(student.getCollege()).examCode(student.getExamCode())
                    .eventType(ActivityEventType.START_EXAM).build());
        }

        try {
            RedisExamStateService.ExamSessionState state = redisState.get(exam.getId(), studentId).orElse(null);
            if (state == null) {
                state = buildRedisState(student, exam);
                redisState.createOrRestore(exam.getId(), studentId, now.atZone(zoneId).toInstant(), exam.getEndTime().atZone(zoneId).toInstant(),
                        "ACTIVE", state.questions(), state.answers(), state.correctAnswers());
            } else {
                redisState.activate(exam.getId(), studentId, student.getStartedAt().atZone(zoneId).toInstant(), exam.getEndTime().atZone(zoneId).toInstant());
            }
        } catch (RedisExamStateService.RedisUnavailableException ignored) {
            // MySQL is the controlled fallback. Generate the frozen paper only
            // once; subsequent requests reuse the same StudentAnswer rows.
            List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(studentId);
            if (existing.isEmpty()) {
                generateLegacyPaper(student);
            }
        }
        return Map.of("message", "Exam started.", "startedAt", student.getStartedAt());
    }

    public Map<String,Object> saveProgress(Long studentId, SaveProgressBatchRequest req, HttpServletRequest httpRequest) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);
        ensureStudentAccessAllowed(student);
        Exam exam = requireExam(student);
        ensureNotExpired(student, exam, httpRequest);
        if (!student.isExamStarted()) throw ApiException.forbidden("Exam has not started.");

        try {
            var savedState = redisState.applyAnswers(exam.getId(), studentId, req);
            Map<String,Object> response = new LinkedHashMap<>();
            response.put("message", "Progress synchronized.");
            response.put("stateVersion", savedState.stateVersion());
            response.put("tabSwitchViolations", currentViolations(exam.getId(), studentId, student));
            response.put("currentQuestionIndex", savedState.currentQuestionIndex());
            response.put("answeredCount", savedState.answers().values().stream().filter(Objects::nonNull).count());
            response.put("totalQuestions", savedState.questions().size());
            response.put("answers", savedState.answers());
            response.put("serverNow", Instant.now());
            return response;
        } catch (RedisExamStateService.RedisUnavailableException e) {
            // Rare infrastructure fallback: preserve the old MySQL path only while Redis is unavailable.
            return legacySaveProgress(student, req, httpRequest);
        }
    }

    @Transactional
    public Map<String,Object> recordTabSwitch(Long studentId, SaveProgressBatchRequest req, HttpServletRequest httpRequest) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);
        Exam exam = requireExam(student);
        ensureNotExpired(student, exam, httpRequest);
        try {
            RedisExamStateService.ViolationResult result = redisState.recordViolation(exam.getId(), studentId, req);
            student.setTabSwitchViolations(result.violationCount());
            student.setExamAccessStatus(result.status());
            student.setRestrictionUntil(result.restrictionUntil() == null ? null : LocalDateTime.ofInstant(result.restrictionUntil(), zoneId));
            student.setLastSavedAt(LocalDateTime.now(zoneId));
            studentRepository.save(student);
            activityLogRepository.save(ActivityLog.builder().student(student).college(student.getCollege()).examCode(student.getExamCode())
                    .eventType(ActivityEventType.TAB_SWITCH).violationCount(result.violationCount())
                    .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null).build());

            // Third violation is authoritative server-side: persist the
            // latest Redis answers, calculate the score, finalize the exam,
            // and only then let the client leave the exam. There is no admin
            // resume path for a violation-terminated attempt.
            if ("TERMINATED".equals(result.status())) {
                var terminatedState = redisState.require(exam.getId(), studentId);
                persistState(student, terminatedState);
                markSubmitted(student, true, httpRequest, terminatedState.correctAnswers());
                return Map.of("status", "COMPLETED", "violationCount", result.violationCount(),
                        "submitted", true, "restrictionUntil", "");
            }

            return Map.of("status", result.status(), "violationCount", result.violationCount(),
                    "restrictionUntil", result.restrictionUntil() == null ? "" : result.restrictionUntil().toString(),
                    "submitted", false);
        } catch (RedisExamStateService.RedisUnavailableException e) {
            // The critical violation is still recorded in MySQL when Redis is
            // unavailable; the student is not silently allowed to bypass policy.
            int count = (student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations()) + 1;
            String status = count >= 3 ? "TERMINATED" : "RESTRICTED";
            LocalDateTime until = count >= 3 ? null : LocalDateTime.now(zoneId).plusMinutes(5);
            student.setTabSwitchViolations(count);
            student.setExamAccessStatus(status);
            student.setRestrictionUntil(until);
            student.setLastSavedAt(LocalDateTime.now(zoneId));
            studentRepository.save(student);
            activityLogRepository.save(ActivityLog.builder().student(student).college(student.getCollege()).examCode(student.getExamCode())
                    .eventType(ActivityEventType.TAB_SWITCH).violationCount(count)
                    .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null).build());
            if (count >= 3) {
                SubmitExamRequest submitRequest = new SubmitExamRequest(true, req == null ? List.of() : req.answers(),
                        req == null ? null : req.currentQuestionIndex(), req == null ? null : req.clientSequence());
                finalizeFromRequestOrMySql(student, submitRequest, true, httpRequest);
                return Map.of("status", "COMPLETED", "violationCount", count, "submitted", true, "restrictionUntil", "");
            }
            return Map.of("status", status, "violationCount", count, "restrictionUntil", until == null ? "" : until.atZone(zoneId).toInstant().toString(), "submitted", false);
        }
    }

    /**
     * Manual submission is only a Redis finalization request. It never writes
     * the permanent result directly to MySQL. The exam finalizer performs the
     * single authoritative Redis -> MySQL write at the end of the slot.
     */
    public SubmitExamResponse requestFinalization(Long studentId, SubmitExamRequest request, HttpServletRequest httpRequest) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);
        ensureStudentAccessAllowed(student);
        Exam exam = requireExam(student);

        long remaining = Math.max(0, exam.getEndTime().atZone(zoneId).toInstant().toEpochMilli() - Instant.now().toEpochMilli());
        if (remaining > siteContentService.getManualSubmitWindowMinutes() * 60_000L) {
            throw ApiException.forbidden("Manual submission is available only in the final " + siteContentService.getManualSubmitWindowMinutes() + " minutes.");
        }

        try {
            RedisExamStateService.ExamSessionState state = redisState.requestFinalization(exam.getId(), studentId,
                    request == null ? new SaveProgressBatchRequest(List.of(), null, false, null)
                            : new SaveProgressBatchRequest(request.answers(), request.currentQuestionIndex(), false, request.clientSequence()));
            return new SubmitExamResponse(
                    "Your exam submission has been recorded. The final result will be saved when the examination slot is finalized.",
                    true,
                    null);
        } catch (RedisExamStateService.RedisUnavailableException e) {
            // Do not fall back to direct MySQL final submission here. The
            // browser retains the complete local answer snapshot and can retry
            // the Redis request without risking a second permanent write path.
            throw ApiException.serviceUnavailable("The examination service is temporarily busy. Please try again.");
        }
    }

    @Transactional
    public SubmitExamResponse submitExam(Long studentId, boolean autoSubmitted, SubmitExamRequest request, HttpServletRequest httpRequest) {
        Student student = studentRepository.findByIdForUpdate(studentId).orElseThrow(() -> ApiException.notFound("Student not found."));
        if (student.isExamSubmitted()) return new SubmitExamResponse("Exam already submitted.", true, currentScores(student));
        Exam exam = requireExam(student);
        if (!autoSubmitted) {
            long remaining = Math.max(0, exam.getEndTime().atZone(zoneId).toInstant().toEpochMilli() - Instant.now().toEpochMilli());
            if (remaining > siteContentService.getManualSubmitWindowMinutes() * 60_000L) {
                throw ApiException.forbidden("Manual submission is available only in the final " + siteContentService.getManualSubmitWindowMinutes() + " minutes.");
            }
        }

        RedisExamStateService.ExamSessionState state = null;
        try {
            state = redisState.get(exam.getId(), studentId).orElse(null);
            // Auto finalization normally receives no request body. If a legacy
            // caller still sends a complete snapshot, merge it into Redis first
            // so the finalizer always scores the newest state.
            if (state != null && request != null && request.answers() != null && !request.answers().isEmpty()
                    && !"COMPLETED".equals(state.status())) {
                Map<Long,Integer> merged = new HashMap<>(state.answers());
                for (var a : request.answers()) merged.put(a.questionId(), a.selectedOptionIndex());
                state = new RedisExamStateService.ExamSessionState(state.studentId(), state.examId(), state.status(), state.startedAt(), state.deadline(),
                        request.currentQuestionIndex() != null ? request.currentQuestionIndex() : state.currentQuestionIndex(),
                        state.tabSwitchCount(), state.restrictionUntil(), Math.max(state.stateVersion() + 1, request.clientSequence() == null ? 0 : request.clientSequence()),
                        state.checkpointVersion(), true, state.questions(), merged, state.correctAnswers());
                redisState.save(state);
            }
        } catch (RedisExamStateService.RedisUnavailableException ignored) {
            state = null;
        }

        if (state != null) return finalizeFromRedis(student, state, autoSubmitted, httpRequest);
        return finalizeFromRequestOrMySql(student, request, autoSubmitted, httpRequest);
    }

    @Transactional
    public SubmitExamResponse forceSubmitByAdmin(Long examId, Long studentId) {
        Student student = studentRepository.findByIdForUpdate(studentId)
                .orElseThrow(() -> ApiException.notFound("Student not found."));
        if (student.getExam() == null || !examId.equals(student.getExam().getId())) {
            throw ApiException.badRequest("Student is not registered for this drive.");
        }
        if (student.isExamSubmitted()) return new SubmitExamResponse("Exam already submitted.", true, currentScores(student));
        RedisExamStateService.ExamSessionState state = null;
        try {
            state = redisState.get(examId, studentId).orElse(null);
            if (state != null) persistState(student, state);
        } catch (RedisExamStateService.RedisUnavailableException ignored) {
            List<StudentAnswer> dbAnswers = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(studentId);
            if (dbAnswers.isEmpty()) {
                throw ApiException.serviceUnavailable("Live exam state is temporarily unavailable; force submit cannot safely finalize this attempt without the frozen paper. Please retry after Redis recovers.");
            }
        }
        return markSubmitted(student, true, null, state == null ? Map.of() : state.correctAnswers());
    }

    @Transactional
    public TimeStatusResponse getTimeStatus(Long studentId) {
        Student student = getStudent(studentId);
        Instant now = LocalDateTime.now(zoneId).atZone(zoneId).toInstant();
        if (student.isExamSubmitted()) return new TimeStatusResponse(true, now, null, null, 0, true, "COMPLETED", null, 0);
        Exam exam = requireExam(student);
        String status = student.getExamAccessStatus() != null ? student.getExamAccessStatus() : (student.isExamStarted() ? "ACTIVE" : "READY");
        if (student.isExamStarted() && LocalDateTime.now(zoneId).isAfter(exam.getEndTime())) {
            submitExam(studentId, true, null, null);
            return new TimeStatusResponse(true, now, exam.getStartTime().atZone(zoneId).toInstant(), exam.getEndTime().atZone(zoneId).toInstant(), 0, true, "COMPLETED", null, student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations());
        }
        Instant restrictionUntil = student.getRestrictionUntil() == null ? null : student.getRestrictionUntil().atZone(zoneId).toInstant();
        int violations = student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations();
        try {
            var state = redisState.get(exam.getId(), studentId).orElse(null);
            if (state != null) {
                if ("RESTRICTED".equals(state.status()) && state.restrictionUntil() != null && !state.restrictionUntil().isAfter(Instant.now())) {
                    state = redisState.reopen(exam.getId(), studentId);
                }
                status = state.status(); restrictionUntil = state.restrictionUntil(); violations = state.tabSwitchCount();
            }
        } catch (RedisExamStateService.RedisUnavailableException ignored) { }
        long remaining = Math.max(0, exam.getEndTime().atZone(zoneId).toInstant().toEpochMilli() - now.toEpochMilli());
        boolean expired = remaining == 0;
        return new TimeStatusResponse(false, now, exam.getStartTime().atZone(zoneId).toInstant(), exam.getEndTime().atZone(zoneId).toInstant(), remaining, expired,
                status, restrictionUntil, violations);
    }

    private SubmitExamResponse finalizeFromRedis(Student student, RedisExamStateService.ExamSessionState state, boolean auto, HttpServletRequest request) {
        persistState(student, state);
        return markSubmitted(student, auto, request, state.correctAnswers());
    }

    private SubmitExamResponse finalizeFromRequestOrMySql(Student student, SubmitExamRequest request, boolean auto, HttpServletRequest httpRequest) {
        if (request != null && request.answers() != null && !request.answers().isEmpty()) {
            List<SaveProgressBatchRequest.AnswerEntry> incoming = request.answers().stream()
                    .filter(a -> a.questionId() != null).toList();
            Map<Long,Question> questions = new HashMap<>();
            for (Question q : questionRepository.findAllById(incoming.stream().map(SaveProgressBatchRequest.AnswerEntry::questionId).toList())) questions.put(q.getId(), q);

            // The submit request contains the complete browser paper. When
            // Redis is unavailable this is the safest source for finalization:
            // rebuild the permanent answer set exactly from that frozen paper,
            // preventing any older 60/100-row DB paper from changing the result denominator.
            studentAnswerRepository.deleteByStudentId(student.getId());
            List<StudentAnswer> dbAnswers = new ArrayList<>();
            for (int order = 0; order < incoming.size(); order++) {
                var entry = incoming.get(order);
                Question q = questions.get(entry.questionId());
                if (q == null) continue;
                dbAnswers.add(StudentAnswer.builder().student(student).question(q).orderIndex(order)
                        .timeSpentSeconds(entry.timeSpentInSeconds() == null ? 0 : entry.timeSpentInSeconds())
                        .selectedOption(AnswerOption.fromIndex(entry.selectedOptionIndex())).build());
            }
            if (!dbAnswers.isEmpty()) studentAnswerRepository.saveAll(dbAnswers);
        } else {
            List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
            if (existing.isEmpty()) generateLegacyPaper(student);
        }
        return markSubmitted(student, auto, httpRequest, Map.of());
    }

    private void persistState(Student student, RedisExamStateService.ExamSessionState state) {
        List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        Set<Long> existingIds = existing.stream().map(a -> a.getQuestion().getId()).collect(Collectors.toSet());
        Set<Long> stateIds = state.questions().stream().map(QuestionExamResponse::id).collect(Collectors.toSet());

        Map<Long,StudentAnswer> byId = new HashMap<>();
        for (StudentAnswer a : existing) byId.put(a.getQuestion().getId(), a);

        Map<Long,Question> questions = new HashMap<>();
        for (Question q : questionRepository.findAllById(state.questions().stream().map(QuestionExamResponse::id).toList())) questions.put(q.getId(), q);

        // If an old/partial paper exists, replace only the permanent paper
        // rows with the frozen Redis paper. This prevents a legacy 60/100-row
        // answer set from changing the paper size or percentage calculation.
        if (!existingIds.equals(stateIds)) {
            studentAnswerRepository.deleteByStudentId(student.getId());
            byId.clear();
        }

        List<StudentAnswer> toSave = new ArrayList<>();
        for (int i=0;i<state.questions().size();i++) {
            var p = state.questions().get(i); Question q = questions.get(p.id()); if (q == null) continue;
            StudentAnswer old = byId.get(q.getId());
            StudentAnswer a = old == null
                    ? StudentAnswer.builder().student(student).question(q).orderIndex(i).timeSpentSeconds(0).build()
                    : old;
            a.setOrderIndex(i);
            a.setSelectedOption(AnswerOption.fromIndex(state.answers().get(q.getId())));
            toSave.add(a);
        }
        if (!toSave.isEmpty()) studentAnswerRepository.saveAll(toSave);
        student.setCurrentQuestionIndex(state.currentQuestionIndex());
    }

    private SubmitExamResponse markSubmitted(Student student, boolean auto, HttpServletRequest httpRequest, Map<Long,Integer> frozenCorrectAnswers) {
        List<StudentAnswer> answers = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        Map<QuestionType,Integer> scores = new EnumMap<>(QuestionType.class);
        for (QuestionType t : QuestionType.values()) scores.put(t,0);
        for (StudentAnswer a : answers) {
            Integer frozenCorrect = frozenCorrectAnswers.get(a.getQuestion().getId());
            boolean correct = a.getSelectedOption() != null && (frozenCorrect != null
                    ? a.getSelectedOption().index() == frozenCorrect
                    : a.getSelectedOption() == a.getQuestion().getCorrectAnswer());
            a.setCorrect(correct);
            if (correct) scores.put(a.getQuestion().getType(), scores.get(a.getQuestion().getType()) + 1);
        }
        studentAnswerRepository.saveAll(answers);
        student.setAptitudeScore(scores.getOrDefault(QuestionType.APTITUDE,0));
        student.setLogicalScore(scores.getOrDefault(QuestionType.LOGICAL,0));
        student.setTechnicalScore(scores.getOrDefault(QuestionType.PROGRAMMING,0));
        student.setFrontendScore(scores.getOrDefault(QuestionType.FRONTEND,0));
        student.setTotalScore(scores.values().stream().mapToInt(Integer::intValue).sum());
        student.setExamSubmitted(true);
        student.setExamAccessStatus("COMPLETED");
        student.setRestrictionUntil(null);
        student.setLastSavedAt(LocalDateTime.now(zoneId));
        studentRepository.save(student);
        activityLogRepository.save(ActivityLog.builder().student(student).college(student.getCollege()).examCode(student.getExamCode())
                .eventType(auto ? ActivityEventType.AUTO_SUBMIT : ActivityEventType.MANUAL_SUBMIT)
                .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null).build());
        // Do not delete/close Redis before the surrounding MySQL transaction has
        // committed. The final Redis snapshot is intentionally retained for
        // reconciliation/recovery; its normal TTL performs eventual cleanup.
        return new SubmitExamResponse(auto ? "Exam time is over. Your exam was automatically submitted." : "Exam submitted successfully.", true, currentScores(student));
    }

    private Map<String,Object> legacySaveProgress(Student student, SaveProgressBatchRequest req, HttpServletRequest httpRequest) {
        List<StudentAnswer> db = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        Map<Long,StudentAnswer> byId = db.stream().collect(Collectors.toMap(a -> a.getQuestion().getId(), a -> a));
        for (var e : req.answers() == null ? List.<SaveProgressBatchRequest.AnswerEntry>of() : req.answers()) {
            StudentAnswer a = byId.get(e.questionId());
            if (a != null) a.setSelectedOption(AnswerOption.fromIndex(e.selectedOptionIndex()));
        }
        studentAnswerRepository.saveAll(db);
        if (req.currentQuestionIndex() != null) student.setCurrentQuestionIndex(req.currentQuestionIndex());
        student.setLastSavedAt(LocalDateTime.now(zoneId));
        studentRepository.save(student);
        return Map.of("message", "Progress saved using emergency database fallback.", "tabSwitchViolations", student.getTabSwitchViolations());
    }

    private void ensureNotExpired(Student student, Exam exam, HttpServletRequest request) {
        if (LocalDateTime.now(zoneId).isAfter(exam.getEndTime())) {
            submitExam(student.getId(), true, null, request);
            throw ApiException.forbidden("Exam time is over.");
        }
    }

    private int currentViolations(Long examId, Long studentId, Student fallback) {
        try { return redisState.require(examId, studentId).tabSwitchCount(); } catch (Exception e) { return fallback.getTabSwitchViolations() == null ? 0 : fallback.getTabSwitchViolations(); }
    }

    private ExamStateResponse toResponse(RedisExamStateService.ExamSessionState state, Exam exam) {
        List<QuestionExamResponse> questions = new ArrayList<>();
        for (QuestionExamResponse q : state.questions()) {
            Integer selected = state.answers().get(q.id());
            questions.add(new QuestionExamResponse(q.id(), q.type(), q.question(), q.optionA(), q.optionB(), q.optionC(), q.optionD(), selected, q.timeSpentInSeconds()));
        }
        return new ExamStateResponse(questions, state.currentQuestionIndex(), state.tabSwitchCount(), "ACTIVE".equals(state.status()),
                "COMPLETED".equals(state.status()), Instant.now(), exam.getStartTime().atZone(zoneId).toInstant(), state.deadline(),
                state.status(), state.restrictionUntil(), state.stateVersion());
    }

    private QuestionExamResponse toExamQuestion(StudentAnswer a) {
        Question q = a.getQuestion();
        return new QuestionExamResponse(q.getId(), q.getType().name().toLowerCase(), q.getQuestion(), q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                a.getSelectedOption() == null ? null : a.getSelectedOption().index(), a.getTimeSpentSeconds());
    }

    private void ensureStudentAccessAllowed(Student student) {
        if ("TERMINATED".equals(student.getExamAccessStatus())) {
            throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
        }
        if ("RESTRICTED".equals(student.getExamAccessStatus()) && student.getRestrictionUntil() != null) {
            if (student.getRestrictionUntil().isAfter(LocalDateTime.now(zoneId))) {
                throw ApiException.forbidden("Examination access temporarily restricted. Please wait until the restriction period ends.");
            }
            student.setExamAccessStatus("ACTIVE");
            student.setRestrictionUntil(null);
            studentRepository.save(student);
        }
    }

    private Exam requireExam(Student student) {
        if (student.getExam() == null) throw ApiException.forbidden("No examination is assigned to this student.");
        return student.getExam();
    }
    private Student getStudent(Long id) { return studentRepository.findById(id).orElseThrow(() -> ApiException.notFound("Student not found.")); }
    private void requireNotSubmitted(Student student) { if (student.isExamSubmitted()) throw ApiException.forbidden("Exam already submitted."); }
    private ScoresResponse currentScores(Student s) { return new ScoresResponse(s.getAptitudeScore(),s.getLogicalScore(),s.getTechnicalScore(),s.getFrontendScore(),s.getTotalScore()); }
}
