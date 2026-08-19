package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.StudentAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StudentAnswerRepository extends JpaRepository<StudentAnswer, Long> {
    List<StudentAnswer> findByStudentIdOrderByOrderIndexAsc(Long studentId);

    /** Batched paper-size lookup for a page of students - avoids one query per row. */
    @Query("SELECT a.student.id AS studentId, COUNT(a) AS paperSize FROM StudentAnswer a WHERE a.student.id IN :studentIds GROUP BY a.student.id")
    List<PaperSizeRow> paperSizesFor(@Param("studentIds") List<Long> studentIds);

    interface PaperSizeRow {
        Long getStudentId();
        Long getPaperSize();
    }

    /** Batched actually-answered count (selectedOption not null) for a page
     *  of students - same batching pattern as paperSizesFor, used to report
     *  Total Questions (paperSizesFor) vs Answered Questions (this) as two
     *  genuinely distinct numbers in the Drive Details table/export. */
    @Query("SELECT a.student.id AS studentId, COUNT(a) AS answeredCount FROM StudentAnswer a WHERE a.student.id IN :studentIds AND a.selectedOption IS NOT NULL GROUP BY a.student.id")
    List<AnsweredCountRow> answeredCountsFor(@Param("studentIds") List<Long> studentIds);

    interface AnsweredCountRow {
        Long getStudentId();
        Long getAnsweredCount();
    }
}
