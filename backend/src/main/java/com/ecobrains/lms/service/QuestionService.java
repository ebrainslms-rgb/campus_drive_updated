package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.QuestionStatsResponse;
import com.ecobrains.lms.dto.response.QuestionUploadResponse;
import com.ecobrains.lms.dto.response.UploadHistoryEntryResponse;
import com.ecobrains.lms.entity.*;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
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

    public QuestionService(QuestionRepository questionRepository, CourseRepository courseRepository,
                            AdminLogRepository adminLogRepository, StudentAnswerRepository studentAnswerRepository) {
        this.questionRepository = questionRepository;
        this.courseRepository = courseRepository;
        this.adminLogRepository = adminLogRepository;
        this.studentAnswerRepository = studentAnswerRepository;
    }

    @Transactional
    public QuestionUploadResponse upload(Long courseId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("No file uploaded.");

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.badRequest("Selected course is inactive or not found."));
        if (!course.isActive()) throw ApiException.badRequest("Cannot upload questions: selected course is inactive.");

        // Checked BEFORE attempting the delete below - if any student has
        // already started an exam on this course, their StudentAnswer rows
        // still reference the current Question rows (pre-created at exam
        // start, whether answered yet or not), and the database would
        // correctly refuse to delete those Questions. Catching this here
        // gives an accurate, specific error instead of letting the delete
        // fail on the raw foreign-key constraint and surfacing the generic
        // "A record with this value already exists" message.
        if (studentAnswerRepository.existsByQuestion_Course_Id(courseId)) {
            throw ApiException.conflict(
                    "Cannot replace questions for \"" + course.getName() + "\": one or more students have already " +
                    "started an exam using the current question set. Replacing questions now would break their exam records."
            );
        }

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