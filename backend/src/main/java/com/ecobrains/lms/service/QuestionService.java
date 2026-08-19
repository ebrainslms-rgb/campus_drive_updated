package com.ecobrains.lms.service;

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
import com.ecobrains.lms.security.CurrentUser;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Handles the admin CSV question-bank upload for a course (replaces the course's question set). */
@Service
public class QuestionService {

    private static final Set<String> VALID_TYPES = Set.of("aptitude", "logical", "programming", "frontend");
    private static final Set<String> VALID_ANSWERS = Set.of("A", "B", "C", "D");

    private final QuestionRepository questionRepository;
    private final CourseRepository courseRepository;
    private final AdminLogRepository adminLogRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final ActivityLogRepository activityLogRepository;

    public QuestionService(QuestionRepository questionRepository, CourseRepository courseRepository,
                            AdminLogRepository adminLogRepository, StudentAnswerRepository studentAnswerRepository,
                            ActivityLogRepository activityLogRepository) {
        this.questionRepository = questionRepository;
        this.courseRepository = courseRepository;
        this.adminLogRepository = adminLogRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.activityLogRepository = activityLogRepository;
    }

    @Transactional
    public QuestionUploadResponse upload(Long courseId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("No file uploaded.");

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.badRequest("Selected course is inactive or not found."));
        if (!course.isActive()) throw ApiException.badRequest("Cannot upload questions: selected course is inactive.");

        // Block ONLY while a student is genuinely mid-exam right now on this
        // course (started, not yet submitted) - their answers aren't final
        // yet and still need the current Question rows to exist.
        if (studentAnswerRepository.existsLiveExamForCourse(courseId)) {
            throw ApiException.conflict(
                    "Cannot replace questions for \"" + course.getName() + "\": a student is currently taking an " +
                    "exam using the current question set. Please wait until the drive finishes."
            );
        }

        // No live exam remains, so any StudentAnswer rows still present at
        // this point belong only to already-completed students. Their score
        // and registration data live on the Student row itself and are
        // completely unaffected by this - only the specific per-question
        // answer trail is cleared.
        studentAnswerRepository.deleteByQuestion_Course_Id(courseId);

        // ActivityLog also has a foreign key to Question (separate from
        // StudentAnswer) - clearing StudentAnswer alone was NOT enough, the
        // delete below would still fail on this second reference. Rows are
        // only nulled here, never deleted - SubmissionInfoResolver depends
        // on these ActivityLog rows surviving for the Drive Details
        // submission-time/type feature, which doesn't need question_id at all.
        activityLogRepository.clearQuestionReferencesForCourse(courseId);

        questionRepository.deleteByCourseId(courseId);

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
                    skipReasons.add("Row " + rowIndex + ": invalid type \"" + type + "\". Must be aptitude, logical, programming, or frontend.");
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

        int inserted = 0;
        if (!validDocs.isEmpty()) {
            inserted = questionRepository.saveAll(validDocs).size();
        }

        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action("QUESTION_UPLOAD")
                .targetEntity("Question")
                .targetId(String.valueOf(courseId))
                .uploadCourseName(course.getName())
                .uploadFileName(file.getOriginalFilename())
                .uploadInserted(inserted)
                .uploadSkipped(skipReasons.size())
                .uploadStatus(inserted > 0 ? "Success" : "Failed")
                .build());

        return new QuestionUploadResponse(inserted, skipReasons.size(), skipReasons, course.getName());
    }

    public QuestionStatsResponse stats(Long courseId) {
        long aptitude = questionRepository.countByCourseIdAndType(courseId, QuestionType.APTITUDE);
        long logical = questionRepository.countByCourseIdAndType(courseId, QuestionType.LOGICAL);
        long programming = questionRepository.countByCourseIdAndType(courseId, QuestionType.PROGRAMMING);
        long frontend = questionRepository.countByCourseIdAndType(courseId, QuestionType.FRONTEND);
        return new QuestionStatsResponse(aptitude, logical, programming, frontend,
                aptitude + logical + programming + frontend);
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
}