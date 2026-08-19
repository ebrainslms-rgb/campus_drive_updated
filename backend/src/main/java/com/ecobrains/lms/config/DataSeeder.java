package com.ecobrains.lms.config;

import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.util.CollegeCodeGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Startup seed - idempotent (checked by name before insert, so re-running the app
 * never creates duplicates). Per requirements: only admin creds (from properties)
 * and 1-2 sample colleges for testing. No dummy students, courses, exams or questions -
 * those are created by real usage.
 */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final CollegeRepository collegeRepository;
    private final CollegeCodeGenerator codeGenerator;

    public DataSeeder(CollegeRepository collegeRepository, CollegeCodeGenerator codeGenerator) {
        this.collegeRepository = collegeRepository;
        this.codeGenerator = codeGenerator;
    }

    @Override
    public void run(String... args) {
        seedCollege("Sri Venkateshwara Engineering College", "Suryapet", "Telangana");
        seedCollege("RV College of Engineering", "Bengaluru", "Karnataka");
    }

    private void seedCollege(String name, String location, String state) {
        boolean exists = collegeRepository.findByNameIgnoreCaseAndActiveTrue(name).isPresent();
        if (exists) return;

        College college = College.builder()
                .name(name)
                .code(codeGenerator.generate(name, location))
                .location(location)
                .district(location)
                .state(state)
                .active(true)
                .build();
        collegeRepository.save(college);
        log.info("Seeded sample college: {} ({})", college.getName(), college.getCode());
    }
}
