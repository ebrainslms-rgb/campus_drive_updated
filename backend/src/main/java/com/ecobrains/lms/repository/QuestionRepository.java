package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.Question;
import com.ecobrains.lms.entity.QuestionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionRepository extends JpaRepository<Question, Long> {
    List<Question> findByCourseId(Long courseId);
    long countByCourseIdAndType(Long courseId, QuestionType type);
    void deleteByCourseId(Long courseId);
}
