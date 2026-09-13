package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.College;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;

public interface CollegeRepository extends JpaRepository<College, Long>, JpaSpecificationExecutor<College> {
    boolean existsByCode(String code);
    List<College> findByActiveTrueOrderByNameAsc();
    Optional<College> findByNameIgnoreCaseAndActiveTrue(String name);

    /** Matches regardless of active status - used by DataSeeder's
     *  idempotency check. Using the ActiveTrue-only version there was the
     *  actual bug: once an admin disables a seeded college, that check
     *  finds nothing and the seeder concludes it was never created,
     *  silently making a brand new duplicate on every subsequent restart. */
    Optional<College> findByNameIgnoreCase(String name);
    Page<College> findAll(org.springframework.data.jpa.domain.Specification<College> spec, Pageable pageable);

    // Add to CollegeRepository.java:
@Query("SELECT DISTINCT c.location FROM College c ORDER BY c.location")
List<String> distinctLocations();

@Query("SELECT DISTINCT c.state FROM College c ORDER BY c.state")
List<String> distinctStates();
}
