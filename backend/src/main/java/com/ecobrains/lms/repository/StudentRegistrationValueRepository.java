package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.StudentRegistrationValue;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface StudentRegistrationValueRepository extends JpaRepository<StudentRegistrationValue, Long> {
    List<StudentRegistrationValue> findByStudentId(Long studentId);
    List<StudentRegistrationValue> findByStudentIdIn(List<Long> studentIds);
    void deleteByStudentId(Long studentId);
    void deleteByFieldKey(String fieldKey);
}
