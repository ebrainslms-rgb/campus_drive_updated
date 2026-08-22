package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.Student;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long>, JpaSpecificationExecutor<Student> {
    Optional<Student> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
    boolean existsByPhoneNumber(String phoneNumber);
    long countByExamCodeAndExamSubmittedTrue(String examCode);
    List<Student> findByCollegeId(Long collegeId);

    /** Row-level locked read, used ONLY by the exam-submit path. Plain
     *  findById() lets two near-simultaneous submit requests for the same
     *  student both read examSubmitted=false before either has committed
     *  its write - a genuine (if narrow) race window. PESSIMISTIC_WRITE
     *  forces a real SELECT ... FOR UPDATE, so a second submit request
     *  blocks until the first transaction commits, then correctly sees
     *  examSubmitted=true and short-circuits instead of double-scoring.
     *  Deliberately NOT used by the much more frequent save-progress path -
     *  that path is already made safe by client-side serialization (see
     *  ExamPage.jsx), and adding a lock there too would only add
     *  contention without closing any additional gap. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Student s WHERE s.id = :id")
    Optional<Student> findByIdForUpdate(@Param("id") Long id);
    long countByCollegeId(Long collegeId);

    // -- Dashboard aggregates --------------------------------------------
    // All queries below use an explicit LEFT JOIN to the (nullable) exam
    // association - a plain dot-path (s.exam.startTime) would silently
    // compile to an INNER JOIN and exclude students who registered but
    // never logged in with an exam code yet, even when no date/exam
    // filter is actually requested. The (:param IS NULL OR ...) guards
    // let every filter be optional without needing dynamic query building.

    @Query("""
        SELECT COUNT(s) FROM Student s LEFT JOIN s.exam e
        WHERE (:examId IS NULL OR e.id = :examId)
          AND (:courseId IS NULL OR s.course.id = :courseId)
          AND (:from IS NULL OR e.startTime >= :from)
          AND (:to IS NULL OR e.startTime <= :to)
        """)
    long countRegistered(@Param("examId") Long examId, @Param("courseId") Long courseId,
                          @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
        SELECT COUNT(s) FROM Student s LEFT JOIN s.exam e
        WHERE s.examStarted = true
          AND (:examId IS NULL OR e.id = :examId)
          AND (:courseId IS NULL OR s.course.id = :courseId)
          AND (:from IS NULL OR e.startTime >= :from)
          AND (:to IS NULL OR e.startTime <= :to)
        """)
    long countAttempted(@Param("examId") Long examId, @Param("courseId") Long courseId,
                         @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /**
     * Average score as a PERCENTAGE of each student's own paper size (the
     * number of StudentAnswer rows generated for them at exam time - fixed
     * historically, unaffected by later question-bank changes), not raw
     * total_score - different courses/exams can have different paper
     * sizes, so raw averaging would be misleading. Submitted students only
     * (an unsubmitted attempt has no meaningful final score).
     */
    @Query(value = """
        SELECT AVG(t.pct) FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1
              AND (:examId IS NULL OR s.exam_id = :examId)
              AND (:courseId IS NULL OR s.course_id = :courseId)
              AND (:from IS NULL OR e.start_time >= :from)
              AND (:to IS NULL OR e.start_time <= :to)
        ) t
        """, nativeQuery = true)
    Double averageScorePercent(@Param("examId") Long examId, @Param("courseId") Long courseId,
                                @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Performance-distribution bucket counts - same percentage basis as averageScorePercent(). */
    @Query(value = """
        SELECT
            SUM(CASE WHEN t.pct >= 80 THEN 1 ELSE 0 END) AS excellent,
            SUM(CASE WHEN t.pct >= 60 AND t.pct < 80 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN t.pct >= 40 AND t.pct < 60 THEN 1 ELSE 0 END) AS average,
            SUM(CASE WHEN t.pct >= 20 AND t.pct < 40 THEN 1 ELSE 0 END) AS belowAverage,
            SUM(CASE WHEN t.pct < 20 THEN 1 ELSE 0 END) AS poor
        FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1
              AND (:examId IS NULL OR s.exam_id = :examId)
              AND (:courseId IS NULL OR s.course_id = :courseId)
              AND (:from IS NULL OR e.start_time >= :from)
              AND (:to IS NULL OR e.start_time <= :to)
        ) t
        """, nativeQuery = true)
    PerformanceBucketRow performanceDistribution(@Param("examId") Long examId, @Param("courseId") Long courseId,
                                                  @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
        SELECT s.course.id AS courseId, s.course.name AS courseName, COUNT(s) AS studentCount
        FROM Student s LEFT JOIN s.exam e
        WHERE (:examId IS NULL OR e.id = :examId)
          AND (:courseId IS NULL OR s.course.id = :courseId)
          AND (:from IS NULL OR e.startTime >= :from)
          AND (:to IS NULL OR e.startTime <= :to)
        GROUP BY s.course.id, s.course.name
        ORDER BY COUNT(s) DESC
        """)
    List<CourseInterestRow> courseInterest(@Param("examId") Long examId, @Param("courseId") Long courseId,
                                            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
        SELECT s.college.id AS collegeId, s.college.name AS collegeName, COUNT(s) AS studentCount
        FROM Student s LEFT JOIN s.exam e
        WHERE (:examId IS NULL OR e.id = :examId)
          AND (:courseId IS NULL OR s.course.id = :courseId)
          AND (:from IS NULL OR e.startTime >= :from)
          AND (:to IS NULL OR e.startTime <= :to)
        GROUP BY s.college.id, s.college.name
        ORDER BY COUNT(s) DESC
        """)
    List<TopCollegeRow> topColleges(@Param("examId") Long examId, @Param("courseId") Long courseId,
                                     @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // -- College Overview aggregates (scoped to one college, optional year) --

    @Query("""
        SELECT COUNT(s) FROM Student s LEFT JOIN s.exam e
        WHERE s.college.id = :collegeId AND (:year IS NULL OR YEAR(e.startTime) = :year)
        """)
    long countRegisteredForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query("""
        SELECT COUNT(s) FROM Student s LEFT JOIN s.exam e
        WHERE s.college.id = :collegeId AND s.examStarted = true
          AND (:year IS NULL OR YEAR(e.startTime) = :year)
        """)
    long countAttemptedForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query(value = """
        SELECT AVG(t.pct) FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1 AND s.college_id = :collegeId
              AND (:year IS NULL OR YEAR(e.start_time) = :year)
        ) t
        """, nativeQuery = true)
    Double averageScorePercentForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query(value = """
        SELECT MAX(t.pct) FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1 AND s.college_id = :collegeId
              AND (:year IS NULL OR YEAR(e.start_time) = :year)
        ) t
        """, nativeQuery = true)
    Double highestScorePercentForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query(value = """
        SELECT MIN(t.pct) FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1 AND s.college_id = :collegeId
              AND (:year IS NULL OR YEAR(e.start_time) = :year)
        ) t
        """, nativeQuery = true)
    Double lowestScorePercentForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query(value = """
        SELECT
            SUM(CASE WHEN t.pct >= 80 THEN 1 ELSE 0 END) AS excellent,
            SUM(CASE WHEN t.pct >= 60 AND t.pct < 80 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN t.pct >= 40 AND t.pct < 60 THEN 1 ELSE 0 END) AS average,
            SUM(CASE WHEN t.pct >= 20 AND t.pct < 40 THEN 1 ELSE 0 END) AS belowAverage,
            SUM(CASE WHEN t.pct < 20 THEN 1 ELSE 0 END) AS poor
        FROM (
            SELECT (s.total_score / NULLIF(pc.paper_size, 0)) * 100 AS pct
            FROM students s
            LEFT JOIN exams e ON s.exam_id = e.id
            JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_submitted = 1 AND s.college_id = :collegeId
              AND (:year IS NULL OR YEAR(e.start_time) = :year)
        ) t
        """, nativeQuery = true)
    PerformanceBucketRow performanceDistributionForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    @Query("""
        SELECT s.course.id AS courseId, s.course.name AS courseName, COUNT(s) AS studentCount
        FROM Student s LEFT JOIN s.exam e
        WHERE s.college.id = :collegeId AND (:year IS NULL OR YEAR(e.startTime) = :year)
        GROUP BY s.course.id, s.course.name
        ORDER BY COUNT(s) DESC
        """)
    List<CourseInterestRow> courseInterestForCollege(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    // -- Drive Details student list (filter + sort + paginate, all DB-level) --
    // Score is a derived percentage (paper size varies per student), so this
    // needs a native query - filtering it in Java after pagination would
    // corrupt page counts/totals whenever the range trims a page unevenly.
    @Query(value = """
        SELECT t.id FROM (
            SELECT s.id,
                   CASE WHEN s.exam_submitted = 1 AND pc.paper_size > 0
                        THEN (s.total_score / pc.paper_size) * 100 ELSE NULL END AS pct
            FROM students s
            LEFT JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_id = :examId
              AND (:courseId IS NULL OR s.course_id = :courseId)
              AND (:attemptedOnly IS NULL OR s.exam_started = :attemptedOnly)
              AND (:submittedOnly IS NULL OR s.exam_submitted = :submittedOnly)
        ) t
        WHERE (:scoreMin IS NULL OR t.pct >= :scoreMin)
          AND (:scoreMax IS NULL OR t.pct <= :scoreMax)
        """,
        countQuery = """
        SELECT COUNT(*) FROM (
            SELECT s.id,
                   CASE WHEN s.exam_submitted = 1 AND pc.paper_size > 0
                        THEN (s.total_score / pc.paper_size) * 100 ELSE NULL END AS pct
            FROM students s
            LEFT JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
                ON pc.student_id = s.id
            WHERE s.exam_id = :examId
              AND (:courseId IS NULL OR s.course_id = :courseId)
              AND (:attemptedOnly IS NULL OR s.exam_started = :attemptedOnly)
              AND (:submittedOnly IS NULL OR s.exam_submitted = :submittedOnly)
        ) t
        WHERE (:scoreMin IS NULL OR t.pct >= :scoreMin)
          AND (:scoreMax IS NULL OR t.pct <= :scoreMax)
        """, nativeQuery = true)
    Page<Long> findIdsInScoreRange(@Param("examId") Long examId, @Param("courseId") Long courseId,
                                    @Param("attemptedOnly") Boolean attemptedOnly, @Param("submittedOnly") Boolean submittedOnly,
                                    @Param("scoreMin") Double scoreMin, @Param("scoreMax") Double scoreMax,
                                    Pageable pageable);

    // -- College-scoped student list (Top Performers / View All Students) --
    // Same percentage-score-based sort/pagination pattern as
    // findIdsInScoreRange, scoped by college_id + optional year instead of exam_id.
    @Query(value = """
        SELECT s.id FROM students s
        LEFT JOIN exams e ON s.exam_id = e.id
        LEFT JOIN (SELECT student_id, COUNT(*) AS paper_size FROM student_answers GROUP BY student_id) pc
            ON pc.student_id = s.id
        WHERE s.college_id = :collegeId
          AND (:year IS NULL OR YEAR(e.start_time) = :year)
        ORDER BY CASE WHEN s.exam_submitted = 1 AND pc.paper_size > 0
                       THEN (s.total_score / pc.paper_size) * 100 ELSE -1 END DESC
        """,
        countQuery = """
        SELECT COUNT(*) FROM students s
        LEFT JOIN exams e ON s.exam_id = e.id
        WHERE s.college_id = :collegeId AND (:year IS NULL OR YEAR(e.start_time) = :year)
        """, nativeQuery = true)
    Page<Long> findIdsForCollegeSortedByScoreDesc(@Param("collegeId") Long collegeId, @Param("year") Integer year, Pageable pageable);


    @Query("SELECT s.examCode AS examCode, COUNT(s) AS count FROM Student s WHERE s.examSubmitted = true GROUP BY s.examCode")
List<ExamAttendanceRow> submittedCountsByExamCode();

interface ExamAttendanceRow {
    String getExamCode();
    Long getCount();
}

    // -- Projection interfaces (Spring Data binds native/JPQL column aliases) --
    interface PerformanceBucketRow {
        Long getExcellent();
        Long getGood();
        Long getAverage();
        Long getBelowAverage();
        Long getPoor();
    }

    interface CourseInterestRow {
        Long getCourseId();
        String getCourseName();
        Long getStudentCount();
    }

    interface TopCollegeRow {
        Long getCollegeId();
        String getCollegeName();
        Long getStudentCount();
    }

    /** Batched registered-count for a PAGE of exam IDs - powers the global
     *  Drives list (one query for the whole page, not one query per row -
     *  the same batching principle already used for paper sizes/course
     *  interest elsewhere in this repository). */
    @Query("SELECT s.exam.id AS examId, COUNT(s) AS registeredCount FROM Student s WHERE s.exam.id IN :examIds GROUP BY s.exam.id")
    List<ExamRegisteredCountRow> registeredCountsForExamIds(@Param("examIds") List<Long> examIds);

    interface ExamRegisteredCountRow {
        Long getExamId();
        Long getRegisteredCount();
    }
}
