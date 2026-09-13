package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.LiveExamStudentResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.StudentRepository;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class AdminExamControlService {
    private final StudentRepository studentRepository;
    private final RedisExamStateService redisState;
    private final StudentExamService studentExamService;
    private final AdminLogRepository adminLogRepository;

    public AdminExamControlService(StudentRepository studentRepository,
                                   RedisExamStateService redisState,
                                   StudentExamService studentExamService,
                                   AdminLogRepository adminLogRepository) {
        this.studentRepository = studentRepository;
        this.redisState = redisState;
        this.studentExamService = studentExamService;
        this.adminLogRepository = adminLogRepository;
    }

    public List<LiveExamStudentResponse> liveStudents(Long examId) {
        List<LiveExamStudentResponse> result = new ArrayList<>();
        for (Student student : studentRepository.findByExamId(examId)) {
            try {
                var state = redisState.get(examId, student.getId()).orElse(null);
                if (state != null) {
                    int answered = (int) state.answers().values().stream().filter(v -> v != null).count();
                    result.add(new LiveExamStudentResponse(student.getId(), student.getFullName(), student.getEmail(),
                            student.getCourse() == null ? null : student.getCourse().getName(), state.status(), state.tabSwitchCount(),
                            state.restrictionUntil(), state.currentQuestionIndex(), answered, state.questions().size(), state.startedAt(), state.deadline(),
                            "COMPLETED".equals(state.status()) || student.isExamSubmitted()));
                    continue;
                }
            } catch (RedisExamStateService.RedisUnavailableException ignored) { }
            result.add(new LiveExamStudentResponse(student.getId(), student.getFullName(), student.getEmail(),
                    student.getCourse() == null ? null : student.getCourse().getName(),
                    student.isExamSubmitted() ? "COMPLETED" : student.isExamStarted() ? "ACTIVE" : "READY",
                    student.getTabSwitchViolations() == null ? 0 : student.getTabSwitchViolations(), null,
                    student.getCurrentQuestionIndex() == null ? 0 : student.getCurrentQuestionIndex(), 0, 0,
                    student.getStartedAt() == null ? null : student.getStartedAt().atZone(java.time.ZoneId.of("Asia/Kolkata")).toInstant(),
                    student.getExam() == null ? null : student.getExam().getEndTime().atZone(java.time.ZoneId.of("Asia/Kolkata")).toInstant(), student.isExamSubmitted()));
        }
        return result;
    }

    public LiveExamStudentResponse allowResume(Long examId, Long studentId, String reason) {
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found."));
        if (student.getExam() == null || !examId.equals(student.getExam().getId())) throw ApiException.badRequest("Student is not registered for this drive.");
        if (java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")).isAfter(student.getExam().getEndTime())) {
            throw ApiException.forbidden("The examination deadline has passed; the attempt can no longer be reopened.");
        }
        var state = redisState.reopen(examId, studentId);
        student.setExamAccessStatus("ACTIVE");
        student.setRestrictionUntil(null);
        studentRepository.save(student);
        adminLogRepository.save(AdminLog.builder().adminEmail(CurrentUser.email()).action("EXAM_ACCESS_RESUMED")
                .targetEntity("StudentExam").targetId(studentId + "@" + examId)
                .details(reason == null || reason.isBlank() ? "Admin allowed the student to resume the examination." : reason.trim()).build());
        return findOne(examId, studentId, state);
    }

    public LiveExamStudentResponse forceSubmit(Long examId, Long studentId, String reason) {
        studentExamService.forceSubmitByAdmin(examId, studentId);
        adminLogRepository.save(AdminLog.builder().adminEmail(CurrentUser.email()).action("EXAM_FORCE_SUBMIT")
                .targetEntity("StudentExam").targetId(studentId + "@" + examId)
                .details(reason == null || reason.isBlank() ? "Admin force-submitted the examination." : reason.trim()).build());
        return liveStudents(examId).stream().filter(s -> studentId.equals(s.studentId())).findFirst()
                .orElseThrow(() -> ApiException.notFound("Student not found."));
    }

    private LiveExamStudentResponse findOne(Long examId, Long studentId, RedisExamStateService.ExamSessionState state) {
        Student student = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found."));
        int answered = (int) state.answers().values().stream().filter(v -> v != null).count();
        return new LiveExamStudentResponse(student.getId(), student.getFullName(), student.getEmail(), student.getCourse() == null ? null : student.getCourse().getName(),
                state.status(), state.tabSwitchCount(), state.restrictionUntil(), state.currentQuestionIndex(), answered, state.questions().size(), state.startedAt(), state.deadline(), student.isExamSubmitted());
    }
}
