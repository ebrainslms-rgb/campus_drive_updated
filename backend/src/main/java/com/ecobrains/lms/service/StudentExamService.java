package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.SaveProgressBatchRequest;
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
 * The exam-taking engine: jumbling, resume-after-refresh, per-answer save, tab-switch
 * tracking, manual + server-enforced auto submit, and section scoring.
 * The server is the single source of truth for timing - the frontend countdown is
 * only a UX convenience; every mutating call here re-checks the deadline itself.
 */
@Service
public class StudentExamService {

    private final StudentRepository studentRepository;
    private final QuestionRepository questionRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final ActivityLogRepository activityLogRepository;
    private final ExamService examService;
    private final ZoneId zoneId = ZoneId.of("Asia/Kolkata");

    public StudentExamService(StudentRepository studentRepository, QuestionRepository questionRepository,
                               StudentAnswerRepository studentAnswerRepository,
                               ActivityLogRepository activityLogRepository, ExamService examService) {
        this.studentRepository = studentRepository;
        this.questionRepository = questionRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.activityLogRepository = activityLogRepository;
        this.examService = examService;
    }

    @Transactional
    public ExamStateResponse getExam(Long studentId) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);

        SubmitExamResponse autoSubmit = enforceDeadlineOrAutoSubmit(student, null);
        if (autoSubmit != null) {
            throw ApiException.forbidden(autoSubmit.message());
        }

        List<StudentAnswer> existing = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());

        if (existing.isEmpty()) {
            existing = generateJumbledPaper(student);
        }

        List<QuestionExamResponse> questions = existing.stream()
                .map(this::toExamQuestion)
                .toList();

        return new ExamStateResponse(
                questions, student.getCurrentQuestionIndex(), student.getTabSwitchViolations(),
                student.isExamStarted(), student.isExamSubmitted(),
                LocalDateTime.now().atZone(zoneId).toInstant(),
                student.getExam() != null ? student.getExam().getStartTime().atZone(zoneId).toInstant() : null,
                student.getExam() != null ? student.getExam().getEndTime().atZone(zoneId).toInstant() : null
        );
    }

    private List<StudentAnswer> generateJumbledPaper(Student student) {
        List<Question> allQuestions = questionRepository.findByCourseId(student.getCourse().getId());
        if (allQuestions.isEmpty()) {
            throw ApiException.notFound("No questions found for this course. Please contact the administrator.");
        }

        Map<QuestionType, List<Question>> bySection = allQuestions.stream()
                .collect(Collectors.groupingBy(Question::getType, LinkedHashMap::new, Collectors.toList()));

        List<Question> jumbled = new ArrayList<>();
        for (QuestionType type : QuestionType.values()) {
            List<Question> section = new ArrayList<>(bySection.getOrDefault(type, List.of()));
            Collections.shuffle(section);
            jumbled.addAll(section);
        }

        List<StudentAnswer> answers = new ArrayList<>();
        int idx = 0;
        for (Question q : jumbled) {
            answers.add(studentAnswerRepository.save(StudentAnswer.builder()
                    .student(student).question(q).orderIndex(idx++).timeSpentSeconds(0).build()));
        }
        return answers;
    }

    @Transactional
    public Map<String, Object> startExam(Long studentId) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);

        SubmitExamResponse autoSubmit = enforceDeadlineOrAutoSubmit(student, null);
        if (autoSubmit != null) {
            throw ApiException.forbidden(autoSubmit.message());
        }

        // The student may have logged in and be waiting on the pre-exam
        // screen well before the slot opens - that's allowed. Actually
        // *starting* is what's gated to the scheduled window, enforced here
        // server-side regardless of what the frontend countdown shows.
        if (student.getExam() != null && LocalDateTime.now().isBefore(student.getExam().getStartTime())) {
            throw ApiException.forbidden("This exam has not started yet. It begins at " + student.getExam().getStartTime() + ".");
        }

        if (!student.isExamStarted()) {
            student.setExamStarted(true);
            student.setStartedAt(LocalDateTime.now());
            studentRepository.save(student);

            if (student.getExam() != null) {
                examService.lockOnFirstStart(student.getExam());
            }

            activityLogRepository.save(ActivityLog.builder()
                    .student(student).college(student.getCollege()).examCode(student.getExamCode())
                    .eventType(ActivityEventType.START_EXAM).build());
        }

        return Map.of("message", "Exam started.", "startedAt", student.getStartedAt());
    }

    @Transactional
    public Map<String, Object> saveProgress(Long studentId, SaveProgressBatchRequest req, HttpServletRequest httpRequest) {
        Student student = getStudent(studentId);
        requireNotSubmitted(student);

        SubmitExamResponse autoSubmit = enforceDeadlineOrAutoSubmit(student, httpRequest);
        if (autoSubmit != null) {
            throw ApiException.forbidden(autoSubmit.message());
        }

        List<SaveProgressBatchRequest.AnswerEntry> incoming = req.answers() != null ? req.answers() : List.of();
        if (!incoming.isEmpty()) {
            // ONE load of the student's full answer list, not one per
            // question - this was previously happening once for EACH of
            // the 5 questions on a page (5 full-list loads just to update
            // 5 individual rows). Built into a map for O(1) lookup below.
            Map<Long, StudentAnswer> byQuestionId = studentAnswerRepository
                    .findByStudentIdOrderByOrderIndexAsc(student.getId()).stream()
                    .collect(Collectors.toMap(a -> a.getQuestion().getId(), a -> a));

            List<StudentAnswer> toSave = new ArrayList<>();
            for (SaveProgressBatchRequest.AnswerEntry entry : incoming) {
                StudentAnswer answer = byQuestionId.get(entry.questionId());
                if (answer == null) continue;
                if (entry.selectedOptionIndex() != null) {
                    answer.setSelectedOption(AnswerOption.fromIndex(entry.selectedOptionIndex()));
                }
                if (entry.timeSpentInSeconds() != null) {
                    answer.setTimeSpentSeconds(entry.timeSpentInSeconds());
                }
                toSave.add(answer);
            }

            if (!toSave.isEmpty()) {
                studentAnswerRepository.saveAll(toSave);
                // ONE audit log entry for the whole page-save, not one per
                // question (previously 5 ANSWER_SAVED inserts per page,
                // now 1). Doesn't reference a single question any more,
                // since this now covers a batch of them.
                activityLogRepository.save(ActivityLog.builder()
                        .student(student).college(student.getCollege()).examCode(student.getExamCode())
                        .eventType(ActivityEventType.ANSWER_SAVED)
                        .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null)
                        .build());
            }
        }

        if (req.currentQuestionIndex() != null) {
            student.setCurrentQuestionIndex(req.currentQuestionIndex());
        }

        if (Boolean.TRUE.equals(req.tabSwitch())) {
            student.setTabSwitchViolations(student.getTabSwitchViolations() + 1);
            activityLogRepository.save(ActivityLog.builder()
                    .student(student).college(student.getCollege()).examCode(student.getExamCode())
                    .eventType(ActivityEventType.TAB_SWITCH)
                    .violationCount(student.getTabSwitchViolations())
                    .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null)
                    .build());
        }

        student.setLastSavedAt(LocalDateTime.now());
        // Only ONCE per page-save now, not once per question (was 5x per
        // page) - combined with @DynamicUpdate on Student, this is both
        // 5x fewer of these writes AND each one only touches the columns
        // that actually changed.
        studentRepository.save(student);

        return Map.of("message", "Progress saved.", "tabSwitchViolations", student.getTabSwitchViolations());
    }

    @Transactional
    public SubmitExamResponse submitExam(Long studentId, boolean autoSubmitted, HttpServletRequest httpRequest) {
        // Locked read (see StudentRepository.findByIdForUpdate) - closes the
        // race where two near-simultaneous submit calls for the same
        // student could both see examSubmitted=false and both try to score.
        // A second concurrent call now blocks here until the first commits,
        // then correctly sees examSubmitted=true below and short-circuits.
        Student student = studentRepository.findByIdForUpdate(studentId)
                .orElseThrow(() -> ApiException.notFound("Student not found."));

        if (student.isExamSubmitted()) {
            return new SubmitExamResponse("Exam already submitted.", true, currentScores(student));
        }

        return scoreAndPersist(student, autoSubmitted, httpRequest);
    }

    @Transactional
    public TimeStatusResponse getTimeStatus(Long studentId) {
        Student student = getStudent(studentId);

        if (student.isExamSubmitted()) {
            Instant now = LocalDateTime.now().atZone(zoneId).toInstant();
            return new TimeStatusResponse(true, now, null, null, 0, true);
        }

        SubmitExamResponse autoSubmit = enforceDeadlineOrAutoSubmit(student, null);
        Instant now = LocalDateTime.now().atZone(zoneId).toInstant();
        if (autoSubmit != null) {
            return new TimeStatusResponse(true, now, null, null, 0, true);
        }

        Exam exam = student.getExam();
        Instant slotEnd = exam != null ? exam.getEndTime().atZone(zoneId).toInstant() : null;
        Instant slotStart = exam != null ? exam.getStartTime().atZone(zoneId).toInstant() : null;
        long remainingMs = slotEnd != null ? Math.max(0, slotEnd.toEpochMilli() - now.toEpochMilli()) : 0;
        boolean expired = slotEnd != null && now.isAfter(slotEnd);

        return new TimeStatusResponse(false, now, slotStart, slotEnd, remainingMs, expired);
    }

    // -- Helpers ----------------------------------------------------------

    private SubmitExamResponse enforceDeadlineOrAutoSubmit(Student student, HttpServletRequest httpRequest) {
        if (student.isExamSubmitted() || student.getExam() == null) return null;
        if (LocalDateTime.now().isAfter(student.getExam().getEndTime())) {
            return scoreAndPersist(student, true, httpRequest);
        }
        return null;
    }

    private SubmitExamResponse scoreAndPersist(Student student, boolean autoSubmitted, HttpServletRequest httpRequest) {
        List<StudentAnswer> answers = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());

        Map<QuestionType, Integer> sectionScores = new EnumMap<>(QuestionType.class);
        for (QuestionType t : QuestionType.values()) sectionScores.put(t, 0);

        for (StudentAnswer a : answers) {
            boolean correct = a.getSelectedOption() != null && a.getSelectedOption() == a.getQuestion().getCorrectAnswer();
            a.setCorrect(correct);
            if (correct) {
                QuestionType type = a.getQuestion().getType();
                sectionScores.put(type, sectionScores.get(type) + 1);
            }
        }
        studentAnswerRepository.saveAll(answers);

        int total = sectionScores.values().stream().mapToInt(Integer::intValue).sum();

        student.setAptitudeScore(sectionScores.get(QuestionType.APTITUDE));
        student.setLogicalScore(sectionScores.get(QuestionType.LOGICAL));
        student.setTechnicalScore(sectionScores.get(QuestionType.PROGRAMMING));
        student.setFrontendScore(sectionScores.get(QuestionType.FRONTEND));
        student.setTotalScore(total);
        student.setExamSubmitted(true);
        student.setLastSavedAt(LocalDateTime.now());
        studentRepository.save(student);

        activityLogRepository.save(ActivityLog.builder()
                .student(student).college(student.getCollege()).examCode(student.getExamCode())
                .eventType(autoSubmitted ? ActivityEventType.AUTO_SUBMIT : ActivityEventType.MANUAL_SUBMIT)
                .ipAddress(httpRequest != null ? httpRequest.getRemoteAddr() : null)
                .build());

        String message = autoSubmitted
                ? "Exam time is over. Your exam was automatically submitted."
                : "Exam submitted successfully.";

        return new SubmitExamResponse(message, true, currentScores(student));
    }

    private ScoresResponse currentScores(Student student) {
        return new ScoresResponse(student.getAptitudeScore(), student.getLogicalScore(),
                student.getTechnicalScore(), student.getFrontendScore(), student.getTotalScore());
    }

    private QuestionExamResponse toExamQuestion(StudentAnswer a) {
        Question q = a.getQuestion();
        return new QuestionExamResponse(
                q.getId(), q.getType().name().toLowerCase(), q.getQuestion(),
                q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                a.getSelectedOption() != null ? a.getSelectedOption().index() : null,
                a.getTimeSpentSeconds()
        );
    }

    private Student getStudent(Long id) {
        return studentRepository.findById(id).orElseThrow(() -> ApiException.notFound("Student not found."));
    }

    private void requireNotSubmitted(Student student) {
        if (student.isExamSubmitted()) {
            throw ApiException.forbidden("Exam already submitted.");
        }
    }
}
