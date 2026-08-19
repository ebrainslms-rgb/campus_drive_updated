package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.StudentAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StudentAnswerRepository extends JpaRepository<StudentAnswer, Long> {
    List<StudentAnswer> findByStudentIdOrderByOrderIndexAsc(Long studentId);

    /** True only if a student is genuinely mid-exam RIGHT NOW on this course
     *  (started, not yet submitted) - their answers aren't final yet and
     *  still need the current Question rows to exist. Used by
     *  QuestionService.upload() to block a replace only while a drive is
     *  actually live, not forever after it finishes. */
    @Query("SELECT COUNT(a) > 0 FROM StudentAnswer a WHERE a.question.course.id = :courseId " +
           "AND a.student.examStarted = true AND a.student.examSubmitted = false")
    boolean existsLiveExamForCourse(@Param("courseId") Long courseId);

    /** Clears the per-question answer trail for a course once no live exam
     *  remains (see existsLiveExamForCourse) - any StudentAnswer rows still
     *  present at that point belong only to already-completed students.
     *  Their score and registration data live on the Student row itself and
     *  are completely unaffected by this; only the specific "which option
     *  did they pick for question N" detail is cleared, which is no longer
     *  needed once an exam is scored and submitted. This is what unblocks
     *  the Question replace below, which would otherwise fail on the
     *  database's own foreign-key constraint. */
    @Modifying
    @Query("DELETE FROM StudentAnswer a WHERE a.question.id IN " +
           "(SELECT q.id FROM Question q WHERE q.course.id = :courseId)")
    void deleteByQuestion_Course_Id(@Param("courseId") Long courseId);

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