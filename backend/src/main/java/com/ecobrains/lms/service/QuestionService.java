package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.AddQuestionRequest;
import com.ecobrains.lms.dto.request.UpdateQuestionRequest;
import com.ecobrains.lms.dto.response.CourseQuestionsResponse;
import com.ecobrains.lms.dto.response.QuestionDetailResponse;

import com.ecobrains.lms.dto.response.QuestionStatsResponse;
import com.ecobrains.lms.dto.response.QuestionUploadResponse;
import com.ecobrains.lms.dto.response.UploadHistoryEntryResponse;
import com.ecobrains.lms.entity.*;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.repository.ActivityLogRepository;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.repository.QuestionRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import com.ecobrains.lms.security.CurrentUser;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Handles the admin CSV question-bank upload for a course (replaces the course's question set). */
@Service
public class QuestionService {

    private static final Set<String> VALID_TYPES = Set.of("aptitude", "logical", "programming", "frontend", "health");
    private static final Set<String> VALID_ANSWERS = Set.of("A", "B", "C", "D");

    private final QuestionRepository questionRepository;
    private final CourseRepository courseRepository;
    private final AdminLogRepository adminLogRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final ActivityLogRepository activityLogRepository;
    private final StudentRepository studentRepository;
    private final org.springframework.cache.CacheManager cacheManager;

    public QuestionService(QuestionRepository questionRepository, CourseRepository courseRepository,
                            AdminLogRepository adminLogRepository, StudentAnswerRepository studentAnswerRepository,
                            ActivityLogRepository activityLogRepository, StudentRepository studentRepository,
                            org.springframework.cache.CacheManager cacheManager) {
        this.questionRepository = questionRepository;
        this.courseRepository = courseRepository;
        this.adminLogRepository = adminLogRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.activityLogRepository = activityLogRepository;
        this.studentRepository = studentRepository;
        this.cacheManager = cacheManager;
    }

    @Transactional
    @CacheEvict(value = "courseQuestions", key = "#courseId")
    public QuestionUploadResponse upload(Long courseId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("No file uploaded.");

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.badRequest("Selected course is inactive or not found."));
        if (!course.isActive()) throw ApiException.badRequest("Cannot upload questions: selected course is inactive.");

        // Parse and validate the complete file BEFORE touching the existing
        // question bank. The old order deleted the bank first and only then
        // discovered malformed rows, which could leave a course with a partial
        // paper. This is now all-or-nothing.
        List<Question> validDocs = new ArrayList<>();
        List<String> skipReasons = new ArrayList<>();

        try (var reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8)) {
            CSVParser parser = CSVFormat.DEFAULT.builder()
                    .setHeader().setSkipHeaderRecord(true).setIgnoreSurroundingSpaces(true)
                    .build().parse(reader);

            int rowIndex = 1;
            for (CSVRecord record : parser) {
                rowIndex++;
                String type = get(record, "type").toLowerCase();
                String question = get(record, "question");
                String optionA = get(record, "optionA");
                String optionB = get(record, "optionB");
                String optionC = get(record, "optionC");
                String optionD = get(record, "optionD");
                String correctAnswer = get(record, "correctAnswer");
                if (correctAnswer.isBlank()) correctAnswer = get(record, "correctAns");
                correctAnswer = correctAnswer.toUpperCase();

                if (!VALID_TYPES.contains(type)) {
                    skipReasons.add("Row " + rowIndex + ": invalid type \"" + type + "\". Must be aptitude, logical, programming, frontend, or health.");
                    continue;
                }
                if (question.isBlank() || optionA.isBlank() || optionB.isBlank() || optionC.isBlank() || optionD.isBlank()) {
                    skipReasons.add("Row " + rowIndex + ": one or more required fields (question, optionA-D) are empty.");
                    continue;
                }
                if (!VALID_ANSWERS.contains(correctAnswer)) {
                    skipReasons.add("Row " + rowIndex + ": invalid correctAnswer \"" + correctAnswer + "\". Must be A, B, C, or D.");
                    continue;
                }

                validDocs.add(Question.builder()
                        .course(course)
                        .type(QuestionType.valueOf(type.toUpperCase()))
                        .question(question).optionA(optionA).optionB(optionB).optionC(optionC).optionD(optionD)
                        .correctAnswer(AnswerOption.valueOf(correctAnswer))
                        .build());
            }
        } catch (IOException e) {
            throw ApiException.badRequest("Could not read the uploaded file: " + e.getMessage());
        }

        if (!skipReasons.isEmpty()) {
            throw ApiException.badRequest("Question upload rejected. Fix the invalid rows and upload the complete file again. " + String.join(" | ", skipReasons));
        }


        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Kolkata"));
        if (studentRepository.existsOngoingExamForCourse(courseId, now)) {
            List<String> codes = studentRepository.ongoingExamCodesForCourse(courseId, now);
            throw ApiException.conflict(
                    "Cannot replace questions for \"" + course.getName() + "\": an exam is currently in progress " +
                    "for this course (code: " + String.join(", ", codes) + "). Please wait until it finishes."
            );
        }

        // Only after the complete replacement file has passed every check do
        // we remove the old bank. Completed students keep their scores; only
        // their per-question answer trail is cleared, as before.
        studentAnswerRepository.deleteByQuestion_Course_Id(courseId);
        activityLogRepository.clearQuestionReferencesForCourse(courseId);
        questionRepository.deleteByCourseId(courseId);

        int inserted = questionRepository.saveAll(validDocs).size();

        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action("QUESTION_UPLOAD")
                .targetEntity("Question")
                .targetId(String.valueOf(courseId))
                .uploadCourseName(course.getName())
                .uploadFileName(file.getOriginalFilename())
                .uploadInserted(inserted)
                .uploadSkipped(0)
                .uploadStatus("Success")
                .build());

        return new QuestionUploadResponse(inserted, 0, List.of(), course.getName());
    }

    /** Returns every question for a course, cached per course - the whole
     *  point is that generateJumbledPaper() (StudentExamService) calls
     *  this exact thing once per student at exam start, so 400 students
     *  starting the same course's exam previously meant 400 identical
     *  reads of the same rows. Safe to cache because it can only ever go
     *  stale in the one window that already can't happen: upload() evicts
     *  this entry immediately on any real change, and upload() itself is
     *  already blocked while an exam is genuinely live for this course -
     *  so the cached list is guaranteed correct for as long as any exam
     *  using it could possibly be running. */
    @Cacheable(value = "courseQuestions", key = "#courseId")
    public List<Question> getQuestionsForExam(Long courseId) {
        return questionRepository.findByCourseId(courseId);
    }

    public QuestionStatsResponse stats(Long courseId) {
        long aptitude = questionRepository.countByCourseIdAndType(courseId, QuestionType.APTITUDE);
        long logical = questionRepository.countByCourseIdAndType(courseId, QuestionType.LOGICAL);
        long programming = questionRepository.countByCourseIdAndType(courseId, QuestionType.PROGRAMMING);
        long frontend = questionRepository.countByCourseIdAndType(courseId, QuestionType.FRONTEND);
        long health = questionRepository.countByCourseIdAndType(courseId, QuestionType.HEALTH);
        return new QuestionStatsResponse(aptitude, logical, programming, frontend, health,
                aptitude + logical + programming + frontend + health);
    }

    public List<UploadHistoryEntryResponse> uploadHistory(Long courseId) {
        var page = org.springframework.data.domain.PageRequest.of(0, 200);
        List<AdminLog> logs = adminLogRepository.findByActionOrderByCreatedAtDesc("QUESTION_UPLOAD", page);
        if (courseId != null) {
            logs = logs.stream().filter(l -> String.valueOf(courseId).equals(l.getTargetId())).toList();
        }
        return logs.stream().map(UploadHistoryEntryResponse::from).toList();
    }

    private String get(CSVRecord record, String header) {
        try {
            return record.isMapped(header) ? record.get(header).trim() : "";
        } catch (Exception e) {
            return "";
        }
    }

    /** Manual eviction, used by updateQuestion()/addQuestion() - a plain
     *  @CacheEvict(key = "#courseId") isn't usable on updateQuestion()
     *  specifically, since courseId there is only known after fetching
     *  the question inside the method body, not a parameter the
     *  annotation could reference directly. */
    private void evictCourseQuestionsCache(Long courseId) {
        var cache = cacheManager.getCache("courseQuestions");
        if (cache != null) cache.evict(courseId);
    }

    // ================= Individual question review/edit (merged in) =================
    // Section display order matches the existing student exam sidebar
    // exactly, so the admin review screen groups questions the same way
    // students see them.
    private static final List<QuestionType> SECTION_ORDER =
            List.of(QuestionType.APTITUDE, QuestionType.LOGICAL, QuestionType.PROGRAMMING, QuestionType.FRONTEND, QuestionType.HEALTH);

    /** Full question list for one course, for the admin Review/Edit screen.
     *  editingLocked uses the SAME time-slot-based check as upload() (see
     *  existsOngoingExamForCourse) - NOT the older student-flag-based
     *  check this feature originally shipped with, which is exactly the
     *  bug that caused uploads to be blocked indefinitely after a
     *  student's submit request failed. Both mutation paths (CSV upload
     *  and this screen) now agree on one single definition of "is an exam
     *  actually happening right now." */
    public CourseQuestionsResponse listForCourse(Long courseId) {
        List<Question> all = questionRepository.findByCourseId(courseId);
        List<Question> sorted = all.stream()
                .sorted(java.util.Comparator
                        .comparing((Question q) -> SECTION_ORDER.indexOf(q.getType()))
                        .thenComparing(Question::getId))
                .toList();
        boolean locked = studentRepository.existsOngoingExamForCourse(courseId, LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
        return new CourseQuestionsResponse(sorted.stream().map(QuestionDetailResponse::from).toList(), locked);
    }

    /** Updates one existing question. Blocked by the same time-slot check
     *  as upload()/listForCourse() above - editing a question (especially
     *  its correct answer) out from under a student actively being scored
     *  against it would be a real correctness/fairness problem. Evicts
     *  this course's cached question list (see getQuestionsForExam) so a
     *  student starting their exam right after this edit gets the
     *  corrected version, not a stale cached copy. */
    @Transactional
    public QuestionDetailResponse updateQuestion(Long questionId, UpdateQuestionRequest req) {
        Question question = questionRepository.findById(questionId)
                .orElseThrow(() -> ApiException.notFound("Question not found."));
        Long courseId = question.getCourse().getId();

        if (studentRepository.existsOngoingExamForCourse(courseId, LocalDateTime.now(ZoneId.of("Asia/Kolkata")))) {
            throw ApiException.conflict(
                    "Cannot edit questions for \"" + question.getCourse().getName() + "\": a student is currently " +
                    "taking an exam using this question set. Please wait until the drive finishes."
            );
        }

        String type = req.type() == null ? "" : req.type().trim().toLowerCase();
        String correctAnswer = req.correctAnswer() == null ? "" : req.correctAnswer().trim().toUpperCase();
        String questionText = req.question() == null ? "" : req.question().trim();
        String a = req.optionA() == null ? "" : req.optionA().trim();
        String b = req.optionB() == null ? "" : req.optionB().trim();
        String c = req.optionC() == null ? "" : req.optionC().trim();
        String d = req.optionD() == null ? "" : req.optionD().trim();

        if (!VALID_TYPES.contains(type)) {
            throw ApiException.badRequest("Invalid type \"" + type + "\". Must be aptitude, logical, programming, frontend, or health.");
        }
        if (questionText.isBlank() || a.isBlank() || b.isBlank() || c.isBlank() || d.isBlank()) {
            throw ApiException.badRequest("Question and all four options are required.");
        }
        if (!VALID_ANSWERS.contains(correctAnswer)) {
            throw ApiException.badRequest("Invalid correctAnswer \"" + correctAnswer + "\". Must be A, B, C, or D.");
        }

        question.setType(QuestionType.valueOf(type.toUpperCase()));
        question.setQuestion(questionText);
        question.setOptionA(a);
        question.setOptionB(b);
        question.setOptionC(c);
        question.setOptionD(d);
        question.setCorrectAnswer(AnswerOption.valueOf(correctAnswer));

        Question saved = questionRepository.save(question);
        evictCourseQuestionsCache(courseId);

        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action("QUESTION_UPDATE")
                .targetEntity("Question")
                .targetId(String.valueOf(questionId))
                .uploadCourseName(question.getCourse().getName())
                .build());

        return QuestionDetailResponse.from(saved);
    }

    /** Adds one individual question to a course, outside the CSV bulk-upload
     *  flow. Secondary to CSV upload, not a replacement. Same time-slot
     *  check and same cache-eviction reasoning as updateQuestion() above. */
    @Transactional
    public QuestionDetailResponse addQuestion(AddQuestionRequest req) {
        if (req.courseId() == null) {
            throw ApiException.badRequest("courseId is required.");
        }
        Course course = courseRepository.findById(req.courseId())
                .orElseThrow(() -> ApiException.badRequest("Selected course is inactive or not found."));

        if (studentRepository.existsOngoingExamForCourse(req.courseId(), LocalDateTime.now(ZoneId.of("Asia/Kolkata")))) {
            throw ApiException.conflict(
                    "Cannot add questions for \"" + course.getName() + "\": a student is currently taking an exam " +
                    "using this question set. Please wait until the drive finishes."
            );
        }

        String type = req.type() == null ? "" : req.type().trim().toLowerCase();
        String correctAnswer = req.correctAnswer() == null ? "" : req.correctAnswer().trim().toUpperCase();
        String questionText = req.question() == null ? "" : req.question().trim();
        String a = req.optionA() == null ? "" : req.optionA().trim();
        String b = req.optionB() == null ? "" : req.optionB().trim();
        String c = req.optionC() == null ? "" : req.optionC().trim();
        String d = req.optionD() == null ? "" : req.optionD().trim();

        if (!VALID_TYPES.contains(type)) {
            throw ApiException.badRequest("Invalid type \"" + type + "\". Must be aptitude, logical, programming, frontend, or health.");
        }
        if (questionText.isBlank() || a.isBlank() || b.isBlank() || c.isBlank() || d.isBlank()) {
            throw ApiException.badRequest("Question and all four options are required.");
        }
        if (!VALID_ANSWERS.contains(correctAnswer)) {
            throw ApiException.badRequest("Invalid correctAnswer \"" + correctAnswer + "\". Must be A, B, C, or D.");
        }

        Question saved = questionRepository.save(Question.builder()
                .course(course)
                .type(QuestionType.valueOf(type.toUpperCase()))
                .question(questionText).optionA(a).optionB(b).optionC(c).optionD(d)
                .correctAnswer(AnswerOption.valueOf(correctAnswer))
                .build());
        evictCourseQuestionsCache(req.courseId());

        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action("QUESTION_ADD")
                .targetEntity("Question")
                .targetId(String.valueOf(saved.getId()))
                .uploadCourseName(course.getName())
                .build());

        return QuestionDetailResponse.from(saved);
    }
}