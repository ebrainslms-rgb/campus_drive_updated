package com.ecobrains.lms.service;

import com.ecobrains.lms.entity.AnswerOption;
import com.ecobrains.lms.entity.Question;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.entity.StudentAnswer;
import com.ecobrains.lms.repository.QuestionRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/** One student's checkpoint is its own short MySQL transaction. */
@Service
public class ExamCheckpointWriter {
    private final StudentRepository studentRepository;
    private final StudentAnswerRepository answerRepository;
    private final QuestionRepository questionRepository;
    private final RedisExamStateService redisState;

    public ExamCheckpointWriter(StudentRepository studentRepository,
                                StudentAnswerRepository answerRepository,
                                QuestionRepository questionRepository,
                                RedisExamStateService redisState) {
        this.studentRepository = studentRepository;
        this.answerRepository = answerRepository;
        this.questionRepository = questionRepository;
        this.redisState = redisState;
    }

    @Transactional
    public void write(RedisExamStateService.ExamSessionState state) {
        Student student = studentRepository.findByIdForUpdate(state.studentId()).orElse(null);
        if (student == null || student.isExamSubmitted()) return;

        List<StudentAnswer> existing = answerRepository.findByStudentIdOrderByOrderIndexAsc(student.getId());
        Map<Long, StudentAnswer> byQuestion = new HashMap<>();
        for (StudentAnswer a : existing) byQuestion.put(a.getQuestion().getId(), a);

        Map<Long, Question> questions = new HashMap<>();
        for (Question q : questionRepository.findAllById(state.questions().stream().map(q -> q.id()).toList())) questions.put(q.getId(), q);

        List<StudentAnswer> toSave = new ArrayList<>();
        for (int i = 0; i < state.questions().size(); i++) {
            var paper = state.questions().get(i);
            Question q = questions.get(paper.id());
            if (q == null) continue;
            StudentAnswer answer = byQuestion.get(paper.id());
            AnswerOption incoming = AnswerOption.fromIndex(state.answers().get(paper.id()));
            if (answer == null) {
                answer = StudentAnswer.builder().student(student).question(q).orderIndex(i).timeSpentSeconds(0).build();
                answer.setSelectedOption(incoming);
                toSave.add(answer);
            } else if (!Objects.equals(answer.getSelectedOption(), incoming)) {
                answer.setSelectedOption(incoming);
                toSave.add(answer);
            }
        }
        if (!toSave.isEmpty()) answerRepository.saveAll(toSave);
        student.setCurrentQuestionIndex(state.currentQuestionIndex());
        student.setLastSavedAt(LocalDateTime.now(java.time.ZoneId.of("Asia/Kolkata")));
        studentRepository.save(student);

        // This happens only after all DB operations in this transaction have succeeded.
        redisState.checkpointed(state);
    }
}
