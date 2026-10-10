package com.ecobrains.lms.service;

import com.ecobrains.lms.entity.Exam;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.repository.ExamRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Finishes every exam slot on the server, once, at its end time.
 *
 * At end time + {@link #GRACE} (30 s, so answers sent in the browser's final
 * 10 seconds have arrived), every student who STARTED the slot but is not yet
 * submitted is submitted automatically through the normal
 * {@link StudentExamService#submitExam} path: answers are taken from Redis,
 * scored against the whole paper (unanswered = wrong, 0 is a valid score),
 * saved permanently in MySQL and marked submitted.
 *
 * This does not depend on the student's browser being open or online.
 * Students who never started stay "Not attempted" (they are not touched).
 *
 * One task per exam slot — no repeating poll. Tasks live in memory, so they
 * are planned again when the backend starts (every deploy restarts it).
 */
@Service
public class ExamFinalizationService {

    private static final Logger log = LoggerFactory.getLogger(ExamFinalizationService.class);

    /** Wait after the end time before finalizing. */
    public static final Duration GRACE = Duration.ofSeconds(30);
    /** Drive results export stays locked until end time + this. */
    public static final Duration RESULTS_READY_AFTER = Duration.ofMinutes(1);

    private final ZoneId zoneId = ZoneId.of("Asia/Kolkata");
    private final ExamRepository examRepository;
    private final StudentRepository studentRepository;
    private final StudentExamService studentExamService;
    /** Own single-thread scheduler: finalization never waits for other scheduled jobs. */
    private final ThreadPoolTaskScheduler taskScheduler = new ThreadPoolTaskScheduler();
    /** Controlled parallelism for a campus-wide finalization burst. Eight workers
     * keep the work well below the configured MySQL pool while avoiding a
     * single-thread queue when 400-1000 students finish together. */
    private final ExecutorService finalizationWorkers = Executors.newFixedThreadPool(8);
    private final Map<Long, ScheduledFuture<?>> planned = new ConcurrentHashMap<>();

    public ExamFinalizationService(ExamRepository examRepository, StudentRepository studentRepository,
                                   StudentExamService studentExamService) {
        this.examRepository = examRepository;
        this.studentRepository = studentRepository;
        this.studentExamService = studentExamService;
        taskScheduler.setPoolSize(1);
        taskScheduler.setThreadNamePrefix("exam-finalize-");
        taskScheduler.initialize();
    }

    @PreDestroy
    void shutdown() {
        taskScheduler.shutdown();
        finalizationWorkers.shutdown();
    }

    /** Published by ExamService whenever a slot is scheduled or its time is changed. */
    public record ExamTimingChanged(Long examId) {}

    /** Runs after the schedule/reschedule transaction has committed. */
    @TransactionalEventListener(fallbackExecution = true)
    public void onExamTimingChanged(ExamTimingChanged event) {
        examRepository.findById(event.examId()).ifPresent(this::plan);
    }

    /**
     * On startup: plan every upcoming slot, and finish any slot whose end time
     * has already passed but still has started-but-unsubmitted students
     * (this also repairs older slots where some students had no score).
     */
    @EventListener(ApplicationReadyEvent.class)
    public void planAllOnStartup() {
        int upcoming = 0;
        for (Exam exam : examRepository.findAll()) {
            if (exam.getEndTime() == null) continue;
            if (finalizeAt(exam).isAfter(Instant.now())) {
                plan(exam);
                upcoming++;
            } else if (finalizeAt(exam).isAfter(Instant.now().minus(Duration.ofHours(6)))) {
                // Only slots that ended in the last 6 hours (server restarted during/after a drive).
                // Older drives are left exactly as they are.
                finalizeExam(exam.getId());
            }
        }
        log.info("Exam finalization planned for {} upcoming slot(s).", upcoming);
    }

    /** Plans (or re-plans) the single end-of-slot task for this exam. */
    public void plan(Exam exam) {
        if (exam.getEndTime() == null) return;
        Long examId = exam.getId();
        ScheduledFuture<?> previous = planned.remove(examId);
        if (previous != null) previous.cancel(false);

        Instant when = finalizeAt(exam);
        if (!when.isAfter(Instant.now())) {
            taskScheduler.schedule(() -> finalizeExam(examId), Instant.now());
            return;
        }
        planned.put(examId, taskScheduler.schedule(() -> finalizeExam(examId), when));
    }

    /**
     * Submits every started-but-unsubmitted student of this slot. Each student
     * is handled separately, so one problem never stops the others.
     */
    public void finalizeExam(Long examId) {
        planned.remove(examId);
        Exam exam = examRepository.findById(examId).orElse(null);
        if (exam == null || exam.getEndTime() == null) return;
        // If the slot was moved later after this task was planned, its new task handles it.
        if (finalizeAt(exam).isAfter(Instant.now().plusSeconds(1))) return;

        List<Student> pending = studentRepository.findByExamId(examId).stream()
                .filter(s -> s.isExamStarted() && !s.isExamSubmitted())
                .toList();
        if (pending.isEmpty()) return;

        List<Future<Boolean>> futures = pending.stream()
                .map(student -> finalizationWorkers.submit(() -> {
                    try {
                        // Redis is the authoritative live state; this service is
                        // the single permanent Redis -> MySQL finalization path.
                        studentExamService.submitExam(student.getId(), true, null, null);
                        return Boolean.TRUE;
                    } catch (Exception e) {
                        log.error("Could not finalize exam {} for student {}: {}", examId, student.getId(), e.getMessage());
                        return Boolean.FALSE;
                    }
                }))
                .toList();

        int done = 0;
        for (Future<Boolean> future : futures) {
            try {
                if (Boolean.TRUE.equals(future.get())) done++;
            } catch (Exception e) {
                log.error("Exam {} finalization worker failed: {}", examId, e.getMessage());
            }
        }
        log.info("Exam {} finalized on the server: {} of {} pending student(s) submitted.", examId, done, pending.size());

        // Keep a server-side retry window as well. If MySQL was briefly busy
        // or unavailable, Redis remains the source of truth and the backend
        // gets another chance without relying on a student's browser.
        if (done < pending.size()) {
            taskScheduler.schedule(() -> finalizeExam(examId), Instant.now().plusSeconds(15));
        }
    }

    /** End time + grace, as an Instant in the exam's time zone. */
    private Instant finalizeAt(Exam exam) {
        return exam.getEndTime().atZone(zoneId).toInstant().plus(GRACE);
    }

    /**
     * True while results of this slot may still be changing (from the end time
     * until end time + 1 minute). Drive exports are blocked during this window.
     */
    public boolean isFinalizing(Exam exam) {
        if (exam == null || exam.getEndTime() == null) return false;
        Instant end = exam.getEndTime().atZone(zoneId).toInstant();
        Instant now = Instant.now();
        return !now.isBefore(end) && now.isBefore(end.plus(RESULTS_READY_AFTER));
    }

    /** When results of this slot can be exported (end time + 1 minute). */
    public LocalDateTime resultsReadyAt(Exam exam) {
        return exam.getEndTime().plus(RESULTS_READY_AFTER);
    }
}
