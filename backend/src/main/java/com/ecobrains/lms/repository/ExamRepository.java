package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.Exam;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ExamRepository extends JpaRepository<Exam, Long> {
    Optional<Exam> findByExamCode(String examCode);
    boolean existsByExamCode(String examCode);
    List<Exam> findAllByOrderByCreatedAtDesc();

    /** All of a college's exams, newest first - powers both the "latest 4"
     *  carousel (Pageable.ofSize(4)) and the offset-paginated "View All"
     *  list (same query, different Pageable) - one query, two callers. */
    Page<Exam> findByCollegeIdOrderByStartTimeDesc(Long collegeId, Pageable pageable);

    long countByCollegeId(Long collegeId);

    /** Distinct years that have at least one exam for this college - powers the Year filter dropdown. */
    @Query("SELECT DISTINCT YEAR(e.startTime) FROM Exam e WHERE e.college.id = :collegeId ORDER BY YEAR(e.startTime) DESC")
    List<Integer> distinctYearsForCollege(@Param("collegeId") Long collegeId);

    /** Distinct colleges participating within the given filters - the "Registered Colleges" KPI
     *  when a date range or specific exam is selected (see DashboardOverviewService). */
    @Query("""
        SELECT COUNT(DISTINCT e.college.id) FROM Exam e
        WHERE (:examId IS NULL OR e.id = :examId)
          AND (:from IS NULL OR e.startTime >= :from)
          AND (:to IS NULL OR e.startTime <= :to)
        """)
    long countDistinctColleges(@Param("examId") Long examId, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Drive count for a college, optionally scoped to one year - DB-level, no in-memory filtering. */
    @Query("SELECT COUNT(e) FROM Exam e WHERE e.college.id = :collegeId AND (:year IS NULL OR YEAR(e.startTime) = :year)")
    long countByCollegeIdAndYear(@Param("collegeId") Long collegeId, @Param("year") Integer year);

    /** For the main dashboard's Drive/Test filter dropdown - lightweight, searchable, paginated. */
    @Query("""
        SELECT e FROM Exam e
        WHERE (:search IS NULL OR LOWER(e.examCode) LIKE LOWER(CONCAT('%', :search, '%'))
                                OR LOWER(e.college.name) LIKE LOWER(CONCAT('%', :search, '%')))
        ORDER BY e.startTime DESC
        """)
    Page<Exam> searchForFilter(@Param("search") String search, Pageable pageable);

    /** Global Drives page (admin sidebar) - every drive across every college,
     *  newest scheduled time first. Distinct from findByCollegeIdOrderByStartTimeDesc,
     *  which is scoped to one college for the existing College Overview flow. */
    Page<Exam> findAllByOrderByStartTimeDesc(Pageable pageable);
}
